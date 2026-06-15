// ============================================================
// CLINICALEAD — INBOX COM SELETOR DE NÚMERO (Fatia 1 final)
// Adiciona um seletor no topo do inbox (Principal / Comercial...)
// e filtra as conversas pelo número escolhido. O envio usa o
// número selecionado. Depende da coluna mensagens.instance_name
// e da tabela 'instancias'.
// ============================================================

let INBOXNUM = { lista: [], ativa: 'todos' };

// Carrega os números da clínica (principal + extras)
async function carregarNumerosInbox() {
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (!clinic) return [];
  const lista = [];
  if (clinic.whatsapp_instance) {
    lista.push({ instance_name: clinic.whatsapp_instance, nome: 'Principal', principal: true });
  }
  try {
    const { data } = await db.from('instancias').select('*').eq('clinic_id', clinic.id).order('criado_em');
    (data || []).forEach(i => lista.push({ instance_name: i.instance_name, nome: i.nome_exibicao, principal: false }));
  } catch (e) {}
  INBOXNUM.lista = lista;
  return lista;
}

// Renderiza o seletor de número no topo do inbox
async function renderSeletorNumero() {
  const lista = await carregarNumerosInbox();
  // Só mostra o seletor se houver MAIS DE UM número (senão não faz sentido)
  if (lista.length < 2) return;

  const sidebar = document.querySelector('.inbox-sidebar');
  if (!sidebar) return;
  let cont = document.getElementById('inboxSeletorNumero');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'inboxSeletorNumero';
    cont.style.cssText = 'display:flex;gap:6px;padding:10px 12px;flex-wrap:wrap;border-bottom:1px solid var(--gold-border);';
    sidebar.insertBefore(cont, sidebar.firstChild);
  }

  const botoes = [{ instance_name: 'todos', nome: 'Todos' }, ...lista];
  cont.innerHTML = botoes.map(b => {
    const ativo = INBOXNUM.ativa === b.instance_name;
    return `<button class="btn btn-sm" style="${ativo ? 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);font-weight:600;' : ''}"
      onclick="selecionarNumeroInbox('${b.instance_name}')">
      ${b.principal === false && b.instance_name !== 'todos' ? '<i class="ti ti-brand-whatsapp" style="color:#25D366;"></i> ' : ''}${b.nome}
    </button>`;
  }).join('');
}

function selecionarNumeroInbox(instanceName) {
  INBOXNUM.ativa = instanceName;
  renderSeletorNumero();
  if (typeof renderInboxList === 'function') renderInboxList();
}

// Descobre qual número (instance_name) usar para responder uma conversa.
// Usa a instância da última mensagem recebida; se não houver, usa a ativa
// no seletor; se ainda assim nada, cai no whatsapp_instance principal.
function instanciaParaResponder(chat) {
  // 1) última mensagem recebida (from_me false) com instance_name
  if (chat?.messages?.length) {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i];
      if (!m.from_me && m.instance_name) return m.instance_name;
    }
    // ou qualquer mensagem com instance_name
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].instance_name) return chat.messages[i].instance_name;
    }
  }
  // 2) número ativo no seletor (se não for "todos")
  if (INBOXNUM.ativa && INBOXNUM.ativa !== 'todos') return INBOXNUM.ativa;
  // 3) principal
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  return clinic?.whatsapp_instance || null;
}

// Helper: a conversa pertence ao número selecionado?
function chatPertenceNumero(chat) {
  if (INBOXNUM.ativa === 'todos') return true;
  // Verifica se alguma mensagem do chat é da instância ativa
  if (chat.messages && chat.messages.length) {
    return chat.messages.some(m => m.instance_name === INBOXNUM.ativa);
  }
  return chat.instance_name === INBOXNUM.ativa;
}

// ── Intercepta renderInboxList pra filtrar pelo número ───────
(function () {
  function instalar() {
    if (typeof renderInboxList !== 'function' || typeof loadInboxChats !== 'function') return false;

    // Filtra a lista renderizada pelo número ativo
    const _origRender = renderInboxList;
    renderInboxList = function (...args) {
      _origRender.apply(this, args);
      if (INBOXNUM.ativa !== 'todos') {
        // Esconde os chats que não são da instância ativa
        document.querySelectorAll('#inboxList .inbox-item').forEach(item => {
          const onclick = item.getAttribute('onclick') || '';
          const m = onclick.match(/openChat\('([^']+)'\)/);
          if (!m) return;
          const chat = (INBOX.chats || []).find(c => c.id === m[1]);
          if (chat && !chatPertenceNumero(chat)) item.style.display = 'none';
          else item.style.display = '';
        });
      } else {
        document.querySelectorAll('#inboxList .inbox-item').forEach(item => { item.style.display = ''; });
      }
    };

    // Renderiza o seletor quando carrega os chats
    const _origLoad = loadInboxChats;
    loadInboxChats = async function (...args) {
      const r = await _origLoad.apply(this, args);
      setTimeout(renderSeletorNumero, 100);
      return r;
    };

    console.log('✅ inbox-numeros-fix.js carregado (seletor de número)');
    return true;
  }
  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }

  // Renderiza o seletor ao abrir o inbox
  if (typeof showPage === 'function') {
    const _origShow = showPage;
    showPage = function (id, el) {
      _origShow(id, el);
      if (id === 'inbox') setTimeout(renderSeletorNumero, 400);
    };
  }

  // ── Envio pelo número correto da conversa ──────────────────
  // Re-sobrescreve sendChatMessage para enviar pela instância de
  // onde a conversa veio (não sempre a principal).
  function instalarEnvio() {
    if (typeof sendChatMessage !== 'function') return false;
    sendChatMessage = async function () {
      const input = document.getElementById('chatInput');
      const text = input?.value?.trim();
      if (!text || typeof INBOX === 'undefined' || !INBOX.activeChat) return;
      const instancia = instanciaParaResponder(INBOX.activeChat);
      if (!instancia) {
        if (typeof toast === 'function') toast('Conecte o WhatsApp desta clínica primeiro', 'error');
        return;
      }
      input.value = '';
      if (typeof autoResizeInput === 'function') autoResizeInput(input);
      try {
        await sendWhatsAppMessage(instancia, INBOX.activeChat.phone, text);
        INBOX.activeChat.lastMsg = text;
        if (typeof renderInboxList === 'function') renderInboxList();
      } catch (e) {
        if (typeof toast === 'function') toast('Erro ao enviar pelo WhatsApp', 'error');
        input.value = text;
        if (typeof autoResizeInput === 'function') autoResizeInput(input);
      }
    };
    return true;
  }
  if (!instalarEnvio()) {
    const iv2 = setInterval(() => { if (instalarEnvio()) clearInterval(iv2); }, 600);
    setTimeout(() => clearInterval(iv2), 16000);
  }
})();
