// ============================================================
// CLINICALEAD — KANBAN COM FILTRO DE DATA + TAGS NO INBOX
// ============================================================

// ── STATE DO KANBAN ──────────────────────────────────────────
let KANBAN_FILTER = {
  dataInicio: null,
  dataFim: null,
};

// ── INICIALIZAR FILTRO (padrão: todos) ───────────────────────
function initKanbanFilter() {
  KANBAN_FILTER.dataInicio = null;
  KANBAN_FILTER.dataFim = null;
}

// ── RENDERIZAR KANBAN COM FILTRO ─────────────────────────────
function renderKanban() {
  let leads = currentLeads();

  // Aplica filtro de data se definido
  if (KANBAN_FILTER.dataInicio && KANBAN_FILTER.dataFim) {
    leads = leads.filter(l => {
      const d = l.created_at?.split('T')[0];
      return d >= KANBAN_FILTER.dataInicio && d <= KANBAN_FILTER.dataFim;
    });
  }

  const total = leads.length;

  // Monta toolbar de filtro
  const toolbarHtml = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-sm);padding:6px 12px;">
        <i class="ti ti-calendar" style="color:var(--gold);font-size:15px;"></i>
        <input type="date" id="kanbanDataInicio" class="form-input" style="border:none;background:transparent;padding:0;width:130px;font-size:13px;" placeholder="Início" onchange="aplicarFiltroKanban()" ${KANBAN_FILTER.dataInicio ? `value="${KANBAN_FILTER.dataInicio}"` : ''}/>
        <span style="color:var(--text-muted);font-size:12px;">até</span>
        <input type="date" id="kanbanDataFim" class="form-input" style="border:none;background:transparent;padding:0;width:130px;font-size:13px;" placeholder="Fim" onchange="aplicarFiltroKanban()" ${KANBAN_FILTER.dataFim ? `value="${KANBAN_FILTER.dataFim}"` : ''}/>
      </div>
      <button class="btn btn-sm" onclick="setKanbanPeriodo(7)">7 dias</button>
      <button class="btn btn-sm" onclick="setKanbanPeriodo(30)">30 dias</button>
      <button class="btn btn-sm" onclick="setKanbanPeriodo(90)">90 dias</button>
      <button class="btn btn-sm" onclick="limparFiltroKanban()" style="${KANBAN_FILTER.dataInicio ? 'color:var(--coral);border-color:var(--coral);' : 'opacity:0.5;'}">
        <i class="ti ti-x"></i> Limpar filtro
      </button>
      ${KANBAN_FILTER.dataInicio ? `<span style="font-size:12px;color:var(--gold);"><i class="ti ti-filter" style="font-size:12px;"></i> ${total} lead${total!==1?'s':''} no período</span>` : `<span style="font-size:12px;color:var(--text-muted);">${total} lead${total!==1?'s':''} no total</span>`}
    </div>
  `;

  if (!leads.length) {
    document.getElementById('kanbanBoard').innerHTML = toolbarHtml + `
      <div style="grid-column:1/-1;">
        <div class="empty-state">
          <div class="empty-icon"><i class="ti ti-layout-kanban"></i></div>
          <div class="empty-title">${KANBAN_FILTER.dataInicio ? 'Nenhum lead neste período' : 'Funil vazio'}</div>
          <div class="empty-desc">${KANBAN_FILTER.dataInicio ? 'Tente ampliar o período ou limpar o filtro.' : 'Cadastre o primeiro lead para ver o funil de vendas em ação.'}</div>
          ${KANBAN_FILTER.dataInicio
            ? `<button class="btn btn-sm" onclick="limparFiltroKanban()"><i class="ti ti-x"></i> Limpar filtro</button>`
            : `<button class="btn btn-primary" onclick="openNewLead()"><i class="ti ti-plus"></i> Cadastrar primeiro lead</button>`
          }
        </div>
      </div>`;
    return;
  }

  const colsHtml = KANBAN_COLS.map(col => {
    const colLeads = leads.filter(l => l.status === col.key);
    const totalCol = colLeads.reduce((s, l) => s + (l.valor || 0), 0);

    return `<div class="kanban-col" data-col="${col.key}">
      <div class="col-head">
        <span class="col-title" style="${col.style}">${col.label}</span>
        <span class="col-count" style="${col.countStyle}">${colLeads.length}</span>
      </div>
      ${totalCol > 0 ? `<div style="font-size:10px;color:var(--gold);font-family:var(--mono);margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border);">R$ ${Number(totalCol).toLocaleString('pt-BR')}</div>` : ''}
      ${colLeads.map(l => {
        const tagProc = l.procedimento ? `<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:var(--gold-pale);color:var(--gold);border:1px solid var(--gold-border);white-space:nowrap;">${l.procedimento.length > 12 ? l.procedimento.slice(0,12)+'…' : l.procedimento}</span>` : '';
        const tagOrigem = l.origem ? `<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:var(--blue-pale);color:#8ABBE8;border:1px solid rgba(91,141,184,0.2);white-space:nowrap;"><i class="ti ${SOURCE_ICON[l.origem]||'ti-dots'}" style="font-size:9px;margin-right:2px;"></i>${l.origem}</span>` : '';
        return `<div class="k-card" onclick="openLeadDetail('${l.id}')" draggable="true" data-lead="${l.id}">
          <div class="k-card-name">${l.nome}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">${tagProc}${tagOrigem}</div>
          <div class="k-card-foot">
            <span class="k-source" style="font-size:10px;color:var(--text-muted);">${new Date(l.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</span>
            ${l.valor ? `<span class="k-val">R$ ${Number(l.valor).toLocaleString('pt-BR')}</span>` : ''}
          </div>
        </div>`;
      }).join('') || '<div style="padding:12px 0;text-align:center;font-size:11px;color:var(--text-muted);">Nenhum lead</div>'}
    </div>`;
  }).join('');

  document.getElementById('kanbanBoard').innerHTML = toolbarHtml + `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;align-items:start;">${colsHtml}</div>`;
  initDragDrop();
}

