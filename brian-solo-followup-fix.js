// ============================================================
// CLINICALEAD — BRIAN SOLO: editor simples de follow-up
// Só pra clínicas tipo_produto = 'brian_solo'. Mostra as 5 mensagens
// da régua de follow-up (dia 1/3/7/15/30) num modal simples — a
// pessoa edita o texto e liga/desliga cada etapa, sem precisar
// entender a tela "Automações" completa (que fica escondida pra ela).
// ============================================================

(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }

  let ehSoloCache = null;
  let ultimoClinicId = null;

  async function ehClinicaSolo() {
    const clinic = clinicAtual();
    if (!clinic || !clinic.id) return false;
    if (clinic.id === ultimoClinicId && ehSoloCache !== null) return ehSoloCache;
    try {
      const database = getDb();
      const { data } = await database.from('clinicas').select('tipo_produto').eq('id', clinic.id).maybeSingle();
      ehSoloCache = data && data.tipo_produto === 'brian_solo';
      ultimoClinicId = clinic.id;
    } catch (e) { ehSoloCache = false; }
    return ehSoloCache;
  }

  window.abrirFollowupSolo = async function () {
    const clinic = clinicAtual();
    if (!clinic) return;
    const database = getDb();

    let modal = document.getElementById('modalFollowupSolo');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalFollowupSolo';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    modal.innerHTML = `<div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:16px;padding:26px;max-width:560px;width:100%;max-height:90vh;overflow:auto;">
      <div style="text-align:center;padding:30px;color:var(--text-muted,#888);">Carregando follow-up…</div>
    </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    let regras = [];
    try {
      const { data } = await database.from('automacoes_regras')
        .select('id, nome, mensagem, espera_valor, ativo')
        .eq('clinic_id', clinic.id).eq('evento', 'dias_sem_resposta')
        .order('espera_valor', { ascending: true });
      regras = data || [];
    } catch (e) { console.error('[followup-solo]', e); }

    const corpo = document.querySelector('#modalFollowupSolo > div');
    if (!regras.length) {
      corpo.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted,#888);">Nenhuma régua de follow-up encontrada. Fale com o suporte pra ativar.</div>`;
      return;
    }

    corpo.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <h2 style="margin:0;font-size:19px;">💬 Follow-up automático</h2>
        <button onclick="document.getElementById('modalFollowupSolo').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:24px;cursor:pointer;">×</button>
      </div>
      <p style="font-size:12px;color:var(--text-muted,#888);margin-bottom:18px;">Se um lead parar de responder, o Brian manda essas mensagens sozinho nos dias abaixo. Use <code>{nome}</code> onde quiser que apareça o nome da pessoa.</p>
      ${regras.map(r => `
        <div style="background:var(--bg-base,#0A0A0B);border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid var(--border-subtle,rgba(255,255,255,0.06));">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <b style="font-size:13px;">Dia ${r.espera_valor} sem resposta</b>
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary,#8A8570);cursor:pointer;">
              <input type="checkbox" data-id="${r.id}" class="fus-ativo" ${r.ativo ? 'checked' : ''}> ativo
            </label>
          </div>
          <textarea data-id="${r.id}" class="fus-msg" rows="3" style="width:100%;padding:8px;border-radius:8px;background:var(--bg-elevated,#1a1a1a);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);font-size:13px;resize:vertical;">${r.mensagem || ''}</textarea>
        </div>`).join('')}
      <button onclick="salvarFollowupSolo()" style="width:100%;padding:12px;border-radius:10px;border:none;background:var(--gold,#C9A84C);color:#0A0A0B;font-weight:700;font-size:15px;cursor:pointer;margin-top:8px;">✓ Salvar mensagens</button>`;
  };

  window.salvarFollowupSolo = async function () {
    const database = getDb();
    const msgs = document.querySelectorAll('.fus-msg');
    const ativos = document.querySelectorAll('.fus-ativo');
    try {
      for (const el of msgs) {
        await database.from('automacoes_regras').update({ mensagem: el.value }).eq('id', el.dataset.id);
      }
      for (const el of ativos) {
        await database.from('automacoes_regras').update({ ativo: el.checked }).eq('id', el.dataset.id);
      }
      if (typeof toast === 'function') toast('Follow-up atualizado! ✓', 'success');
      const modal = document.getElementById('modalFollowupSolo');
      if (modal) modal.remove();
    } catch (e) {
      console.error('[followup-solo] salvar', e);
      if (typeof toast === 'function') toast('Erro ao salvar', 'error');
    }
  };

  // injeta o item de menu SÓ pra clínicas Brian Solo
  async function injetarBotao() {
    if (document.getElementById('navFollowupSolo')) return;
    const solo = await ehClinicaSolo();
    if (!solo) {
      // se não for solo (ou trocou pra outra clínica), garante que o botão não fique órfão
      const existente = document.getElementById('navFollowupSolo');
      if (existente) existente.remove();
      return;
    }
    const ancora = document.querySelector('.nav-item[data-page="inbox"]');
    if (!ancora) return;
    const btn = document.createElement('button');
    btn.id = 'navFollowupSolo';
    btn.className = 'nav-item';
    btn.innerHTML = '<i class="ti ti-message-2-heart"></i> Follow-up';
    btn.onclick = window.abrirFollowupSolo;
    ancora.parentNode.insertBefore(btn, ancora.nextSibling);
  }

  setInterval(injetarBotao, 1500);

  console.log('✅ brian-solo-followup-fix.js carregado — editor simples de follow-up pro Brian Solo');
})();
