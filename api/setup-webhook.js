// ============================================================
// CLINICALEAD — PONTE SEGURA COM A EVOLUTION API (+ setup de webhook)
// 🔒 REESCRITO 10/11/2026: a chave mestra da Evolution ficava no
// index.html, visível pra qualquer pessoa. Agora ela mora SÓ aqui no
// servidor (variável EVOLUTION_API_KEY na Vercel) e o navegador pede
// as operações pra esta rota, que confere o login e se a pessoa tem
// acesso àquela instância antes de repassar.
//   { acao: 'evo', method, path, body }  → repassa pra Evolution
//   { instance }                          → (antigo) configura webhook
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

  const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-62cb.up.railway.app';
  const EVO_KEY = process.env.EVOLUTION_API_KEY;
  const WEBHOOK_URL = 'https://clinicalead.vercel.app/api/webhook';
  if (!EVO_KEY) return res.status(500).json({ error: 'EVOLUTION_API_KEY não configurada na Vercel' });

  // só estas operações podem passar pela ponte
  const PERMITIDOS = [
    { m: 'POST',   re: /^\/instance\/create$/,                       inst: null },
    { m: 'GET',    re: /^\/instance\/connect\/([^/?#]+)$/,             inst: 1 },
    { m: 'GET',    re: /^\/instance\/connectionState\/([^/?#]+)$/,     inst: 1 },
    { m: 'GET',    re: /^\/instance\/fetchInstances(\?instanceName=([^&#]+))?$/, inst: 2 },
    { m: 'DELETE', re: /^\/instance\/logout\/([^/?#]+)$/,              inst: 1 },
    { m: 'DELETE', re: /^\/instance\/delete\/([^/?#]+)$/,              inst: 1 },
    { m: 'POST',   re: /^\/instance\/restart\/([^/?#]+)$/,             inst: 1 },
    { m: 'GET',    re: /^\/webhook\/find\/([^/?#]+)$/,                 inst: 1 },
    { m: 'POST',   re: /^\/webhook\/set\/([^/?#]+)$/,                  inst: 1 },
    { m: 'POST',   re: /^\/message\/sendWhatsAppAudio\/([^/?#]+)$/,    inst: 1 },
    { m: 'POST',   re: /^\/message\/sendText\/([^/?#]+)$/,             inst: 1 },
  ];

  const acao = req.body?.acao || 'setup_webhook';

  if (acao === 'evo') {
    const method = String(req.body?.method || 'GET').toUpperCase();
    const path = String(req.body?.path || '');
    const regra = PERMITIDOS.find(p => p.m === method && p.re.test(path));
    if (!regra) return res.status(403).json({ error: 'Operação não permitida: ' + method + ' ' + path });
    const mm = path.match(regra.re);
    const instance = regra.inst && mm[regra.inst] ? decodeURIComponent(mm[regra.inst]) : null;

    // clínicas que o usuário logado pode mexer (dono + colaborador)
    async function clinicasDoUsuario(user) {
      const sbH = { apikey: __SB_KEY, Authorization: `Bearer ${__SB_KEY}` };
      const a = await fetch(`${__SB_URL}/rest/v1/clinicas?user_id=eq.${user.id}&select=id`, { headers: sbH });
      const b = await fetch(`${__SB_URL}/rest/v1/clinic_users?user_id=eq.${user.id}&select=clinic_id`, { headers: sbH });
      const ids = [...(a.ok ? await a.json() : []).map(x => x.id), ...(b.ok ? await b.json() : []).map(x => x.clinic_id)];
      return [...new Set(ids.filter(Boolean))];
    }
    // nome de instância criado pelo CRM sempre leva os 8 primeiros
    // caracteres do id da clínica (ex: gouodontojosboni_1a2b3c4d_123456)
    const instDaClinica = (nome, ids) => ids.some(id => String(nome).includes(String(id).slice(0, 8)));

    let acesso;
    let filtrarLista = null;
    if (instance) {
      acesso = await __portaria(null, instance);
      if (!acesso.ok && acesso.status === 403) {
        // instância recém-criada (ainda não salva) ou zumbi antiga: libera
        // se o nome dela carrega o id de uma clínica do usuário
        const u = await __portaria(null, null, true);
        if (u.ok && (u.ehAdmin || u.interno || instDaClinica(instance, await clinicasDoUsuario(u.user)))) acesso = u;
      }
    } else {
      acesso = await __portaria(null, null, true);
      // listar TODAS: admin vê tudo; os outros só as instâncias das próprias clínicas
      if (acesso.ok && /fetchInstances/.test(path) && !acesso.ehAdmin && !acesso.interno) {
        filtrarLista = await clinicasDoUsuario(acesso.user);
      }
    }
    if (!acesso.ok) return res.status(acesso.status).json({ error: acesso.erro });

    try {
      const opts = { method, headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' } };
      if (method !== 'GET' && req.body?.body) opts.body = JSON.stringify(req.body.body);
      const r = await fetch(EVO_URL + path, opts);
      const txt = await r.text();
      let data; try { data = JSON.parse(txt); } catch { data = txt; }
      if (filtrarLista && Array.isArray(data)) {
        data = data.filter(i => instDaClinica(i.name || i.instance?.instanceName || i.instanceName || '', filtrarLista));
      }
      return res.status(r.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: 'Evolution não respondeu: ' + err.message });
    }
  }

  // ── modo antigo: configurar webhook de uma instância ──
  const { instance } = req.body || {};
  if (!instance) return res.status(400).json({ error: 'instance obrigatório' });
  const acessoW = await __portaria(null, instance);
  if (!acessoW.ok) {
    const u = await __portaria(null, null, true);
    if (!u.ok) return res.status(acessoW.status).json({ error: acessoW.erro });
  }
  try {
    const resp = await fetch(`${EVO_URL}/webhook/set/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: WEBHOOK_URL,
          byEvents: false,
          base64: false,
          events: ['MESSAGES_UPSERT'],
        },
      }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ ok: false, data });
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
