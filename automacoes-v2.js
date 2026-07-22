// ============================================================
// CLINICALEAD — AUTOMAÇÕES V3
// Variáveis disponíveis nas mensagens:
//   {nome} {clinica} {procedimento} {data} {hora} {dentista}
// Dica: cada clínica deve editar as mensagens de confirmação e
// lembretes para incluir o PRÓPRIO endereço e link do Maps.
//
// AJUSTE 22/07: suporte a VERSÃO POR DENTISTA (pedido José Bonifácio).
// Cada automação (confirmação, lembrete 2h, 24h, etc.) pode ter uma
// versão GERAL (dentista_id null) e, opcionalmente, versões
// específicas por dentista. Requer a coluna automacoes.dentista_id
// (ver adicionar-dentista-automacoes.sql). A escolha de qual versão
// enviar acontece no ponto de disparo (salvarNovoAgendamento, via
// dentistas-agendamento-fix.js, para a confirmação; e no
// disparar-automacoes Edge Function para os lembretes por tempo).
// ============================================================

const AUTOMACOES_DEFAULTS = [
  {
    id: 1, tipo: 'boasvindas',
    titulo: 'Boas-vindas ao novo lead', title: 'Boas-vindas ao novo lead',
    desc: 'Enviada assim que um novo lead entra no sistema.',
    trigger: 'Lead criado', icon: 'ti-hand-click',
    active: true, ativo: true, automatica: true,
    msg: 'Olá, {nome}! 😊 Tudo bem?\n\nAqui é da *{clinica}*! Vi que você tem interesse em *{procedimento}* e adoraria te ajudar nessa jornada.\n\nPosso te agendar uma *avaliação gratuita e sem compromisso*? É rapidinho, a gente te explica tudo pessoalmente! 🦷\n\nQual o melhor dia pra você?',
  },
  {
    id: 2, tipo: 'confirmacao',
    titulo: 'Confirmação de agendamento', title: 'Confirmação de agendamento',
    desc: 'Enviada ao registrar a consulta. 💡 Edite e adicione o endereço e o link do Maps da sua clínica!',
    trigger: 'Consulta agendada', icon: 'ti-calendar-check',
    active: true, ativo: true, automatica: true,
    msg: 'Olá, {nome}! 🎉 Sua consulta está *confirmada*!\n\n📅 *Data:* {data}\n⏰ *Horário:* {hora}\n🦷 *Procedimento:* {procedimento}\n\nQualquer dúvida, é só chamar aqui! Te esperamos 😊',
  },
  {
    id: 3, tipo: 'lembrete2h',
    titulo: 'Lembrete 2h antes', title: 'Lembrete 2h antes',
    desc: 'Enviado 2h antes da consulta. 💡 Edite e adicione o endereço da sua clínica!',
    trigger: '2h antes da consulta', icon: 'ti-bell',
    active: true, ativo: true, automatica: true,
    msg: 'Oi {nome}! ⏰ Sua consulta na *{clinica}* é *hoje às {hora}*!\n\nJá estamos te esperando de sorriso aberto! 😁\n\nSe precisar de qualquer coisa, é só chamar aqui.',
  },
  {
    id: 4, tipo: 'lembrete',
    titulo: 'Lembrete 24h antes', title: 'Lembrete 24h antes',
    desc: 'Enviado 24h antes da consulta. 💡 Edite e adicione o endereço da sua clínica!',
    trigger: '24h antes da consulta', icon: 'ti-clock',
    active: true, ativo: true, automatica: true,
    msg: 'Oi {nome}! 👋 Passando para lembrar que *amanhã* você tem consulta conosco!\n\n⏰ *Horário:* {hora}\n\nConfirma sua presença? Responda:\n*1* ✅ para confirmar\n*2* 🔄 para remarcar',
  },
  {
    id: 5, tipo: 'followup',
    titulo: 'Follow-up sem resposta', title: 'Follow-up sem resposta',
    desc: 'Reativa leads sem resposta após 48h.',
    trigger: '48h sem resposta', icon: 'ti-refresh',
    active: true, ativo: true, automatica: false,
    msg: 'Oi {nome}, tudo bem? 😊\n\nVi que ainda não conseguimos conversar sobre *{procedimento}* e queria saber se ainda posso te ajudar!\n\nTemos horários disponíveis essa semana para uma *avaliação gratuita*. Seria ótimo te conhecer pessoalmente 🦷\n\nQual o melhor momento pra você?',
  },
  {
    id: 6, tipo: 'posconsulta',
    titulo: 'Pós-consulta', title: 'Pós-consulta',
    desc: 'Enviada após o paciente comparecer.',
    trigger: 'Status = Compareceu', icon: 'ti-heart',
    active: true, ativo: true, automatica: true,
    msg: 'Oi {nome}! 😊 Foi um prazer te receber hoje na *{clinica}*!\n\nEspero que tenha gostado da avaliação e que tenha tirado todas as suas dúvidas.\n\nCaso queira dar continuidade ao tratamento de *{procedimento}*, temos condições especiais de pagamento e parcelamento. Posso te passar mais detalhes? 💛',
  },
  {
    id: 7, tipo: 'reativacao',
    titulo: 'Reativação de lead frio', title: 'Reativação de lead frio',
    desc: 'Reativa leads inativos há 7+ dias.',
    trigger: '7 dias sem atividade', icon: 'ti-star',
    active: false, ativo: false, automatica: false,
    msg: 'Oi {nome}! 🌟 Tudo bem?\n\nPassei aqui porque lembrei de você e queria saber se ainda tem interesse em cuidar do seu sorriso com a gente! 😊\n\nEsse mês temos uma *condição especial* para *{procedimento}* com formas facilitadas de pagamento.\n\nPosso te contar mais detalhes? É por tempo limitado! 🦷',
  },
  // ── NOVAS: o esquadrão de recuperação de receita ────────────
  {
    id: 8, tipo: 'recuperacao_falta',
    titulo: 'Recuperação de falta', title: 'Recuperação de falta',
    desc: 'Use quando a Central de Tarefas pedir para recuperar uma falta — sem cobrança, com porta aberta.',
    trigger: 'Paciente faltou', icon: 'ti-door-off',
    active: true, ativo: true, automatica: false,
    msg: 'Oi {nome}! Sentimos sua falta hoje 🥺\n\nImprevistos acontecem, super entendemos! O importante é não deixar seu sorriso esperando 😊\n\nQue tal a gente já deixar um *novo horário* reservado pra você? Me fala o melhor dia que eu encaixo na agenda! 📅',
  },
  {
    id: 9, tipo: 'orcamento_followup',
    titulo: 'Follow-up de orçamento', title: 'Follow-up de orçamento',
    desc: 'Use quando a Central avisar "orçamento parado" — retoma a conversa e oferece facilidade.',
    trigger: 'Orçamento sem resposta há 3 dias', icon: 'ti-file-invoice',
    active: true, ativo: true, automatica: false,
    msg: 'Oi {nome}! 😊 Tudo bem?\n\nPassando pra saber se você ficou com alguma dúvida sobre o *orçamento de {procedimento}* que preparamos pra você.\n\nSe a questão for o investimento, temos *parcelamento facilitado* e podemos montar uma condição que caiba no seu bolso! 💳\n\nPosso te ajudar com alguma coisa? Estamos aqui! 🦷',
  },
  {
    id: 10, tipo: 'avaliacao_google',
    titulo: 'Pedir avaliação no Google', title: 'Pedir avaliação no Google',
    desc: 'Use no pós-venda (2 dias após fechar). 💡 Edite e cole o link de avaliação da sua clínica no Google!',
    trigger: '2 dias após virar paciente', icon: 'ti-star-filled',
    active: true, ativo: true, automatica: false,
    msg: 'Oi {nome}! 😊\n\nFoi uma alegria cuidar do seu sorriso! Espero que esteja tudo ótimo por aí 💛\n\nSe você gostou do nosso atendimento, uma *avaliação no Google* nos ajuda DEMAIS — leva 30 segundos e faz toda diferença pra gente:\n\n⭐ [cole aqui o link de avaliação da sua clínica]\n\nMuito obrigado pela confiança! 🦷✨',
  },
  {
    id: 11, tipo: 'retorno_revisao',
    titulo: 'Retorno semestral (revisão)', title: 'Retorno semestral (revisão)',
    desc: 'Recall de revisão/limpeza ~6 meses após o tratamento — o segredo da agenda sempre cheia.',
    trigger: '6 meses após o tratamento', icon: 'ti-calendar-repeat',
    active: true, ativo: true, automatica: false,
    msg: 'Oi {nome}! 😊 Aqui é da *{clinica}*!\n\nJá faz uns 6 meses desde a sua última visita, e a recomendação é fazer *revisão e limpeza* a cada semestre pra manter o sorriso saudável (e evitar tratamentos mais caros lá na frente! 😉).\n\nQue tal já garantirmos seu horário? Me fala o melhor dia pra você! 📅🦷',
  },
  {
    id: 12, tipo: 'aniversario',
    titulo: 'Aniversário do paciente', title: 'Aniversário do paciente',
    desc: 'Mensagem de parabéns — relacionamento puro, e quem sente carinho indica a clínica.',
    trigger: 'Aniversário', icon: 'ti-cake',
    active: true, ativo: true, automatica: false,
    msg: 'Parabéns, {nome}!! 🎉🎂\n\nA equipe da *{clinica}* deseja um dia incrível, cheio de alegria e MUITOS sorrisos — afinal, sorriso é com a gente mesmo! 😁\n\nFelicidades! 🥳💛',
  },
];

