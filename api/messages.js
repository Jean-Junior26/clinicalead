export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const SUPABASE_URL = 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_G6xEiLO4lcNaJafm9RA2tA_QLf4E2FV';
  const phone = req.query.phone || '';

  try {
    const url = phone
      ? `${SUPABASE_URL}/rest/v1/mensagens?phone=eq.${phone}&order=created_at.asc&limit=100`
      : `${SUPABASE_URL}/rest/v1/mensagens?order=created_at.desc&limit=200`;

    const r = await fetch(url, {
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
