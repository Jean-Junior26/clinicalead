// ============================================================
// CLINICALEAD — BRIAN: chave por conversa (Trava 2)
// Coloca no topo da conversa um botão "Brian: Ativo/Desativado".
// Desativar = grava brian_conversa.auto_desligado = true → o motor
// autônomo (Fase 2.3) NÃO responde essa conversa, mesmo com a chave
// geral ligada (freio de emergência p/ casos críticos = só humano).
// Padrão: ativo (segue a regra geral). Carregar após os fixes do inbox.
// ============================================================

(function () {
  'use strict';

  let estado = {}; // cache em memória por phone: true = desligado

  async function carregarEstado(clinicId, phone) {
    try {
      const { data } = await db.from('brian_conversa')
        .select('auto_desligado').eq('clinic_id', clinicId).eq('phone', phone).maybeSingle();
      return !!(data && data.auto_desligado);
    } catch (e) { return false; }
  }

  async function toggle(clinicId, phone, btn) {
    const desligadoAtual = estado[phone] === true;
    const novoDesligado = !desligadoAtual; // inverte
    btn.disabled = true;
    try {
      const { error } = await db.from('brian_conversa').upsert({
        clinic_id: clinicId, phone, auto_desligado: novoDesligado
      }, { onConflict: 'clinic_id,phone' });
      if (error) throw error;
      estado[phone] = novoDesligado;
      pintar(btn, novoDesligado);
      if (typeof toast === 'function') toast(novoDesligado ? 'Brian desativado nesta conversa 🛑' : 'Brian ativo nesta conversa ✓');
    } catch (e) {
      if (typeof toast === 'function') toast('Erro: ' + (e.message || ''), 'error');
    } finally { btn.disabled = false; }
  }

  function pintar(btn, desligado) {
    if (desligado) {
      btn.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;padding:4px 9px;border-radius:7px;background:rgba(192,98,74,0.12);border:1px solid var(--coral,#C0624A);color:var(--coral,#C0624A);';
      btn.innerHTML = '<i class="ti ti-robot-off"></i> Brian desativado';
      btn.title = 'O Brian NÃO responde automaticamente nesta conversa. Clique para reativar.';
    } else {
      btn.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;padding:4px 9px;border-radius:7px;background:rgba(201,168,76,0.12);border:1px solid var(--gold-border,rgba(201,168,76,0.35));color:var(--gold,#C9A84C);';
      btn.innerHTML = '<i class="ti ti-robot"></i> Brian ativo';
      btn.title = 'O Brian pode responder automaticamente nesta conversa (Fase 2). Clique para desativar.';
    }
  }

  // acha o cabeçalho da conversa (onde fica o nome do paciente)
  function acharHeader() {
    // tenta seletores comuns do topo do chat
    return document.querySelector('.chat-header') ||
           document.querySelector('.inbox-chat-header') ||
           document.querySelector('#inboxChat .chat-top') ||
           null;
  }

  async function injetar() {
    const chat = (typeof INBOX !== 'undefined') ? INBOX.activeChat : null;
    if (!chat || !chat.phone) return;
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;

    let header = acharHeader();
    // fallback: coloca logo acima da área de mensagens, alinhado à direita
    if (!header) {
      const msgs = document.getElementById('chatMessages');
      if (!msgs || !msgs.parentNode) return;
      let barra = document.getElementById('brianConvBar');
      if (!barra) {
        barra = document.createElement('div');
        barra.id = 'brianConvBar';
        barra.style.cssText = 'display:flex;justify-content:flex-end;padding:6px 12px;';
        msgs.parentNode.insertBefore(barra, msgs);
      }
      header = barra;
    }

    // evita duplicar; recria se trocou de conversa
    let btn = document.getElementById('brianConvToggle');
    if (btn && btn.dataset.phone === String(chat.phone)) return;
    if (btn) btn.remove();

    btn = document.createElement('button');
    btn.id = 'brianConvToggle';
    btn.dataset.phone = String(chat.phone);
    const desligado = await carregarEstado(clinic.id, chat.phone);
    estado[chat.phone] = desligado;
    pintar(btn, desligado);
    btn.onclick = () => toggle(clinic.id, chat.phone, btn);

    // se for o header real, adiciona com uma margem; se for a barra, só append
    if (header.id === 'brianConvBar') header.appendChild(btn);
    else { btn.style.marginLeft = 'auto'; header.appendChild(btn); }
  }

  setInterval(injetar, 800);

  console.log('✅ brian-chave-conversa-fix.js carregado — chave do Brian por conversa');
})();
