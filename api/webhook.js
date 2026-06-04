import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://zcwntpkiispbhjjgidih.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G6xEiLO4lcNaJafm9RA2tA_QLf4E2FV';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  const body = req.body;
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const event = body?.event || body?.type || '';
    const data = body?.data || body;

    if (event === 'messages.upsert' || data?.key) {
      const msg = data?.message || data;
      const key = data?.key || {};
      const phone = key?.remoteJid?.replace('@s.whatsapp.net', '') || '';
      const fromMe = key?.fromMe || false;
      const content =
        msg?.conversation ||
        msg?.extendedTextMessage?.text ||
        msg?.imageMessage?.caption ||
        '[mídia]';
      const instance = body?.instance || '';

      if (phone && !fromMe) {
        await supabase.from('mensagens').insert({
          telefone: phone,
          mensagem: content,
          instancia: instance,
          direcao: 'recebida',
          lida: false,
          criado_em: new Date().toISOString(),
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ok: true });
  }
}
