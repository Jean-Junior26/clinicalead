// ============================================================
// CLINICALEAD — AGENDA POR DENTISTA (Multi-dentista Fase 4)
// Filtro no topo da agenda: ver "Todos" ou 1 dentista por vez.
// Quando filtra por 1 dentista, mostra SÓ as consultas dele
// (resolve o overbooking: cada dentista tem seu próprio espaço).
// Também respeita horário próprio do dentista (meio período).
// Carregar DEPOIS dos outros fixes de agenda no index.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }
  function dentistas() { return (typeof window.DENT_lista === 'function') ? window.DENT_lista() : []; }

  // dentista selecionado no filtro (null = todos)
  window.AGENDA_DENTISTA_FILTRO = null;

  // ── injeta o seletor de dentista no topo da agenda ──
  function injetarFiltro() {
    const header = document.querySelector('.sched-header') || document.getElementById('agendaDayTitle')?.closest('div')?.parentElement;
    if (!header) return;
    if (document.getElementById('filtroDentista')) {
      atualizarOpcoes(); // já existe, só atualiza as opções
      return;
    }

    const lista = dentistas();
    // só mostra o seletor se houver 2+ dentistas (1 dentista só = agenda geral, nada muda)
    if (lista.length < 2) return;

    const wrap = document.createElement('div');
    wrap.id = 'filtroDentistaWrap';
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;';
    wrap.innerHTML = `
      <span style="font-size:12px;color:var(--text-secondary,#8A8570);">Ver agenda de:</span>
      <select id="filtroDentista" style="padding:6px 10px;border-radius:8px;background:var(--bg-input,#16161A);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:13px;cursor:pointer;">
        <option value="">Agenda geral (todos)</option>
      </select>`;

    // insere logo após o título da agenda
    const titulo = document.getElementById('agendaDayTitle');
    if (titulo && titulo.parentElement) {
      titulo.parentElement.parentElement.appendChild(wrap);
    } else {
      header.appendChild(wrap);
    }

    atualizarOpcoes();

    document.getElementById('filtroDentista').addEventListener('change', function () {
      window.AGENDA_DENTISTA_FILTRO = this.value || null;
      aplicarFiltro();
    });
  }

  // popula/atualiza as opções do select com os dentistas atuais
  function atualizarOpcoes() {
    const sel = document.getElementById('filtroDentista');
    if (!sel) return;
    const lista = dentistas();
    const atual = window.AGENDA_DENTISTA_FILTRO || '';
    sel.innerHTML = '<option value="">Agenda geral (todos)</option>'
      + lista.map(d => `<option value="${d.id}" ${atual === d.id ? 'selected' : ''}>${d.nome}</option>`).join('');
  }

  // ── aplica o filtro: esconde consultas que não são do dentista escolhido ──
  function aplicarFiltro() {
    const container = document.getElementById('agendaList');
    if (!container) return;
    const filtro = window.AGENDA_DENTISTA_FILTRO;

    container.querySelectorAll('.sched-item[onclick]').forEach(item => {
      const m = (item.getAttribute('onclick') || '').match(/openEditConsulta\('([^']+)'\)/);
      if (!m) return;
      const consultaId = m[1];
      const consulta = (typeof CAL !== 'undefined' && CAL.consultas)
        ? CAL.consultas.find(c => c.id === consultaId) : null;
      if (!consulta) return;

      if (!filtro) {
        // "Todos": mostra tudo
        item.style.display = '';
      } else {
        // 1 dentista: mostra só as consultas dele
        item.style.display = (consulta.dentista_id === filtro) ? '' : 'none';
      }
    });

    // mostra um aviso se filtrando e não houver consultas do dentista
    mostrarAvisoVazio(filtro);
  }
  window.aplicarFiltroDentista = aplicarFiltro;

  function mostrarAvisoVazio(filtro) {
    const container = document.getElementById('agendaList');
    if (!container) return;
    let aviso = document.getElementById('avisoDentistaVazio');
    if (!filtro) { if (aviso) aviso.remove(); return; }

    const visiveis = Array.from(container.querySelectorAll('.sched-item[onclick]'))
      .filter(i => i.style.display !== 'none').length;

    if (visiveis === 0) {
      if (!aviso) {
        aviso = document.createElement('div');
        aviso.id = 'avisoDentistaVazio';
        aviso.style.cssText = 'padding:24px;text-align:center;color:var(--text-muted,#888);font-size:13px;';
        const dent = dentistas().find(d => d.id === filtro);
        aviso.textContent = `Nenhuma consulta para ${dent ? dent.nome : 'este dentista'} neste dia.`;
        container.appendChild(aviso);
      }
    } else if (aviso) {
      aviso.remove();
    }
  }

  // reaplica filtro + injeta seletor após cada render
  function aposRender() {
    injetarFiltro();
    if (window.AGENDA_DENTISTA_FILTRO) setTimeout(aplicarFiltro, 100);
  }

  function hook(nome) {
    if (typeof window[nome] !== 'function') return false;
    if (window['__pdHook_' + nome]) return true;
    const _orig = window[nome];
    window[nome] = function (...args) {
      const r = _orig.apply(this, args);
      [200, 500, 950].forEach(ms => setTimeout(aposRender, ms));
      return r;
    };
    window['__pdHook_' + nome] = true;
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
  setTimeout(aposRender, 1500);

  console.log('✅ agenda-por-dentista-fix.js carregado — filtro por dentista');
})();
