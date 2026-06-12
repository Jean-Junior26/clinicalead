// ============================================================
// CLINICALEAD — CRONÔMETRO DE GRAVAÇÃO DE ÁUDIO (estilo WhatsApp)
// Enquanto grava: pontinho vermelho pulsando + 0:01, 0:02...
// Ao clicar pra enviar: ícone de carregando até concluir.
// Não altera nenhuma função original — só engata no botão.
// ============================================================

let _timerGravacao = null;
let _segGravacao = 0;

function _fmtSegundos(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}

function iniciarTimerGravacao() {
  const btn = document.getElementById('btnGravarAudio');
  if (!btn || _timerGravacao) return;
  _segGravacao = 0;
  btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">
    <span class="rec-dot-pulse"></span>
    <span id="recTimerSeg" style="font-size:12px;font-family:var(--mono,monospace);color:#E5484D;font-weight:700;">0:00</span>
  </span>`;
  btn.title = 'Clique para enviar';

  _timerGravacao = setInterval(() => {
    // se a gravação parou por qualquer motivo, encerra o cronômetro
    if (typeof isRecording !== 'undefined' && !isRecording) {
      pararTimerGravacao();
      return;
    }
    _segGravacao++;
    const el = document.getElementById('recTimerSeg');
    if (el) el.textContent = _fmtSegundos(_segGravacao);
  }, 1000);
}

function pararTimerGravacao() {
  if (_timerGravacao) {
    clearInterval(_timerGravacao);
    _timerGravacao = null;
  }
}

// ── CSS do pontinho vermelho pulsando ────────────────────────
(function () {
  const st = document.createElement('style');
  st.textContent = `
    .rec-dot-pulse {
      width: 10px; height: 10px; border-radius: 50%;
      background: #E5484D; display: inline-block;
      animation: recPulse 1s ease-in-out infinite;
    }
    @keyframes recPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.35; transform: scale(0.75); }
    }
  `;
  document.head.appendChild(st);
})();

// ── Engata no botão de gravar existente ──────────────────────
(function () {
  if (typeof toggleGravarAudio !== 'function') {
    console.error('[audio-timer] toggleGravarAudio não encontrado — carregue este arquivo depois do index.html');
    return;
  }
  const _toggleOriginal = toggleGravarAudio;

  toggleGravarAudio = async function () {
    const estavaGravando = !!_timerGravacao;

    if (estavaGravando) {
      // Clique para ENVIAR: para o cronômetro e mostra "enviando"
      pararTimerGravacao();
      const btn = document.getElementById('btnGravarAudio');
      if (btn) {
        btn.innerHTML = '<i class="ti ti-loader-2"></i>';
        btn.title = 'Enviando...';
      }
      await _toggleOriginal();
      return;
    }

    // Clique para GRAVAR: chama o original e espera o microfone ligar
    await _toggleOriginal();
    for (let i = 0; i < 20; i++) {
      if (typeof isRecording !== 'undefined' && isRecording) {
        iniciarTimerGravacao();
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }
  };
})();

console.log('✅ audio-timer-fix.js carregado — cronômetro de gravação ativo');
