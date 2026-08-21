export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ⚠️ NOVO 01/08 — finaliza o Embedded Signup: troca o "code" que o
  // botão do frontend recebeu por um token de acesso de verdade, busca
  // os dados da WABA/número conectados, e salva tudo no banco. O App
  // Secret NUNCA aparece no código nem no chat — vem de uma variável
  // de ambiente configurada direto no painel da Vercel (Settings >
  // Environment Variables > META_APP_SECRET).
  if (req.body?.modo === 'finalizar_embedded_signup') {
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
    const META_APP_ID = '2170841700506560';
    const META_APP_SECRET = process.env.META_APP_SECRET;
    const { clinic_id, code } = req.body;

    if (!clinic_id || !code) return res.status(400).json({ error: 'Faltou clinic_id ou code' });
    if (!META_APP_SECRET) return res.status(500).json({ error: 'META_APP_SECRET não configurado nas variáveis de ambiente da Vercel' });

    try {
      // 1) troca o code por um token de acesso (curto prazo primeiro)
      const tokenResp = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&code=${code}`
      );
      const tokenData = await tokenResp.json();
      if (!tokenResp.ok) return res.status(400).json({ ok: false, erro: 'Falha ao trocar código por token', detalhe: tokenData });
      const accessToken = tokenData.access_token;

      // 2) descobre quais WABAs esse token tem acesso (o Embedded Signup
      // já entrega isso de forma direta, via "debug_token" ou consultando
      // as contas vinculadas ao usuário do sistema que autorizou)
      const wabaResp = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=businesses{owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}}&access_token=${accessToken}`
      );
      const wabaData = await wabaResp.json();
      const negocio = wabaData?.businesses?.data?.[0];
      const waba = negocio?.owned_whatsapp_business_accounts?.data?.[0];
      const numero = waba?.phone_numbers?.data?.[0];

      if (!waba || !numero) {
        return res.status(400).json({ ok: false, erro: 'Não encontrei WABA/número vinculado a essa conexão', detalhe: wabaData });
      }

      // ⚠️ AJUSTE 01/08: o token que o Embedded Signup devolve pode ter
      // expiração (ex: 60 dias, dependendo do template usado na
      // configuração) — NUNCA sobrescreve um token PERMANENTE que já
      // esteja salvo (gerado manualmente via System User antes). O
      // Embedded Signup aqui serve só pra IDENTIFICAR/conectar a
      // WABA/número; quem realmente opera o envio/recebimento continua
      // sendo o token permanente já validado e funcionando.
      const clinicaAtualResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinic_id}&select=meta_access_token`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const clinicaAtualArr = await clinicaAtualResp.json();
      const jaTinhaTokenPermanente = !!(clinicaAtualArr[0]?.meta_access_token);

      const camposParaSalvar = {
        tipo_conexao_whatsapp: 'oficial',
        meta_phone_number_id: numero.id,
        meta_waba_id: waba.id,
        meta_app_id: META_APP_ID,
      };
      if (!jaTinhaTokenPermanente) {
        // só usa o token do Embedded Signup se AINDA não tiver nenhum salvo
        camposParaSalvar.meta_access_token = accessToken;
      }

      // 3) salva no banco
      const upResp = await fetch(`${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinic_id}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(camposParaSalvar),
      });
      if (!upResp.ok) return res.status(500).json({ ok: false, erro: 'Falha ao salvar no banco', detalhe: await upResp.text() });

      return res.status(200).json({ ok: true, waba: waba.name, numero: numero.display_phone_number, token_preservado: jaTinhaTokenPermanente });
    } catch (e) {
      return res.status(500).json({ ok: false, erro: 'Erro interno', message: e.message });
    }
  }

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

  const { instance, phone, message, clinic_id, tipo, media_url } = req.body;
  // ⚠️ CORREÇÃO 14/08: essa checagem exigia "message" preenchido sempre —
  // mas o envio de ÁUDIO manda message:'' de propósito (o conteúdo é o
  // media_url, não texto). Isso barrava TODO áudio manual do Inbox antes
  // mesmo de tentar falar com a Meta — daí o erro "Campos obrigatórios:
  // phone, message" mesmo com tudo certo. Agora só exige "message" pro
  // caso de texto normal; pra áudio, exige media_url no lugar.
  const ehAudioComLink = tipo === 'audio' && media_url;
  if (!phone || (!message && !ehAudioComLink)) return res.status(400).json({ error: 'Campos obrigatórios: phone, e message (ou media_url quando for áudio)' });
  const cleanPhone = phone.replace(/\D/g, '');
  const number = cleanPhone.length >= 12 ? cleanPhone : '55' + cleanPhone;

  try {
    // ⚠️ NOVO 06/08: resolve a clínica ANTES de decidir o caminho de envio
    // — antes disso, o envio manual do Inbox só sabia falar com Evolution
    // (usava direto `instance`), então clínica já migrada pra API Oficial
    // (sem whatsapp_instance) simplesmente não conseguia mandar mensagem
    // nenhuma pelo Inbox. Agora verifica o tipo de conexão primeiro.
    let clinicId = clinic_id || null;
    let clinicaInfo = null;
    if (clinicId) {
      const cResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinicId}&select=id,tipo_conexao_whatsapp,meta_phone_number_id,meta_access_token`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (cResp.ok) { const cs = await cResp.json(); if (cs?.length) clinicaInfo = cs[0]; }
    } else if (instance) {
      const cResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${encodeURIComponent(instance)}&select=id,tipo_conexao_whatsapp,meta_phone_number_id,meta_access_token&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (cResp.ok) { const cs = await cResp.json(); if (cs?.length) { clinicaInfo = cs[0]; clinicId = cs[0].id; } }
    }

    let resp, data, messageId;

    if (clinicaInfo?.tipo_conexao_whatsapp === 'oficial' && clinicaInfo.meta_phone_number_id && clinicaInfo.meta_access_token) {
      // ── API OFICIAL DA META ──
      // ⚠️ NOVO 06/08: suporte a áudio por link (usado pelo gravador de
      // áudio do Inbox) — quando o corpo vier com tipo:'audio' + media_url
      // (já subiu pro Storage antes de chamar aqui), manda como áudio em
      // vez de texto.
      // ⚠️ NOVO 21/08: quando é áudio, em vez de só passar o LINK pra
      // Meta baixar sozinha, a gente BAIXA o arquivo aqui e SOBE direto
      // pra ela (endpoint /media), usando o media_id que ela devolve.
      // Motivo: com link, a Meta precisa conseguir acessar a URL do
      // Storage por fora — se o bucket não estiver 100% público (ou a
      // Meta tiver qualquer problema pra baixar), ela aceita o pedido e
      // só falha DEPOIS, silenciosamente, na entrega. Subindo direto,
      // esse ponto de falha deixa de existir. Se a subida falhar por
      // qualquer motivo, cai de volta no método antigo (link) — nunca
      // fica pior do que era.
      let audioMediaId = null;
      if (req.body?.tipo === 'audio' && req.body?.media_url) {
        try {
          const mime = req.body?.media_mime || 'audio/mpeg';
          const arqResp = await fetch(req.body.media_url, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
          });
          if (arqResp.ok) {
            const bytes = Buffer.from(await arqResp.arrayBuffer());
            const form = new FormData();
            form.append('messaging_product', 'whatsapp');
            form.append('type', mime);
            form.append('file', new Blob([bytes], { type: mime }), mime === 'audio/mpeg' ? 'audio.mp3' : 'audio.webm');
            const upResp = await fetch(`https://graph.facebook.com/v21.0/${clinicaInfo.meta_phone_number_id}/media`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${clinicaInfo.meta_access_token}` },
              body: form,
            });
            const upData = await upResp.json().catch(() => null);
            if (upResp.ok && upData?.id) audioMediaId = upData.id;
            else console.error('[send-message] upload de áudio pra Meta falhou:', JSON.stringify(upData));
          } else {
            console.error('[send-message] não consegui baixar o áudio do Storage:', arqResp.status);
          }
        } catch (eUp) {
          console.error('[send-message] erro no upload de áudio:', eUp.message);
        }
      }

      const corpoMeta = (req.body?.tipo === 'audio' && req.body?.media_url)
        ? { messaging_product: 'whatsapp', to: number, type: 'audio', audio: audioMediaId ? { id: audioMediaId } : { link: req.body.media_url } }
        : { messaging_product: 'whatsapp', to: number, type: 'text', text: { body: message } };
      // ⚠️ NOVO 21/08: RESPONDER UMA MENSAGEM ESPECÍFICA — quando vem
      // reply_to (o message_id da mensagem citada), a Meta mostra a
      // mensagem original em cima da resposta, igualzinho ao WhatsApp
      // normal. Se o id for inválido/antigo a Meta recusa, então isso só
      // é adicionado quando realmente veio um reply_to.
      if (req.body?.reply_to) corpoMeta.context = { message_id: req.body.reply_to };
      resp = await fetch(`https://graph.facebook.com/v21.0/${clinicaInfo.meta_phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicaInfo.meta_access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpoMeta),
      });
      data = await resp.json();
      if (!resp.ok) return res.status(resp.status).json(data);
      messageId = data?.messages?.[0]?.id || null;
    } else {
      // ── EVOLUTION (como sempre) ──
      if (!instance) return res.status(400).json({ error: 'Campo obrigatório: instance (clínica não está em modo API Oficial)' });
      // ⚠️ NOVO 21/08: mesma coisa pro Evolution — lá o campo se chama
      // "quoted" e espera a chave da mensagem citada.
      const corpoEvo = { number, text: message };
      if (req.body?.reply_to) corpoEvo.quoted = { key: { id: req.body.reply_to } };
      resp = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
        method: 'POST',
        headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpoEvo),
      });
      data = await resp.json();
      if (!resp.ok) return res.status(resp.status).json(data);
      messageId = data?.key?.id || data?.message?.key?.id || data?.id
                 || data?.messageId || data?.response?.key?.id || null;
    }

    console.log('[SEND] message_id capturado:', messageId, '| instance:', instance, '| clinicId:', clinicId);

    if (SUPABASE_KEY && messageId) {
      try {
        // clinicId já foi resolvido mais acima (antes de decidir o caminho de
        // envio) — reaproveita aqui, sem duplicar a consulta.
        if (!clinicId && instance) {
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
