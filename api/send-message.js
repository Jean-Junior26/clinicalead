export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const EVO_URL = 'https://evolution-api-production-62cb.up.railway.app';
  const EVO_KEY = '185aff001ce6bb5b9cadec59294ead845c35217a1688d5d77f58a668d98ae000';
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  const { instance, phone, message, clinic_id } = req.body;
  if (!instance || !phone || !message) return res.status(400).json({ error: 'Campos obrigatórios: instance, phone, message' });
  const cleanPhone = phone.replace(/\D/g, '');
  const number = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;

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
