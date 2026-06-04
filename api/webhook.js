export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  const SUPABASE_URL = 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_G6xEiLO4lcNaJafm9RA2tA_QLf4E2FV';

  try {
    const body = req.body;

    if (body?.event !== 'messages.upsert') {
      return res.status(200).json({ ok: true });
    }

    const messages = body?.data || [];
    const list = Array.isArray(messages) ? messages : [messages];

    for (const msg of list) {
      const key = msg?.key || {};
      const phone = (key?.remoteJid || '').replace('@s.whatsapp.net', '').replace('@g.us', '');
      const fromMe = key?.fromMe || false;
      const content =
        msg?.message?.conversation ||
        msg?.message?.extendedTextMessage?.text ||
        msg?.message?.imageMessage?.caption ||
        '[mídia]';

      if (phone && content && !phone.includes('status')) {
        await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            phone,
            content,
            type: 'text',
            from_me: fromMe,
            created_at: new Date().toISOString()
          })
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(200).json({ ok: true });
  }
}
</html>
