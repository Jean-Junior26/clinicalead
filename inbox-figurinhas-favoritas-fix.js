// ============================================================
// CLINICALEAD — FIGURINHAS FAVORITAS (Etapa 2)
// • Mostra a figurinha recebida de verdade (imagem .webp)
// • Botão ⭐ pra favoritar
// • Painel de favoritas no inbox (reenvia com 1 clique)
// O reenvio baixa a figurinha (url->base64) e manda pelo
// send-media (reaproveita o backend de sticker que já funciona).
// ============================================================

let FIGS = { favoritas: [] };

// Carrega as figurinhas favoritas da clínica
async function carregarFigurinhas() {
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (!clinic) return [];
  try {
    const { data } = await db.from('figurinhas').select('*').eq('clinic_id', clinic.id).order('criado_em', { ascending: false });
    FIGS.favoritas = data || [];
  } catch (e) { FIGS.favoritas = []; }
  return FIGS.favoritas;
}

// Favorita uma figurinha (pela media_url)
async function favoritarFigurinha(mediaUrl) {
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (!clinic || !mediaUrl) return;
  // Evita duplicar
  await carregarFigurinhas();
  if (FIGS.favoritas.some(f => f.media_url === mediaUrl)) {
    if (typeof toast === 'function') toast('Essa figurinha já está nas favoritas ⭐');
    return;
  }
  const { error } = await db.from('figurinhas').insert({ clinic_id: clinic.id, media_url: mediaUrl });
  if (error) { if (typeof toast === 'function') toast('Erro ao favoritar: ' + error.message, 'error'); return; }
  if (typeof toast === 'function') toast('Figurinha favoritada! ⭐');
  await carregarFigurinhas();
}

async function removerFigurinha(id) {
  const { error } = await db.from('figurinhas').delete().eq('id', id);
  if (error) { if (typeof toast === 'function') toast('Erro: ' + error.message, 'error'); return; }
  if (typeof toast === 'function') toast('Figurinha removida');
  await carregarFigurinhas();
  renderPainelFigurinhas();
}

// Reenvia uma figurinha favorita (baixa a url -> base64 -> send-media)
async function enviarFigurinhaFavorita(mediaUrl) {
  if (typeof INBOX === 'undefined' || !INBOX.activeChat) { if (typeof toast === 'function') toast('Abra uma conversa primeiro', 'error'); return; }

  let instancia = null;
  if (typeof instanciaParaResponder === 'function') instancia = instanciaParaResponder(INBOX.activeChat);
  if (!instancia) {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    instancia = clinic?.whatsapp_instance || null;
  }
  if (!instancia) { if (typeof toast === 'function') toast('Conecte o WhatsApp primeiro!', 'error'); return; }

  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (typeof toast === 'function') toast('Enviando figurinha...');
  fecharPainelFigurinhas();

  try {
    // Baixa a figurinha e converte pra base64
    const resp = await fetch(mediaUrl);
    const blob = await resp.blob();
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onloadend = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });

    const envio = await fetch('/api/send-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instance: instancia,
        phone: INBOX.activeChat.phone,
        clinic_id: clinic?.id || null,
        base64,
        mimetype: 'image/webp',
        fileName: 'figurinha.webp',
      }),
    });
    if (!envio.ok) throw new Error('Falha no envio');
    if (typeof toast === 'function') toast('Figurinha enviada! ✓');
    if (typeof loadInboxChats === 'function') setTimeout(loadInboxChats, 800);
  } catch (e) {
    if (typeof toast === 'function') toast('Erro ao enviar figurinha', 'error');
  }
}

// ── Painel de figurinhas favoritas ───────────────────────────
async function abrirPainelFigurinhas() {
  await carregarFigurinhas();
  let painel = document.getElementById('painelFigurinhas');
  if (!painel) {
    painel = document.createElement('div');
    painel.id = 'painelFigurinhas';
    painel.style.cssText = 'position:fixed;bottom:90px;right:40px;width:300px;max-height:340px;overflow-y:auto;background:var(--bg-elevated);border:1px solid var(--gold-border);border-radius:14px;padding:14px;box-shadow:0 8px 32px rgba(0,0,0,.4);z-index:9999;';
    document.body.appendChild(painel);
  }
  renderPainelFigurinhas();
  painel.style.display = 'block';
}

function fecharPainelFigurinhas() {
  const p = document.getElementById('painelFigurinhas');
  if (p) p.style.display = 'none';
}

