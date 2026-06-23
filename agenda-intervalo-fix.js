// ============================================================
// CLINICALEAD — AGENDAMENTO COM INTERVALO + ENCAIXE
// • "Até (opcional)": cria UM agendamento com hora_fim; a agenda
//   mostra o bloco e trava os horários do meio (relatório/lembrete
//   /comissão contam 1 só). Vazio = 1 horário (como hoje).
// • "Encaixe": agenda num horário digitado (ex: 11:01), pontual
//   naquele dia. A agenda detecta horários fora da grade e os
//   mostra com o card completo. Sem coluna nova (persiste pela consulta).
// Requer: coluna consultas.hora_fim. Carregar APÓS agenda-fix.js.
// ============================================================

(function () {
  'use strict';

  function horarios() { return (typeof CAL !== 'undefined' && CAL.horariosDisponiveis) ? CAL.horariosDisponiveis : []; }
  function proximoSlot(h) { const a = horarios(); const i = a.indexOf(h); return (i >= 0 && i < a.length - 1) ? a[i + 1] : h; }
  function slotsIntervalo(inicio, fim) {
    const a = horarios();
    if (!fim) return inicio ? [inicio] : [];
    return a.filter(h => h >= inicio && h < fim);
  }

  // ── campo "Até (opcional)" ───────────────────────────────────
  function injetarAte() {
    const existing = document.getElementById('naHoraFimGroup');
    if (existing) { existing.style.display = ''; popularAte(); return; } // reexibe (caso encaixe tenha escondido)
    const naHora = document.getElementById('naHora');
    if (!naHora) return;
    const grupo = naHora.closest('.form-group') || naHora.parentElement;
    const g = document.createElement('div');
    g.className = 'form-group';
    g.id = 'naHoraFimGroup';
    g.innerHTML = `
      <label class="form-label">Até <span style="color:var(--text-muted);font-weight:400;">(opcional — para procedimentos longos)</span></label>
      <select class="form-select" id="naHoraFim"><option value="">— 1 horário —</option></select>`;
    grupo.insertAdjacentElement('afterend', g);
    naHora.addEventListener('change', popularAte);
    popularAte();
  }

  function popularAte() {
    const naHora = document.getElementById('naHora');
    const sel = document.getElementById('naHoraFim');
    if (!naHora || !sel) return;
    const inicio = naHora.value;
    const a = horarios();
    const idx = a.indexOf(inicio);
    const opts = (idx >= 0) ? a.filter((h, i) => i > idx) : [];
    const atual = sel.value;
    sel.innerHTML = '<option value="">— 1 horário —</option>' + opts.map(h => `<option value="${h}">${h}</option>`).join('');
    if (opts.includes(atual)) sel.value = atual;
  }

  ['openNovoAgendamento', 'openNovoAgendamentoHora'].forEach(fn => {
    if (typeof window[fn] === 'function') {
      const _orig = window[fn];
      window[fn] = function (...args) {
        const r = _orig.apply(this, args);
        setTimeout(injetarAte, 130);
        return r;
      };
    }
  });

  // ── ENCAIXE: agenda em horário digitado (pontual no dia) ─────
  window.abrirEncaixe = function () {
    const hora = prompt('Encaixe — horário no formato HH:MM (ex: 11:01):', '');
    if (!hora) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) { if (typeof toast === 'function') toast('Use o formato HH:MM (ex: 11:01)', 'error'); return; }
    const dateStr = (typeof CAL !== 'undefined' && CAL.selectedDate) ? CAL.selectedDate : new Date().toISOString().split('T')[0];
    if (typeof openNovoAgendamento === 'function') openNovoAgendamento();
    setTimeout(() => {
      const naData = document.getElementById('naData'); if (naData) naData.value = dateStr;
      const sel = document.getElementById('naHora');
      if (sel) {
        if (!Array.from(sel.options).some(o => o.value === hora)) {
          const opt = document.createElement('option');
          opt.value = hora; opt.textContent = hora + ' (encaixe)';
          sel.appendChild(opt);
        }
        sel.value = hora;
      }
      const fimSel = document.getElementById('naHoraFim'); if (fimSel) fimSel.value = '';
      const fimGroup = document.getElementById('naHoraFimGroup'); if (fimGroup) fimGroup.style.display = 'none';
    }, 170);
  };

  // ── salvar (intervalo + encaixe) ─────────────────────────────
  salvarNovoAgendamento = async function () {
    const leadId = document.getElementById('naLead').value;
    const data = document.getElementById('naData').value;
    const hora = document.getElementById('naHora').value;
    const horaFim = document.getElementById('naHoraFim') ? document.getElementById('naHoraFim').value : '';
    const obs = document.getElementById('naObs').value;
    const procedimento = document.getElementById('naProcedimento') ? (document.getElementById('naProcedimento').value || null) : null;
    if (!leadId || !data || !hora) { toast('Preencha paciente, data e horário', 'error'); return; }
    if (horaFim && horaFim <= hora) { toast('A hora final precisa ser depois da inicial', 'error'); return; }
    const clinic = currentClinic();

    // conflito: checa o intervalo inteiro (consultas + bloqueios)
    const slots = slotsIntervalo(hora, horaFim);
    const ocup = new Set();
    CAL.consultas.filter(c => c.data === data).forEach(c => {
      const f = c.hora_fim || proximoSlot(c.hora);
      slotsIntervalo(c.hora, f).forEach(s => ocup.add(s));
      ocup.add(c.hora);
    });
    ((CAL.horasBloqueadas && CAL.horasBloqueadas[data]) || []).forEach(s => ocup.add(s));
    const conflito = slots.find(s => ocup.has(s));
    if (conflito) { toast(`O horário ${conflito} já está ocupado nesse intervalo`, 'error'); return; }

    // encaixe (horário fora da grade) dentro de um procedimento → confirma
    const foraDaGrade = !horarios().includes(hora);
    if (foraDaGrade) {
      const dentro = CAL.consultas.find(c => c.data === data && c.hora_fim && hora > c.hora && hora < c.hora_fim);
      if (dentro && !confirm(`Atenção: ${hora} está dentro de um procedimento (${dentro.hora}–${dentro.hora_fim}). Confirmar o encaixe mesmo assim?`)) return;
    }

    const nova = { clinic_id: clinic.id, lead_id: leadId, data, hora, hora_fim: horaFim || null, status: 'agendado', observacoes: obs, procedimento };
    const { data: saved, error } = await db.from('consultas').insert(nova).select().single();
    if (error) { toast('Erro: ' + error.message, 'error'); return; }
    CAL.consultas.push(saved);

    const lead = STATE.leads.find(l => l.id === leadId);
    if (lead && lead.status === 'novo' || lead?.status === 'contato') {
      lead.status = 'agendado';
      await db.from('leads').update({ status: 'agendado' }).eq('id', leadId);
    }

    closeModal('modalNovoAgendamento');
    CAL.selectedDate = data;
    renderCalendar();
    renderDaySchedule(data);
    toast('Consulta agendada! ✓');

    if (clinic?.whatsapp_instance && lead?.telefone) {
      try {
        const { data: autoConf } = await db.from('automacoes')
          .select('mensagem,ativo').eq('clinic_id', clinic.id).eq('tipo', 'confirmacao').maybeSingle();
        let template = null;
        if (autoConf) template = autoConf.ativo ? autoConf.mensagem : null;
        else if (typeof AUTOMACOES_DEFAULTS !== 'undefined') template = AUTOMACOES_DEFAULTS.find(a => a.tipo === 'confirmacao')?.msg || null;
        if (template) {
          const dataFormatada = new Date(data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
          const horaTexto = horaFim ? `${hora} às ${horaFim}` : hora;
          const msg = template
            .replaceAll('{nome}', lead.nome || '')
            .replaceAll('{clinica}', clinic.nome || clinic.name || '')
            .replaceAll('{data}', dataFormatada)
            .replaceAll('{hora}', horaTexto)
            .replaceAll('{procedimento}', procedimento || lead.procedimento || 'sua avaliação');
          await sendWhatsAppMessage(clinic.whatsapp_instance, lead.telefone, msg);
          toast('Confirmação enviada por WhatsApp! ✓');
        }
      } catch (e) {}
    }
  };

  // ── desenho por cima do render ───────────────────────────────
  function linhaDireta(el, lista) { let n = el; while (n && n.parentElement !== lista) n = n.parentElement; return n; }
  function acharLinha(lista, h) {
    const times = lista.querySelectorAll('.sched-time');
    for (const t of times) { if (t.textContent.trim() === h) return linhaDireta(t, lista); }
    return null;
  }

  // marca os blocos (intervalo) de forma discreta
  function marcarBlocos(dateStr) {
    const lista = document.getElementById('agendaList');
    if (!lista) return;
    CAL.consultas.filter(c => c.data === dateStr && c.hora_fim).forEach(c => {
      const slots = slotsIntervalo(c.hora, c.hora_fim);
      const ini = acharLinha(lista, c.hora);
      if (ini && !ini.dataset.blocoIni) {
        ini.dataset.blocoIni = '1';
        const t = ini.querySelector('.sched-time');
        const tag = document.createElement('span');
        tag.style.cssText = 'margin-left:8px;font-size:11px;color:var(--gold);border:1px solid var(--gold-border,rgba(201,168,76,.3));border-radius:6px;padding:1px 6px;white-space:nowrap;';
        tag.textContent = 'até ' + c.hora_fim;
        if (t && t.parentElement) t.parentElement.insertBefore(tag, t.nextSibling); else ini.appendChild(tag);
      }
      const meio = slots.slice(1);
      meio.forEach((h, i) => {
        const row = acharLinha(lista, h);
        if (row && !row.dataset.blocoCont) {
          row.dataset.blocoCont = '1';
          const rotulo = (i === 0)
            ? `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);"><i class="ti ti-lock" style="font-size:12px;"></i>Ocupado · ${c.hora}–${c.hora_fim}</div>`
            : '';
          row.innerHTML = `<div class="sched-time" style="opacity:.38;">${h}</div>${rotulo}`;
          row.style.borderLeft = '3px solid var(--gold, #C9A84C)';
          row.style.background = 'var(--gold-pale, rgba(201,168,76,0.05))';
        }
      });
    });
  }

  // marca os encaixes (horários fora da grade) com um selo
  function marcarEncaixes(dateStr) {
    const lista = document.getElementById('agendaList');
    if (!lista) return;
    const grade = horarios();
    CAL.consultas.filter(c => c.data === dateStr && c.hora && !grade.includes(c.hora)).forEach(c => {
      const row = acharLinha(lista, c.hora);
      if (row && !row.dataset.encaixeTag) {
        row.dataset.encaixeTag = '1';
        const t = row.querySelector('.sched-time');
        const tag = document.createElement('span');
        tag.textContent = 'encaixe';
        tag.style.cssText = 'margin-left:6px;font-size:10px;color:var(--blue,#5B8DB8);border:1px solid var(--blue,#5B8DB8);border-radius:5px;padding:0 5px;white-space:nowrap;';
        if (t && t.parentElement) t.parentElement.insertBefore(tag, t.nextSibling); else row.appendChild(tag);
      }
    });
  }

  // botão "Encaixe" na barra de ações do dia (reaplicado a cada render)
  function injetarBotaoEncaixe() {
    const actions = document.getElementById('agendaDayActions');
    if (!actions || document.getElementById('btnEncaixe')) return;
    const b = document.createElement('button');
    b.id = 'btnEncaixe';
    b.className = 'btn btn-sm';
    b.style.cssText = 'border:1px solid var(--blue,#5B8DB8);color:var(--blue,#5B8DB8);';
    b.innerHTML = '<i class="ti ti-calendar-plus"></i> Encaixe';
    b.onclick = window.abrirEncaixe;
    actions.appendChild(b);
  }

  if (typeof renderDaySchedule === 'function') {
    const _rds = renderDaySchedule;
    renderDaySchedule = function (dateStr) {
      // inclui horários de encaixe (fora da grade) na renderização do dia
      const base = (typeof CAL !== 'undefined') ? CAL.horariosDisponiveis : null;
      let restore = null;
      try {
        if (base) {
          const extras = CAL.consultas.filter(c => c.data === dateStr).map(c => c.hora)
            .filter(h => h && !base.includes(h));
          if (extras.length) {
            restore = base;
            CAL.horariosDisponiveis = Array.from(new Set(base.concat(extras))).sort();
          }
        }
      } catch (e) {}
      const r = _rds(dateStr);
      if (restore) CAL.horariosDisponiveis = restore;
      try { marcarBlocos(dateStr); marcarEncaixes(dateStr); injetarBotaoEncaixe(); } catch (e) { console.error('[agenda extra]', e); }
      return r;
    };
  }

  console.log('✅ agenda-intervalo-fix.js carregado — intervalo + encaixe');
})();
