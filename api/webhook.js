export default async function handler(req, res) {
  // Aceita GET/HEAD para health-check do Vercel e Evolution API
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  // ── Configuração ──────────────────────────────────────────────────────────
  // IMPORTANTE: mova essas vars para o painel Environment Variables do Vercel.
  // Nunca deixe chaves no código-fonte commitado.
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key (JWT longo)

  if (!SUPABASE_KEY) {
    console.error('[webhook] SUPABASE_SERVICE_KEY não configurada nas env vars do Vercel');
    return res.status(500).json({ error: 'Configuração ausente no servidor' });
  }

  // ── Parse do body ─────────────────────────────────────────────────────────
  // O Vercel com Next.js já faz parse automático, mas por segurança:
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      console.error('[webhook] Falha ao parsear body:', e.message);
      return res.status(400).json({ error: 'Body inválido' });
    }
  }

  if (!body || typeof body !== 'object') {
    console.error('[webhook] Body vazio ou inválido:', body);
    return res.status(400).json({ error: 'Body vazio' });
  }

  console.log('[webhook] Body recebido:', JSON.stringify(body).slice(0, 500));

  try {
    // ── Filtro de evento ──────────────────────────────────────────────────
    // A Evolution API v2 envia { event: "messages.upsert" } ou { type: "messages.upsert" }
    const rawEvento = body?.event || body?.type || '';
    const evento = rawEvento.toLowerCase().replace('.', '_');

    if (evento !== 'messages_upsert') {
      console.log('[webhook] Evento ignorado:', rawEvento);
      return res.status(200).json({ ok: true, ignorado: rawEvento });
    }

    // ── Buscar clinic_id pela instância ──────────────────────────────────
    const instanceName = body?.instance || body?.instanceName || null;
    let clinic_id = null;

    if (instanceName) {
      const clinicResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${encodeURIComponent(instanceName)}&select=id&limit=1`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        }
      );

      if (!clinicResp.ok) {
        const errText = await clinicResp.text();
        console.error('[webhook] Erro ao buscar clínica:', clinicResp.status, errText);
        // Não retorna 500 — continua sem clinic_id para não perder a mensagem
      } else {
        const clinics = await clinicResp.json();
        if (clinics?.length > 0) {
          clinic_id = clinics[0].id;
          console.log('[webhook] clinic_id encontrado:', clinic_id);
        } else {
          console.warn('[webhook] Nenhuma clínica encontrada para instância:', instanceName);
        }
      }
    }

    // ── Processar mensagens ───────────────────────────────────────────────
    const rawMessages = body?.data || body?.messages || [];
    const list = Array.isArray(rawMessages) ? rawMessages : [rawMessages];

    console.log('[webhook] Total de mensagens no payload:', list.length);

    const insertados = [];
    const erros = [];

    for (const msg of list) {
      try {
        const key = msg?.key || {};
        const jid = key?.remoteJid || '';
        const fromMe = key?.fromMe ?? false;

        // Ignora broadcasts e grupos
        if (!jid || jid.includes('status@broadcast') || jid.includes('@g.us')) {
          console.log('[webhook] JID ignorado:', jid);
          continue;
        }

        const phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const contact_name = fromMe ? null : (msg?.pushName || null);
        const message_id = key?.id || null;
        const timestamp = msg?.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString();

        // ── Extração de conteúdo e tipo ────────────────────────────────
        let content = '';
        let type = 'text';
        let media_url = null;

        const m = msg?.message || {};

        if (m.conversation) {
          content = m.conversation;
        } else if (m.extendedTextMessage) {
          content = m.extendedTextMessage?.text || '';
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
          const lat = m.locationMessage?.degreesLatitude;
          const lng = m.locationMessage?.degreesLongitude;
          content = `📍 Localização: ${lat}, ${lng}`;
          type = 'location';
        } else if (m.contactMessage) {
          content = `👤 Contato: ${m.contactMessage?.displayName || ''}`;
          type = 'contact';
        } else {
          // Tipo desconhecido — loga para debug mas não quebra
          console.warn('[webhook] Tipo de mensagem não mapeado:', Object.keys(m));
          content = '[mensagem não suportada]';
          type = 'unknown';
        }

        // ── Upsert ou insert do lead ──────────────────────────────────
        // Garante que o lead exista na tabela `leads` antes de inserir a mensagem
        if (clinic_id && phone) {
          const leadUpsert = await fetch(
            `${SUPABASE_URL}/rest/v1/leads`,
            {
              method: 'POST',
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=ignore-duplicates,return=representation',
              },
              body: JSON.stringify({
                clinic_id,
                phone,
                name: contact_name,
                last_message_at: timestamp,
              }),
            }
          );

          if (!leadUpsert.ok) {
            const errText = await leadUpsert.text();
            console.warn('[webhook] Aviso ao upsert lead:', leadUpsert.status, errText);
            // Continua para tentar salvar a mensagem mesmo assim
          }
        }

        // ── Insert da mensagem ────────────────────────────────────────
        const msgPayload = {
          clinic_id,
          phone,
          contact_name,
          message_id,
          from_me: fromMe,
          content,
          type,
          media_url,
          created_at: timestamp,
          instance_name: instanceName,
        };

        const insertResp = await fetch(
          `${SUPABASE_URL}/rest/v1/messages`,
          {
            method: 'POST',
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal', // mais rápido, não retorna o registro
            },
            body: JSON.stringify(msgPayload),
          }
        );

        if (!insertResp.ok) {
          const errText = await insertResp.text();
          console.error('[webhook] Erro ao inserir mensagem:', insertResp.status, errText);
          erros.push({ phone, error: errText });
        } else {
          console.log('[webhook] Mensagem salva — phone:', phone, '| tipo:', type);
          insertados.push(phone);
        }
      } catch (msgErr) {
        console.error('[webhook] Erro ao processar msg individual:', msgErr.message, msgErr.stack);
        erros.push({ error: msgErr.message });
      }
    }

    return res.status(200).json({
      ok: true,
      processadas: insertados.length,
      erros: erros.length,
      detalhes_erros: erros.length > 0 ? erros : undefined,
    });

  } catch (err) {
    // ── Catch global ─────────────────────────────────────────────────────
    console.error('[webhook] ERRO GERAL:', err.message);
    console.error('[webhook] Stack:', err.stack);
    return res.status(500).json({
      error: 'Erro interno no webhook',
      message: err.message,
    });
  }
}
