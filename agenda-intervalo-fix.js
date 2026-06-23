// ============================================================
// CLINICALEAD — AGENDAMENTO COM INTERVALO (início → fim)
// Permite marcar "das 10:00 às 12:00": cria UM agendamento (com
// hora_fim) e a agenda mostra o bloco esticado, travando os
// horários do meio. Relatórios/lembretes/comissão contam 1 só.
// Vazio no "até" = comportamento de hoje (1 horário).
// Requer: coluna consultas.hora_fim. Carregar APÓS agenda-fix.js.
// ============================================================

(function () {
  'use strict';

  function horarios() { return (typeof CAL !== 'undefined' && CAL.horariosDisponiveis) ? CAL.horariosDisponiveis : []; }
  function proximoSlot(h) { const a = horarios(); const i = a.indexOf(h); return (i >= 0 && i < a.length - 1) ? a[i + 1] : h; }
  // slots no intervalo [inicio, fim) — fim exclusivo
  function slotsIntervalo(inicio, fim) {
    const a = horarios();
    if (!fim) return inicio ? [inicio] : [];
    return a.filter(h => h >= inicio && h < fim);
  }

  // ── injeta o campo "Até (opcional)" ao lado da hora ──────────
  function injetarAte() {
    if (document.getElementById('naHoraFimGroup')) { popularAte(); return; }
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

  // engata a injeção quando o modal de agendamento abre
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

  // ── salvar com intervalo (reproduz a versão atual + hora_fim) ─
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

    // conflito: checa TODOS os horários do intervalo (contra consultas e bloqueios)
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

  // ── desenho: marca o bloco (esticado) por cima do render ─────
  function linhaDireta(el, lista) { let n = el; while (n && n.parentElement !== lista) n = n.parentElement; return n; }
  function acharLinha(lista, h) {
    const times = lista.querySelectorAll('.sched-time');
    for (const t of times) { if (t.textContent.trim() === h) return linhaDireta(t, lista); }
    return null;
  }

  function marcarBlocos(dateStr) {
    const lista = document.getElementById('agendaList');
    if (!lista) return;
    const blocos = CAL.consultas.filter(c => c.data === dateStr && c.hora_fim);
    blocos.forEach(c => {
      const slots = slotsIntervalo(c.hora, c.hora_fim);
      // anota o início com "até X"
      const ini = acharLinha(lista, c.hora);
      if (ini && !ini.dataset.blocoIni) {
        ini.dataset.blocoIni = '1';
        const t = ini.querySelector('.sched-time');
        const tag = document.createElement('span');
        tag.style.cssText = 'margin-left:8px;font-size:11px;color:var(--gold);border:1px solid var(--gold-border,rgba(201,168,76,.3));border-radius:6px;padding:1px 6px;white-space:nowrap;';
        tag.textContent = 'até ' + c.hora_fim;
        if (t && t.parentElement) t.parentElement.insertBefore(tag, t.nextSibling); else ini.appendChild(tag);
      }
      // marca os horários do meio como "continuação" (trava o agendamento por cima)
      slots.slice(1).forEach(h => {
        const row = acharLinha(lista, h);
        if (row && !row.dataset.blocoCont) {
          row.dataset.blocoCont = '1';
          row.innerHTML = `
            <div class="sched-time" style="opacity:.5;">${h}</div>
            <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);opacity:.75;">
              <i class="ti ti-arrow-bar-to-down" style="font-size:13px;"></i>Continuação — ${c.hora} às ${c.hora_fim}
            </div>`;
          row.style.background = 'var(--gold-pale, rgba(201,168,76,0.06))';
        }
      });
    });
  }

  if (typeof renderDaySchedule === 'function') {
    const _rds = renderDaySchedule;
    renderDaySchedule = function (dateStr) {
      const r = _rds(dateStr);
      try { marcarBlocos(dateStr); } catch (e) { console.error('[bloco agenda]', e); }
      return r;
    };
  }

  console.log('✅ agenda-intervalo-fix.js carregado — agendamento com início e fim');
})();
