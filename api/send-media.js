// ============================================================
// CLINICALEAD — ENVIO DE MÍDIA PELO INBOX
// Envia imagem/vídeo/figurinha/documento, salva no bucket
// "midias" e registra a mensagem no Inbox. Agora decide sozinho
// entre Evolution (não-oficial) e API Oficial da Meta, olhando
// o tipo de conexão da clínica — mesmo padrão do send-message.js.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // ════════════════════════════════════════════════════════════
  // 🔒 NOVO 10/11/2026 — PORTARIA DE SEGURANÇA
  // Antes, qualquer pessoa na internet podia chamar esta rota e mandar
  // mensagem pelo WhatsApp de qualquer clínica (bastava saber o id).
  // Agora só passa quem está LOGADO no CRM e tem acesso àquela clínica
  // (dono, colaborador ou admin geral). Chamada interna de servidor
  // (Edge Function) passa usando a SERVICE KEY no Authorization.
  // O index.html anexa o login automaticamente em toda chamada /api/.
  // ════════════════════════════════════════════════════════════
  const __SB_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const __SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const __ADMIN_EMAIL = 'jeanjunior.digital@gmail.com';
  async function __portaria(clinicIdPedido, instancePedida, soUsuario) {
    const auth = String(req.headers?.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) return { ok: false, status: 401, erro: 'Faça login no CRM de novo (sessão ausente)' };
    if (__SB_KEY && token === __SB_KEY) return { ok: true, interno: true, user: null };
    const sbH = { apikey: __SB_KEY, Authorization: `Bearer ${__SB_KEY}` };
    const uResp = await fetch(`${__SB_URL}/auth/v1/user`, { headers: { apikey: __SB_KEY, Authorization: `Bearer ${token}` } });
    if (!uResp.ok) return { ok: false, status: 401, erro: 'Sessão expirada — saia e entre de novo no CRM' };
    const user = await uResp.json();
    if (!user?.id) return { ok: false, status: 401, erro: 'Sessão inválida' };
    const ehAdmin = String(user.email || '').toLowerCase() === __ADMIN_EMAIL;
    if (soUsuario) return { ok: true, user, ehAdmin };
    let clinicId = clinicIdPedido || null;
    if (!clinicId && instancePedida) {
      const inst = encodeURIComponent(instancePedida);
      const a = await fetch(`${__SB_URL}/rest/v1/clinicas?whatsapp_instance=eq.${inst}&select=id&limit=1`, { headers: sbH });
      const aa = a.ok ? await a.json() : [];
      clinicId = aa[0]?.id || null;
      if (!clinicId) {
        const b = await fetch(`${__SB_URL}/rest/v1/instancias?instance_name=eq.${inst}&select=clinic_id&limit=1`, { headers: sbH });
        const bb = b.ok ? await b.json() : [];
        clinicId = bb[0]?.clinic_id || null;
      }
    }
    if (ehAdmin) return { ok: true, user, ehAdmin, clinicId };
    if (!clinicId) return { ok: false, status: 403, erro: 'Clínica não identificada para este pedido' };
    const cid = encodeURIComponent(clinicId);
    const dono = await fetch(`${__SB_URL}/rest/v1/clinicas?id=eq.${cid}&user_id=eq.${user.id}&select=id&limit=1`, { headers: sbH });
    if (dono.ok && (await dono.json()).length) return { ok: true, user, ehAdmin, clinicId };
    const colab = await fetch(`${__SB_URL}/rest/v1/clinic_users?clinic_id=eq.${cid}&user_id=eq.${user.id}&select=id&limit=1`, { headers: sbH });
    if (colab.ok && (await colab.json()).length) return { ok: true, user, ehAdmin, clinicId };
    return { ok: false, status: 403, erro: 'Sem permissão para esta clínica' };
  }
  const __acesso = await __portaria(req.body?.clinic_id, req.body?.instance);
  if (!__acesso.ok) return res.status(__acesso.status).json({ error: __acesso.erro });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const EVO_URL = 'https://evolution-api-production-62cb.up.railway.app';
  const EVO_KEY = process.env.EVOLUTION_API_KEY; // 🔒 10/11/2026: chave saiu do código, vem da Vercel

  const { instance, phone, clinic_id, base64, mimetype, fileName, caption } = req.body || {};
  if (!phone || !base64 || !mimetype) {
    return res.status(400).json({ error: 'Campos obrigatórios: phone, base64, mimetype' });
  }

  const cleanPhone = String(phone).replace(/\D/g, '');
  // ⚠️ AJUSTE 06/08: mesma correção já aplicada em outros arquivos há
  // dias — "começa com 55?" quebrava número estrangeiro (ex: Portugal
  // 351...) colando um 55 na frente por engano. Agora usa o TAMANHO.
  const number = cleanPhone.length >= 12 ? cleanPhone : '55' + cleanPhone;

  let tipo = 'document';
  if (mimetype === 'image/webp') tipo = 'sticker';
  else if (mimetype.startsWith('image/')) tipo = 'image';
  else if (mimetype.startsWith('video/')) tipo = 'video';

  try {
    // ⚠️ NOVO 06/08: resolve a clínica ANTES de decidir o caminho —
    // sem isso, mídia enviada de uma clínica em API Oficial (sem
    // "instance" nenhuma) nem tinha como funcionar.
    let clinicId = clinic_id || null;
    let clinicaInfo = null;
    const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    if (clinicId) {
      const cR = await fetch(`${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinicId}&select=id,tipo_conexao_whatsapp,meta_phone_number_id,meta_access_token`, { headers: sbHeaders });
      if (cR.ok) { const cs = await cR.json(); if (cs?.length) clinicaInfo = cs[0]; }
    } else if (instance) {
      const cR = await fetch(`${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${encodeURIComponent(instance)}&select=id,tipo_conexao_whatsapp,meta_phone_number_id,meta_access_token&limit=1`, { headers: sbHeaders });
      if (cR.ok) { const cs = await cR.json(); if (cs?.length) { clinicaInfo = cs[0]; clinicId = cs[0].id; } }
      if (!clinicId) {
        const iR = await fetch(`${SUPABASE_URL}/rest/v1/instancias?instance_name=eq.${encodeURIComponent(instance)}&select=clinic_id&limit=1`, { headers: sbHeaders });
        if (iR.ok) { const is = await iR.json(); if (is?.length) clinicId = is[0].clinic_id; }
      }
    }

    const ehOficial = clinicaInfo?.tipo_conexao_whatsapp === 'oficial' && clinicaInfo.meta_phone_number_id && clinicaInfo.meta_access_token;

    if (!ehOficial && !instance) {
      return res.status(400).json({ error: 'Campo obrigatório: instance (clínica não está em modo API Oficial)' });
    }

    // ── 1. Sobe pro Storage PRIMEIRO (precisa do link pra API Oficial;
    // pro Evolution, sobe também, só que depois de já ter enviado —
    // agora invertido pra funcionar nos dois casos, sem duplicar lógica) ──
    let media_url = null;
    const ext = (mimetype.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
    const fname = `${tipo}_${number}_${Date.now()}.${ext}`;
    const binary = Buffer.from(base64, 'base64');
    try {
      const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/midias/${fname}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': mimetype },
        body: binary,
      });
      if (upload.ok) media_url = `${SUPABASE_URL}/storage/v1/object/public/midias/${fname}`;
    } catch (e) { }

    // ── 2. Envia de verdade, pelo caminho certo ──────────────
    let messageId = null;
    if (ehOficial) {
      if (!media_url) return res.status(500).json({ error: 'Falha ao subir mídia pro Storage (necessário pra API Oficial)' });
      const tipoMeta = tipo === 'sticker' ? 'sticker' : (tipo === 'document' ? 'document' : tipo); // image | video | sticker | document
      // ⚠️ NOVO 09/09: sobe o arquivo DIRETO pra Meta (media_id) em vez de
      // mandar só o link. Mesma correção aplicada no envio de casos do
      // Brian — com link, a Meta precisa baixar do nosso Storage por fora,
      // e quando não consegue a mensagem falha silenciosamente (causa das
      // falhas intermitentes de Uberlândia). Se o upload falhar, cai de
      // volta no link, exatamente como era antes.
      let midiaId = null;
      try {
        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('type', mimetype);
        form.append('file', new Blob([binary], { type: mimetype }), fileName || fname);
        const up = await fetch(`https://graph.facebook.com/v21.0/${clinicaInfo.meta_phone_number_id}/media`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${clinicaInfo.meta_access_token}` },
          body: form,
        });
        const j = await up.json().catch(() => null);
        if (up.ok && j?.id) midiaId = j.id;
        else console.error('[send-media] upload pra Meta falhou:', JSON.stringify(j));
      } catch (eUp) { console.error('[send-media] erro no upload:', eUp.message); }

      const ref = midiaId ? { id: midiaId } : { link: media_url };
      const corpo = { messaging_product: 'whatsapp', to: number, type: tipoMeta };
      if (tipoMeta === 'document') corpo.document = { ...ref, filename: fileName || 'documento', caption: caption || undefined };
      else corpo[tipoMeta] = { ...ref, caption: tipoMeta === 'sticker' ? undefined : (caption || undefined) };
      const metaResp = await fetch(`https://graph.facebook.com/v21.0/${clinicaInfo.meta_phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicaInfo.meta_access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const metaData = await metaResp.json().catch(() => null);
      if (!metaResp.ok) return res.status(metaResp.status).json(metaData || { error: 'Falha no envio via API Oficial' });
      messageId = metaData?.messages?.[0]?.id || null;
    } else {
      let evoResp;
      if (tipo === 'sticker') {
        evoResp = await fetch(`${EVO_URL}/message/sendSticker/${instance}`, {
          method: 'POST',
          headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number, sticker: base64 }),
        });
      } else {
        evoResp = await fetch(`${EVO_URL}/message/sendMedia/${instance}`, {
          method: 'POST',
          headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number, mediatype: tipo, mimetype, media: base64,
            fileName: fileName || `arquivo.${mimetype.split('/')[1] || 'bin'}`,
            caption: caption || '',
          }),
        });
      }
      const evoData = await evoResp.json().catch(() => null);
      if (!evoResp.ok) return res.status(evoResp.status).json(evoData || { error: 'Falha no envio via Evolution' });
      messageId = evoData?.key?.id || null;
    }

    // ── 3. Registra no Inbox ──────────────────────────────────
    if (SUPABASE_KEY && clinicId) {
      try {
        const labels = { image: '📷 Imagem', video: '🎥 Vídeo', sticker: '🖼️ Sticker', document: fileName || '📄 Documento' };
        await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            clinic_id: clinicId, phone: number, contact_name: null,
            content: caption || labels[tipo], type: tipo, from_me: true, media_url,
            message_id: messageId, instance_name: instance || clinicaInfo?.meta_phone_number_id || null,
            created_at: new Date().toISOString(),
          }),
        });
      } catch (e) {
        console.error('[send-media] Falha ao salvar no Inbox:', e.message);
      }
    }

    return res.status(200).json({ ok: true, tipo, media_url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
