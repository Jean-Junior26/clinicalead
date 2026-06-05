export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });
  const SUPABASE_URL = 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = 'sb_secret_LyMbc41HZWqYB--Xz8MsWA_M8gC_xSD';
  try {
    const body = req.body;
    const evento = (body?.event || body?.type || '').toLowerCase().replace('.', '_');
    if (evento !== 'messages_upsert') {
      return res.status(200).json({ ok: true, ignorado: body?.event });
    }
    const instanceName = body?.instance || body?.instanceName || null;
    let clinic_id = null;
    if (instanceName) {
      const clinicResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${instanceName}&select=id`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      const clinics = await clinicResp.json();
      if (clinics?.length > 0) clinic_id = clinics[0].id;
    }
    const messages = body?.data || [];
    const list = Array.isArray(messages) ? messages : [messages];
    for (const msg of list) {
      const key = msg?.key || {};
      const jid = key?.remoteJid || '';
      const fromMe = key?.fromMe || false;
      if (!jid || jid.includes('status@broadcast') || jid.includes('@g.us')) continue;
      const phone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      const contact_name = fromMe ? null : (msg?.pushName || null);
      let content = '';
      let type = 'text';
      let media_url = null;
      const m = msg?.message || {};
      if (m.conversation) {
        content = m.conversation;
      } else if (m.extendedTextMessage) {
        content = m.extendedTextMessage.text || '';
      } else if (m.imageMessage) {
        content = m.imageMessage.caption || '📷 Imagem';
        type = 'image';
        media_url = m.imageMessage.url || null;
      } else if (m.audioMessage) {
