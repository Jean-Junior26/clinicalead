export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_KEY) {
    console.error('[webhook] SUPABASE_SERVICE_KEY não configurada');
    return res.status(500).json({ error: 'Configuração ausente' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {
      return res.status(400).json({ error: 'Body inválido' });
    }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Body vazio' });
  }

  try {
    const rawEvento = body?.event || body?.type || '';
    const evento = rawEvento.toLowerCase().replace('.', '_');

    if (evento !== 'messages_upsert') {
      console.log('[webhook] Evento ignorado:', rawEvento);
      return res.status(200).json({ ok: true, ignorado: rawEvento });
    }

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
      console.log('[webhook] instância:', instanceName, '| clinic_id:', clinic_id);
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
          content = m.conversation;
          type = 'text';
        } else if (m.extendedTextMessage) {
          content = m.extendedTextMessage?.text || '';
          type = 'text';
        } else if (m.imageMessage) {
          content = m.imageMessage?.caption || '📷 Imagem';
          type = 'image';
          media_url = m.imageMessage?.url || null;
        } else if (m.audioMessage) {
          content = '🎵 Áudio';
          type = 'audio';
          media_url = m.audioMessage?.url || null;
        } else if (m.videoMessage) {
          content = m.videoMessage?.caption || '🎥 Vídeo';
          type = 'video';
          media_url = m.videoMessage?.url || null;
        } else if (m.documentMessage) {
          content = m.documentMessage?.fileName || '📄 Documento';
          type = 'document';
          media_url = m.documentMessage?.url || null;
        } else if (m.stickerMessage) {
          content = '🖼️ Sticker';
          type = 'sticker';
        } else if (m.locationMessage) {
          content = `📍 Localização: ${m.locationMessage?.degreesLatitude}, ${m.locationMessage?.degreesLongitude}`;
          type = 'location';
        } else if (m.contactMessage) {
          content = `👤 Contato: ${m.contactMessage?.displayName || ''}`;
          type = 'contact';
        } else {
          content = '[mídia]';
          type = 'unknown';
          console.warn('[webhook] Tipo não mapeado:', Object.keys(m));
        }

        const payload = {
          clinic_id,
          phone,
          contact_name,
          content,
          type,
          from_me: fromMe,
          media_url,
          message_id,
          created_at,
        };

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
          console.error('[webhook] Erro ao inserir mensagem:', insertResp.status, errText);
          erros.push({ phone, erro: errText });
        } else {
          console.log('[webhook] Mensagem salva — phone:', phone, '| type:', type);
          insertados.push(phone);
        }
      } catch (msgErr) {
        console.error('[webhook] Erro ao processar msg:', msgErr.message);
        erros.push({ erro: msgErr.message });
      }
    }

    return res.status(200).json({
      ok: true,
      processadas: insertados.length,
      erros: erros.length,
      detalhes_erros: erros.length > 0 ? erros : undefined,
    });

  } catch (err) {
    console.error('[webhook] ERRO GERAL:', err.message, err.stack);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
