const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const DB_PATH = path.join(__dirname, 'database.json');
const BACKUP_DIR = path.join(__dirname, 'backups');
const SENHA_ADMIN = 'admin2026';

const defaultData = {
    produtos: [],
    mural: [],
    historico: []
};

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function restaurarUltimoBackup() {
    try {
        if (!fs.existsSync(BACKUP_DIR)) return null;
        const arquivos = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse();
        
        for (const arq of arquivos) {
            const caminhoBackup = path.join(BACKUP_DIR, arq);
            const raw = fs.readFileSync(caminhoBackup, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.produtos) && parsed.produtos.length > 0) {
                fs.writeFileSync(DB_PATH, JSON.stringify(parsed, null, 2), 'utf8');
                return parsed;
            }
        }
    } catch (e) {}
    return null;
}

function carregarBanco() {
    if (!fs.existsSync(DB_PATH)) {
        const backupRestaurado = restaurarUltimoBackup();
        if (backupRestaurado) return backupRestaurado;
        
        fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
        return defaultData;
    }
    
    try {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        if (!raw || raw.trim() === '') {
            return restaurarUltimoBackup() || defaultData;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return restaurarUltimoBackup() || defaultData;
        }
        if (!Array.isArray(parsed.produtos)) parsed.produtos = [];
        if (!Array.isArray(parsed.mural)) parsed.mural = [];
        if (!Array.isArray(parsed.historico)) parsed.historico = [];
        parsed.produtos.forEach(p => {
            if (!Array.isArray(p.lotes)) p.lotes = [];
        });
        return parsed;
    } catch (e) {
        return restaurarUltimoBackup() || defaultData;
    }
}

function salvarBanco(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
        realizarBackupDiario(data);
    } catch (e) {}
}

function realizarBackupDiario(data) {
    try {
        const hoje = new Date().toISOString().split('T')[0];
        const backupFile = path.join(BACKUP_DIR, `database_backup_${hoje}.json`);
        if (!fs.existsSync(backupFile)) {
            fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf8');
        }
    } catch (e) {}
}

function limparAvisosAntigos(db) {
    const agora = new Date().getTime();
    const umDiaEmMs = 24 * 60 * 60 * 1000;
    let alterado = false;

    db.mural = db.mural.filter(item => {
        if (item.concluido && item.dataConclusao) {
            const tempoDecorrido = agora - new Date(item.dataConclusao).getTime();
            if (tempoDecorrido > umDiaEmMs) {
                alterado = true;
                return false;
            }
        }
        return true;
    });

    if (alterado) {
        salvarBanco(db);
    }
}

function registrarHistorico(db, acao, detalhe, usuario) {
    db.historico.unshift({
        id: Date.now(),
        dataHora: new Date().toISOString(),
        usuario: usuario || 'Operador',
        acao: acao || 'Operacao',
        detalhe: detalhe || ''
    });
}

function obterUsuarioReq(req) {
    const rawUser = req.headers['x-usuario'];
    if (!rawUser) return 'Operador';
    try {
        return decodeURIComponent(rawUser);
    } catch (e) {
        return rawUser;
    }
}

function isAdmin(req) {
    return req.headers['x-admin-token'] === SENHA_ADMIN;
}

