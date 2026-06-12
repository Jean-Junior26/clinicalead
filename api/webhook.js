module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const EVO_URL = 'https://evolution-api-production-b649.up.railway.app';
const EVO_KEY = '185aff001ce6bb5b9cadec59294ead845c35217a1688d5d77f58a668d98ae000';

  if (!SUPABASE_KEY) return res.status(500).json({ error: 'Configuração ausente' });

  const sbHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  // ── Baixa mídia descriptografada do Evolution e salva no Storage
  async function baixarEsalvarMidia(messageId, instanceName, phone, tipo, nomeOriginal) {
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

      const config = {
        audio:    { bucket: 'audios', ext: 'ogg',  mime: 'audio/ogg' },
        image:    { bucket: 'midias', ext: 'jpg',  mime: 'image/jpeg' },
        video:    { bucket: 'midias', ext: 'mp4',  mime: 'video/mp4' },
        sticker:  { bucket: 'midias', ext: 'webp', mime: 'image/webp' },
        document: { bucket: 'midias', ext: 'bin',  mime: 'application/octet-stream' },
      };
      const cfg = config[tipo] || config.document;
      const binary = Buffer.from(base64, 'base64');

      let fileName;
      if (tipo === 'document' && nomeOriginal) {
        const limpo = String(nomeOriginal).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
        fileName = `doc_${phone}_${Date.now()}_${limpo}`;
      } else {
        fileName = `${tipo}_${phone}_${Date.now()}.${cfg.ext}`;
      }

      const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${cfg.bucket}/${fileName}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': cfg.mime,
        },
        body: binary,
      });
      if (!upload.ok) return null;
      return `${SUPABASE_URL}/storage/v1/object/public/${cfg.bucket}/${fileName}`;
    } catch (e) {
      console.error('[webhook] Erro ao baixar mídia:', e.message);
      return null;
    }
  }

  // ── LEMBRETES: enviar resposta automática via Evolution ─────
  async function responderPaciente(instanceName, clinicId, phone, message) {
    try {
      const cleanPhone = String(phone).replace(/\D/g, '');
      const number = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;
      const r = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, text: message }),
      });
      const data = await r.json().catch(() => null);
      const sentId = data?.key?.id || null;

      // Salva a mensagem enviada no Inbox (Evolution não notifica envios via API)
      await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          clinic_id: clinicId,
          phone: number,
          contact_name: null,
          content: message,
          type: 'text',
          from_me: true,
          media_url: null,
          message_id: sentId,
          created_at: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.error('[webhook] Erro ao responder paciente:', e.message);
    }
  }

  // ── LEMBRETES: processar resposta "1" (confirma) ou "2" (remarca)
  async function processarConfirmacao(clinic_id, phone, content, instanceName) {
    try {
      if (!clinic_id || !phone || !content) return;

      // Normaliza a resposta do paciente
      const resp = String(content).trim().toLowerCase();
      const ehConfirmar = ['1', '1️⃣', 'confirmar', 'confirmo', 'confirmado'].includes(resp);
      const ehRemarcar = ['2', '2️⃣', 'remarcar', 'reagendar'].includes(resp);
      if (!ehConfirmar && !ehRemarcar) return;

      // Encontra o lead pelo telefone (compara os últimos 8 dígitos)
      const digitos = String(phone).replace(/\D/g, '');
      const sufixo = digitos.slice(-8);
      if (sufixo.length < 8) return;

      const leadResp = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${clinic_id}&telefone=ilike.*${sufixo}&select=id,nome&limit=1`,
        { headers: sbHeaders }
      );
      if (!leadResp.ok) return;
      const leadsEnc = await leadResp.json();
      if (!leadsEnc.length) return;
      const lead = leadsEnc[0];

      // Busca a próxima consulta agendada desse lead que JÁ recebeu o lembrete de 24h
      const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
      const consResp = await fetch(
        `${SUPABASE_URL}/rest/v1/consultas?lead_id=eq.${lead.id}&clinic_id=eq.${clinic_id}&status=eq.agendado&lembrete_24h=not.is.null&data=gte.${hojeBRT}&order=data.asc,hora.asc&select=id,data,hora&limit=1`,
        { headers: sbHeaders }
      );
      if (!consResp.ok) return;
      const consultasEnc = await consResp.json();
      if (!consultasEnc.length) return; // não há consulta pendente de confirmação = ignora
      const consulta = consultasEnc[0];

      const [ano, mes, dia] = consulta.data.split('-');
      const dataFmt = `${dia}/${mes}`;
      const horaFmt = (consulta.hora || '').slice(0, 5);
      const primeiroNome = (lead.nome || '').split(' ')[0];

      if (ehConfirmar) {
        // Atualiza status -> confirmado
        await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=eq.${consulta.id}`, {
          method: 'PATCH',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'confirmado' }),
        });
        if (instanceName) {
          await responderPaciente(
            instanceName,
            clinic_id,
            phone,
            `Consulta confirmada, ${primeiroNome}! ✅\n\nTe esperamos dia ${dataFmt} às *${horaFmt}*. Até lá! 🦷`
          );
        }
      } else if (ehRemarcar) {
        // Marca pedido de remarcação
        await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=eq.${consulta.id}`, {
          method: 'PATCH',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ remarcar_solicitado: true }),
        });
        if (instanceName) {
          await responderPaciente(
            instanceName,
            clinic_id,
            phone,
            `Sem problema, ${primeiroNome}! 😊\n\nNossa equipe vai entrar em contato em breve para encontrarmos um novo horário para você.`
          );
        }
      }
    } catch (e) {
      console.error('[webhook] Erro em processarConfirmacao:', e.message);
    }
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Body inválido' }); }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body vazio' });

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

        // Anti-duplicata PRIMEIRO: se já foi salva, pula antes de baixar qualquer mídia
        if (message_id) {
          const dupResp = await fetch(
            `${SUPABASE_URL}/rest/v1/mensagens?message_id=eq.${encodeURIComponent(message_id)}&select=id&limit=1`,
            { headers: sbHeaders }
          );
          if (dupResp.ok) {
            const dup = await dupResp.json();
            if (dup.length) { insertados.push(phone); continue; }
          }
        }

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
          if (message_id && instanceName) {
            media_url = await baixarEsalvarMidia(message_id, instanceName, phone, 'image');
          }
        } else if (m.audioMessage) {
          content = '🎵 Áudio'; type = 'audio';
          if (message_id && instanceName) {
            media_url = await baixarEsalvarMidia(message_id, instanceName, phone, 'audio');
          }
        } else if (m.videoMessage) {
          content = m.videoMessage?.caption || '🎥 Vídeo'; type = 'video';
          if (message_id && instanceName) {
            media_url = await baixarEsalvarMidia(message_id, instanceName, phone, 'video');
          }
        } else if (m.documentMessage) {
          content = m.documentMessage?.fileName || '📄 Documento'; type = 'document';
          if (message_id && instanceName) {
            media_url = await baixarEsalvarMidia(message_id, instanceName, phone, 'document', m.documentMessage?.fileName);
          }
        } else if (m.stickerMessage) {
          content = '🖼️ Sticker'; type = 'sticker';
          if (message_id && instanceName) {
            media_url = await baixarEsalvarMidia(message_id, instanceName, phone, 'sticker');
          }
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

        // ── LEMBRETES: se for resposta do paciente ("1" ou "2"), processa
        if (!fromMe && type === 'text') {
          await processarConfirmacao(clinic_id, phone, content, instanceName);
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