// ── lista de dentistas da clínica atual (pro seletor de versão) ──
function _autoDentistasDisponiveis() {
  return (typeof window.DENT_lista === 'function') ? window.DENT_lista() : [];
}
function _autoNomeDentista(id) {
  const d = _autoDentistasDisponiveis().find(x => x.id === id);
  return d ? d.nome : '(dentista removido)';
}

// ── acha/grava UMA linha de automação (geral ou de um dentista) ──
// Não usa upsert com onConflict porque NULL em dentista_id não conta
// como "igual" pro Postgres — faríamos linha geral duplicada. Em vez
// disso, busca manualmente tratando NULL corretamente (.is / .eq).
async function salvarLinhaAutomacao(clinic, a) {
  let q = db.from('automacoes').select('id').eq('clinic_id', clinic.id).eq('tipo', a.tipo);
  q = a.dentista_id ? q.eq('dentista_id', a.dentista_id) : q.is('dentista_id', null);
  const { data: existente } = await q.maybeSingle();

  const payload = {
    clinic_id: clinic.id,
    tipo: a.tipo,
    titulo: a.titulo || a.title,
    mensagem: a.msg || a.mensagem,
    ativo: a.active !== undefined ? a.active : (a.ativo !== undefined ? a.ativo : true),
    dentista_id: a.dentista_id || null,
    updated_at: new Date().toISOString(),
  };

  if (existente) {
    const { error } = await db.from('automacoes').update(payload).eq('id', existente.id);
    return { error, id: existente.id };
  }
  const { data: inserida, error } = await db.from('automacoes').insert(payload).select().single();
  return { error, id: inserida?.id };
}

