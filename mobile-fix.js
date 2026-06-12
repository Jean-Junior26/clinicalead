// ============================================================
// CLINICALEAD — RESPONSIVIDADE MOBILE (Fase 1)
// - Menu lateral vira gaveta (hambúrguer ☰ na topbar)
// - Inbox em tela única: lista ↔ conversa (botão voltar)
// - Grids viram coluna única, tabelas com rolagem horizontal
// - Modais ajustados à tela do celular
// Tudo só ativa em telas até 768px — desktop fica intacto.
// ============================================================

(function () {

  // ── CSS MOBILE (injetado) ──────────────────────────────────
  const css = `
  /* Botão hambúrguer: invisível no desktop */
  #btnMenuMobile { display: none; }
  #mobileOverlay { display: none; }
  #btnVoltarInbox { display: none; }

  @media (max-width: 768px) {

    /* ── Sidebar vira gaveta ── */
    .sidebar {
      position: fixed !important;
      top: 0; left: 0; bottom: 0;
      z-index: 1200;
      transform: translateX(-105%);
      transition: transform 0.25s ease;
      box-shadow: 4px 0 24px rgba(0,0,0,0.5);
    }
    .sidebar.mobile-open { transform: translateX(0); }

    #mobileOverlay {
      display: block;
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.55);
      z-index: 1100;
      opacity: 0; pointer-events: none;
      transition: opacity 0.25s ease;
    }
    #mobileOverlay.open { opacity: 1; pointer-events: auto; }

    #btnMenuMobile {
      display: inline-flex !important;
      align-items: center; justify-content: center;
      width: 38px; height: 38px;
      background: none; border: 1px solid var(--border, #333);
      border-radius: 10px; color: var(--gold, #C9A84C);
      font-size: 20px; cursor: pointer; margin-right: 10px;
      flex-shrink: 0;
    }

    /* ── Conteúdo ocupa a tela toda ── */
    .main { width: 100vw; }
    .page { padding: 14px !important; }
    .topbar { padding: 0 14px; }

    /* ── Cabeçalhos de página empilham ── */
    .page-header { flex-direction: column; align-items: flex-start; gap: 10px; }
    .page-header-actions { flex-wrap: wrap; gap: 8px; width: 100%; }

    /* ── Grids viram coluna única ── */
    .metrics-grid { grid-template-columns: 1fr 1fr !important; }
    #page-relatorios div[style*="grid-template-columns"],
    #page-dashboard div[style*="grid-template-columns"] {
      grid-template-columns: 1fr !important;
    }

    /* ── Tabelas com rolagem horizontal ── */
    .card table { display: block; overflow-x: auto; }
    #page-clinicas table, #page-leads table { display: block; overflow-x: auto; }

    /* ── Kanban com rolagem horizontal ── */
    #page-kanban > div, #page-funil > div, .kanban-board {
      overflow-x: auto; -webkit-overflow-scrolling: touch;
    }

    /* ── Agenda: calendário em cima, consultas embaixo ── */
    .agenda-layout { grid-template-columns: 1fr !important; }

    /* ── Kanban: uma etapa por tela com efeito de imã (deslize lateral) ── */
    .kanban-board {
      display: flex !important;
      gap: 12px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 12px;
    }
    .kanban-col {
      min-width: 85vw;
      flex: 0 0 85vw;
      scroll-snap-align: center;
    }

    /* ── Modais cabem na tela ── */
    .modal { max-width: 94vw !important; width: 94vw; max-height: 88vh; overflow-y: auto; }

    /* ── Inbox em tela única ── */
    .inbox-layout { display: block !important; height: 100%; }
    .inbox-sidebar { width: 100% !important; max-width: none !important; height: 100%; border-right: none !important; }
    .inbox-chat { display: none !important; }

    body.chat-aberto-mobile .inbox-sidebar { display: none !important; }
    body.chat-aberto-mobile .inbox-chat { display: flex !important; height: 100%; }

    body.chat-aberto-mobile #btnVoltarInbox {
      display: inline-flex !important;
      align-items: center; justify-content: center;
      position: fixed; top: 70px; left: 10px;
      width: 38px; height: 38px;
      background: var(--bg-card, #1A1B1E);
      border: 1px solid var(--gold-border, #5a4a1e);
      border-radius: 50%; color: var(--gold, #C9A84C);
      font-size: 18px; z-index: 500; cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }

    /* ── Toques mais confortáveis ── */
    .btn-sm { padding: 7px 10px; }
    .sched-acts { flex-wrap: wrap; }
  }
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  // ── ELEMENTOS: hambúrguer, overlay e botão voltar ──────────
  function montarElementosMobile() {
    // Hambúrguer na topbar
    const topbar = document.querySelector('.topbar');
    if (topbar && !document.getElementById('btnMenuMobile')) {
      const btn = document.createElement('button');
      btn.id = 'btnMenuMobile';
      btn.innerHTML = '<i class="ti ti-menu-2"></i>';
      btn.onclick = toggleMenuMobile;
      topbar.insertBefore(btn, topbar.firstChild);
    }

    // Overlay escuro
    if (!document.getElementById('mobileOverlay')) {
      const ov = document.createElement('div');
      ov.id = 'mobileOverlay';
      ov.onclick = fecharMenuMobile;
      document.body.appendChild(ov);
    }

    // Botão voltar do Inbox
    if (!document.getElementById('btnVoltarInbox')) {
      const vb = document.createElement('button');
      vb.id = 'btnVoltarInbox';
      vb.innerHTML = '<i class="ti ti-arrow-left"></i>';
      vb.title = 'Voltar para as conversas';
      vb.onclick = () => document.body.classList.remove('chat-aberto-mobile');
      document.body.appendChild(vb);
    }

    // Fecha a gaveta ao clicar em qualquer item do menu
    document.querySelectorAll('.sidebar [data-page]').forEach(item => {
      item.addEventListener('click', fecharMenuMobile);
    });
  }

  function toggleMenuMobile() {
    const sb = document.querySelector('.sidebar');
    const ov = document.getElementById('mobileOverlay');
    if (!sb) return;
    const abrir = !sb.classList.contains('mobile-open');
    sb.classList.toggle('mobile-open', abrir);
    if (ov) ov.classList.toggle('open', abrir);
  }

  function fecharMenuMobile() {
    const sb = document.querySelector('.sidebar');
    const ov = document.getElementById('mobileOverlay');
    if (sb) sb.classList.remove('mobile-open');
    if (ov) ov.classList.remove('open');
  }

  // ── INBOX: abre a conversa em tela cheia no celular ────────
  if (typeof openChat === 'function') {
    const _openChatOriginal = openChat;
    openChat = async function (chatId) {
      await _openChatOriginal(chatId);
      if (window.innerWidth <= 768) {
        document.body.classList.add('chat-aberto-mobile');
      }
    };
  }

  // Ao trocar de página, garante que sai do modo conversa
  if (typeof showPage === 'function') {
    const _showPageOriginal = showPage;
    showPage = function (page, el) {
      if (page !== 'inbox') document.body.classList.remove('chat-aberto-mobile');
      return _showPageOriginal(page, el);
    };
  }

  // Monta os elementos quando o app estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montarElementosMobile);
  } else {
    montarElementosMobile();
  }
  // Garante de novo após o login (a topbar pode renderizar depois)
  setTimeout(montarElementosMobile, 2500);

  console.log('✅ mobile-fix.js carregado — modo celular ativo');
})();
