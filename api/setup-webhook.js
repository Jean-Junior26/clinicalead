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
    // 11/11/2026: configurações da instância (ignorar grupos/status etc.)
    { m: 'GET',    re: /^\/settings\/find\/([^/?#]+)$/,                inst: 1 },
    { m: 'POST',   re: /^\/settings\/set\/([^/?#]+)$/,                 inst: 1 },
  ];

  const acao = req.body?.acao || 'setup_webhook';

  // ════════════════════════════════════════════════════════════
  // ⚠️ NOVO 13/11/2026 — CONECTAR WHATSAPP PELO SERVIDOR (QR Code)
  // Antes a tela fazia tudo pelo navegador: limpar instância velha,
  // criar a nova e GRAVAR no cadastro da clínica. Pra login que não é
  // admin (ex.: recepção), o banco às vezes bloqueava a gravação e a
  // tela só dizia "Erro ao gerar QR Code". Agora o servidor faz tudo
  // com permissão total, depois de conferir que a pessoa é da clínica:
  //   { acao:'conectar_qr', clinic_id }          → limpa, cria, grava, devolve o QR
  //   { acao:'status_qr', clinic_id, instance }  → estado; quando "open",
  //                                                 configura webhook + ignorar grupos
  // ════════════════════════════════════════════════════════════
  if (acao === 'conectar_qr' || acao === 'status_qr') {
    const clinicId = req.body?.clinic_id;
    if (!clinicId) return res.status(400).json({ error: 'clinic_id obrigatório' });
    const acessoC = await __portaria(clinicId, null);
    if (!acessoC.ok) return res.status(acessoC.status).json({ error: acessoC.erro });
    const sbH = { apikey: __SB_KEY, Authorization: `Bearer ${__SB_KEY}`, 'Content-Type': 'application/json' };
    const evo = async (method, path, body) => {
      const r = await fetch(EVO_URL + path, { method, headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
      return { ok: r.ok, status: r.status, data: j };
    };
    const cR = await fetch(`${__SB_URL}/rest/v1/clinicas?id=eq.${encodeURIComponent(clinicId)}&select=id,nome,whatsapp_instance,tipo_conexao_whatsapp`, { headers: sbH });
    const clinic = (cR.ok ? await cR.json() : [])[0];
    if (!clinic) return res.status(404).json({ error: 'Clínica não encontrada' });

    if (acao === 'status_qr') {
      const inst = String(req.body?.instance || '');
      if (!inst || (inst !== clinic.whatsapp_instance && !inst.includes(String(clinic.id).slice(0, 8)))) {
        return res.status(403).json({ error: 'Instância não pertence a esta clínica' });
      }
      const st = await evo('GET', `/instance/connectionState/${encodeURIComponent(inst)}`);
      const state = st.data?.instance?.state || st.data?.state || 'desconhecido';
      if (state === 'open') {
        await evo('POST', `/webhook/set/${encodeURIComponent(inst)}`, { webhook: { enabled: true, url: WEBHOOK_URL, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] } });
        await evo('POST', `/settings/set/${encodeURIComponent(inst)}`, { rejectCall: false, msgCall: '', groupsIgnore: true, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false });
      }
      // QR atualizado (o do WhatsApp expira rápido)
      let base64 = null;
      if (state !== 'open' && req.body?.renovar) {
        const q = await evo('GET', `/instance/connect/${encodeURIComponent(inst)}`);
        base64 = q.data?.base64 || null;
      }
      return res.status(200).json({ ok: true, state, base64 });
    }

    // conectar_qr
    if (clinic.tipo_conexao_whatsapp === 'oficial') return res.status(400).json({ error: 'Esta clínica usa a API Oficial — não usa QR Code' });
    const idCurto = String(clinic.id).slice(0, 8);
    const base = String(clinic.nome || 'clinica').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 16) || 'clinica';
    // 1) limpa SÓ as instâncias desta clínica: a principal atual + as que levam o id dela
    //    (números extras cadastrados em "instancias" NÃO são tocados)
    const extrasR = await fetch(`${__SB_URL}/rest/v1/instancias?clinic_id=eq.${encodeURIComponent(clinic.id)}&select=instance_name`, { headers: sbH });
    const extras = new Set((extrasR.ok ? await extrasR.json() : []).map(x => x.instance_name));
    const lista = await evo('GET', '/instance/fetchInstances');
    const nomes = (Array.isArray(lista.data) ? lista.data : []).map(i => i.name || i.instance?.instanceName || i.instanceName).filter(Boolean);
    const alvos = nomes.filter(n => !extras.has(n) && (n === clinic.whatsapp_instance || n.includes(idCurto)));
    for (const n of alvos) {
      await evo('DELETE', `/instance/logout/${encodeURIComponent(n)}`);
      await new Promise(r => setTimeout(r, 300));
      await evo('DELETE', `/instance/delete/${encodeURIComponent(n)}`);
    }
    // 2) cria a nova
    const novo = `${base}_${idCurto}_${Date.now().toString().slice(-6)}`;
    const cr = await evo('POST', '/instance/create', { instanceName: novo, qrcode: true, integration: 'WHATSAPP-BAILEYS' });
    if (!cr.ok) return res.status(502).json({ error: 'A Evolution recusou criar a conexão: ' + JSON.stringify(cr.data).slice(0, 200) });
    let base64 = cr.data?.qrcode?.base64 || null;
    if (!base64) {
      await new Promise(r => setTimeout(r, 1500));
      const q = await evo('GET', `/instance/connect/${encodeURIComponent(novo)}`);
      base64 = q.data?.base64 || null;
    }
    // 3) grava no cadastro (com permissão do servidor — não depende do login)
    const up = await fetch(`${__SB_URL}/rest/v1/clinicas?id=eq.${encodeURIComponent(clinic.id)}`, {
      method: 'PATCH', headers: { ...sbH, Prefer: 'return=minimal' }, body: JSON.stringify({ whatsapp_instance: novo }),
    });
    if (!up.ok) return res.status(500).json({ error: 'Conexão criada, mas não consegui gravar no cadastro (' + up.status + ')' });
    if (!base64) return res.status(502).json({ error: 'A conexão foi criada, mas a Evolution não devolveu o QR. Clique em Gerar QR Code de novo.', instance: novo });
    return res.status(200).json({ ok: true, instance: novo, base64, limpas: alvos });
  }

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
