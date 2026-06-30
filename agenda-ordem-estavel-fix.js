// ============================================================
// CLINICALEAD — FIX: ordem estável da agenda (para a "troca de nomes")
// PROBLEMA: ao reabrir/recarregar a agenda, pacientes no MESMO horário
// trocavam de ordem ("abre e tá uns nomes, abre de novo são outros").
// CAUSA: consultas do mesmo horário sem critério de desempate fixo →
// a ordem variava a cada render.
// SOLUÇÃO: mantém CAL.consultas SEMPRE ordenado de forma estável
// (data → hora → created_at → id). Mesma ordem sempre = não troca mais.
// Carregar como script novo no index (depois do semáforo).
// ============================================================
(function () {
  'use strict';

  // ordenação estável e determinística das consultas
  function ordenarEstavel(consultas) {
    if (!Array.isArray(consultas)) return consultas;
    return consultas.slice().sort((a, b) => {
      // 1) por data
      const da = String(a.data || ''), dbb = String(b.data || '');
      if (da !== dbb) return da < dbb ? -1 : 1;
      // 2) por hora
      const ha = String(a.hora || ''), hb = String(b.hora || '');
      if (ha !== hb) return ha < hb ? -1 : 1;
      // 3) desempate FIXO: created_at (quem foi agendado primeiro aparece primeiro)
      const ca = String(a.created_at || ''), cb = String(b.created_at || '');
      if (ca !== cb) return ca < cb ? -1 : 1;
      // 4) último desempate: id (garante 100% determinístico)
      return String(a.id || '') < String(b.id || '') ? -1 : 1;
    });
  }
  window.ordenarConsultasEstavel = ordenarEstavel;

  // re-ordena CAL.consultas sempre que for renderizar
  function aplicarOrdem() {
    if (typeof CAL !== 'undefined' && Array.isArray(CAL.consultas)) {
      CAL.consultas = ordenarEstavel(CAL.consultas);
    }
  }

  // engancha nas funções de render pra garantir ordem ANTES de desenhar
  function instalarHook(nome) {
    if (typeof window[nome] !== 'function') return false;
    if (window['__ordemHook_' + nome]) return true;
    const _orig = window[nome];
    window[nome] = function (...args) {
      aplicarOrdem(); // ordena antes de renderizar
      return _orig.apply(this, args);
    };
    window['__ordemHook_' + nome] = true;
    return true;
  }

  function instalarTudo() {
    let ok = false;
    ['renderAgenda', 'renderDaySchedule', 'recarregarAgendaDoBanco'].forEach(n => {
      if (instalarHook(n)) ok = true;
    });
    return ok;
  }

  if (!instalarTudo()) {
    const iv = setInterval(() => { if (instalarTudo()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }

  // também ordena ao carregar consultas do banco (realtime)
  // intercepta a atribuição não é trivial, então reforça via render hooks acima.

  console.log('✅ agenda-ordem-estavel-fix.js carregado — ordem fixa, sem troca de nomes');
})();
