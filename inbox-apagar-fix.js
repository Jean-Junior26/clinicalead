// ============================================================
// CLINICALEAD — APAGAR no INBOX (só do CRM, não toca no WhatsApp)
// • Lixeira ao passar o mouse em cada mensagem (apaga 1).
// • Barra "Apagar conversa" no topo da conversa (apaga tudo do contato).
// Apaga apenas as mensagens da clínica ativa (clinic_id + phone).
// Arquivo independente — só adicionar a tag. Não mexe no index.html.
// ============================================================

(function () {
  'use strict';

  // estilos (lixeira por mensagem + barra)
  (function injCSS() {
    if (document.getElementById('inbox-apagar-css')) return;
    const st = document.createElement('style');
    st.id = 'inbox-apagar-css';
    st.textContent = `
      .msg-del { opacity:0; transition:opacity .15s; background:transparent; border:none; cursor:pointer;
        color:var(--text-muted,#8A8570); font-size:14px; padding:2px 5px; align-self:center; line-height:1; }
      .msg-row:hover .msg-del { opacity:.6; }
      .msg-del:hover { color:var(--coral,#C0624A); opacity:1; }
      #inboxConvActions { display:flex; justify-content:flex-end; padding:6px 12px;
        border-bottom:1px solid var(--border-subtle,#2a2a2a); background:transparent; }
      #inboxConvActions button { background:transparent; border:1px solid var(--border-subtle,#2a2a2a);
        border-radius:8px; color:var(--text-secondary,#8A8570); font-size:12px; cursor:pointer;
        padding:5px 10px; display:inline-flex; align-items:center; gap:6px; transition:all .15s; }
      #inboxConvActions button:hover { border-color:var(--coral,#C0624A); color:var(--coral,#C0624A); }
    `;
    document.head.appendChild(st);
  })();

  // apaga UMA mensagem
  async function apagarUma(msgId, rowEl) {
    if (!msgId) return;
    if (!confirm('Apagar esta mensagem? Ela some só do ClinicaLead (não apaga no WhatsApp do paciente).')) return;
    try {
      const { error } = await db.from('mensagens').delete().eq('id', msgId);
      if (error) throw error;
      if (rowEl) rowEl.remove();
      if (typeof INBOX !== 'undefined' && INBOX.activeChat && INBOX.activeChat.messages) {
        INBOX.activeChat.messages = INBOX.activeChat.messages.filter(m => m.id !== msgId);
      }
      if (typeof toast === 'function') toast('Mensagem apagada');
      if (typeof loadInboxChats === 'function') setTimeout(loadInboxChats, 600);
    } catch (e) { if (typeof toast === 'function') toast('Erro ao apagar', 'error'); console.error('[apagar msg]', e); }
  }
  window.apagarMensagemInbox = apagarUma;

  // apaga a CONVERSA inteira do contato ativo
  window.apagarConversaInbox = async function () {
    const chat = (typeof INBOX !== 'undefined') ? INBOX.activeChat : null;
    if (!chat || !chat.phone) { if (typeof toast === 'function') toast('Abra uma conversa primeiro', 'error'); return; }
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;
    const nome = chat.contact_name || chat.name || chat.phone;
    if (!confirm(`Apagar TODA a conversa com ${nome}?\n\nO histórico some só do ClinicaLead (não apaga no WhatsApp do paciente). Não dá pra desfazer.`)) return;
    if (!confirm('Tem certeza? Esta ação é permanente.')) return;
    try {
      const { error } = await db.from('mensagens').delete().eq('clinic_id', clinic.id).eq('phone', chat.phone);
      if (error) throw error;
      if (typeof toast === 'function') toast('Conversa apagada');
      const box = document.getElementById('chatMessages'); if (box) box.innerHTML = '';
      if (INBOX.activeChat) INBOX.activeChat.messages = [];
      if (typeof loadInboxChats === 'function') setTimeout(loadInboxChats, 400);
    } catch (e) { if (typeof toast === 'function') toast('Erro ao apagar conversa', 'error'); console.error('[apagar conversa]', e); }
  };

  // injeta a lixeira em cada mensagem (casa balão↔mensagem por índice)
  function attachPerMsg() {
    const box = document.getElementById('chatMessages');
    if (!box) return;
    const rows = Array.from(box.querySelectorAll('.msg-row'));
    const msgs = (typeof INBOX !== 'undefined' && INBOX.activeChat && INBOX.activeChat.messages) ? INBOX.activeChat.messages : [];
    if (!rows.length || rows.length !== msgs.length) return; // só age quando alinhado
    rows.forEach((row, i) => {
      if (row.dataset.delAttached) return;
      const m = msgs[i];
      if (!m || !m.id) return;
      row.dataset.delAttached = '1';
      const b = document.createElement('button');
      b.className = 'msg-del';
      b.title = 'Apagar mensagem';
      b.innerHTML = '<i class="ti ti-trash"></i>';
      b.addEventListener('click', (ev) => { ev.stopPropagation(); apagarUma(m.id, row); });
      row.appendChild(b);
    });
  }

  // injeta a barra "Apagar conversa" acima das mensagens
  function injectBar() {
    const box = document.getElementById('chatMessages');
    if (!box || !box.parentNode) return;
    if (document.getElementById('inboxConvActions')) return;
    const bar = document.createElement('div');
    bar.id = 'inboxConvActions';
    bar.innerHTML = `<button onclick="apagarConversaInbox()"><i class="ti ti-trash"></i> Apagar conversa</button>`;
    box.parentNode.insertBefore(bar, box);
  }

  // mantém tudo sincronizado (barra só quando há conversa aberta)
  setInterval(() => {
    const box = document.getElementById('chatMessages');
    if (!box) return;
    const temChat = (typeof INBOX !== 'undefined') && INBOX.activeChat;
    let bar = document.getElementById('inboxConvActions');
    if (temChat) {
      if (!bar) injectBar(); else bar.style.display = 'flex';
      attachPerMsg();
    } else if (bar) {
      bar.style.display = 'none';
    }
  }, 700);

  console.log('✅ inbox-apagar-fix.js carregado — apagar mensagem/conversa (só no CRM)');
})();
