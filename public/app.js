let estadoGeral = {
    produtos: [],
    mural: [],
    historico: [],
    busca: '',
    dataCalendarioAtual: new Date(),
    usuarioAtual: ''
};

let cliqueLogoCount = 0;
let cliqueLogoTimer;

document.addEventListener('DOMContentLoaded', () => {
    verificarModoAdminNoLoad();
    iniciarControleUsuario();
    iniciarRelogioEmTempoReal();
    configurarEventos();
    carregarDados();

    setInterval(carregarDados, 3000);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) carregarDados();
    });
    window.addEventListener('focus', () => carregarDados());
    window.addEventListener('online', () => carregarDados());
});

function verificarModoAdminNoLoad() {
    if (localStorage.getItem('admin_token') === 'admin2026') {
        document.body.classList.add('modo-admin');
    }
}

function iniciarControleUsuario() {
    let nomeSalvo = localStorage.getItem('usuario_estoque');
    
    if (!nomeSalvo || nomeSalvo.trim() === '') {
        while (!nomeSalvo || nomeSalvo.trim() === '') {
            nomeSalvo = prompt('ACESSO AO ESTOQUE\n\nPor favor, digite seu NOME ou MATRICULA para registrar suas operacoes no sistema:');
        }
        localStorage.setItem('usuario_estoque', nomeSalvo.trim());
        estadoGeral.usuarioAtual = nomeSalvo.trim();
    } else {
        estadoGeral.usuarioAtual = nomeSalvo;
    }

    const inputUser = document.getElementById('input-usuario-ativo');
    if (inputUser) {
        inputUser.value = estadoGeral.usuarioAtual;
        
        inputUser.addEventListener('dblclick', () => {
            if (localStorage.getItem('admin_token') === 'admin2026') {
                inputUser.removeAttribute('readonly');
                inputUser.style.cursor = 'text';
                inputUser.style.backgroundColor = '#334155';
                inputUser.focus();
                inputUser.select();
            }
        });

        inputUser.addEventListener('blur', () => {
            const novoNome = inputUser.value.trim();
            if (novoNome) {
                estadoGeral.usuarioAtual = novoNome;
                localStorage.setItem('usuario_estoque', novoNome);
            } else {
                inputUser.value = estadoGeral.usuarioAtual;
            }
            inputUser.setAttribute('readonly', 'true');
            inputUser.style.cursor = 'not-allowed';
            inputUser.style.backgroundColor = 'rgba(0,0,0,0.1)';
        });
    }
}

function obterHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-Usuario': encodeURIComponent(estadoGeral.usuarioAtual || 'Operador'),
        'X-Admin-Token': localStorage.getItem('admin_token') || ''
    };
}

