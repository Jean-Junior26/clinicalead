// ============================================================
// CLINICALEAD — Envio de mensagens via API OFICIAL do WhatsApp (Meta)
// ⚠️ 30/07: peça NOVA, isolada — ainda não conectada em nenhum fluxo
// existente. Construída pra "plugar" no webhook.js e no
// disparar-automacoes.ts assim que tivermos as credenciais reais do
// Hugo (segunda-feira). Não afeta NADA do que já funciona hoje via
// Evolution API — é código adicional, não substituição.
//
// Como funciona a API Oficial (Graph API da Meta), resumo rápido:
// - Cada clínica tem seu próprio phone_number_id + access_token
//   (gravados na tabela `clinicas`, colunas meta_*)
// - Toda chamada é HTTPS POST pra
//   https://graph.facebook.com/v21.0/{phone_number_id}/messages
// - Mensagem de RESPOSTA (dentro da janela de 24h) pode ser texto
//   livre. Mensagem que a CLÍNICA inicia (lembrete, confirmação,
//   follow-up) fora da janela de 24h PRECISA ser um template já
//   aprovado pela Meta — não é texto livre.
// ============================================================

const META_API_VERSION = "v21.0";
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Envia texto livre via API Oficial — usar SÓ dentro da janela de 24h
 * (respondendo alguém que já mandou mensagem recentemente). Fora
 * dessa janela, a Meta rejeita e é preciso usar um template
 * (enviarWhatsAppOficialTemplate, abaixo).
 */
async function enviarWhatsAppOficial(phoneNumberId, accessToken, telefoneDestino, texto) {
  const numero = telefoneDestino.replace(/\D/g, "");
  const resp = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: numero,
      type: "text",
      text: { body: texto },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`[Meta API] Falha ao enviar: ${JSON.stringify(data)}`);
  }
  // formato de retorno da Meta: { messages: [{ id: "wamid.XXXX" }] }
  const messageId = data?.messages?.[0]?.id || null;
  return { ok: true, messageId, raw: data };
}

/**
 * Envia imagem/vídeo com legenda via API Oficial (dentro da janela
 * de 24h — mesma regra do texto livre acima).
 */
async function enviarWhatsAppOficialMidia(phoneNumberId, accessToken, telefoneDestino, mediaUrl, mediaTipo, legenda) {
  const numero = telefoneDestino.replace(/\D/g, "");
  const tipoMeta = mediaTipo === "video" ? "video" : "image";
  const corpo = {
    messaging_product: "whatsapp",
    to: numero,
    type: tipoMeta,
    [tipoMeta]: { link: mediaUrl, caption: legenda || "" },
  };
  const resp = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`[Meta API] Falha ao enviar mídia: ${JSON.stringify(data)}`);
  }
  const messageId = data?.messages?.[0]?.id || null;
  return { ok: true, messageId, raw: data };
}

/**
 * Envia mensagem por TEMPLATE aprovado — obrigatório pra iniciar
 * conversa fora da janela de 24h (lembrete, confirmação, follow-up).
 * `nomeTemplate` precisa bater exatamente com o nome aprovado no
 * painel da Meta. `parametros` é a lista de valores que preenchem as
 * variáveis do template, na ordem que foram configuradas lá
 * (ex: nome do paciente, data, hora).
 */
async function enviarWhatsAppOficialTemplate(phoneNumberId, accessToken, telefoneDestino, nomeTemplate, idiomaTemplate, parametros) {
  const numero = telefoneDestino.replace(/\D/g, "");
  const resp = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: numero,
      type: "template",
      template: {
        name: nomeTemplate,
        language: { code: idiomaTemplate || "pt_BR" },
        components: parametros && parametros.length
          ? [{ type: "body", parameters: parametros.map(p => ({ type: "text", text: String(p) })) }]
          : [],
      },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`[Meta API] Falha ao enviar template: ${JSON.stringify(data)}`);
  }
  const messageId = data?.messages?.[0]?.id || null;
  return { ok: true, messageId, raw: data };
}

/**
 * ⚠️ FUNÇÃO PONTE — decide sozinha se manda pelo Evolution (como já
 * funciona hoje) ou pela API Oficial, olhando o campo
 * `clinic.tipo_conexao_whatsapp`. Isso é o que permite o resto do
 * sistema (webhook.js, disparar-automacoes.ts) chamar UMA função só,
 * sem precisar saber qual dos dois caminhos aquela clínica usa.
 * ⚠️ Ainda NÃO está conectada em nenhum lugar do sistema real — só
 * pronta pra ser importada/usada quando ligarmos tudo junto.
 */
async function enviarWhatsAppInteligente(clinic, telefoneDestino, texto, opts = {}) {
  if (clinic.tipo_conexao_whatsapp === "oficial") {
    if (!clinic.meta_phone_number_id || !clinic.meta_access_token) {
      throw new Error(`Clínica ${clinic.nome} está marcada como API Oficial mas não tem credenciais configuradas (meta_phone_number_id / meta_access_token).`);
    }
    if (opts.mediaUrl) {
      return enviarWhatsAppOficialMidia(clinic.meta_phone_number_id, clinic.meta_access_token, telefoneDestino, opts.mediaUrl, opts.mediaTipo, texto);
    }
    if (opts.template) {
      return enviarWhatsAppOficialTemplate(clinic.meta_phone_number_id, clinic.meta_access_token, telefoneDestino, opts.template, opts.templateIdioma, opts.templateParams);
    }
    return enviarWhatsAppOficial(clinic.meta_phone_number_id, clinic.meta_access_token, telefoneDestino, texto);
  }
  // fallback: continua usando Evolution API, exatamente como hoje.
  // (a implementação real dessa chamada já existe em webhook.js /
  // disparar-automacoes.ts — aqui é só a "decisão de rota")
  return { usarEvolutionExistente: true };
}

module.exports = {
  enviarWhatsAppOficial,
  enviarWhatsAppOficialMidia,
  enviarWhatsAppOficialTemplate,
  enviarWhatsAppInteligente,
};
