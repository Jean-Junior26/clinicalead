// ============================================================
// CLINICALEAD — TROCAR A PRÓPRIA SENHA (usuário logado)
// Adiciona um botão "Trocar senha" no rodapé do menu lateral
// (perto do nome do usuário) que abre um modal com:
//   senha atual + nova senha + confirmar nova.
// Valida a senha atual via re-login silencioso antes de trocar.
// Não precisa de backend nem service key (o próprio usuário troca).
// ============================================================

(function () {
  'use strict';

  // ── Cria o modal (uma vez) ───────────────────────────────
  function garantirModal() {
    if (document.getElementById('modalTrocarSenha')) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalTrocarSenha';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px;width:94vw;">
        <div class="modal-header">
          <h3><i class="ti ti-lock" style="margin-right:8px;color:var(--gold);"></i>Trocar senha</h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('modalTrocarSenha')"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Senha atual</label>
            <input type="password" id="tsSenhaAtual" class="input" autocomplete="current-password" placeholder="Sua senha de hoje"
              style="width:100%;padding:10px 12px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--border-subtle);color:var(--text-primary);">
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Nova senha</label>
            <input type="password" id="tsSenhaNova" class="input" autocomplete="new-password" placeholder="Mínimo 6 caracteres"
              style="width:100%;padding:10px 12px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--border-subtle);color:var(--text-primary);">
          </div>
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:5px;">Confirmar nova senha</label>
            <input type="password" id="tsSenhaConf" class="input" autocomplete="new-password" placeholder="Repita a nova senha"
              style="width:100%;padding:10px 12px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--border-subtle);color:var(--text-primary);">
          </div>
          <div id="tsMsg" style="font-size:12px;min-height:16px;"></div>
          <button id="tsBtnSalvar" class="btn" onclick="trocarMinhaSenha()"
            style="background:var(--gold);color:#1a1a1a;border:none;padding:11px;border-radius:8px;font-weight:600;cursor:pointer;">
            Salvar nova senha
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  // ── Abre o modal ─────────────────────────────────────────
  window.abrirTrocarSenha = function () {
    garantirModal();
    // limpa campos
    ['tsSenhaAtual', 'tsSenhaNova', 'tsSenhaConf'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const msg = document.getElementById('tsMsg'); if (msg) msg.textContent = '';
    if (typeof openModal === 'function') openModal('modalTrocarSenha');
    else document.getElementById('modalTrocarSenha').classList.add('open');
  };

  // ── Executa a troca ──────────────────────────────────────
  window.trocarMinhaSenha = async function () {
    const msg = document.getElementById('tsMsg');
    const btn = document.getElementById('tsBtnSalvar');
    const setMsg = (txt, cor) => { if (msg) { msg.textContent = txt; msg.style.color = cor || 'var(--text-muted)'; } };

    const atual = (document.getElementById('tsSenhaAtual').value || '').trim();
    const nova = (document.getElementById('tsSenhaNova').value || '').trim();
    const conf = (document.getElementById('tsSenhaConf').value || '').trim();

    // validações
    if (!atual || !nova || !conf) { setMsg('Preencha todos os campos.', 'var(--coral)'); return; }
    if (nova.length < 6) { setMsg('A nova senha precisa ter ao menos 6 caracteres.', 'var(--coral)'); return; }
    if (nova !== conf) { setMsg('A confirmação não bate com a nova senha.', 'var(--coral)'); return; }
    if (nova === atual) { setMsg('A nova senha precisa ser diferente da atual.', 'var(--coral)'); return; }

    // pega o e-mail do usuário logado
    const email = STATE?.user?.email || STATE?.profile?.email;
    if (!email) { setMsg('Não identifiquei seu usuário. Recarregue a página.', 'var(--coral)'); return; }

    btn.disabled = true; btn.style.opacity = '0.6';
    setMsg('Verificando senha atual…');

    try {
      // 1) valida a senha ATUAL via re-login silencioso
      const { error: errLogin } = await db.auth.signInWithPassword({ email, password: atual });
      if (errLogin) {
        setMsg('Senha atual incorreta.', 'var(--coral)');
        btn.disabled = false; btn.style.opacity = '1';
        return;
      }
      // 2) troca pra nova senha
      setMsg('Atualizando…');
      const { error: errUpd } = await db.auth.updateUser({ password: nova });
      if (errUpd) {
        setMsg('Erro ao atualizar: ' + (errUpd.message || 'tente de novo'), 'var(--coral)');
        btn.disabled = false; btn.style.opacity = '1';
        return;
      }
      setMsg('Senha alterada com sucesso! ✓', 'var(--gold)');
      if (typeof toast === 'function') toast('Senha alterada com sucesso! 🔒');
      setTimeout(() => {
        if (typeof closeModal === 'function') closeModal('modalTrocarSenha');
        else document.getElementById('modalTrocarSenha').classList.remove('open');
      }, 1200);
    } catch (e) {
      console.error('[trocar-senha] erro:', e);
      setMsg('Algo deu errado. Tente novamente.', 'var(--coral)');
      btn.disabled = false; btn.style.opacity = '1';
    }
  };

  // ── Injeta o botão no rodapé do menu lateral ─────────────
  function injetarBotao() {
    if (typeof STATE === 'undefined') return false;
    if (document.getElementById('btnTrocarSenhaSidebar')) return true; // já existe

    // acha o rodapé do usuário no menu (onde tem nome + logout)
    // tenta vários seletores comuns
    let ancora = document.querySelector('.sidebar-user, .user-info, .sidebar-footer');
    if (!ancora) {
      // fallback: acha pelo nome do usuário exibido
      const nome = STATE?.profile?.nome || STATE?.user?.email;
      if (nome) {
        const todos = document.querySelectorAll('aside *, .sidebar *, nav *');
        for (const el of todos) {
          if (el.children.length === 0 && el.textContent.trim() === String(nome).trim()) {
            ancora = el.closest('div');
            break;
          }
        }
      }
    }
    if (!ancora) return false;

    const btn = document.createElement('button');
    btn.id = 'btnTrocarSenhaSidebar';
    btn.title = 'Trocar minha senha';
    btn.innerHTML = '<i class="ti ti-lock"></i> Trocar senha';
    btn.style.cssText = 'display:flex;align-items:center;gap:7px;width:calc(100% - 24px);margin:6px 12px;padding:8px 10px;background:transparent;border:1px solid var(--border-subtle);border-radius:8px;color:var(--text-secondary);font-size:12px;cursor:pointer;transition:all 0.15s;';
    btn.onmouseover = () => { btn.style.borderColor = 'var(--gold-border)'; btn.style.color = 'var(--gold)'; };
    btn.onmouseout = () => { btn.style.borderColor = 'var(--border-subtle)'; btn.style.color = 'var(--text-secondary)'; };
    btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); window.abrirTrocarSenha(); };

    // insere logo acima/depois da âncora do usuário
    ancora.parentNode.insertBefore(btn, ancora.nextSibling);
    return true;
  }

  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    garantirModal();
    const ok = injetarBotao();
    // observa mudanças (re-render do menu) pra reinjetar se sumir
    const obs = new MutationObserver(() => {
      if (!document.getElementById('btnTrocarSenhaSidebar')) {
        clearTimeout(window.__trocarSenhaTimer);
        window.__trocarSenhaTimer = setTimeout(injetarBotao, 300);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('✅ trocar-senha-fix.js carregado');
    return ok || true;
  }

  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
