// ============================================================
// CLINICALEAD — SELETOR DE EMOJIS DO INBOX
// Botão 😊 ao lado do clipe: abre painel de emojis e insere
// no campo de mensagem, na posição do cursor.
// ============================================================

const EMOJIS_INBOX = [
  // Carinhas felizes
  '😀','😁','😄','😊','🙂','😉','😍','🥰','😘','😎','🤗','😇',
  // Risadas
  '😂','🤣','😅','😜','🤭','😋',
  // Neutras / pensativas
  '🤔','😐','😬','🙄','😮','😴',
  // Tristes / preocupadas
  '😢','😭','😞','😔','😟','🥺',
  // Saúde
  '😷','🤒','🤕','💉','🦷','✨',
  // Mãos e gestos
  '👍','👎','👏','🙏','🤝','💪','👋','🤞','✌️','👌',
  // Corações
  '❤️','💙','💚','💛','🧡','💜','🤍','💖',
  // Úteis no atendimento
  '✅','❌','⚠️','📅','⏰','📍','💬','📞','🎉','🎂','🌟','☀️'
];

// ── Cria o painel (uma vez só) ───────────────────────────────
function garantirEmojiPicker() {
  if (document.getElementById('emojiPickerInbox')) return;

  // CSS injetado
  const style = document.createElement('style');
  style.textContent = `
    .emoji-picker-inbox {
      position: fixed;
      display: none;
      grid-template-columns: repeat(8, 1fr);
      gap: 2px;
      width: 296px;
      max-height: 236px;
      overflow-y: auto;
      padding: 10px;
      background: var(--bg-card, #1A1B1E);
      border: 1px solid var(--border, #333);
      border-radius: 12px;
      box-shadow: 0 8px 28px rgba(0,0,0,0.55);
      z-index: 9999;
    }
    .emoji-picker-inbox.open { display: grid; }
    .emoji-picker-inbox button {
      background: none;
      border: none;
      font-size: 20px;
      line-height: 1;
      padding: 5px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.1s, transform 0.1s;
    }
    .emoji-picker-inbox button:hover {
      background: rgba(201,168,76,0.15);
      transform: scale(1.2);
    }
  `;
  document.head.appendChild(style);

  // Painel
  const picker = document.createElement('div');
  picker.id = 'emojiPickerInbox';
  picker.className = 'emoji-picker-inbox';
  picker.innerHTML = EMOJIS_INBOX
    .map(e => `<button type="button" onclick="inserirEmojiInbox('${e}')">${e}</button>`)
    .join('');
  document.body.appendChild(picker);

  // Fecha ao clicar fora
  document.addEventListener('click', (ev) => {
    const p = document.getElementById('emojiPickerInbox');
    if (p && p.classList.contains('open') && !p.contains(ev.target)) {
      p.classList.remove('open');
    }
  });
}

// ── Abre/fecha o painel posicionado acima do botão ───────────
function toggleEmojiPicker(ev) {
  ev.stopPropagation();
  garantirEmojiPicker();
  const picker = document.getElementById('emojiPickerInbox');

  if (picker.classList.contains('open')) {
    picker.classList.remove('open');
    return;
  }

  const btn = ev.currentTarget || ev.target;
  const rect = btn.getBoundingClientRect();

  picker.classList.add('open');
  // Posiciona acima do botão, alinhado à direita dele
  const pickerLargura = 296;
  let left = rect.right - pickerLargura;
  if (left < 8) left = 8;
  picker.style.left = left + 'px';
  picker.style.top = Math.max(8, rect.top - picker.offsetHeight - 8) + 'px';
}

// ── Insere o emoji na posição do cursor ──────────────────────
function inserirEmojiInbox(emoji) {
  const input = document.getElementById('chatInput');
  if (!input) return;
  const inicio = input.selectionStart ?? input.value.length;
  const fim = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, inicio) + emoji + input.value.slice(fim);
  input.focus();
  const pos = inicio + emoji.length;
  input.setSelectionRange(pos, pos);
  if (typeof autoResizeInput === 'function') autoResizeInput(input);
}

console.log('✅ emoji-fix.js carregado — seletor de emojis do Inbox ativo');
