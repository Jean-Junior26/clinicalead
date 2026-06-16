// ============================================================
// CLINICALEAD — BOTÃO "SAIR" GARANTIDO (todos os usuários)
// O botão de logout do rodapé não aparecia para alguns usuários.
// Este fix adiciona um botão "Sair" explícito e bem visível no
// rodapé do menu lateral, que sempre funciona. Reaproveita
// doLogout() do sistema.
// ============================================================

(function () {
  'use strict';

  function sair() {
    if (typeof doLogout === 'function') {
      doLogout();
    } else if (typeof db !== 'undefined' && db.auth) {
      // fallback: logout direto + recarrega
      db.auth.signOut().finally(() => { window.location.reload(); });
    }
  }
  window.sairDoSistema = sair;

  function injetarBotaoSair() {
    if (typeof STATE === 'undefined') return false;
    if (document.getElementById('btnSairGarantido')) return true; // já existe

    // acha o rodapé do menu (sidebar-footer) ou o user-card
    const footer = document.querySelector('.sidebar-footer')
      || document.querySelector('.user-card')?.parentElement;
    if (!footer) return false;

    const btn = document.createElement('button');
    btn.id = 'btnSairGarantido';
    btn.innerHTML = '<i class="ti ti-logout"></i> Sair';
    btn.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:center', 'gap:8px',
      'width:calc(100% - 24px)', 'margin:8px 12px 12px', 'padding:10px',
      'background:transparent', 'border:1px solid var(--border-subtle,#2a2a2a)',
      'border-radius:8px', 'color:var(--text-secondary,#aaa)', 'font-size:13px',
      'font-weight:500', 'cursor:pointer', 'transition:all 0.15s',
    ].join(';');
    btn.onmouseover = () => {
      btn.style.borderColor = 'var(--coral,#E57373)';
      btn.style.color = 'var(--coral,#E57373)';
    };
    btn.onmouseout = () => {
      btn.style.borderColor = 'var(--border-subtle,#2a2a2a)';
      btn.style.color = 'var(--text-secondary,#aaa)';
    };
    btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); sair(); };

    footer.appendChild(btn);
    return true;
  }

  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    injetarBotaoSair();
    // martelo: garante injetar mesmo que o menu renderize depois
    let n = 0;
    const iv = setInterval(() => {
      injetarBotaoSair();
      if (++n > 40) clearInterval(iv); // ~20s
    }, 500);
    // observa re-render
    const obs = new MutationObserver(() => {
      if (!document.getElementById('btnSairGarantido')) {
        clearTimeout(window.__sairTimer);
        window.__sairTimer = setTimeout(injetarBotaoSair, 300);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('✅ botao-sair-fix.js carregado');
    return true;
  }

  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
