// ============================================================
// CLINICALEAD — EXIBIR MÍDIA NO INBOX (áudio, figurinha, vídeo, doc)
// O webhook já baixa e salva tudo (media_url no storage). O inbox só
// renderiza texto/imagem; aqui completamos: depois que as bolhas
// (.msg-row em #chatMessages) são desenhadas, trocamos o placeholder
// ("🎵 Áudio" / "🖼️ Sticker"…) pela mídia real, casando com
// INBOX.activeChat.messages (por índice, com verificação por texto).
// Arquivo independente — só adicionar a tag. Não mexe no index.html.
// ============================================================

(function () {
  'use strict';

  const TIPOS = ['audio', 'sticker', 'image', 'video', 'document'];

  function midiaHTML(m) {
    const u = m.media_url;
    if (!u) return '';
    if (m.type === 'audio') {
      const player = `<audio controls preload="none" src="${u}" style="max-width:240px;height:42px;"></audio>`;
      // se o conteúdo é a TRANSCRIÇÃO de verdade (não o placeholder genérico),
      // mostra o texto como legenda abaixo do player — antes esse texto era
      // apagado e substituído só pelo player, escondendo o que a pessoa falou.
      const temTranscricao = m.content && m.content.trim() && m.content.trim() !== '🎵 Áudio';
      if (temTranscricao) {
        const textoEscapado = String(m.content).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<div>${player}<div style="margin-top:6px;font-size:13px;opacity:0.85;font-style:italic;">🎤 "${textoEscapado}"</div></div>`;
      }
      return player;
    }
    if (m.type === 'sticker') {
      return `<img src="${u}" alt="figurinha" loading="lazy" style="width:120px;height:120px;object-fit:contain;">`;
    }
    if (m.type === 'image') {
      return `<img src="${u}" alt="imagem" loading="lazy" style="max-width:240px;border-radius:8px;cursor:pointer;display:block;" onclick="window.open('${u}','_blank')">`;
    }
    if (m.type === 'video') {
      return `<video controls preload="none" src="${u}" style="max-width:260px;border-radius:8px;display:block;"></video>`;
    }
    if (m.type === 'document') {
      const nome = (m.content && m.content !== '📄 Documento') ? m.content : 'Baixar documento';
      return `<a href="${u}" target="_blank" rel="noopener" style="color:#5B8DB8;text-decoration:none;display:inline-flex;align-items:center;gap:6px;"><i class="ti ti-file-download"></i> ${nome}</a>`;
    }
    return '';
  }

  // acha o elemento "folha" que contém só o texto placeholder (pra não destruir o resto da bolha)
  function acharPlaceholder(row, texto) {
    const alvo = String(texto || '').trim();
    if (!alvo) return null;
    const els = row.querySelectorAll('*');
    for (const el of els) if (el.children.length === 0 && el.textContent.trim() === alvo) return el;
    for (const el of els) if (el.children.length === 0 && el.textContent.trim().includes(alvo)) return el;
    return null;
  }

  function injetar(row, m) {
    const html = midiaHTML(m);
    if (!html) return;
    const ph = acharPlaceholder(row, m.content);
    if (ph) {
      ph.innerHTML = html;
    } else {
      const d = document.createElement('div');
      d.style.marginTop = '4px';
      d.innerHTML = html;
      row.appendChild(d);
    }
    row.dataset.midiaDone = '1';
  }

  function processar() {
    const box = document.getElementById('chatMessages');
    if (!box) return;
    const INB = (typeof INBOX !== 'undefined') ? INBOX : null;
    const msgs = (INB && INB.activeChat && INB.activeChat.messages) ? INB.activeChat.messages : null;
    if (!msgs || !msgs.length) return;

    const rows = Array.from(box.querySelectorAll('.msg-row'));
    if (!rows.length) return;
    const mesmoTamanho = rows.length === msgs.length;

    msgs.forEach((m, i) => {
      if (!TIPOS.includes(m.type) || !m.media_url) return;

      // 1) tenta casar por índice (alinhamento direto bolha↔mensagem)
      let row = mesmoTamanho ? rows[i] : null;
      if (row && !row.textContent.includes(m.content || '')) row = null;
      // 2) fallback: acha uma bolha ainda não tratada que contenha o placeholder
      if (!row) row = rows.find(r => !r.dataset.midiaDone && (r.textContent || '').includes(m.content || ''));
      if (!row) return;

      // já tem mídia real renderizada (ex.: imagem que o inbox já mostra)? marca e segue
      if (row.querySelector('audio, video, img')) { row.dataset.midiaDone = '1'; return; }
      if (row.dataset.midiaDone) return;

      injetar(row, m);
    });
  }

  // roda periodicamente (barato: só age em bolhas de mídia ainda não tratadas)
  setInterval(processar, 700);

  // reforço imediato ao abrir uma conversa
  if (typeof openChat === 'function') {
    const _open = openChat;
    openChat = async function (...args) {
      const r = await _open.apply(this, args);
      setTimeout(processar, 150);
      setTimeout(processar, 600);
      return r;
    };
  }

  console.log('✅ inbox-midia-fix.js carregado — áudio/figurinha/vídeo/documento no inbox');
})();
