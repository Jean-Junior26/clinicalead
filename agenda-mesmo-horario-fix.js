// ============================================================
// CLINICALEAD — FIX: renderizar TODOS os pacientes do mesmo horário
// PROBLEMA RAIZ: a base da agenda renderiza só 1 .sched-item por
// HORÁRIO. Quando há 2+ consultas no mesmo horário (overbooking/
// encaixe), o 2º (3º...) paciente NÃO é desenhado na tela — some.
// SOLUÇÃO: após o render, detecta consultas do dia que ficaram de
// fora (mesmo horário) e INJETA cada uma como .sched-item completo,
// logo após o item do mesmo horário já renderizado. O semáforo
// depois decora normalmente (cor + botões).
// Carregar DEPOIS do semáforo e dos outros fixes de agenda.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }

  // descobre qual a data sendo exibida na agenda (pelo título ou CAL)
  function dataExibida() {
    if (typeof CAL !== 'undefined' && CAL.dataAtual) return CAL.dataAtual;
    if (typeof CAL !== 'undefined' && CAL.data) return CAL.data;
    // tenta achar pela data selecionada
    return null;
  }

  // monta o HTML de um item de consulta no MESMO formato da base
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

  // injeta os pacientes que faltaram (mesmo horário)
  async function injetarFaltantes() {
    const container = document.getElementById('agendaList');
    if (!container) return;

    const data = dataExibida();
    // pega as consultas do dia exibido a partir do CAL
    if (typeof CAL === 'undefined' || !Array.isArray(CAL.consultas)) return;

    // agrupa consultas por horário (do dia exibido, se souber a data)
    const consultasDia = CAL.consultas.filter(c => {
      if (!c.hora) return false;
      if (data && c.data !== data) return false;
      return true;
    });

    // quais consultaIds JÁ estão renderizados na tela
    const idsNaTela = new Set();
    container.querySelectorAll('.sched-item[onclick]').forEach(el => {
      const m = (el.getAttribute('onclick') || '').match(/openEditConsulta\('([^']+)'\)/);
      if (m) idsNaTela.add(m[1]);
    });

    // pra cada consulta do dia que NÃO está na tela, injeta
    for (const consulta of consultasDia) {
      if (idsNaTela.has(consulta.id)) continue; // já está na tela

      // acha outro item NA TELA com o mesmo horário (pra injetar logo após)
      let ancora = null;
      const itens = container.querySelectorAll('.sched-item[onclick]');
      for (const item of itens) {
        const timeEl = item.querySelector('.sched-time');
        if (timeEl && timeEl.textContent.trim() === (consulta.hora || '').slice(0, 5)) {
          ancora = item;
        }
      }
      if (!ancora) continue; // não achou âncora do mesmo horário (não é caso de overbooking visível)

      // evita injetar 2x
      if (container.querySelector(`[data-inj-consulta="${consulta.id}"]`)) continue;

      // acha o lead
      const lead = (typeof STATE !== 'undefined' && STATE.leads)
        ? STATE.leads.find(l => l.id === consulta.lead_id) : null;

      // cria o item completo
      const novo = document.createElement('div');
      novo.className = 'sched-item';
      novo.style.cssText = 'cursor:pointer;flex-wrap:wrap;';
      novo.setAttribute('onclick', `openEditConsulta('${consulta.id}')`);
      novo.setAttribute('data-inj-consulta', consulta.id);
      novo.innerHTML = montarItemHTML(consulta, lead);

      // insere logo APÓS a âncora (mesmo horário, fica agrupado)
      ancora.parentNode.insertBefore(novo, ancora.nextSibling);
    }

    // manda o semáforo decorar (cor + botões) os itens recém-criados
    if (typeof window.aplicarSemaforoAgenda === 'function') {
      setTimeout(window.aplicarSemaforoAgenda, 30);
    }
  }
  window.injetarConsultasFaltantes = injetarFaltantes;

  // roda após cada render da agenda
  function hook(nome) {
    if (typeof window[nome] !== 'function') return false;
    if (window['__mhHook_' + nome]) return true;
    const _orig = window[nome];
    window[nome] = function (...args) {
      const r = _orig.apply(this, args);
      [120, 350, 700].forEach(ms => setTimeout(injetarFaltantes, ms));
      return r;
    };
    window['__mhHook_' + nome] = true;
    return true;
  }

  function instalar() {
    let ok = false;
    ['renderAgenda', 'renderDaySchedule'].forEach(n => { if (hook(n)) ok = true; });
    return ok;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }

  // reforço ao abrir a agenda
  if (typeof window.showPage === 'function') {
    const _origShow = window.showPage;
    window.showPage = function (id, el) {
      _origShow(id, el);
      if (id === 'agenda') [300, 800].forEach(ms => setTimeout(injetarFaltantes, ms));
    };
  }

  console.log('✅ agenda-mesmo-horario-fix.js carregado — todos os pacientes do mesmo horário aparecem');
})();
