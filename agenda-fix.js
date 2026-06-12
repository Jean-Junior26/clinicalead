// ============================================================
// CLINICALEAD — AGENDA FIX
// Parte 1: horários personalizados salvos no Supabase
// Parte 2: campo Procedimento no agendamento (catálogo vivo)
// ============================================================

// ── CARREGAR HORÁRIOS DA CLÍNICA ─────────────────────────────
async function loadHorariosClinica() {
  const clinic = currentClinic();
  if (!clinic) return;
  const { data } = await db
    .from('agenda_config')
    .select('horarios')
    .eq('clinic_id', clinic.id)
    .single();
  if (data?.horarios && data.horarios.length > 0) {
    CAL.horariosDisponiveis = data.horarios;
  } else {
    // Horários padrão
    CAL.horariosDisponiveis = [
      '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
      '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30'
    ];
  }
}
// ── SALVAR HORÁRIOS DA CLÍNICA ───────────────────────────────
async function salvarHorariosClinica() {
  const clinic = currentClinic();
  if (!clinic) return;
  await db.from('agenda_config').upsert({
    clinic_id: clinic.id,
    horarios: CAL.horariosDisponiveis,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'clinic_id' });
}
// ── ADICIONAR NOVO HORÁRIO ───────────────────────────────────
async function adicionarNovoHorario() {
  const val = document.getElementById('novoHorarioInput').value;
  if (!val) { toast('Selecione um horário', 'error'); return; }
  const hora = val.slice(0, 5);
  if (CAL.horariosDisponiveis.includes(hora)) { toast('Horário já existe!', 'error'); return; }
  CAL.horariosDisponiveis.push(hora);
  CAL.horariosDisponiveis.sort();
  await salvarHorariosClinica();
  const dateStr = CAL.selectedDate || new Date().toISOString().split('T')[0];
  renderConfigSlotsGrid(dateStr);
  toast(hora + ' adicionado e salvo! ✓');
}
// ── CARREGAR CONSULTAS + HORÁRIOS ────────────────────────────
async function loadConsultas() {
  const clinic = currentClinic();
  if (!clinic) return;
  try {
    await loadHorariosClinica();
    const { data } = await db
      .from('consultas')
      .select('*')
      .eq('clinic_id', clinic.id)
      .order('data')
      .order('hora');
    CAL.consultas = data || [];
  } catch(e) {
    CAL.consultas = [];
  }
}
// ── SALVAR CONFIGURAÇÃO DA AGENDA ────────────────────────────
async function salvarConfigAgenda() {
  await salvarHorariosClinica();
  closeModal('modalConfigAgenda');
  if (CAL.selectedDate) renderDaySchedule(CAL.selectedDate);
  toast('Configuração salva! ✓');
}

let AGF = { procs: [] };

// ── Carrega o catálogo ativo da clínica ──────────────────────
async function agfCarregarProcs() {
  const clinic = currentClinic();
  if (!clinic) return;
  const { data } = await db.from('procedimentos')
    .select('id,nome').eq('clinic_id', clinic.id).eq('ativo', true).order('nome');
  AGF.procs = data || [];
}

// ── Injeta o select no modal (uma vez) ───────────────────────
function agfInjetarSelect() {
  if (!document.getElementById('naProcedimentoGroup')) {
    const obsGroup = document.getElementById('naObs')?.closest('.form-group');
    if (!obsGroup) return;
    const g = document.createElement('div');
    g.className = 'form-group';
    g.id = 'naProcedimentoGroup';
    g.innerHTML = `
      <label class="form-label">Procedimento</label>
      <select class="form-select" id="naProcedimento">
        <option value="">Selecione (opcional)</option>
      </select>`;
    obsGroup.insertAdjacentElement('beforebegin', g);
    document.getElementById('naLead')?.addEventListener('change', agfSugerirDoLead);
  }
  agfPopularSelect();
}

function agfPopularSelect(manterValor) {
  const sel = document.getElementById('naProcedimento');
  if (!sel) return;
  const atual = manterValor ? sel.value : '';
  sel.innerHTML = '<option value="">Selecione (opcional)</option>' +
    AGF.procs.map(p => `<option value="${p.nome.replace(/"/g, '&quot;')}">${p.nome}</option>`).join('');
  sel.value = atual;
}

// ── Sugestão automática: procedimento do lead escolhido ──────
function agfSugerirDoLead() {
  const leadId = document.getElementById('naLead')?.value;
  const sel = document.getElementById('naProcedimento');
  if (!leadId || !sel || sel.value) return;
  const lead = (STATE.leads || []).find(l => l.id === leadId);
  if (!lead?.procedimento) return;
  const match = AGF.procs.find(p => p.nome.toLowerCase() === lead.procedimento.toLowerCase());
  if (match) sel.value = match.nome;
}

// ── Engata nos modais de agendamento ─────────────────────────
(function () {
  const _openNA = openNovoAgendamento;
  openNovoAgendamento = function () {
    _openNA();
    agfInjetarSelect();
    agfCarregarProcs().then(() => agfPopularSelect(true));
  };

  const _openNAH = openNovoAgendamentoHora;
  openNovoAgendamentoHora = function (dateStr, hora) {
    _openNAH(dateStr, hora);
    agfInjetarSelect();
    agfCarregarProcs().then(() => agfPopularSelect(true));
  };
})();

// ── Salvamento com o procedimento incluído ───────────────────
salvarNovoAgendamento = async function () {
  const leadId = document.getElementById('naLead').value;
  const data = document.getElementById('naData').value;
  const hora = document.getElementById('naHora').value;
  const obs = document.getElementById('naObs').value;
  const procedimento = document.getElementById('naProcedimento')?.value || null;
  if (!leadId || !data || !hora) { toast('Preencha paciente, data e horário', 'error'); return; }
  const clinic = currentClinic();

  const taken = CAL.consultas.find(c => c.data === data && c.hora === hora);
  if (taken) { toast('Este horário já está ocupado!', 'error'); return; }

  const nova = { clinic_id: clinic.id, lead_id: leadId, data, hora, status: 'agendado', observacoes: obs, procedimento };
  const { data: saved, error } = await db.from('consultas').insert(nova).select().single();
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  CAL.consultas.push(saved);

  const lead = STATE.leads.find(l => l.id === leadId);
  if (lead && lead.status === 'novo' || lead?.status === 'contato') {
    lead.status = 'agendado';
    await db.from('leads').update({ status: 'agendado' }).eq('id', leadId);
  }

  closeModal('modalNovoAgendamento');
  CAL.selectedDate = data;
  renderCalendar();
  renderDaySchedule(data);
  toast('Consulta agendada! ✓');

  if (clinic?.whatsapp_instance && lead?.telefone) {
    const dataFormatada = new Date(data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const procLinha = procedimento ? `\n🦷 *Procedimento:* ${procedimento}` : '';
    const msg = `Olá, ${lead.nome}! 🎉 Sua consulta está *confirmada*!\n\n📅 *Data:* ${dataFormatada}\n⏰ *Horário:* ${hora}${procLinha}\n📍 *Endereço:* R. Rui Barbosa, 483 - Centro, Araguari - MG\n🗺️ *Como chegar:* https://share.google/aBRk2BmdSOHL2iN9X\n\nQualquer dúvida, é só chamar aqui! Te esperamos 😊`;
    try { await sendWhatsAppMessage(clinic.whatsapp_instance, lead.telefone, msg); toast('Confirmação enviada por WhatsApp! ✓'); } catch (e) {}
  }
};

console.log('✅ agenda-fix.js carregado — procedimento no agendamento ativo');
