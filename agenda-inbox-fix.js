// ============================================================
// CLINICALEAD — BOTÃO BALÃO DA AGENDA → INBOX INTERNO
// O ícone de balão (💬) nos itens da agenda abria o WhatsApp Web.
// Aqui redefinimos para abrir a conversa DENTRO do Inbox do CRM,
// já selecionando o chat daquele paciente (pelo telefone).
// ============================================================

// Abre o Inbox interno na conversa de um telefone
async function abrirInboxConversa(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (!digitos) { if (typeof toast === 'function') toast('Paciente sem telefone cadastrado', 'error'); return; }

  // 1. Vai para a página do Inbox
  if (typeof showPage === 'function') showPage('inbox');

  // 2. Espera os chats carregarem e tenta abrir o do paciente
  // compara pelos últimos 8 dígitos — mesma convenção usada no resto do
  // sistema (webhook.js, disparar-automacoes). Usar 8 em vez de 9 é
  // proposital: é resistente ao problema do "9º dígito" do celular
  // brasileiro (o número pode chegar salvo com ou sem esse dígito extra
  // dependendo da origem, e só os últimos 8 são garantidamente iguais
  // nos dois formatos).
  const alvo = digitos.slice(-8);
  let tentativas = 0;

  const tentarAbrir = () => {
    tentativas++;
    if (typeof INBOX === 'undefined' || !INBOX.chats || !INBOX.chats.length) {
      if (tentativas < 20) return setTimeout(tentarAbrir, 300);
      return;
    }
    const chat = INBOX.chats.find(c => (c.phone || '').replace(/\D/g, '').slice(-8) === alvo);
    if (chat) {
      if (typeof openChat === 'function') openChat(chat.id);
    } else {
      // Conversa ainda não existe (paciente nunca trocou mensagem).
      if (typeof toast === 'function') toast('Ainda não há conversa com este paciente no Inbox', 'info');
      if (tentativas < 8) return setTimeout(tentarAbrir, 400);
    }
  };
  setTimeout(tentarAbrir, 400);
}

// ── Substitui as funções antigas que abriam o WhatsApp Web ───
// O botão balão da agenda e os botões das tarefas chamam tarefaWhats().
// Redirecionamos todas para abrir o Inbox interno do CRM.
(function () {
  function aplicarOverride() {
    if (typeof window !== 'undefined') {
      window.tarefaWhats = function (telefone) { abrirInboxConversa(telefone); };
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
