export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const SUPABASE_URL = 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_G6xEiLO4lcNaJafm9RA2tA_QLf4E2FV';
  
  const phone = req.query.phone || '';
  const clinic_id = req.query.clinic_id || '';

  try {
    let url = `${SUPABASE_URL}/rest/v1/mensagens?order=criado_em.desc&limit=500`;
    
    if (phone) url += `&telefone=eq.${phone}`;
    if (clinic_id) url += `&clinic_id=eq.${clinic_id}`;

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
