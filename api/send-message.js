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

    // ── Registra no Inbox (toda mensagem enviada aparece no histórico) ──
    // Usa o message_id retornado pelo Evolution + índice único da tabela
    // para evitar duplicatas (se o webhook também registrar o eco).
    if (SUPABASE_KEY) {
      try {
        // Resolve o clinic_id pela instância, se não veio no corpo
        let clinicId = clinic_id || null;
        if (!clinicId) {
          const cResp = await fetch(
            `${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${encodeURIComponent(instance)}&select=id&limit=1`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
          );
          if (cResp.ok) { const cs = await cResp.json(); if (cs?.length) clinicId = cs[0].id; }
        }

        const messageId = data?.key?.id || null;

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
            read_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          }),
        });
      } catch (e) {
        // Não falha o envio se o registro no inbox der erro
      }
    }

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
