export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const MP_TOKEN = 'TEST-7839675538724549-060416-8256bbabfed334fce2b267ac5d425236-299839061';
  const SUPABASE_URL = 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_G6xEiLO4lcNaJafm9RA2tA_QLf4E2FV';

  try {
    const { type, data } = req.body;
    if (type !== 'payment') return res.status(200).json({ ok: true });

    const paymentResp = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { 'Authorization': `Bearer ${MP_TOKEN}` },
    });
    const payment = await paymentResp.json();

    if (payment.status !== 'approved') return res.status(200).json({ ok: true });

    const [clinic_id, user_id, plano, periodo] = payment.external_reference.split('|');

    const meses = { mensal: 1, semestral: 6, anual: 12 };
    const agora = new Date();
    const fim = new Date(agora);
    fim.setMonth(fim.getMonth() + meses[periodo]);

    // Verifica se já tem assinatura
    const existeResp = await fetch(
      `${SUPABASE_URL}/rest/v1/assinaturas?clinic_id=eq.${clinic_id}`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const existe = await existeResp.json();

    if (existe?.length > 0) {
      // Atualiza
      await fetch(`${SUPABASE_URL}/rest/v1/assinaturas?clinic_id=eq.${clinic_id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          plano, periodo, status: 'ativo',
          periodo_inicio: agora.toISOString(),
          periodo_fim: fim.toISOString(),
          mp_payer_email: payment.payer?.email,
        }),
      });
    } else {
      // Insere
      await fetch(`${SUPABASE_URL}/rest/v1/assinaturas`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          clinic_id, user_id, plano, periodo, status: 'ativo',
          periodo_inicio: agora.toISOString(),
          periodo_fim: fim.toISOString(),
          mp_payer_email: payment.payer?.email,
        }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[mp-webhook]', err);
    return res.status(200).json({ ok: true });
  }
}
