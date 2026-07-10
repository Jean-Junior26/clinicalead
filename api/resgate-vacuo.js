// ============================================================
// CLINICALEAD — Resgate do Vácuo
// Roda periodicamente (via cron externo, ex: cron-job.org a cada 5min).
// Verifica, pra cada clínica em modo "Cauteloso" (só responde fora do
// horário), se existe alguma conversa com a ÚLTIMA mensagem sendo do
// PACIENTE, dentro do horário comercial, parada há mais de
// LIMIAR_MINUTOS sem ninguém da equipe responder. Se achar, aciona o
// Brian em modo "resgate_vacuo" pra assumir e não deixar o paciente
// no vácuo.
//
// Configurar em Vercel → Settings → Environment Variables:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, EVOLUTION_API_URL, EVOLUTION_API_KEY
// (as duas últimas ANTES não existiam como env var — a chave estava
// escrita direto no código do webhook.js, exposta. Corrigido aqui e lá.)
// ============================================================

module.exports = async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-62cb.up.railway.app';
  const EVO_KEY = process.env.EVOLUTION_API_KEY;

  if (!SUPABASE_KEY || !EVO_KEY) {
    return res.status(500).json({ ok: false, erro: 'Configuração ausente: verifique SUPABASE_SERVICE_KEY e EVOLUTION_API_KEY nas env vars da Vercel.' });
  }

  const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

  const LIMIAR_MINUTOS = 15; // tempo sem resposta humana pra considerar "vácuo"
  const JANELA_MAX_HORAS = 6; // não ressuscita conversa mais velha que isso
  // Brian só resgata o PRIMEIRO CONTATO de um lead novo (ex: "Olá, quero
  // saber sobre X" vindo de anúncio) — não durante o funil inteiro. Uma
  // vez que a equipe (ou o próprio Brian) já iniciou o contato e o lead
  // avançou pra 'contato'/'agendado', o resgate automático não se aplica
  // mais: a partir daí, é a equipe quem conduz.
  const STATUS_LEAD_ELEGIVEL = ['novo'];

  function dentroDoHorario(horario) {
    try {
      if (!horario || typeof horario !== 'object') return false;
      const agora = new Date(Date.now() - 3 * 3600 * 1000); // BRT
      const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
      const diaKey = dias[agora.getUTCDay()];
      const faixa = horario[diaKey];
      if (!faixa || !faixa.abre || !faixa.fecha) return false;
      const hhmm = `${String(agora.getUTCHours()).padStart(2, '0')}:${String(agora.getUTCMinutes()).padStart(2, '0')}`;
      return hhmm >= faixa.abre && hhmm <= faixa.fecha;
    } catch (e) { return false; }
  }

  const resultado = { verificadas: 0, resgatadas: 0, puladosForaDoEscopo: 0, erros: [] };

  try {
    // 1) clínicas com Brian liberado + automático ligado
    const cfgResp = await fetch(
      `${SUPABASE_URL}/rest/v1/brian_config?select=clinic_id,brian_liberado,auto_ativo,auto_modo,auto_so_fora_horario,horario_funcionamento&brian_liberado=eq.true&auto_ativo=eq.true`,
      { headers: sbHeaders }
    );
    const configs = cfgResp.ok ? await cfgResp.json() : [];

    for (const cfg of configs) {
      // modo 'sempre' (Ágil) já responde a qualquer hora — resgate é só pro modo 'fora' (Cauteloso)
      const modo = cfg.auto_modo || (cfg.auto_so_fora_horario === false ? 'sempre' : 'fora');
      if (modo === 'sempre') continue;
      if (!dentroDoHorario(cfg.horario_funcionamento)) continue; // só relevante DENTRO do horário

      const clinResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?id=eq.${cfg.clinic_id}&select=id,whatsapp_instance`,
        { headers: sbHeaders }
      );
      const clinArr = clinResp.ok ? await clinResp.json() : [];
      const clinic = clinArr[0];
      if (!clinic || !clinic.whatsapp_instance) continue;

      const desde = new Date(Date.now() - JANELA_MAX_HORAS * 3600 * 1000).toISOString();
      const msgsResp = await fetch(
        `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${cfg.clinic_id}&created_at=gte.${desde}&select=phone,content,from_me,created_at&order=created_at.desc&limit=500`,
        { headers: sbHeaders }
      );
      const msgs = msgsResp.ok ? await msgsResp.json() : [];

      // última mensagem de cada conversa (msgs já vem ordenado desc)
      const ultimaPorTelefone = {};
      for (const m of msgs) {
        if (!ultimaPorTelefone[m.phone]) ultimaPorTelefone[m.phone] = m;
      }

      const agoraMs = Date.now();
      for (const [phone, ultima] of Object.entries(ultimaPorTelefone)) {
        resultado.verificadas++;
        if (ultima.from_me) continue; // última msg já foi da clínica (humano ou Brian) — não é vácuo
        const minutosParados = (agoraMs - new Date(ultima.created_at).getTime()) / 60000;
        if (minutosParados < LIMIAR_MINUTOS) continue;

        // conversa com Brian desligado manualmente? respeita
        const convResp = await fetch(
          `${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${cfg.clinic_id}&phone=eq.${phone}&select=auto_desligado&limit=1`,
          { headers: sbHeaders }
        );
        const convArr = convResp.ok ? await convResp.json() : [];
        if (convArr[0] && convArr[0].auto_desligado === true) continue;

        // ── SÓ RESGATA PRIMEIRO CONTATO (status 'novo') ──
        // Se o lead já avançou no funil (contato/agendado) ou já é
        // paciente (compareceu/fechado), a conversa é conduzida pela
        // equipe — não gasta mensagem de IA com isso.
        const sufixoBusca = String(phone).replace(/\D/g, '').slice(-8);
        const leadResp = await fetch(
          `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${cfg.clinic_id}&phone=ilike.*${sufixoBusca}&select=id,status&limit=1`,
          { headers: sbHeaders }
        );
        const leadArr = leadResp.ok ? await leadResp.json() : [];
        const lead = leadArr[0];
        if (!lead || !STATUS_LEAD_ELEGIVEL.includes(lead.status)) { resultado.puladosForaDoEscopo++; continue; }

        try {
          const brResp = await fetch(`${SUPABASE_URL}/functions/v1/brian`, {
            method: 'POST',
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'responder_auto', clinic_id: cfg.clinic_id, phone, ultima_msg: ultima.content, modo: 'resgate_vacuo' }),
          });
          const brData = brResp.ok ? await brResp.json() : null;
          const texto = brData && brData.ok ? brData.sugestao : null;
          if (!texto) { resultado.erros.push(`${phone}: Brian não gerou resposta (${brData?.erro || 'sem detalhe'})`); continue; }

          const cleanPhone = String(phone).replace(/\D/g, '');
          const number = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;
          const evoResp = await fetch(`${EVO_URL}/message/sendText/${clinic.whatsapp_instance}`, {
            method: 'POST',
            headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number, text: texto }),
          });
          const evoData = await evoResp.json().catch(() => null);
          await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
            method: 'POST',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              clinic_id: cfg.clinic_id, phone: number, contact_name: 'BRIAN_AUTO',
              content: texto, type: 'text', from_me: true, media_url: null,
              message_id: evoData?.key?.id || null, created_at: new Date().toISOString(),
            }),
          });
          resultado.resgatadas++;
          console.log(`[RESGATE-VACUO] assumiu ${phone} (clínica ${cfg.clinic_id}) após ${Math.round(minutosParados)}min sem resposta`);
        } catch (e) {
          resultado.erros.push(`${phone}: ${e.message}`);
        }
      }
    }

    return res.status(200).json({ ok: true, ...resultado });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: e.message });
  }
};
