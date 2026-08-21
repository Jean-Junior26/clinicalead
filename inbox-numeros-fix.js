// ============================================================
// CLINICALEAD — INBOX COM SELETOR DE NÚMERO (Fatia 1 final)
// Adiciona um seletor no topo do inbox (Principal / Comercial...)
// e filtra as conversas pelo número escolhido. O envio usa o
// número selecionado. Depende da coluna mensagens.instance_name
// e da tabela 'instancias'.
// ============================================================

let INBOXNUM = { lista: [], ativa: 'todos' };

// ── Reescreve o agrupamento do inbox: por TELEFONE + NÚMERO ──
// Assim a mesma pessoa falando em 2 números vira 2 conversas
// separadas (financeiro com financeiro, comercial com comercial).
function instalarLoadInbox() {
  if (typeof loadInboxChats !== 'function' || typeof currentClinic !== 'function') return false;

  // ⚠️ NOVO 21/08: só devolve um nome quando ele serve pra EXIBIR como
  // nome do contato. Ignora (a) mensagens nossas — o contact_name delas
  // é marcador interno, não nome de pessoa — e (b) os marcadores
  // automáticos, mesmo que por algum motivo venham numa mensagem
  // recebida. Sem isso, conversa cujo último evento foi automático
  // aparecia no Inbox chamada "BRIAN_AUTO"/"BRIAN_FOLLOWUP".
  const MARCADORES_INTERNOS = ['BRIAN_AUTO', 'BRIAN_FOLLOWUP'];
  function nomeExibivelDaMsg(msg) {
    if (!msg || msg.from_me) return null;
    const n = String(msg.contact_name || '').trim();
    if (!n || MARCADORES_INTERNOS.includes(n)) return null;
    return n;
  }

  loadInboxChats = async function () {
    const clinic = currentClinic();
    if (!clinic) return;
    try {
      // ⚠️ AJUSTE URGENTE 12/07: limite subiu de 500 pra 8000. Com 500,
      // qualquer clínica com bom volume de mensagens (as 3 reais já têm
      // 4-6 mil cada) fazia conversas mais antigas "sumirem" do inbox —
      // não porque os dados foram apagados, mas porque simplesmente não
      // entravam nas 500 mais recentes buscadas. Isso causava o "não há
      // conversa com este paciente" mesmo com a conversa existindo.
      const { data: msgs, error } = await db
        .from('mensagens').select('*')
        .eq('clinic_id', clinic.id)
        .order('created_at', { ascending: false })
        .limit(8000);
      if (error) throw error;

      // Descobre o número principal (pra mensagens sem instance_name)
      const principal = clinic.whatsapp_instance || null;

      // ⚠️ AJUSTE 12/07: só separa conversa por NÚMERO quando a clínica
      // REALMENTE tem 2+ números de WhatsApp configurados. Mensagens
      // enviadas pelo sistema (lembretes automáticos) não gravam
      // instance_name, então caíam num agrupamento "diferente" das
      // mensagens que o paciente manda (essas sim vêm com instance_name
      // do Evolution) — fragmentando a MESMA conversa em duas, mesmo em
      // clínica de número único (o caso mais comum). Pra clínica com só
      // 1 número, agrupa só por telefone — sem risco de fragmentar.
      let clinicaTemMultiplosNumeros = false;
      try {
        const { data: extras } = await db.from('instancias').select('id').eq('clinic_id', clinic.id).limit(1);
        clinicaTemMultiplosNumeros = !!(extras && extras.length);
      } catch (e) { /* se falhar, assume número único (mais seguro) */ }

      const chatMap = {};
      (msgs || []).forEach(m => {
        const phone = (m.phone || '').replace(/\D/g, '');
        if (!phone) return;
        // ⚠️ FIX 22/07: agrupar pelo telefone INTEIRO fazia o mesmo paciente
        // virar 2 conversas quando o número chegava gravado em formatos
        // diferentes (com ou sem o nono dígito do celular — ex: 555199429402
        // vs 5551999429402 são a MESMA pessoa). Igual já era feito no
        // lead-anti-duplicado-fix.js e no Brian, agrupamos pelos ÚLTIMOS 8
        // DÍGITOS (sufixo estável — DDI/DDD/nono variam, o final não).
        const sufixo = phone.length >= 8 ? phone.slice(-8) : phone;
        const inst = m.instance_name || principal || 'sem_numero';
        const chave = clinicaTemMultiplosNumeros ? (sufixo + '|' + inst) : sufixo; // ← só separa por número se a clínica realmente tiver mais de um
        if (!chatMap[chave]) {
          const lead = STATE.leads.find(l =>
            l.telefone && l.telefone.replace(/\D/g, '').slice(-8) === sufixo
          );
          chatMap[chave] = {
            id: chave,            // id único por telefone (+número, se aplicável)
            phone,                // telefone completo da mensagem mais recente (msgs vêm ordenadas desc) — usado pra exibir e responder
            instance_name: inst,  // de qual número é essa conversa
            // ⚠️ CORREÇÃO 21/08: antes era `m.contact_name || lead?.nome`.
            // Como as mensagens vêm ordenadas da mais NOVA pra mais velha,
            // "m" aqui é a mensagem mais recente — e se a última mensagem
            // foi automática (follow-up, lembrete, Brian), o contact_name
            // dela é um MARCADOR INTERNO ("BRIAN_AUTO"/"BRIAN_FOLLOWUP"),
            // não o nome de ninguém. Resultado: a conversa aparecia no
            // Inbox chamada "Brian", como se ele fosse o contato — bem
            // visível em follow-up disparado pra lead sem histórico, onde
            // essa era a ÚNICA mensagem da conversa. Agora o nome do LEAD
            // vem primeiro, e contact_name só é aceito quando veio de uma
            // mensagem do próprio paciente (nunca de mensagem nossa).
            name: lead?.nome || nomeExibivelDaMsg(m) || phone,
            lastMsg: '', time: new Date(m.created_at),
            unread: 0, lead, messages: [],
          };
        }
        // se ainda não temos um nome de verdade, tenta achar numa mensagem
        // mais antiga que o paciente tenha mandado (o nome do WhatsApp dele)
        if (chatMap[chave].name === phone) {
          const nomeReal = nomeExibivelDaMsg(m);
          if (nomeReal) chatMap[chave].name = nomeReal;
        }
        chatMap[chave].messages.push(m);
        if (!m.from_me && !m.read_at) chatMap[chave].unread++;
      });

      Object.values(chatMap).forEach(chat => {
        chat.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const last = chat.messages[chat.messages.length - 1];
        chat.lastMsg = (typeof formatLastMsg === 'function') ? formatLastMsg(last) : (last?.content || '');
        chat.time = new Date(last.created_at);
      });

      INBOX.chats = Object.values(chatMap).sort((a, b) => b.time - a.time);

      const totalUnread = INBOX.chats.reduce((s, c) => s + c.unread, 0);
      const badge = document.getElementById('inboxUnreadBadge');
      if (badge) { badge.textContent = totalUnread; badge.style.display = totalUnread > 0 ? '' : 'none'; }
      const statusEl = document.getElementById('inboxStatusText');
      if (statusEl) statusEl.textContent = INBOX.chats.length + ' conversa' + (INBOX.chats.length !== 1 ? 's' : '');

      renderInboxList();
      setTimeout(renderSeletorNumero, 80);

      if (INBOX.activeChat) {
        const updated = INBOX.chats.find(c => c.id === INBOX.activeChat.id);
        if (updated) { INBOX.activeChat = updated; renderMessages(updated.messages, updated); }
      }
    } catch (e) { console.error('loadInboxChats (multi-número):', e); }
  };
  return true;
}

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
    // conta quantas conversas pertencem a esse número (debug + informativo)
    let qtd = 0;
    if (typeof INBOX !== 'undefined' && INBOX.chats) {
      if (b.instance_name === 'todos') qtd = INBOX.chats.length;
      else qtd = INBOX.chats.filter(c => c.instance_name === b.instance_name).length;
    }
    return `<button class="btn btn-sm" style="${ativo ? 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);font-weight:600;' : ''}"
      onclick="selecionarNumeroInbox('${b.instance_name}')">
      ${b.principal === false && b.instance_name !== 'todos' ? '<i class="ti ti-brand-whatsapp" style="color:#25D366;"></i> ' : ''}${b.nome} <span style="opacity:.6;">(${qtd})</span>
    </button>`;
  }).join('');
}

