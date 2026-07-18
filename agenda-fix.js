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
      // IMPORTANTE: usar .limit(1) em vez de .maybeSingle() — se por algum motivo
      // existir mais de uma linha (duplicata), .maybeSingle() falha e ANTES o código
      // caía no fallback "sempre ativo". Agora, em caso de erro/ambiguidade,
      // o padrão é NÃO ENVIAR (seguro por padrão).
      const { data: autoConfRows, error: autoConfError } = await db.from('automacoes')
        .select('mensagem,ativo,updated_at')
        .eq('clinic_id', clinic.id)
        .eq('tipo', 'confirmacao')
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(1);

      let template = null;

      if (autoConfError) {
        // Erro ao consultar = não envia, por segurança. Não usa mais o fallback perigoso.
        console.error('[agenda-fix] Erro ao buscar automação de confirmação, mensagem NÃO enviada por segurança:', autoConfError.message);
      } else if (autoConfRows && autoConfRows.length > 0) {
        // Existe configuração salva pra essa clínica: respeita o ativo/inativo dela.
        const autoConf = autoConfRows[0];
        template = autoConf.ativo ? autoConf.mensagem : null;
      } else if (typeof AUTOMACOES_DEFAULTS !== 'undefined') {
        // Só usa o padrão de fábrica se a clínica NUNCA configurou essa automação
        // (nenhuma linha encontrada, sem erro nenhum).
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
    } catch (e) {
      console.error('[agenda-fix] Erro inesperado ao enviar confirmação, mensagem NÃO enviada:', e.message);
    }
  }
};

console.log('✅ agenda-fix.js carregado — procedimento no agendamento ativo (correção: erro/duplicata = não envia)');
