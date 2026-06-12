// ============================================================
// CLINICALEAD — FILTRO DE PERÍODO NO PAINEL PRINCIPAL
// Atalhos (Hoje / 7 / 30 / 90 dias / Tudo) + datas personalizadas.
// Filtra métricas, funil e leads recentes pela data de criação
// do lead. A Central de Tarefas continua sempre mostrando "hoje".
// ============================================================

let PAINEL = { inicio: null, fim: null, atalho: 'tudo' };

// ── Abrir cadastro do paciente em NOVA ABA (link direto) ────
function abrirCadastroNovaAba(leadId) {
  if (!leadId) return;
  window.open(location.origin + location.pathname + '?lead=' + leadId, '_blank');
}

// Ao abrir o app com ?lead=ID na URL, abre o cadastro automaticamente
(function () {
  const leadId = new URLSearchParams(location.search).get('lead');
  if (!leadId) return;
  let tentativas = 0;
  const timer = setInterval(() => {
    tentativas++;
    if ((window.STATE?.leads || []).length && typeof openEditLead === 'function') {
      clearInterval(timer);
      openEditLead(leadId);
    } else if (tentativas > 40) {
      clearInterval(timer); // desiste após ~20s (app não carregou)
    }
  }, 500);
})();

// ── Helpers de data ──────────────────────────────────────────
function pIsoLocal(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}
function pHoje() { return pIsoLocal(new Date()); }
function pDiasAtras(n) { const d = new Date(); d.setDate(d.getDate() - n); return pIsoLocal(d); }

// ── Atalhos de período ───────────────────────────────────────
function setPainelPeriodo(atalho) {
  PAINEL.atalho = atalho;
  if (atalho === 'tudo') {
    PAINEL.inicio = null;
    PAINEL.fim = null;
  } else if (atalho === 'hoje') {
    PAINEL.inicio = pHoje();
    PAINEL.fim = pHoje();
  } else {
    PAINEL.inicio = pDiasAtras(Number(atalho));
    PAINEL.fim = pHoje();
  }
  renderDashboard();
}

// ── Datas personalizadas ─────────────────────────────────────
function setPainelDatas() {
  const ini = document.getElementById('painelDataInicio')?.value || null;
  const fim = document.getElementById('painelDataFim')?.value || null;
  PAINEL.inicio = ini;
  PAINEL.fim = fim || pHoje();
  PAINEL.atalho = 'custom';
  renderDashboard();
}

// ── Leads do período selecionado ─────────────────────────────
function painelLeadsFiltrados() {
  let leads = currentLeads();
  if (PAINEL.inicio) {
    leads = leads.filter(l => {
      const d = l.created_at?.split('T')[0];
      return d && d >= PAINEL.inicio && d <= PAINEL.fim;
    });
  }
  return leads;
}

