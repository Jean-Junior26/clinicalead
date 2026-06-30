// ============================================================
// CLINICALEAD — CONTATOS PROTEGIDOS (família/amigos)
// Marca contatos pessoais pra NUNCA receberem Brian/follow-up.
// Útil quando o número do CRM também é usado pessoalmente.
// Proteção automática (no backend) + marcação manual (aqui).
// Carregar como script novo no index.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }

  window.abrirContatosProtegidos = async function () {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic) return;

    // carrega os contatos protegidos atuais
    let protegidos = [];
    try {
      const { data } = await database.from('contatos_protegidos').select('*').eq('clinic_id', clinic.id).order('criado_em', { ascending: false });
      protegidos = data || [];
    } catch (e) { console.error('[protegidos]', e); }

    let modal = document.getElementById('modalProtegidos');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalProtegidos';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

    const lista = protegidos.length
      ? protegidos.map(p => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--gold-border,#333);border-radius:8px;margin-bottom:8px;background:var(--bg-card,#1C1C20);">
          <div>
            <div style="font-size:14px;color:var(--text-primary,#F0EAD6);font-weight:500;">${p.nome || 'Sem nome'}</div>
            <div style="font-size:12px;color:var(--text-muted,#888);">${p.phone}</div>
          </div>
          <button onclick="removerProtegido('${p.id}')" style="background:none;border:1px solid var(--coral,#C0624A);color:var(--coral,#C0624A);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;">Remover</button>
        </div>`).join('')
      : '<p style="font-size:13px;color:var(--text-muted,#888);text-align:center;padding:16px;">Nenhum contato protegido ainda.</p>';

    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:14px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;">
        <div style="padding:20px 24px;border-bottom:1px solid var(--gold-border,#333);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:17px;font-weight:600;color:var(--gold,#C9A84C);">🛡️ Contatos protegidos</div>
          <button onclick="document.getElementById('modalProtegidos').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:22px;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:16px 24px;">
          <p style="font-size:12px;color:var(--text-secondary,#8A8570);margin:0 0 14px;line-height:1.5;">Contatos protegidos NUNCA recebem o Brian nem follow-up automático. Use pra família, amigos e contatos pessoais.</p>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <input type="text" id="cpNome" placeholder="Nome (ex: Vó)" style="flex:1;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);font-size:13px;">
          </div>
          <div style="display:flex;gap:8px;margin-bottom:16px;">
            <input type="text" id="cpPhone" placeholder="Telefone (ex: 34999998888)" style="flex:1;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);font-size:13px;">
            <button onclick="adicionarProtegido()" style="background:var(--gold,#C9A84C);color:#0A0A0B;border:none;border-radius:8px;padding:0 16px;font-weight:600;cursor:pointer;white-space:nowrap;">+ Proteger</button>
          </div>
          <div id="cpLista">${lista}</div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  };

  window.adicionarProtegido = async function () {
    const database = getDb(); const clinic = clinicAtual();
    const nome = (document.getElementById('cpNome').value || '').trim();
    const phone = (document.getElementById('cpPhone').value || '').replace(/\D/g, '');
    if (!phone || phone.length < 8) { if (typeof toast === 'function') toast('Digite um telefone válido', 'error'); return; }
    try {
      const { error } = await database.from('contatos_protegidos').insert({ clinic_id: clinic.id, phone, nome: nome || null });
      if (error) {
        if (error.message && error.message.includes('duplicate')) { if (typeof toast === 'function') toast('Esse contato já está protegido', 'info'); }
        else if (typeof toast === 'function') toast('Erro: ' + error.message, 'error');
        return;
      }
      if (typeof toast === 'function') toast('Contato protegido! 🛡️', 'success');
      abrirContatosProtegidos(); // recarrega
    } catch (e) { if (typeof toast === 'function') toast('Erro ao proteger', 'error'); }
  };

  window.removerProtegido = async function (id) {
    if (!confirm('Remover a proteção deste contato? Ele voltará a poder receber Brian/follow-up.')) return;
    const database = getDb();
    try {
      await database.from('contatos_protegidos').delete().eq('id', id);
      if (typeof toast === 'function') toast('Proteção removida');
      abrirContatosProtegidos();
    } catch (e) { if (typeof toast === 'function') toast('Erro ao remover', 'error'); }
  };

  // botão fixo no menu
  function injetarBotao() {
    if (document.getElementById('navProtegidos')) return;
    const ref = document.querySelector('.nav-item[data-page="brian"]')
             || document.querySelector('.nav-item[data-page="inbox"]')
             || document.querySelector('.nav-item[data-page="pistas"]');
    if (!ref) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navProtegidos';
    btn.innerHTML = '<i class="ti ti-shield-lock"></i> Contatos protegidos';
    btn.onclick = () => abrirContatosProtegidos();
    ref.parentNode.insertBefore(btn, ref.nextSibling);
  }
  setInterval(injetarBotao, 1500);

  console.log('✅ contatos-protegidos-fix.js carregado');
})();
