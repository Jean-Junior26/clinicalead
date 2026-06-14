// ============================================================
// CLINICALEAD — GESTÃO DE EQUIPE (multiusuário + permissões)
// Adiciona a página "Equipe" (só para dono/admin):
//   • Criar colaborador (nome, email, senha) com permissões
//   • Listar colaboradores da clínica ativa
//   • Editar permissões / remover
// As 10 áreas controláveis estão em AREAS_PERMISSAO.
// ============================================================

const AREAS_PERMISSAO = [
  { chave: 'dashboard',    label: 'Dashboard',        icon: 'ti-layout-dashboard' },
  { chave: 'leads',        label: 'Leads',            icon: 'ti-users' },
  { chave: 'kanban',       label: 'Funil de Vendas',  icon: 'ti-layout-kanban' },
  { chave: 'agenda',       label: 'Agenda',           icon: 'ti-calendar' },
  { chave: 'pacientes',    label: 'Pacientes',        icon: 'ti-user-heart' },
  { chave: 'inbox',        label: 'Inbox WhatsApp',   icon: 'ti-message-circle' },
  { chave: 'automacoes',   label: 'Automações',       icon: 'ti-brand-whatsapp' },
  { chave: 'relatorios',   label: 'Relatórios',       icon: 'ti-chart-bar' },
  { chave: 'financeiro',   label: 'Financeiro',       icon: 'ti-cash' },
  { chave: 'procedimentos',label: 'Procedimentos',    icon: 'ti-dental' },
];

let EQUIPE = { colaboradores: [] };

// ── É dono da clínica ativa ou admin geral? ──────────────────
function podeGerenciarEquipe() {
  const clinic = currentClinic();
  if (!clinic) return false;
  const isAdminGeral = STATE.profile?.role === 'admin';
  const ehDono = clinic.user_id === STATE.user?.id;
  return isAdminGeral || ehDono;
}