function selecionarNumeroInbox(instanceName) {
  INBOXNUM.ativa = instanceName;
  renderSeletorNumero();
  if (typeof renderInboxList === 'function') renderInboxList();
  // Reaplica algumas vezes pra garantir (caso o render demore ou venha do realtime)
  setTimeout(aplicarFiltroNumero, 50);
  setTimeout(aplicarFiltroNumero, 250);
  setTimeout(aplicarFiltroNumero, 600);
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
// Agora cada chat tem UM instance_name (agrupado por telefone+número).
function chatPertenceNumero(chat) {
  if (INBOXNUM.ativa === 'todos') return true;
  return chat.instance_name === INBOXNUM.ativa;
}

// Aplica o filtro de número escondendo/mostrando os itens do inbox.
// Robusto: roda mesmo que o render tenha vindo do realtime.
function aplicarFiltroNumero() {
  const itens = document.querySelectorAll('#inboxList .inbox-item');
  itens.forEach(item => {
    const onclick = item.getAttribute('onclick') || '';
    const m = onclick.match(/openChat\('([^']+)'\)/);
    if (!m) return;
    if (INBOXNUM.ativa === 'todos') { item.style.display = ''; return; }
    const chat = (typeof INBOX !== 'undefined' && INBOX.chats) ? INBOX.chats.find(c => c.id === m[1]) : null;
    if (chat && !chatPertenceNumero(chat)) item.style.display = 'none';
    else item.style.display = '';
  });
}

// ── Intercepta renderInboxList pra filtrar pelo número ───────
(function () {
  function instalar() {
    if (typeof renderInboxList !== 'function' || typeof loadInboxChats !== 'function') return false;

    // Reescreve o agrupamento (telefone + número)
    instalarLoadInbox();

    // Filtra a lista renderizada pelo número ativo
    const _origRender = renderInboxList;
    renderInboxList = function (...args) {
      _origRender.apply(this, args);
      aplicarFiltroNumero();
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
      const clinicParaCheck = (typeof currentClinic === 'function') ? currentClinic() : null;
      // ⚠️ CORREÇÃO 06/08: clínica em API Oficial não depende de "instância"
      // pra rotear o envio (isso agora é feito pelo clinic_id, lá no
      // backend) — só bloqueia aqui quando for Evolution de verdade e
      // faltar a instância.
      if (!instancia && clinicParaCheck?.tipo_conexao_whatsapp !== 'oficial') {
        if (typeof toast === 'function') toast('Conecte o WhatsApp desta clínica primeiro', 'error');
        return;
      }
      input.value = '';
      if (typeof autoResizeInput === 'function') autoResizeInput(input);
      try {
        // ⚠️ CORREÇÃO 06/08: passa o clinic.id junto — sem isso, o roteamento
        // entre Evolution e API Oficial (lá no backend) ficava dependendo só
        // da "instância", que pra clínica em API Oficial pode vir errada
        // (o recebimento salva o Phone Number ID da Meta nesse campo, não um
        // nome de instância Evolution de verdade). Com o clinic.id, o
        // backend identifica a clínica direto e roteia certo, ignorando
        // esse valor de instância que não se aplica.
        const clinicAtual = (typeof currentClinic === 'function') ? currentClinic() : null;

        // ⚠️ NOVO 21/08: se o usuário escolheu RESPONDER uma mensagem
        // específica, chama o backend direto passando o reply_to. Fiz
        // assim de propósito, em vez de adicionar um parâmetro novo no
        // sendWhatsAppMessage: essa função tem 5 versões encadeadas
        // (wrappers de endereço, dentistas, variáveis...), e já perdemos
        // parâmetro no meio dessa corrente antes — ia dar o mesmo
        // problema de novo. Aqui o caminho é curto e não depende delas.
        const respondendo = window.INBOX_RESPONDENDO;
        if (respondendo && respondendo.id) {
          const r = await fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instance: instancia,
              clinic_id: clinicAtual?.id,
              phone: INBOX.activeChat.phone,
              message: text,
              reply_to: respondendo.id,
            }),
          });
          if (!r.ok) {
            let detalhe = '';
            try { const j = await r.json(); detalhe = j?.error?.message || j?.error || ''; } catch (e) { }
            throw new Error(detalhe || 'falha ao responder');
          }
          if (typeof cancelarResposta === 'function') cancelarResposta();
        } else {
          await sendWhatsAppMessage(instancia, INBOX.activeChat.phone, text, clinicAtual?.id);
        }
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
