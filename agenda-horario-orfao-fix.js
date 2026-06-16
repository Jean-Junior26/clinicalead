// ============================================================
// CLINICALEAD — AGENDA NUNCA PERDE CONSULTA (horário órfão)
// BUG: renderDaySchedule só desenha os slots de CAL.horariosDisponiveis
// (ex: 08:00–17:30). Consulta agendada num horário fora dessa lista
// (ex: 19:00) some da tela — embora esteja salva no banco.
// CORREÇÃO: antes de renderizar o dia, injeta TEMPORARIAMENTE na
// lista de horários os horários das consultas daquele dia que
// estejam faltando. Assim toda consulta aparece, em ordem.
// NÃO altera a config salva da clínica — só o que é exibido.
// ============================================================

(function () {
  'use strict';

  function instalar() {
    if (typeof renderDaySchedule !== 'function' || typeof CAL === 'undefined') return false;
    if (renderDaySchedule.__orfaoFix) return true;

    const _orig = renderDaySchedule;
    renderDaySchedule = function (dateStr) {
      try {
        const base = Array.isArray(CAL.horariosDisponiveis) ? CAL.horariosDisponiveis.slice() : [];
        // horários das consultas DESTE dia
        const horariosConsultas = (CAL.consultas || [])
          .filter(c => c.data === dateStr && c.hora)
          .map(c => String(c.hora).slice(0, 5)); // normaliza HH:MM

        // junta os que faltam
        const set = new Set(base);
        let mudou = false;
        horariosConsultas.forEach(h => {
          if (!set.has(h)) { set.add(h); mudou = true; }
        });

        if (mudou) {
          // ordena os horários (HH:MM ordena bem como string)
          const completos = Array.from(set).sort((a, b) => a.localeCompare(b));
          // troca temporariamente, renderiza, e restaura
          const original = CAL.horariosDisponiveis;
          CAL.horariosDisponiveis = completos;
          const r = _orig.call(this, dateStr);
          CAL.horariosDisponiveis = original; // restaura (não persiste a config)
          return r;
        }
      } catch (e) {
        console.error('[agenda-orfao] erro:', e);
      }
      return _orig.call(this, dateStr);
    };
    renderDaySchedule.__orfaoFix = true;

    // se a agenda já estava aberta, re-renderiza pra aplicar agora
    if (CAL.selectedDate) {
      try { renderDaySchedule(CAL.selectedDate); } catch (e) {}
    }

    console.log('✅ agenda-horario-orfao-fix.js carregado (consultas em horário fora da lista agora aparecem)');
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