const server = http.createServer((req, res) => {
    req.setEncoding('utf8');
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Usuario, X-Admin-Token');

    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const db = carregarBanco();
    limparAvisosAntigos(db);
    const usuarioAtual = obterUsuarioReq(req);

    if (pathname === '/api/desligar' && method === 'POST') {
        if (!isAdmin(req)) {
            res.writeHead(403);
            return res.end();
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true }));
        setTimeout(() => {
            server.close(() => process.exit(0));
        }, 500);
        return;
    }

    if (pathname === '/api/produtos' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(db.produtos));
    }

    if (pathname === '/api/produtos' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const novoProduto = JSON.parse(body);
                novoProduto.id = Date.now();
                novoProduto.lotes = [];
                db.produtos.push(novoProduto);
                registrarHistorico(db, 'Cadastro de Produto', novoProduto.nome, usuarioAtual);
                salvarBanco(db);
                res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(novoProduto));
            } catch (err) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Erro' }));
            }
        });
        return;
    }

    if (pathname.startsWith('/api/produtos/') && pathname.endsWith('/lotes') && method === 'POST') {
        const prodId = parseInt(pathname.split('/')[3]);
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const novoLote = JSON.parse(body);
                novoLote.id = Date.now();
                const produto = db.produtos.find(p => p.id === prodId);
                if (produto) {
                    if (!produto.lotes) produto.lotes = [];
                    produto.lotes.push(novoLote);
                    registrarHistorico(db, 'Entrada de Lote', novoLote.marca, usuarioAtual);
                    salvarBanco(db);
                    res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
                    return res.end(JSON.stringify(produto));
                }
                res.writeHead(404);
                res.end();
            } catch (err) {
                res.writeHead(400);
                res.end();
            }
        });
        return;
    }

    if (pathname.startsWith('/api/produtos/') && pathname.endsWith('/baixa') && method === 'POST') {
        const prodId = parseInt(pathname.split('/')[3]);
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { quantidade } = JSON.parse(body);
                let qtdRestante = Number(quantidade);
                const produto = db.produtos.find(p => p.id === prodId);

                if (!produto) {
                    res.writeHead(404);
                    return res.end();
                }

                if (!produto.lotes) produto.lotes = [];
                produto.lotes.sort((a, b) => new Date(a.validade) - new Date(b.validade));

                for (let lote of produto.lotes) {
                    if (qtdRestante <= 0) break;
                    if (lote.quantidade <= qtdRestante) {
                        qtdRestante -= lote.quantidade;
                        lote.quantidade = 0;
                    } else {
                        lote.quantidade -= qtdRestante;
                        qtdRestante = 0;
                    }
                }

                produto.lotes = produto.lotes.filter(l => l.quantidade > 0);
                registrarHistorico(db, 'Baixa de Estoque', quantidade.toString(), usuarioAtual);
                salvarBanco(db);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(produto));
            } catch (err) {
                res.writeHead(400);
                res.end();
            }
        });
        return;
    }

    if (pathname.startsWith('/api/produtos/') && method === 'DELETE') {
        if (!isAdmin(req)) {
            res.writeHead(403);
            return res.end();
        }
        const prodId = parseInt(pathname.split('/')[3]);
        const index = db.produtos.findIndex(p => p.id === prodId);
        if (index !== -1) {
            const removido = db.produtos.splice(index, 1)[0];
            registrarHistorico(db, 'Exclusao', removido.nome, usuarioAtual);
            salvarBanco(db);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: true }));
        }
        res.writeHead(404);
        return res.end();
    }

    if (pathname.startsWith('/api/lotes/') && method === 'DELETE') {
        if (!isAdmin(req)) {
            res.writeHead(403);
            return res.end();
        }
        const loteId = parseInt(pathname.split('/')[3]);
        let removido = false;
        db.produtos.forEach(prod => {
            if (!prod.lotes) prod.lotes = [];
            const idx = prod.lotes.findIndex(l => l.id === loteId);
            if (idx !== -1) {
                prod.lotes.splice(idx, 1)[0];
                registrarHistorico(db, 'Exclusao', 'Lote', usuarioAtual);
                removido = true;
            }
        });
        if (removido) {
            salvarBanco(db);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: true }));
        }
        res.writeHead(404);
        return res.end();
    }

    if (pathname === '/api/mural' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(db.mural));
    }

    if (pathname === '/api/mural' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const novoAviso = JSON.parse(body);
                novoAviso.id = Date.now();
                novoAviso.concluido = false;
                novoAviso.dataCriacao = new Date().toISOString();
                db.mural.unshift(novoAviso);
                registrarHistorico(db, 'Novo Lembrete', novoAviso.texto, usuarioAtual);
                salvarBanco(db);
                res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(novoAviso));
            } catch (err) {
                res.writeHead(400);
                res.end();
            }
        });
        return;
    }

    if (pathname.startsWith('/api/mural/') && pathname.endsWith('/concluir') && method === 'PUT') {
        const avisoId = parseInt(pathname.split('/')[3]);
        const aviso = db.mural.find(m => m.id === avisoId);
        if (aviso) {
            aviso.concluido = true;
            aviso.dataConclusao = new Date().toISOString();
            registrarHistorico(db, 'Lembrete Concluido', aviso.texto, usuarioAtual);
            salvarBanco(db);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify(aviso));
        }
        res.writeHead(404);
        return res.end();
    }

    if (pathname.startsWith('/api/mural/') && method === 'DELETE') {
        if (!isAdmin(req)) {
            res.writeHead(403);
            return res.end();
        }
        const avisoId = parseInt(pathname.split('/')[3]);
        const idx = db.mural.findIndex(m => m.id === avisoId);
        if (idx !== -1) {
            db.mural.splice(idx, 1);
            salvarBanco(db);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: true }));
        }
        res.writeHead(404);
        return res.end();
    }

    if (pathname === '/api/historico' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(db.historico));
    }

    let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    const extname = String(path.extname(filePath)).toLowerCase();

    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404);
            res.end();
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

process.on('SIGINT', () => {
    server.close(() => {
        process.exit(0);
    });
});

server.listen(PORT, '0.0.0.0', () => {});