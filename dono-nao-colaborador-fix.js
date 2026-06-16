// ============================================================
// CLINICALEAD — CORREÇÃO: DONO NÃO É COLABORADOR
// O permissoes-fix.js marca como "colaborador" QUALQUER um que
// esteja na clinic_users — inclusive o DONO. Isso fazia o dono
// perder logout, menus e o "Minha Clínica".
// Este fix reescreve carregarPermissoesColaborador para que,
// quando o papel for 'dono', o usuário seja tratado como dono
// (vê tudo), não como colaborador restrito.
// CARREGAR DEPOIS do permissoes-fix.js.
// ============================================================

(function () {
  'use strict';

  function instalar() {
    if (typeof carregarPermissoesColaborador !== 'function' || typeof db === 'undefined') return false;

    // Reescreve a função que decide se é colaborador
    carregarPermissoesColaborador = async function () {
      // reseta o estado global usado pelo permissoes-fix
      if (typeof PERMISSOES !== 'undefined') {
        PERMISSOES.ehColaborador = false;
        PERMISSOES.areas = null;
        PERMISSOES.clinicId = null;
      }

      // Admin geral nunca é colaborador
      const role = STATE.profile?.role;
      if (role === 'admin' || role === 'administrador') return;

      if (!STATE.user?.id) return;

      // Busca o vínculo na clinic_users (agora trazendo o PAPEL)
      const { data, error } = await db.from('clinic_users')
        .select('clinic_id, permissoes, ativo, nome, papel')
        .eq('user_id', STATE.user.id)
        .eq('ativo', true)
        .maybeSingle();

      if (error || !data) return; // não tem vínculo: é dono comum (via clinicas.user_id)

      // ★ DIFERENÇA-CHAVE: se o papel é 'dono', NÃO é colaborador.
      // Dono vê tudo (logout, menus, Minha Clínica) — sai sem restringir.
      if (data.papel === 'dono' || data.papel === 'owner' || data.papel === 'admin') {
        return;
      }

      // Caso contrário, é colaborador de verdade: aplica as restrições
      if (typeof PERMISSOES !== 'undefined') {
        PERMISSOES.ehColaborador = true;
        PERMISSOES.areas = data.permissoes || {};
        PERMISSOES.clinicId = data.clinic_id;
      }
    };

    console.log('✅ dono-nao-colaborador-fix.js carregado (dono tratado como dono)');
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
