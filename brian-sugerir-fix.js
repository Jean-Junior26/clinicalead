// ============================================================
// CLINICALEAD — BRIAN: botão "Sugerir resposta" no inbox (Fase 1)
// Coloca um botão ✨ na barra de digitação. Ao clicar, chama a Edge
// Function "brian", que lê a conversa + contexto da clínica e devolve
// uma SUGESTÃO de resposta — preenchida no campo (#chatInput) para
// você revisar e enviar. NADA é enviado automaticamente.
// ============================================================

(function () {
  'use strict';

  async function sugerir(btn) {
    const chat = (typeof INBOX !== 'undefined') ? INBOX.activeChat : null;
    if (!chat || !chat.phone) { if (typeof toast === 'function') toast('Abra uma conversa primeiro', 'error'); return; }
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) { if (typeof toast === 'function') toast('Selecione uma clínica', 'error'); return; }

    const input = document.getElementById('chatInput');
    const icone = btn.querySelector('i');
    const classeOrig = icone ? icone.className : '';
    if (icone) icone.className = 'ti ti-loader-2';
    btn.style.opacity = '0.6';
    btn.disabled = true;

    try {
      const { data, error } = await db.functions.invoke('brian', {
        body: { action: 'sugerir', clinic_id: clinic.id, phone: chat.phone }
      });
      if (error) throw error;
      if (data && data.ok && data.sugestao) {
        if (input) {
          input.value = data.sugestao;
          input.focus();
          if (typeof autoResizeInput === 'function') autoResizeInput(input);
          input.dispatchEvent(new Event('input'));
        }
        if (typeof toast === 'function') toast('Sugestão do Brian pronta — revise e envie ✨');
      } else {
        const msg = (data && data.erro) ? data.erro : 'Não consegui gerar a sugestão agora.';
        if (typeof toast === 'function') toast(msg, 'error');
      }
    } catch (e) {
      console.error('[brian sugerir]', e);
      if (typeof toast === 'function') toast('Erro ao falar com o Brian: ' + (e.message || ''), 'error');
    } finally {
      if (icone) icone.className = classeOrig || 'ti ti-sparkles';
      btn.style.opacity = '1';
      btn.disabled = false;
    }
  }
  window.brianSugerir = sugerir;

  // injeta o botão na barra de digitação (uma vez)
  function injetar() {
    const barra = document.querySelector('.chat-input-btns');
    if (!barra || document.getElementById('btnBrianSugerir')) return;
    const b = document.createElement('button');
    b.id = 'btnBrianSugerir';
    b.className = 'chat-input-btn';
    b.title = 'Sugerir resposta com o Brian (IA)';
    b.style.cssText = 'color:var(--gold,#C9A84C);';
    b.innerHTML = '<i class="ti ti-sparkles"></i>';
    b.onclick = function () { brianSugerir(b); };
    barra.insertBefore(b, barra.firstChild);
  }

  setInterval(injetar, 800);

  console.log('✅ brian-sugerir-fix.js carregado — botão Sugerir (Brian) no inbox');
})();
