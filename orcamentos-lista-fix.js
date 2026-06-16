// ============================================================
// CLINICALEAD — PÁGINA "ORÇAMENTOS" (visão geral) 
// Lista TODOS os orçamentos da clínica com estado calculado:
//  • Pendente (sem item aprovado)
//  • Aprovado (aprovado, sem pagamento)
//  • Pago parcial (tem pagamento, falta residual)
//  • Quitado (pago 100%)
//  • Recusado
// Filtros por estado + cards de resumo. Clicar abre o orçamento.
// ============================================================

let ORCLISTA = { todos: [], filtro: 'todos' };

// Calcula o estado real de um orçamento
function orcEstado(o) {
  if (o.status === 'recusado') return 'recusado';
  const total = (o.itens || []).reduce((s, i) => s + Number(i.valor || 0) * Number(i.qtd || 1), 0) - Number(o.desconto || 0);
  const aprovado = (o.itens || []).some(i => i.aprovado);
  const pago = Number(o._totalPago || 0);

  if (pago > 0) {
    if (pago >= total - 0.01) return 'quitado';
    return 'pago_parcial';
  }
  if (aprovado) return 'aprovado';
  return 'pendente';
}

const ORCLISTA_ESTADOS = {
  pendente:     { label: 'Pendente',     cor: '#E8A23D', bg: 'rgba(232,162,61,.15)' },
  aprovado:     { label: 'Aprovado',     cor: 'var(--gold)', bg: 'var(--gold-pale)' },
  pago_parcial: { label: 'Pago parcial', cor: 'var(--blue,#5B8DB8)', bg: 'rgba(91,141,184,.15)' },
  quitado:      { label: 'Quitado',      cor: '#3FB950', bg: 'rgba(63,185,80,.15)' },
  recusado:     { label: 'Recusado',     cor: '#E5534B', bg: 'rgba(229,83,75,.15)' },
};

