// ============================================================
// CLINICALEAD — BRIAN: Painel do ADMIN (liberar por clínica)
// Só o admin master vê. Lista todas as clínicas e permite
// LIGAR/DESLIGAR o Brian em cada uma (controla quem gasta créditos).
// Item no menu lateral "Brian — Liberações" (visível só p/ admin).
// ============================================================

(function () {
  'use strict';

  function ehAdmin() {
    const r = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return r === 'admin' || r === 'administrador';
  }

  window.abrirBrianAdmin = async function () {
    if (!ehAdmin()) { if (typeof toast === 'function') toast('Apenas o administrador', 'error'); return; }
    if (!document.getElementById('modalBrianAdmin')) {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.id = 'modalBrianAdmin';
      ov.innerHTML = `
        <div class="modal" style="max-width:640px;width:96vw;">
          <div class="modal-header">
            <h3><i class="ti ti-robot" style="margin-right:8px;color:var(--gold);"></i>Brian — Liberações por clínica</h3>
            <button class="btn btn-ghost btn-icon" onclick="closeModal('modalBrianAdmin')"><i class="ti ti-x"></i></button>
          </div>
          <div class="modal-body" id="brianAdminBody" style="max-height:74vh;overflow-y:auto;"></div>
        </div>`;
      document.body.appendChild(ov);
    }
    openModal('modalBrianAdmin');
    document.getElementById('brianAdminBody').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Carregando clínicas…</div>';
    await renderBrianAdmin();
  };

  async function renderBrianAdmin() {
    const body = document.getElementById('brianAdminBody');
    if (!body) return;

    // todas as clínicas (admin enxerga todas por RLS)
    let clinicas = [];
    try {
      const { data } = await db.from('clinicas').select('id, nome, email').order('nome');
      clinicas = data || [];
    } catch (e) { body.innerHTML = '<div style="padding:20px;color:var(--coral);">Erro ao carregar clínicas.</div>'; return; }

    // status de liberação de cada uma
    let libs = {};
    try {
      const { data } = await db.from('brian_config').select('clinic_id, brian_liberado');
      (data || []).forEach(r => { libs[r.clinic_id] = !!r.brian_liberado; });
    } catch (e) {}

    const liberadas = clinicas.filter(c => libs[c.id]).length;

    body.innerHTML = `
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:16px;">
        Ligue o Brian só para as clínicas que <b>contrataram</b>. Clínicas desligadas não conseguem usar o Brian (nem gastar seus créditos da IA).
        <div style="margin-top:6px;color:var(--text-muted);">Liberadas: <b style="color:var(--gold);">${liberadas}</b> de ${clinicas.length}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${clinicas.map(c => {
          const on = !!libs[c.id];
          return `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg-card,#1C1C20);border:1px solid var(--border-subtle,rgba(255,255,255,0.05));border-radius:10px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.nome || 'Sem nome'}</div>
              <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.email || ''}</div>
            </div>
            <button class="btn btn-sm brian-lib-btn" data-id="${c.id}" data-on="${on ? '1' : '0'}"
              style="${on
                ? 'background:rgba(63,185,80,0.15);border:1px solid #3FB950;color:#3FB950;'
                : 'background:transparent;border:1px solid var(--text-muted,#4A4840);color:var(--text-muted,#8A8570);'}min-width:108px;">
              <i class="ti ti-${on ? 'check' : 'ban'}"></i> ${on ? 'Liberado' : 'Bloqueado'}
            </button>
          </div>`;
        }).join('')}
      </div>`;

    body.querySelectorAll('.brian-lib-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const novo = btn.dataset.on !== '1'; // inverte
        btn.disabled = true;
        try {
          // upsert (cria a config se não existir, ou só atualiza a flag)
          const { error } = await db.from('brian_config').upsert({ clinic_id: id, brian_liberado: novo }, { onConflict: 'clinic_id' });
          if (error) throw error;
          if (typeof toast === 'function') toast(novo ? 'Brian liberado ✓' : 'Brian bloqueado');
          await renderBrianAdmin(); // re-renderiza pra atualizar o contador e o botão
        } catch (e) {
          if (typeof toast === 'function') toast('Erro: ' + (e.message || ''), 'error');
          btn.disabled = false;
        }
      });
    });
  }

  // injeta o item no menu lateral (só admin)
  function injetarMenu() {
    if (!ehAdmin() || document.getElementById('navBrianAdmin')) return;
    const ancora = document.getElementById('navBrian') || document.querySelector('.nav-item');
    if (!ancora || !ancora.parentNode) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navBrianAdmin';
    btn.innerHTML = '<i class="ti ti-shield-check"></i> Brian — Liberações';
    btn.onclick = function () { abrirBrianAdmin(); };
    ancora.parentNode.insertBefore(btn, ancora.nextSibling);
  }
  setInterval(injetarMenu, 1200);

  console.log('✅ brian-admin-fix.js carregado — painel de liberação do Brian (admin)');
})();