function iniciarRelogioEmTempoReal() {
    const elData = document.getElementById('relogio-data');
    const elHora = document.getElementById('relogio-hora');

    function atualizar() {
        const agora = new Date();
        const opcoesData = { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' };
        elData.textContent = agora.toLocaleDateString('pt-BR', opcoesData).toUpperCase();
        elHora.textContent = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    atualizar();
    setInterval(atualizar, 1000);
}

async function carregarDados() {
    try {
        const [resProd, resMural, resHist] = await Promise.all([
            fetch('/api/produtos'),
            fetch('/api/mural'),
            fetch('/api/historico')
        ]);

        if (resProd.ok) {
            const dadosProd = await resProd.json();
            estadoGeral.produtos = Array.isArray(dadosProd) ? dadosProd : [];
            estadoGeral.produtos.forEach(p => {
                if (!p.lotes) p.lotes = [];
            });
        }
        if (resMural.ok) {
            const dadosMural = await resMural.json();
            estadoGeral.mural = Array.isArray(dadosMural) ? dadosMural : [];
        }
        if (resHist.ok) {
            const dadosHist = await resHist.json();
            estadoGeral.historico = Array.isArray(dadosHist) ? dadosHist : [];
        }

        renderizarTudo();
    } catch (err) {}
}

function renderizarTudo() {
    renderizarDashboard();
    renderizarMural();
    renderizarCards();
    renderizarTabela();
    renderizarCalendario();
    renderizarHistorico();
}

function renderizarDashboard() {
    const totalItens = estadoGeral.produtos.reduce((acc, p) => {
        const lotes = p.lotes || [];
        return acc + lotes.reduce((lAcc, l) => lAcc + Number(l.quantidade || 0), 0);
    }, 0);
    
    let aVencer = 0;
    let vencidos = 0;
    let estoqueBaixo = 0;

    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const em30Dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

    estadoGeral.produtos.forEach(p => {
        const lotes = p.lotes || [];
        const totalProd = lotes.reduce((acc, l) => acc + Number(l.quantidade || 0), 0);
        if (totalProd <= Number(p.estoqueMinimo || 0)) estoqueBaixo++;

        lotes.forEach(l => {
            if (!l.validade) return;
            const val = new Date(l.validade + 'T00:00:00');
            if (val < hoje) {
                vencidos++;
            } else if (val <= em30Dias) {
                aVencer++;
            }
        });
    });

    document.getElementById('dash-total-itens').textContent = totalItens.toLocaleString('pt-BR');
    document.getElementById('dash-a-vencer').textContent = aVencer;
    document.getElementById('dash-vencidos').textContent = vencidos;
    document.getElementById('dash-estoque-baixo').textContent = estoqueBaixo;
}

function renderizarMural() {
    const container = document.getElementById('mural-lista');
    container.innerHTML = '';

    const listaOrdenada = [...estadoGeral.mural].sort((a, b) => {
        if (a.concluido === b.concluido) {
            return new Date(a.dataHoraAgendada || 0) - new Date(b.dataHoraAgendada || 0);
        }
        return a.concluido ? 1 : -1;
    });

    listaOrdenada.forEach(item => {
        const div = document.createElement('div');
        div.className = `mural-item ${item.concluido ? 'concluido' : ''}`;

        const dataAgendadaFmt = item.dataHoraAgendada 
            ? formatarDataHora(item.dataHoraAgendada)
            : 'Sem horario';

        const dataCriacaoFmt = item.dataCriacao ? formatarDataHora(item.dataCriacao) : '--:--';

        div.innerHTML = `
            <div class="mural-item-header">
                <span>Agendado</span>
                <span>${dataCriacaoFmt}</span>
            </div>
            <div class="mural-item-texto">${item.texto || ''}</div>
            <div class="mural-item-datahora">Horario: ${dataAgendadaFmt}</div>
            <div class="mural-item-actions">
                ${!item.concluido ? `<button class="btn btn-sm btn-success btn-fixed-action" onclick="concluirAviso(${item.id})">Feito</button>` : '<span>Concluido</span>'}
                <button class="btn btn-sm btn-danger admin-only" onclick="excluirAviso(${item.id})">Excluir</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderizarCards() {
    const container = document.getElementById('container-cards');
    container.innerHTML = '';

    const filtrados = filtrarProdutos(estadoGeral.produtos);

    filtrados.forEach(prod => {
        const lotes = prod.lotes || [];
        const total = lotes.reduce((acc, l) => acc + Number(l.quantidade || 0), 0);
        
        let lotesHtml = lotes.map(l => `
            <div><strong>${l.marca || 'Sem Marca'}</strong>: ${l.quantidade} ${prod.unidade || 'und'} (Val: ${formatarData(l.validade)}) 
            <button class="btn btn-sm btn-danger admin-only" style="padding:0 4px;" onclick="excluirLote(${l.id})">x</button></div>
        `).join('');

        if (lotes.length === 0) lotesHtml = '<em>Sem lotes em estoque</em>';

        const card = document.createElement('div');
        card.className = 'card-produto';
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <div class="card-title">${prod.nome || 'Sem Nome'}</div>
                    <span class="card-category">${prod.categoria || 'Geral'}</span>
                </div>
                <button class="btn btn-sm btn-danger admin-only" onclick="excluirProduto(${prod.id})">Excluir</button>
            </div>
            <div class="card-info">
                <div><strong>Estoque Total:</strong> ${total} ${prod.unidade || 'und'}</div>
                <div><strong>Minimo Alerta:</strong> ${prod.estoqueMinimo || 0} ${prod.unidade || 'und'}</div>
            </div>
            <div class="card-lotes">
                <strong>Lotes em Estoque:</strong>
                ${lotesHtml}
            </div>
            <div class="card-actions">
                <button class="btn btn-sm btn-primary btn-fixed-action" onclick="abrirModalLote(${prod.id}, '${prod.nome || ''}')">+ Lote</button>
                <button class="btn btn-sm btn-danger btn-fixed-action" onclick="abrirModalBaixa(${prod.id}, '${prod.nome || ''}')">Baixa</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderizarTabela() {
    const tbody = document.getElementById('corpo-tabela-produtos');
    tbody.innerHTML = '';

    const filtrados = filtrarProdutos(estadoGeral.produtos);

    filtrados.forEach(prod => {
        const lotes = prod.lotes || [];
        const total = lotes.reduce((acc, l) => acc + Number(l.quantidade || 0), 0);

        let valMaisProxima = '-';
        if (lotes.length > 0) {
            const sorted = [...lotes].sort((a,b) => new Date(a.validade || 0) - new Date(b.validade || 0));
            valMaisProxima = formatarData(sorted[0].validade);
        }

        let statusBadge = '<span>OK</span>';
        if (total <= Number(prod.estoqueMinimo || 0)) {
            statusBadge = '<span style="color:var(--warning)">Baixo</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${prod.nome || 'Sem Nome'}</strong></td>
            <td>${prod.categoria || 'Geral'}</td>
            <td>${total} ${prod.unidade || 'und'}</td>
            <td>${lotes.length} lote(s)</td>
            <td>${valMaisProxima}</td>
            <td>${statusBadge}</td>
            <td>
                <div style="display:flex; gap:0.35rem;">
                    <button class="btn btn-sm btn-primary btn-fixed-action" onclick="abrirModalLote(${prod.id}, '${prod.nome || ''}')">+ Lote</button>
                    <button class="btn btn-sm btn-danger btn-fixed-action" onclick="abrirModalBaixa(${prod.id}, '${prod.nome || ''}')">Baixa</button>
                    <button class="btn btn-sm btn-secondary admin-only" onclick="excluirProduto(${prod.id})">Excluir</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarCalendario() {
    const grid = document.getElementById('calendario-dias-grid');
    grid.innerHTML = '';

    const dataAtual = estadoGeral.dataCalendarioAtual;
    const ano = dataAtual.getFullYear();
    const mes = dataAtual.getMonth();

    const nomeMes = dataAtual.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    document.getElementById('cal-titulo-mes').textContent = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

    const primeiroDiaMes = new Date(ano, mes, 1).getDay();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const diasMesAnterior = new Date(ano, mes, 0).getDate();

    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;

    const eventosPorData = {};

    estadoGeral.mural.forEach(m => {
        if (!m.dataHoraAgendada) return;
        const partes = m.dataHoraAgendada.split('T');
        const dataParte = partes[0];
        const horaParte = partes[1] || '00:00';
        if (!eventosPorData[dataParte]) eventosPorData[dataParte] = [];
        eventosPorData[dataParte].push({
            tipo: 'lembrete',
            hora: horaParte,
            titulo: m.texto || 'Lembrete',
            concluido: m.concluido
        });
    });

    estadoGeral.produtos.forEach(p => {
        const lotes = p.lotes || [];
        lotes.forEach(l => {
            if (!l.validade) return;
            const dataParte = l.validade;
            if (!eventosPorData[dataParte]) eventosPorData[dataParte] = [];
            eventosPorData[dataParte].push({
                tipo: 'validade',
                hora: '23:59',
                titulo: `${p.nome || 'Produto'} (${l.marca || 'Lote'}): ${l.quantidade} ${p.unidade || 'und'}`
            });
        });
    });

    for (let i = primeiroDiaMes - 1; i >= 0; i--) {
        const diaNum = diasMesAnterior - i;
        const cell = document.createElement('div');
        cell.className = 'cal-day other-month';
        cell.innerHTML = `<span class="cal-day-num">${diaNum}</span>`;
        grid.appendChild(cell);
    }

    for (let d = 1; d <= diasNoMes; d++) {
        const diaStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const cell = document.createElement('div');
        cell.className = `cal-day ${diaStr === hojeStr ? 'today' : ''}`;
        cell.onclick = () => abrirModalDetalhesDia(diaStr, eventosPorData[diaStr] || []);

        let badgingsHtml = '';
        const eventosDoDia = eventosPorData[diaStr] || [];

        eventosDoDia.sort((a,b) => (a.hora || '').localeCompare(b.hora || ''));

        eventosDoDia.slice(0, 3).forEach(ev => {
            let classeBadge = 'cal-badge-lembrete';
            if (ev.tipo === 'validade') {
                const isVencido = new Date(diaStr + 'T23:59:59') < hoje;
                classeBadge = isVencido ? 'cal-badge-vencido' : 'cal-badge-validade';
            }
            badgingsHtml += `
                <div class="cal-badge ${classeBadge}">
                    <span>${ev.hora}</span> <span>${ev.titulo}</span>
                </div>
            `;
        });

        if (eventosDoDia.length > 3) {
            badgingsHtml += `<div class="cal-badge cal-badge-lembrete">+${eventosDoDia.length - 3} evento(s)</div>`;
        }

        cell.innerHTML = `
            <span class="cal-day-num">${d}</span>
            <div class="cal-events-list">
                ${badgingsHtml}
            </div>
        `;
        grid.appendChild(cell);
    }
}

function renderizarHistorico() {
    const tbody = document.getElementById('corpo-tabela-historico');
    tbody.innerHTML = '';

    estadoGeral.historico.forEach(item => {
        const tr = document.createElement('tr');
        
        let dataFmt = 'Data';
        const rawData = item.dataHora || item.dataHoraAgendada || item.data;
        if (rawData) {
            const parsedDate = new Date(rawData);
            if (!isNaN(parsedDate.getTime())) {
                dataFmt = parsedDate.toLocaleString('pt-BR');
            }
        }

        tr.innerHTML = `
            <td>${dataFmt}</td>
            <td><span class="badge-status" style="background:rgba(56, 189, 248, 0.15); color:var(--accent);">${item.usuario || 'Operador'}</span></td>
            <td><strong>${item.acao || 'Operacao'}</strong></td>
            <td>${item.detalhe || ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

function abrirModalDetalhesDia(dataStr, eventos) {
    const modal = document.getElementById('modal-dia-detalhes');
    const titulo = document.getElementById('modal-dia-titulo');
    const container = document.getElementById('modal-dia-lista');

    const [ano, mes, dia] = dataStr.split('-');
    titulo.textContent = `Eventos Dia ${dia}/${mes}/${ano}`;
    container.innerHTML = '';

    eventos.forEach(ev => {
        const div = document.createElement('div');
        div.className = 'linha-tempo-item';
        div.innerHTML = `
            <div class="linha-tempo-hora">${ev.hora}</div>
            <div class="linha-tempo-conteudo">
                <strong>${ev.tipo === 'lembrete' ? 'Mural' : 'Validade'}</strong>
                <span>${ev.titulo}</span>
            </div>
        `;
        container.appendChild(div);
    });

    modal.classList.add('active');
}

function configurarEventos() {
    const logo = document.getElementById('logo-sistema');
    if (logo) {
        logo.addEventListener('click', () => {
            cliqueLogoCount++;
            clearTimeout(cliqueLogoTimer);
            cliqueLogoTimer = setTimeout(() => { cliqueLogoCount = 0; }, 1500);
            
            if (cliqueLogoCount === 5) {
                cliqueLogoCount = 0;
                const eAdmin = localStorage.getItem('admin_token') === 'admin2026';
                if (eAdmin) {
                    if (confirm('Deseja sair do Modo Administrador?')) {
                        localStorage.removeItem('admin_token');
                        document.body.classList.remove('modo-admin');
                        alert('Modo Administrador Desativado.');
                    }
                } else {
                    const senha = prompt('Acesso Restrito:');
                    if (senha === 'admin2026') {
                        localStorage.setItem('admin_token', senha);
                        document.body.classList.add('modo-admin');
                        alert('Modo Administrador Ativado.');
                    } else if (senha !== null) {
                        alert('Senha incorreta.');
                    }
                }
            }
        });
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            e.target.classList.add('active');
            const targetId = e.target.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    document.getElementById('cal-btn-prev').addEventListener('click', () => {
        estadoGeral.dataCalendarioAtual.setMonth(estadoGeral.dataCalendarioAtual.getMonth() - 1);
        renderizarCalendario();
    });

    document.getElementById('cal-btn-next').addEventListener('click', () => {
        estadoGeral.dataCalendarioAtual.setMonth(estadoGeral.dataCalendarioAtual.getMonth() + 1);
        renderizarCalendario();
    });

    document.getElementById('cal-btn-today').addEventListener('click', () => {
        estadoGeral.dataCalendarioAtual = new Date();
        renderizarCalendario();
    });

    document.getElementById('campo-busca').addEventListener('input', (e) => {
        estadoGeral.busca = e.target.value.toLowerCase();
        renderizarCards();
        renderizarTabela();
    });

    document.querySelectorAll('.btn-fechar-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        });
    });

    document.getElementById('btn-novo-produto').addEventListener('click', () => {
        document.getElementById('form-produto').reset();
        document.getElementById('modal-produto').classList.add('active');
    });

    document.getElementById('form-produto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const obsEl = document.getElementById('prod-obs');
        const novoProduto = {
            nome: document.getElementById('prod-nome').value.trim(),
            categoria: document.getElementById('prod-categoria').value.trim(),
            unidade: document.getElementById('prod-unidade').value,
            estoqueMinimo: document.getElementById('prod-minimo').value,
            observacao: obsEl ? obsEl.value.trim() : ''
        };

        try {
            const res = await fetch('/api/produtos', {
                method: 'POST',
                headers: obterHeaders(),
                body: JSON.stringify(novoProduto)
            });
            if (!res.ok) {
                alert('Erro ao cadastrar produto no servidor.');
                return;
            }
        } catch (err) {
            alert('Erro de conexao ao cadastrar produto.');
            return;
        }

        document.getElementById('modal-produto').classList.remove('active');
        await carregarDados();
    });

    document.getElementById('form-lote').addEventListener('submit', async (e) => {
        e.preventDefault();
        const prodId = document.getElementById('lote-produto-id').value;
        const obsEl = document.getElementById('lote-obs');
        const novoLote = {
            marca: document.getElementById('lote-marca').value.trim(),
            quantidade: parseFloat(document.getElementById('lote-qtd').value),
            validade: document.getElementById('lote-validade').value,
            observacao: obsEl ? obsEl.value.trim() : ''
        };

        try {
            const res = await fetch(`/api/produtos/${prodId}/lotes`, {
                method: 'POST',
                headers: obterHeaders(),
                body: JSON.stringify(novoLote)
            });
            if (!res.ok) {
                alert('Erro ao adicionar lote no servidor.');
                return;
            }
        } catch (err) {
            alert('Erro de conexao ao adicionar lote.');
            return;
        }

        document.getElementById('modal-lote').classList.remove('active');
        await carregarDados();
    });

    document.getElementById('form-baixa').addEventListener('submit', async (e) => {
        e.preventDefault();
        const prodId = document.getElementById('baixa-produto-id').value;
        const quantidade = parseFloat(document.getElementById('baixa-qtd').value);

        try {
            const res = await fetch(`/api/produtos/${prodId}/baixa`, {
                method: 'POST',
                headers: obterHeaders(),
                body: JSON.stringify({ quantidade })
            });
            if (!res.ok) {
                alert('Erro ao realizar baixa no servidor.');
                return;
            }
        } catch (err) {
            alert('Erro de conexao ao realizar baixa.');
            return;
        }

        document.getElementById('modal-baixa').classList.remove('active');
        await carregarDados();
    });

    document.getElementById('form-mural').addEventListener('submit', async (e) => {
        e.preventDefault();
        const novoAviso = {
            texto: document.getElementById('mural-texto').value.trim(),
            dataHoraAgendada: document.getElementById('mural-datahora').value
        };

        try {
            const res = await fetch('/api/mural', {
                method: 'POST',
                headers: obterHeaders(),
                body: JSON.stringify(novoAviso)
            });
            if (!res.ok) {
                alert('Erro ao criar lembrete no servidor.');
                return;
            }
        } catch (err) {
            alert('Erro de conexao ao criar lembrete.');
            return;
        }

        document.getElementById('form-mural').reset();
        await carregarDados();
    });

    document.getElementById('btn-exportar').addEventListener('click', exportarCSV);

    document.getElementById('btn-imprimir').addEventListener('click', () => window.print());
}

function filtrarProdutos(produtos) {
    if (!estadoGeral.busca) return produtos;
    return produtos.filter(p => {
        const nome = (p.nome || '').toLowerCase();
        const cat = (p.categoria || '').toLowerCase();
        const lotes = p.lotes || [];
        const temLote = lotes.some(l => (l.marca || '').toLowerCase().includes(estadoGeral.busca));
        return nome.includes(estadoGeral.busca) || cat.includes(estadoGeral.busca) || temLote;
    });
}

function abrirModalLote(id, nome) {
    document.getElementById('lote-produto-id').value = id;
    document.getElementById('lote-produto-nome').textContent = `Produto: ${nome}`;
    document.getElementById('form-lote').reset();
    document.getElementById('modal-lote').classList.add('active');
}

function abrirModalBaixa(id, nome) {
    document.getElementById('baixa-produto-id').value = id;
    document.getElementById('baixa-produto-nome').textContent = `Produto: ${nome}`;
    document.getElementById('form-baixa').reset();
    document.getElementById('modal-baixa').classList.add('active');
}

async function excluirProduto(id) {
    if (confirm('Excluir este produto?')) {
        await fetch(`/api/produtos/${id}`, { 
            method: 'DELETE',
            headers: obterHeaders()
        });
        await carregarDados();
    }
}

async function excluirLote(loteId) {
    if (confirm('Excluir este lote?')) {
        await fetch(`/api/lotes/${loteId}`, { 
            method: 'DELETE',
            headers: obterHeaders()
        });
        await carregarDados();
    }
}

async function concluirAviso(id) {
    await fetch(`/api/mural/${id}/concluir`, { 
        method: 'PUT',
        headers: obterHeaders()
    });
    await carregarDados();
}

async function excluirAviso(id) {
    await fetch(`/api/mural/${id}`, { 
        method: 'DELETE',
        headers: obterHeaders()
    });
    await carregarDados();
}

function formatarData(dataIso) {
    if (!dataIso) return '-';
    const partes = dataIso.split('-');
    if (partes.length !== 3) return dataIso;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatarDataHora(dataIso) {
    if (!dataIso) return '-';
    const parsed = new Date(dataIso);
    if (isNaN(parsed.getTime())) return dataIso;
    return parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function exportarCSV() {
    let csv = '\uFEFF';
    csv += 'Produto;Categoria;Unidade;Lote;Quantidade;Validade\n';

    estadoGeral.produtos.forEach(p => {
        const lotes = p.lotes || [];
        if (lotes.length === 0) {
            csv += `"${p.nome || ''}";"${p.categoria || ''}";"${p.unidade || ''}";"-";0;"-"\n`;
        } else {
            lotes.forEach(l => {
                csv += `"${p.nome || ''}";"${p.categoria || ''}";"${p.unidade || ''}";"${l.marca || ''}";${l.quantidade || 0};"${formatarData(l.validade)}"\n`;
            });
        }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio.csv`;
    a.click();
}