export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const MP_TOKEN = 'TEST-7839675538724549-060416-8256bbabfed334fce2b267ac5d425236-299839061';
  const SUPABASE_URL = 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_G6xEiLO4lcNaJafm9RA2tA_QLf4E2FV';
  const APP_URL = 'https://clinicalead.vercel.app';

  const { plano, periodo, clinic_id, user_id, email } = req.body;

  const precos = {
    solo:    { mensal: 11990, semestral: 65940, anual: 107880 },
    clinica: { mensal: 16990, semestral: 83940, anual: 119880 },
    rede:    { mensal: 29990, semestral: 161940, anual: 239880 },
  };

  const nomes = {
    solo: 'Plano Solo', clinica: 'Plano Clínica', rede: 'Plano Rede'
  };

  const valor = precos[plano][periodo];

  try {
    // Cria preferência de pagamento no Mercado Pago
    const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{
          title: `${nomes[plano]} - ${periodo} - ClinicaLead`,
          quantity: 1,
          unit_price: valor / 100,
          currency_id: 'BRL',
        }],
        payer: { email },
        back_urls: {
          success: `${APP_URL}?payment=success&plano=${plano}&periodo=${periodo}&clinic_id=${clinic_id}`,
          failure: `${APP_URL}?payment=failure`,
          pending: `${APP_URL}?payment=pending`,
        },
        auto_return: 'approved',
        external_reference: `${clinic_id}|${user_id}|${plano}|${periodo}`,
      }),
    });

    const mpData = await mpResp.json();
    if (!mpData.init_point) return res.status(500).json({ error: 'Erro ao criar preferência', mpData });

    return res.status(200).json({ url: mpData.init_point });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
