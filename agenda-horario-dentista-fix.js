// ============================================================
// CLINICALEAD — ETAPA 2: horários respeitam o expediente do dentista
// Quando escolhe um dentista no agendamento (#naDentista), filtra o
// select de horário (#naHora) pra mostrar SÓ os horários que o
// dentista atende naquele dia (baseado no horario_proprio da Etapa 1).
// - Se o dentista NÃO tem horário próprio → mostra todos (agenda geral)
// - Respeita: dias que atende, horário de início/fim, e almoço
// Carregar DEPOIS do dentista-horario-config-fix.js e da Fase 2.
// ============================================================
(function () {
  'use strict';

  function dentistas() { return (typeof window.DENT_lista === 'function') ? window.DENT_lista() : []; }

  // guarda TODAS as opções originais do naHora (pra restaurar quando volta pra "geral")
  let horariosOriginais = null;

  function capturarHorariosOriginais() {
    const nh = document.getElementById('naHora');
    if (!nh) return;
    // só captura se ainda não capturou ou se a lista mudou (mais opções que o guardado)
    const atuais = Array.from(nh.options).map(o => ({ value: o.value, text: o.text }));
    if (!horariosOriginais || atuais.length > horariosOriginais.length) {
      horariosOriginais = atuais;
    }
  }

  // converte "HH:MM" em minutos (pra comparar)
  function toMin(hhmm) {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    if (isNaN(h)) return null;
    return h * 60 + (m || 0);
  }

  // verifica se um horário está DENTRO do expediente do dentista naquele dia
  function horarioValido(horaStr, config) {
    // config = [inicio, fim, almocoIni, almocoFim]
    const min = toMin(horaStr);
    if (min === null) return true; // opção vazia/placeholder → mantém
    const ini = toMin(config[0]);
    const fim = toMin(config[1]);
    if (ini !== null && min < ini) return false;   // antes de começar
    if (fim !== null && min >= fim) return false;   // depois de terminar
    // dentro do almoço?
    const almIni = toMin(config[2]);
    const almFim = toMin(config[3]);
    if (almIni !== null && almFim !== null && min >= almIni && min < almFim) return false;
    return true;
  }

  // aplica o filtro de horário conforme o dentista + data escolhidos
  function filtrarHorarios() {
    const selDent = document.getElementById('naDentista');
    const selHora = document.getElementById('naHora');
    const inpData = document.getElementById('naData');
    if (!selDent || !selHora) return;

    capturarHorariosOriginais();
    if (!horariosOriginais) return;

    const dentistaId = selDent.value;

    // sem dentista escolhido (ou "Selecione") → mostra todos
    if (!dentistaId || dentistaId === '') {
      restaurarTodos();
      return;
    }

    // acha o dentista e seu horário próprio
    const dent = dentistas().find(d => d.id === dentistaId);
    if (!dent || !dent.usa_horario_proprio || !dent.horario_proprio) {
      // dentista sem horário próprio → herda o geral (mostra todos)
      restaurarTodos();
      return;
    }

    // descobre o DIA DA SEMANA da data escolhida (0=dom ... 6=sáb)
    let diaSemana = null;
    if (inpData && inpData.value) {
      // data pode vir "2026-07-05" ou "05/07/2026"
      let d;
      if (/^\d{4}-\d{2}-\d{2}/.test(inpData.value)) {
        d = new Date(inpData.value + 'T12:00:00');
      } else if (/^\d{2}\/\d{2}\/\d{4}/.test(inpData.value)) {
        const [dd, mm, yy] = inpData.value.split('/');
        d = new Date(`${yy}-${mm}-${dd}T12:00:00`);
      }
      if (d && !isNaN(d)) diaSemana = d.getDay();
    }

    const cfg = dent.horario_proprio;
    const configDia = (diaSemana !== null) ? cfg[diaSemana] : null;

    // se o dentista NÃO atende nesse dia → nenhum horário
    if (diaSemana !== null && !Array.isArray(configDia)) {
      selHora.innerHTML = '<option value="">— dentista não atende neste dia —</option>';
      return;
    }

    // reconstrói o naHora só com horários válidos
    const validas = horariosOriginais.filter(opt => {
      if (!opt.value) return true; // placeholder
      if (!configDia) return true; // sem config do dia (ex: data não escolhida) → mostra todos
      return horarioValido(opt.value, configDia);
    });

    const valorAtual = selHora.value;
    selHora.innerHTML = validas.map(o =>
      `<option value="${o.value}">${o.text}</option>`
    ).join('');
    // tenta manter o valor que estava selecionado, se ainda for válido
    if (validas.some(o => o.value === valorAtual)) selHora.value = valorAtual;
  }

  function restaurarTodos() {
    const selHora = document.getElementById('naHora');
    if (!selHora || !horariosOriginais) return;
    const valorAtual = selHora.value;
    selHora.innerHTML = horariosOriginais.map(o =>
      `<option value="${o.value}">${o.text}</option>`
    ).join('');
    if (horariosOriginais.some(o => o.value === valorAtual)) selHora.value = valorAtual;
  }

  // liga os eventos: quando muda dentista OU data, refiltra
  function instalarListeners() {
    const selDent = document.getElementById('naDentista');
    const inpData = document.getElementById('naData');
    if (selDent && !selDent.__horarioFiltroLigado) {
      selDent.addEventListener('change', () => setTimeout(filtrarHorarios, 50));
      selDent.__horarioFiltroLigado = true;
    }
    if (inpData && !inpData.__horarioFiltroLigado) {
      inpData.addEventListener('change', () => setTimeout(filtrarHorarios, 50));
      inpData.__horarioFiltroLigado = true;
    }
  }

  // fica tentando instalar (o form abre/fecha dinamicamente)
  setInterval(instalarListeners, 1000);

  console.log('✅ agenda-horario-dentista-fix.js carregado (Etapa 2)');
})();
