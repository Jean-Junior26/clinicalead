export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  const SUPABASE_URL = 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_G6xEiLO4lcNaJafm9RA2tA_QLf4E2FV';

  try {
    const body = req.body;
    const data = body?.data || body;
    const key = data?.key || {};
    const msg = data?.message || {};

    const phone = (key?.remoteJid || '').replace('@s.whatsapp.net', '');
    const fromMe = key?.fromMe || false;
    const content =
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption ||
      '[mídia]';

    if (phone && !fromMe && content) {
      await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          phone: phone,
          content: content,
          type: 'text',
          from_me: false,
          created_at: new Date().toISOString()
        })
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ok: true });
  }
}
  }
}

