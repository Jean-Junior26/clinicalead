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

  const adminHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  const ADMIN_EMAIL = 'jeanjunior.digital@gmail.com';

  // ⚠️ NOVO 10/08: duas ações novas, reaproveitando este mesmo arquivo (a
  // Vercel Hobby só libera 12 funções, já estávamos no limite) — antes só
  // dava pra CRIAR colaborador, sem jeito de editar dados ou resetar senha
  // depois. Caso real: Ana (José Bonifácio) trocou de computador, esqueceu
  // a senha, e o e-mail de recuperação não chegou — sem essa opção, ficava
  // sem saída a não ser mexer direto no Supabase.
  const acao = req.body?.acao || 'criar';

  if (acao === 'editar' || acao === 'resetar_senha') {
    const { requesterId, colabId, nome, email, novaSenha } = req.body || {};
    if (!requesterId || !colabId) return res.status(400).json({ error: 'Campos obrigatórios: requesterId, colabId' });

    try {
      // autorização: só dono da clínica desse colaborador OU admin geral
      const colabResp = await fetch(`${SUPABASE_URL}/rest/v1/clinic_users?id=eq.${colabId}&select=id,user_id,clinic_id,nome,email`, { headers: adminHeaders });
      const colabArr = await colabResp.json();
      if (!colabResp.ok || !colabArr?.length) return res.status(404).json({ error: 'Colaborador não encontrado' });
      const colab = colabArr[0];

      const reqUserResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${requesterId}`, { headers: adminHeaders });
      if (!reqUserResp.ok) return res.status(403).json({ error: 'Solicitante inválido' });
      const reqUser = await reqUserResp.json();
      const reqEmail = (reqUser?.email || '').toLowerCase();

      const clinicResp = await fetch(`${SUPABASE_URL}/rest/v1/clinicas?id=eq.${colab.clinic_id}&select=user_id`, { headers: adminHeaders });
      const clinics = await clinicResp.json();
      const ehDono = clinics?.[0]?.user_id === requesterId;
      const ehAdminGeral = reqEmail === ADMIN_EMAIL;
      if (!ehDono && !ehAdminGeral) return res.status(403).json({ error: 'Sem permissão para editar este colaborador' });

      if (acao === 'resetar_senha') {
        if (!novaSenha || String(novaSenha).length < 6) return res.status(400).json({ error: 'A nova senha precisa ter ao menos 6 caracteres' });
        const resetResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${colab.user_id}`, {
          method: 'PUT',
          headers: adminHeaders,
          body: JSON.stringify({ password: novaSenha }),
        });
        if (!resetResp.ok) {
          const errData = await resetResp.json().catch(() => null);
          return res.status(400).json({ error: errData?.msg || 'Erro ao resetar senha' });
        }
        return res.status(200).json({ ok: true, mensagem: 'Senha resetada com sucesso' });
      }

      // acao === 'editar': nome/email na clinic_users (e no Auth também, se o email mudou)
      const updates = {};
      if (nome) updates.nome = nome;
      if (email) updates.email = String(email).trim().toLowerCase();
      if (Object.keys(updates).length) {
        const upResp = await fetch(`${SUPABASE_URL}/rest/v1/clinic_users?id=eq.${colabId}`, {
          method: 'PATCH',
          headers: { ...adminHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify(updates),
        });
        if (!upResp.ok) return res.status(400).json({ error: 'Erro ao atualizar dados do colaborador' });
      }
      if (email && email.trim().toLowerCase() !== (colab.email || '').toLowerCase()) {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${colab.user_id}`, {
          method: 'PUT',
          headers: adminHeaders,
          body: JSON.stringify({ email: email.trim().toLowerCase(), email_confirm: true }),
        });
      }
      return res.status(200).json({ ok: true, mensagem: 'Colaborador atualizado' });
    } catch (err) {
      return res.status(500).json({ error: 'Erro interno', message: err.message });
    }
  }

  // ── ação padrão (sem mudanças): criar colaborador ──
  const { requesterId, clinicId, nome, email, senha, permissoes } = req.body || {};

  // Validações básicas
  if (!requesterId || !clinicId || !nome || !email || !senha) {
    return res.status(400).json({ error: 'Campos obrigatórios: requesterId, clinicId, nome, email, senha' });
  }
  if (String(senha).length < 6) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres' });
  }

  try {
    // ── 1. Autorização: quem pede tem que ser dono da clínica OU admin geral ──

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
    let novoUserId = created?.id || created?.user?.id;

    if (!createResp.ok) {
      const msg = created?.msg || created?.error_description || created?.message || 'Erro ao criar usuário';
      // ⚠️ AJUSTE 28/07: antes, e-mail já existente = erro, fim de linha —
      // impossível dar acesso a uma clínica NOVA pra um colaborador que já
      // existia em outra, sem mexer direto no banco. Agora: se o e-mail já
      // existe, busca o user_id dele de verdade e segue o fluxo normal,
      // só vinculando (sem criar conta nova nem mexer na senha existente).
      if (String(msg).toLowerCase().includes('already')) {
        const buscaResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(String(email).trim().toLowerCase())}`, { headers: adminHeaders });
        const buscaData = await buscaResp.json();
        const existente = (buscaData?.users || buscaData || [])[0];
        if (!buscaResp.ok || !existente?.id) {
          return res.status(409).json({ error: 'Este email já está cadastrado, mas não consegui encontrar o usuário pra vincular. Fale com o suporte.' });
        }
        novoUserId = existente.id;
      } else {
        return res.status(400).json({ error: msg });
      }
    }

    if (!novoUserId) return res.status(500).json({ error: 'Usuário criado mas sem ID retornado' });

    // já tem vínculo com ESSA clínica? evita duplicar — atualiza permissões em vez de inserir de novo
    const jaVinculadoResp = await fetch(`${SUPABASE_URL}/rest/v1/clinic_users?user_id=eq.${novoUserId}&clinic_id=eq.${clinicId}&select=id`, { headers: adminHeaders });
    const jaVinculado = await jaVinculadoResp.json();
    if (jaVinculadoResp.ok && jaVinculado?.length) {
      const upResp = await fetch(`${SUPABASE_URL}/rest/v1/clinic_users?id=eq.${jaVinculado[0].id}`, {
        method: 'PATCH',
        headers: { ...adminHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ nome, permissoes: permissoes || {}, ativo: true }),
      });
      const atualizado = await upResp.json();
      return res.status(200).json({ ok: true, colaborador: Array.isArray(atualizado) ? atualizado[0] : atualizado, jaExistia: true });
    }

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
      return res.status(400).json({ error: 'Erro ao vincular colaborador: ' + errText });
    }

    const vinculo = await vincResp.json();
    return res.status(200).json({ ok: true, colaborador: Array.isArray(vinculo) ? vinculo[0] : vinculo });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
