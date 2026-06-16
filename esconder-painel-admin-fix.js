// ============================================================
// CLINICALEAD — ESCONDER PAINEL ADMIN DE QUEM NÃO É ADMIN MASTER
// O menu "Clínicas" (Gestão de TODAS as clínicas) e "Meu Plano"
// são EXCLUSIVOS do admin master (dono do SaaS). Donos de clínica
// e colaboradores NÃO podem ver/acessar — veriam/mexeriam nas
// clínicas dos outros.
// Esconde no menu E bloqueia a navegação direta.
// CARREGAR DEPOIS de permissoes-fix.js e dono-nao-colaborador-fix.js.
// ============================================================

(function () {
  'use strict';

  // Páginas que SÓ o admin master pode ver
  const PAGINAS_ADMIN = ['clinicas', 'clinics', 'meu-plano', 'meuplano'];

  function ehAdminMaster() {
    const role = STATE?.profile?.role;
    return role === 'admin' || role === 'administrador';
  }

  // Esconde os itens de menu exclusivos do admin
  function esconderMenusAdmin() {
    if (typeof STATE === 'undefined' || !STATE.profile) return false;
    if (ehAdminMaster()) return true; // admin vê tudo, não esconde nada

    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      const page = (item.getAttribute('data-page') || '').toLowerCase();
      if (PAGINAS_ADMIN.includes(page)) {
        item.style.display = 'none';
      }
    });
    return true;
  }

  // Bloqueia navegação direta pras páginas de admin (defesa extra)
  function blindarShowPage() {
    if (typeof showPage !== 'function' || showPage.__blindadoAdmin) return;
    const _orig = showPage;
    showPage = function (id, el) {
      const pid = (id || '').toLowerCase();
      if (!ehAdminMaster() && PAGINAS_ADMIN.includes(pid)) {
        if (typeof toast === 'function') toast('Você não tem acesso a esta área', 'error');
        return;
      }
      return _orig(id, el);
    };
    showPage.__blindadoAdmin = true;
  }

  function iniciar() {
    if (typeof STATE === 'undefined' || !STATE.profile) return false;
    blindarShowPage();
    esconderMenusAdmin();
    // observa re-render do menu pra reesconder se reaparecer
    const obs = new MutationObserver(() => {
      if (!ehAdminMaster()) {
        clearTimeout(window.__escondeAdminTimer);
        window.__escondeAdminTimer = setTimeout(esconderMenusAdmin, 250);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('✅ esconder-painel-admin-fix.js carregado');
    return true;
  }

  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
