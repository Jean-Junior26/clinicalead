// ============================================================
// CLINICALEAD — ENVIAR FIGURINHA (STICKER) PELO INBOX (Etapa 1)
// Adiciona um botão de figurinha no inbox. A recepção escolhe um
// arquivo .webp e envia como sticker, pela instância da conversa
// ativa (respeita o número selecionado no multi-WhatsApp).
// ============================================================

// Envia uma figurinha (.webp) escolhida pelo usuário
async function enviarFigurinha(event) {
  const file = event.target.files[0];
  event.target.value = ''; // permite reenviar o mesmo arquivo depois
  if (!file || typeof INBOX === 'undefined' || !INBOX.activeChat) return;

  // Valida o formato (sticker do WhatsApp = webp)
  if (file.type !== 'image/webp') {
    if (typeof toast === 'function') toast('A figurinha precisa ser um arquivo .webp', 'error');
    return;
  }

  // Descobre a instância da conversa ativa (multi-número)
  let instancia = null;
  if (typeof instanciaParaResponder === 'function') {
    instancia = instanciaParaResponder(INBOX.activeChat);
  }
  if (!instancia) {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    instancia = clinic?.whatsapp_instance || null;
  }
  if (!instancia) { if (typeof toast === 'function') toast('Conecte o WhatsApp primeiro!', 'error'); return; }

  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (typeof toast === 'function') toast('Enviando figurinha...');

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result.split(',')[1];
    try {
      // Usa o proxy send-media (que já trata sticker e registra no inbox)
      const resp = await fetch('/api/send-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance: instancia,
          phone: INBOX.activeChat.phone,
          clinic_id: clinic?.id || null,
          base64,
          mimetype: 'image/webp',
          fileName: file.name || 'figurinha.webp',
        }),
      });
      if (!resp.ok) throw new Error('Falha no envio');
      if (typeof toast === 'function') toast('Figurinha enviada! ✓');
      // O Realtime mostra a mensagem; recarrega como reforço
      if (typeof loadInboxChats === 'function') setTimeout(loadInboxChats, 800);
    } catch (err) {
      if (typeof toast === 'function') toast('Erro ao enviar figurinha', 'error');
    }
  };
  reader.readAsDataURL(file);
}

// ── Injeta o botão de figurinha na barra do inbox ────────────
(function () {
  function injetarBotao() {
    // Acha a área de botões do input do chat
    const barras = document.querySelectorAll('.chat-input-btns');
    barras.forEach(barra => {
      if (barra.querySelector('.btn-figurinha')) return; // já injetado
      const label = document.createElement('label');
      label.className = 'chat-input-btn btn-figurinha';
      label.title = 'Enviar figurinha (.webp)';
      label.style.cursor = 'pointer';
      label.innerHTML = '<i class="ti ti-sticker"></i><input type="file" accept="image/webp" style="display:none;"/>';
      label.querySelector('input').addEventListener('change', enviarFigurinha);
      barra.insertBefore(label, barra.firstChild);
    });
  }

  // Injeta quando abre uma conversa (a barra é recriada a cada openChat)
  if (typeof openChat === 'function') {
    const _orig = openChat;
    openChat = async function (...args) {
      const r = await _orig.apply(this, args);
      setTimeout(injetarBotao, 100);
      return r;
    };
  }
  // Reforços
  setTimeout(injetarBotao, 1500);
  setInterval(injetarBotao, 3000); // garante que aparece mesmo após re-renders

  console.log('✅ inbox-sticker-fix.js carregado (enviar figurinha)');
})();
