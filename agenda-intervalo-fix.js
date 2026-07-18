// ============================================================
// CLINICALEAD — AGENDAMENTO COM INTERVALO + ENCAIXE
// • "Até (opcional)": cria UM agendamento com hora_fim; agenda mostra
//   o bloco e trava os horários do meio (relatório/lembrete/comissão
//   contam 1 só). Vazio = 1 horário (como hoje).
// • "Encaixe": agenda em horário digitado (ex: 11:01), pontual no dia.
//   O horário entra na lista do dia (sem desfazer) → o card sai COMPLETO
//   (nome, botões, badges), igual a um agendamento normal.
// A lógica de bloco/conflito usa a GRADE PURA (sem encaixes).
// Requer: coluna consultas.hora_fim. Carregar APÓS agenda-fix.js.
// ============================================================

(function () {
  'use strict';

  let gradeBase = [];      // grade fixa da clínica (sem encaixes)
  let ultimoExtras = [];   // horários de encaixe que adicionamos por último

  function horarios() { return gradeBase.length ? gradeBase : ((typeof CAL !== 'undefined' && CAL.horariosDisponiveis) ? CAL.horariosDisponiveis : []); }
  function proximoSlot(h) { const a = horarios(); const i = a.indexOf(h); return (i >= 0 && i < a.length - 1) ? a[i + 1] : h; }
  function slotsIntervalo(inicio, fim) {
    const a = horarios();
    if (!fim) return inicio ? [inicio] : [];
    return a.filter(h => h >= inicio && h < fim);
  }

  // ── campo "Até (opcional)" ───────────────────────────────────
  function injetarAte() {
    const existing = document.getElementById('naHoraFimGroup');
    if (existing) { existing.style.display = ''; popularAte(); return; }
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
      window[fn] = function (...args) { const r = _orig.apply(this, args); setTimeout(injetarAte, 130); return r; };
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
        // .limit(1) em vez de .maybeSingle(): se existir mais de uma linha
        // (duplicata), .maybeSingle() falhava e o código caía no fallback
        // "sempre ativo". Agora erro de consulta = não envia (seguro por padrão).
        const { data: autoConfRows, error: autoConfError } = await db.from('automacoes')
          .select('mensagem,ativo,updated_at')
          .eq('clinic_id', clinic.id).eq('tipo', 'confirmacao')
          .order('updated_at', { ascending: false, nullsFirst: false })
          .limit(1);

        let template = null;
        let deveEnviar = true; // padrão: tenta enviar (clínica sem automação configurada ainda)

        if (autoConfError) {
          console.error('[agenda-intervalo] erro ao consultar automação de confirmação, NÃO enviando por segurança:', autoConfError.message);
          deveEnviar = false;
        } else if (autoConfRows && autoConfRows.length > 0) {
          const autoConf = autoConfRows[0];
          if (autoConf.ativo) {
            template = autoConf.mensagem;
          } else {
            // ── A clínica desativou essa automação de propósito.
            // Antes, isso era ignorado e a "GARANTIA" abaixo mandava um
            // fallback fixo mesmo assim. Agora, desativado = NÃO ENVIA NADA.
            deveEnviar = false;
          }
        } else if (typeof AUTOMACOES_DEFAULTS !== 'undefined') {
          template = AUTOMACOES_DEFAULTS.find(a => a.tipo === 'confirmacao')?.msg || null;
        }

        // ── GARANTIA: só entra aqui se a clínica NUNCA configurou essa
        // automação (nem specific, nem erro, nem desativada de propósito).
        if (deveEnviar && !template) {
          template = 'Olá, {nome}! 🎉 Sua consulta está *confirmada*!\n\n📅 *Data:* {data}\n⏰ *Horário:* {hora}\n\nQualquer dúvida, é só chamar aqui! Te esperamos 😊';
        }

        if (deveEnviar && template) {
          const dataFormatada = new Date(data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
          const horaTexto = horaFim ? `${hora} às ${horaFim}` : hora;
          const msg = template
            .replaceAll('{nome}', lead.nome || '').replaceAll('{clinica}', clinic.nome || clinic.name || '')
            .replaceAll('{data}', dataFormatada).replaceAll('{hora}', horaTexto)
            .replaceAll('{procedimento}', procedimento || lead.procedimento || 'sua avaliação');
          await sendWhatsAppMessage(clinic.whatsapp_instance, lead.telefone, msg);
          toast('Confirmação enviada por WhatsApp! ✓');
        }
      } catch (e) {
        console.error('[agenda-intervalo] falha ao enviar confirmação:', e.message);
        if (typeof toast === 'function') toast('Consulta salva, mas a confirmação por WhatsApp falhou — avise o paciente manualmente.', 'error');
      }
    }
  };

  // ── desenho por cima do render ───────────────────────────────
  function linhaDireta(el, lista) { let n = el; while (n && n.parentElement !== lista) n = n.parentElement; return n; }
  function acharLinha(lista, h) {
    const times = lista.querySelectorAll('.sched-time');
    for (const t of times) { if (t.textContent.trim() === h) return linhaDireta(t, lista); }
    return null;
  }

  function marcarBlocos(dateStr) {
    const lista = document.getElementById('agendaList');
    if (!lista) return;
    // horários que TÊM consulta própria (encaixe) não podem virar "continuação"
    const horasComConsulta = new Set(CAL.consultas.filter(c => c.data === dateStr).map(c => c.hora));
    CAL.consultas.filter(c => c.data === dateStr && c.hora_fim).forEach(c => {
      const slots = slotsIntervalo(c.hora, c.hora_fim); // usa grade pura
      const ini = acharLinha(lista, c.hora);
      if (ini && !ini.dataset.blocoIni) {
        ini.dataset.blocoIni = '1';
        const t = ini.querySelector('.sched-time');
        const tag = document.createElement('span');
        tag.style.cssText = 'margin-left:8px;font-size:11px;color:var(--gold);border:1px solid var(--gold-border,rgba(201,168,76,.3));border-radius:6px;padding:1px 6px;white-space:nowrap;';
        tag.textContent = 'até ' + c.hora_fim;
        if (t && t.parentElement) t.parentElement.insertBefore(tag, t.nextSibling); else ini.appendChild(tag);
      }
      slots.slice(1).forEach((h, i) => {
        if (horasComConsulta.has(h)) return; // tem encaixe nesse horário → NÃO marca como continuação
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

  function marcarEncaixes(dateStr) {
    const lista = document.getElementById('agendaList');
    if (!lista) return;
    const grade = horarios(); // grade pura
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

  function injetarBotaoEncaixe() {
    const actions = document.getElementById('agendaDayActions');
    if (!actions || document.getElementById('btnEncaixe')) return;
    const b = document.createElement('button');
    b.id = 'btnEncaixe'; b.className = 'btn btn-sm';
    b.style.cssText = 'border:1px solid var(--blue,#5B8DB8);color:var(--blue,#5B8DB8);';
    b.innerHTML = '<i class="ti ti-calendar-plus"></i> Encaixe';
    b.onclick = window.abrirEncaixe;
    actions.appendChild(b);
  }

  if (typeof renderDaySchedule === 'function') {
    const _rds = renderDaySchedule;
    renderDaySchedule = function (dateStr) {
      try {
        const atual = (typeof CAL !== 'undefined' && CAL.horariosDisponiveis) ? CAL.horariosDisponiveis : [];
        // grade pura = lista atual menos os encaixes que adicionamos antes
        gradeBase = atual.filter(h => !ultimoExtras.includes(h));
        // encaixes deste dia (horários de consultas fora da grade)
        const extras = (CAL.consultas || []).filter(c => c.data === dateStr).map(c => c.hora).filter(h => h && !gradeBase.includes(h));
        const unicos = Array.from(new Set(extras));
        // injeta na lista (SEM desfazer) → card sai completo p/ todos os fixes
        CAL.horariosDisponiveis = unicos.length ? Array.from(new Set(gradeBase.concat(unicos))).sort() : gradeBase.slice();
        ultimoExtras = unicos;
      } catch (e) { console.error('[agenda extras]', e); }
      const r = _rds(dateStr);
      try { marcarBlocos(dateStr); marcarEncaixes(dateStr); injetarBotaoEncaixe(); } catch (e) { console.error('[agenda extra]', e); }
      return r;
    };
  }

  console.log('✅ agenda-intervalo-fix.js carregado — intervalo + encaixe (v2)');
})();