// ── APLICAR FILTRO ────────────────────────────────────────────
function aplicarFiltroKanban() {
  const ini = document.getElementById('kanbanDataInicio')?.value;
  const fim = document.getElementById('kanbanDataFim')?.value;
  KANBAN_FILTER.dataInicio = ini || null;
  KANBAN_FILTER.dataFim = fim || null;
  renderKanban();
}

// ── ATALHOS DE PERÍODO ────────────────────────────────────────
function setKanbanPeriodo(dias) {
  const hoje = new Date();
  const inicio = new Date();
  inicio.setDate(hoje.getDate() - dias);
  KANBAN_FILTER.dataFim = hoje.toISOString().split('T')[0];
  KANBAN_FILTER.dataInicio = inicio.toISOString().split('T')[0];
  renderKanban();
}

// ── LIMPAR FILTRO ─────────────────────────────────────────────
function limparFiltroKanban() {
  KANBAN_FILTER.dataInicio = null;
  KANBAN_FILTER.dataFim = null;
  renderKanban();
}

// ── TAGS NO INBOX ─────────────────────────────────────────────
// Sobrescreve renderInboxList para adicionar tags [procedimento] [origem]
const _origRenderInboxList = typeof renderInboxList === 'function' ? renderInboxList : null;

function renderInboxList() {
  let chats = INBOX.chats;
  if (INBOX.filter === 'leads') chats = chats.filter(c => c.lead);
  if (INBOX.filter === 'unread') chats = chats.filter(c => c.unread > 0);
  if (INBOX.search) chats = chats.filter(c =>
    c.name.toLowerCase().includes(INBOX.search.toLowerCase()) ||
    c.phone.includes(INBOX.search)
  );

  if (!chats.length) {
    document.getElementById('inboxList').innerHTML =
      '<div style="padding:24px;text-align:center;color:var(--text-secondary);font-size:13px;">Nenhuma conversa encontrada</div>';
    return;
  }

  document.getElementById('inboxList').innerHTML = chats.map(c => {
    const isActive = INBOX.activeChat?.id === c.id;
    const timeStr = formatMsgTime(c.time);
    const ini = c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    // Tags de procedimento e origem
    const tagProc = c.lead?.procedimento
      ? `<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:var(--gold-pale);color:var(--gold);border:1px solid var(--gold-border);white-space:nowrap;">${c.lead.procedimento.length > 10 ? c.lead.procedimento.slice(0,10)+'…' : c.lead.procedimento}</span>`
      : '';
    const tagOrigem = c.lead?.origem
      ? `<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:var(--blue-pale);color:#8ABBE8;border:1px solid rgba(91,141,184,0.2);white-space:nowrap;"><i class="ti ${SOURCE_ICON[c.lead.origem]||'ti-dots'}" style="font-size:9px;margin-right:2px;"></i>${c.lead.origem}</span>`
      : '';

    return `<div class="inbox-item ${isActive ? 'active' : ''} ${c.lead ? 'is-lead' : ''}" onclick="openChat('${c.id}')">
      <div class="inbox-avatar">${ini}</div>
      <div class="inbox-item-info">
        <div class="inbox-item-name" style="flex-wrap:wrap;gap:4px;">
          <span>${c.name}</span>
          ${tagProc}${tagOrigem}
        </div>
        <div class="inbox-item-preview">${c.lastMsg}</div>
      </div>
      <div class="inbox-item-meta">
        <span class="inbox-item-time">${timeStr}</span>
        ${c.unread > 0 ? `<span class="inbox-unread">${c.unread}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

console.log('✅ kanban-fix.js carregado com sucesso');