// ── loadAutomations ──────────────────────────────────────────
async function loadAutomations() {
  const clinic = currentClinic();

  if (!clinic) {
    STATE.automations = AUTOMACOES_DEFAULTS.map(d => ({ ...d, dentista_id: null }));
    return;
  }

  // ⚠️ AJUSTE 22/07: window.DENT_lista() devolve [] na PRIMEIRA chamada
  // depois de trocar de clínica (dispara o carregamento em segundo plano
  // e só devolve os dados de verdade na chamada SEGUINTE). Sem isso, os
  // cards de automação por dentista mostravam "(dentista removido)" pra
  // dentista que existe normalmente — só não tinha carregado ainda.
  // Espera o carregamento terminar ANTES de montar os cards.
  if (typeof window.DENT_carregar === 'function') {
    try { await window.DENT_carregar(); } catch (e) { /* segue mesmo se falhar */ }
  }

  const { data: salvas } = await db
    .from('automacoes')
    .select('*')
    .eq('clinic_id', clinic.id)
    .order('created_at', { ascending: true });

  // versão GERAL de cada tipo padrão (mantém os ids 1-12, comportamento de sempre)
  const merged = AUTOMACOES_DEFAULTS.map(def => {
    const geral = (salvas || []).find(s => s.tipo === def.tipo && !s.dentista_id);
    if (geral) {
      return {
        ...def,
        db_id: geral.id,
        active: geral.ativo,
        ativo: geral.ativo,
        msg: geral.mensagem,
        mensagem: geral.mensagem,
        dentista_id: null,
      };
    }
    return { ...def, dentista_id: null };
  });

  // versões POR DENTISTA de tipos padrão — viram cards extras (ids sintéticos 1000+)
  const porDentista = (salvas || [])
    .filter(s => s.dentista_id && AUTOMACOES_DEFAULTS.find(d => d.tipo === s.tipo))
    .map((s, i) => {
      const def = AUTOMACOES_DEFAULTS.find(d => d.tipo === s.tipo);
      return {
        ...def,
        id: 1000 + i,
        db_id: s.id,
        active: s.ativo,
        ativo: s.ativo,
        msg: s.mensagem,
        mensagem: s.mensagem,
        dentista_id: s.dentista_id,
      };
    });

  // totalmente customizadas (tipo não existe nos padrões) — segue geral apenas, como antes
  const customizadas = (salvas || []).filter(s =>
    !AUTOMACOES_DEFAULTS.find(d => d.tipo === s.tipo)
  );
  const customMapped = customizadas.map((s, i) => ({
    id: 100 + i,
    db_id: s.id,
    tipo: s.tipo,
    titulo: s.titulo || s.tipo,
    title: s.titulo || s.tipo,
    desc: s.descricao || 'Automação personalizada',
    trigger: s.gatilho || 'Manual',
    icon: 'ti-bolt',
    active: s.ativo,
    ativo: s.ativo,
    automatica: false,
    msg: s.mensagem,
    mensagem: s.mensagem,
    customizada: true,
    dentista_id: null,
  }));

  STATE.automations = [...merged, ...porDentista, ...customMapped];
}

