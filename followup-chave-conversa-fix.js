// ============================================================
// CLINICALEAD — FOLLOW-UP: chave por conversa
// Botão no topo da conversa (do lado da chave do Brian) que liga/desliga
// o follow-up daquela conversa. Bloqueado = lead encerrado, o motor
// (disparar-automacoes) não manda mais follow-up pra esse telefone.
// Padrão: ligado. Carregar após brian-chave-conversa-fix.js.
// ============================================================

(function () {
  'use strict';

  let estado = {}; // cache por phone: true = bloqueado

  async function carregar(clinicId, phone) {
    try {
      const { data } = await db.from('followup_conversa')
        .select('bloqueado').eq('clinic_id', clinicId).eq('phone', phone).maybeSingle();
      return !!(data && data.bloqueado);
    } catch (e) { return false; }
  }

  async function toggle(clinicId, phone, btn) {
    const bloqueadoAtual = estado[phone] === true;
    const novo = !bloqueadoAtual;
    btn.disabled = true;
    try {
      const { error } = await db.from('followup_conversa').upsert({
        clinic_id: clinicId, phone, bloqueado: novo, atualizado_em: new Date().toISOString()
      }, { onConflict: 'clinic_id,phone' });
      if (error) throw error;
      estado[phone] = novo;
      pintar(btn, novo);
      if (typeof toast === 'function') toast(novo ? 'Follow-up desligado nesta conversa 🔕' : 'Follow-up ativo nesta conversa ✓');
    } catch (e) {
      if (typeof toast === 'function') toast('Erro: ' + (e.message || ''), 'error');
    } finally { btn.disabled = false; }
  }

  function pintar(btn, bloqueado) {
    if (bloqueado) {
      btn.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;padding:4px 9px;border-radius:7px;background:rgba(192,98,74,0.12);border:1px solid var(--coral,#C0624A);color:var(--coral,#C0624A);margin-left:6px;';
      btn.innerHTML = '<i class="ti ti-bell-off"></i> Follow-up off';
      btn.title = 'O follow-up automático NÃO será enviado para esta conversa. Clique para reativar.';
    } else {
      btn.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;padding:4px 9px;border-radius:7px;background:rgba(91,141,184,0.12);border:1px solid var(--blue,#5B8DB8);color:var(--blue,#5B8DB8);margin-left:6px;';
      btn.innerHTML = '<i class="ti ti-bell-ringing"></i> Follow-up on';
      btn.title = 'O follow-up automático está ativo para esta conversa. Clique para desligar (lead encerrado).';
    }
  }

  function acharHeader() {
    return document.querySelector('.chat-header') ||
           document.querySelector('.inbox-chat-header') ||
           document.querySelector('#inboxChat .chat-top') ||
           document.getElementById('brianConvBar') || // a barra que a chave do Brian cria
           null;
  }

  async function injetar() {
    const chat = (typeof INBOX !== 'undefined') ? INBOX.activeChat : null;
    if (!chat || !chat.phone) return;
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;

    let header = acharHeader();
    if (!header) {
      const msgs = document.getElementById('chatMessages');
      if (!msgs || !msgs.parentNode) return;
      let barra = document.getElementById('brianConvBar');
      if (!barra) {
        barra = document.createElement('div');
        barra.id = 'brianConvBar';
        barra.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;padding:6px 12px;';
        msgs.parentNode.insertBefore(barra, msgs);
      }
      header = barra;
    }

    let btn = document.getElementById('followupConvToggle');
    if (btn && btn.dataset.phone === String(chat.phone)) return;
    if (btn) btn.remove();

    btn = document.createElement('button');
    btn.id = 'followupConvToggle';
    btn.dataset.phone = String(chat.phone);
    const bloqueado = await carregar(clinic.id, chat.phone);
    estado[chat.phone] = bloqueado;
    pintar(btn, bloqueado);
    btn.onclick = () => toggle(clinic.id, chat.phone, btn);

    // tenta colocar logo após a chave do Brian, se existir
    const btnBrian = document.getElementById('brianConvToggle');
    if (btnBrian && btnBrian.parentNode) {
      btnBrian.parentNode.insertBefore(btn, btnBrian.nextSibling);
    } else {
      if (header.id !== 'brianConvBar') btn.style.marginLeft = 'auto';
      header.appendChild(btn);
    }
  }

  setInterval(injetar, 800);

  console.log('✅ followup-chave-conversa-fix.js carregado — chave de follow-up por conversa');
})();
