// ============================================================
// CLINICALEAD — PREENCHIMENTO RÁPIDO DE HORÁRIOS
// Painel no modal "Configurar Disponibilidade" pra montar a grade
// de uma vez: das X às Y, de N em N min, com almoço opcional.
// Usa a lógica real do sistema: CAL.horariosDisponiveis (a grade)
// e CAL.horasBloqueadas[dia] (os bloqueios do dia).
// Carregar DEPOIS do script que define openConfigurarAgenda.
// ============================================================
(function () {
  'use strict';

  // gera horários "HH:MM" de inicio a fim, com passo em minutos
  function gerarFaixa(inicio, fim, passoMin) {
    const out = [];
    const [hi, mi] = inicio.split(':').map(Number);
    const [hf, mf] = fim.split(':').map(Number);
    let t = hi * 60 + mi;
    const tf = hf * 60 + mf;
    while (t <= tf) {
      out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
      t += passoMin;
    }
    return out;
  }

  function injetarPainel() {
    const modal = document.getElementById('modalConfigAgenda');
    if (!modal || document.getElementById('preencherRapidoBox')) return;
    const grid = document.getElementById('configSlotsGrid');
    if (!grid) return;

    const box = document.createElement('div');
    box.id = 'preencherRapidoBox';
    box.style.cssText = 'background:var(--bg-input,#16161A);border:1px solid var(--gold-border,rgba(201,168,76,0.25));border-radius:10px;padding:14px;margin-bottom:16px;';
    box.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:var(--gold,#C9A84C);margin-bottom:10px;">⚡ Preenchimento rápido</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;">
        <div>
          <label style="display:block;font-size:11px;color:var(--text-secondary,#8A8570);margin-bottom:3px;">Das</label>
          <input type="time" id="prDe" value="08:00" style="padding:7px;border-radius:6px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:13px;">
        </div>
        <div>
          <label style="display:block;font-size:11px;color:var(--text-secondary,#8A8570);margin-bottom:3px;">Até</label>
          <input type="time" id="prAte" value="18:00" style="padding:7px;border-radius:6px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:13px;">
        </div>
        <div>
          <label style="display:block;font-size:11px;color:var(--text-secondary,#8A8570);margin-bottom:3px;">Intervalo</label>
          <select id="prPasso" style="padding:7px;border-radius:6px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:13px;">
            <option value="30">30 min</option>
            <option value="60">1 hora</option>
            <option value="20">20 min</option>
            <option value="15">15 min</option>
          </select>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-top:10px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-primary,#F0EAD6);cursor:pointer;">
          <input type="checkbox" id="prAlmocoOn" style="cursor:pointer;"> Bloquear almoço
        </label>
        <div id="prAlmocoCampos" style="display:none;gap:10px;align-items:end;">
          <div>
            <label style="display:block;font-size:11px;color:var(--text-secondary,#8A8570);margin-bottom:3px;">Almoço das</label>
            <input type="time" id="prAlmocoDe" value="12:00" style="padding:7px;border-radius:6px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:13px;">
          </div>
          <div>
            <label style="display:block;font-size:11px;color:var(--text-secondary,#8A8570);margin-bottom:3px;">até</label>
            <input type="time" id="prAlmocoAte" value="14:00" style="padding:7px;border-radius:6px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:13px;">
          </div>
        </div>
      </div>
      <div style="margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <button id="prAplicar" style="background:var(--gold,#C9A84C);color:#0A0A0B;border:none;border-radius:7px;padding:9px 18px;font-weight:600;cursor:pointer;font-size:13px;">Gerar grade do dia</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary,#8A8570);cursor:pointer;">
          <input type="checkbox" id="prSubstituir" checked style="cursor:pointer;"> Substituir grade atual
        </label>
        <span id="prStatus" style="font-size:11px;color:var(--text-muted,#4A4840);"></span>
      </div>
      <p style="font-size:11px;color:var(--text-muted,#4A4840);margin:10px 0 0;line-height:1.4;">Monta os horários dessa faixa pro dia selecionado. O almoço fica bloqueado. Depois ajuste horários específicos clicando neles, e clique em <b>Salvar</b>.</p>
    `;
    grid.insertAdjacentElement('beforebegin', box);

    document.getElementById('prAlmocoOn').addEventListener('change', function () {
      document.getElementById('prAlmocoCampos').style.display = this.checked ? 'flex' : 'none';
    });
    document.getElementById('prAplicar').addEventListener('click', aplicar);
  }

  function aplicar() {
    if (typeof CAL === 'undefined') return;
    const de = document.getElementById('prDe').value || '08:00';
    const ate = document.getElementById('prAte').value || '18:00';
    const passo = parseInt(document.getElementById('prPasso').value) || 30;
    const almocoOn = document.getElementById('prAlmocoOn').checked;
    const almocoDe = document.getElementById('prAlmocoDe').value || '12:00';
    const almocoAte = document.getElementById('prAlmocoAte').value || '14:00';
    const substituir = document.getElementById('prSubstituir').checked;
    const status = document.getElementById('prStatus');
    const setStatus = (t, cor) => { if (status) { status.textContent = t; status.style.color = cor || 'var(--gold,#C9A84C)'; } };

    if (ate <= de) { setStatus('A hora final precisa ser depois da inicial', 'var(--coral,#C0624A)'); return; }
    if (almocoOn && almocoAte <= almocoDe) { setStatus('O fim do almoço precisa ser depois do início', 'var(--coral,#C0624A)'); return; }

    const dateStr = CAL.selectedDate || new Date().toISOString().split('T')[0];

    // gera os horários da faixa que esse DIA vai atender (ex: sábado 08:00–13:00)
   // Gera a faixa RESPEITANDO o almoço: manhã (de→almoço) + tarde (almoço→ate).
    // A tarde RECOMEÇA no fim do almoço (ex: 13:30) — assim o horário que você
    // digita aparece certinho, sem "continuar o compasso" da manhã (que fazia
    // 13:30 virar 13:45). Sem almoço, gera a faixa contínua normal.
    function _subMin(hhmm, min) {
      const [h, m] = hhmm.split(':').map(Number);
      const t = h * 60 + m - min;
      return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    }
    let faixa;
    if (almocoOn) {
      // manhã: do início até 1 passo ANTES do almoço começar (não inclui o horário do almoço)
      const manha = gerarFaixa(de, _subMin(almocoDe, passo), passo);
      // tarde: recomeça EXATAMENTE no fim do almoço (o horário que você digitou)
      const tarde = gerarFaixa(almocoAte, ate, passo);
      faixa = Array.from(new Set([...manha, ...tarde])).sort();
    } else {
      faixa = gerarFaixa(de, ate, passo);
    }

    // ── IMPORTANTE: a grade (CAL.horariosDisponiveis) é ÚNICA pra todos os dias.
    // Pra cada dia ter sua própria "cara" SEM vazar pros outros, a gente:
    //  1) garante que a grade-base contenha TODOS os horários possíveis (união)
    //  2) pro DIA selecionado, BLOQUEIA tudo que está fora da faixa escolhida
    // Assim, sábado 8–13h bloqueia 13–18h SÓ no sábado; segunda continua 8–18h.

    // 1) grade-base = união da grade atual + a faixa nova (não remove nada de outros dias)
    const gradeBase = Array.from(new Set([...(CAL.horariosDisponiveis || []), ...faixa])).sort();
    CAL.horariosDisponiveis = gradeBase;

    // 2) calcula o que esse dia deve ter LIVRE (a faixa, menos o almoço)
    const livresDoDia = new Set(faixa.filter(h => !(almocoOn && h >= almocoDe && h < almocoAte)));

    // 3) bloqueia, NESTE dia, tudo da grade-base que NÃO está livre nele
    if (!CAL.horasBloqueadas) CAL.horasBloqueadas = {};
    if (substituir) {
      // "substituir" = redefine este dia do zero: bloqueia tudo que não está na faixa livre
      CAL.horasBloqueadas[dateStr] = gradeBase.filter(h => !livresDoDia.has(h));
    } else {
      // "mesclar" = mantém os bloqueios que já existiam neste dia, e só garante
      // que a faixa nova fique livre (remove esses dos bloqueios) + bloqueia o almoço
      if (!CAL.horasBloqueadas[dateStr]) CAL.horasBloqueadas[dateStr] = [];
      // libera os horários da faixa (tira dos bloqueios)
      CAL.horasBloqueadas[dateStr] = CAL.horasBloqueadas[dateStr].filter(h => !livresDoDia.has(h));
      // bloqueia o almoço, se marcado
      if (almocoOn) {
        const horasAlmoco = faixa.filter(h => h >= almocoDe && h < almocoAte);
        horasAlmoco.forEach(h => { if (!CAL.horasBloqueadas[dateStr].includes(h)) CAL.horasBloqueadas[dateStr].push(h); });
      }
    }

    // re-renderiza a grade do modal usando a função real do sistema
    if (typeof renderConfigSlotsGrid === 'function') renderConfigSlotsGrid(dateStr);

    setStatus(`✓ ${livresDoDia.size} horários livres nesse dia — confira e clique em Salvar`);
  }

  // engata na abertura do modal
  if (typeof openConfigurarAgenda === 'function') {
    const _orig = openConfigurarAgenda;
    window.openConfigurarAgenda = function (...args) {
      const r = _orig.apply(this, args);
      setTimeout(injetarPainel, 150);
      return r;
    };
  }
  setTimeout(() => { if (document.getElementById('modalConfigAgenda')) injetarPainel(); }, 800);

  console.log('✅ agenda-preencher-rapido-fix.js carregado');
})();
