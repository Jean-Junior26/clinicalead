// ============================================================
// CLINICALEAD — OVERBOOKING / ENCAIXE no agendamento MANUAL
// Permite agendar 2+ pacientes no mesmo horário (casal, encaixe de quem
// não confirmou, etc) — mas sempre PERGUNTANDO antes (você decide).
// Só vale no agendamento MANUAL. O Brian continua bloqueando overbooking.
// Carregar como script novo no index, DEPOIS do dentistas-fix e da agenda.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }

  // flag: quando true, a próxima checagem de "ocupado" é ignorada (você já confirmou)
  let overbookConfirmado = false;

  function instalar() {
    if (typeof window.salvarNovoAgendamento !== 'function') return false;
    if (window.__overbookingInstalado) return true;

    const _salvarAtual = window.salvarNovoAgendamento;

    window.salvarNovoAgendamento = async function (...args) {
      const data = document.getElementById('naData')?.value;
      const hora = document.getElementById('naHora')?.value;
      const selDent = document.getElementById('naDentista');
      const dentistaId = selDent ? selDent.value : '';

      // se já confirmou o overbooking nesta tentativa, deixa seguir direto
      if (overbookConfirmado) {
        overbookConfirmado = false;
        return _salvarAtual.apply(this, args);
      }

      // procura QUALQUER consulta nesse dia+hora (com ou sem dentista), não cancelada
      if (data && hora && typeof CAL !== 'undefined' && Array.isArray(CAL.consultas)) {
        const noMesmoSlot = CAL.consultas.filter(c =>
          c.data === data && c.hora === hora && c.status !== 'cancelado'
        );

        if (noMesmoSlot.length) {
          // monta a lista de quem já está nesse horário (com nome do paciente se der)
          const nomes = noMesmoSlot.map(c => {
            // tenta achar o nome do lead/paciente
            let nome = c.paciente_nome || c.nome || '';
            if (!nome && typeof CAL.leads !== 'undefined' && Array.isArray(CAL.leads)) {
              const lead = CAL.leads.find(l => l.id === c.lead_id);
              nome = lead ? (lead.nome || lead.contact_name) : '';
            }
            return nome || 'paciente';
          });

          // verifica se é o MESMO dentista (pra avisar de forma mais específica)
          const mesmoDentista = dentistaId && noMesmoSlot.some(c => c.dentista_id === dentistaId);

          let msg;
          if (mesmoDentista) {
            msg = `⚠️ Essa dentista JÁ tem consulta às ${hora} (${nomes.join(', ')}).\n\nIsso é um encaixe/overbooking. Agendar mesmo assim?`;
          } else {
            msg = `Já existe consulta às ${hora} nesse dia:\n• ${nomes.join('\n• ')}\n\nQuer agendar mais um paciente nesse mesmo horário? (casal, encaixe, etc.)`;
          }

          if (!confirm(msg)) {
            // cancelou: não agenda
            if (typeof toast === 'function') toast('Agendamento cancelado', 'info');
            return;
          }
          // confirmou: marca a flag e re-chama a salvar (que agora vai passar reto)
          overbookConfirmado = true;

          // ── TRUQUE: esconde temporariamente as consultas do mesmo slot ──
          // assim a trava interna (que bloqueia "ocupado") não enxerga conflito.
          const _orig = CAL.consultas;
          CAL.consultas = _orig.filter(c => !(c.data === data && c.hora === hora && c.status !== 'cancelado'));
          try {
            const r = await _salvarAtual.apply(this, args);
            return r;
          } finally {
            // restaura e recarrega do banco (fonte da verdade)
            CAL.consultas = _orig;
            try {
              const database = getDb();
              const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
              if (clinic) {
                const { data: frescas } = await database.from('consultas').select('*').eq('clinic_id', clinic.id).order('data').order('hora');
                if (frescas) {
                  CAL.consultas = frescas;
                  if (typeof renderCalendar === 'function') renderCalendar();
                  if (CAL.selectedDate && typeof renderDaySchedule === 'function') renderDaySchedule(CAL.selectedDate);
                }
              }
            } catch (e) { console.error('[overbooking] recarregar', e); }
            overbookConfirmado = false;
          }
        }
      }

      // sem conflito: segue o fluxo normal
      return _salvarAtual.apply(this, args);
    };

    window.__overbookingInstalado = true;
    console.log('✅ overbooking-fix.js carregado (encaixe manual com confirmação)');
    return true;
  }

  // instala DEPOIS dos outros fixes (espera a salvarNovoAgendamento já estar sobrescrita)
  let tentativas = 0;
  const iv = setInterval(() => {
    tentativas++;
    if (instalar() || tentativas > 40) clearInterval(iv);
  }, 700);
})();
