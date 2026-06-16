// ============================================================
// CLINICALEAD — ESCONDER BLOQUEAR/EXCLUIR DO NÃO-ADMIN (v2)
// Mira EXATAMENTE os botões pelo onclick:
//   - toggleBloquearClinica  (Bloquear/Desbloquear)
//   - excluirClinica         (Excluir)
// O dono vê o painel da clínica dele, edita, conecta WhatsApp,
// mas NÃO bloqueia nem exclui. Usa CSS (à prova de timing).
// ============================================================

(function () {
  'use strict';

  const ADMIN_EMAIL = 'jeanjunior.digital@gmail.com';

  function ehAdminMaster() {
    const role = (STATE && STATE.profile && STATE.profile.role)
      || (STATE && STATE.user && STATE.user.user_metadata && STATE.user.user_metadata.role);
    if (role === 'admin' || role === 'administrador') return true;
    const email = (STATE && STATE.user && STATE.user.email)
      || (STATE && STATE.profile && STATE.profile.email);
    return email === ADMIN_EMAIL;
  }

  // injeta o CSS que esconde os botões perigosos quando body.nao-admin-saas
  function injetarCSS() {
    if (document.getElementById('cssAcoesAdmin')) return;
    const st = document.createElement('style');
    st.id = 'cssAcoesAdmin';
    st.textContent = `
      body.nao-admin-saas button[onclick*="toggleBloquearClinica"],
      body.nao-admin-saas button[onclick*="excluirClinica"] {
        display: none !important;
      }`;
    document.head.appendChild(st);
  }

  function marcarBody() {
    if (typeof STATE === 'undefined' || !STATE.user) return;
    // se NÃO é admin master, marca o body (o CSS esconde os botões)
    document.body.classList.toggle('nao-admin-saas', !ehAdminMaster());
  }

  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    injetarCSS();
    marcarBody();
    // martelo: remarca enquanto o login carrega
    let n = 0;
    const iv = setInterval(() => {
      marcarBody();
      if (++n > 60) clearInterval(iv); // ~30s
    }, 500);
    console.log('✅ esconder-acoes-admin-fix.js v2 carregado (mira onclick)');
    return true;
  }

  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
