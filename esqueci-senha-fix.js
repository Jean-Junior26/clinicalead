// ============================================================
// CLINICALEAD — ESQUECI MINHA SENHA (recuperação por email)
// 1) Adiciona o link "Esqueci minha senha" na tela de login.
//    -> pede o e-mail e o Supabase envia o link de redefinição.
// 2) Trata a VOLTA do e-mail: quando o usuário clica no link,
//    o Supabase abre o app num estado de "recovery"; aí mostramos
//    uma tela pra digitar a nova senha.
// Tudo no front-end (sem backend). Usa o db (supabase) global.
// ============================================================

(function () {
  'use strict';

  const REDIRECT_URL = 'https://clinicalead.vercel.app';

  // ── 1) PEDIR REDEFINIÇÃO (link na tela de login) ─────────
  window.pedirResetSenha = async function () {
    let email = '';
    // tenta pegar do campo de e-mail da tela de login
    const inputEmail = document.querySelector('input[type="email"]')
      || document.querySelector('input[name*="email" i]')
      || document.querySelector('input[id*="email" i]');
    if (inputEmail && inputEmail.value.trim()) {
      email = inputEmail.value.trim();
    } else {
      email = (prompt('Digite seu e-mail para receber o link de redefinição:') || '').trim();
    }
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (typeof toast === 'function') toast('E-mail inválido', 'error');
      else alert('E-mail inválido');
      return;
    }
    try {
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT_URL });
      if (error) throw error;
      const msg = 'Pronto! Se este e-mail tiver conta, enviamos um link de redefinição. Confira sua caixa de entrada (e o spam). 📧';
      if (typeof toast === 'function') toast('Link enviado! Confira seu e-mail 📧');
      alert(msg);
    } catch (e) {
      console.error('[reset-senha] erro:', e);
      if (typeof toast === 'function') toast('Erro ao enviar. Tente de novo.', 'error');
      else alert('Não consegui enviar agora. Tente novamente em alguns minutos.');
    }
  };

  // ── injeta o link "Esqueci minha senha" na tela de login ──
  function injetarLink() {
    if (document.getElementById('linkEsqueciSenha')) return true; // já tem
    // acha o campo de senha (toda tela de login tem) que ESTEJA visível
    const campoSenha = Array.from(document.querySelectorAll('input[type="password"]'))
      .find(el => el.offsetParent !== null); // visível
    if (!campoSenha) return false;
    // não injeta se for o modal de trocar senha (esse tem id ts...)
    if (campoSenha.id && campoSenha.id.startsWith('ts')) return false;

    const link = document.createElement('a');
    link.id = 'linkEsqueciSenha';
    link.href = '#';
    link.textContent = 'Esqueci minha senha';
    link.style.cssText = 'display:block;margin-top:12px;font-size:13px;color:var(--gold,#C9A84C);text-decoration:none;cursor:pointer;text-align:center;';
    link.onmouseover = () => { link.style.textDecoration = 'underline'; };
    link.onmouseout = () => { link.style.textDecoration = 'none'; };
    link.onclick = (e) => { e.preventDefault(); window.pedirResetSenha(); };

    // insere logo abaixo do bloco do campo de senha
    const container = campoSenha.closest('div') || campoSenha.parentNode;
    container.parentNode.insertBefore(link, container.nextSibling);
    return true;
  }

  // ── 2) TRATAR A VOLTA DO E-MAIL (recovery) ───────────────
  // Quando o usuário clica no link, o Supabase dispara o evento
  // PASSWORD_RECOVERY. Aí mostramos a tela de nova senha.
  function modalNovaSenha() {
    if (document.getElementById('modalRecoverySenha')) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalRecoverySenha';
    overlay.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px;width:94vw;background:var(--bg-elevated,#1a1a1a);border:1px solid var(--gold-border,#3a3320);border-radius:14px;padding:0;">
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid var(--border-subtle,#2a2a2a);">
          <h3 style="margin:0;font-size:16px;"><i class="ti ti-lock-open" style="margin-right:8px;color:var(--gold,#C9A84C);"></i>Definir nova senha</h3>
        </div>
        <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:14px;">
          <p style="font-size:13px;color:var(--text-muted,#999);margin:0;">Você chegou pelo link de redefinição. Escolha sua nova senha:</p>
          <input type="password" id="rsNova" autocomplete="new-password" placeholder="Nova senha (mín. 6)"
            style="width:100%;padding:11px 12px;border-radius:8px;background:var(--bg,#111);border:1px solid var(--border-subtle,#2a2a2a);color:#fff;">
          <input type="password" id="rsConf" autocomplete="new-password" placeholder="Confirmar nova senha"
            style="width:100%;padding:11px 12px;border-radius:8px;background:var(--bg,#111);border:1px solid var(--border-subtle,#2a2a2a);color:#fff;">
          <div id="rsMsg" style="font-size:12px;min-height:16px;"></div>
          <button id="rsBtn" onclick="salvarNovaSenhaRecovery()"
            style="background:var(--gold,#C9A84C);color:#1a1a1a;border:none;padding:11px;border-radius:8px;font-weight:600;cursor:pointer;">
            Salvar nova senha
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  window.salvarNovaSenhaRecovery = async function () {
    const msg = document.getElementById('rsMsg');
    const btn = document.getElementById('rsBtn');
    const setMsg = (t, c) => { if (msg) { msg.textContent = t; msg.style.color = c || 'var(--text-muted)'; } };
    const nova = (document.getElementById('rsNova').value || '').trim();
    const conf = (document.getElementById('rsConf').value || '').trim();
    if (!nova || !conf) { setMsg('Preencha os dois campos.', '#E57373'); return; }
    if (nova.length < 6) { setMsg('A senha precisa ter ao menos 6 caracteres.', '#E57373'); return; }
    if (nova !== conf) { setMsg('As senhas não batem.', '#E57373'); return; }
    btn.disabled = true; btn.style.opacity = '0.6';
    setMsg('Salvando…');
    try {
      const { error } = await db.auth.updateUser({ password: nova });
      if (error) throw error;
      setMsg('Senha definida! Redirecionando…', 'var(--gold,#C9A84C)');
      setTimeout(() => { window.location.href = REDIRECT_URL; }, 1500);
    } catch (e) {
      console.error('[recovery] erro:', e);
      setMsg('Erro ao salvar. Tente de novo.', '#E57373');
      btn.disabled = false; btn.style.opacity = '1';
    }
  };

  // escuta o evento de recovery do Supabase
  function escutarRecovery() {
    if (typeof db === 'undefined' || !db.auth) return false;
    db.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        modalNovaSenha();
        const m = document.getElementById('modalRecoverySenha');
        if (m) m.style.display = 'flex';
      }
    });
    // também detecta pela URL (alguns fluxos vêm com type=recovery no hash)
    if (location.hash.includes('type=recovery') || location.search.includes('type=recovery')) {
      modalNovaSenha();
      const m = document.getElementById('modalRecoverySenha');
      if (m) m.style.display = 'flex';
    }
    return true;
  }

  // ── inicialização ────────────────────────────────────────
  function iniciar() {
    if (typeof db === 'undefined') return false;
    escutarRecovery();
    injetarLink();
    // re-tenta injetar o link enquanto a tela de login estiver montando
    const obs = new MutationObserver(() => {
      clearTimeout(window.__esqueciTimer);
      window.__esqueciTimer = setTimeout(injetarLink, 250);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('✅ esqueci-senha-fix.js carregado');
    return true;
  }

  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