// ── renderAutomacoes ─────────────────────────────────────────
function renderAutomacoes() {
  const grid = document.getElementById('autoGrid');
  if (!grid) return;

  const temDentistas = _autoDentistasDisponiveis().length > 0;

  // agrupa por tipo pra desenhar a versão geral + as por-dentista juntas
  const porTipo = {};
  STATE.automations.forEach(a => { (porTipo[a.tipo] = porTipo[a.tipo] || []).push(a); });

  // ⚠️ AJUSTE 22/07: antes cada card e o botão "+ versão por dentista"
  // eram itens SOLTOS dentro do grid externo de 3 colunas. Quando um
  // tipo só tinha 1 card (a maioria), o botão (que precisa da linha
  // inteira) não cabia mais na linha do card e o navegador pulava pra
  // próxima linha SEM preencher as 2 colunas que sobraram — ficavam
  // vazias pra sempre (grid não "recua" pra preencher buraco). Resultado:
  // tudo espremido numa faixa estreita à esquerda, resto da tela vazio.
  // Agora cada TIPO vira um bloco próprio (ocupa a linha inteira do grid
  // externo) com layout flex INTERNO pros seus cards — sem depender do
  // grid externo pra encaixar card+botão juntos, então não sobra buraco.
  grid.innerHTML = Object.keys(porTipo).map(tipo => {
    const itens = porTipo[tipo].slice().sort((a, b) => (a.dentista_id ? 1 : 0) - (b.dentista_id ? 1 : 0));
    const cards = itens.map(a => cardAutomacao(a)).join('');
    const podeVersaoPorDentista = temDentistas && AUTOMACOES_DEFAULTS.find(d => d.tipo === tipo);
    const botaoVersao = podeVersaoPorDentista
      ? `<button class="btn btn-sm" style="margin-top:2px;" onclick="criarVersaoAutoPorDentista('${tipo}')"><i class="ti ti-stethoscope"></i> + versão por dentista para "${(itens[0].titulo || itens[0].title)}"</button>`
      : '';
    return `<div style="grid-column:1/-1;">
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:stretch;">${cards}</div>
      ${botaoVersao}
    </div>`;
  }).join('');
}

