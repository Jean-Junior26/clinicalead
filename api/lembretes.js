// ============================================================
// CLINICALEAD — LEMBRETES AUTOMÁTICOS ANTI NO-SHOW
// Endpoint chamado pelo cron a cada 30 min.
// - Lembrete 24h antes: pede confirmação (1 = confirmar, 2 = remarcar)
// - Lembrete 2h antes: reforço no dia da consulta
// Nunca envia duplicado (controle via colunas lembrete_24h / lembrete_2h)
// ============================================================

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const EVO_URL = 'https://evolution-api-production-b649.up.railway.app';
  const EVO_KEY = '185aff001ce6bb5b9cadec59294ead845c35217a1688d5d77f58a668d98ae000';
  const TOKEN = process.env.LEMBRETES_TOKEN;

  // ── Segurança: só roda com o token correto ────────────────
  const tokenRecebido = req.query?.token || req.headers['x-token'];
  if (!TOKEN || tokenRecebido !== TOKEN) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  if (!SUPABASE_KEY) return res.status(500).json({ error: 'Configuração ausente' });

  const sbHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  // ── Helpers ────────────────────────────────────────────────
  async function sbGet(pathQuery) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathQuery}`, { headers: sbHeaders });
    if (!r.ok) throw new Error(`Supabase GET falhou: ${await r.text()}`);
    return r.json();
  }

  async function sbPatch(pathQuery, payload) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathQuery}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
    return r.ok;
  }

  async function enviarWhatsApp(instance, phone, message, clinicId) {
    const cleanPhone = String(phone).replace(/\D/g, '');
    const number = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;
    const r = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, text: message }),
    });
    if (!r.ok) throw new Error(`Evolution falhou: ${await r.text()}`);
    const data = await r.json().catch(() => null);

    // Salva a mensagem enviada no Inbox (Evolution não notifica envios via API)
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          clinic_id: clinicId || null,
          phone: number,
          contact_name: null,
          content: message,
          type: 'text',
          from_me: true,
          media_url: null,
          message_id: data?.key?.id || null,
          created_at: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.error('[lembretes] Falha ao salvar no Inbox:', e.message);
    }

    return data;
  }

  function fmtData(dataStr) {
    const [a, m, d] = dataStr.split('-');
    return `${d}/${m}`;
  }

  try {
    // ── Janela de busca: hoje até depois de amanhã (horário BR) ─
    const agora = new Date(); // UTC real
    const brtAgora = new Date(agora.getTime() - 3 * 3600 * 1000); // Brasil = UTC-3
    const hoje = brtAgora.toISOString().split('T')[0];
    const limite = new Date(brtAgora.getTime() + 2 * 24 * 3600 * 1000).toISOString().split('T')[0];

    // Consultas candidatas: agendadas ou confirmadas, de hoje até +2 dias
    const consultas = await sbGet(
      `consultas?data=gte.${hoje}&data=lte.${limite}&status=in.(agendado,confirmado)&select=id,clinic_id,lead_id,data,hora,status,lembrete_24h,lembrete_2h`
    );

    if (!consultas.length) {
      return res.status(200).json({ ok: true, enviados_24h: 0, enviados_2h: 0, msg: 'Nenhuma consulta no período' });
    }

    // Busca leads e clínicas em lote
    const leadIds = [...new Set(consultas.map(c => c.lead_id).filter(Boolean))];
    const clinicIds = [...new Set(consultas.map(c => c.clinic_id).filter(Boolean))];

    const leads = leadIds.length
      ? await sbGet(`leads?id=in.(${leadIds.join(',')})&select=id,nome,telefone`)
      : [];
    const clinicas = clinicIds.length
      ? await sbGet(`clinicas?id=in.(${clinicIds.join(',')})&select=id,nome,whatsapp_instance`)
      : [];

    const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));
    const clinicMap = Object.fromEntries(clinicas.map(c => [c.id, c]));

    let enviados24h = 0;
    let enviados2h = 0;
    const erros = [];

    for (const c of consultas) {
      try {
        const lead = leadMap[c.lead_id];
        const clinica = clinicMap[c.clinic_id];

        // Sem telefone ou sem WhatsApp conectado = pula
        if (!lead?.telefone || !clinica?.whatsapp_instance) continue;

        // Monta o horário exato da consulta no fuso do Brasil
        const horaLimpa = (c.hora || '00:00').slice(0, 5); // "14:00:00" -> "14:00"
        const consultaTime = new Date(`${c.data}T${horaLimpa}:00-03:00`);
        const diffHoras = (consultaTime - agora) / (1000 * 3600);

        // Consulta já passou? Pula.
        if (diffHoras <= 0) continue;

        const primeiroNome = (lead.nome || '').split(' ')[0] || 'tudo bem';

        // ── LEMBRETE 24H (pede confirmação) ──────────────────
        if (!c.lembrete_24h && c.status === 'agendado' && diffHoras > 20 && diffHoras <= 26) {
          const msg =
            `Olá, ${primeiroNome}! 😊\n\n` +
            `Passando para lembrar da sua consulta na *${clinica.nome}* amanhã, dia ${fmtData(c.data)} às *${horaLimpa}*.\n\n` +
            `Por favor, responda:\n` +
            `1️⃣ para *CONFIRMAR*\n` +
            `2️⃣ para *REMARCAR*\n\n` +
            `Até logo! 🦷`;

          await enviarWhatsApp(clinica.whatsapp_instance, lead.telefone, msg, c.clinic_id);
          await sbPatch(`consultas?id=eq.${c.id}`, { lembrete_24h: new Date().toISOString() });
          enviados24h++;
          continue; // não manda os dois lembretes na mesma rodada
        }

        // ── LEMBRETE 2H (reforço do dia) ──────────────────────
        if (!c.lembrete_2h && diffHoras > 0 && diffHoras <= 2.5) {
          const msg =
            `Oi, ${primeiroNome}! 😄\n\n` +
            `Sua consulta na *${clinica.nome}* é hoje às *${horaLimpa}*. Estamos te esperando!\n\n` +
            `Qualquer imprevisto, é só responder esta mensagem. Até já! 🦷`;

          await enviarWhatsApp(clinica.whatsapp_instance, lead.telefone, msg, c.clinic_id);
          await sbPatch(`consultas?id=eq.${c.id}`, { lembrete_2h: new Date().toISOString() });
          enviados2h++;
        }
      } catch (e) {
        erros.push({ consulta: c.id, erro: e.message });
      }
    }

    return res.status(200).json({
      ok: true,
      consultas_analisadas: consultas.length,
      enviados_24h: enviados24h,
      enviados_2h: enviados2h,
      erros,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
