// ============================================================
// CLINICALEAD — ATALHOS EDITÁVEIS DO INBOX (por clínica)
// • Cada clínica nasce com 5 atalhos padrão (semeados na 1ª vez)
// • Botão ⚙️ no Inbox abre a tela de gerenciar (criar/editar/remover)
// • Ao clicar num atalho, preenche dados reais (nome, data, hora,
//   procedimento, endereço, mapa) da conversa/consulta atual.
// Substitui o atalhos-inteligentes-fix.js (engloba ele).
// ============================================================

let ATALHOS = { lista: [], clinicId: null };

// ── Padrões semeados quando a clínica não tem atalhos ────────
const ATALHOS_PADRAO = [
  { emoji: '👋', titulo: 'Boas-vindas',       ordem: 1, mensagem: 'Olá, {nome}! 😊 Tudo bem?\n\nAqui é da *{clinica}*! Vi que você tem interesse e adoraria te ajudar.\n\nPosso te agendar uma *avaliação gratuita e sem compromisso*? 🦷' },
  { emoji: '📅', titulo: 'Confirmar consulta', ordem: 2, mensagem: 'Olá, {nome}! 🎉 Sua consulta está *confirmada*!\n\n📅 *Data:* {data}\n⏰ *Horário:* {hora}\n🦷 *Procedimento:* {procedimento}\n📍 *Endereço:* {endereco}\n🗺️ *Como chegar:* {mapa}\n\nQualquer dúvida, é só chamar aqui! Te esperamos 😊' },
  { emoji: '⏰', titulo: 'Lembrete 24h',        ordem: 3, mensagem: 'Oi {nome}! 👋 Passando para lembrar que *amanhã* você tem consulta conosco!\n\n⏰ *Horário:* {hora}\n📍 *Endereço:* {endereco}\n🗺️ {mapa}\n\nConfirma sua presença? Responda *SIM* ou *NÃO* 😊' },
  { emoji: '😊', titulo: 'Pós-consulta',        ordem: 4, mensagem: 'Oi {nome}! 😊 Foi um prazer te atender hoje!\n\nQualquer dúvida sobre o procedimento, é só chamar aqui. Cuide bem do seu sorriso! 🦷✨' },
  { emoji: '📍', titulo: 'Endereço',            ordem: 5, mensagem: '📍 *Endereço da {clinica}:*\n{endereco}\n🗺️ *Como chegar:* {mapa}' },
];

// ── Carrega atalhos da clínica (e semeia padrões se vazio) ───
async function carregarAtalhos() {
  const clinic = currentClinic();
  if (!clinic) { ATALHOS.lista = []; return; }
  ATALHOS.clinicId = clinic.id;

  const { data, error } = await db.from('atalhos')
    .select('*').eq('clinic_id', clinic.id).eq('ativo', true)
    .order('ordem', { ascending: true });

  if (error) { console.error('[atalhos] erro:', error.message); ATALHOS.lista = []; return; }

  if (!data || data.length === 0) {
    // Semeia os padrões para esta clínica (1ª vez)
    const novos = ATALHOS_PADRAO.map(a => ({ ...a, clinic_id: clinic.id, ativo: true }));
    const { data: inseridos } = await db.from('atalhos').insert(novos).select();
    ATALHOS.lista = inseridos || [];
  } else {
    ATALHOS.lista = data;
  }
}

