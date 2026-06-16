// ============================================================
// CLINICALEAD — ESCONDER PAINEL ADMIN DE QUEM NÃO É ADMIN MASTER
// O menu "Clínicas" (Gestão de TODAS as clínicas) e "Meu Plano"
// são EXCLUSIVOS do admin master. Donos e colaboradores não veem.
// v2: timing reforçado (roda repetido até o menu existir) +
// fallback que identifica admin de várias formas.
// CARREGAR DEPOIS de permissoes-fix.js e dono-nao-colaborador-fix.js.
// ============================================================

(function () {
  'use strict';

  const PAGINAS_ADMIN = ['clinicas', 'clinics', 'meu-plano', 'meuplano'];

  function ehAdminMaster() {
    // tenta de várias formas pra ser robusto
    const role = STATE?.profile?.role || STATE?.user?.user_metadata?.role
      || STATE?.user?.raw_user_meta_data?.role;
    if (role === 'admin' || role === 'administrador') return true;
    // fallback por e-mail do admin master conhecido
    const email = STATE?.user?.email || STATE?.profile?.email;
    if (email === 'jeanjunior.digital@gmail.com') return true;
    return false;
  }

  function esconderMenusAdmin() {
    if (typeof STATE === 'undefined' || !STATE.user) return;
    if (ehAdminMaster()) return; // admin vê tudo

    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
      const page = (item.getAttribute('data-page') || '').toLowerCase();
      if (PAGINAS_ADMIN.includes(page)) {
        item.style.display = 'none';
        item.style.setProperty('display', 'none', 'important');
      }
    });
  }

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

  // Roda repetidamente nos primeiros segundos (garante pegar o menu
  // mesmo que ele seja renderizado depois do login)
  function marteloInicial() {
    let tentativas = 0;
    const iv = setInterval(() => {
      tentativas++;
      blindarShowPage();
      esconderMenusAdmin();
      if (tentativas > 40) clearInterval(iv); // ~20s
    }, 500);
  }

  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    marteloInicial();
    // observa mudanças no DOM pra reesconder se o menu re-renderizar
    const obs = new MutationObserver(() => {
      clearTimeout(window.__escondeAdminTimer);
      window.__escondeAdminTimer = setTimeout(esconderMenusAdmin, 200);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('✅ esconder-painel-admin-fix.js v2 carregado');
    return true;
  }

  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
