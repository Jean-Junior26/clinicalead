// ============================================================
// CLINICALEAD — Endpoint de TESTE da API Oficial (Meta)
// ⚠️ 01/08: usado só pra validar que as credenciais salvas (token,
// phone_number_id) realmente funcionam, mandando 1 mensagem de teste
// de verdade. O token NUNCA precisa ser digitado de novo em lugar
// nenhum — esse endpoint busca ele direto do banco, com a chave de
// serviço do próprio servidor.
//
// Como usar: chama essa URL com POST, passando { "clinic_id": "...",
// "telefone_teste": "55SEUNUMERO" } — ou simplesmente abre no
// navegador com os parâmetros na query string (GET também funciona,
// só pra facilitar teste rápido).
// ============================================================

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  const clinicId = req.method === 'POST' ? req.body?.clinic_id : req.query?.clinic_id;
  const telefoneTeste = req.method === 'POST' ? req.body?.telefone_teste : req.query?.telefone_teste;

  if (!clinicId || !telefoneTeste) {
    return res.status(400).json({ error: 'Faltou clinic_id ou telefone_teste (ex: ?clinic_id=XXX&telefone_teste=5534999999999)' });
  }

  try {
    // busca as credenciais direto do banco — o token nunca passa por
    // fora do servidor, nem aparece em log nenhum.
    const clinicaResp = await fetch(
      `${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinicId}&select=nome,tipo_conexao_whatsapp,meta_phone_number_id,meta_access_token`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const clinicaArr = await clinicaResp.json();
    const clinica = clinicaArr[0];

    if (!clinica) return res.status(404).json({ error: 'Clínica não encontrada' });
    if (clinica.tipo_conexao_whatsapp !== 'oficial') {
      return res.status(400).json({ error: `Essa clínica está marcada como '${clinica.tipo_conexao_whatsapp}', não 'oficial'.` });
    }
    if (!clinica.meta_phone_number_id || !clinica.meta_access_token) {
      return res.status(400).json({ error: 'Faltam credenciais salvas (phone_number_id ou token).' });
    }

    // envia a mensagem de teste via Graph API da Meta
    const numeroDestino = telefoneTeste.replace(/\D/g, '');
    const metaResp = await fetch(
      `https://graph.facebook.com/v21.0/${clinica.meta_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clinica.meta_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: numeroDestino,
          type: 'text',
          text: { body: `✅ Teste da API Oficial funcionando! Essa mensagem saiu da clínica "${clinica.nome}" via ClinicaLead CRM.` },
        }),
      }
    );
    const metaData = await metaResp.json();

    if (!metaResp.ok) {
      return res.status(400).json({ ok: false, erro: 'A Meta recusou o envio', detalhe: metaData });
    }

    return res.status(200).json({ ok: true, mensagem: 'Enviado com sucesso!', message_id: metaData?.messages?.[0]?.id, raw: metaData });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: 'Erro interno', message: e.message });
  }
}
