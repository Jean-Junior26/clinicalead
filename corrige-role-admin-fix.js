// ============================================================
// CLINICALEAD — CORREÇÃO CRÍTICA DO ROLE (raiz de vários bugs)
// BUG: no loadApp, STATE.profile.role recebia `meta.role || 'admin'`.
// Resultado: TODO usuário SEM role (ex: dono de clínica) virava
// 'admin' no front — via painel de todas as clínicas, bloquear,
// excluir, etc. (e dados podiam vazar).
// CORREÇÃO (dupla proteção):
//   - Se o e-mail é o do admin master  -> 'admin' (garantido)
//   - Senão, usa o role real do banco; se vazio -> 'colaborador'
// CARREGAR CEDO (logo após o supabase), idealmente entre os
// primeiros fixes. Intercepta loadApp.
// ============================================================

(function () {
  'use strict';

  const ADMIN_EMAILS = ['jeanjunior.digital@gmail.com'];

  function corrigirRole() {
    try {
      if (typeof STATE === 'undefined' || !STATE.user) return;
      const email = (STATE.user.email || '').toLowerCase();
      const meta = STATE.user.user_metadata || {};
      let role;
      if (ADMIN_EMAILS.includes(email)) {
        role = 'admin'; // admin master sempre, garantido
      } else if (meta.role && meta.role !== 'admin') {
        role = meta.role; // respeita role real do banco (dentist, etc), mas nunca herda 'admin' indevido
      } else if (meta.role === 'admin') {
        // tinha 'admin' no metadata mas não é o e-mail master:
        // por segurança, só mantém admin se o e-mail confirmar. senão, rebaixa.
        role = 'colaborador';
      } else {
        role = 'colaborador'; // sem role -> colaborador (NÃO admin)
      }
      if (!STATE.profile) STATE.profile = {};
      STATE.profile.role = role;
      // atualiza o rótulo na UI, se existir
      const elRole = document.getElementById('userRole');
      if (elRole) {
        elRole.textContent = role === 'admin' ? 'Administrador'
          : role === 'dentist' ? 'Dentista'
          : role === 'dono' ? 'Proprietário' : 'Colaborador';
      }
    } catch (e) {
      console.error('[corrige-role] erro:', e);
    }
  }

  function instalar() {
    if (typeof loadApp !== 'function') return false;
    const _orig = loadApp;
    loadApp = async function (user) {
      const r = await _orig.apply(this, arguments);
      // corrige logo após o loadApp original definir o profile errado
      corrigirRole();
      return r;
    };
    // se já logou antes deste fix instalar, corrige agora também
    corrigirRole();
    // martelo leve nos primeiros segundos (garante após o login)
    let n = 0;
    const iv = setInterval(() => { corrigirRole(); if (++n > 20) clearInterval(iv); }, 500);
    console.log('✅ corrige-role-admin-fix.js carregado (role correto: admin só pra master)');
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 400);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
