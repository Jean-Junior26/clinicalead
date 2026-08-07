// ============================================================
// CLINICALEAD — ENVIO DE MÍDIA PELO INBOX
// Envia imagem/vídeo/figurinha/documento, salva no bucket
// "midias" e registra a mensagem no Inbox. Agora decide sozinho
// entre Evolution (não-oficial) e API Oficial da Meta, olhando
// o tipo de conexão da clínica — mesmo padrão do send-message.js.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const EVO_URL = 'https://evolution-api-production-62cb.up.railway.app';
  const EVO_KEY = '185aff001ce6bb5b9cadec59294ead845c35217a1688d5d77f58a668d98ae000';

  const { instance, phone, clinic_id, base64, mimetype, fileName, caption } = req.body || {};
  if (!phone || !base64 || !mimetype) {
    return res.status(400).json({ error: 'Campos obrigatórios: phone, base64, mimetype' });
  }

  const cleanPhone = String(phone).replace(/\D/g, '');
  // ⚠️ AJUSTE 06/08: mesma correção já aplicada em outros arquivos há
  // dias — "começa com 55?" quebrava número estrangeiro (ex: Portugal
  // 351...) colando um 55 na frente por engano. Agora usa o TAMANHO.
  const number = cleanPhone.length >= 12 ? cleanPhone : '55' + cleanPhone;

  let tipo = 'document';
  if (mimetype === 'image/webp') tipo = 'sticker';
  else if (mimetype.startsWith('image/')) tipo = 'image';
  else if (mimetype.startsWith('video/')) tipo = 'video';

  try {
    // ⚠️ NOVO 06/08: resolve a clínica ANTES de decidir o caminho —
    // sem isso, mídia enviada de uma clínica em API Oficial (sem
    // "instance" nenhuma) nem tinha como funcionar.
    let clinicId = clinic_id || null;
    let clinicaInfo = null;
    const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    if (clinicId) {
      const cR = await fetch(`${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinicId}&select=id,tipo_conexao_whatsapp,meta_phone_number_id,meta_access_token`, { headers: sbHeaders });
      if (cR.ok) { const cs = await cR.json(); if (cs?.length) clinicaInfo = cs[0]; }
    } else if (instance) {
      const cR = await fetch(`${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${encodeURIComponent(instance)}&select=id,tipo_conexao_whatsapp,meta_phone_number_id,meta_access_token&limit=1`, { headers: sbHeaders });
      if (cR.ok) { const cs = await cR.json(); if (cs?.length) { clinicaInfo = cs[0]; clinicId = cs[0].id; } }
      if (!clinicId) {
        const iR = await fetch(`${SUPABASE_URL}/rest/v1/instancias?instance_name=eq.${encodeURIComponent(instance)}&select=clinic_id&limit=1`, { headers: sbHeaders });
        if (iR.ok) { const is = await iR.json(); if (is?.length) clinicId = is[0].clinic_id; }
      }
    }

    const ehOficial = clinicaInfo?.tipo_conexao_whatsapp === 'oficial' && clinicaInfo.meta_phone_number_id && clinicaInfo.meta_access_token;

    if (!ehOficial && !instance) {
      return res.status(400).json({ error: 'Campo obrigatório: instance (clínica não está em modo API Oficial)' });
    }

    // ── 1. Sobe pro Storage PRIMEIRO (precisa do link pra API Oficial;
    // pro Evolution, sobe também, só que depois de já ter enviado —
    // agora invertido pra funcionar nos dois casos, sem duplicar lógica) ──
    let media_url = null;
    const ext = (mimetype.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
    const fname = `${tipo}_${number}_${Date.now()}.${ext}`;
    const binary = Buffer.from(base64, 'base64');
    try {
      const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/midias/${fname}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': mimetype },
        body: binary,
      });
      if (upload.ok) media_url = `${SUPABASE_URL}/storage/v1/object/public/midias/${fname}`;
    } catch (e) { }

    // ── 2. Envia de verdade, pelo caminho certo ──────────────
    let messageId = null;
    if (ehOficial) {
      if (!media_url) return res.status(500).json({ error: 'Falha ao subir mídia pro Storage (necessário pra API Oficial)' });
      const tipoMeta = tipo === 'sticker' ? 'sticker' : (tipo === 'document' ? 'document' : tipo); // image | video | sticker | document
      const corpo = { messaging_product: 'whatsapp', to: number, type: tipoMeta };
      if (tipoMeta === 'document') corpo.document = { link: media_url, filename: fileName || 'documento', caption: caption || undefined };
      else corpo[tipoMeta] = { link: media_url, caption: tipoMeta === 'sticker' ? undefined : (caption || undefined) };
      const metaResp = await fetch(`https://graph.facebook.com/v21.0/${clinicaInfo.meta_phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicaInfo.meta_access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const metaData = await metaResp.json().catch(() => null);
      if (!metaResp.ok) return res.status(metaResp.status).json(metaData || { error: 'Falha no envio via API Oficial' });
      messageId = metaData?.messages?.[0]?.id || null;
    } else {
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
            number, mediatype: tipo, mimetype, media: base64,
            fileName: fileName || `arquivo.${mimetype.split('/')[1] || 'bin'}`,
            caption: caption || '',
          }),
        });
      }
      const evoData = await evoResp.json().catch(() => null);
      if (!evoResp.ok) return res.status(evoResp.status).json(evoData || { error: 'Falha no envio via Evolution' });
      messageId = evoData?.key?.id || null;
    }

    // ── 3. Registra no Inbox ──────────────────────────────────
    if (SUPABASE_KEY && clinicId) {
      try {
        const labels = { image: '📷 Imagem', video: '🎥 Vídeo', sticker: '🖼️ Sticker', document: fileName || '📄 Documento' };
        await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            clinic_id: clinicId, phone: number, contact_name: null,
            content: caption || labels[tipo], type: tipo, from_me: true, media_url,
            message_id: messageId, instance_name: instance || clinicaInfo?.meta_phone_number_id || null,
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
