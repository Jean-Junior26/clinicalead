export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const SUPABASE_URL = 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_G6xEiLO4lcNaJafm9RA2tA_QLf4E2FV';

  try {
    const body = req.body;
    if (body?.event !== 'messages.upsert') return res.status(200).json({ ok: true });

    const messages = body?.data || [];
    const list = Array.isArray(messages) ? messages : [messages];

    for (const msg of list) {
      const key = msg?.key || {};
      const phone = (key?.remoteJid || '').replace('@s.whatsapp.net','').replace('@g.us','');
      const fromMe = key?.fromMe || false;

      // Detectar tipo e conteúdo
      let content = '';
      let type = 'text';
      let mediaUrl = null;

      if (msg?.message?.conversation) {
        content = msg.message.conversation;
        type = 'text';
      } else if (msg?.message?.extendedTextMessage?.text) {
        content = msg.message.extendedTextMessage.text;
        type = 'text';
      } else if (msg?.message?.imageMessage) {
        content = msg.message.imageMessage.caption || '📷 Imagem';
        type = 'image';
        mediaUrl = msg.message.imageMessage.url || null;
      } else if (msg?.message?.audioMessage) {
        content = '🎵 Áudio';
        type = 'audio';
        mediaUrl = msg.message.audioMessage.url || null;
      } else if (msg?.message?.videoMessage) {
        content = msg.message.videoMessage.caption || '🎥 Vídeo';
        type = 'video';
        mediaUrl = msg.message.videoMessage.url || null;
      } else if (msg?.message?.documentMessage) {
        content = msg.message.documentMessage.fileName || '📄 Documento';
        type = 'document';
        mediaUrl = msg.message.documentMessage.url || null;
      } else if (msg?.message?.stickerMessage) {
        content = '🎭 Sticker';
        type = 'sticker';
      } else {
        content = '[mídia]';
        type = 'other';
      }

      if (phone && content && !phone.includes('status')) {
        await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            phone,
            content,
            type,
            media_url: mediaUrl,
            from_me: fromMe,
            created_at: new Date().toISOString()
          })
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch(err) {
    console.error(err);
    return res.status(200).json({ ok: true });
  }
}
}
</html>
