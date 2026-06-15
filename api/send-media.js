// ============================================================
// CLINICALEAD — ENVIO DE MÍDIA PELO INBOX
// Proxy para o Evolution (evita CORS), envia imagem/vídeo/
// figurinha/documento, salva no bucket "midias" e registra
// a mensagem no Inbox.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const EVO_URL = 'https://evolution-api-production-62cb.up.railway.app';
  const EVO_KEY = '185aff001ce6bb5b9cadec59294ead845c35217a1688d5d77f58a668d98ae000';

  const { instance, phone, clinic_id, base64, mimetype, fileName, caption } = req.body || {};
  if (!instance || !phone || !base64 || !mimetype) {
    return res.status(400).json({ error: 'Campos obrigatórios: instance, phone, base64, mimetype' });
  }

  const cleanPhone = String(phone).replace(/\D/g, '');
  const number = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;

  // Detecta o tipo a partir do mimetype
  let tipo = 'document';
  if (mimetype === 'image/webp') tipo = 'sticker';
  else if (mimetype.startsWith('image/')) tipo = 'image';
  else if (mimetype.startsWith('video/')) tipo = 'video';

  try {
    // ── 1. Envia via Evolution ───────────────────────────────
    let evoResp;
    if (tipo === 'sticker') {
      evoResp = await fetch(`${EVO_URL}/message/sendSticker/${instance}`, {
        method: 'POST',
        headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, sticker: base64 }),
      });
    } else {
      evoResp = await fetch(`${EVO_URL}/message/sendMedia/${instance}`, {
        method: 'POST',
        headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number,
          mediatype: tipo,
          mimetype,
          media: base64,
          fileName: fileName || `arquivo.${mimetype.split('/')[1] || 'bin'}`,
          caption: caption || '',
        }),
      });
    }

    const evoData = await evoResp.json().catch(() => null);
    if (!evoResp.ok) {
      return res.status(evoResp.status).json(evoData || { error: 'Falha no envio via Evolution' });
    }

    // ── 2. Salva no bucket + registra no Inbox ───────────────
    let media_url = null;
    if (SUPABASE_KEY) {
      try {
        const ext = (mimetype.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
        const fname = `${tipo}_${number}_${Date.now()}.${ext}`;
        const binary = Buffer.from(base64, 'base64');

        const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/midias/${fname}`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': mimetype,
          },
          body: binary,
        });
        if (upload.ok) {
          media_url = `${SUPABASE_URL}/storage/v1/object/public/midias/${fname}`;
        }

        // Resolve clinic_id: principal (clinicas) ou número extra (instancias)
        let clinicId = clinic_id || null;
        if (!clinicId) {
          const cR = await fetch(`${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${encodeURIComponent(instance)}&select=id&limit=1`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
          if (cR.ok) { const cs = await cR.json(); if (cs?.length) clinicId = cs[0].id; }
          if (!clinicId) {
            const iR = await fetch(`${SUPABASE_URL}/rest/v1/instancias?instance_name=eq.${encodeURIComponent(instance)}&select=clinic_id&limit=1`,
              { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
            if (iR.ok) { const is = await iR.json(); if (is?.length) clinicId = is[0].clinic_id; }
          }
        }

        const labels = { image: '📷 Imagem', video: '🎥 Vídeo', sticker: '🖼️ Sticker', document: fileName || '📄 Documento' };
        await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            clinic_id: clinicId,
            phone: number,
            contact_name: null,
            content: caption || labels[tipo],
            type: tipo,
            from_me: true,
            media_url,
            message_id: evoData?.key?.id || null,
            instance_name: instance,
            created_at: new Date().toISOString(),
          }),
        });
      } catch (e) {
        console.error('[send-media] Falha ao salvar no Inbox:', e.message);
      }
    }

    return res.status(200).json({ ok: true, tipo, media_url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
