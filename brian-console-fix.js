// ============================================================
// CLINICALEAD — BRIAN: Console de diagnóstico na conversa
// Botão "🔍 Console" no topo do chat — mostra, pra essa conversa
// específica, o que o Brian fez em cada mensagem (transcrição de
// áudio, decisão de responder ou não, decisão de voz) — sem precisar
// caçar nos logs do Vercel.
// Carregar depois dos outros fixes do inbox.
// ============================================================

(function () {
  'use strict';

  function acharHeader() {
    return document.querySelector('.chat-header') ||
           document.querySelector('.inbox-chat-header') ||
           document.querySelector('#inboxChat .chat-top') ||
           null;
  }

  const ICONES = { transcricao: '🎙️', decisao_resposta: '🤖', voz: '🔊' };
  const CORES = { sucesso: '#6FBF8E', falhou: '#C0624A', pulado: '#8A8570', descartado: '#E5A53B' };

  window.abrirBrianConsole = async function () {
    const chat = (typeof INBOX !== 'undefined') ? INBOX.activeChat : null;
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!chat || !chat.phone || !clinic) return;

    let modal = document.getElementById('modalBrianConsole');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalBrianConsole';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    modal.innerHTML = `<div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:16px;padding:24px;max-width:560px;width:100%;max-height:85vh;overflow:auto;font-family:var(--mono,monospace);">
      <div style="text-align:center;padding:30px;color:var(--text-muted,#888);">Carregando console…</div>
    </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    let logs = [];
    try {
      const { data } = await db.from('brian_debug_log')
        .select('*').eq('clinic_id', clinic.id).eq('phone', chat.phone)
        .order('created_at', { ascending: false }).limit(50);
      logs = data || [];
    } catch (e) { console.error('[brian-console]', e); }

    const corpo = document.querySelector('#modalBrianConsole > div');
    corpo.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;font-family:var(--font-base,sans-serif);">
        <h3 style="margin:0;font-size:16px;">🔍 Console — ${chat.phone}</h3>
        <button onclick="document.getElementById('modalBrianConsole').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:22px;cursor:pointer;">×</button>
      </div>
      <div style="font-size:11px;color:var(--text-muted,#888);margin-bottom:14px;font-family:var(--font-base,sans-serif);">Últimos 50 eventos técnicos desta conversa, mais recente primeiro.</div>
      ${!logs.length ? '<div style="text-align:center;padding:24px;color:var(--text-muted,#888);font-family:var(--font-base,sans-serif);">Nenhum evento registrado ainda pra essa conversa.</div>' : logs.map(l => `
        <div style="padding:8px 10px;margin-bottom:6px;background:var(--bg-base,#0A0A0B);border-radius:8px;border-left:3px solid ${CORES[l.status] || '#666'};font-size:12px;">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <span>${ICONES[l.evento] || '•'} <b>${l.evento}</b> — <span style="color:${CORES[l.status] || '#666'};">${l.status}</span></span>
            <span style="color:var(--text-muted,#888);white-space:nowrap;">${new Date(l.created_at).toLocaleTimeString('pt-BR')}</span>
          </div>
          ${l.detalhes ? `<div style="color:var(--text-secondary,#C8C2AE);margin-top:4px;">${l.detalhes}</div>` : ''}
        </div>`).join('')}`;
  };

  async function injetarBotao() {
    const chat = (typeof INBOX !== 'undefined') ? INBOX.activeChat : null;
    if (!chat || !chat.phone) return;

    let header = acharHeader();
    if (!header) {
      const msgs = document.getElementById('chatMessages');
      if (!msgs || !msgs.parentNode) return;
      let barra = document.getElementById('brianConvBar');
      if (!barra) return; // deixa o brian-chave-conversa-fix.js criar a barra primeiro
      header = barra;
    }

    let btn = document.getElementById('brianConsoleBtn');
    if (btn && btn.dataset.phone === String(chat.phone)) return;
    if (btn) btn.remove();

    btn = document.createElement('button');
    btn.id = 'brianConsoleBtn';
    btn.dataset.phone = String(chat.phone);
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;padding:4px 9px;border-radius:7px;background:rgba(91,141,184,0.12);border:1px solid #5B8DB8;color:#5B8DB8;margin-left:8px;';
    btn.innerHTML = '<i class="ti ti-terminal-2"></i> Console';
    btn.title = 'Ver o que o Brian fez tecnicamente nesta conversa (transcrição, decisões, voz)';
    btn.onclick = window.abrirBrianConsole;
    header.appendChild(btn);
  }

  setInterval(injetarBotao, 900);

  console.log('✅ brian-console-fix.js carregado — console de diagnóstico na conversa');
})();