function orcListaFmt(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

// Carrega todos os orçamentos da clínica + itens + pagamentos
async function carregarTodosOrcamentos() {
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (!clinic) return [];

  const { data: orcs } = await db.from('orcamentos').select('*').eq('clinic_id', clinic.id).order('created_at', { ascending: false });
  const lista = orcs || [];
  if (!lista.length) { ORCLISTA.todos = []; return []; }

  const ids = lista.map(o => o.id);
  const { data: itens } = await db.from('orcamento_itens').select('*').in('orcamento_id', ids);
  const { data: pags } = await db.from('pagamentos').select('orcamento_id, valor').in('orcamento_id', ids);

  lista.forEach(o => {
    o.itens = (itens || []).filter(i => i.orcamento_id === o.id);
    o._totalPago = (pags || []).filter(p => p.orcamento_id === o.id).reduce((s, p) => s + Number(p.valor || 0), 0);
    o._lead = (STATE.leads || []).find(l => l.id === o.lead_id);
  });

  ORCLISTA.todos = lista;
  return lista;
}

function orcSetFiltro(f) {
  ORCLISTA.filtro = f;
  renderOrcamentosPage();
}

async function renderOrcamentosPage() {
  const page = document.getElementById('page-orcamentos');
  if (!page) return;

  if (!ORCLISTA.todos.length) {
    page.innerHTML = '<div style="padding:20px;color:var(--text-muted);">Carregando orçamentos...</div>';
    await carregarTodosOrcamentos();
  }

  const todos = ORCLISTA.todos;
  // calcula estado de cada um
  todos.forEach(o => { o._estado = orcEstado(o); });

  // resumo por estado
  const resumo = { pendente: 0, aprovado: 0, pago_parcial: 0, quitado: 0, recusado: 0 };
  todos.forEach(o => { resumo[o._estado] = (resumo[o._estado] || 0) + 1; });

  // aplica filtro
  const filtrados = ORCLISTA.filtro === 'todos' ? todos : todos.filter(o => o._estado === ORCLISTA.filtro);

  // botões de filtro
  const botoes = [{ k: 'todos', label: 'Todos', n: todos.length }]
    .concat(Object.keys(ORCLISTA_ESTADOS).map(k => ({ k, label: ORCLISTA_ESTADOS[k].label, n: resumo[k] || 0 })));

  const filtrosHtml = botoes.map(b => {
    const ativo = ORCLISTA.filtro === b.k;
    const est = ORCLISTA_ESTADOS[b.k];
    return `<button class="btn btn-sm" style="${ativo ? `background:${est ? est.bg : 'var(--gold-pale)'};border-color:${est ? est.cor : 'var(--gold)'};color:${est ? est.cor : 'var(--gold)'};font-weight:600;` : ''}"
      onclick="orcSetFiltro('${b.k}')">${b.label} <span style="opacity:.7;">(${b.n})</span></button>`;
  }).join('');

  // linhas
  const linhas = filtrados.map(o => {
    const est = ORCLISTA_ESTADOS[o._estado];
    const total = (o.itens || []).reduce((s, i) => s + Number(i.valor || 0) * Number(i.qtd || 1), 0) - Number(o.desconto || 0);
    const data = new Date(o.created_at).toLocaleDateString('pt-BR');
    const nome = o._lead?.nome || 'Paciente';
    const pago = Number(o._totalPago || 0);
    const restante = Math.max(0, total - pago);

    return `
      <div class="card" style="padding:14px 16px;margin-bottom:10px;cursor:pointer;" onclick="abrirOrcamentoDaLista('${o.lead_id}')">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:160px;">
            <div style="font-weight:600;font-size:14px;">${nome}</div>
            <div style="font-size:12px;color:var(--text-muted);">Orçamento de ${data}</div>
          </div>
          <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
            <div style="text-align:right;">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">Total</div>
              <div style="font-size:15px;font-weight:700;font-family:var(--mono);">${orcListaFmt(total)}</div>
            </div>
            ${pago > 0 ? `<div style="text-align:right;">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">Pago</div>
              <div style="font-size:15px;font-weight:700;color:#3FB950;font-family:var(--mono);">${orcListaFmt(pago)}</div>
            </div>` : ''}
            ${restante > 0 && pago > 0 ? `<div style="text-align:right;">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">Falta</div>
              <div style="font-size:15px;font-weight:700;color:var(--blue,#5B8DB8);font-family:var(--mono);">${orcListaFmt(restante)}</div>
            </div>` : ''}
            <span class="badge" style="background:${est.bg};color:${est.cor};border:1px solid ${est.cor};">${est.label}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  page.innerHTML = `
    <div class="page-header" style="margin-bottom:16px;">
      <div class="page-header-left">
        <h2>Orçamentos</h2>
        <p>${todos.length} orçamento${todos.length !== 1 ? 's' : ''} no total</p>
      </div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px;">${filtrosHtml}</div>
    <div>${linhas || '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px;">Nenhum orçamento neste filtro.</div>'}</div>`;
}

// Abre o orçamento do lead (reaproveita o modal existente) e recarrega a lista ao fechar
async function abrirOrcamentoDaLista(leadId) {
  if (typeof openOrcamento === 'function') {
    await openOrcamento(leadId);
    // recarrega a lista quando o modal fechar (pra refletir mudanças)
    const obs = setInterval(() => {
      const modal = document.getElementById('modalOrcamento');
      if (!modal || !modal.classList.contains('open')) {
        clearInterval(obs);
        carregarTodosOrcamentos().then(renderOrcamentosPage);
      }
    }, 800);
    setTimeout(() => clearInterval(obs), 120000);
  }
}

// ── Injeta o item de menu + a casca da página ────────────────
(function () {
  function injetar() {
    // casca da página (se não existe)
    if (!document.getElementById('page-orcamentos')) {
      const ref = document.getElementById('page-pacientes') || document.querySelector('.page');
      if (ref && ref.parentNode) {
        const div = document.createElement('div');
        div.className = 'page';
        div.id = 'page-orcamentos';
        ref.parentNode.insertBefore(div, ref.nextSibling);
      }
    }
    // item de menu (após Pacientes)
    const navPacientes = document.querySelector('.nav-item[data-page="pacientes"]');
    if (navPacientes && !document.getElementById('navOrcamentos')) {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.id = 'navOrcamentos';
      btn.setAttribute('data-page', 'orcamentos');
      btn.innerHTML = '<i class="ti ti-file-invoice"></i> Orçamentos';
      btn.onclick = function () { showPage('orcamentos', this); };
      navPacientes.parentNode.insertBefore(btn, navPacientes.nextSibling);
    }
  }
  injetar();
  setTimeout(injetar, 1500);
  setTimeout(injetar, 4000);

  // renderiza ao entrar na página
  if (typeof showPage === 'function') {
    const _orig = showPage;
    showPage = function (id, el) {
      _orig(id, el);
      if (id === 'orcamentos') {
        carregarTodosOrcamentos().then(renderOrcamentosPage);
      }
    };
  }

  console.log('✅ orcamentos-lista-fix.js carregado (página Orçamentos)');
})();
