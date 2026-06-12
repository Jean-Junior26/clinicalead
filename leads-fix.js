// ============================================================
// CLINICALEAD — FILTRO DE PERÍODO NA PÁGINA DE LEADS
// Datas personalizadas + atalhos (7/30/90 dias/Tudo), combinando
// com os filtros existentes de status e busca.
// ============================================================

let LEADSF = { inicio: null, fim: null, atalho: 'tudo' };

function lfIsoLocal(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}
function lfHoje() { return lfIsoLocal(new Date()); }
function lfDiasAtras(n) { const d = new Date(); d.setDate(d.getDate() - n); return lfIsoLocal(d); }

// ── Reaplica os filtros atuais (status + busca + período) ────
function lfReRender() {
  const status = document.getElementById('filterStatus')?.value || 'all';
  const busca = document.getElementById('searchLeads')?.value || '';
  renderLeads(status, busca);
}

function setLeadsPeriodo(atalho) {
  LEADSF.atalho = atalho;
  if (atalho === 'tudo') {
    LEADSF.inicio = null;
    LEADSF.fim = null;
  } else {
    LEADSF.inicio = lfDiasAtras(Number(atalho));
    LEADSF.fim = lfHoje();
  }
  lfReRender();
}

function setLeadsDatas() {
  LEADSF.inicio = document.getElementById('leadsDataInicio')?.value || null;
  LEADSF.fim = document.getElementById('leadsDataFim')?.value || lfHoje();
  LEADSF.atalho = 'custom';
  lfReRender();
}

// ── Monta os controles na toolbar (uma vez) ──────────────────
function montarFiltroDataLeads() {
  if (document.getElementById('leadsFiltroData')) {
    atualizarBotoesFiltroLeads();
    return;
  }
  const toolbar = document.querySelector('#page-leads .toolbar');
  if (!toolbar) return;

  const wrap = document.createElement('div');
  wrap.id = 'leadsFiltroData';
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-sm,10px);padding:6px 12px;">
      <i class="ti ti-calendar" style="color:var(--gold);font-size:15px;"></i>
      <input type="date" id="leadsDataInicio" class="form-input" style="border:none;background:transparent;padding:0;width:122px;font-size:13px;" onchange="setLeadsDatas()"/>
      <span style="color:var(--text-muted);font-size:12px;">até</span>
      <input type="date" id="leadsDataFim" class="form-input" style="border:none;background:transparent;padding:0;width:122px;font-size:13px;" onchange="setLeadsDatas()"/>
    </div>
    <button class="btn btn-sm" id="leadsBtn7" onclick="setLeadsPeriodo('7')">7 dias</button>
    <button class="btn btn-sm" id="leadsBtn30" onclick="setLeadsPeriodo('30')">30 dias</button>
    <button class="btn btn-sm" id="leadsBtn90" onclick="setLeadsPeriodo('90')">90 dias</button>
    <button class="btn btn-sm" id="leadsBtnTudo" onclick="setLeadsPeriodo('tudo')">Tudo</button>
  `;
  toolbar.appendChild(wrap);
  atualizarBotoesFiltroLeads();
}

function atualizarBotoesFiltroLeads() {
  const mapa = { '7': 'leadsBtn7', '30': 'leadsBtn30', '90': 'leadsBtn90', tudo: 'leadsBtnTudo' };
  Object.entries(mapa).forEach(([atalho, id]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const ativo = LEADSF.atalho === atalho;
    btn.style.background = ativo ? 'var(--gold-pale)' : '';
    btn.style.borderColor = ativo ? 'var(--gold-border)' : '';
    btn.style.color = ativo ? 'var(--gold)' : '';
  });
  const ini = document.getElementById('leadsDataInicio');
  const fim = document.getElementById('leadsDataFim');
  if (ini) ini.value = LEADSF.inicio || '';
  if (fim) fim.value = LEADSF.fim || '';
}

// ── Substitui o renderLeads com a versão que filtra por data ─
renderLeads = function (filter = 'all', search = '') {
  montarFiltroDataLeads();

  let leads = currentLeads();
  if (filter !== 'all') leads = leads.filter(l => l.status === filter);
  if (search) leads = leads.filter(l =>
    (l.nome || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.procedimento || '').toLowerCase().includes(search.toLowerCase())
  );
  // Filtro de período (data de criação do lead)
  if (LEADSF.inicio) {
    leads = leads.filter(l => {
      const d = l.created_at?.split('T')[0];
      return d && d >= LEADSF.inicio && d <= LEADSF.fim;
    });
  }

  document.getElementById('leadsCount').textContent = leads.length + ' lead' + (leads.length !== 1 ? 's' : '');
  document.getElementById('leadsTableBody').innerHTML = leads.length ? leads.map(l => `
    <tr>
      <td><div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="${avatarStyle(l.nome)}">${initials(l.nome)}</div><div><div class="td-bold">${l.nome}</div><div class="td-muted">${l.telefone || '—'}</div></div></div></td>
      <td style="color:var(--text-secondary);">${l.procedimento || '—'}</td>
      <td>${badgeHtml(l.status)}</td>
      <td class="td-mono">${l.valor ? 'R$ ' + Number(l.valor).toLocaleString('pt-BR') : '—'}</td>
      <td><span style="font-size:12px;color:var(--text-secondary);"><i class="ti ${SOURCE_ICON[l.origem] || 'ti-dots'}" style="margin-right:4px;"></i>${l.origem || '—'}</span></td>
      <td class="td-muted">${fmtDate(l.created_at)}</td>
      <td><div style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-ghost btn-icon" title="Orçamentos" onclick="openOrcamento('${l.id}')"><i class="ti ti-file-invoice" style="color:var(--gold);"></i></button>
        <button class="btn btn-sm btn-ghost btn-icon" title="WhatsApp" onclick="openSendWA('${l.id}')"><i class="ti ti-brand-whatsapp" style="color:var(--gold);"></i></button>
        <button class="btn btn-sm btn-ghost btn-icon" title="Editar" onclick="openEditLead('${l.id}')"><i class="ti ti-edit"></i></button>
        <button class="btn btn-sm btn-ghost btn-icon" title="Ver" onclick="openLeadDetail('${l.id}')"><i class="ti ti-eye"></i></button>
      </div></td>
    </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-secondary);">Nenhum lead encontrado no período</td></tr>';
};

console.log('✅ leads-fix.js carregado — filtro de período dos Leads ativo');