function renderPainelFigurinhas() {
  const painel = document.getElementById('painelFigurinhas');
  if (!painel) return;
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
    <strong style="font-size:13px;">⭐ Figurinhas favoritas</strong>
    <button class="btn btn-ghost btn-icon" onclick="fecharPainelFigurinhas()" style="padding:2px;"><i class="ti ti-x"></i></button>
  </div>`;

  // Botão de subir uma figurinha nova (.webp)
  html += `<label style="display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;background:var(--bg);border:1px dashed var(--gold-border);border-radius:8px;cursor:pointer;font-size:12px;color:var(--gold);margin-bottom:10px;">
    <i class="ti ti-upload"></i> Enviar figurinha do computador (.webp)
    <input type="file" accept="image/webp" style="display:none;" id="uploadFigInput"/>
  </label>`;

  if (!FIGS.favoritas.length) {
    html += '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:12px;">Nenhuma favorita ainda.<br>Receba uma figurinha e clique em ⭐ para salvar.</div>';
  } else {
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">';
    FIGS.favoritas.forEach(f => {
      html += `<div style="position:relative;">
        <img src="${f.media_url}" style="width:100%;aspect-ratio:1;object-fit:contain;background:var(--bg);border-radius:8px;cursor:pointer;padding:4px;" onclick="enviarFigurinhaFavorita('${f.media_url}')" title="Enviar"/>
        <button onclick="removerFigurinha('${f.id}')" style="position:absolute;top:-6px;right:-6px;background:var(--coral);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;line-height:1;">×</button>
      </div>`;
    });
    html += '</div>';
  }
  painel.innerHTML = html;

  // Liga o upload (usa a função enviarFigurinha da Etapa 1, se existir)
  const up = document.getElementById('uploadFigInput');
  if (up) up.addEventListener('change', function (ev) {
    fecharPainelFigurinhas();
    if (typeof enviarFigurinha === 'function') enviarFigurinha(ev);
  });
}

// ── Mostra a figurinha REAL + botão favoritar nas mensagens ──
// Intercepta renderMessages: após renderizar, troca o placeholder
// "😄 Figurinha" pela imagem real e adiciona o botão ⭐.
function processarStickersNaTela() {
  if (typeof INBOX === 'undefined' || !INBOX.activeChat) return;
  const stickers = (INBOX.activeChat.messages || []).filter(m => m.type === 'sticker');
  if (!stickers.length) return;

  // Para cada bolha de sticker na tela, casa com a mensagem (em ordem)
  const bolhas = Array.from(document.querySelectorAll('.msg-bubble')).filter(b => (b.textContent || '').includes('Figurinha') && !b.dataset.figFeita);
  // ordem das bolhas = ordem das mensagens sticker
  let idx = 0;
  bolhas.forEach(bubble => {
    const st = stickers[idx];
    idx++;
    if (!st || !st.media_url) return;
    bubble.dataset.figFeita = '1';
    bubble.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:4px;">
        <img src="${st.media_url}" style="width:120px;height:120px;object-fit:contain;border-radius:8px;"/>
        ${!st.from_me ? `<button class="btn btn-sm" style="font-size:11px;padding:2px 8px;" onclick="favoritarFigurinha('${st.media_url}')"><i class="ti ti-star"></i> Favoritar</button>` : ''}
      </div>`;
  });
}

// ── Liga o botão de figurinha pra abrir favoritas + injeta ⭐ ──
(function () {
  // Intercepta renderMessages pra processar os stickers após render
  function instalarRender() {
    if (typeof renderMessages !== 'function') return false;
    const _orig = renderMessages;
    renderMessages = function (...args) {
      _orig.apply(this, args);
      setTimeout(processarStickersNaTela, 50);
    };
    return true;
  }
  if (!instalarRender()) {
    const iv = setInterval(() => { if (instalarRender()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }

  // Faz o botão de figurinha abrir as favoritas
  function ajustarBotaoFigurinha() {
    document.querySelectorAll('.btn-figurinha').forEach(label => {
      if (label.dataset.favLigado) return;
      label.dataset.favLigado = '1';
      label.addEventListener('click', function (ev) {
        ev.preventDefault();
        abrirPainelFigurinhas();
      }, true);
    });
  }
  setInterval(ajustarBotaoFigurinha, 2000);
  setTimeout(ajustarBotaoFigurinha, 1000);

  console.log('✅ inbox-figurinhas-favoritas-fix.js carregado (Etapa 2)');
})();
