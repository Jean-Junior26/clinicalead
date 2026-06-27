// ============================================================
// CLINICALEAD — AGENDA EXCEÇÕES / FERIADOS (Fase 4)
// Botão "Fechar dia" na agenda → salva no banco (agenda_excecoes) e
// a agenda passa a mostrar o dia como fechado. Reabrir = remove a exceção.
// A Luana (Brian) também lê as exceções (não oferece dia fechado).
// Carregar DEPOIS do agenda-padrao-render-fix.js.
// ============================================================
(function () {
  'use strict';

  let excecoesCache = {};        // { 'YYYY-MM-DD': { fechado, horarios, motivo } }
  let excecoesCacheClinic = null;

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }

  async function carregarExcecoes() {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic) return {};
    if (excecoesCacheClinic === clinic.id && Object.keys(excecoesCache).length >= 0 && excecoesCacheClinic) {
      // cache válido (mesmo se vazio)
    }
    try {
      const { data } = await database.from('agenda_excecoes').select('*').eq('clinic_id', clinic.id);
      const mapa = {};
      (data || []).forEach(row => { mapa[row.data] = { fechado: row.fechado, horarios: row.horarios || [], motivo: row.motivo || '' }; });
      excecoesCache = mapa; excecoesCacheClinic = clinic.id;
      return mapa;
    } catch (e) { console.error('[agenda-excecoes] carregar', e); return {}; }
  }

  // ── fecha um dia (salva exceção fechado=true) ──
  async function fecharDia(dateStr, motivo) {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic) return;
    try {
      const { error } = await database.from('agenda_excecoes')
        .upsert({ clinic_id: clinic.id, data: dateStr, fechado: true, horarios: [], motivo: motivo || 'Fechado' },
                { onConflict: 'clinic_id,data' });
      if (error) { if (typeof toast === 'function') toast('Erro: ' + error.message, 'error'); return; }
      excecoesCache[dateStr] = { fechado: true, horarios: [], motivo: motivo || 'Fechado' };
      if (typeof toast === 'function') toast('Dia fechado! ✓');
      rerender(dateStr);
    } catch (e) { if (typeof toast === 'function') toast('Erro: ' + e.message, 'error'); }
  }

  // ── reabre um dia (remove a exceção) ──
  async function reabrirDia(dateStr) {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic) return;
    try {
      const { error } = await database.from('agenda_excecoes')
        .delete().eq('clinic_id', clinic.id).eq('data', dateStr);
      if (error) { if (typeof toast === 'function') toast('Erro: ' + error.message, 'error'); return; }
      delete excecoesCache[dateStr];
      if (typeof toast === 'function') toast('Dia reaberto! ✓');
      rerender(dateStr);
    } catch (e) { if (typeof toast === 'function') toast('Erro: ' + e.message, 'error'); }
  }

  function rerender(dateStr) {
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderDaySchedule === 'function') renderDaySchedule(dateStr);
  }

  // ── aplica exceção na grade do dia (chamado antes do desenho) ──
  function aplicarExcecao(dateStr) {
    if (typeof CAL === 'undefined') return;
    const ex = excecoesCache[dateStr];
    if (!ex) return; // sem exceção → comportamento normal (agenda-padrão)
    if (ex.fechado) {
      CAL.horariosDisponiveis = []; // dia fechado: sem horários
    } else if (Array.isArray(ex.horarios) && ex.horarios.length) {
      CAL.horariosDisponiveis = ex.horarios.slice(); // horário especial do dia
    }
  }

  // envelopa renderDaySchedule pra aplicar a exceção DEPOIS da agenda-padrão
  function instalarRender() {
    if (typeof renderDaySchedule !== 'function') { setTimeout(instalarRender, 500); return; }
    if (window.__agExcecaoInstalado) return;
    window.__agExcecaoInstalado = true;
    const _orig = renderDaySchedule;
    window.renderDaySchedule = function (dateStr) {
      const r = _orig.apply(this, arguments); // deixa a agenda-padrão (Fase 3) rodar primeiro
      try {
        const ds = dateStr || (CAL && CAL.selectedDate);
        if (ds && excecoesCache[ds] && excecoesCache[ds].fechado) {
          // re-aplica fechado por cima e re-desenha o "fechado"
          aplicarExcecao(ds);
        }
      } catch (e) { console.error('[agenda-excecoes]', e); }
      return r;
    };
  }

  // ── botão "Fechar/Reabrir dia" nas ações da agenda ──
  function injetarBotao() {
    const actions = document.getElementById('agendaDayActions');
    if (!actions) return;
    if (document.getElementById('btnFecharDia')) {
      atualizarBotao();
      return;
    }
    const b = document.createElement('button');
    b.id = 'btnFecharDia';
    b.className = 'btn btn-sm';
    b.style.cssText = 'border:1px solid var(--coral,#C0624A);color:var(--coral,#C0624A);';
    b.onclick = onClickFecharDia;
    actions.appendChild(b);
    atualizarBotao();
  }

  function atualizarBotao() {
    const b = document.getElementById('btnFecharDia');
    if (!b || typeof CAL === 'undefined') return;
    const ds = CAL.selectedDate;
    const fechado = ds && excecoesCache[ds] && excecoesCache[ds].fechado;
    b.innerHTML = fechado
      ? '<i class="ti ti-lock-open"></i> Reabrir dia'
      : '<i class="ti ti-calendar-off"></i> Fechar dia';
  }

  function onClickFecharDia() {
    if (typeof CAL === 'undefined' || !CAL.selectedDate) return;
    const ds = CAL.selectedDate;
    const fechado = excecoesCache[ds] && excecoesCache[ds].fechado;
    if (fechado) {
      reabrirDia(ds);
    } else {
      const motivo = prompt('Fechar este dia. Motivo? (ex: Feriado, Recesso) — opcional:', '');
      if (motivo === null) return; // cancelou
      fecharDia(ds, motivo);
    }
  }

  // re-injeta o botão quando a agenda do dia renderiza
  function instalarBotao() {
    if (typeof renderDaySchedule === 'function') {
      const _rds = renderDaySchedule;
      window.renderDaySchedule = function (...args) {
        const r = _rds.apply(this, args);
        setTimeout(injetarBotao, 80);
        return r;
      };
    }
    setTimeout(injetarBotao, 1000);
  }

  // inicializa
  carregarExcecoes().then(() => {
    instalarRender();
    instalarBotao();
    if (typeof CAL !== 'undefined' && CAL.selectedDate && typeof renderDaySchedule === 'function') {
      renderDaySchedule(CAL.selectedDate);
    }
    console.log('✅ agenda-excecoes-fix.js carregado (Fase 4)');
  });

  // recarrega cache ao trocar de clínica
  let ultimaClinic = null;
  setInterval(() => {
    const c = clinicAtual();
    if (c && c.id !== ultimaClinic) { ultimaClinic = c.id; carregarExcecoes(); }
  }, 3000);
})();