// ── Preenche variáveis com dados reais da conversa/consulta ──
async function montarMensagemAtalho(atalho, chat) {
  const clinic = currentClinic();
  const nome = chat?.lead?.nome || chat?.name || 'cliente';
  const lead = chat?.lead || null;

  let dataFmt = '', horaFmt = '', procedimento = lead?.procedimento || '';

  if (lead?.id && clinic) {
    try {
      const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
      const { data: cons } = await db.from('consultas')
        .select('data,hora,procedimento')
        .eq('lead_id', lead.id).eq('clinic_id', clinic.id)
        .gte('data', hoje)
        .order('data', { ascending: true }).order('hora', { ascending: true })
        .limit(1);
      if (cons && cons.length) {
        const c = cons[0];
        if (c.data) dataFmt = new Date(c.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
        if (c.hora) horaFmt = String(c.hora).slice(0, 5);
        if (c.procedimento) procedimento = c.procedimento;
      }
    } catch (e) { /* segue sem consulta */ }
  }

  const end = (typeof enderecoClinica === 'function') ? enderecoClinica(clinic) : (clinic?.endereco || '');
  const mapa = (typeof linkMapaClinica === 'function') ? linkMapaClinica(clinic) : '';

  return (atalho.mensagem || '')
    .replaceAll('{nome}', nome)
    .replaceAll('{clinica}', clinic?.nome || '')
    .replaceAll('{data}', dataFmt || '(a combinar)')
    .replaceAll('{hora}', horaFmt || '(a combinar)')
    .replaceAll('{procedimento}', procedimento || 'sua avaliação')
    .replaceAll('{endereco}', end || '[cadastre o endereço em Clínicas → Editar]')
    .replaceAll('{mapa}', mapa || '');
}

// ── Renderiza os botões de atalho no Inbox ───────────────────
async function renderAtalhosInbox(chat) {
  const el = document.getElementById('chatQuickReplies') || document.querySelector('.chat-quick-replies');
  if (!el) return;
  if (ATALHOS.clinicId !== currentClinic()?.id || !ATALHOS.lista.length) {
    await carregarAtalhos();
  }
  let html = ATALHOS.lista.map(a =>
    `<button class="quick-reply" onclick="usarAtalho('${a.id}','${chat.id}')">${a.emoji || '💬'} ${a.titulo}</button>`
  ).join('');
  // botão de gerenciar
  html += `<button class="quick-reply" style="border-style:dashed;opacity:0.8;" onclick="abrirGerenciarAtalhos()" title="Gerenciar atalhos">⚙️</button>`;
  el.innerHTML = html;
}

// ── Clicar num atalho: preenche o campo de mensagem ──────────
async function usarAtalho(atalhoId, chatId) {
  const chat = (typeof INBOX !== 'undefined' && INBOX.chats) ? INBOX.chats.find(c => c.id === chatId) : null;
  const atalho = ATALHOS.lista.find(a => a.id === atalhoId);
  if (!atalho) return;
  const msg = await montarMensagemAtalho(atalho, chat);
  const input = document.getElementById('chatInput');
  if (input) { input.value = msg; input.focus(); if (typeof autoResizeInput === 'function') autoResizeInput(input); }
}

// ── Tela de gerenciar atalhos ────────────────────────────────
function abrirGerenciarAtalhos() {
  if (!document.getElementById('modalAtalhos')) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'modalAtalhos';
    ov.innerHTML = `
      <div class="modal" style="max-width:640px;width:96vw;">
        <div class="modal-header">
          <h3><i class="ti ti-bolt" style="margin-right:8px;color:var(--gold);"></i>Gerenciar atalhos</h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('modalAtalhos')"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="max-height:72vh;overflow-y:auto;">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">
            Use variáveis nas mensagens: <code>{nome}</code> <code>{clinica}</code> <code>{data}</code> <code>{hora}</code> <code>{procedimento}</code> <code>{endereco}</code> <code>{mapa}</code> — elas são preenchidas automaticamente com os dados reais.
          </div>
          <div id="atalhosListaGer"></div>
          <button class="btn btn-primary" style="margin-top:12px;" onclick="novoAtalho()"><i class="ti ti-plus"></i> Novo atalho</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }
  renderListaGerenciar();
  openModal('modalAtalhos');
}

function renderListaGerenciar() {
  const cont = document.getElementById('atalhosListaGer');
  if (!cont) return;
  if (!ATALHOS.lista.length) {
    cont.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:10px;">Nenhum atalho. Crie o primeiro!</div>';
    return;
  }
  cont.innerHTML = ATALHOS.lista.map(a => `
    <div class="card" style="padding:12px;margin-bottom:8px;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <input class="form-input" style="width:60px;text-align:center;" id="at_emoji_${a.id}" value="${(a.emoji || '💬').replace(/"/g,'')}" maxlength="2"/>
        <input class="form-input" style="flex:1;" id="at_titulo_${a.id}" value="${(a.titulo || '').replace(/"/g,'&quot;')}" placeholder="Título"/>
        <button class="btn btn-sm btn-danger" onclick="removerAtalho('${a.id}')"><i class="ti ti-trash"></i></button>
      </div>
      <textarea class="form-input" id="at_msg_${a.id}" rows="4" style="width:100%;resize:vertical;" placeholder="Mensagem...">${(a.mensagem || '').replace(/</g,'&lt;')}</textarea>
      <button class="btn btn-sm btn-primary" style="margin-top:6px;" onclick="salvarAtalho('${a.id}')"><i class="ti ti-check"></i> Salvar</button>
    </div>`).join('');
}

async function salvarAtalho(id) {
  const emoji = document.getElementById('at_emoji_' + id).value.trim() || '💬';
  const titulo = document.getElementById('at_titulo_' + id).value.trim();
  const mensagem = document.getElementById('at_msg_' + id).value.trim();
  if (!titulo || !mensagem) { toast('Preencha título e mensagem', 'error'); return; }
  const { error } = await db.from('atalhos').update({ emoji, titulo, mensagem }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  const a = ATALHOS.lista.find(x => x.id === id);
  if (a) { a.emoji = emoji; a.titulo = titulo; a.mensagem = mensagem; }
  toast('Atalho salvo! ✓');
}

async function novoAtalho() {
  const clinic = currentClinic();
  const ordem = (ATALHOS.lista.length ? Math.max(...ATALHOS.lista.map(a => a.ordem || 0)) : 0) + 1;
  const { data, error } = await db.from('atalhos')
    .insert({ clinic_id: clinic.id, emoji: '💬', titulo: 'Novo atalho', mensagem: 'Olá {nome}! ', ordem, ativo: true })
    .select().single();
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  ATALHOS.lista.push(data);
  renderListaGerenciar();
}

async function removerAtalho(id) {
  if (!confirm('Remover este atalho?')) return;
  const { error } = await db.from('atalhos').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  ATALHOS.lista = ATALHOS.lista.filter(a => a.id !== id);
  renderListaGerenciar();
  toast('Atalho removido.');
}

// ── Substitui a renderização original dos atalhos ────────────
(function () {
  function instalar() {
    if (typeof renderQuickReplies === 'function') {
      renderQuickReplies = function (chat, el) {
        if (chat) renderAtalhosInbox(chat);
      };
      console.log('✅ atalhos-editaveis-fix.js carregado — atalhos editáveis por clínica');
      return true;
    }
    return false;
  }
  if (!instalar()) {
    // fallback: tenta achar onde os atalhos são montados e observa
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }

  // Também neutraliza o setQuickReply antigo, redirecionando para o novo
  if (typeof setQuickReply !== 'undefined') {
    setQuickReply = function () { /* substituído por usarAtalho */ };
  }
})();
