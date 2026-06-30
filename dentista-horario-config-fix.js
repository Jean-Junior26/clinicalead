// ============================================================
// CLINICALEAD — ETAPA 1: Configuração de horário por dentista
// Tela onde a clínica define o horário de trabalho de cada dentista:
// dias que atende, horário de cada dia, e horário de almoço.
// Se o dentista NÃO configurar, ele herda o horário da clínica.
// Salva em dentistas.horario_proprio (jsonb) + usa_horario_proprio.
// Carregar como script novo no index (depois do dentistas-fix.js).
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }

  const DIAS = [
    { n: 1, label: 'Segunda' },
    { n: 2, label: 'Terça' },
    { n: 3, label: 'Quarta' },
    { n: 4, label: 'Quinta' },
    { n: 5, label: 'Sexta' },
    { n: 6, label: 'Sábado' },
    { n: 0, label: 'Domingo' },
  ];

  // abre o modal de configuração de horário de UM dentista
  window.configHorarioDentista = async function (dentistaId) {
    const database = getDb();
    let dentista = null;
    try {
      const { data } = await database.from('dentistas').select('*').eq('id', dentistaId).maybeSingle();
      dentista = data;
    } catch (e) { console.error('[config-horario]', e); return; }
    if (!dentista) return;

    const cfg = dentista.horario_proprio || {};
    const usaProprio = !!dentista.usa_horario_proprio;

    let modal = document.getElementById('modalHorarioDent');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalHorarioDent';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';

    const linhasDias = DIAS.map(dia => {
      const h = cfg[dia.n]; // [inicio, fim, almocoIni, almocoFim] ou ausente
      const ativo = Array.isArray(h);
      const ini = ativo ? (h[0] || '') : '';
      const fim = ativo ? (h[1] || '') : '';
      const almIni = ativo ? (h[2] || '') : '';
      const almFim = ativo ? (h[3] || '') : '';
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--gold-border,rgba(201,168,76,0.1));flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:6px;min-width:110px;cursor:pointer;">
            <input type="checkbox" class="dia-ativo" data-dia="${dia.n}" ${ativo ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;">
            <span style="font-size:13px;color:var(--text-primary,#F0EAD6);">${dia.label}</span>
          </label>
          <div class="dia-horarios" data-dia="${dia.n}" style="display:${ativo ? 'flex' : 'none'};gap:6px;align-items:center;flex-wrap:wrap;">
            <input type="time" class="h-ini" data-dia="${dia.n}" value="${ini}" style="padding:5px;border-radius:6px;background:var(--bg-input,#16161A);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:12px;">
            <span style="font-size:11px;color:var(--text-muted);">às</span>
            <input type="time" class="h-fim" data-dia="${dia.n}" value="${fim}" style="padding:5px;border-radius:6px;background:var(--bg-input,#16161A);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:12px;">
            <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">almoço:</span>
            <input type="time" class="alm-ini" data-dia="${dia.n}" value="${almIni}" style="padding:5px;border-radius:6px;background:var(--bg-input,#16161A);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:12px;">
            <span style="font-size:11px;color:var(--text-muted);">-</span>
            <input type="time" class="alm-fim" data-dia="${dia.n}" value="${almFim}" style="padding:5px;border-radius:6px;background:var(--bg-input,#16161A);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:12px;">
          </div>
        </div>`;
    }).join('');

    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,rgba(201,168,76,0.25));border-radius:14px;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;">
        <div style="padding:18px 22px;border-bottom:1px solid var(--gold-border,rgba(201,168,76,0.15));display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:16px;font-weight:600;color:var(--gold,#C9A84C);">🕐 Horário de ${dentista.nome}</div>
          <button onclick="document.getElementById('modalHorarioDent').remove()" style="background:none;border:none;color:var(--text-muted);font-size:22px;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:16px 22px;">
          <label style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--bg-card,#1C1C20);border-radius:8px;margin-bottom:14px;cursor:pointer;">
            <input type="checkbox" id="usaProprio" ${usaProprio ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
            <span style="font-size:13px;color:var(--text-primary,#F0EAD6);">Este dentista tem horário próprio</span>
          </label>
          <p style="font-size:11px;color:var(--text-muted);margin:0 0 12px;">Se desmarcado, o dentista segue o horário geral da clínica. Marque os dias que ele atende e defina os horários.</p>
          <div id="diasConfig" style="opacity:${usaProprio ? '1' : '0.4'};pointer-events:${usaProprio ? 'auto' : 'none'};">
            ${linhasDias}
          </div>
          <button onclick="salvarHorarioDentista('${dentistaId}')" style="width:100%;padding:11px;border-radius:9px;border:none;background:var(--gold,#C9A84C);color:#0A0A0B;font-weight:700;cursor:pointer;margin-top:16px;">Salvar horário</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    // toggle: usa horário próprio liga/desliga a config dos dias
    document.getElementById('usaProprio').addEventListener('change', function () {
      const dc = document.getElementById('diasConfig');
      dc.style.opacity = this.checked ? '1' : '0.4';
      dc.style.pointerEvents = this.checked ? 'auto' : 'none';
    });

    // toggle de cada dia: mostra/esconde os horários
    modal.querySelectorAll('.dia-ativo').forEach(chk => {
      chk.addEventListener('change', function () {
        const dia = this.dataset.dia;
        const box = modal.querySelector(`.dia-horarios[data-dia="${dia}"]`);
        if (box) box.style.display = this.checked ? 'flex' : 'none';
      });
    });
  };

  // salva o horário do dentista
  window.salvarHorarioDentista = async function (dentistaId) {
    const database = getDb();
    const modal = document.getElementById('modalHorarioDent');
    const usaProprio = document.getElementById('usaProprio').checked;

    const horario = {};
    if (usaProprio) {
      modal.querySelectorAll('.dia-ativo:checked').forEach(chk => {
        const dia = chk.dataset.dia;
        const ini = modal.querySelector(`.h-ini[data-dia="${dia}"]`)?.value || '';
        const fim = modal.querySelector(`.h-fim[data-dia="${dia}"]`)?.value || '';
        const almIni = modal.querySelector(`.alm-ini[data-dia="${dia}"]`)?.value || '';
        const almFim = modal.querySelector(`.alm-fim[data-dia="${dia}"]`)?.value || '';
        if (ini && fim) {
          horario[dia] = [ini, fim, almIni || null, almFim || null];
        }
      });
    }

    try {
      const { error } = await database.from('dentistas').update({
        usa_horario_proprio: usaProprio,
        horario_proprio: usaProprio ? horario : null,
      }).eq('id', dentistaId);
      if (error) { if (typeof toast === 'function') toast('Erro: ' + error.message, 'error'); return; }
      if (typeof toast === 'function') toast('Horário salvo! 🕐', 'success');
      if (typeof window.DENT_carregar === 'function') window.DENT_carregar();
      modal.remove();
    } catch (e) { if (typeof toast === 'function') toast('Erro ao salvar', 'error'); }
  };

  console.log('✅ dentista-horario-config-fix.js carregado (Etapa 1)');

  // injeta o botão "🕐 Horário" em cada dentista da lista (modal de Dentistas)
  function injetarBotoesHorario() {
    const lista = document.getElementById('dtLista');
    if (!lista) return;
    lista.querySelectorAll('.dt-remover').forEach(btnRemover => {
      const linha = btnRemover.parentElement;
      if (!linha || linha.querySelector('.dt-horario')) return; // já injetado
      const id = btnRemover.dataset.id;
      if (!id) return;
      const btn = document.createElement('button');
      btn.className = 'dt-horario';
      btn.style.cssText = 'background:none;border:1px solid var(--gold-border,rgba(201,168,76,0.4));color:var(--gold,#C9A84C);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;margin-right:6px;';
      btn.innerHTML = '🕐 Horário';
      btn.onclick = () => window.configHorarioDentista(id);
      // insere antes do botão remover
      btnRemover.parentElement.insertBefore(btn, btnRemover);
    });
  }
  // observa o modal de dentistas abrir pra injetar os botões
  setInterval(injetarBotoesHorario, 1000);
})();
