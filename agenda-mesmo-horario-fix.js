// ============================================================
// CLINICALEAD — FIX: renderizar TODOS os pacientes do mesmo horário
// PROBLEMA RAIZ: a base renderiza só 1 .sched-item por HORÁRIO.
// Quando há 2+ no mesmo horário, o 2º some da tela.
// SOLUÇÃO: detecta consultas que ficaram de fora e injeta como item
// completo. v2: pega a DATA pela tela (CAL.data vem undefined) e
// re-injeta via MutationObserver (outros fixes re-renderizam depois).
// Carregar DEPOIS do semáforo e dos outros fixes de agenda.
// ============================================================
(function () {
  'use strict';

  // descobre a data exibida — robusto (CAL.data vem undefined)
  function dataExibida() {
    // 1) tenta variáveis globais comuns
    for (const k of ['dataAtual', 'data', 'dataSelecionada', 'diaAtual', 'currentDate']) {
      if (typeof CAL !== 'undefined' && CAL[k]) {
        const v = CAL[k];
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
        if (v instanceof Date) return v.toISOString().slice(0, 10);
      }
    }
    // 2) tenta inferir pela PRÓPRIA tela: o 1º item renderizado tem uma consulta;
    //    pega a data dessa consulta no CAL (todos do mesmo dia exibido)
    const container = document.getElementById('agendaList');
    if (container && typeof CAL !== 'undefined' && Array.isArray(CAL.consultas)) {
      const prim = container.querySelector('.sched-item[onclick]');
      if (prim) {
        const m = (prim.getAttribute('onclick') || '').match(/openEditConsulta\('([^']+)'\)/);
        if (m) {
          const c = CAL.consultas.find(x => x.id === m[1]);
          if (c && c.data) return String(c.data).slice(0, 10);
        }
      }
    }
    return null;
  }

  function montarItemHTML(consulta, lead) {
    const hora = (consulta.hora || '').slice(0, 5);
    const nome = (lead?.nome || 'Paciente').toUpperCase();
    const proc = consulta.observacoes || consulta.procedimento || 'Consulta';
    const agPor = consulta.agendado_por
      ? `<div class="sched-agendado-por" style="font-size:11px;color:var(--text-muted);margin-top:2px;"><i class="ti ti-user" style="font-size:11px;"></i> Agendado por: <strong style="color:var(--text-secondary);">${consulta.agendado_por}</strong></div>`
      : '';
    return `
      <div class="sched-time" style="color:var(--gold);">${hora}</div>
      <div class="sched-line-col"><div class="sched-dot" style="background:var(--green);"></div></div>
      <div class="sched-info">
        <div class="sched-name">${nome}</div>
        <div class="sched-proc">${proc}</div>
        ${agPor}
        <div class="sched-acts" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;"></div>
      </div>`;
  }

  function injetarFaltantes() {
    const container = document.getElementById('agendaList');
    if (!container) return;
    if (typeof CAL === 'undefined' || !Array.isArray(CAL.consultas)) return;

    const data = dataExibida();
    if (!data) return; // sem saber o dia, não injeta (evita pôr consultas de outros dias)

    // só as consultas DO DIA exibido
    const consultasDia = CAL.consultas.filter(c => c.hora && String(c.data).slice(0, 10) === data);

    // ids já na tela
    const idsNaTela = new Set();
    container.querySelectorAll('.sched-item[onclick]').forEach(el => {
      const m = (el.getAttribute('onclick') || '').match(/openEditConsulta\('([^']+)'\)/);
      if (m) idsNaTela.add(m[1]);
    });

    let injetou = false;
    for (const consulta of consultasDia) {
      if (idsNaTela.has(consulta.id)) continue;
      if (container.querySelector(`[data-inj-consulta="${consulta.id}"]`)) continue;

      // acha âncora: item NA TELA do mesmo horário
      let ancora = null;
      container.querySelectorAll('.sched-item[onclick]').forEach(item => {
        const timeEl = item.querySelector('.sched-time');
        if (timeEl && timeEl.textContent.trim() === (consulta.hora || '').slice(0, 5)) ancora = item;
      });
      if (!ancora) continue; // só injeta se há outro do mesmo horário (caso overbooking)

      const lead = (typeof STATE !== 'undefined' && STATE.leads)
        ? STATE.leads.find(l => l.id === consulta.lead_id) : null;

      const novo = document.createElement('div');
      novo.className = 'sched-item';
      novo.style.cssText = 'cursor:pointer;flex-wrap:wrap;';
      novo.setAttribute('onclick', `openEditConsulta('${consulta.id}')`);
      novo.setAttribute('data-inj-consulta', consulta.id);
      novo.innerHTML = montarItemHTML(consulta, lead);
      ancora.parentNode.insertBefore(novo, ancora.nextSibling);
      injetou = true;
    }

    if (injetou && typeof window.aplicarSemaforoAgenda === 'function') {
      setTimeout(window.aplicarSemaforoAgenda, 30);
    }
  }
  window.injetarConsultasFaltantes = injetarFaltantes;

  // MutationObserver: re-injeta sempre que a agenda re-renderizar
  // (outros fixes redesenham depois do meu e apagavam a injeção)
  function instalarObserver() {
    const container = document.getElementById('agendaList');
    if (!container) return false;
    if (window.__mhObserver) return true;
    let deb = null;
    const obs = new MutationObserver((muts) => {
      // ignora mudanças que EU mesmo fiz (itens injetados)
      const souEu = muts.every(m => Array.from(m.addedNodes).every(n => n.nodeType === 1 && n.hasAttribute && n.hasAttribute('data-inj-consulta')));
      if (souEu) return;
      clearTimeout(deb);
      deb = setTimeout(injetarFaltantes, 120);
    });
    obs.observe(container, { childList: true, subtree: true });
    window.__mhObserver = true;
    return true;
  }

  // hooks de render
  function hook(nome) {
    if (typeof window[nome] !== 'function') return false;
    if (window['__mhHook_' + nome]) return true;
    const _orig = window[nome];
    window[nome] = function (...args) {
      const r = _orig.apply(this, args);
      [150, 400, 800].forEach(ms => setTimeout(injetarFaltantes, ms));
      return r;
    };
    window['__mhHook_' + nome] = true;
    return true;
  }

  function instalar() {
    let ok = false;
    ['renderAgenda', 'renderDaySchedule'].forEach(n => { if (hook(n)) ok = true; });
    if (instalarObserver()) ok = true;
    return ok;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }

  if (typeof window.showPage === 'function') {
    const _origShow = window.showPage;
    window.showPage = function (id, el) {
      _origShow(id, el);
      if (id === 'agenda') { instalarObserver(); [300, 800].forEach(ms => setTimeout(injetarFaltantes, ms)); }
    };
  }

  console.log('✅ agenda-mesmo-horario-fix.js (v2) carregado — todos do mesmo horário aparecem');
})();
