// ============================================================
// CLINICALEAD — FIX URGENTE: botões do 2º paciente no mesmo horário
// PROBLEMA: quando há 2+ consultas no MESMO horário (overbooking),
// o 2º paciente às vezes fica SEM os botões (confirmar/comparecer/
// inbox/cadastro) porque o semáforo roda antes do item existir, ou
// o realtime recarrega a agenda sem reaplicar os botões.
// SOLUÇÃO: reaplica o semáforo logo após cada render (várias vezes,
// rápido) E observa mudanças no DOM da agenda (MutationObserver).
// Não substitui o semáforo — só GARANTE que ele rode na hora certa.
// Carregar DEPOIS do agenda-semaforo-fix.js no index.
// ============================================================
(function () {
  'use strict';

  function temSemaforo() { return typeof window.aplicarSemaforoAgenda === 'function'; }

  // reaplica o semáforo várias vezes em sequência curta (cobre render tardio)
  function reaplicarRapido() {
    if (!temSemaforo()) return;
    // dispara em vários momentos pra pegar itens que renderizam atrasados
    [0, 80, 200, 450, 900].forEach(ms => setTimeout(() => {
      try { window.aplicarSemaforoAgenda(); } catch (e) {}
    }, ms));
  }

  // 1) Engancha no renderDaySchedule pra reaplicar rápido após cada render
  function instalarHookRender() {
    if (typeof window.renderDaySchedule !== 'function') return false;
    if (window.__obFixRenderHook) return true;
    const _orig = window.renderDaySchedule;
    window.renderDaySchedule = function (...args) {
      const r = _orig.apply(this, args);
      reaplicarRapido();
      return r;
    };
    window.__obFixRenderHook = true;
    return true;
  }

  // 2) Engancha no renderAgenda (a função base que vimos no console)
  function instalarHookAgenda() {
    if (typeof window.renderAgenda !== 'function') return false;
    if (window.__obFixAgendaHook) return true;
    const _orig = window.renderAgenda;
    window.renderAgenda = function (...args) {
      const r = _orig.apply(this, args);
      reaplicarRapido();
      return r;
    };
    window.__obFixAgendaHook = true;
    return true;
  }

  // 3) MutationObserver: se o conteúdo da agenda mudar (realtime, reabrir),
  //    reaplica os botões automaticamente (garante o 2º paciente sempre)
  function instalarObserver() {
    const container = document.getElementById('agendaList');
    if (!container) return false;
    if (window.__obFixObserver) return true;
    let debounce = null;
    const obs = new MutationObserver(() => {
      // só age se algum item de consulta ficou SEM os botões
      const itens = container.querySelectorAll('.sched-item');
      let faltaBotao = false;
      itens.forEach(item => {
        const onclick = item.getAttribute('onclick') || '';
        if (/openEditConsulta\('([^']+)'\)/.test(onclick)) {
          // item de consulta: deveria ter botão de atendido/registro
          if (!item.querySelector('.btn-atendido, .btn-ver-registro')) faltaBotao = true;
        }
      });
      if (faltaBotao) {
        clearTimeout(debounce);
        debounce = setTimeout(reaplicarRapido, 60);
      }
    });
    obs.observe(container, { childList: true, subtree: true });
    window.__obFixObserver = true;
    return true;
  }

  // instala tudo (com retry até as funções/DOM existirem)
  function instalarTudo() {
    instalarHookRender();
    instalarHookAgenda();
    const obsOk = instalarObserver();
    return window.__obFixRenderHook && obsOk;
  }

  if (!instalarTudo()) {
    const iv = setInterval(() => { if (instalarTudo()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }

  // reaplica também ao abrir a página da agenda
  if (typeof window.showPage === 'function') {
    const _origShow = window.showPage;
    window.showPage = function (id, el) {
      _origShow(id, el);
      if (id === 'agenda') { instalarObserver(); reaplicarRapido(); }
    };
  }

  console.log('✅ agenda-overbooking-botoes-fix.js carregado — botões garantidos no mesmo horário');
})();
