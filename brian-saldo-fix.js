// ============================================================
// CLINICALEAD — BRIAN: Saldo de mensagens
// • ADMIN: no painel "Brian — Liberações", cada clínica ganha controle
//   de saldo (definir mensagens inclusas no plano + adicionar pacote extra).
// • CLÍNICA: vê o próprio saldo na tela do Brian IA.
// Recarga manual (sem pagamento automático ainda).
// Carregar APÓS brian-admin-fix.js e brian-fix.js.
// ============================================================

(function () {
  'use strict';

  function ehAdmin() {
    const r = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return r === 'admin' || r === 'administrador';
  }
  function disponivel(s) {
    if (!s) return 0;
    return ((s.incluso_mes || 0) - (s.usado_mes || 0)) + ((s.extra_comprado || 0) - (s.extra_usado || 0));
  }

  // ───────────── LADO CLÍNICA: mostra o saldo no menu Brian IA ─────────────
  async function injetarSaldoClinica() {
    const body = document.getElementById('brianBody');
    if (!body || document.getElementById('brianSaldoBox')) return;
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;

    let saldo = null;
    try {
      const { data } = await db.from('brian_saldo').select('*').eq('clinic_id', clinic.id).maybeSingle();
      saldo = data || null;
    } catch (e) {}
    if (document.getElementById('brianSaldoBox')) return;

    const disp = disponivel(saldo);
    const cor = disp <= 0 ? 'var(--coral,#C0624A)' : (disp <= 20 ? '#E5A53B' : 'var(--gold,#C9A84C)');
    const box = document.createElement('div');
    box.id = 'brianSaldoBox';
    box.style.cssText = 'margin-top:16px;padding:12px 14px;background:var(--bg-card,#1C1C20);border:1px solid var(--border-subtle,rgba(255,255,255,0.06));border-radius:10px;';
    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="font-size:12px;color:var(--text-secondary);">Saldo de mensagens do Brian</div>
        <div style="font-size:18px;font-weight:700;color:${cor};">${disp}</div>
      </div>
      ${disp <= 0 ? '<div style="font-size:11px;color:var(--coral,#C0624A);margin-top:6px;">Sem saldo — fale com o suporte para recarregar.</div>' : ''}`;
    // insere logo no topo do corpo (antes da config)
    body.insertBefore(box, body.firstChild);
  }

  // ───────────── LADO ADMIN: controle de saldo por clínica ─────────────
  // injeta um "gerir saldo" em cada linha do painel de liberações
  async function injetarSaldoAdmin() {
    if (!ehAdmin()) return;
    const body = document.getElementById('brianAdminBody');
    if (!body) return;
    const linhas = body.querySelectorAll('.brian-lib-btn');
    for (const btn of linhas) {
      const card = btn.closest('div[style*="border-radius:10px"]') || btn.parentElement;
      if (!card || card.dataset.saldoInj) continue;
      card.dataset.saldoInj = '1';
      const clinicId = btn.dataset.id;

      // busca saldo atual
      let saldo = null;
      try { const { data } = await db.from('brian_saldo').select('*').eq('clinic_id', clinicId).maybeSingle(); saldo = data || null; } catch (e) {}
      const disp = disponivel(saldo);

      const linhaSaldo = document.createElement('div');
      linhaSaldo.style.cssText = 'flex-basis:100%;display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border-subtle,rgba(255,255,255,0.06));flex-wrap:wrap;';
      linhaSaldo.innerHTML = `
        <span style="font-size:11px;color:var(--text-secondary);">Saldo: <b style="color:var(--gold,#C9A84C);">${disp}</b></span>
        <span style="font-size:10px;color:var(--text-muted);">inclusas/mês:</span>
        <input type="number" min="0" class="form-input bsa-incluso" value="${saldo ? (saldo.incluso_mes || 0) : 0}" style="width:74px;padding:3px 6px;font-size:11px;">
        <button class="btn btn-sm bsa-salvar-incluso" style="font-size:11px;padding:3px 8px;">Definir</button>
        <span style="font-size:10px;color:var(--text-muted);margin-left:6px;">+ extra:</span>
        <input type="number" min="0" class="form-input bsa-extra" placeholder="0" style="width:74px;padding:3px 6px;font-size:11px;">
        <button class="btn btn-sm bsa-add-extra" style="font-size:11px;padding:3px 8px;background:rgba(63,185,80,0.12);border:1px solid #3FB950;color:#3FB950;">Adicionar</button>`;
      card.appendChild(linhaSaldo);

      // definir mensagens inclusas no plano
      linhaSaldo.querySelector('.bsa-salvar-incluso').addEventListener('click', async () => {
        const val = parseInt(linhaSaldo.querySelector('.bsa-incluso').value || '0', 10);
        try {
          await db.from('brian_saldo').upsert({ clinic_id: clinicId, incluso_mes: val, atualizado_em: new Date().toISOString() }, { onConflict: 'clinic_id' });
          if (typeof toast === 'function') toast('Mensagens inclusas definidas ✓');
          card.dataset.saldoInj = ''; linhaSaldo.remove(); injetarSaldoAdmin();
        } catch (e) { if (typeof toast === 'function') toast('Erro: ' + (e.message || ''), 'error'); }
      });

      // adicionar pacote extra (soma ao que já tem)
      linhaSaldo.querySelector('.bsa-add-extra').addEventListener('click', async () => {
        const add = parseInt(linhaSaldo.querySelector('.bsa-extra').value || '0', 10);
        if (!add) return;
        try {
          const atual = saldo ? (saldo.extra_comprado || 0) : 0;
          await db.from('brian_saldo').upsert({ clinic_id: clinicId, extra_comprado: atual + add, atualizado_em: new Date().toISOString() }, { onConflict: 'clinic_id' });
          if (typeof toast === 'function') toast(`+${add} mensagens adicionadas ✓`);
          card.dataset.saldoInj = ''; linhaSaldo.remove(); injetarSaldoAdmin();
        } catch (e) { if (typeof toast === 'function') toast('Erro: ' + (e.message || ''), 'error'); }
      });
    }
  }

  setInterval(() => { injetarSaldoClinica(); injetarSaldoAdmin(); }, 1000);

  console.log('✅ brian-saldo-fix.js carregado — saldo de mensagens (admin recarrega, clínica vê)');
})();
