// ============================================================
// CLINICALEAD — CORRIGE DUPLICATA DE ENVIO NO INBOX
// Problema: o sendChatMessage inseria a mensagem no banco com
// message_id NULL e o webhook ecoava com o id real → 2 cópias
// (o índice único não barra porque uma é null).
// Solução: NÃO inserir no banco aqui. Apenas enviar pelo
// WhatsApp; o proxy send-message registra com o message_id
// correto e o Supabase Realtime exibe na tela (fonte única).
// Resultado: nunca duplica, nem no banco nem na tela.
// ============================================================

(function () {
  function instalar() {
    if (typeof sendChatMessage !== 'function') return false;

    sendChatMessage = async function () {
      const input = document.getElementById('chatInput');
      const text = input?.value?.trim();
      if (!text || typeof INBOX === 'undefined' || !INBOX.activeChat) return;
      const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;

      input.value = '';
      if (typeof autoResizeInput === 'function') autoResizeInput(input);

      if (!clinic?.whatsapp_instance) {
        if (typeof toast === 'function') toast('Conecte o WhatsApp desta clínica primeiro', 'error');
        return;
      }

      try {
        // Envia pelo WhatsApp. O send-message registra no banco com o
        // message_id correto, e o Realtime mostra a mensagem na conversa.
        await sendWhatsAppMessage(clinic.whatsapp_instance, INBOX.activeChat.phone, text);
        INBOX.activeChat.lastMsg = text;
        if (typeof renderInboxList === 'function') renderInboxList();
      } catch (e) {
        if (typeof toast === 'function') toast('Erro ao enviar pelo WhatsApp', 'error');
        // devolve o texto ao campo pra não perder a mensagem
        input.value = text;
        if (typeof autoResizeInput === 'function') autoResizeInput(input);
      }
    };

    console.log('✅ inbox-sem-duplicata-fix.js carregado — envio do inbox sem duplicar');
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
