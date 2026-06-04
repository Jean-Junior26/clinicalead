export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const SUPABASE_URL = 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_G6xEiLO4lcNaJafm9RA2tA_QLf4E2FV';

  try {
    const body = req.body;

    // Aceita "messages.upsert" E "MESSAGES_UPSERT"
    const evento = (body?.event || body?.type || '').toLowerCase().replace('.', '_');
    if (evento !== 'messages_upsert') {
      return res.status(200).json({ ok: true, ignorado: body?.event });
    }

    const messages = body?.data || [];
    const list = Array.isArray(messages) ? messages : [messages];

    for (const msg of list) {
      const key    = msg?.key || {};
      const jid    = key?.remoteJid || '';
      const fromMe = key?.fromMe || false;

      if (!jid || jid.includes('status@broadcast')) continue;

      const phone        = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      const contact_name = msg?.pushName || null;

      let content = '';
      let type = 'text';
      const m = msg?.message || {};

      if (m.conversation) {
        content = m.conversation;
      } else if (m.extendedTextMessage) {
        content = m.extendedTextMessage.text || '';
      } else if (m.imageMessage) {
        content = m.imageMessage.caption || '📷 Imagem';
        type = 'image';
      } else if (m.audioMessage) {
        content = '🎵 Áudio';
        type = 'audio';
      } else if (m.videoMessage) {
        content = m.videoMessage.caption || '🎥 Vídeo';
        type = 'video';
      } else if (m.documentMessage) {
        content = m.documentMessage.fileName || '📄 Documento';
        type = 'document';
      } else if (m.stickerMessage) {
        content = '🎭 Sticker';
        type = 'sticker';
      } else {
        content = '[mídia]';
      }

      if (!phone || !content) continue;

      const payload = {
        phone,
        contact_name,
        content,
        type,
        from_me: fromMe,
        created_at: new Date().toISOString(),
      };

      const resp = await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const erro = await resp.text();
        console.error('[webhook] Supabase erro:', resp.status, erro);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook] exceção:', err);
    return res.status(200).json({ ok: true });
  }
}
