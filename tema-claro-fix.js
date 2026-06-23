// ============================================================
// CLINICALEAD — TEMA CLARO/ESCURO (chavinha sol/lua, por usuário)
// Padrão = escuro (não mexe no :root). Ao ligar o claro, sobrescreve
// as MESMAS variáveis com a versão clara (body.tema-claro).
// A preferência fica salva no navegador do usuário (localStorage).
// ============================================================

(function () {
  'use strict';

  const KEY = 'clinicalead_tema';

  // CSS do tema claro — redefine as variáveis e cobre alguns pontos de cor fixa
  const CSS = `
    body.tema-claro {
      --bg-base: #F4F2EC;
      --bg-surface: #FFFFFF;
      --bg-elevated: #F0EDE4;
      --bg-card: #FFFFFF;
      --bg-hover: #EDEAE0;
      --bg-input: #FFFFFF;
      --text-primary: #2A2722;
      --text-secondary: #6B6655;
      --text-muted: #9A9484;
      --gold-pale: rgba(201,168,76,0.14);
      --gold-border: rgba(201,168,76,0.35);
      --border: rgba(160,123,48,0.28);
      --border-subtle: rgba(0,0,0,0.08);
      --border-strong: rgba(160,123,48,0.5);
      --shadow-md: 0 8px 28px rgba(120,100,40,0.12), 0 0 0 1px rgba(201,168,76,0.18);
      --shadow-gold: 0 0 18px rgba(201,168,76,0.18);
      background: var(--bg-base);
      color: var(--text-primary);
    }
    /* botão da chavinha */
    #temaToggleBtn { background: transparent; border: 1px solid var(--border); color: var(--text-secondary);
      border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px;
      padding: 8px 12px; font-size: 13px; transition: all .15s; width: 100%; justify-content: flex-start; }
    #temaToggleBtn:hover { border-color: var(--gold-border); color: var(--gold); }
    #temaToggleBtn i { font-size: 17px; }
  `;

  function injetarCSS() {
    if (document.getElementById('tema-claro-css')) return;
    const st = document.createElement('style');
    st.id = 'tema-claro-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function aplicar(tema) {
    document.body.classList.toggle('tema-claro', tema === 'claro');
    atualizarBotao(tema);
  }

  function temaAtual() {
    try { return localStorage.getItem(KEY) || 'escuro'; } catch (e) { return 'escuro'; }
  }

  window.alternarTema = function () {
    const novo = temaAtual() === 'claro' ? 'escuro' : 'claro';
    try { localStorage.setItem(KEY, novo); } catch (e) {}
    aplicar(novo);
  };

  function atualizarBotao(tema) {
    const btn = document.getElementById('temaToggleBtn');
    if (!btn) return;
    btn.innerHTML = (tema === 'claro')
      ? '<i class="ti ti-moon"></i> Modo escuro'
      : '<i class="ti ti-sun"></i> Modo claro';
  }

  // injeta a chavinha perto do botão "Sair" (ou no fim da sidebar)
  function injetarBotao() {
    if (document.getElementById('temaToggleBtn')) return;
    // tenta achar o botão de sair pra colocar logo acima
    const sair = document.querySelector('[onclick*="logout"], [onclick*="sair"], #btnSair, .btn-sair');
    const btn = document.createElement('button');
    btn.id = 'temaToggleBtn';
    btn.type = 'button';
    btn.onclick = window.alternarTema;
    if (sair && sair.parentElement) {
      sair.parentElement.insertBefore(btn, sair);
    } else {
      // fallback: rodapé da sidebar
      const sidebar = document.querySelector('.sidebar, #sidebar, nav');
      if (!sidebar) return;
      btn.style.margin = '8px';
      sidebar.appendChild(btn);
    }
    atualizarBotao(temaAtual());
  }

  // aplica o tema salvo o quanto antes
  injetarCSS();
  aplicar(temaAtual());

  // injeta o botão quando a interface estiver pronta
  const iv = setInterval(injetarBotao, 700);
  setTimeout(() => clearInterval(iv), 20000);
  injetarBotao();

  console.log('✅ tema-claro-fix.js carregado — chavinha claro/escuro por usuário');
})();
