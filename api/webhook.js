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

      let content = '';
      let type = 'text';
      let media_url = null;

      const m = msg?.message || {};

      if (m.conversation) {
        content = m.conversation;
      } else if (m.extendedTextMessage) {
        content = m.extendedTextMessage.text || '';
      } else if (m.imageMessage) {
        content = m.imageMessage.caption || '📷 Imagem';
        type = 'image';
        media_url = m.imageMessage.url || null;
      } else if (m.audioMessage) {
        content = '🎵 Áudio';
        type = 'audio';
        media_url = m.audioMessage.url || null;
      } else if (m.videoMessage) {
        content = m.videoMessage.caption || '🎥 Vídeo';
        type = 'video';
        media_url = m.videoMessage.url || null;
      } else if (m.documentMessage) {
        content = m.documentMessage.fileName || '📄 Documento';
        type = 'document';
        media_url = m.documentMessage.url || null;
      } else if (m.stickerMessage) {
        content = '🎭 Sticker';
        type = 'sticker';
      } else {
        content = '[mídia]';
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
          body: JSON.stringify({ phone, content, type, media_url, from_me: fromMe, created_at: new Date().toISOString() })
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch(err) {
    console.error(err);
    return res.status(200).json({ ok: true });
  }
}
