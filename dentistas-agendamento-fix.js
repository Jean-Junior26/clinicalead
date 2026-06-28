// ============================================================
// CLINICALEAD — MULTI-DENTISTA NO AGENDAMENTO (Fase 2)
// Adiciona o dropdown "Dentista" no modal de agendamento e faz a
// trava anti-duplo ser POR DENTISTA (mesmo horário livre pra dentistas
// diferentes). Salva dentista_id na consulta. Mostra o dentista no card.
// Não reescreve as camadas existentes — envelopa com segurança.
// Carregar DEPOIS de dentistas-fix.js e dos fixes de agendamento.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function dentistas() { return (typeof window.DENT_lista === 'function') ? window.DENT_lista() : []; }

  // ── injeta o dropdown "Dentista" no modal (se houver dentistas cadastrados) ──
  function injetarSelectDentista() {
    const lista = dentistas();
    const grupoExistente = document.getElementById('naDentistaGroup');
    if (!lista.length) {
      // clínica atual NÃO tem dentistas (ex: Hugo) → remove o dropdown se existir
      // (evita mostrar dentistas de outra clínica que ficaram no DOM)
      if (grupoExistente) grupoExistente.remove();
      // revalida em 600ms: a lista pode estar recarregando pra clínica certa
      setTimeout(() => {
        const novaLista = dentistas();
        if (novaLista.length && !document.getElementById('naDentistaGroup')) injetarSelectDentista();
      }, 600);
      return;
    }
    if (grupoExistente) { popular(); return; }
    // coloca depois do campo de hora (ou antes das obs)
    const ref = document.getElementById('naHora')?.closest('.form-group')
             || document.getElementById('naObs')?.closest('.form-group');
    if (!ref) return;
    const g = document.createElement('div');
    g.className = 'form-group';
    g.id = 'naDentistaGroup';
    g.innerHTML = `
      <label class="form-label">Dentista</label>
      <select class="form-select" id="naDentista">
        <option value="">Selecione o dentista</option>
      </select>`;
    ref.insertAdjacentElement('afterend', g);
    popular();
  }

  function popular() {
    const sel = document.getElementById('naDentista');
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '<option value="">Selecione o dentista</option>' +
      dentistas().map(d => `<option value="${d.id}">${d.nome}</option>`).join('');
    if (atual) sel.value = atual;
  }

  // engata na abertura do modal pra injetar o select
  ['openNovoAgendamento', 'openNovoAgendamentoHora'].forEach(fn => {
    if (typeof window[fn] === 'function') {
      const _orig = window[fn];
      window[fn] = function (...args) { const r = _orig.apply(this, args); setTimeout(injetarSelectDentista, 200); return r; };
    }
  });

  // ── envelopa a salvar: trava por dentista ANTES + injeta dentista_id ──
  function instalarSalvar() {
    if (typeof salvarNovoAgendamento !== 'function') { setTimeout(instalarSalvar, 400); return; }
    if (window.__dentSalvarInstalado) return;
    window.__dentSalvarInstalado = true;

    const _origSalvar = salvarNovoAgendamento;
    window.salvarNovoAgendamento = async function (...args) {
      const lista = dentistas();
      const selDent = document.getElementById('naDentista');
      const dentistaId = selDent ? selDent.value : '';

      // se a clínica TEM dentistas cadastrados E o dropdown está na tela, o dentista é obrigatório
      const dropdownNaTela = !!document.getElementById('naDentistaGroup');
      if (lista.length && dropdownNaTela && !dentistaId) {
        if (typeof toast === 'function') toast('Selecione o dentista', 'error');
        return;
      }

      // ── TRAVA ANTI-DUPLO POR DENTISTA ──
      // bloqueia só se o MESMO dentista já tem consulta no mesmo dia+hora.
      if (dentistaId) {
        const data = document.getElementById('naData')?.value;
        const hora = document.getElementById('naHora')?.value;
        if (data && hora && typeof CAL !== 'undefined' && Array.isArray(CAL.consultas)) {
          const conflito = CAL.consultas.find(c =>
            c.data === data && c.hora === hora &&
            c.dentista_id === dentistaId &&
            c.status !== 'cancelado'
          );
          if (conflito) {
            const nomeDent = (lista.find(d => d.id === dentistaId) || {}).nome || 'esse dentista';
            if (typeof toast === 'function') toast(`${nomeDent} já tem consulta nesse horário`, 'error');
            return;
          }
        }
      }

      // injeta o dentista_id na consulta logo após o insert.
      // Estratégia: intercepta o db.from('consultas').insert pra adicionar dentista_id.
      const database = getDb();
      const _origFrom = database.from.bind(database);
      database.from = function (tabela) {
        const builder = _origFrom(tabela);
        if (tabela === 'consultas' && builder.insert) {
          const _origInsert = builder.insert.bind(builder);
          builder.insert = function (payload) {
            // adiciona dentista_id no(s) registro(s) sendo inseridos
            if (dentistaId) {
              if (Array.isArray(payload)) payload.forEach(p => { p.dentista_id = dentistaId; });
              else if (payload && typeof payload === 'object') payload.dentista_id = dentistaId;
            }
            return _origInsert(payload);
          };
        }
        return builder;
      };

      // ── NEUTRALIZA A TRAVA ANTIGA (que ignora o dentista) ──
      // As travas existentes checam CAL.consultas por data+hora (sem olhar dentista),
      // então bloqueariam "ocupado" mesmo com dentista diferente. Durante a execução
      // da salvar, escondemos as consultas de OUTROS dentistas no mesmo horário —
      // assim a trava antiga não enxerga conflito. (Minha trava por dentista, acima,
      // já garantiu que o MESMO dentista não tem conflito.)
      const _consultasOriginais = CAL.consultas;
      if (dentistaId) {
        const dataSel = document.getElementById('naData')?.value;
        const horaSel = document.getElementById('naHora')?.value;
        // mantém só as consultas que NÃO são de outro dentista no mesmo dia+hora
        CAL.consultas = _consultasOriginais.filter(c => {
          const mesmoSlot = c.data === dataSel && c.hora === horaSel;
          const deOutroDentista = mesmoSlot && c.dentista_id && c.dentista_id !== dentistaId;
          return !deOutroDentista; // esconde as de outro dentista nesse slot
        });
      }

      try {
        const resultado = await _origSalvar.apply(this, args);
        // restaura a lista completa imediatamente (a salvar já fez seu trabalho)
        CAL.consultas = _consultasOriginais;
        // ── RECARREGA do banco pra garantir que TODAS as consultas aparecem ──
        // (a manipulação temporária de CAL.consultas pode deixar a lista incompleta;
        //  recarregar do banco é a fonte da verdade e evita consulta "sumindo").
        try {
          const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
          if (clinic) {
            const { data: frescas } = await database.from('consultas').select('*').eq('clinic_id', clinic.id).order('data').order('hora');
            if (frescas) {
              CAL.consultas = frescas;
              if (typeof renderCalendar === 'function') renderCalendar();
              if (typeof CAL !== 'undefined' && CAL.selectedDate && typeof renderDaySchedule === 'function') renderDaySchedule(CAL.selectedDate);
            }
          }
        } catch (e) { console.error('[dentistas] recarregar pós-save', e); }
        return resultado;
      } finally {
        database.from = _origFrom; // restaura
      }
    };
    console.log('✅ dentistas-agendamento-fix.js: salvar envelopado');
  }

  // ── mostra o dentista no card da consulta (na agenda do dia) ──
  function marcarDentistaNosCards() {
    const lista = dentistas();
    if (!lista.length) return;
    const mapaDent = {};
    lista.forEach(d => { mapaDent[d.id] = d; });
    const agendaList = document.getElementById('agendaList');
    if (!agendaList || typeof CAL === 'undefined') return;

    // pra cada consulta com dentista, acha a linha e adiciona o nome
    (CAL.consultas || []).filter(c => c.data === CAL.selectedDate && c.dentista_id).forEach(c => {
      const dent = mapaDent[c.dentista_id];
      if (!dent) return;
      // acha a linha pelo horário
      const times = agendaList.querySelectorAll('.sched-time');
      for (const t of times) {
        if (t.textContent.trim() === c.hora) {
          let row = t; while (row && row.parentElement !== agendaList) row = row.parentElement;
          if (row && !row.querySelector('.dent-badge')) {
            const badge = document.createElement('span');
            badge.className = 'dent-badge';
            badge.style.cssText = `margin-left:8px;font-size:10px;padding:1px 7px;border-radius:5px;white-space:nowrap;background:${dent.cor}22;color:${dent.cor};border:1px solid ${dent.cor}66;`;
            badge.textContent = '🦷 ' + dent.nome;
            const nameEl = row.querySelector('.sched-name') || row.querySelector('.sched-time');
            if (nameEl && nameEl.parentElement) nameEl.parentElement.appendChild(badge);
          }
          break;
        }
      }
    });
  }

  function instalarRender() {
    if (typeof renderDaySchedule !== 'function') { setTimeout(instalarRender, 400); return; }
    if (window.__dentRenderInstalado) return;
    window.__dentRenderInstalado = true;
    const _orig = renderDaySchedule;
    window.renderDaySchedule = function (...a) {
      const r = _orig.apply(this, a);
      setTimeout(marcarDentistaNosCards, 120);
      return r;
    };
  }

  instalarSalvar();
  instalarRender();
  console.log('✅ dentistas-agendamento-fix.js carregado (Fase 2)');
})();
