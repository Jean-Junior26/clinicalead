// ============================================================
// CLINICALEAD — TAREFA DE CANCELAMENTO PRO CRC
// Quando o paciente pede pra cancelar (cancelar_solicitado=true
// na consulta, setado pelo webhook), gera uma tarefa URGENTE
// na Central de Tarefas pra equipe ligar e tentar reverter.
// Complementa o tarefas-fix.js (não o reescreve).
// ============================================================

(function () {
  function instalar() {
    if (typeof tarefasGerar !== 'function' || typeof TAREFAS === 'undefined') return false;

    const _origGerar = tarefasGerar;
    tarefasGerar = function () {
      // Roda o gerador original (remarcar, confirmar, faltas, etc)
      _origGerar.apply(this, arguments);

      try {
        const leadMap = {};
        (STATE.leads || []).forEach(l => { leadMap[l.id] = l; });

        // helper de data (usa o do tarefas-fix se existir)
        const fmtData = (typeof tFmtData === 'function')
          ? tFmtData
          : (iso => { const p = String(iso).split('-'); return `${p[2]}/${p[1]}`; });

        // Gera tarefa de cancelamento pras consultas com cancelar_solicitado
        (TAREFAS.consultas || [])
          .filter(c => c.cancelar_solicitado && (c.status === 'agendado' || c.status === 'confirmado'))
          .forEach(c => {
            const chave = `cancelar:${c.id}`;
            // respeita concluída/adiada (mesma regra do tarefas-fix)
            if (typeof tarefaEstaOculta === 'function' && tarefaEstaOculta(chave)) return;
            const lead = leadMap[c.lead_id];
            // evita duplicar se já existir na lista
            if (TAREFAS.lista.some(t => t.chave === chave)) return;
            TAREFAS.lista.push({
              chave,
              prio: 1, // urgente
              icon: 'ti-calendar-cancel',
              titulo: `⚠️ ${lead?.nome || 'Paciente'} pediu para CANCELAR`,
              desc: `Consulta de ${fmtData(c.data)} às ${(c.hora || '').slice(0, 5)} — ligar com urgência e tentar reverter/reagendar antes de cancelar`,
              telefone: lead?.telefone || null,
            });
          });

        // Reordena por prioridade (urgentes primeiro)
        TAREFAS.lista.sort((a, b) => a.prio - b.prio);
      } catch (e) {
        console.error('[tarefa-cancelamento] erro:', e);
      }
    };

    console.log('✅ tarefa-cancelamento-fix.js carregado (tarefa de cancelamento no CRC)');
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
