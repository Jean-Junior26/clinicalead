// ============================================================
// CLINICALEAD — Simulação de sorriso/face MANUAL (página dedicada)
// Chamado pela página "Simulações" do CRM. Aceita foto por UPLOAD
// direto (base64) e MÚLTIPLOS tipos combinados numa única imagem
// (ex: clareamento + preenchimento labial ao mesmo tempo).
// Enviar pra um paciente é opcional (se vier phone+instance_name).
// ============================================================

const PROMPTS_SIMULACAO = {
  clareamento: "Whiten and brighten the teeth naturally, removing yellow/stains (not overly white or glowing)",
  alinhamento: "Straighten and align the teeth naturally, as if orthodontic treatment was completed — even spacing, natural positioning",
  lentes: "Apply a natural cosmetic veneer look to the teeth — even shape, bright natural white color, slightly refined edges, realistic enamel texture",
  protese: "Fill in the visible gaps from missing teeth with natural-looking replacement teeth that match the color, size and alignment of the surrounding teeth, creating a complete and natural smile",
  gengivoplastia: "Adjust the gum line to be more even and proportional, naturally reducing an excessive/uneven gum show ('gummy smile')",
  otomodelacao: "Naturally reshape the ears to sit closer to the head, correcting protruding ears (non-surgical ear harmonization result)",
  rinoplastia: "Naturally refine and reshape the nose to be more balanced and proportional to the face",
  harmonizacao_facial: "Apply subtle, natural facial harmonization — slightly more defined jawline and balanced facial proportions",
  preenchimento_labial: "Add natural, proportional fuller volume to the lips, subtle and balanced with the rest of the face",
};

const LABELS_SIMULACAO = {
  clareamento: 'Clareamento', alinhamento: 'Alinhamento', lentes: 'Lentes em resina',
  protese: 'Prótese/Implante', gengivoplastia: 'Gengivoplastia', otomodelacao: 'Otomodelação',
  rinoplastia: 'Rinoplastia', harmonizacao_facial: 'Harmonização facial', preenchimento_labial: 'Preenchimento labial',
};

// junta várias transformações numa instrução só e coerente, com UMA
// regra final de preservação (evita empilhar edições separadas)
function montarPromptCombinado(tipos) {
  const partes = tipos.map(t => PROMPTS_SIMULACAO[t]).filter(Boolean);
  if (!partes.length) return null;
  const transformacoes = partes.join('. Also, ');
  return `${transformacoes}. Apply all these changes together naturally and cohesively, as a single realistic photo. Keep the face, skin tone, expression, hair, background and lighting completely unchanged except for the specific changes described above.`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-62cb.up.railway.app';
  const EVO_KEY = process.env.EVOLUTION_API_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  if (!SUPABASE_KEY || !OPENAI_KEY) {
    return res.status(500).json({ ok: false, erro: 'Configuração ausente nas env vars da Vercel' });
  }

  const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

  // aceita: tipos (array, 1+), E foto_base64 (upload direto) OU foto_url (de uma conversa existente)
  const { clinic_id, tipos, foto_base64, foto_url, phone, instance_name } = req.body || {};
  if (!Array.isArray(tipos) || !tipos.length) {
    return res.status(400).json({ ok: false, erro: 'Selecione ao menos 1 tipo de simulação' });
  }
  const prompt = montarPromptCombinado(tipos);
  if (!prompt) return res.status(400).json({ ok: false, erro: 'Tipo(s) inválido(s)' });
  if (!foto_base64 && !foto_url) {
    return res.status(400).json({ ok: false, erro: 'Envie uma foto (upload ou de uma conversa)' });
  }

  try {
    // pega os bytes da foto — de upload direto ou baixando de uma URL existente
    let fotoBuffer;
    if (foto_base64) {
      const base64Limpo = foto_base64.replace(/^data:image\/\w+;base64,/, '');
      fotoBuffer = Buffer.from(base64Limpo, 'base64');
    } else {
      const fotoFetch = await fetch(foto_url);
      if (!fotoFetch.ok) return res.status(500).json({ ok: false, erro: 'Falha ao baixar a foto original' });
      fotoBuffer = Buffer.from(await fotoFetch.arrayBuffer());
    }
    const fotoBlob = new Blob([fotoBuffer], { type: 'image/jpeg' });

    // gera a simulação (combinada, se mais de 1 tipo)
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('image[]', fotoBlob, 'foto.jpg');
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    form.append('quality', 'low');

    const editResp = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form,
    });
    if (!editResp.ok) return res.status(500).json({ ok: false, erro: `Falha na API de imagem: ${editResp.status}` });
    const editData = await editResp.json();
    const imgBase64 = editData?.data?.[0]?.b64_json;
    if (!imgBase64) return res.status(500).json({ ok: false, erro: 'API não retornou imagem' });

    // upload no storage (sempre, pra poder mostrar/reenviar depois)
    const tiposStr = tipos.join('-');
    const nomeArquivo = `sim_${tiposStr}_${Date.now()}.png`;
    const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/midias/${nomeArquivo}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'image/png' },
      body: Buffer.from(imgBase64, 'base64'),
    });
    if (!upload.ok) return res.status(500).json({ ok: false, erro: 'Falha ao salvar imagem gerada' });
    const mediaUrl = `${SUPABASE_URL}/storage/v1/object/public/midias/${nomeArquivo}`;

    const nomesLegiveis = tipos.map(t => LABELS_SIMULACAO[t] || t).join(' + ');
    const legenda = `✨ Simulação: *${nomesLegiveis}*\n\nIsso é só uma *simulação ilustrativa* pra você ter uma ideia — o resultado real é sempre definido na sua avaliação com a dentista, viu? 💙`;

    // enviar pro paciente é OPCIONAL — só se vieram phone + instance_name
    let enviado = false;
    if (phone && instance_name && EVO_KEY) {
      const cleanPhone = String(phone).replace(/\D/g, '');
      const number = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;
      await fetch(`${EVO_URL}/message/sendMedia/${instance_name}`, {
        method: 'POST',
        headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, mediatype: 'image', media: mediaUrl, caption: legenda }),
      });
      if (clinic_id) {
        await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
          method: 'POST',
          headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({
            clinic_id, phone: number, contact_name: 'EQUIPE',
            content: legenda, type: 'image', from_me: true, media_url: mediaUrl,
            created_at: new Date().toISOString(),
          }),
        });
      }
      enviado = true;
    }

    return res.status(200).json({ ok: true, media_url: mediaUrl, legenda, enviado });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: e.message });
  }
};
