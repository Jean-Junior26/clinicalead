// ============================================================
// CLINICALEAD — PROCEDIMENTO NO AGENDAMENTO
// Adiciona o campo "Procedimento" no modal de novo agendamento,
// alimentado pelo catálogo vivo da clínica (página Procedimentos).
// Criou um procedimento novo? Ele já aparece aqui na hora.
// Bônus: ao escolher o paciente, sugere o procedimento do lead.
// ============================================================

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
    try {
      // Usa a mensagem editável da tela de Automações (tipo "confirmacao")
      const { data: autoConf } = await db.from('automacoes')
        .select('mensagem,ativo')
        .eq('clinic_id', clinic.id)
        .eq('tipo', 'confirmacao')
        .maybeSingle();

      let template = null;
      if (autoConf) {
        template = autoConf.ativo ? autoConf.mensagem : null; // desativada = não envia
      } else if (typeof AUTOMACOES_DEFAULTS !== 'undefined') {
        template = AUTOMACOES_DEFAULTS.find(a => a.tipo === 'confirmacao')?.msg || null;
      }

      if (template) {
        const dataFormatada = new Date(data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
        const msg = template
          .replaceAll('{nome}', lead.nome || '')
          .replaceAll('{clinica}', clinic.nome || clinic.name || '')
          .replaceAll('{data}', dataFormatada)
          .replaceAll('{hora}', hora)
          .replaceAll('{procedimento}', procedimento || lead.procedimento || 'sua avaliação');
        await sendWhatsAppMessage(clinic.whatsapp_instance, lead.telefone, msg);
        toast('Confirmação enviada por WhatsApp! ✓');
      }
    } catch (e) {}
  }
};

console.log('✅ agenda-fix.js carregado — procedimento no agendamento ativo');
