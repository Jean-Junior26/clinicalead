export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_KEY) {
    console.error('[webhook] SUPABASE_SERVICE_KEY não configurada');
    return res.status(500).json({ error: 'Configuração ausente' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {
      return res.status(400).json({ error: 'Body inválido' });
    }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Body vazio' });
  }

  // Faz download de mídia e salva no Supabase Storage
  async function salvarMidia(url, tipo, phone) {
    if (!url) return null;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const buffer = await resp.arrayBuffer();
      const ext = tipo === 'audio' ? 'ogg' : tipo === 'image' ? 'jpg' : tipo === 'video' ? 'mp4' : 'bin';
      const fileName = `${tipo}_${phone}_${Date.now()}.${ext}`;
      const bucket = tipo === 'audio' ? 'audios' : 'midias';
      const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${fileName}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': resp.headers.get('content-type') || 'application/octet-stream',
        },
        body: buffer,
      });
      if (!uploadResp.ok) return url; // fallback para URL original
      return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${fileName}`;
    } catch (e) {
      console.error('[webhook] Erro ao salvar mídia:', e.message);
      return url; // fallback para URL original
    }
  }

  try {
    const rawEvento = body?.event || body?.type || '';
    const evento = rawEvento.toLowerCase().replace('.', '_');

    if (evento !== 'messages_upsert') {
      console.log('[webhook] Evento ignorado:', rawEvento);
      return res.status(200).json({ ok: true, ignorado: rawEvento });
    }

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
    const list = Array.isArray
