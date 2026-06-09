module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const EVO_URL = 'https://evolution-api-production-b649.up.railway.app';
const EVO_KEY = '185aff001ce6bb5b9cadec59294ead845c35217a1688d5d77f58a668d98ae000';

  if (!SUPABASE_KEY) return res.status(500).json({ error: 'Configuração ausente' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Body inválido' }); }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body vazio' });

  async function baixarEsalvarAudio(messageId, instanceName, phone) {
    try {
      const r = await fetch(`${EVO_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
        method: 'POST',
        headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
      });
      if (!r.ok) return null;
      const data = await r.json();
      const base64 = data.base64;
      if (!base64) return null;

      const binary = Buffer.from(base64, 'base64');
      const fileName = `audio_${phone}_${Date.now()}.ogg`;

      const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/audios/${fileName}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'audio/ogg',
        },
        body: binary,
      });
      if (!upload.ok) return null;
      return `${SUPABASE_URL}/storage/v1/object/public/audios/${fileName}`;
    } catch (e) {
      console.error('[webhook] Erro ao baixar áudio:', e.message);
      return null;
    }
  }

  try {
    const rawEvento = body?.event || body?.type || '';
    const evento = rawEvento.toLowerCase().replace('.', '_');

    if (evento !== 'messages_upsert') return res.status(200).json({ ok: true, ignorado: rawEvento });

    const instanceName = body?.instance || body?.instanceName || null;
    let clinic_id = null;

    if (instanceName) {
      const clinicResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${encodeURIComponent(instanceName)}&select=id&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (clinicResp.ok) {
        const clinics = await clinicResp.json();
        if (clinics?.length > 0) clinic_id = clinics[0].id;
      }
    }

    const rawMessages = body?.data || body?.messages || [];
    const list = Array.isArray(rawMessages) ? rawMessages : [rawMessages];
    const insertados = [];
    const erros = [];

    for (const msg of list) {
      try {
        const key = msg?.key || {};
        const jid = key?.remoteJid || '';
        const fromMe = key?.fromMe ?? false;

        if (!jid || jid.includes('status@broadcast') || jid.includes('@g.us')) continue;

        const phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const contact_name = fromMe ? null : (msg?.pushName || null);
        const message_id = key?.id || null;
        const created_at = msg?.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString();

        let content = '';
        let type = 'text';
        let media_url = null;
        const m = msg?.message || {};

        if (m.conversation) {
          content = m.conversation; type = 'text';
        } else if (m.extendedTextMessage) {
          content = m.extendedTextMessage?.text || ''; type = 'text';
        } else if (m.imageMessage) {
          content = m.imageMessage?.caption || '📷 Imagem'; type = 'image';
          media_url = m.imageMessage?.url || null;
        } else if (m.audioMessage) {
          content = '🎵 Áudio'; type = 'audio';
          if (message_id && instanceName) {
            media_url = await baixarEsalvarAudio(message_id, instanceName, phone);
          }
        } else if (m.videoMessage) {
          content = m.videoMessage?.caption || '🎥 Vídeo'; type = 'video';
          media_url = m.videoMessage?.url || null;
        } else if (m.documentMessage) {
          content = m.documentMessage?.fileName || '📄 Documento'; type = 'document';
          media_url = m.documentMessage?.url || null;
        } else if (m.stickerMessage) {
          content = '🖼️ Sticker'; type = 'sticker';
        } else if (m.locationMessage) {
          content = `📍 ${m.locationMessage?.degreesLatitude}, ${m.locationMessage?.degreesLongitude}`;
          type = 'location';
        } else if (m.contactMessage) {
          content = `👤 ${m.contactMessage?.displayName || ''}`; type = 'contact';
        } else {
          content = '[mídia]'; type = 'unknown';
        }

        const payload = { clinic_id, phone, contact_name, content, type, from_me: fromMe, media_url, message_id, created_at };

        const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(payload),
        });

        if (!insertResp.ok) {
          const errText = await insertResp.text();
          erros.push({ phone, erro: errText });
        } else {
          insertados.push(phone);
        }
      } catch (msgErr) {
        erros.push({ erro: msgErr.message });
      }
    }

    return res.status(200).json({ ok: true, processadas: insertados.length, erros: erros.length });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
