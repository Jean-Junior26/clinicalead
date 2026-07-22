// ============================================================
// CLINICALEAD — ATALHOS EDITÁVEIS DO INBOX (por clínica)
// • Cada clínica nasce com 5 atalhos padrão (semeados na 1ª vez)
// • Botão ⚙️ no Inbox abre a tela de gerenciar (criar/editar/remover)
// • Ao clicar num atalho, preenche dados reais (nome, data, hora,
//   procedimento, endereço, mapa) da conversa/consulta atual.
// Substitui o atalhos-inteligentes-fix.js (engloba ele).
//
// AJUSTE 22/07: suporte a VERSÃO POR DENTISTA. Cada atalho pode ter um
// dentista_id opcional — quando vazio é a versão "geral" (vale pra
// qualquer dentista sem versão própria); quando preenchido, só é usado
// quando a PRÓXIMA CONSULTA do lead for com aquele dentista. O botão no
// Inbox continua sendo um só por título (ex: "📅 Confirmar consulta") —
// a escolha entre a versão geral e a do dentista acontece sozinha na
// hora de montar a mensagem, olhando o dentista_id da consulta.
// Requer a coluna atalhos.dentista_id (ver adicionar-dentista-atalhos.sql).
// ============================================================

let ATALHOS = { lista: [], clinicId: null };
let DENTISTAS_ATALHOS = [];

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
    // Semeia os padrões para esta clínica (1ª vez) — sempre versão geral (dentista_id null)
    const novos = ATALHOS_PADRAO.map(a => ({ ...a, clinic_id: clinic.id, ativo: true, dentista_id: null }));
    const { data: inseridos } = await db.from('atalhos').insert(novos).select();
    ATALHOS.lista = inseridos || [];
  } else {
    ATALHOS.lista = data;
  }
}

// ── Busca a PRÓXIMA consulta do lead (com o dentista, se houver) ──
// Usada tanto pra escolher a variação certa do atalho quanto pra
// preencher as variáveis {data}/{hora}/{procedimento}/{dentista}.
async function buscarProximaConsultaAtalho(chat) {
  const clinic = currentClinic();
  const lead = chat?.lead || null;
  if (!lead?.id || !clinic) return null;
  try {
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
    const { data: cons } = await db.from('consultas')
      .select('data,hora,procedimento,dentista_id,dentistas(nome)')
      .eq('lead_id', lead.id).eq('clinic_id', clinic.id)
      .gte('data', hoje)
      .order('data', { ascending: true }).order('hora', { ascending: true })
      .limit(1);
    return (cons && cons[0]) || null;
  } catch (e) { return null; }
}

