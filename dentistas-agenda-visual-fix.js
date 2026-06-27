// ============================================================
// CLINICALEAD — MULTI-DENTISTA NA AGENDA VISUAL (Fase 3)
// Quando um horário tem MAIS de uma consulta (dentistas diferentes),
// mostra TODAS na mesma linha (a agenda original mostra só uma).
// Adiciona os cards extras dos outros dentistas, sem reescrever a render.
// Carregar DEPOIS de dentistas-agendamento-fix.js.
// ============================================================
(function () {
  'use strict';

  function dentistas() { return (typeof window.DENT_lista === 'function') ? window.DENT_lista() : []; }

  function mapaDentistas() {
    const m = {};
    dentistas().forEach(d => { m[d.id] = d; });
    return m;
  }

  // adiciona os cards das consultas EXTRAS (mesmo horário, outro dentista)
  function adicionarExtras() {
    if (typeof CAL === 'undefined' || !Array.isArray(CAL.consultas)) return;
    const lista = document.getElementById('agendaList');
    if (!lista) return;
    const mDent = mapaDentistas();

    // agrupa as consultas do dia por horário
    const porHora = {};
    CAL.consultas.filter(c => c.data === CAL.selectedDate && c.status !== 'cancelado').forEach(c => {
      if (!porHora[c.hora]) porHora[c.hora] = [];
      porHora[c.hora].push(c);
    });

    // pra cada horário com 2+ consultas, adiciona os cards que faltam
    Object.keys(porHora).forEach(hora => {
      const consultas = porHora[hora];
      if (consultas.length < 2) {
        // 1 consulta: só marca o dentista (se tiver) na linha existente
        if (consultas[0] && consultas[0].dentista_id) marcarDentista(consultas[0], mDent);
        return;
      }

      // acha a linha desse horário
      const row = acharLinha(lista, hora);
      if (!row) return;

      // qual consulta a linha ORIGINAL está mostrando? (pelo onclick openEditConsulta(ID))
      const idMostrado = extrairId(row);
      // marca o dentista na consulta já mostrada
      const jaMostrada = consultas.find(c => c.id === idMostrado) || consultas[0];
      if (jaMostrada) marcarDentista(jaMostrada, mDent);

      // adiciona os cards das OUTRAS consultas (que não estão na tela)
      const outras = consultas.filter(c => c.id !== (jaMostrada ? jaMostrada.id : null));
      outras.forEach(c => {
        if (row.querySelector(`[data-extra-id="${c.id}"]`)) return; // já adicionado
        const card = montarCardExtra(c, mDent);
        row.appendChild(card);
      });
      // ajusta a linha pra empilhar (flex-wrap)
      row.style.flexWrap = 'wrap';
    });
  }

  function acharLinha(lista, hora) {
    const times = lista.querySelectorAll('.sched-time');
    for (const t of times) {
      if (t.textContent.trim() === hora) {
        let n = t; while (n && n.parentElement !== lista) n = n.parentElement;
        return n;
      }
    }
    return null;
  }

  function extrairId(row) {
    const onclick = row.getAttribute('onclick') || '';
    const m = onclick.match(/openEditConsulta\('([^']+)'\)/);
    return m ? m[1] : null;
  }

  function nomeLead(c) {
    // tenta achar o nome do lead pela lista global, senão usa o que tiver
    const leads = (typeof STATE !== 'undefined' && STATE.leads) ? STATE.leads : [];
    const l = leads.find(x => x.id === c.lead_id);
    return (l && l.nome) ? l.nome : 'Paciente';
  }

  function marcarDentista(c, mDent) {
    if (!c.dentista_id) return;
    const dent = mDent[c.dentista_id];
    if (!dent) return;
    const lista = document.getElementById('agendaList');
    const row = acharLinha(lista, c.hora);
    if (!row || row.querySelector('.dent-badge-main')) return;
    const info = row.querySelector('.sched-info');
    const acts = row.querySelector('.sched-acts') || info;
    if (!acts) return;
    const badge = document.createElement('span');
    badge.className = 'dent-badge-main';
    badge.style.cssText = `margin-left:6px;font-size:10px;padding:1px 7px;border-radius:5px;background:${dent.cor}22;color:${dent.cor};border:1px solid ${dent.cor}66;white-space:nowrap;`;
    badge.textContent = '🦷 ' + dent.nome;
    acts.appendChild(badge);
  }

  function montarCardExtra(c, mDent) {
    const dent = c.dentista_id ? mDent[c.dentista_id] : null;
    const cor = dent ? dent.cor : 'var(--gold,#C9A84C)';
    const div = document.createElement('div');
    div.setAttribute('data-extra-id', c.id);
    div.style.cssText = `flex:1 1 100%;margin-top:8px;padding:8px 12px;border-left:3px solid ${cor};background:${cor}11;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:10px;flex-wrap:wrap;`;
    div.onclick = (e) => { e.stopPropagation(); if (typeof openEditConsulta === 'function') openEditConsulta(c.id); };

    const statusLabel = { agendado: 'Agendado', confirmado: 'Confirmado', compareceu: 'Compareceu', faltou: 'Faltou' }[c.status] || c.status;
    div.innerHTML = `
      <span style="font-weight:600;font-size:14px;color:var(--text-primary,#F0EAD6);">${nomeLead(c)}</span>
      <span style="font-size:12px;color:var(--text-secondary,#8A8570);">${c.procedimento || 'Avaliação'}</span>
      ${dent ? `<span style="font-size:10px;padding:1px 7px;border-radius:5px;background:${dent.cor}22;color:${dent.cor};border:1px solid ${dent.cor}66;white-space:nowrap;">🦷 ${dent.nome}</span>` : ''}
      <span class="badge" style="font-size:11px;padding:1px 8px;border-radius:5px;border:1px solid var(--gold-border,rgba(201,168,76,0.3));color:var(--text-primary,#F0EAD6);">${statusLabel}</span>`;
    return div;
  }

  // envelopa a render pra adicionar os extras depois de desenhar
  function instalar() {
    if (typeof renderDaySchedule !== 'function') { setTimeout(instalar, 400); return; }
    if (window.__dentVisualInstalado) return;
    window.__dentVisualInstalado = true;
    const _orig = renderDaySchedule;
    window.renderDaySchedule = function (...args) {
      const r = _orig.apply(this, args);
      setTimeout(adicionarExtras, 160); // depois dos outros fixes
      return r;
    };
    // re-renderiza o dia atual
    if (typeof CAL !== 'undefined' && CAL.selectedDate) setTimeout(() => renderDaySchedule(CAL.selectedDate), 300);
    console.log('✅ dentistas-agenda-visual-fix.js instalado (Fase 3)');
  }

  setTimeout(instalar, 1000);
})();
