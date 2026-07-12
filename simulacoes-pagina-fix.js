// ============================================================
// CLINICALEAD — Página "Simulações" (fora da conversa)
// Botão próprio no menu lateral, independente de qualquer conversa.
// A equipe faz upload de uma foto, escolhe 1+ procedimentos (pode
// combinar, ex: clareamento + preenchimento labial), gera a
// simulação, vê o resultado, e opcionalmente envia pra um número.
// ============================================================

(function () {
  'use strict';

  const TIPOS_SIMULACAO = [
    { valor: 'clareamento', label: '✨ Clareamento' },
    { valor: 'alinhamento', label: '📐 Alinhamento (dente torto)' },
    { valor: 'lentes', label: '🦷 Lentes em resina' },
    { valor: 'protese', label: '🦷 Prótese/Implante (preenche espaço)' },
    { valor: 'gengivoplastia', label: '💗 Gengivoplastia' },
    { valor: 'otomodelacao', label: '👂 Otomodelação (orelha)' },
    { valor: 'rinoplastia', label: '👃 Rinoplastia (nariz)' },
    { valor: 'harmonizacao_facial', label: '💆 Harmonização facial' },
    { valor: 'preenchimento_labial', label: '💋 Preenchimento labial' },
    { valor: 'toxina_botulinica', label: '💉 Toxina botulínica' },
  ];

  let fotoBase64Atual = null;

  window.abrirPaginaSimulacoes = function () {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;
    fotoBase64Atual = null;

    let modal = document.getElementById('modalSimulacoes');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalSimulacoes';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    modal.innerHTML = `<div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:16px;padding:26px;max-width:640px;width:100%;max-height:90vh;overflow:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <h2 style="margin:0;font-size:19px;">🖼️ Simulações de Transformação</h2>
        <button onclick="document.getElementById('modalSimulacoes').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:24px;cursor:pointer;">×</button>
      </div>
      <p style="font-size:12px;color:var(--text-muted,#888);margin-bottom:18px;">Sobe uma foto, escolhe 1 ou mais procedimentos (pode combinar), e gera a prévia visual.</p>

      <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;">1. Foto</label>
      <p style="font-size:11px;color:var(--text-muted,#888);margin:0 0 8px;">💡 Dica: lugar bem iluminado e rosto de frente, mais pertinho da câmera — dá um resultado bem melhor.</p>
      <input type="file" id="simFotoInput" accept="image/*" style="width:100%;margin-bottom:8px;color:var(--text-secondary,#C8C2AE);"/>
      <div id="simFotoPreview" style="margin-bottom:16px;"></div>

      <label style="display:block;font-size:12px;font-weight:600;margin-bottom:8px;">2. Procedimento(s) — pode marcar mais de um</label>
      <div id="simTiposGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px;">
        ${TIPOS_SIMULACAO.map(t => `
          <label style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--bg-base,#0A0A0B);border-radius:8px;border:1px solid var(--border-subtle,rgba(255,255,255,0.08));cursor:pointer;font-size:12px;">
            <input type="checkbox" class="simTipoCheck" value="${t.valor}"> ${t.label}
          </label>`).join('')}
      </div>

      <button id="simGerarBtn" onclick="gerarSimulacaoPagina()" style="width:100%;padding:12px;border-radius:10px;border:none;background:var(--gold,#C9A84C);color:#0A0A0B;font-weight:700;font-size:14px;cursor:pointer;">Gerar simulação</button>
      <div id="simStatusPagina" style="margin-top:10px;font-size:12px;text-align:center;color:var(--text-muted,#888);"></div>

      <div id="simResultadoArea" style="display:none;margin-top:18px;padding-top:18px;border-top:1px dashed var(--border-subtle,rgba(255,255,255,0.1));">
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:8px;">3. Resultado (antes/depois)</label>
        <canvas id="simResultadoCanvas" style="width:100%;border-radius:10px;margin-bottom:14px;"></canvas>
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;">Enviar pra um paciente (opcional)</label>
        <input type="text" id="simTelefoneInput" placeholder="Ex: 34 99999-9999" style="width:100%;padding:10px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);margin-bottom:10px;"/>
        <button id="simEnviarBtn" onclick="enviarSimulacaoPagina()" style="width:100%;padding:11px;border-radius:10px;border:1px solid var(--gold,#C9A84C);background:transparent;color:var(--gold,#C9A84C);font-weight:700;font-size:13px;cursor:pointer;">Enviar por WhatsApp</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    document.getElementById('simFotoInput').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        fotoBase64Atual = reader.result;
        document.getElementById('simFotoPreview').innerHTML = `<img src="${fotoBase64Atual}" style="max-width:140px;border-radius:8px;"/>`;
      };
      reader.readAsDataURL(file);
    };
  };

  // ── Monta uma montagem ANTES | DEPOIS lado a lado, com rótulos ──
  // Torna qualquer imperfeição da IA muito mais aceitável, porque a
  // pessoa vê exatamente o que mudou, comparando direto com a foto real.
  function montarAntesDepois(antesBase64, depoisUrl) {
    return new Promise((resolve) => {
      const canvas = document.getElementById('simResultadoCanvas');
      const ctx = canvas.getContext('2d');
      const imgAntes = new Image();
      const imgDepois = new Image();
      imgDepois.crossOrigin = 'anonymous';
      let carregadas = 0;
      const aoCarregar = () => {
        carregadas++;
        if (carregadas < 2) return;
        const alturaFinal = 500;
        const larguraAntes = (imgAntes.width / imgAntes.height) * alturaFinal;
        const larguraDepois = (imgDepois.width / imgDepois.height) * alturaFinal;
        canvas.width = larguraAntes + larguraDepois + 4;
        canvas.height = alturaFinal + 36;

        ctx.fillStyle = '#0A0A0B';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imgAntes, 0, 36, larguraAntes, alturaFinal);
        ctx.drawImage(imgDepois, larguraAntes + 4, 36, larguraDepois, alturaFinal);

        ctx.fillStyle = '#C9A84C';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ANTES', larguraAntes / 2, 26);
        ctx.fillText('DEPOIS (simulação)', larguraAntes + 4 + larguraDepois / 2, 26);
        resolve();
      };
      imgAntes.onload = aoCarregar;
      imgDepois.onload = aoCarregar;
      imgAntes.src = antesBase64;
      imgDepois.src = depoisUrl;
    });
  }

  // ── Helpers de imagem (Canvas) ──
  function carregarImagem(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function recortarRegiao(img, x, y, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, x, y, width, height, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  }

  async function colarDeVolta(fotoOriginalBase64, regiaoEditadaUrl, x, y, width, height) {
    const [imgOriginal, imgEditada] = await Promise.all([
      carregarImagem(fotoOriginalBase64), carregarImagem(regiaoEditadaUrl),
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = imgOriginal.naturalWidth;
    canvas.height = imgOriginal.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgOriginal, 0, 0);
    ctx.drawImage(imgEditada, x, y, width, height);
    return canvas.toDataURL('image/png');
  }

  window.gerarSimulacaoPagina = async function () {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    const tiposMarcados = Array.from(document.querySelectorAll('.simTipoCheck:checked')).map(c => c.value);
    const status = document.getElementById('simStatusPagina');
    const btn = document.getElementById('simGerarBtn');

    if (!fotoBase64Atual) { status.textContent = '⚠️ Escolha uma foto primeiro'; status.style.color = 'var(--coral,#C0624A)'; return; }
    if (!tiposMarcados.length) { status.textContent = '⚠️ Marque pelo menos 1 procedimento'; status.style.color = 'var(--coral,#C0624A)'; return; }

    btn.disabled = true;
    btn.textContent = 'Localizando região...';
    status.textContent = '';

    try {
      const imgOriginal = await carregarImagem(fotoBase64Atual);
      const largura = imgOriginal.naturalWidth;
      const altura = imgOriginal.naturalHeight;

      // 1) DESLIGADO (11/07): a IA de visão não é confiável o suficiente
      // pra coordenadas exatas de pixel — gerava recortes mal posicionados
      // e colados de forma visível/quebrada. Voltando pro modo "foto
      // inteira", que não é perfeito mas não quebra visualmente.
      // Pra reativar no futuro, precisaria de detecção facial de verdade
      // (tipo MediaPipe/face-landmarks), não um VLM genérico perguntando
      // coordenadas.
      let regiao = null;

      // 2) monta a imagem que vai pra edição: recorte da região (se achou) ou a foto inteira (fallback)
      const fotoParaEditar = regiao ? recortarRegiao(imgOriginal, regiao.x, regiao.y, regiao.width, regiao.height) : fotoBase64Atual;

      btn.textContent = 'Gerando... (até 30s)';
      const resp = await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'gerar_simulacao', clinic_id: clinic?.id, tipos: tiposMarcados, foto_base64: fotoParaEditar,
          largura: imgOriginal.naturalWidth, altura: imgOriginal.naturalHeight, // pra IA gerar no mesmo formato, evita efeito de zoom
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        // 3) se recortou, cola o resultado de volta na foto original; senão usa o resultado direto
        const fotoFinal = regiao
          ? await colarDeVolta(fotoBase64Atual, data.media_url, regiao.x, regiao.y, regiao.width, regiao.height)
          : data.media_url;
        await montarAntesDepois(fotoBase64Atual, fotoFinal);
        document.getElementById('simResultadoArea').style.display = 'block';
        document.getElementById('simResultadoArea').dataset.mediaUrl = fotoFinal;
        status.textContent = regiao ? '✅ Gerado com sucesso! (edição localizada)' : '✅ Gerado com sucesso!';
        status.style.color = 'var(--gold,#C9A84C)';
      } else {
        status.textContent = '❌ ' + (data.erro || 'Falha ao gerar');
        status.style.color = 'var(--coral,#C0624A)';
      }
    } catch (e) {
      status.textContent = '❌ Erro de conexão';
      status.style.color = 'var(--coral,#C0624A)';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Gerar simulação';
    }
  };

  window.enviarSimulacaoPagina = async function () {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    const telefone = (document.getElementById('simTelefoneInput').value || '').trim();
    const btn = document.getElementById('simEnviarBtn');
    if (!telefone) { if (typeof toast === 'function') toast('Digite um telefone', 'error'); return; }
    if (!clinic?.whatsapp_instance) { if (typeof toast === 'function') toast('Clínica sem WhatsApp conectado', 'error'); return; }

    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      // usa a montagem antes/depois que já está desenhada no canvas —
      // não gera de novo na IA, só sobe e manda
      const canvas = document.getElementById('simResultadoCanvas');
      const imagemBase64 = canvas.toDataURL('image/png');

      const resp = await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enviar_imagem_pronta', clinic_id: clinic.id, imagem_base64: imagemBase64,
          phone: telefone, instance_name: clinic.whatsapp_instance,
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        if (typeof toast === 'function') toast('Enviado! ✓', 'success');
      } else {
        if (typeof toast === 'function') toast(data.erro || 'Falha ao enviar', 'error');
      }
    } catch (e) {
      if (typeof toast === 'function') toast('Erro de conexão', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar por WhatsApp';
    }
  };

  function injetarBotaoMenu() {
    if (document.getElementById('navSimulacoes')) return;
    const ref = document.querySelector('.nav-item[data-page="automacoes"]')
             || document.querySelector('.nav-item[data-page="relatorios"]')
             || document.querySelector('.nav-item');
    if (!ref) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navSimulacoes';
    btn.innerHTML = '<i class="ti ti-photo-scan"></i> Simulações';
    btn.onclick = window.abrirPaginaSimulacoes;
    ref.parentNode.insertBefore(btn, ref.nextSibling);
  }

  setInterval(injetarBotaoMenu, 1200);

  console.log('✅ simulacoes-pagina-fix.js carregado — página dedicada de simulações');
})();
