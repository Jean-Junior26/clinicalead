// ============================================================
// CLINICALEAD — Simulação de sorriso/face MANUAL (disparada pela equipe)
// Endpoint chamado pelo botão no painel do CRM — mesma lógica de
// geração que o Brian usa automaticamente, só que acionada por um
// clique da equipe, escolhendo o tipo na hora.
// ============================================================

const PROMPTS_SIMULACAO = {
  clareamento: "Whiten and brighten only the teeth in this photo, removing yellow/stains, natural and realistic result (not overly white or glowing). Keep the face, lips, gums, skin tone, expression and lighting completely unchanged.",
  alinhamento: "Straighten and align the teeth in this photo naturally, as if orthodontic treatment was completed — even spacing, natural positioning. Keep the face, lips, gums, skin tone, expression and lighting completely unchanged.",
  lentes: "Apply a natural cosmetic veneer look to the teeth in this photo — even shape, bright natural white color, slightly refined edges, realistic enamel texture. Keep the face, lips, gums, skin tone, expression and lighting completely unchanged.",
  protese: "Fill in the visible gaps from missing teeth in this photo with natural-looking replacement teeth that match the color, size and alignment of the surrounding teeth, creating a complete and natural smile. Keep the face, lips, gums, skin tone, expression and lighting completely unchanged.",
  gengivoplastia: "Adjust the gum line in this photo to be more even and proportional, naturally reducing an excessive/uneven gum show ('gummy smile'). Keep the face, lips, teeth color, skin tone, expression and lighting completely unchanged except for the gum line shape.",
  otomodelacao: "Naturally reshape the ears in this photo to sit closer to the head, correcting protruding ears (non-surgical ear harmonization result). Keep the face, hair, skin tone, expression and lighting completely unchanged except for the ear shape and position.",
  rinoplastia: "Naturally refine and reshape the nose in this photo to be more balanced and proportional to the face. Keep the eyes, lips, mouth, skin tone, expression and lighting completely unchanged except for the nose shape.",
  harmonizacao_facial: "Apply subtle, natural facial harmonization to this photo — slightly more defined jawline and balanced facial proportions. Keep skin tone, expression, hair, eyes and lighting natural and unchanged except for the subtle facial contour.",
  preenchimento_labial: "Add natural, proportional fuller volume to the lips in this photo, subtle and balanced with the rest of the face. Keep the face, teeth, skin tone, expression and lighting completely unchanged except for the lip volume.",
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-62cb.up.railway.app';
  const EVO_KEY = process.env.EVOLUTION_API_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  if (!SUPABASE_KEY || !EVO_KEY || !OPENAI_KEY) {
    return res.status(500).json({ ok: false, erro: 'Configuração ausente nas env vars da Vercel' });
  }

  const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

  const { clinic_id, phone, tipo, instance_name } = req.body || {};
  if (!clinic_id || !phone || !tipo || !instance_name) {
    return res.status(400).json({ ok: false, erro: 'Faltam parâmetros: clinic_id, phone, tipo, instance_name' });
  }
  const prompt = PROMPTS_SIMULACAO[tipo];
  if (!prompt) return res.status(400).json({ ok: false, erro: `Tipo inválido: ${tipo}` });

  try {
    // busca a última FOTO que o paciente mandou nesta conversa
    const sufixo = String(phone).replace(/\D/g, '').slice(-8);
    const fotoResp = await fetch(
      `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&from_me=eq.false&type=eq.image&select=media_url&order=created_at.desc&limit=1`,
      { headers: sbHeaders }
    );
    const fotoArr = fotoResp.ok ? await fotoResp.json() : [];
    const fotoUrl = fotoArr[0]?.media_url;
    if (!fotoUrl) return res.status(404).json({ ok: false, erro: 'Nenhuma foto recente encontrada nesta conversa' });

    // gera a simulação
    const fotoFetch = await fetch(fotoUrl);
    if (!fotoFetch.ok) return res.status(500).json({ ok: false, erro: 'Falha ao baixar a foto original' });
    const fotoBuffer = await fotoFetch.arrayBuffer();
    const fotoBlob = new Blob([fotoBuffer], { type: 'image/jpeg' });

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

    // upload no storage
    const cleanPhone = String(phone).replace(/\D/g, '');
    const number = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;
    const nomeArquivo = `sim_manual_${tipo}_${number}_${Date.now()}.png`;
    const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/midias/${nomeArquivo}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'image/png' },
      body: Buffer.from(imgBase64, 'base64'),
    });
    if (!upload.ok) return res.status(500).json({ ok: false, erro: 'Falha ao salvar imagem gerada' });
    const mediaUrl = `${SUPABASE_URL}/storage/v1/object/public/midias/${nomeArquivo}`;

    // envia com a legenda de aviso SEMPRE garantida
    const legenda = '✨ Isso é só uma *simulação ilustrativa* pra você ter uma ideia — o resultado real é sempre definido na sua avaliação com a dentista, viu? 💙';
    await fetch(`${EVO_URL}/message/sendMedia/${instance_name}`, {
      method: 'POST',
      headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, mediatype: 'image', media: mediaUrl, caption: legenda }),
    });

    // loga no histórico
    await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        clinic_id, phone: number, contact_name: 'EQUIPE',
        content: legenda, type: 'image', from_me: true, media_url: mediaUrl,
        created_at: new Date().toISOString(),
      }),
    });

    return res.status(200).json({ ok: true, media_url: mediaUrl });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: e.message });
  }
};