function cardAutomacao(a) {
  const nomeDentista = a.dentista_id ? _autoNomeDentista(a.dentista_id) : null;
  return `
    <div class="auto-card" style="min-width:0;flex:1 1 360px;max-width:420px;${nomeDentista ? 'border-left:3px solid var(--gold,#C9A84C);' : ''}">
      <div class="auto-card-top">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
          <div class="auto-card-icon"><i class="ti ${a.icon || 'ti-bolt'}"></i></div>
          ${a.automatica
            ? `<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:var(--gold-pale);color:var(--gold);border:1px solid var(--gold-border);font-weight:700;">⚡ AUTOMÁTICO</span>`
            : `<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:rgba(255,255,255,0.05);color:var(--text-muted);border:1px solid var(--border-subtle);">MANUAL</span>`
          }
        </div>
        <div class="auto-title">${a.title || a.titulo}${nomeDentista ? ` <span style="font-size:11px;font-weight:600;color:var(--gold);">🦷 ${nomeDentista}</span>` : ''}</div>
        <div class="auto-desc">${nomeDentista ? `Só quando a consulta for com ${nomeDentista}.` : a.desc}</div>
      </div>
      <div class="auto-body">
        <div class="auto-trigger-label">Gatilho: ${a.trigger}</div>
        <div class="auto-msg" style="margin-top:8px;overflow-wrap:anywhere;word-break:break-word;">${(a.msg || a.mensagem || '').replace(/\n/g, '<br>')}</div>
      </div>
      <div class="auto-footer">
        <div class="toggle-wrap">
          <div class="toggle ${a.active ? '' : 'off'}" onclick="toggleAuto(${a.id})">
            <div class="toggle-knob"></div>
          </div>
          <span class="toggle-label" style="color:${a.active ? 'var(--gold)' : 'var(--text-secondary)'};">
            ${a.active ? (a.automatica ? '⚡ Automático' : '✓ Ativo') : 'Inativo'}
          </span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm" onclick="editAuto(${a.id})"><i class="ti ti-edit"></i> Editar</button>
          ${(a.customizada || nomeDentista) ? `<button class="btn btn-sm btn-danger" onclick="excluirAuto(${a.id})"><i class="ti ti-trash"></i></button>` : ''}
        </div>
      </div>
    </div>`;
}

// ── toggleAuto ───────────────────────────────────────────────
async function toggleAuto(id) {
  const a = STATE.automations.find(x => x.id === id);
  if (!a) return;
  a.active = !a.active;
  a.ativo = a.active;

  const clinic = currentClinic();
  if (clinic) {
    const { error, id: dbId } = await salvarLinhaAutomacao(clinic, a);
    if (error) { toast('Erro: ' + error.message, 'error'); a.active = !a.active; a.ativo = a.active; renderAutomacoes(); return; }
    if (dbId) a.db_id = dbId;
  }

  renderAutomacoes();
  toast((a.title || a.titulo) + (a.active ? (a.automatica ? ' — agora automático! ⚡' : ' ativada') : ' desativada'));
}

// ── editAuto ─────────────────────────────────────────────────
function editAuto(id) {
  const a = STATE.automations.find(x => x.id === id);
  if (!a) return;
  document.getElementById('editAutoId').value = id;
  document.getElementById('editAutoTitle').textContent = (a.title || a.titulo) + (a.dentista_id ? ' — 🦷 ' + _autoNomeDentista(a.dentista_id) : '');
  document.getElementById('editAutoMsg').value = a.msg || a.mensagem || '';
  const toggle = document.getElementById('editAutoToggle');
  if (toggle) {
    toggle.className = 'toggle ' + (a.automatica ? '' : 'off');
  }

  // seletor de dentista (só aparece se essa linha É uma versão por dentista)
  let selDent = document.getElementById('editAutoDentista');
  if (a.dentista_id) {
    if (!selDent) {
      selDent = document.createElement('select');
      selDent.id = 'editAutoDentista';
      selDent.className = 'form-select';
      selDent.style.marginBottom = '10px';
      const msgEl = document.getElementById('editAutoMsg');
      if (msgEl && msgEl.parentNode) msgEl.parentNode.insertBefore(selDent, msgEl);
    }
    selDent.style.display = '';
    selDent.innerHTML = _autoDentistasDisponiveis().map(d => `<option value="${d.id}" ${d.id === a.dentista_id ? 'selected' : ''}>${d.nome}</option>`).join('');
  } else if (selDent) {
    selDent.style.display = 'none';
  }

  openModal('modalEditAuto');
}

// ── toggleEditAutoMatica ──────────────────────────────────────
function toggleEditAutoMatica() {
  const toggle = document.getElementById('editAutoToggle');
  if (!toggle) return;
  const isOff = toggle.classList.contains('off');
  toggle.className = 'toggle ' + (isOff ? '' : 'off');
}

// ── saveAutoEdit ─────────────────────────────────────────────
async function saveAutoEdit() {
  const id = parseInt(document.getElementById('editAutoId').value);
  const a = STATE.automations.find(x => x.id === id);
  if (!a) return;

  const novaMsg = document.getElementById('editAutoMsg').value;
  const toggle = document.getElementById('editAutoToggle');
  const novaAutomatica = toggle ? !toggle.classList.contains('off') : a.automatica;
  const selDent = document.getElementById('editAutoDentista');
  if (a.dentista_id && selDent && selDent.value) a.dentista_id = selDent.value;

  a.msg = novaMsg;
  a.mensagem = novaMsg;
  a.automatica = novaAutomatica;

  const clinic = currentClinic();
  if (clinic) {
    const { error, id: dbId } = await salvarLinhaAutomacao(clinic, a);
    if (error) { toast('Erro: ' + error.message, 'error'); return; }
    if (dbId) a.db_id = dbId;
    toast('Automação salva! ✓');
  }

  closeModal('modalEditAuto');
  renderAutomacoes();
}

// ── criarVersaoAutoPorDentista ────────────────────────────────
// Cria, na tela, uma nova versão de uma automação padrão pra um
// dentista específico (a partir da geral). Só grava no banco quando
// o usuário clicar Salvar no modal de edição (que já abre em seguida).
function criarVersaoAutoPorDentista(tipoBase) {
  const lista = _autoDentistasDisponiveis();
  if (!lista.length) { toast('Cadastre os dentistas primeiro (menu Dentistas).', 'error'); return; }
  const geral = STATE.automations.find(a => a.tipo === tipoBase && !a.dentista_id);
  if (!geral) return;
  const jaUsados = new Set(STATE.automations.filter(a => a.tipo === tipoBase && a.dentista_id).map(a => a.dentista_id));
  const proximo = lista.find(d => !jaUsados.has(d.id));
  if (!proximo) { toast('Já existe uma versão pra todos os dentistas cadastrados.', 'error'); return; }

  const novoId = 1000 + STATE.automations.filter(a => a.id >= 1000).length + 1;
  const nova = { ...geral, id: novoId, db_id: null, dentista_id: proximo.id };
  STATE.automations.push(nova);
  renderAutomacoes();
  editAuto(novoId);
}

// ── excluirAuto ──────────────────────────────────────────────
async function excluirAuto(id) {
  const a = STATE.automations.find(x => x.id === id);
  if (!a || (!a.customizada && !a.dentista_id)) return; // não deixa apagar a versão geral padrão
  const rotulo = (a.titulo || a.title) + (a.dentista_id ? ' (🦷 ' + _autoNomeDentista(a.dentista_id) + ')' : '');
  if (!confirm(`Excluir a automação "${rotulo}"?`)) return;

  const clinic = currentClinic();
  if (clinic && a.db_id) {
    const { error } = await db.from('automacoes').delete().eq('id', a.db_id);
    if (error) { toast('Erro: ' + error.message, 'error'); return; }
  }

  STATE.automations = STATE.automations.filter(x => x.id !== id);
  renderAutomacoes();
  toast('Automação excluída!');
}

// ── openNovaAutomacao ─────────────────────────────────────────
function openNovaAutomacao() {
  document.getElementById('novaAutoTitulo').value = '';
  document.getElementById('novaAutoGatilho').value = '';
  document.getElementById('novaAutoMsg').value = '';
  openModal('modalNovaAuto');
}

// ── salvarNovaAutomacao ──────────────────────────────────────
async function salvarNovaAutomacao() {
  const titulo = document.getElementById('novaAutoTitulo').value.trim();
  const gatilho = document.getElementById('novaAutoGatilho').value.trim();
  const mensagem = document.getElementById('novaAutoMsg').value.trim();

  if (!titulo || !mensagem) { toast('Preencha título e mensagem', 'error'); return; }

  const clinic = currentClinic();
  if (!clinic) { toast('Selecione uma clínica', 'error'); return; }

  const tipo = 'custom_' + titulo.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20) + '_' + Date.now();

  const { data: saved, error } = await db.from('automacoes').insert({
    clinic_id: clinic.id,
    tipo,
    titulo,
    mensagem,
    gatilho: gatilho || 'Manual',
    ativo: true,
    dentista_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single();

  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }

  const novaAuto = {
    id: 100 + STATE.automations.filter(a => a.customizada).length + 1,
    db_id: saved.id,
    tipo,
    titulo,
    title: titulo,
    desc: 'Automação personalizada',
    trigger: gatilho || 'Manual',
    icon: 'ti-bolt',
    active: true,
    ativo: true,
    automatica: false,
    msg: mensagem,
    mensagem,
    customizada: true,
    dentista_id: null,
  };

  STATE.automations.push(novaAuto);
  closeModal('modalNovaAuto');
  renderAutomacoes();
  toast(`Automação "${titulo}" criada! ✓`);
}

console.log('✅ automacoes-v2.js carregado com sucesso (v3 — 12 automações + versão por dentista)');
