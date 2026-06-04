export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const EVO_URL = 'https://evolution-api-production-b649.up.railway.app';
  const EVO_KEY = '185aff001ce6bb5b9cadec59294ead845c35217a1688d5d77f58a668d98ae000';
  const WEBHOOK_URL = 'https://clinicalead.vercel.app/api/webhook';

  const { instance } = req.body;
  if (!instance) return res.status(400).json({ error: 'instance obrigatório' });

  try {
    const resp = await fetch(`${EVO_URL}/webhook/set/${instance}`, {
      method: 'POST',
      headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        webhook_by_events: false,
        webhook_base64: false,
        events: ['MESSAGES_UPSERT'],
      }),
    });
    const data = await resp.json();
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
