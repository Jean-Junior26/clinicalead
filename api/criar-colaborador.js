// ============================================================
// CLINICALEAD — CRIAR COLABORADOR (rota segura)
// O admin da clínica cria o login de um colaborador.
// Usa a service_role key (server-side) para criar o usuário no
// Supabase Auth e vincular na tabela clinic_users com permissões.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'Configuração ausente (service key)' });

  const { requesterId, clinicId, nome, email, senha, permissoes } = req.body || {};

  // Validações básicas
  if (!requesterId || !clinicId || !nome || !email || !senha) {
    return res.status(400).json({ error: 'Campos obrigatórios: requesterId, clinicId, nome, email, senha' });
  }
  if (String(senha).length < 6) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres' });
  }

  const adminHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // ── 1. Autorização: quem pede tem que ser dono da clínica OU admin geral ──
    const ADMIN_EMAIL = 'jeanjunior.digital@gmail.com';

    // Busca o usuário solicitante
    const reqUserResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${requesterId}`, { headers: adminHeaders });
    if (!reqUserResp.ok) return res.status(403).json({ error: 'Solicitante inválido' });
    const reqUser = await reqUserResp.json();
    const reqEmail = (reqUser?.email || '').toLowerCase();

    // Busca a clínica para conferir o dono
    const clinicResp = await fetch(`${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinicId}&select=id,user_id,nome`, { headers: adminHeaders });
    const clinics = await clinicResp.json();
    if (!clinics?.length) return res.status(404).json({ error: 'Clínica não encontrada' });
    const clinic = clinics[0];

    const ehDono = clinic.user_id === requesterId;
    const ehAdminGeral = reqEmail === ADMIN_EMAIL;
    if (!ehDono && !ehAdminGeral) {
      return res.status(403).json({ error: 'Sem permissão para criar colaboradores nesta clínica' });
    }

    // ── 2. Cria o usuário no Supabase Auth (já confirmado) ──
    const createResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        email: String(email).trim().toLowerCase(),
        password: senha,
        email_confirm: true,
        user_metadata: { name: nome, role: 'colaborador' },
      }),
    });
    const created = await createResp.json();
    if (!createResp.ok) {
      const msg = created?.msg || created?.error_description || created?.message || 'Erro ao criar usuário';
      // email já existe?
      if (String(msg).toLowerCase().includes('already')) {
        return res.status(409).json({ error: 'Este email já está cadastrado no sistema' });
      }
      return res.status(400).json({ error: msg });
    }

    const novoUserId = created?.id || created?.user?.id;
    if (!novoUserId) return res.status(500).json({ error: 'Usuário criado mas sem ID retornado' });

    // ── 3. Vincula na clinic_users com as permissões ──
    const vincResp = await fetch(`${SUPABASE_URL}/rest/v1/clinic_users`, {
      method: 'POST',
      headers: { ...adminHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: novoUserId,
        clinic_id: clinicId,
        nome,
        email: String(email).trim().toLowerCase(),
        papel: 'colaborador',
        permissoes: permissoes || {},
        ativo: true,
      }),
    });

    if (!vincResp.ok) {
      const errText = await vincResp.text();
      // rollback: apaga o usuário criado pra não deixar lixo
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${novoUserId}`, { method: 'DELETE', headers: adminHeaders });
      return res.status(400).json({ error: 'Erro ao vincular colaborador: ' + errText });
    }

    const vinculo = await vincResp.json();
    return res.status(200).json({ ok: true, colaborador: Array.isArray(vinculo) ? vinculo[0] : vinculo });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
