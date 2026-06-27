// ============================================================
// CLINICALEAD — AGENDA-PADRÃO POR DIA DA SEMANA (Fase 1)
// Tela "Horário-padrão": define os horários de cada dia da semana
// UMA vez, e salva no banco (tabela agenda_padrao). A agenda e o Brian
// vão ler isso pra montar os horários certos de cada dia.
// Carregar DEPOIS dos scripts da agenda.
// ============================================================
(function () {
  'use strict';

  const DIAS = [
    { n: 1, nome: 'Segunda' }, { n: 2, nome: 'Terça' }, { n: 3, nome: 'Quarta' },
    { n: 4, nome: 'Quinta' }, { n: 5, nome: 'Sexta' }, { n: 6, nome: 'Sábado' }, { n: 0, nome: 'Domingo' },
  ];

  let estado = {}; // { dia_semana: { ativo, de, ate, passo, almocoOn, almocoDe, almocoAte } }

  function gerarFaixa(de, ate, passo) {
    const out = [];
    const [hi, mi] = de.split(':').map(Number);
    const [hf, mf] = ate.split(':').map(Number);
    let t = hi * 60 + mi; const tf = hf * 60 + mf;
    while (t <= tf) { out.push(`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`); t += passo; }
    return out;
  }

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }

  // ── injeta o botão "Horário-padrão" ao lado de "Configurar horários" ──
  function injetarBotao() {
    if (document.getElementById('btnHorarioPadrao')) return;
    // procura o botão "Configurar horários" pra colocar ao lado
    const candidatos = Array.from(document.querySelectorAll('button')).filter(b =>
      /configurar hor/i.test(b.textContent || ''));
    const ref = candidatos[0];
    if (!ref) return;
    const b = document.createElement('button');
    b.id = 'btnHorarioPadrao';
    b.className = ref.className;
    b.style.cssText = (ref.style.cssText || '') + ';margin-right:8px;';
    b.innerHTML = '<i class="ti ti-calendar-cog"></i> Horário-padrão';
    b.onclick = abrirModal;
    ref.parentElement.insertBefore(b, ref);
  }

  // ── carrega o padrão salvo do banco ──
  async function carregarPadrao() {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic) return;
    estado = {};
    try {
      const { data } = await database.from('agenda_padrao').select('*').eq('clinic_id', clinic.id);
      (data || []).forEach(row => {
        const hrs = Array.isArray(row.horarios) ? row.horarios : [];
        estado[row.dia_semana] = reconstruirEstado(row.ativo, hrs);
      });
    } catch (e) { console.error('[agenda-padrao] carregar', e); }
    // garante todos os dias no estado (default)
    DIAS.forEach(d => {
      if (!estado[d.n]) estado[d.n] = { ativo: d.n !== 0, de: '08:00', ate: d.n === 6 ? '13:00' : '18:00', passo: 30, almocoOn: false, almocoDe: '12:00', almocoAte: '14:00' };
    });
  }

  // ── reconstrói os campos da tela (de, ate, passo, almoço) a partir da lista salva ──
  function reconstruirEstado(ativo, hrs) {
    if (!hrs.length) {
      return { ativo, de: '08:00', ate: '18:00', passo: 30, almocoOn: false, almocoDe: '12:00', almocoAte: '14:00' };
    }
    const toMin = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
    const toStr = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

    const de = hrs[0];
    // detecta o passo (menor diferença entre horários consecutivos)
    let passo = 30;
    if (hrs.length > 1) {
      let menor = Infinity;
      for (let i = 1; i < hrs.length; i++) {
        const diff = toMin(hrs[i]) - toMin(hrs[i - 1]);
        if (diff > 0 && diff < menor) menor = diff;
      }
      if (menor !== Infinity) passo = menor;
    }
    // o "até" = último horário da lista (bate com o que o usuário digitou ao gerar)
    const ate = hrs[hrs.length - 1];

    // detecta o almoço: um "buraco" maior que o passo no meio da sequência
    let almocoOn = false, almocoDe = '12:00', almocoAte = '14:00';
    for (let i = 1; i < hrs.length; i++) {
      const diff = toMin(hrs[i]) - toMin(hrs[i - 1]);
      if (diff > passo) {
        // achou um buraco = almoço
        almocoOn = true;
        almocoDe = toStr(toMin(hrs[i - 1]) + passo); // começa após o último antes do buraco
        almocoAte = hrs[i]; // termina quando volta
        break;
      }
    }

    return { ativo, de, ate, passo, almocoOn, almocoDe, almocoAte };
  }

  function abrirModal() {
    carregarPadrao().then(renderModal);
  }

  function renderModal() {
    let modal = document.getElementById('modalHorarioPadrao');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalHorarioPadrao';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,rgba(201,168,76,0.25));border-radius:14px;max-width:680px;width:100%;max-height:90vh;overflow-y:auto;padding:0;">
        <div style="padding:20px 24px;border-bottom:1px solid var(--gold-border,rgba(201,168,76,0.15));display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--bg-surface,#141414);z-index:2;">
          <div style="font-size:17px;font-weight:600;color:var(--gold,#C9A84C);">⚙️ Horário-padrão da semana</div>
          <button id="hpFechar" style="background:none;border:none;color:var(--text-secondary,#8A8570);font-size:22px;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:16px 24px;">
          <p style="font-size:12px;color:var(--text-secondary,#8A8570);margin:0 0 16px;line-height:1.5;">Defina o horário de cada dia da semana. Isso vale pra <b>todos</b> os dias daquele tipo (toda segunda, toda terça...). A agenda e a IA vão usar esses horários. Feriados/exceções você ajusta direto no dia.</p>
          <div id="hpDias"></div>
        </div>
        <div style="padding:16px 24px;border-top:1px solid var(--gold-border,rgba(201,168,76,0.15));display:flex;justify-content:flex-end;gap:10px;position:sticky;bottom:0;background:var(--bg-surface,#141414);">
          <button id="hpCancelar" style="background:none;border:1px solid var(--text-muted,#4A4840);color:var(--text-secondary,#8A8570);border-radius:8px;padding:10px 18px;cursor:pointer;">Cancelar</button>
          <button id="hpSalvar" style="background:var(--gold,#C9A84C);color:#0A0A0B;border:none;border-radius:8px;padding:10px 22px;font-weight:600;cursor:pointer;">Salvar horário-padrão</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('hpFechar').onclick = () => modal.remove();
    document.getElementById('hpCancelar').onclick = () => modal.remove();
    document.getElementById('hpSalvar').onclick = salvar;
    renderDias();
  }

  function renderDias() {
    const wrap = document.getElementById('hpDias');
    if (!wrap) return;
    wrap.innerHTML = DIAS.map(d => {
      const e = estado[d.n];
      return `
        <div style="border:1px solid var(--gold-border,rgba(201,168,76,0.18));border-radius:10px;padding:12px 14px;margin-bottom:10px;background:${e.ativo ? 'var(--bg-card,#1C1C20)' : 'transparent'};">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--text-primary,#F0EAD6);cursor:pointer;min-width:130px;">
              <input type="checkbox" data-dia="${d.n}" data-campo="ativo" ${e.ativo ? 'checked' : ''} style="cursor:pointer;width:16px;height:16px;"> ${d.nome}
            </label>
            <div class="hp-faixa" data-faixadia="${d.n}" style="display:${e.ativo ? 'flex' : 'none'};gap:8px;align-items:center;flex-wrap:wrap;">
              <span style="font-size:11px;color:var(--text-secondary,#8A8570);">das</span>
              <input type="time" data-dia="${d.n}" data-campo="de" value="${e.de}" style="padding:5px;border-radius:5px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:12px;">
              <span style="font-size:11px;color:var(--text-secondary,#8A8570);">às</span>
              <input type="time" data-dia="${d.n}" data-campo="ate" value="${e.ate}" style="padding:5px;border-radius:5px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:12px;">
              <select data-dia="${d.n}" data-campo="passo" style="padding:5px;border-radius:5px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:12px;">
                <option value="30" ${e.passo==30?'selected':''}>30min</option>
                <option value="60" ${e.passo==60?'selected':''}>1h</option>
                <option value="20" ${e.passo==20?'selected':''}>20min</option>
                <option value="15" ${e.passo==15?'selected':''}>15min</option>
              </select>
            </div>
          </div>
          <div class="hp-almoco" data-almocodia="${d.n}" style="display:${e.ativo ? 'flex' : 'none'};gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary,#8A8570);cursor:pointer;">
              <input type="checkbox" data-dia="${d.n}" data-campo="almocoOn" ${e.almocoOn ? 'checked' : ''} style="cursor:pointer;"> Almoço
            </label>
            <span class="hp-almoco-campos" data-almococampos="${d.n}" style="display:${e.almocoOn ? 'inline-flex' : 'none'};gap:6px;align-items:center;">
              <input type="time" data-dia="${d.n}" data-campo="almocoDe" value="${e.almocoDe}" style="padding:4px;border-radius:5px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:11px;">
              <span style="font-size:11px;color:var(--text-secondary,#8A8570);">às</span>
              <input type="time" data-dia="${d.n}" data-campo="almocoAte" value="${e.almocoAte}" style="padding:4px;border-radius:5px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:11px;">
            </span>
          </div>
        </div>`;
    }).join('');

    // listeners
    wrap.querySelectorAll('input,select').forEach(el => {
      el.addEventListener('change', () => {
        const dia = parseInt(el.dataset.dia);
        const campo = el.dataset.campo;
        if (campo === 'ativo' || campo === 'almocoOn') estado[dia][campo] = el.checked;
        else estado[dia][campo] = el.value;
        // re-render só se mudou ativo ou almocoOn (pra mostrar/esconder)
        if (campo === 'ativo' || campo === 'almocoOn') renderDias();
      });
    });
  }

  async function salvar() {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic) { if (typeof toast === 'function') toast('Erro: clínica não encontrada', 'error'); return; }

    // valida e monta as linhas
    const linhas = [];
    for (const d of DIAS) {
      const e = estado[d.n];
      if (!e.ativo) {
        linhas.push({ clinic_id: clinic.id, dia_semana: d.n, horarios: [], ativo: false });
        continue;
      }
      if (e.ate <= e.de) { if (typeof toast === 'function') toast(`${d.nome}: hora final deve ser depois da inicial`, 'error'); return; }
      let horarios = gerarFaixa(e.de, e.ate, parseInt(e.passo) || 30);
      if (e.almocoOn && e.almocoAte > e.almocoDe) {
        horarios = horarios.filter(h => !(h >= e.almocoDe && h < e.almocoAte));
      }
      linhas.push({ clinic_id: clinic.id, dia_semana: d.n, horarios, ativo: true });
    }

    try {
      // upsert (1 linha por dia_semana por clínica — onConflict na unique)
      const { error } = await database.from('agenda_padrao')
        .upsert(linhas, { onConflict: 'clinic_id,dia_semana' });
      if (error) { if (typeof toast === 'function') toast('Erro ao salvar: ' + error.message, 'error'); return; }
      if (typeof toast === 'function') toast('Horário-padrão salvo! ✓');
      const modal = document.getElementById('modalHorarioPadrao');
      if (modal) modal.remove();
    } catch (e) {
      if (typeof toast === 'function') toast('Erro: ' + e.message, 'error');
    }
  }

  // injeta o botão quando a agenda renderiza
  if (typeof renderAgenda === 'function') {
    const _orig = renderAgenda;
    window.renderAgenda = function (...args) { const r = _orig.apply(this, args); setTimeout(injetarBotao, 200); return r; };
  }
  setTimeout(injetarBotao, 1200);

  console.log('✅ agenda-padrao-fix.js carregado (Fase 1)');
})();
