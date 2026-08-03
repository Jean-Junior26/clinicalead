export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ⚠️ AJUSTE 01/08 (parte 2): erro 133010 "Account not registered" — o
  // número aparece "Conectado" no painel visual, mas ainda falta um passo
  // técnico separado (chamada de registro na API) antes de conseguir
  // mandar mensagem de verdade. Isso é feito 1 vez só por número, nunca
  // mais precisa repetir depois que funcionar. PIN de 6 dígitos é
  // escolhido na hora — só precisa lembrar dele se um dia migrar esse
  // número de servidor de novo.
  if (req.body?.modo === 'registrar_numero_oficial') {
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
    const { clinic_id, pin } = req.body;
    if (!clinic_id || !pin) return res.status(400).json({ error: 'Faltou clinic_id ou pin (6 dígitos, ex: "123456")' });
    try {
      const clinicaResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinic_id}&select=nome,meta_phone_number_id,meta_access_token`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const clinicaArr = await clinicaResp.json();
      const clinica = clinicaArr[0];
      if (!clinica) return res.status(404).json({ error: 'Clínica não encontrada' });

      const regResp = await fetch(
        `https://graph.facebook.com/v21.0/${clinica.meta_phone_number_id}/register`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${clinica.meta_access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', pin: String(pin) }),
        }
      );
      const regData = await regResp.json();
      if (!regResp.ok) return res.status(400).json({ ok: false, erro: 'Falha ao registrar', detalhe: regData });
      return res.status(200).json({ ok: true, mensagem: `Número da clínica "${clinica.nome}" registrado com sucesso!`, detalhe: regData });
    } catch (e) {
      return res.status(500).json({ ok: false, erro: 'Erro interno', message: e.message });
    }
  }

  // ⚠️ AJUSTE 01/08: modo de TESTE da API Oficial (Meta), embutido aqui
  // em vez de criar um arquivo novo — o plano Hobby da Vercel só permite
  // 12 funções serverless, e já estávamos no limite. Ativa passando
  // { "modo": "teste_oficial", "clinic_id": "...", "telefone_teste": "..." }
  // no corpo do POST. Não mexe em nada do fluxo normal abaixo.
  if (req.body?.modo === 'teste_oficial') {
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
    const { clinic_id, telefone_teste } = req.body;
    if (!clinic_id || !telefone_teste) {
      return res.status(400).json({ error: 'Faltou clinic_id ou telefone_teste' });
    }
    try {
      const clinicaResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinic_id}&select=nome,tipo_conexao_whatsapp,meta_phone_number_id,meta_access_token`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const clinicaArr = await clinicaResp.json();
      const clinica = clinicaArr[0];
      if (!clinica) return res.status(404).json({ error: 'Clínica não encontrada' });
      if (clinica.tipo_conexao_whatsapp !== 'oficial') {
        return res.status(400).json({ error: `Essa clínica está marcada como '${clinica.tipo_conexao_whatsapp}', não 'oficial'.` });
      }
      if (!clinica.meta_phone_number_id || !clinica.meta_access_token) {
        return res.status(400).json({ error: 'Faltam credenciais salvas (phone_number_id ou token).' });
      }
      const numeroDestino = telefone_teste.replace(/\D/g, '');
      const metaResp = await fetch(
        `https://graph.facebook.com/v21.0/${clinica.meta_phone_number_id}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${clinica.meta_access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: numeroDestino,
            type: 'text',
            text: { body: `✅ Teste da API Oficial funcionando! Essa mensagem saiu da clínica "${clinica.nome}" via ClinicaLead CRM.` },
          }),
        }
      );
      const metaData = await metaResp.json();
      if (!metaResp.ok) return res.status(400).json({ ok: false, erro: 'A Meta recusou o envio', detalhe: metaData });
      return res.status(200).json({ ok: true, mensagem: 'Enviado com sucesso!', message_id: metaData?.messages?.[0]?.id });
    } catch (e) {
      return res.status(500).json({ ok: false, erro: 'Erro interno', message: e.message });
    }
  }

  const EVO_URL = 'https://evolution-api-production-62cb.up.railway.app';
  const EVO_KEY = '185aff001ce6bb5b9cadec59294ead845c35217a1688d5d77f58a668d98ae000';
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  const { instance, phone, message, clinic_id } = req.body;
  if (!instance || !phone || !message) return res.status(400).json({ error: 'Campos obrigatórios: instance, phone, message' });
  const cleanPhone = phone.replace(/\D/g, '');
  // ⚠️ AJUSTE 30/07: antes checava "começa com 55?" — isso quebrava pra
  // QUALQUER número estrangeiro que não começasse por coincidência com 55
  // (ex: 351... de Portugal virava 55351... um número que não existe em
  // lugar nenhum, e a mensagem simplesmente nunca saía, sem erro visível
  // pro usuário). Agora usa o TAMANHO do número pra decidir — mesma lógica
  // já usada certinho em outras partes do sistema: número brasileiro sem
  // o código do país tem no máximo 11 dígitos (DDD + 8 ou 9 dígitos); com
  // 12+ dígitos, já tem código de país (seja 55 do Brasil, seja outro
  // país) e não deve ser mexido.
  const number = cleanPhone.length >= 12 ? cleanPhone : '55' + cleanPhone;

  try {
    const resp = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, text: message }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);

    const messageId = data?.key?.id || data?.message?.key?.id || data?.id
                   || data?.messageId || data?.response?.key?.id || null;
    console.log('[SEND] message_id capturado:', messageId, '| instance:', instance);

    if (SUPABASE_KEY && messageId) {
      try {
        let clinicId = clinic_id || null;
        if (!clinicId) {
          // 1) Procura o número PRINCIPAL (clinicas.whatsapp_instance)
          const cResp = await fetch(
            `${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${encodeURIComponent(instance)}&select=id&limit=1`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
          );
          if (cResp.ok) { const cs = await cResp.json(); if (cs?.length) clinicId = cs[0].id; }
          // 2) Se não achou, procura nos números EXTRAS (tabela instancias)
          if (!clinicId) {
            const iResp = await fetch(
              `${SUPABASE_URL}/rest/v1/instancias?instance_name=eq.${encodeURIComponent(instance)}&select=clinic_id&limit=1`,
              { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
            );
            if (iResp.ok) { const is = await iResp.json(); if (is?.length) clinicId = is[0].clinic_id; }
          }
        }
        await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal,resolution=ignore-duplicates',
          },
          body: JSON.stringify({
            clinic_id: clinicId,
            phone: number,
            contact_name: null,
            content: message,
            type: 'text',
            from_me: true,
            message_id: messageId,
            instance_name: instance,
            read_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          }),
        });
      } catch (e) {
        console.log('[SEND] erro ao registrar:', e.message);
      }
    } else if (!messageId) {
      console.log('[SEND] SEM message_id — não registrou para evitar duplicata');
    }

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