// ── Preenche variáveis com dados reais da conversa/consulta ──
async function montarMensagemAtalho(atalho, chat, consulta) {
  const clinic = currentClinic();
  const nome = chat?.lead?.nome || chat?.name || 'cliente';

  let dataFmt = '', horaFmt = '', procedimento = chat?.lead?.procedimento || '', dentistaNome = '';
  if (consulta) {
    if (consulta.data) dataFmt = new Date(consulta.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    if (consulta.hora) horaFmt = String(consulta.hora).slice(0, 5);
    if (consulta.procedimento) procedimento = consulta.procedimento;
    dentistaNome = (consulta.dentistas && consulta.dentistas.nome) || '';
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
    .replaceAll('{mapa}', mapa || '')
    .replaceAll('{dentista}', dentistaNome || '');
}

// ── Renderiza os botões de atalho no Inbox ───────────────────
// Um botão por TÍTULO (não por linha) — se houver versão geral + versão
// por dentista com o mesmo título, aparece um botão só; a escolha da
// versão certa acontece dentro de usarAtalho(), na hora do clique.
async function renderAtalhosInbox(chat) {
  const el = document.getElementById('chatQuickReplies') || document.querySelector('.chat-quick-replies');
  if (!el) return;
  if (ATALHOS.clinicId !== currentClinic()?.id || !ATALHOS.lista.length) {
    await carregarAtalhos();
  }
  const vistos = new Set();
  const unicos = ATALHOS.lista
    .slice()
    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
    .filter(a => {
      if (vistos.has(a.titulo)) return false;
      vistos.add(a.titulo);
      return true;
    });
  let html = unicos.map(a =>
    `<button class="quick-reply" onclick="usarAtalho('${a.titulo.replace(/'/g, "\\'")}','${chat.id}')">${a.emoji || '💬'} ${a.titulo}</button>`
  ).join('');
  // botão de gerenciar
  html += `<button class="quick-reply" style="border-style:dashed;opacity:0.8;" onclick="abrirGerenciarAtalhos()" title="Gerenciar atalhos">⚙️</button>`;
  el.innerHTML = html;
}

// ── Clicar num atalho: escolhe a versão certa e preenche o campo ──
async function usarAtalho(titulo, chatId) {
  const chat = (typeof INBOX !== 'undefined' && INBOX.chats) ? INBOX.chats.find(c => c.id === chatId) : null;
  if (!chat) return;
  const consulta = await buscarProximaConsultaAtalho(chat);
  const dentistaId = consulta?.dentista_id || null;

  // prioridade: versão específica do dentista da consulta > versão geral > qualquer uma com esse título
  const atalho =
    (dentistaId && ATALHOS.lista.find(a => a.titulo === titulo && a.dentista_id === dentistaId)) ||
    ATALHOS.lista.find(a => a.titulo === titulo && !a.dentista_id) ||
    ATALHOS.lista.find(a => a.titulo === titulo);
  if (!atalho) return;

  const msg = await montarMensagemAtalho(atalho, chat, consulta);
  const input = document.getElementById('chatInput');
  if (input) { input.value = msg; input.focus(); if (typeof autoResizeInput === 'function') autoResizeInput(input); }
}

// ── Tela de gerenciar atalhos ────────────────────────────────
async function abrirGerenciarAtalhos() {
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
            Use variáveis nas mensagens: <code>{nome}</code> <code>{clinica}</code> <code>{data}</code> <code>{hora}</code> <code>{procedimento}</code> <code>{endereco}</code> <code>{mapa}</code> <code>{dentista}</code> — elas são preenchidas automaticamente com os dados reais.
            <br><br>💡 Cada atalho pode ter uma <b>versão geral</b> e, opcionalmente, <b>versões específicas por dentista</b> (ex: uma "Confirmar consulta" só pra Dra. Giovana). O sistema escolhe sozinha a versão certa olhando o dentista da consulta do paciente — se não houver versão específica pra aquele dentista, usa a geral.
          </div>
          <div id="atalhosListaGer"></div>
          <button class="btn btn-primary" style="margin-top:12px;" onclick="novoAtalho()"><i class="ti ti-plus"></i> Novo atalho (geral)</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }
  await carregarDentistasParaAtalhos();
  renderListaGerenciar();
  openModal('modalAtalhos');
}

async function carregarDentistasParaAtalhos() {
  const clinic = currentClinic();
  if (!clinic) { DENTISTAS_ATALHOS = []; return; }
  try {
    const { data } = await db.from('dentistas').select('id,nome').eq('clinic_id', clinic.id).eq('ativo', true).order('nome');
    DENTISTAS_ATALHOS = data || [];
  } catch (e) { DENTISTAS_ATALHOS = []; }
}

function optsDentistasAtalho(selecionadoId) {
  let h = `<option value="">🌐 Todos os dentistas (geral)</option>`;
  DENTISTAS_ATALHOS.forEach(d => {
    h += `<option value="${d.id}" ${d.id === selecionadoId ? 'selected' : ''}>${(d.nome || '').replace(/</g, '&lt;')}</option>`;
  });
  return h;
}

function renderListaGerenciar() {
  const cont = document.getElementById('atalhosListaGer');
  if (!cont) return;
  if (!ATALHOS.lista.length) {
    cont.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:10px;">Nenhum atalho. Crie o primeiro!</div>';
    return;
  }

  // agrupa por título, pra mostrar a versão geral junto com as por-dentista
  const grupos = {};
  ATALHOS.lista.forEach(a => { (grupos[a.titulo] = grupos[a.titulo] || []).push(a); });
  const titulos = Object.keys(grupos).sort((x, y) => (grupos[x][0].ordem || 0) - (grupos[y][0].ordem || 0));

  let html = '';
  titulos.forEach(titulo => {
    const itens = grupos[titulo].slice().sort((a, b) => (a.dentista_id ? 1 : 0) - (b.dentista_id ? 1 : 0)); // geral primeiro
    html += `<div style="border:1px solid var(--gold-border,#333);border-radius:12px;padding:10px;margin-bottom:14px;">`;
    itens.forEach(a => { html += cardAtalho(a); });
    html += `<button class="btn btn-sm" onclick="criarVersaoPorDentista('${itens[0].id}')" ${!DENTISTAS_ATALHOS.length ? 'disabled title="Cadastre dentistas primeiro (menu Dentistas)"' : ''}><i class="ti ti-stethoscope"></i> + versão personalizada por dentista</button>`;
    html += `</div>`;
  });
  cont.innerHTML = html;
}

function cardAtalho(a) {
  const nomeDentista = a.dentista_id ? ((DENTISTAS_ATALHOS.find(d => d.id === a.dentista_id) || {}).nome || '(dentista removido)') : null;
  // título fica travado nas versões por dentista pra não desalinhar do
  // agrupamento (o botão do Inbox usa o texto do título pra casar as versões)
  const tituloAttrs = nomeDentista ? 'disabled title="O título segue a versão geral — pra renomear, edite a versão geral (🌐)"' : '';
  return `
    <div class="card" style="padding:12px;margin-bottom:8px;${nomeDentista ? 'border-left:3px solid var(--gold);' : ''}">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
        <input class="form-input" style="width:60px;text-align:center;" id="at_emoji_${a.id}" value="${(a.emoji || '💬').replace(/"/g, '')}" maxlength="2"/>
        <input class="form-input" style="flex:1;min-width:120px;" id="at_titulo_${a.id}" value="${(a.titulo || '').replace(/"/g, '&quot;')}" placeholder="Título" ${tituloAttrs}/>
        <select class="form-input" id="at_dentista_${a.id}" style="min-width:190px;">${optsDentistasAtalho(a.dentista_id)}</select>
        <button class="btn btn-sm btn-danger" onclick="removerAtalho('${a.id}')"><i class="ti ti-trash"></i></button>
      </div>
      <div style="font-size:11px;color:${nomeDentista ? 'var(--gold)' : 'var(--text-muted)'};margin-bottom:6px;">
        ${nomeDentista ? `🦷 Só quando a consulta for com <b>${nomeDentista}</b>` : '🌐 Geral — vale pra qualquer dentista sem versão própria'}
      </div>
      <textarea class="form-input" id="at_msg_${a.id}" rows="4" style="width:100%;resize:vertical;" placeholder="Mensagem...">${(a.mensagem || '').replace(/</g, '&lt;')}</textarea>
      <button class="btn btn-sm btn-primary" style="margin-top:6px;" onclick="salvarAtalho('${a.id}')"><i class="ti ti-check"></i> Salvar</button>
    </div>`;
}

async function salvarAtalho(id) {
  const emoji = document.getElementById('at_emoji_' + id).value.trim() || '💬';
  const titulo = document.getElementById('at_titulo_' + id).value.trim();
  const mensagem = document.getElementById('at_msg_' + id).value.trim();
  const selDentista = document.getElementById('at_dentista_' + id);
  const dentista_id = (selDentista && selDentista.value) ? selDentista.value : null;
  if (!titulo || !mensagem) { toast('Preencha título e mensagem', 'error'); return; }
  const { error } = await db.from('atalhos').update({ emoji, titulo, mensagem, dentista_id }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  const a = ATALHOS.lista.find(x => x.id === id);
  if (a) { a.emoji = emoji; a.titulo = titulo; a.mensagem = mensagem; a.dentista_id = dentista_id; }
  toast('Atalho salvo! ✓');
  renderListaGerenciar(); // re-renderiza pra reagrupar se o dentista mudou
}

async function novoAtalho() {
  const clinic = currentClinic();
  const ordem = (ATALHOS.lista.length ? Math.max(...ATALHOS.lista.map(a => a.ordem || 0)) : 0) + 1;
  const { data, error } = await db.from('atalhos')
    .insert({ clinic_id: clinic.id, emoji: '💬', titulo: 'Novo atalho', mensagem: 'Olá {nome}! ', ordem, ativo: true, dentista_id: null })
    .select().single();
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  ATALHOS.lista.push(data);
  renderListaGerenciar();
}

// ── Cria uma versão por-dentista de um atalho existente ───────
// Parte da mensagem da versão geral como ponto de partida (o usuário
// personaliza depois). Título é copiado igual (fica travado no card).
async function criarVersaoPorDentista(atalhoBaseId) {
  const base = ATALHOS.lista.find(a => a.id === atalhoBaseId);
  if (!base) return;
  if (!DENTISTAS_ATALHOS.length) { toast('Cadastre os dentistas primeiro (menu Dentistas).', 'error'); return; }
  const clinic = currentClinic();
  const jaUsados = new Set(ATALHOS.lista.filter(a => a.titulo === base.titulo && a.dentista_id).map(a => a.dentista_id));
  const proximoDentista = DENTISTAS_ATALHOS.find(d => !jaUsados.has(d.id)) || DENTISTAS_ATALHOS[0];
  const { data, error } = await db.from('atalhos')
    .insert({ clinic_id: clinic.id, emoji: base.emoji, titulo: base.titulo, mensagem: base.mensagem, ordem: base.ordem || 1, ativo: true, dentista_id: proximoDentista.id })
    .select().single();
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  ATALHOS.lista.push(data);
  renderListaGerenciar();
  toast('Versão criada — escolha o dentista certo e personalize a mensagem 🦷');
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
      console.log('✅ atalhos-editaveis-fix.js carregado — atalhos editáveis por clínica (+ versão por dentista)');
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
