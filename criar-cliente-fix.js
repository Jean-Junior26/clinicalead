// ============================================================
// CLINICALEAD — PAINEL DE CRIAR CLIENTE COMPLETO (ADMIN)
// Cria usuário (login) + clínica de uma vez, chamando a Edge Function
// 'criar-cliente'. Entrega a clínica pronta pra você configurar.
// Carregar como script novo no index.
// ============================================================
(function () {
  'use strict';

  // URL da Edge Function (mesmo projeto Supabase)
  const FN_URL = 'https://zcwntpkiispbhjjgidih.supabase.co/functions/v1/criar-cliente';
  // chave pública (anon) — só pra autorizar a chamada da função
  const ANON_KEY = 'sb_publishable_G6xEiLO4lcNaJafm9RA2tA_QLf4E2FV';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function ehAdminMaster() {
    const r = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return r === 'admin' || r === 'administrador';
  }
  function adminUserId() {
    // pega o user_id do admin logado (da clínica atual ou da sessão)
    const c = (typeof currentClinic === 'function') ? currentClinic() : null;
    return c ? c.user_id : null;
  }

  window.abrirCriarCliente = function () {
    if (!ehAdminMaster()) return;
    let modal = document.getElementById('modalCriarCliente');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalCriarCliente';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';

    const inp = 'width:100%;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);margin-bottom:12px;';
    const lbl = 'display:block;font-size:13px;color:var(--text-secondary,#8A8570);margin-bottom:5px;';

    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:16px;padding:26px;max-width:520px;width:100%;max-height:90vh;overflow:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <h2 style="margin:0;font-size:19px;">➕ Criar cliente novo</h2>
          <button onclick="document.getElementById('modalCriarCliente').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:24px;cursor:pointer;">×</button>
        </div>

        <div style="font-size:13px;font-weight:700;color:var(--gold,#C9A84C);margin-bottom:10px;">🏥 Dados da clínica</div>
        <label style="${lbl}">Nome da clínica *</label>
        <input id="ccNome" type="text" placeholder="Ex: Sorriso Perfeito Odontologia" style="${inp}">
        <label style="${lbl}">Responsável</label>
        <input id="ccResp" type="text" placeholder="Nome do dono/responsável" style="${inp}">
        <label style="${lbl}">Telefone</label>
        <input id="ccTel" type="text" placeholder="(00) 00000-0000" style="${inp}">
        <label style="${lbl}">Endereço</label>
        <input id="ccEnd" type="text" placeholder="Rua, número, bairro, cidade" style="${inp}">

        <div style="font-size:13px;font-weight:700;color:var(--gold,#C9A84C);margin:16px 0 10px;">🔑 Acesso do cliente (login)</div>
        <label style="${lbl}">E-mail (será o login) *</label>
        <input id="ccEmail" type="email" placeholder="email@cliente.com" style="${inp}">
        <label style="${lbl}">Senha provisória * (mín. 6 caracteres)</label>
        <div style="display:flex;gap:8px;">
          <input id="ccSenha" type="text" placeholder="senha123" style="${inp}flex:1;">
          <button onclick="ccGerarSenha()" style="padding:9px 12px;border-radius:8px;border:1px solid var(--gold-border,#333);background:transparent;color:var(--gold,#C9A84C);cursor:pointer;white-space:nowrap;height:fit-content;">🎲 Gerar</button>
        </div>

        <div id="ccErro" style="color:var(--coral,#C0624A);font-size:13px;margin:8px 0;display:none;"></div>

        <button id="ccBtn" onclick="executarCriarCliente()" style="width:100%;padding:12px;border-radius:10px;border:none;background:var(--gold,#C9A84C);color:#0A0A0B;font-weight:700;font-size:15px;cursor:pointer;margin-top:8px;">✓ Criar cliente</button>
        <p style="font-size:11px;color:var(--text-muted,#888);margin-top:12px;text-align:center;">Cria o login + a clínica. Depois você configura o Brian e ativa o plano.</p>
      </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  };

  // gera uma senha provisória fácil de passar
  window.ccGerarSenha = function () {
    const palavras = ['sorriso', 'dente', 'clinica', 'saude', 'brilho'];
    const p = palavras[Math.floor(Math.random() * palavras.length)];
    const n = Math.floor(1000 + Math.random() * 9000);
    document.getElementById('ccSenha').value = p + n;
  };

  window.executarCriarCliente = async function () {
    if (!ehAdminMaster()) return;
    const erro = document.getElementById('ccErro');
    const btn = document.getElementById('ccBtn');
    const mostraErro = (msg) => { erro.textContent = msg; erro.style.display = 'block'; };
    erro.style.display = 'none';

    const dados = {
      nome_clinica: document.getElementById('ccNome').value.trim(),
      responsavel: document.getElementById('ccResp').value.trim(),
      telefone: document.getElementById('ccTel').value.trim(),
      endereco: document.getElementById('ccEnd').value.trim(),
      email: document.getElementById('ccEmail').value.trim(),
      senha: document.getElementById('ccSenha').value,
      admin_user_id: adminUserId(),
    };

    if (!dados.nome_clinica) { mostraErro('Informe o nome da clínica.'); return; }
    if (!dados.email) { mostraErro('Informe o e-mail (login).'); return; }
    if (!dados.senha || dados.senha.length < 6) { mostraErro('Senha precisa ter ao menos 6 caracteres.'); return; }

    btn.disabled = true; btn.textContent = 'Criando…';
    try {
      const resp = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ANON_KEY, 'apikey': ANON_KEY },
        body: JSON.stringify(dados),
      });
      const r = await resp.json();
      if (!r.ok) { mostraErro(r.erro || 'Falha ao criar cliente.'); btn.disabled = false; btn.textContent = '✓ Criar cliente'; return; }

      // sucesso! mostra os dados pra você passar pro cliente
      const modal = document.getElementById('modalCriarCliente');
      modal.querySelector('div').innerHTML = `
        <div style="text-align:center;padding:10px;">
          <div style="font-size:42px;margin-bottom:10px;">✅</div>
          <h2 style="margin:0 0 14px;">Cliente criado!</h2>
          <div style="text-align:left;background:var(--bg-base,#0A0A0B);border-radius:10px;padding:16px;margin-bottom:16px;font-size:14px;">
            <div style="margin-bottom:8px;"><b>Clínica:</b> ${r.clinic_nome}</div>
            <div style="margin-bottom:8px;"><b>Login (e-mail):</b> ${r.email}</div>
            <div><b>Senha:</b> ${dados.senha}</div>
          </div>
          <p style="font-size:13px;color:var(--text-secondary,#8A8570);margin-bottom:16px;">Passe esses dados pro cliente. Agora é só configurar o Brian e ativar o plano (painel "Ativar plano").</p>
          <button onclick="document.getElementById('modalCriarCliente').remove()" style="padding:10px 24px;border-radius:8px;border:none;background:var(--gold,#C9A84C);color:#0A0A0B;font-weight:700;cursor:pointer;">Fechar</button>
        </div>`;
      if (typeof toast === 'function') toast('Cliente criado! ✓', 'success');
    } catch (e) {
      mostraErro('Erro de conexão. Tente novamente.');
      btn.disabled = false; btn.textContent = '✓ Criar cliente';
    }
  };

  // injeta botão no menu (só admin)
  function injetarBotao() {
    if (!ehAdminMaster()) return;
    if (document.getElementById('navCriarCliente')) return;
    const ref = document.querySelector('.nav-item[data-page="clinicas"]');
    if (!ref) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navCriarCliente';
    btn.innerHTML = '<i class="ti ti-user-plus"></i> Criar cliente';
    btn.onclick = () => abrirCriarCliente();
    ref.parentNode.insertBefore(btn, ref.nextSibling);
  }

  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    injetarBotao();
    setInterval(injetarBotao, 1500);
    console.log('✅ criar-cliente-fix.js carregado');
    return true;
  }
  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }
})();
