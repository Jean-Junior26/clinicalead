// ============================================================
// CLINICALEAD — AUTOMAÇÕES V3
// Variáveis disponíveis nas mensagens:
//   {nome} {clinica} {procedimento} {data} {hora}
// Dica: cada clínica deve editar as mensagens de confirmação e
// lembretes para incluir o PRÓPRIO endereço e link do Maps.
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

// ── loadAutomations ──────────────────────────────────────────
async function loadAutomations() {
  const clinic = currentClinic();

  if (!clinic) {
    STATE.automations = AUTOMACOES_DEFAULTS.map(d => ({ ...d }));
    return;
  }

  const { data: salvas } = await db
    .from('automacoes')
    .select('*')
    .eq('clinic_id', clinic.id)
    .order('created_at', { ascending: true });

  const merged = AUTOMACOES_DEFAULTS.map(def => {
    const salva = (salvas || []).find(s => s.tipo === def.tipo);
    if (salva) {
      return {
        ...def,
        db_id: salva.id,
        active: salva.ativo,
        ativo: salva.ativo,
        msg: salva.mensagem,
        mensagem: salva.mensagem,
      };
    }
    return { ...def };
  });

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
  }));

  STATE.automations = [...merged, ...customMapped];
}

// ── renderAutomacoes ─────────────────────────────────────────
function renderAutomacoes() {
  const grid = document.getElementById('autoGrid');
  if (!grid) return;

  grid.innerHTML = STATE.automations.map(a => `
    <div class="auto-card">
      <div class="auto-card-top">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
          <div class="auto-card-icon"><i class="ti ${a.icon || 'ti-bolt'}"></i></div>
          ${a.automatica
            ? `<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:var(--gold-pale);color:var(--gold);border:1px solid var(--gold-border);font-weight:700;">⚡ AUTOMÁTICO</span>`
            : `<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:rgba(255,255,255,0.05);color:var(--text-muted);border:1px solid var(--border-subtle);">MANUAL</span>`
          }
        </div>
        <div class="auto-title">${a.title || a.titulo}</div>
        <div class="auto-desc">${a.desc}</div>
      </div>
      <div class="auto-body">
        <div class="auto-trigger-label">Gatilho: ${a.trigger}</div>
        <div class="auto-msg" style="margin-top:8px;">${(a.msg || a.mensagem || '').replace(/\n/g, '<br>')}</div>
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
          ${a.customizada ? `<button class="btn btn-sm btn-danger" onclick="excluirAuto(${a.id})"><i class="ti ti-trash"></i></button>` : ''}
        </div>
      </div>
    </div>`).join('');
}

// ── toggleAuto ───────────────────────────────────────────────
async function toggleAuto(id) {
  const a = STATE.automations.find(x => x.id === id);
  if (!a) return;
  a.active = !a.active;
  a.ativo = a.active;

  const clinic = currentClinic();
  if (clinic) {
    await db.from('automacoes').upsert({
      clinic_id: clinic.id,
      tipo: a.tipo,
      titulo: a.titulo || a.title,
      mensagem: a.msg || a.mensagem,
      ativo: a.active,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id,tipo' });
  }

  renderAutomacoes();
  toast((a.title || a.titulo) + (a.active ? (a.automatica ? ' — agora automático! ⚡' : ' ativada') : ' desativada'));
}

// ── editAuto ─────────────────────────────────────────────────
function editAuto(id) {
  const a = STATE.automations.find(x => x.id === id);
  if (!a) return;
  document.getElementById('editAutoId').value = id;
  document.getElementById('editAutoTitle').textContent = a.title || a.titulo;
  document.getElementById('editAutoMsg').value = a.msg || a.mensagem || '';
  const toggle = document.getElementById('editAutoToggle');
  if (toggle) {
    toggle.className = 'toggle ' + (a.automatica ? '' : 'off');
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

  a.msg = novaMsg;
  a.mensagem = novaMsg;
  a.automatica = novaAutomatica;

  const clinic = currentClinic();
  if (clinic) {
    await db.from('automacoes').upsert({
      clinic_id: clinic.id,
      tipo: a.tipo,
      titulo: a.titulo || a.title,
      mensagem: novaMsg,
      ativo: a.active !== undefined ? a.active : true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id,tipo' });
    toast('Automação salva! ✓');
  }

  closeModal('modalEditAuto');
  renderAutomacoes();
}

// ── excluirAuto ──────────────────────────────────────────────
async function excluirAuto(id) {
  const a = STATE.automations.find(x => x.id === id);
  if (!a || !a.customizada) return;
  if (!confirm(`Excluir a automação "${a.titulo || a.title}"?`)) return;

  const clinic = currentClinic();
  if (clinic && a.db_id) {
    await db.from('automacoes').delete().eq('id', a.db_id);
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
  };

  STATE.automations.push(novaAuto);
  closeModal('modalNovaAuto');
  renderAutomacoes();
  toast(`Automação "${titulo}" criada! ✓`);
}

console.log('✅ automacoes-v2.js carregado com sucesso (v3 — 12 automações)');
