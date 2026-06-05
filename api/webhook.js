export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const SUPABASE_URL = 'https://zcwntpkiispbhjjgidih.supabase.co';
const SUPABASE_KEY = 'sb_secret_LyMbc41HZWqYB--Xz8MsWA_M8gC_xSD';

  try {
    const body = req.body;

    // Aceita "messages.upsert" E "MESSAGES_UPSERT"
console.log('[webhook] body recebido:', JSON.stringify(body).slice(0, 500));
const evento = (body?.event || body?.type || '').toLowerCase().replace('.', '_');
console.log('[webhook] evento detectado:', evento);
    if (evento !== 'messages_upsert') {
      return res.status(200).json({ ok: true, ignorado: body?.event });
    }

    // Descobre a instância que enviou
    const instanceName = body?.instance || body?.instanceName || null;

    // Busca o clinic_id baseado na instância
    let clinic_id = null;
    if (instanceName) {
      const clinicResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${instanceName}&select=id`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
          },
        }
      );
      const clinics = await clinicResp.json();
      if (clinics?.length > 0) clinic_id = clinics[0].id;
    }

    const messages = body?.data || [];
    const list = Array.isArray(messages) ? messages : [messages];

    for (const msg of list) {
      const key    = msg?.key || {};
      const jid    = key?.remoteJid || '';
      const fromMe = key?.fromMe || false;

      if (!jid || jid.includes('status@broadcast') || jid.includes('@g.us')) continue;

      const phone        = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      const contact_name = fromMe ? null : (msg?.pushName || null);

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
        payload_extra = { media_url: m.imageMessage.url || null };
      } else if (m.audioMessage) {
        content = '🎵 Áudio';
        type = 'audio';
        payload_extra = { media_url: m.audioMessage.url || null };
      } else if (m.videoMessage) {
        content = m.videoMessage.caption || '🎥 Vídeo';
        type = 'video';
        payload_extra = { media_url: m.videoMessage.url || null };
      } else if (m.documentMessage) {
        content = m.documentMessage.fileName || '📄 Documento';
        type = 'document';
        payload_extra = { media_url: m.documentMessage.url || null };
      } else if (m.stickerMessage) {
        content = '🎭 Sticker';
        type = 'sticker';
        payload_extra = { media_url: m.stickerMessage.url || null };
      } else {
        content = '[mídia]';
      }
let payload_extra = {};
    let payload_extra = {};  if (!phone || !content) continue;
const msgId = key?.id || null;
      const payload = {
        clinic_id,
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
         'Prefer': 'return=minimal,resolution=ignore-duplicates',
        },
       JSON.stringify({ ...payload, ...payload_extra, message_id: msgId }),
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