// ── Injeta o item "Equipe" no menu (uma vez) ─────────────────
(function injetarMenuEquipe() {
  function tentar() {
    if (document.querySelector('[data-page="equipe"]')) return true;
    const ancora = document.querySelector('[data-page="clinicas"]') || document.querySelector('[data-page="meu-plano"]');
    if (!ancora) return false;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.setAttribute('data-page', 'equipe');
    btn.setAttribute('onclick', "showPage('equipe',this)");
    btn.innerHTML = '<i class="ti ti-users-group"></i> Equipe';
    btn.style.display = 'none'; // mostrado só p/ quem pode gerenciar
    ancora.insertAdjacentElement('beforebegin', btn);
    return true;
  }
  if (!tentar()) {
    const iv = setInterval(() => { if (tentar()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();

// ── Cria a página "Equipe" no container de páginas ───────────
function equipeGarantirPagina() {
  if (document.getElementById('page-equipe')) return;
  const ref = document.getElementById('page-clinicas') || document.getElementById('page-dashboard');
  if (!ref) return;
  const page = document.createElement('div');
  page.id = 'page-equipe';
  page.className = 'page';
  page.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
      <div>
        <h1 style="font-size:22px;">Equipe</h1>
        <p style="color:var(--text-secondary);font-size:13px;">Colaboradores da clínica e suas permissões</p>
      </div>
      <button class="btn btn-primary" onclick="abrirNovoColaborador()"><i class="ti ti-user-plus"></i> Novo colaborador</button>
    </div>
    <div id="equipeLista"></div>`;
  ref.parentElement.appendChild(page);
}

// ── Renderiza a página ───────────────────────────────────────
async function renderEquipe() {
  equipeGarantirPagina();
  const lista = document.getElementById('equipeLista');
  if (!lista) return;

  if (!podeGerenciarEquipe()) {
    lista.innerHTML = '<div class="card" style="padding:24px;text-align:center;color:var(--text-secondary);">Apenas o responsável da clínica pode gerenciar a equipe.</div>';
    return;
  }

  lista.innerHTML = '<div style="padding:20px;color:var(--text-secondary);font-size:13px;">Carregando equipe...</div>';
  const clinic = currentClinic();
  const { data, error } = await db.from('clinic_users').select('*').eq('clinic_id', clinic.id).order('created_at', { ascending: true });
  if (error) { lista.innerHTML = `<div class="card" style="padding:20px;color:var(--coral);">Erro ao carregar: ${error.message}</div>`; return; }
  EQUIPE.colaboradores = data || [];

  if (!EQUIPE.colaboradores.length) {
    lista.innerHTML = `
      <div class="card" style="padding:30px;text-align:center;">
        <i class="ti ti-users-group" style="font-size:40px;color:var(--text-muted);"></i>
        <div style="margin-top:10px;font-size:14px;color:var(--text-secondary);">Nenhum colaborador ainda.</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Clique em "Novo colaborador" para adicionar sua recepção, dentistas e equipe.</div>
      </div>`;
    return;
  }

  lista.innerHTML = EQUIPE.colaboradores.map(c => {
    const perms = c.permissoes || {};
    const ativos = AREAS_PERMISSAO.filter(a => perms[a.chave]).map(a => a.label);
    const resumoPerms = ativos.length === AREAS_PERMISSAO.length ? 'Acesso total'
      : ativos.length === 0 ? 'Sem áreas liberadas'
      : ativos.join(' · ');
    return `
      <div class="card" style="padding:16px;margin-bottom:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
        <div class="avatar" style="${avatarStyle(c.nome || c.email)}">${initials(c.nome || c.email)}</div>
        <div style="flex:1;min-width:180px;">
          <div style="font-size:14px;font-weight:600;">${c.nome || '(sem nome)'} ${c.ativo ? '' : '<span style="font-size:10px;color:var(--coral);">(inativo)</span>'}</div>
          <div style="font-size:12px;color:var(--text-muted);">${c.email || ''}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${resumoPerms}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm" onclick="editarPermissoes('${c.id}')"><i class="ti ti-adjustments"></i> Permissões</button>
          <button class="btn btn-sm btn-danger" onclick="removerColaborador('${c.id}')"><i class="ti ti-trash"></i></button>
        </div>
      </div>`;
  }).join('');
}

// ── Modal: novo colaborador ──────────────────────────────────
function abrirNovoColaborador() {
  if (!podeGerenciarEquipe()) { toast('Sem permissão', 'error'); return; }
  if (!document.getElementById('modalNovoColab')) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'modalNovoColab';
    ov.innerHTML = `
      <div class="modal" style="max-width:540px;width:96vw;">
        <div class="modal-header">
          <h3><i class="ti ti-user-plus" style="margin-right:8px;color:var(--gold);"></i>Novo colaborador</h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('modalNovoColab')"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="colabNome" placeholder="Ex: Maria Recepção"/></div>
          <div class="form-group"><label class="form-label">Email (será o login)</label><input class="form-input" id="colabEmail" type="email" placeholder="maria@email.com"/></div>
          <div class="form-group"><label class="form-label">Senha provisória</label><input class="form-input" id="colabSenha" placeholder="mínimo 6 caracteres"/><div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Combine essa senha com o colaborador. Ele pode trocá-la depois.</div></div>
          <div class="form-group">
            <label class="form-label">O que esse colaborador pode acessar?</label>
            <div style="display:flex;gap:8px;margin-bottom:8px;">
              <button class="btn btn-sm" type="button" onclick="colabMarcarTodas(true)">Marcar todas</button>
              <button class="btn btn-sm" type="button" onclick="colabMarcarTodas(false)">Desmarcar todas</button>
            </div>
            <div id="colabPermsGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
              ${AREAS_PERMISSAO.map(a => `
                <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-elevated);border-radius:8px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" class="colab-perm" data-area="${a.chave}" checked/>
                  <i class="ti ${a.icon}" style="color:var(--text-secondary);"></i>${a.label}
                </label>`).join('')}
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">💡 Dica: desmarque <strong>Financeiro</strong> para a recepção não ver orçamentos e pagamentos.</div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" onclick="closeModal('modalNovoColab')">Cancelar</button>
          <button class="btn btn-primary" id="btnSalvarColab" onclick="salvarNovoColaborador()"><i class="ti ti-check"></i> Criar colaborador</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }
  // limpa campos
  document.getElementById('colabNome').value = '';
  document.getElementById('colabEmail').value = '';
  document.getElementById('colabSenha').value = '';
  document.querySelectorAll('.colab-perm').forEach(c => { c.checked = c.dataset.area !== 'financeiro' && c.dataset.area !== 'automacoes'; });
  openModal('modalNovoColab');
}

function colabMarcarTodas(valor) {
  document.querySelectorAll('.colab-perm').forEach(c => c.checked = valor);
}

function coletarPermissoes() {
  const perms = {};
  document.querySelectorAll('.colab-perm').forEach(c => { perms[c.dataset.area] = c.checked; });
  return perms;
}

async function salvarNovoColaborador() {
  const nome = document.getElementById('colabNome').value.trim();
  const email = document.getElementById('colabEmail').value.trim();
  const senha = document.getElementById('colabSenha').value;
  if (!nome || !email || !senha) { toast('Preencha nome, email e senha', 'error'); return; }
  if (senha.length < 6) { toast('A senha precisa de ao menos 6 caracteres', 'error'); return; }

  const clinic = currentClinic();
  const btn = document.getElementById('btnSalvarColab');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Criando...'; }

  try {
    const resp = await fetch('/api/criar-colaborador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requesterId: STATE.user?.id,
        clinicId: clinic.id,
        nome, email, senha,
        permissoes: coletarPermissoes(),
      }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) { toast(data.error || 'Erro ao criar colaborador', 'error'); return; }
    toast(`Colaborador ${nome} criado! ✓`);
    closeModal('modalNovoColab');
    renderEquipe();
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Criar colaborador'; }
  }
}

// ── Editar permissões de um colaborador existente ────────────
function editarPermissoes(colabId) {
  const c = EQUIPE.colaboradores.find(x => x.id === colabId);
  if (!c) return;
  const perms = c.permissoes || {};
  if (!document.getElementById('modalEditPerms')) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'modalEditPerms';
    ov.innerHTML = `
      <div class="modal" style="max-width:500px;width:96vw;">
        <div class="modal-header">
          <h3><i class="ti ti-adjustments" style="margin-right:8px;color:var(--gold);"></i>Permissões</h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('modalEditPerms')"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" id="editPermsBody" style="max-height:70vh;overflow-y:auto;"></div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" onclick="closeModal('modalEditPerms')">Cancelar</button>
          <button class="btn btn-primary" onclick="salvarPermissoesEdit()"><i class="ti ti-check"></i> Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }
  document.getElementById('editPermsBody').dataset.colabId = colabId;
  document.getElementById('editPermsBody').innerHTML = `
    <div style="font-size:13px;margin-bottom:10px;">${c.nome || c.email}</div>
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <button class="btn btn-sm" type="button" onclick="editPermMarcar(true)">Marcar todas</button>
      <button class="btn btn-sm" type="button" onclick="editPermMarcar(false)">Desmarcar todas</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
      ${AREAS_PERMISSAO.map(a => `
        <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-elevated);border-radius:8px;cursor:pointer;font-size:13px;">
          <input type="checkbox" class="edit-perm" data-area="${a.chave}" ${perms[a.chave] ? 'checked' : ''}/>
          <i class="ti ${a.icon}" style="color:var(--text-secondary);"></i>${a.label}
        </label>`).join('')}
    </div>`;
  openModal('modalEditPerms');
}

function editPermMarcar(valor) {
  document.querySelectorAll('.edit-perm').forEach(c => c.checked = valor);
}

async function salvarPermissoesEdit() {
  const colabId = document.getElementById('editPermsBody').dataset.colabId;
  const perms = {};
  document.querySelectorAll('.edit-perm').forEach(c => { perms[c.dataset.area] = c.checked; });
  const { error } = await db.from('clinic_users').update({ permissoes: perms }).eq('id', colabId);
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }
  toast('Permissões atualizadas! ✓');
  closeModal('modalEditPerms');
  renderEquipe();
}

// ── Remover colaborador ──────────────────────────────────────
async function removerColaborador(colabId) {
  const c = EQUIPE.colaboradores.find(x => x.id === colabId);
  if (!c) return;
  if (!confirm(`Remover o acesso de ${c.nome || c.email}?\n\nO colaborador perderá o acesso a esta clínica.`)) return;
  const { error } = await db.from('clinic_users').delete().eq('id', colabId);
  if (error) { toast('Erro ao remover: ' + error.message, 'error'); return; }
  toast('Colaborador removido.');
  renderEquipe();
}

// ── Engata no showPage ───────────────────────────────────────
(function () {
  if (typeof showPage !== 'function') { console.error('[equipe] showPage não encontrado'); return; }
  const _orig = showPage;
  showPage = function (id, el) {
    _orig(id, el);
    // mostra/esconde o item de menu conforme permissão
    const navEquipe = document.querySelector('[data-page="equipe"]');
    if (navEquipe) navEquipe.style.display = podeGerenciarEquipe() ? '' : 'none';
    if (id === 'equipe') renderEquipe();
  };
})();

console.log('✅ colaboradores-fix.js carregado — gestão de equipe ativa');
