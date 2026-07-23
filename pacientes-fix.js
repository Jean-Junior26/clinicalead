// ============================================================
// CLINICALEAD — PÁGINA DE PACIENTES
// Todo lead com status "fechado" vira paciente automaticamente.
// Busca por nome, filtro por procedimento e por período de
// fechamento (usa status_alterado_em, com fallback p/ created_at).
// ============================================================

let PAC = { busca: '', proc: 'all', inicio: null, fim: null, atalho: 'tudo' };

function pacIsoLocal(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}
function pacDiasAtras(n) { const d = new Date(); d.setDate(d.getDate() - n); return pacIsoLocal(d); }

// ── Lista de pacientes (leads fechados) ──────────────────────
function getPacientes() {
  return currentLeads()
    .filter(l => l.status === 'fechado')
    .sort((a, b) => new Date(b.status_alterado_em || b.created_at) - new Date(a.status_alterado_em || a.created_at));
}

function pacDataFechamento(l) {
  return (l.status_alterado_em || l.created_at || '').split('T')[0];
}

// ── Filtros ──────────────────────────────────────────────────
function setPacPeriodo(atalho) {
  PAC.atalho = atalho;
  if (atalho === 'tudo') { PAC.inicio = null; PAC.fim = null; }
  else { PAC.inicio = pacDiasAtras(Number(atalho)); PAC.fim = pacIsoLocal(new Date()); }
  renderPacientes();
}

function setPacDatas() {
  PAC.inicio = document.getElementById('pacDataInicio')?.value || null;
  PAC.fim = document.getElementById('pacDataFim')?.value || pacIsoLocal(new Date());
  PAC.atalho = 'custom';
  renderPacientes();
}

// ⚠️ AJUSTE 22/07: renderPacientes() reconstrói a página inteira (via
// innerHTML) a cada tecla digitada — isso DESTRÓI o <input> de busca e
// cria um novo, fazendo o campo perder o foco a cada letra (só a 1ª
// "grudava", da 2ª em diante o teclado não tinha mais pra onde mandar).
// Mesmo padrão já corrigido em orcSetBusca (orcamentos-lista-fix.js):
// guarda se o campo estava focado e a posição do cursor ANTES de
// reconstruir, e devolve os dois pro novo input DEPOIS.
function setPacBusca(v) {
  PAC.busca = v;
  const inputEl = document.querySelector('#page-pacientes .search-box input');
  const focado = document.activeElement === inputEl;
  const cursor = focado ? inputEl.selectionStart : null;
  renderPacientes();
  if (focado) {
    const novo = document.querySelector('#page-pacientes .search-box input');
    if (novo) { novo.focus(); novo.setSelectionRange(cursor, cursor); }
  }
}
function setPacProc(v) { PAC.proc = v; renderPacientes(); }

