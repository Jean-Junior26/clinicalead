// ============================================================
// CLINICALEAD — FUNÇÕES DE AUTOMAÇÕES CORRIGIDAS
// ============================================================

// ── HELPER: salvar mensagem no Inbox ────────────────────────
async function salvarMensagemInbox(clinic, phone, contactName, content) {
  if (!clinic?.id || !phone || !content) return;
  try {
    await db.from('mensagens').insert({
      clinic_id: clinic.id,
      phone: phone.replace(/\D/g, ''),
      contact_name: contactName || '',
      content: content,
      type: 'text',
      from_me: true,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Erro ao salvar mensagem no inbox:', e);
  }
}

// ── HELPER: substituir variáveis na mensagem ─────────────────
function substituirVariaveis(template, lead, clinic, data, hora) {
  return (template || '')
    .replace(/{nome}/g, lead?.nome || '')
    .replace(/{procedimento}/g, lead?.procedimento || '')
    .replace(/{clinica}/g, clinic?.nome || '')
    .replace(/{data}/g, data || '')
    .replace(/{hora}/g, hora || '');
}

// ── loadAutomations ──────────────────────────────────────────
async function loadAutomations() {
  const clinic = currentClinic();

  const defaults = [
    {
      id: 1, tipo: 'boasvindas',
      titulo: 'Boas-vindas ao novo lead', title: 'Boas-vindas ao novo lead',
      desc: 'Enviada assim que um novo lead entra no sistema.',
      trigger: 'Lead criado', icon: 'ti-hand-click', active: true, ativo: true,
      msg: 'Olá, {nome}! 😊 Tudo bem?\n\nAqui é da *{clinica}*! Vi que você tem interesse em *{procedimento}* e adoraria te ajudar nessa jornada.\n\nPosso te agendar uma *avaliação gratuita e sem compromisso*? É rapidinho, a gente te explica tudo pessoalmente! 🦷\n\nQual o melhor dia pra você?',
    },
    {
      id: 2, tipo: 'confirmacao',
      titulo: 'Confirmação de agendamento', title: 'Confirmação de agendamento',
      desc: 'Enviada imediatamente ao registrar a consulta.',
      trigger: 'Consulta agendada', icon: 'ti-calendar-check', active: true, ativo: true,
      msg: 'Olá, {nome}! 🎉 Sua consulta está *confirmada*!\n\n📅 *Data:* {data}\n⏰ *Horário:* {hora}\n📍 *Endereço:* R. Rui Barbosa, 483 - Centro, Araguari - MG\n🗺️ https://share.google/aBRk2BmdSOHL2iN9X\n\nQualquer dúvida, é só chamar aqui! Te esperamos 😊',
    },
    {
      id: 3, tipo: 'lembrete',
      titulo: 'Lembrete 24h antes', title: 'Lembrete 24h antes',
      desc: 'Enviado 24h antes para reduzir faltas.',
      trigger: '24h antes da consulta', icon: 'ti-clock', active: true, ativo: true,
      msg: 'Oi {nome}! 👋 Passando para lembrar que *amanhã* você tem consulta conosco!\n\n⏰ *Horário:* {hora}\n📍 *Endereço:* R. Rui Barbosa, 483 - Centro, Araguari - MG\n🗺️ https://share.google/aBRk2BmdSOHL2iN9X\n\nConfirma sua presença? Responda *SIM* ou *NÃO* 😊',
    },
    {
      id: 4, tipo: 'followup',
      titulo: 'Follow-up sem resposta', title: 'Follow-up sem resposta',
      desc: 'Reativa leads sem resposta após 48h.',
      trigger: '48h sem resposta', icon: 'ti-refresh', active: true, ativo: true,
      msg: 'Oi {nome}, tudo bem? 😊\n\nVi que ainda não conseguimos conversar sobre *{procedimento}* e queria saber se ainda posso te ajudar!\n\nTemos horários disponíveis essa semana para uma *avaliação gratuita*. Seria ótimo te conhecer pessoalmente 🦷\n\nQual o melhor momento pra você?',
    },
    {
      id: 5, tipo: 'posconsulta',
      titulo: 'Pós-consulta', title: 'Pós-consulta',
      desc: 'Enviada 2h após comparecimento.',
      trigger: 'Status = Compareceu', icon: 'ti-heart', active: true, ativo: true,
      msg: 'Oi {nome}! 😊 Foi um prazer te receber hoje na *{clinica}*!\n\nEspero que tenha gostado da avaliação e que tenha tirado todas as suas dúvidas.\n\nCaso queira dar continuidade ao tratamento de *{procedimento}*, temos condições especiais de pagamento e parcelamento. Posso te passar mais detalhes? 💛',
    },
    {
      id: 6, tipo: 'reativacao',
      titulo: 'Reativação de lead frio', title: 'Reativação de lead frio',
      desc: 'Reativa leads inativos há 7+ dias.',
      trigger: '7 dias sem atividade', icon: 'ti-star', active: false, ativo: false,
      msg: 'Oi {nome}! 🌟 Tudo bem?\n\nPassei aqui porque lembrei de você e queria saber se ainda tem interesse em cuidar do seu sorriso com a gente! 😊\n\nEsse mês temos uma *condição especial* para *{procedimento}* com formas facilitadas de pagamento.\n\nPosso te contar mais detalhes? É por tempo limitado! 🦷',
    },
  ];

  if (!clinic) {
    STATE.automations = defaults;
    return;
  }

  const { data: salvas } = await db
    .from('automacoes')
    .select('*')
    .eq('clinic_id', clinic.id);

  STATE.automations = defaults.map(def => {
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
  toast((a.title || a.titulo) + (a.active ? ' ativada' : ' desativada'));
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
      ativo: a.active !== undefined ? a.active : (a.ativo !== undefined ? a.ativo : true),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id,tipo' });
    toast('Mensagem salva para esta clínica! ✓');
  }

  closeModal('modalEditAuto');
  renderAutomacoes();
}

// ── sendAutomation ───────────────────────────────────────────
async function sendAutomation(lead, autoTipo) {
  const clinic = currentClinic();
  if (!clinic?.whatsapp_instance) return;
  if (!lead?.telefone) return;

  const auto = STATE.automations.find(a => a.tipo === autoTipo);
  if (!auto || !auto.active) return;

  const msg = substituirVariaveis(auto.msg || auto.mensagem, lead, clinic, '', '');
  if (!msg.trim()) return;

  try {
    await sendWhatsAppMessage(clinic.whatsapp_instance, lead.telefone, msg);
    await salvarMensagemInbox(clinic, lead.telefone, lead.nome, msg);
    toast('WhatsApp enviado para ' + lead.nome + '! ✓');
  } catch (e) {
    console.error('Erro sendAutomation:', e);
    toast('Erro ao enviar WhatsApp', 'error');
  }
}

// ── saveNewLead ──────────────────────────────────────────────
async function saveNewLead() {
  const nome = document.getElementById('nlName').value.trim();
  const procedimento = document.getElementById('nlProc').value;
  if (!nome || !procedimento) { toast('Preencha nome e procedimento', 'error'); return; }

  const newLead = {
    clinic_id: currentClinic().id,
    nome,
    telefone: document.getElementById('nlPhone').value,
    procedimento,
    origem: document.getElementById('nlSource').value,
    valor: parseFloat(document.getElementById('nlValue').value) || null,
    observacoes: document.getElementById('nlObs').value,
    status: 'novo',
  };

  const { data, error } = await db.from('leads').insert(newLead).select().single();
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }

  STATE.leads.unshift(data);
  document.getElementById('navLeadsBadge').textContent = STATE.leads.length;
  closeModal('modalNewLead');
  renderPage(document.querySelector('.page.active')?.id?.replace('page-', ''));
  toast(`${nome} adicionado como novo lead! 🎉`);

  if (data.telefone) {
    await sendAutomation(data, 'boasvindas');
  }
}

// ── salvarNovoAgendamento ────────────────────────────────────
async function salvarNovoAgendamento() {
  const leadId = document.getElementById('naLead').value;
  const data = document.getElementById('naData').value;
  const hora = document.getElementById('naHora').value;
  const obs = document.getElementById('naObs').value;

  if (!leadId || !data || !hora) { toast('Preencha paciente, data e horário', 'error'); return; }

  const clinic = currentClinic();
  const taken = CAL.consultas.find(c => c.data === data && c.hora === hora);
  if (taken) { toast('Este horário já está ocupado!', 'error'); return; }

  const nova = { clinic_id: clinic.id, lead_id: leadId, data, hora, status: 'agendado', observacoes: obs };
  const { data: saved, error } = await db.from('consultas').insert(nova).select().single();
  if (error) { toast('Erro ao agendar: ' + error.message, 'error'); return; }

  CAL.consultas.push(saved);

  const lead = STATE.leads.find(l => l.id === leadId);
  if (lead && (lead.status === 'novo' || lead.status === 'contato')) {
    lead.status = 'agendado';
    await db.from('leads').update({ status: 'agendado' }).eq('id', leadId);
  }

  closeModal('modalNovoAgendamento');
  CAL.selectedDate = data;
  renderCalendar();
  renderDaySchedule(data);
  toast('Consulta agendada! ✓');

  if (clinic?.whatsapp_instance && lead?.telefone) {
    const auto = STATE.automations.find(a => a.tipo === 'confirmacao');
    if (auto?.active) {
      const dataFormatada = new Date(data + 'T12:00').toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long'
      });
      const msg = substituirVariaveis(auto.msg || auto.mensagem, lead, clinic, dataFormatada, hora);
      try {
        await sendWhatsAppMessage(clinic.whatsapp_instance, lead.telefone, msg);
        await salvarMensagemInbox(clinic, lead.telefone, lead.nome, msg);
        toast('Confirmação enviada por WhatsApp e salva no Inbox! ✓');
      } catch (e) {
        console.error('Erro ao enviar confirmação:', e);
      }
    }
  }
}

