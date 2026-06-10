// ============================================================
// CLINICALEAD — AUTOMAÇÕES V2
// Adiciona: lembrete 2h, nova automação, chavinha = automático
// ============================================================

// ── DEFAULTS COM LEMBRETE 2H ────────────────────────────────
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
    desc: 'Enviada imediatamente ao registrar a consulta.',
    trigger: 'Consulta agendada', icon: 'ti-calendar-check',
    active: true, ativo: true, automatica: true,
    msg: 'Olá, {nome}! 🎉 Sua consulta está *confirmada*!\n\n📅 *Data:* {data}\n⏰ *Horário:* {hora}\n📍 *Endereço:* R. Rui Barbosa, 483 - Centro, Araguari - MG\n🗺️ https://share.google/aBRk2BmdSOHL2iN9X\n\nQualquer dúvida, é só chamar aqui! Te esperamos 😊',
  },
  {
    id: 3, tipo: 'lembrete2h',
    titulo: 'Lembrete 2h antes', title: 'Lembrete 2h antes',
    desc: 'Enviado automaticamente 2h antes da consulta.',
    trigger: '2h antes da consulta', icon: 'ti-bell',
    active: true, ativo: true, automatica: true,
    msg: 'Oi {nome}! ⏰ Sua consulta na *{clinica}* é *hoje às {hora}*!\n\n📍 R. Rui Barbosa, 483 - Centro, Araguari - MG\n🗺️ https://share.google/aBRk2BmdSOHL2iN9X\n\nTe esperamos! 😊',
  },
  {
    id: 4, tipo: 'lembrete',
    titulo: 'Lembrete 24h antes', title: 'Lembrete 24h antes',
    desc: 'Enviado automaticamente 24h antes da consulta.',
    trigger: '24h antes da consulta', icon: 'ti-clock',
    active: true, ativo: true, automatica: true,
    msg: 'Oi {nome}! 👋 Passando para lembrar que *amanhã* você tem consulta conosco!\n\n⏰ *Horário:* {hora}\n📍 *Endereço:* R. Rui Barbosa, 483 - Centro, Araguari - MG\n🗺️ https://share.google/aBRk2BmdSOHL2iN9X\n\nConfirma sua presença? Responda *SIM* ou *NÃO* 😊',
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

  // Merge defaults com salvas
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

  // Adiciona automações customizadas (não estão nos defaults)
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
  openModal('modalEditAuto');
}

// ── saveAutoEdit ─────────────────────────────────────────────
async function saveAutoEdit() {
  const id = parseInt(document.getElementById('editAutoId').value);
  const a = STATE.automations.find(x => x.id === id);
  if (!a) return;

  const novaMsg = document.getElementById('editAutoMsg').value;
  a.msg = novaMsg;
  a.mensagem = novaMsg;

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
    toast('Mensagem salva para esta clínica! ✓');
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

  // Gera tipo único baseado no título
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

console.log('✅ automacoes-v2.js carregado com sucesso');
