export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(200).json([]);

  const SUPABASE_URL = 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_G6xEiLO4lcNaJafm9RA2tA_QLf4E2FV';

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/mensagens?select=*&order=created_at.desc&limit=200`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    });
    const data = await r.json();
    return res.status(200).json(data || []);
  } catch(e) {
    return res.status(200).json([]);
  }
}
