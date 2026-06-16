// ============================================================
// CLINICALEAD — ESCONDER BLOQUEAR/EXCLUIR DO NÃO-ADMIN
// O dono da clínica PODE ver o painel de clínica (editar,
// conectar WhatsApp, acessar), mas NÃO pode Bloquear nem Excluir
// (ações destrutivas exclusivas do admin master do SaaS).
// Esconde esses botões procurando pelo TEXTO, robusto a estrutura.
// ============================================================

(function () {
  'use strict';

  const ADMIN_EMAIL = 'jeanjunior.digital@gmail.com';
  // textos dos botões que SÓ o admin pode ver
  const ACOES_PROIBIDAS = ['bloquear', 'desbloquear', 'liberar', 'excluir', 'deletar', 'apagar'];

  function ehAdminMaster() {
    const role = (STATE && STATE.profile && STATE.profile.role)
      || (STATE && STATE.user && STATE.user.user_metadata && STATE.user.user_metadata.role);
    if (role === 'admin' || role === 'administrador') return true;
    const email = (STATE && STATE.user && STATE.user.email)
      || (STATE && STATE.profile && STATE.profile.email);
    if (email === ADMIN_EMAIL) return true;
    return false;
  }

  function esconderAcoes() {
    if (typeof STATE === 'undefined' || !STATE.user) return;
    if (ehAdminMaster()) return; // admin vê tudo

    // procura botões/links com texto de ação proibida
    const candidatos = document.querySelectorAll('button, a');
    candidatos.forEach(el => {
      if (el.dataset.acaoEscondida === '1') return; // já tratado
      const txt = (el.textContent || '').trim().toLowerCase();
      // casa se o texto do botão é EXATAMENTE ou começa com a ação proibida
      const proibido = ACOES_PROIBIDAS.some(a => txt === a || txt.startsWith(a + ' ') || txt === a);
      // só esconde se o botão estiver relacionado a clínica (evita esconder "excluir" de outras telas)
      const onclick = (el.getAttribute('onclick') || '').toLowerCase();
      const pareceClinica = onclick.includes('clinic') || onclick.includes('clinica')
        || el.closest('[id*="clinic" i], [class*="clinic" i], #page-clinicas, table');
      if (proibido && pareceClinica) {
        el.style.setProperty('display', 'none', 'important');
        el.dataset.acaoEscondida = '1';
      }
    });
  }

  function marteloInicial() {
    let n = 0;
    const iv = setInterval(() => {
      esconderAcoes();
      if (++n > 60) clearInterval(iv); // ~30s
    }, 500);
  }

  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    marteloInicial();
    const obs = new MutationObserver(() => {
      clearTimeout(window.__escondeAcoesTimer);
      window.__escondeAcoesTimer = setTimeout(esconderAcoes, 150);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('✅ esconder-acoes-admin-fix.js carregado');
    return true;
  }

  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
