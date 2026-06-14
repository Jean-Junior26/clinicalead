// ============================================================
// CLINICALEAD — APLICAÇÃO DE PERMISSÕES (multiusuário)
// Quando um COLABORADOR loga:
//   1. Descobre a clínica dele via clinic_users (ele não é dono)
//   2. Carrega as permissões e esconde as seções não liberadas
//   3. Bloqueia acesso direto a páginas proibidas
// Dono e admin geral não são afetados (veem tudo).
// ============================================================

let PERMISSOES = { ehColaborador: false, areas: null, clinicId: null };

// Mapeia data-page -> chave de permissão
const PAGE_PERM = {
  dashboard: 'dashboard',
  leads: 'leads',
  kanban: 'kanban',
  agenda: 'agenda',
  pacientes: 'pacientes',
  inbox: 'inbox',
  automacoes: 'automacoes',
  relatorios: 'relatorios',
  procedimentos: 'procedimentos',
  // financeiro não é uma página única: controla seções dentro de relatórios/orçamentos
};

// ── Descobre se o usuário logado é colaborador e carrega permissões ──
async function carregarPermissoesColaborador() {
  PERMISSOES = { ehColaborador: false, areas: null, clinicId: null };

  // Admin geral nunca é colaborador
  if (STATE.profile?.role === 'admin' || STATE.profile?.role === 'administrador') return;

  // Busca vínculo na clinic_users
  const { data, error } = await db.from('clinic_users')
    .select('clinic_id, permissoes, ativo, nome')
    .eq('user_id', STATE.user.id)
    .eq('ativo', true)
    .maybeSingle();

  if (error || !data) return; // não é colaborador (é dono comum)

  PERMISSOES.ehColaborador = true;
  PERMISSOES.areas = data.permissoes || {};
  PERMISSOES.clinicId = data.clinic_id;
}

// ── Carrega a clínica do colaborador (ele não é dono via user_id) ──
async function carregarClinicaColaborador() {
  if (!PERMISSOES.ehColaborador || !PERMISSOES.clinicId) return;
  const { data } = await db.from('clinicas').select('*').eq('id', PERMISSOES.clinicId);
  STATE.clinics = data || [];
  if (typeof renderClinicSwitcher === 'function') renderClinicSwitcher();
}

// ── Tem permissão para a área? ───────────────────────────────
function temPermissao(area) {
  if (!PERMISSOES.ehColaborador) return true; // dono/admin: tudo liberado
  return !!(PERMISSOES.areas && PERMISSOES.areas[area]);
}

// ── Esconde os itens de menu não permitidos ──────────────────
function aplicarPermissoesNoMenu() {
  if (!PERMISSOES.ehColaborador) return; // só afeta colaborador

  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    const page = item.getAttribute('data-page');

    // Páginas exclusivas do admin/dono: colaborador nunca vê
    if (['clinicas', 'meu-plano', 'equipe'].includes(page)) {
      item.style.display = 'none';
      return;
    }

    const perm = PAGE_PERM[page];
    if (perm && !temPermissao(perm)) {
      item.style.display = 'none';
    }
  });

  // Esconde seções de "Financeiro" dentro de Relatórios (se não tiver permissão)
  if (!temPermissao('financeiro')) {
    document.body.classList.add('sem-financeiro');
  }
}

// CSS para ocultar elementos financeiros quando o colaborador não tem acesso
(function injetarCSSFinanceiro() {
  if (document.getElementById('permFinCSS')) return;
  const st = document.createElement('style');
  st.id = 'permFinCSS';
  st.textContent = `
    body.sem-financeiro #relFinanceiro,
    body.sem-financeiro [data-financeiro] { display: none !important; }`;
  document.head.appendChild(st);
})();

// ── Bloqueia navegação para páginas proibidas ────────────────
(function () {
  if (typeof showPage !== 'function') return;
  const _orig = showPage;
  showPage = function (id, el) {
    if (PERMISSOES.ehColaborador) {
      // bloqueios fixos
      if (['clinicas', 'meu-plano', 'equipe'].includes(id)) {
        toast('Você não tem acesso a esta área', 'error');
        return;
      }
      const perm = PAGE_PERM[id];
      if (perm && !temPermissao(perm)) {
        toast('Você não tem acesso a esta área', 'error');
        return;
      }
    }
    return _orig(id, el);
  };
})();

// ── Engata no fluxo de login (intercepta loadApp) ────────────
(function () {
  if (typeof loadApp !== 'function') { console.error('[permissoes] loadApp não encontrado'); return; }
  const _origLoadApp = loadApp;
  loadApp = async function (user) {
    // 1. ANTES de tudo: descobre se é colaborador e carrega permissões/clínica
    STATE.user = user; // garante que STATE.user existe para a consulta
    try {
      await carregarPermissoesColaborador();
    } catch (e) { console.error('[permissoes] erro ao carregar:', e); }

    // 2. Roda o loadApp original (vai carregar clínicas, leads, etc)
    await _origLoadApp(user);

    // 3. Se for colaborador, aplica tudo
    if (PERMISSOES.ehColaborador) {
      try {
        await carregarClinicaColaborador();
        aplicarPermissoesNoMenu();
        // Leva o colaborador para a primeira página permitida
        const primeira = ['dashboard', 'leads', 'inbox', 'agenda', 'kanban', 'pacientes', 'relatorios', 'procedimentos', 'automacoes']
          .find(p => temPermissao(p));
        if (primeira) showPage(primeira);
      } catch (e) {
        console.error('[permissoes] erro ao aplicar:', e);
      }
    }
  };
})();

// ── Bloqueia o wizard de criar clínica para colaboradores ────
(function () {
  if (typeof openAddClinicWizard !== 'function') return;
  const _origWizard = openAddClinicWizard;
  openAddClinicWizard = function (...args) {
    if (PERMISSOES.ehColaborador) {
      // colaborador nunca cria clínica
      return;
    }
    return _origWizard.apply(this, args);
  };
})();

// ── Intercepta loadClinics: colaborador pega clínica via clinic_users ──
(function () {
  if (typeof loadClinics !== 'function') return;
  const _origLoadClinics = loadClinics;
  loadClinics = async function (...args) {
    if (PERMISSOES.ehColaborador && PERMISSOES.clinicId) {
      const { data } = await db.from('clinicas').select('*').eq('id', PERMISSOES.clinicId);
      STATE.clinics = data || [];
      const badge = document.getElementById('navClinicasBadge');
      if (badge) badge.textContent = STATE.clinics.length;
      if (typeof renderClinicSwitcher === 'function') renderClinicSwitcher();
      return;
    }
    return _origLoadClinics.apply(this, args);
  };
})();

console.log('✅ permissoes-fix.js carregado — aplicação de permissões ativa');
