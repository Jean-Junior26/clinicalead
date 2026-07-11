// ============================================================
// CLINICALEAD — Simulação de sorriso/face MANUAL (botão no painel)
// Botão "🖼️ Simular" no topo da conversa — abre modal pra escolher
// o tipo e disparar a simulação, sem depender do Brian decidir sozinho.
// Usa a última foto que o paciente mandou nessa conversa.
// Carregar depois de brian-chave-conversa-fix.js.
// ============================================================

(function () {
  'use strict';

  const TIPOS_SIMULACAO = [
    { valor: 'clareamento', label: '✨ Clareamento' },
    { valor: 'alinhamento', label: '📐 Alinhamento (dente torto)' },
    { valor: 'lentes', label: '🦷 Lentes em resina' },
    { valor: 'protese', label: '🦷 Prótese/Implante (preenche espaço)' },
    { valor: 'gengivoplastia', label: '💗 Gengivoplastia' },
    { valor: 'otomodelacao', label: '👂 Otomodelação (orelha)' },
    { valor: 'rinoplastia', label: '👃 Rinoplastia (nariz)' },
    { valor: 'harmonizacao_facial', label: '💆 Harmonização facial' },
    { valor: 'preenchimento_labial', label: '💋 Preenchimento labial' },
  ];

  window.abrirSimulacaoManual = async function () {
    const chat = (typeof INBOX !== 'undefined') ? INBOX.activeChat : null;
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!chat || !chat.phone || !clinic) return;

    let modal = document.getElementById('modalSimulacaoManual');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalSimulacaoManual';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    modal.innerHTML = `<div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:16px;padding:24px;max-width:420px;width:100%;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <h3 style="margin:0;font-size:16px;">🖼️ Simular transformação</h3>
        <button onclick="document.getElementById('modalSimulacaoManual').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:22px;cursor:pointer;">×</button>
      </div>
      <p style="font-size:12px;color:var(--text-muted,#888);margin-bottom:14px;">Usa a última foto que ${chat.nome || 'o paciente'} mandou nesta conversa. Escolha o tipo:</p>
      <select id="simTipoSelect" style="width:100%;padding:10px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);margin-bottom:16px;">
        ${TIPOS_SIMULACAO.map(t => `<option value="${t.valor}">${t.label}</option>`).join('')}
      </select>
      <button id="simGerarBtn" onclick="dispararSimulacaoManual()" style="width:100%;padding:12px;border-radius:10px;border:none;background:var(--gold,#C9A84C);color:#0A0A0B;font-weight:700;font-size:14px;cursor:pointer;">Gerar e enviar</button>
      <div id="simStatus" style="margin-top:10px;font-size:12px;text-align:center;color:var(--text-muted,#888);"></div>
    </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  };

  window.dispararSimulacaoManual = async function () {
    const chat = (typeof INBOX !== 'undefined') ? INBOX.activeChat : null;
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!chat || !clinic) return;

    const tipo = document.getElementById('simTipoSelect').value;
    const status = document.getElementById('simStatus');
    const btn = document.getElementById('simGerarBtn');
    btn.disabled = true;
    btn.textContent = 'Gerando...';
    status.textContent = 'Isso pode levar até 30 segundos...';

    try {
      const resp = await fetch('/api/gerar-simulacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinic.id, phone: chat.phone, tipo, instance_name: clinic.whatsapp_instance,
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        status.textContent = '✅ Enviado com sucesso!';
        status.style.color = 'var(--gold,#C9A84C)';
        if (typeof toast === 'function') toast('Simulação enviada! ✓', 'success');
        setTimeout(() => { const m = document.getElementById('modalSimulacaoManual'); if (m) m.remove(); }, 1200);
      } else {
        status.textContent = '❌ ' + (data.erro || 'Falha ao gerar');
        status.style.color = 'var(--coral,#C0624A)';
        btn.disabled = false;
        btn.textContent = 'Tentar de novo';
      }
    } catch (e) {
      status.textContent = '❌ Erro de conexão';
      status.style.color = 'var(--coral,#C0624A)';
      btn.disabled = false;
      btn.textContent = 'Tentar de novo';
    }
  };

  function ehAdmin() {
    const r = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return r === 'admin' || r === 'administrador';
  }

  async function injetarBotao() {
    const chat = (typeof INBOX !== 'undefined') ? INBOX.activeChat : null;
    if (!chat || !chat.phone) return;

    const barra = document.getElementById('brianConvBar');
    if (!barra) return; // deixa o brian-chave-conversa-fix.js criar a barra primeiro

    let btn = document.getElementById('simulacaoManualBtn');
    if (btn && btn.dataset.phone === String(chat.phone)) return;
    if (btn) btn.remove();

    btn = document.createElement('button');
    btn.id = 'simulacaoManualBtn';
    btn.className = 'nav-item';
    btn.dataset.phone = String(chat.phone);
    btn.innerHTML = '<i class="ti ti-photo-scan"></i> Simular';
    btn.onclick = window.abrirSimulacaoManual;
    barra.appendChild(btn);
  }

  setInterval(injetarBotao, 900);

  console.log('✅ simulacao-fix.js carregado — botão manual de simulação visual');
})();
