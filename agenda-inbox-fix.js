// ============================================================
// CLINICALEAD — BOTÃO BALÃO DA AGENDA → INBOX INTERNO
// O ícone de balão (💬) nos itens da agenda abria o WhatsApp Web.
// Aqui redefinimos para abrir a conversa DENTRO do Inbox do CRM,
// já selecionando o chat daquele paciente (pelo telefone).
// ============================================================

// Abre o Inbox interno na conversa de um telefone
// ⚠️ REESCRITO 11/11/2026 — "clico no WhatsApp do lead e não acha a
// conversa / quando acha, vai pro primeiro da lista" (Follow-ups de JB)
// Problemas da versão anterior:
//  1) o Inbox só carrega as ~8000 mensagens mais RECENTES da clínica —
//     lead com conversa mais antiga (o caso típico de follow-up!) não
//     estava na lista e a busca desistia;
//  2) lead que nunca trocou mensagem não tinha conversa nenhuma pra abrir;
//  3) em clínica com 2 números (JB), o filtro de número podia ESCONDER a
//     conversa certa — e a tela continuava mostrando o topo da lista;
//  4) um segundo carregamento do Inbox (disparado pela troca de página)
//     chegava depois e redesenhava a lista por cima.
// Agora: carrega o Inbox, procura pelo final do telefone (8 dígitos); se
// não estiver na lista, busca o histórico DAQUELE telefone direto no banco;
// se não tiver histórico, cria a conversa vazia (pra mandar a 1ª msg);
// ajusta o filtro de número, abre, rola até ela e confere de novo depois.
async function abrirInboxConversa(telefone, nomeOpcional) {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.length < 8) { if (typeof toast === 'function') toast('Lead sem telefone válido cadastrado', 'error'); return; }
  const alvo = digitos.slice(-8);
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (!clinic) return;

  if (typeof showPage === 'function') showPage('inbox');
  if (typeof loadInboxChats === 'function') {
    try { await loadInboxChats(); } catch (e) { console.error('[abrirInboxConversa] recarregar:', e); }
  }
  if (typeof INBOX === 'undefined') return;
  if (!Array.isArray(INBOX.chats)) INBOX.chats = [];

  const daLista = () => INBOX.chats
    .filter(c => String(c.phone || '').replace(/\D/g, '').slice(-8) === alvo)
    .sort((a, b) => (b.time || 0) - (a.time || 0));

  let chat = daLista()[0];

  // não está entre as conversas carregadas → busca o histórico dele no banco
  if (!chat) {
    try {
      const { data: msgs } = await db.from('mensagens').select('*')
        .eq('clinic_id', clinic.id)
        .ilike('phone', `%${alvo}`)
        .order('created_at', { ascending: true })
        .limit(1000);
      const lead = (STATE.leads || []).find(l => String(l.telefone || '').replace(/\D/g, '').slice(-8) === alvo);
      const lista = msgs || [];
      const ultima = lista[lista.length - 1];
      const inst = (ultima && ultima.instance_name) || clinic.whatsapp_instance || 'sem_numero';
      let temVarios = false;
      try { temVarios = INBOX.chats.some(c => String(c.id || '').includes('|')); } catch (e) { }
      chat = {
        id: temVarios ? (alvo + '|' + inst) : alvo,
        phone: (ultima && String(ultima.phone || '').replace(/\D/g, '')) || digitos,
        instance_name: inst,
        name: (lead && lead.nome) || nomeOpcional || digitos,
        lastMsg: ultima ? ((typeof formatLastMsg === 'function') ? formatLastMsg(ultima) : (ultima.content || '')) : 'Nenhuma mensagem ainda',
        time: ultima ? new Date(ultima.created_at) : new Date(),
        unread: 0, lead, messages: lista,
      };
      INBOX.chats = INBOX.chats.filter(c => c.id !== chat.id);
      INBOX.chats.unshift(chat);
    } catch (e) {
      console.error('[abrirInboxConversa] buscar histórico:', e);
      if (typeof toast === 'function') toast('Não consegui buscar a conversa deste lead', 'error');
      return;
    }
  }

  const abrir = async () => {
    // garante que o filtro de número não esconda a conversa
    try {
      if (typeof INBOXNUM !== 'undefined' && INBOXNUM.ativa && INBOXNUM.ativa !== 'todos' &&
          chat.instance_name && INBOXNUM.ativa !== chat.instance_name && typeof selecionarNumeroInbox === 'function') {
        selecionarNumeroInbox('todos');
      }
    } catch (e) { }
    if (!INBOX.chats.some(c => c.id === chat.id)) { INBOX.chats.unshift(chat); }
    if (typeof renderInboxList === 'function') renderInboxList();
    if (typeof openChat === 'function') await openChat(chat.id);
    // rola a lista até a conversa
    try {
      const item = [...document.querySelectorAll('#inboxList .inbox-item')]
        .find(el => (el.getAttribute('onclick') || '').includes(`'${chat.id}'`));
      if (item) item.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) { }
  };

  await abrir();
  // se outro carregamento do Inbox redesenhar por cima, reabre a certa
  setTimeout(() => {
    try { if (!INBOX.activeChat || INBOX.activeChat.id !== chat.id || !INBOX.chats.some(c => c.id === chat.id)) abrir(); } catch (e) { }
  }, 1500);
}

// ── Substitui as funções antigas que abriam o WhatsApp Web ───
// O botão balão da agenda e os botões das tarefas chamam tarefaWhats().
// Redirecionamos todas para abrir o Inbox interno do CRM.
(function () {
  function aplicarOverride() {
    if (typeof window !== 'undefined') {
      window.tarefaWhats = function (telefone) { abrirInboxConversa(telefone); };
      window.abrirInboxConversa = abrirInboxConversa;
      window.irInbox = function (telefone) { abrirInboxConversa(telefone); };
      window.tarefaAbrirInbox = function (telefone) { abrirInboxConversa(telefone); };
    }
  }
  aplicarOverride();
  // Reaplica após carregamento de outros módulos (tarefas-fix pode redefinir tarefaWhats)
  setTimeout(aplicarOverride, 1500);
  setTimeout(aplicarOverride, 4000);
  console.log('✅ agenda-inbox-fix.js carregado — botão da agenda abre o Inbox interno');
})();