// ── sendWAConsulta ───────────────────────────────────────────
async function sendWAConsulta(consultaId) {
  const c = CAL.consultas.find(x => x.id === consultaId);
  if (!c) return;
  const lead = STATE.leads.find(l => l.id === c.lead_id);
  const clinic = currentClinic();

  if (!clinic?.whatsapp_instance || !lead?.telefone) {
    toast('Configure o WhatsApp primeiro!', 'error');
    return;
  }

  const auto = STATE.automations.find(a => a.tipo === 'lembrete');
  const dataFormatada = new Date(c.data + 'T12:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  const msg = (auto?.active && (auto.msg || auto.mensagem))
    ? substituirVariaveis(auto.msg || auto.mensagem, lead, clinic, dataFormatada, c.hora)
    : `Oi ${lead.nome}! 👋 Passando para lembrar que *amanhã* você tem consulta conosco!\n\n⏰ *Horário:* ${c.hora}\n📍 *Endereço:* R. Rui Barbosa, 483 - Centro, Araguari - MG\n🗺️ https://share.google/aBRk2BmdSOHL2iN9X\n\nConfirma sua presença? Responda *SIM* ou *NÃO* 😊`;

  try {
    await sendWhatsAppMessage(clinic.whatsapp_instance, lead.telefone, msg);
    await db.from('consultas').update({ status: 'confirmado' }).eq('id', consultaId);
    c.status = 'confirmado';
    await salvarMensagemInbox(clinic, lead.telefone, lead.nome, msg);
    renderDaySchedule(CAL.selectedDate);
    toast('Lembrete enviado e salvo no Inbox! ✓');
  } catch (e) {
    toast('Erro ao enviar WhatsApp', 'error');
  }
}

// ── marcarCompareceu ─────────────────────────────────────────
async function marcarCompareceu(consultaId) {
  const c = CAL.consultas.find(x => x.id === consultaId);
  if (!c) return;

  c.status = 'compareceu';
  await db.from('consultas').update({ status: 'compareceu' }).eq('id', consultaId);

  const lead = STATE.leads.find(l => l.id === c.lead_id);
  if (lead) {
    lead.status = 'compareceu';
    await db.from('leads').update({ status: 'compareceu' }).eq('id', lead.id);
  }

  renderDaySchedule(CAL.selectedDate);
  toast('Marcado como compareceu!');

  if (lead) {
    await sendAutomation(lead, 'posconsulta');
  }
}

// ── confirmarEnvioWA ─────────────────────────────────────────
async function confirmarEnvioWA() {
  const leadId = document.getElementById('sendWALeadId').value;
  const l = STATE.leads.find(x => x.id === leadId);
  const msg = document.getElementById('sendWAMsg').value.trim();
  const clinic = currentClinic();

  if (!msg) { toast('Digite uma mensagem', 'error'); return; }

  try {
    await sendWhatsAppMessage(clinic.whatsapp_instance, l.telefone, msg);
    await salvarMensagemInbox(clinic, l.telefone, l.nome, msg);
    closeModal('modalSendWA');
    toast(`WhatsApp enviado para ${l.nome} e salvo no Inbox! ✓`);
  } catch (e) {
    toast('Erro ao enviar: ' + e.message, 'error');
  }
}

// ── updateWAPreview ──────────────────────────────────────────
function updateWAPreview() {
  const leadId = document.getElementById('sendWALeadId').value;
  const l = STATE.leads.find(x => x.id === leadId);
  const clinic = currentClinic();
  const type = document.getElementById('sendWATemplate').value;

  const autoMap = {
    boasvindas: 'boasvindas',
    confirmacao: 'confirmacao',
    lembrete: 'lembrete',
    followup: 'followup',
    posconsulta: 'posconsulta',
  };

  if (autoMap[type]) {
    const auto = STATE.automations.find(a => a.tipo === autoMap[type]);
    if (auto) {
      const msg = substituirVariaveis(auto.msg || auto.mensagem, l, clinic, '{data}', '{hora}');
      document.getElementById('sendWAMsg').value = msg;
      return;
    }
  }

  document.getElementById('sendWAMsg').value = '';
}

// ── switchClinic: corrigido — limpa agenda ao trocar clínica ─
async function switchClinic(idx) {
  const clinic = STATE.clinics[idx];
  const isAdmin = STATE.profile?.role === 'admin' || STATE.profile?.role === 'administrador';

  if (!isAdmin && clinic?.bloqueado) {
    toast('Esta clínica está bloqueada!', 'error');
    return;
  }

  STATE.currentClinicIdx = idx;
  document.getElementById('clinicDropdown').classList.remove('open');
  renderClinicSwitcher();
  await loadLeads();
  await loadAutomations();
  CAL.consultas = []; // limpa agenda da clínica anterior
  CAL.selectedDate = null; // limpa dia selecionado
  renderPage(document.querySelector('.page.active')?.id?.replace('page-', '') || 'dashboard');
  toast('Clínica: ' + currentClinic()?.nome);
}

console.log('✅ automacoes-fix.js carregado com sucesso');
