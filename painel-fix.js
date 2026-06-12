// ============================================================
// CLINICALEAD — FILTRO DE PERÍODO NO PAINEL PRINCIPAL
// Atalhos (Hoje / 7 / 30 / 90 dias / Tudo) + datas personalizadas.
// Filtra métricas, funil e leads recentes pela data de criação
// do lead. A Central de Tarefas continua sempre mostrando "hoje".
// ============================================================

let PAINEL = { inicio: null, fim: null, atalho: 'tudo' };

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
};

console.log('✅ painel-fix.js carregado — filtro de período do Painel ativo');