// ── Renderização ─────────────────────────────────────────────
function renderPacientes() {
  const page = document.getElementById('page-pacientes');
  if (!page) return;

  let pacientes = getPacientes();

  // Popula o select de procedimentos com os que existem de fato
  const procs = [...new Set(pacientes.map(l => l.procedimento).filter(Boolean))].sort();

  // Aplica filtros
  if (PAC.busca) {
    const b = PAC.busca.toLowerCase();
    pacientes = pacientes.filter(l =>
      (l.nome || '').toLowerCase().includes(b) ||
      (l.telefone || '').includes(b)
    );
  }
  if (PAC.proc !== 'all') pacientes = pacientes.filter(l => l.procedimento === PAC.proc);
  if (PAC.inicio) {
    pacientes = pacientes.filter(l => {
      const d = pacDataFechamento(l);
      return d && d >= PAC.inicio && d <= PAC.fim;
    });
  }

  const totalValor = pacientes.reduce((s, l) => s + (l.valor || 0), 0);

  page.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Pacientes</h2>
        <p>${pacientes.length} paciente${pacientes.length !== 1 ? 's' : ''} · ${fmtCurrency(totalValor)} em tratamentos fechados</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick="openNewLead()"><i class="ti ti-plus"></i> Novo lead</button>
      </div>
    </div>

    <div class="toolbar" style="flex-wrap:wrap;gap:10px;">
      <div class="search-box" style="max-width:280px;flex:1;min-width:200px;">
        <i class="ti ti-search"></i>
        <input type="text" placeholder="Buscar por nome ou telefone..." value="${PAC.busca.replace(/"/g, '&quot;')}" oninput="setPacBusca(this.value)"/>
      </div>
      <select class="filter-select" onchange="setPacProc(this.value)">
        <option value="all">Todos os procedimentos</option>
        ${procs.map(p => `<option value="${p.replace(/"/g, '&quot;')}" ${PAC.proc === p ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
      <div style="display:flex;align-items:center;gap:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-sm,10px);padding:6px 12px;">
        <i class="ti ti-calendar" style="color:var(--gold);font-size:15px;"></i>
        <input type="date" id="pacDataInicio" class="form-input" style="border:none;background:transparent;padding:0;width:122px;font-size:13px;" value="${PAC.inicio || ''}" onchange="setPacDatas()"/>
        <span style="color:var(--text-muted);font-size:12px;">até</span>
        <input type="date" id="pacDataFim" class="form-input" style="border:none;background:transparent;padding:0;width:122px;font-size:13px;" value="${PAC.fim || ''}" onchange="setPacDatas()"/>
      </div>
      <button class="btn btn-sm" onclick="setPacPeriodo('30')" style="${PAC.atalho === '30' ? 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);' : ''}">30 dias</button>
      <button class="btn btn-sm" onclick="setPacPeriodo('90')" style="${PAC.atalho === '90' ? 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);' : ''}">90 dias</button>
      <button class="btn btn-sm" onclick="setPacPeriodo('365')" style="${PAC.atalho === '365' ? 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);' : ''}">1 ano</button>
      <button class="btn btn-sm" onclick="setPacPeriodo('tudo')" style="${PAC.atalho === 'tudo' ? 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);' : ''}">Tudo</button>
    </div>

    <div class="card">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead style="background:var(--bg-elevated);">
            <tr>
              ${['Paciente', 'Procedimento', 'Valor', 'Fechado em', 'Origem', 'Ações'].map(h =>
                `<th style="padding:10px 16px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--gold-dim);text-align:left;border-bottom:1px solid var(--border);">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${pacientes.length ? pacientes.map(l => {
              const dataF = pacDataFechamento(l);
              const dataFmt = dataF ? new Date(dataF + 'T12:00').toLocaleDateString('pt-BR') : '—';
              return `<tr>
                <td style="padding:10px 16px;border-bottom:1px solid var(--border-subtle);">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div class="avatar" style="${avatarStyle(l.nome)}">${initials(l.nome)}</div>
                    <div><div class="td-bold">${l.nome}</div><div class="td-muted">${l.telefone || '—'}</div></div>
                  </div>
                </td>
                <td style="padding:10px 16px;border-bottom:1px solid var(--border-subtle);color:var(--text-secondary);">${l.procedimento || '—'}</td>
                <td style="padding:10px 16px;border-bottom:1px solid var(--border-subtle);" class="td-mono">${l.valor ? 'R$ ' + Number(l.valor).toLocaleString('pt-BR') : '—'}</td>
                <td style="padding:10px 16px;border-bottom:1px solid var(--border-subtle);" class="td-muted">${dataFmt}</td>
                <td style="padding:10px 16px;border-bottom:1px solid var(--border-subtle);"><span style="font-size:12px;color:var(--text-secondary);"><i class="ti ${SOURCE_ICON[l.origem] || 'ti-dots'}" style="margin-right:4px;"></i>${l.origem || '—'}</span></td>
                <td style="padding:10px 16px;border-bottom:1px solid var(--border-subtle);">
                  <div style="display:flex;gap:6px;">
                    <button class="btn btn-sm btn-ghost btn-icon" title="Orçamentos" onclick="openOrcamento('${l.id}')"><i class="ti ti-file-invoice" style="color:var(--gold);"></i></button>
                    <button class="btn btn-sm btn-ghost btn-icon" title="Conversa no Inbox" onclick="tarefaWhats('${(l.telefone || '').replace(/\D/g, '')}')"><i class="ti ti-message-circle" style="color:#25D366;"></i></button>
                    <button class="btn btn-sm btn-ghost btn-icon" title="Editar" onclick="openEditLead('${l.id}')"><i class="ti ti-edit"></i></button>
                    <button class="btn btn-sm btn-ghost btn-icon" title="Ver" onclick="openLeadDetail('${l.id}')"><i class="ti ti-eye"></i></button>
                  </div>
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary);">Nenhum paciente encontrado.<br><span style="font-size:12px;">Quando um lead for marcado como <strong>Fechado</strong>, ele aparece aqui automaticamente. 😉</span></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Engata no roteador de páginas ────────────────────────────
(function () {
  if (typeof renderPage !== 'function') {
    console.error('[pacientes] renderPage não encontrado');
    return;
  }
  const _renderPageOriginal = renderPage;
  renderPage = function (id) {
    if (id === 'pacientes') { renderPacientes(); return; }
    return _renderPageOriginal(id);
  };
})();

console.log('✅ pacientes-fix.js carregado — página de Pacientes ativa');
