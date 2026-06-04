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

      const telefone     = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      const nome_contato = msg?.pushName || null;

      let conteudo = '';
      let tipo = 'texto';
      const m = msg?.message || {};

      if (m.conversation) {
        conteudo = m.conversation;
      } else if (m.extendedTextMessage) {
        conteudo = m.extendedTextMessage.text || '';
      } else if (m.imageMessage) {
        conteudo = m.imageMessage.caption || '📷 Imagem';
        tipo = 'imagem';
      } else if (m.audioMessage) {
        conteudo = '🎵 Áudio';
        tipo = 'audio';
      } else if (m.videoMessage) {
        conteudo = m.videoMessage.caption || '🎥 Vídeo';
        tipo = 'video';
      } else if (m.documentMessage) {
        conteudo = m.documentMessage.fileName || '📄 Documento';
        tipo = 'documento';
      } else if (m.stickerMessage) {
        conteudo = '🎭 Sticker';
        tipo = 'sticker';
      } else {
        conteudo = '[mídia]';
      }

      if (!telefone || !conteudo) continue;

      const payload = {
        telefone,
        nome_contato,
        conteudo,
        tipo,
        from_me: fromMe,
        criado_em: new Date().toISOString(),
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
