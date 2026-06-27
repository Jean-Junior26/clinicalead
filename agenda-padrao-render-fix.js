// ============================================================
// CLINICALEAD — AGENDA-PADRÃO: APLICAR NA AGENDA VISUAL (Fase 3)
// Faz a agenda mostrar os horários da AGENDA-PADRÃO de cada dia da semana.
// Antes de desenhar um dia, ajusta CAL.horariosDisponiveis pra grade-padrão
// daquele dia (sábado 8-13h, domingo fechado, etc.). NÃO mexe na render
// original — só "alimenta" ela com a grade certa. Reversível e seguro.
// Carregar DEPOIS dos scripts da agenda e do agenda-padrao-fix.js.
// ============================================================
(function () {
  'use strict';

  let padraoCache = null;        // { dia_semana: { horarios, ativo } }
  let padraoCacheClinic = null;  // pra qual clínica o cache é
  let gradeOriginal = null;      // guarda a grade original (fallback)

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }

  // carrega a agenda-padrão da clínica (com cache por clínica)
  async function carregarPadrao() {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic) return null;
    if (padraoCache && padraoCacheClinic === clinic.id) return padraoCache;
    try {
      const { data } = await database.from('agenda_padrao').select('dia_semana, horarios, ativo').eq('clinic_id', clinic.id);
      if (!data || !data.length) { padraoCache = null; padraoCacheClinic = clinic.id; return null; }
      const mapa = {};
      data.forEach(row => {
        mapa[row.dia_semana] = {
          horarios: Array.isArray(row.horarios) ? row.horarios : [],
          ativo: row.ativo !== false,
        };
      });
      padraoCache = mapa; padraoCacheClinic = clinic.id;
      return mapa;
    } catch (e) { console.error('[agenda-padrao-render] carregar', e); return null; }
  }

  // aplica a grade-padrão do dia em CAL.horariosDisponiveis (antes de desenhar)
  function aplicarGradeDoDia(dateStr, padrao) {
    if (typeof CAL === 'undefined') return;
    // guarda a grade original uma vez (fallback)
    if (gradeOriginal === null && Array.isArray(CAL.horariosDisponiveis)) {
      gradeOriginal = CAL.horariosDisponiveis.slice();
    }
    if (!padrao) return; // sem agenda-padrão configurada → mantém o comportamento atual

    const diaSemana = new Date(`${dateStr}T12:00:00`).getDay();
    const p = padrao[diaSemana];

    if (p && p.ativo && p.horarios.length) {
      // dia atende: usa a grade-padrão dele
      CAL.horariosDisponiveis = p.horarios.slice();
    } else if (p && (!p.ativo || !p.horarios.length)) {
      // dia FECHADO: grade vazia (não mostra horários disponíveis)
      CAL.horariosDisponiveis = [];
    } else {
      // esse dia da semana não tem config → usa a original (fallback)
      if (gradeOriginal) CAL.horariosDisponiveis = gradeOriginal.slice();
    }
  }

  // envelopa a renderDaySchedule: ajusta a grade ANTES de desenhar
  function instalar() {
    if (typeof renderDaySchedule !== 'function') { setTimeout(instalar, 500); return; }
    if (window.__agPadraoRenderInstalado) return;
    window.__agPadraoRenderInstalado = true;

    const _orig = renderDaySchedule;
    window.renderDaySchedule = function (dateStr) {
      try {
        const ds = dateStr || (typeof CAL !== 'undefined' ? CAL.selectedDate : null);
        if (ds && padraoCache) aplicarGradeDoDia(ds, padraoCache);
      } catch (e) { console.error('[agenda-padrao-render]', e); }
      return _orig.apply(this, arguments);
    };

    // pré-carrega o padrão e re-renderiza o dia atual
    carregarPadrao().then(p => {
      if (p && typeof CAL !== 'undefined' && CAL.selectedDate && typeof renderDaySchedule === 'function') {
        renderDaySchedule(CAL.selectedDate);
        if (typeof renderCalendar === 'function') renderCalendar();
      }
    });

    console.log('✅ agenda-padrao-render-fix.js instalado (Fase 3)');
  }

  // recarrega o cache quando troca de clínica (se houver essa função)
  if (typeof currentClinic === 'function') {
    // tenta recarregar o padrão periodicamente se a clínica mudar
    let ultimaClinic = null;
    setInterval(() => {
      const c = clinicAtual();
      if (c && c.id !== ultimaClinic) {
        ultimaClinic = c.id;
        padraoCache = null; padraoCacheClinic = null;
        carregarPadrao();
      }
    }, 3000);
  }

  setTimeout(instalar, 800);
})();
