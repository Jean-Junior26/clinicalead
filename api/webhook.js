module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const EVO_URL = 'https://evolution-api-production-62cb.up.railway.app';
const EVO_KEY = '185aff001ce6bb5b9cadec59294ead845c35217a1688d5d77f58a668d98ae000';

  if (!SUPABASE_KEY) return res.status(500).json({ error: 'Configuração ausente' });

  const sbHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  // ── Baixa mídia descriptografada do Evolution e salva no Storage
  async function baixarEsalvarMidia(msgCompleta, instanceName, phone, tipo, nomeOriginal) {
    try {
      // v2.3.7: precisa do objeto message COMPLETO (não só a key), senão "Message not found"
      const r = await fetch(`${EVO_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
        method: 'POST',
        headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgCompleta, convertToMp4: false }),
      });
      if (!r.ok) {
        const errTxt = await r.text();
        return null;
      }
      const data = await r.json();
      const base64 = data.base64;
      if (!base64) {
        return null;
      }

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
      if (!upload.ok) {
        const upErr = await upload.text();
        return null;
      }
      const finalUrl = `${SUPABASE_URL}/storage/v1/object/public/${cfg.bucket}/${fileName}`;
      return finalUrl;
    } catch (e) {
      return null;
    }
  }

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
      await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          clinic_id: clinicId, phone: number, contact_name: null,
          content: message, type: 'text', from_me: true, media_url: null,
          message_id: sentId, created_at: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.error('[webhook] Erro ao responder paciente:', e.message);
    }
  }

  async function processarConfirmacao(clinic_id, phone, content, instanceName) {
    try {
      if (!clinic_id || !phone || !content) return;
      const resp = String(content).trim().toLowerCase();
      const ehConfirmar = ['1', '1️⃣', 'sim', 'confirmar', 'confirmo', 'confirmado', 'confirmada', 'ok', 'pode ser', 'vou', 'estarei', 'estarei la', 'estarei lá'].includes(resp);

      // ── CANCELAMENTO: detecção por PALAVRA-CHAVE (robusto a erros de português) ──
      // Normaliza: tira acentos pra "não" e "nao" caírem na mesma regra
      const semAcento = resp.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      // 1) Raízes que indicam cancelamento direto (contém em qualquer lugar da frase)
      const raizesCancelar = ['cancel', 'desmarc', 'desist'];
      let ehCancelar = raizesCancelar.some(r => semAcento.includes(r));
      // 2) Negação + intenção de não ir (ex: "nao vou mais", "nao vai dar", "nao tenho como ir", "nao quero mais")
      if (!ehCancelar) {
        const temNegacao = /\bn[ao]o?\b|\bnaum\b|\bnem\b/.test(semAcento); // nao, não, naum, nem
        const temIntencaoIr = /(vou|vai|quero|posso|consigo|da|dar|tenho como|poderei|poder)\b.*\b(mais|ir|comparecer)|(\bmais\b)|(\bir\b)|(comparecer)/.test(semAcento)
          || /(vou|vai|quero|posso|consigo|tenho|poderei)/.test(semAcento);
        // só marca cancelamento por negação se a frase for curta (resposta ao lembrete), evitando falso positivo em conversa longa
        if (temNegacao && temIntencaoIr && semAcento.length <= 40) ehCancelar = true;
      }

      const ehRemarcar = ['2', '2️⃣', 'nao', 'não', 'remarcar', 'reagendar', 'nao posso', 'não posso', 'nao vou', 'não vou'].includes(resp)
        || /remarc|reagend|outro dia|outro horario|outra data|mudar.*dia|mudar.*horario/.test(semAcento);
      const digitos = String(phone).replace(/\D/g, '');
      const sufixo = digitos.slice(-8);
      if (sufixo.length < 8) return;
      const leadResp = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${clinic_id}&telefone=ilike.*${sufixo}&select=id,nome&limit=1`,
        { headers: sbHeaders }
      );
      if (!leadResp.ok) return;
      const leadsEnc = await leadResp.json();
      const lead = leadsEnc[0];
      const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
      const amanhaBRT = new Date(Date.now() - 3 * 3600 * 1000 + 24 * 3600 * 1000).toISOString().split('T')[0];
      // Busca as consultas próximas (hoje/amanhã) do lead. Traz várias
      // pra escolher a MAIS RELEVANTE (a que a pessoa está respondendo),
      // não simplesmente a mais antiga.
      const consResp = await fetch(
        `${SUPABASE_URL}/rest/v1/consultas?lead_id=eq.${lead.id}&clinic_id=eq.${clinic_id}&status=in.(agendado,confirmado)&data=in.(${hojeBRT},${amanhaBRT})&select=id,data,hora,lembrete_24h,status&limit=10`,
        { headers: sbHeaders }
      );
      if (!consResp.ok) return;
      const consultasEnc = await consResp.json();
      if (!consultasEnc.length) return; // sem consulta próxima: só salva a mensagem

      // Escolhe a consulta mais relevante:
      // 1º) a que tem lembrete_24h mais RECENTE (foi a última lembrada)
      // 2º) se nenhuma tem lembrete, a mais próxima no tempo (data+hora asc)
      const comLembrete = consultasEnc.filter(c => c.lembrete_24h);
      let consulta;
      if (comLembrete.length) {
        comLembrete.sort((a, b) => new Date(b.lembrete_24h) - new Date(a.lembrete_24h));
        consulta = comLembrete[0];
      } else {
        consultasEnc.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
        consulta = consultasEnc[0];
      }

      // ── JANELA DE CONTEXTO ──
      // A consulta já é hoje/amanhã (filtro na query), então está na janela.
      const consultaProxima = true;
      const dentroDaJanela = consultaProxima;
      if (!dentroDaJanela) return;

      const [ano, mes, dia] = consulta.data.split('-');
      const dataFmt = `${dia}/${mes}`;
      const horaFmt = (consulta.hora || '').slice(0, 5);
      const primeiroNome = (lead.nome || '').split(' ')[0];
      if (ehConfirmar) {
        await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=eq.${consulta.id}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'confirmado' }),
        });
        // Busca endereco/mapa da clinica para a mensagem de boas-vindas
        let endereco = '', linkMapa = '';
        try {
          const clinicaResp = await fetch(
            `${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinic_id}&select=nome,endereco,link_mapa&limit=1`,
            { headers: sbHeaders }
          );
          if (clinicaResp.ok) {
            const cls = await clinicaResp.json();
            if (cls?.length) {
              endereco = cls[0].endereco || '';
              linkMapa = cls[0].link_mapa || (endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}` : '');
            }
          }
        } catch (e) {}
        let boasVindas = `Que ótimo, ${primeiroNome}! 🎉\n\nSua presença está *confirmada* para dia ${dataFmt} às *${horaFmt}*.\nEstamos ansiosos para te atender! 💛`;
        if (endereco) boasVindas += `\n\n📍 *Endereço:* ${endereco}`;
        if (linkMapa) boasVindas += `\n🗺️ *Como chegar:* ${linkMapa}`;
        boasVindas += `\n\nAté breve! 🦷`;
        if (instanceName) await responderPaciente(instanceName, clinic_id, phone, boasVindas);
      } else if (ehCancelar) {
        // NÃO cancela a consulta — só marca o pedido pra equipe reverter (tarefa urgente no CRC)
        await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=eq.${consulta.id}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ cancelar_solicitado: true }),
        });
        if (instanceName) await responderPaciente(instanceName, clinic_id, phone, `Recebi sua mensagem, ${primeiroNome}! 😊\n\nJá vou repassar para nossa equipe. Em breve alguém entra em contato com você!`);
      } else if (ehRemarcar) {
        await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=eq.${consulta.id}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ remarcar_solicitado: true }),
        });
        if (instanceName) await responderPaciente(instanceName, clinic_id, phone, `Sem problema, ${primeiroNome}! 😊\n\nNossa equipe vai entrar em contato em breve para encontrarmos um novo horário para você.`);
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
      // 1) Procura o número PRINCIPAL (clinicas.whatsapp_instance)
      const clinicResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${encodeURIComponent(instanceName)}&select=id&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (clinicResp.ok) {
        const clinics = await clinicResp.json();
        if (clinics?.length > 0) clinic_id = clinics[0].id;
      }
      // 2) Se não achou, procura nos números EXTRAS (tabela instancias)
      if (!clinic_id) {
        const instResp = await fetch(
          `${SUPABASE_URL}/rest/v1/instancias?instance_name=eq.${encodeURIComponent(instanceName)}&select=clinic_id&limit=1`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        if (instResp.ok) {
          const insts = await instResp.json();
          if (insts?.length > 0) clinic_id = insts[0].clinic_id;
        }
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
          if (message_id && instanceName) media_url = await baixarEsalvarMidia(msg, instanceName, phone, 'image');
        } else if (m.audioMessage) {
          content = '🎵 Áudio'; type = 'audio';
          if (message_id && instanceName) media_url = await baixarEsalvarMidia(msg, instanceName, phone, 'audio');
        } else if (m.videoMessage) {
          content = m.videoMessage?.caption || '🎥 Vídeo'; type = 'video';
          if (message_id && instanceName) media_url = await baixarEsalvarMidia(msg, instanceName, phone, 'video');
        } else if (m.documentMessage) {
          content = m.documentMessage?.fileName || '📄 Documento'; type = 'document';
          if (message_id && instanceName) media_url = await baixarEsalvarMidia(msg, instanceName, phone, 'document', m.documentMessage?.fileName);
        } else if (m.stickerMessage) {
          content = '🖼️ Sticker'; type = 'sticker';
          if (message_id && instanceName) media_url = await baixarEsalvarMidia(msg, instanceName, phone, 'sticker');
        } else if (m.locationMessage) {
          content = `📍 ${m.locationMessage?.degreesLatitude}, ${m.locationMessage?.degreesLongitude}`; type = 'location';
        } else if (m.contactMessage) {
          content = `👤 ${m.contactMessage?.displayName || ''}`; type = 'contact';
        } else {
          content = '[mídia]'; type = 'unknown';
        }

        const payload = { clinic_id, phone, contact_name, content, type, from_me: fromMe, media_url, message_id, created_at, instance_name: instanceName };
        const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(payload),
        });
        if (!insertResp.ok) {
          const errText = await insertResp.text();
          erros.push({ phone, erro: errText });
        } else {
          insertados.push(phone);
        }
        if (!fromMe && type === 'text') await processarConfirmacao(clinic_id, phone, content, instanceName);
      } catch (msgErr) {
        erros.push({ erro: msgErr.message });
      }
    }
    return res.status(200).json({ ok: true, processadas: insertados.length, erros: erros.length });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