// ── Monta a barra de filtros (uma vez) ───────────────────────
function montarFiltroPainel() {
  if (document.getElementById('painelFiltro')) {
    atualizarBotoesFiltroPainel();
    return;
  }
  const page = document.getElementById('page-dashboard');
  const metrics = page?.querySelector('.metrics-grid');
  if (!page || !metrics) return;

  const bar = document.createElement('div');
  bar.id = 'painelFiltro';
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:16px;';
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-sm,10px);padding:6px 12px;">
      <i class="ti ti-calendar" style="color:var(--gold);font-size:15px;"></i>
      <input type="date" id="painelDataInicio" class="form-input" style="border:none;background:transparent;padding:0;width:125px;font-size:13px;" onchange="setPainelDatas()"/>
      <span style="color:var(--text-muted);font-size:12px;">até</span>
      <input type="date" id="painelDataFim" class="form-input" style="border:none;background:transparent;padding:0;width:125px;font-size:13px;" onchange="setPainelDatas()"/>
    </div>
    <button class="btn btn-sm" id="painelBtnHoje" onclick="setPainelPeriodo('hoje')">Hoje</button>
    <button class="btn btn-sm" id="painelBtn7" onclick="setPainelPeriodo('7')">7 dias</button>
    <button class="btn btn-sm" id="painelBtn30" onclick="setPainelPeriodo('30')">30 dias</button>
    <button class="btn btn-sm" id="painelBtn90" onclick="setPainelPeriodo('90')">90 dias</button>
    <button class="btn btn-sm" id="painelBtnTudo" onclick="setPainelPeriodo('tudo')">Tudo</button>
    <span id="painelFiltroResumo" style="font-size:11px;color:var(--text-muted);margin-left:4px;"></span>
  `;
  metrics.insertAdjacentElement('beforebegin', bar);
  atualizarBotoesFiltroPainel();
}

function atualizarBotoesFiltroPainel() {
  const mapa = { hoje: 'painelBtnHoje', '7': 'painelBtn7', '30': 'painelBtn30', '90': 'painelBtn90', tudo: 'painelBtnTudo' };
  Object.entries(mapa).forEach(([atalho, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const ativo = PAINEL.atalho === atalho;
    btn.style.background = ativo ? 'var(--gold-pale)' : '';
    btn.style.borderColor = ativo ? 'var(--gold-border)' : '';
    btn.style.color = ativo ? 'var(--gold)' : '';
  });
  const ini = document.getElementById('painelDataInicio');
  const fim = document.getElementById('painelDataFim');
  if (ini) ini.value = PAINEL.inicio || '';
  if (fim) fim.value = PAINEL.fim || '';

  const resumo = document.getElementById('painelFiltroResumo');
  if (resumo) {
    if (!PAINEL.inicio) {
      resumo.textContent = 'Mostrando: todos os leads';
    } else {
      const f = d => { const [a, m, dia] = d.split('-'); return `${dia}/${m}`; };
      resumo.textContent = `Período: ${f(PAINEL.inicio)} até ${f(PAINEL.fim)}`;
    }
  }
}

// ── Substitui o renderDashboard com a versão filtrada ────────
renderDashboard = function () {
  montarFiltroPainel();

  const leads = painelLeadsFiltrados();
  const agendados = leads.filter(l => l.status === 'agendado').length;
  const compareceram = leads.filter(l => l.status === 'compareceu').length;
  const potencial = leads.reduce((s, l) => s + (l.valor || 0), 0);

  document.getElementById('metricLeads').textContent = leads.length;
  document.getElementById('metricAgendam').textContent = agendados;
  document.getElementById('metricCompare').textContent = compareceram;
  document.getElementById('metricFatur').textContent = fmtCurrency(potencial);

  if (!leads.length) {
    document.getElementById('funnelRows').innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:13px;">Nenhum lead no período selecionado</div>';
    document.getElementById('recentLeads').innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:13px;">Nenhum lead no período</div>';
  } else {
    const total = leads.length;
    const funnelData = [
      { label: 'Novos leads',   n: total, color: '#C9A84C' },
      { label: 'Contato feito', n: leads.filter(l => ['contato','agendado','compareceu','fechado'].includes(l.status)).length, color: '#E8C96A' },
      { label: 'Agendados',     n: leads.filter(l => ['agendado','compareceu','fechado'].includes(l.status)).length, color: '#5B8DB8' },
      { label: 'Compareceram',  n: leads.filter(l => ['compareceu','fechado'].includes(l.status)).length, color: '#8ABBE8' },
      { label: 'Fechados',      n: leads.filter(l => l.status === 'fechado').length, color: '#A07B30' },
    ];
    document.getElementById('funnelRows').innerHTML = funnelData.map(f => {
      const pct = Math.round((f.n / total) * 100);
      return `<div class="funnel-row"><span class="funnel-label">${f.label}</span><div class="funnel-track"><div class="funnel-fill" style="width:${pct}%;background:${f.color};"></div></div><span class="funnel-n">${f.n}</span><span class="funnel-pct">${pct}%</span></div>`;
    }).join('');

    document.getElementById('recentLeads').innerHTML = leads.slice(0, 5).map(l => `
      <div class="lead-row">
        <div class="avatar" style="${avatarStyle(l.nome)}">${initials(l.nome)}</div>
        <div class="lead-info"><div class="lead-name">${l.nome}</div><div class="lead-sub">${l.procedimento || '—'} · ${l.origem || '—'}</div></div>
        ${badgeHtml(l.status)}
      </div>`).join('');
  }

  // Central de Tarefas continua sempre "de hoje" (sem filtro de período)
  if (typeof atualizarTarefasDashboard === 'function') atualizarTarefasDashboard();

  // Faixa financeira (orçamentos + pagamentos)
  atualizarFinanceiroDashboard();
};

// ── Faixa financeira do Painel (cards clicáveis) ─────────────
let PAINEL_FIN = { pendentes: [], areceber: [], recebidos: [] };

async function atualizarFinanceiroDashboard() {
  const clinic = currentClinic();
  const page = document.getElementById('page-dashboard');
  const metrics = page?.querySelector('.metrics-grid');
  if (!clinic || !page || !metrics) return;

  let faixa = document.getElementById('painelFinanceiro');
  if (!faixa) {
    faixa = document.createElement('div');
    faixa.id = 'painelFinanceiro';
    faixa.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:16px 0;';
    metrics.insertAdjacentElement('afterend', faixa);
  }
  faixa.innerHTML = `<div style="grid-column:1/-1;font-size:12px;color:var(--text-muted);padding:8px;">Carregando financeiro...</div>`;

  try {
    const { data: orcs } = await db.from('orcamentos')
      .select('id,lead_id,status,desconto,created_at').eq('clinic_id', clinic.id).neq('status', 'recusado');
    const ids = (orcs || []).map(o => o.id);

    let itens = [], pags = [];
    if (ids.length) {
      const r1 = await db.from('orcamento_itens').select('orcamento_id,valor,qtd,aprovado').in('orcamento_id', ids);
      itens = r1.data || [];
    }
    const r2 = await db.from('pagamentos').select('valor,data,forma,lead_id,orcamento_id').eq('clinic_id', clinic.id);
    pags = r2.data || [];

    // Agrega por orçamento
    PAINEL_FIN = { pendentes: [], areceber: [], recebidos: [] };
    let pendenteAprovacao = 0, aprovadoTotal = 0;

    (orcs || []).forEach(o => {
      const lead = (STATE.leads || []).find(l => l.id === o.lead_id);
      const its = itens.filter(i => i.orcamento_id === o.id);
      const pend = its.filter(i => !i.aprovado).reduce((s, i) => s + Number(i.valor) * Number(i.qtd || 1), 0);
      const aprov = its.filter(i => i.aprovado).reduce((s, i) => s + Number(i.valor) * Number(i.qtd || 1), 0);
      const pagoOrc = pags.filter(p => p.orcamento_id === o.id).reduce((s, p) => s + Number(p.valor || 0), 0);
      const aReceberOrc = Math.max(0, aprov - pagoOrc);

      pendenteAprovacao += pend;
      aprovadoTotal += aprov;

      const base = { leadId: o.lead_id, nome: lead?.nome || 'Lead', tel: (lead?.telefone || '').replace(/\D/g, ''), data: new Date(o.created_at).toLocaleDateString('pt-BR') };
      if (pend > 0) PAINEL_FIN.pendentes.push({ ...base, valor: pend });
      if (aReceberOrc > 0) PAINEL_FIN.areceber.push({ ...base, valor: aReceberOrc });
    });

    const FORMA_LBL = { pix: '💠 Pix', cartao_credito: '💳 Crédito', cartao_debito: '💳 Débito', dinheiro: '💵 Dinheiro', boleto: '🧾 Boleto', transferencia: '🏦 Transf.' };
    const pagsPeriodo = pags.filter(p => !PAINEL.inicio || (p.data >= PAINEL.inicio && p.data <= PAINEL.fim));
    pagsPeriodo.forEach(p => {
      const lead = (STATE.leads || []).find(l => l.id === p.lead_id);
      PAINEL_FIN.recebidos.push({
        leadId: p.lead_id,
        nome: lead?.nome || 'Lead',
        tel: (lead?.telefone || '').replace(/\D/g, ''),
        data: p.data ? new Date(p.data + 'T12:00').toLocaleDateString('pt-BR') : '—',
        valor: Number(p.valor || 0),
        forma: FORMA_LBL[p.forma] || p.forma,
      });
    });

    const todosPagos = pags.reduce((s, p) => s + Number(p.valor || 0), 0);
    const recebidoPeriodo = pagsPeriodo.reduce((s, p) => s + Number(p.valor || 0), 0);
    const aReceber = Math.max(0, aprovadoTotal - todosPagos);

    const cardFin = (tipo, titulo, valor, cor, icone, sub, qtd) => `
      <div class="card" style="padding:14px 16px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='var(--gold-border)'" onmouseout="this.style.borderColor=''" onclick="abrirDetalheFinanceiro('${tipo}')" title="Clique para ver o detalhamento">
        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px;"><i class="ti ${icone}" style="color:${cor};font-size:15px;"></i> ${titulo} ${qtd ? `<span style="background:var(--bg-elevated);border-radius:10px;padding:1px 7px;font-size:10px;">${qtd}</span>` : ''}</div>
        <div style="font-size:20px;font-weight:700;font-family:var(--mono);color:${cor};margin-top:6px;">${fmtCurrency(valor)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${sub} · <span style="color:var(--gold);">ver detalhes →</span></div>
      </div>`;

    faixa.innerHTML =
      cardFin('pendentes', 'Orçamentos pendentes', pendenteAprovacao, 'var(--coral)', 'ti-file-invoice', 'aguardando aprovação', PAINEL_FIN.pendentes.length) +
      cardFin('areceber', 'A receber', aReceber, '#E8C96A', 'ti-hourglass', 'aprovado e não pago', PAINEL_FIN.areceber.length) +
      cardFin('recebidos', 'Recebido no período', recebidoPeriodo, 'var(--gold)', 'ti-cash', PAINEL.inicio ? 'conforme o filtro' : 'desde o início', PAINEL_FIN.recebidos.length);
  } catch (e) {
    faixa.innerHTML = '';
    console.error('[painel financeiro]', e);
  }
}

// ── Modal de detalhamento financeiro ─────────────────────────
function abrirDetalheFinanceiro(tipo) {
  if (!document.getElementById('modalFinanceiro')) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalFinanceiro';
    overlay.innerHTML = `
      <div class="modal" style="max-width:640px;width:96vw;">
        <div class="modal-header">
          <h3 id="finTitulo"></h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('modalFinanceiro')"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" id="finBody" style="max-height:65vh;overflow-y:auto;"></div>
      </div>`;
    document.body.appendChild(overlay);
  }

  const config = {
    pendentes: { titulo: '<i class="ti ti-file-invoice" style="color:var(--coral);margin-right:8px;"></i>Orçamentos pendentes de aprovação', lista: PAINEL_FIN.pendentes, vazio: 'Nenhum orçamento aguardando aprovação. 🎉' },
    areceber:  { titulo: '<i class="ti ti-hourglass" style="color:#E8C96A;margin-right:8px;"></i>Valores a receber', lista: PAINEL_FIN.areceber, vazio: 'Nada a receber — tudo quitado! 🎉' },
    recebidos: { titulo: '<i class="ti ti-cash" style="color:var(--gold);margin-right:8px;"></i>Pagamentos recebidos', lista: PAINEL_FIN.recebidos, vazio: 'Nenhum pagamento no período.' },
  };
  const c = config[tipo];
  document.getElementById('finTitulo').innerHTML = c.titulo;

  document.getElementById('finBody').innerHTML = c.lista.length ? c.lista.map(item => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-subtle);flex-wrap:wrap;">
      <div class="avatar" style="${avatarStyle(item.nome)}">${initials(item.nome)}</div>
      <div style="flex:1;min-width:140px;">
        <div style="font-size:13px;font-weight:600;">${item.nome}</div>
        <div style="font-size:11px;color:var(--text-muted);">${item.forma ? item.forma + ' · ' : ''}${item.data}</div>
      </div>
      <div style="font-family:var(--mono);font-size:14px;color:var(--gold);">${fmtCurrency(item.valor)}</div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-ghost btn-icon" title="Abrir orçamentos" onclick="closeModal('modalFinanceiro');openOrcamento('${item.leadId}')"><i class="ti ti-file-invoice" style="color:var(--gold);"></i></button>
        ${item.tel ? `<button class="btn btn-sm btn-ghost btn-icon" title="Conversa no Inbox" onclick="closeModal('modalFinanceiro');tarefaWhats('${item.tel}')"><i class="ti ti-message-circle" style="color:#25D366;"></i></button>` : ''}
        <button class="btn btn-sm btn-ghost btn-icon" title="Abrir cadastro em nova aba" onclick="abrirCadastroNovaAba('${item.leadId}')"><i class="ti ti-external-link"></i></button>
      </div>
    </div>`).join('')
    : `<div style="text-align:center;padding:30px;color:var(--text-secondary);font-size:13px;">${c.vazio}</div>`;

  document.getElementById('modalFinanceiro').classList.add('open');
}

console.log('✅ painel-fix.js carregado — filtro de período do Painel ativo');
