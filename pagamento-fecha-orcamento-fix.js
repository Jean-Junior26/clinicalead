// ============================================================
// CLINICALEAD — 1º PAGAMENTO FECHA O ORÇAMENTO (Fatia 1)
// Quando um orçamento recebe seu PRIMEIRO pagamento:
//  • marca orcamentos.fechado_em = data do pagamento
//  • converte o lead em paciente (status 'fechado')
// Pagamentos seguintes do mesmo orçamento só quitam (não refazem).
// ============================================================

(function () {
  function instalar() {
    if (typeof orcRegistrarPagamento !== 'function') return false;

    const _orig = orcRegistrarPagamento;
    orcRegistrarPagamento = async function (orcId) {
      // Antes de registrar: este orçamento já tinha algum pagamento?
      let jaTinhaPagamento = false;
      try {
        const { data: pagsAntes } = await db.from('pagamentos')
          .select('id').eq('orcamento_id', orcId).limit(1);
        jaTinhaPagamento = (pagsAntes || []).length > 0;
      } catch (e) {}

      // Executa o registro original (insere o pagamento)
      const r = await _orig.apply(this, arguments);

      // Se ESTE é o primeiro pagamento do orçamento → fecha
      if (!jaTinhaPagamento) {
        try {
          // Confirma que o pagamento entrou (pega o mais recente do orçamento)
          const { data: pags } = await db.from('pagamentos')
            .select('data, lead_id').eq('orcamento_id', orcId).order('data', { ascending: true });
          if (pags && pags.length) {
            const dataFech = pags[0].data || new Date().toISOString().split('T')[0];
            const leadId = pags[0].lead_id;

            // 1) Marca o orçamento como fechado na data do 1º pagamento
            await db.from('orcamentos').update({ fechado_em: dataFech }).eq('id', orcId);

            // 2) Converte o lead em paciente (status fechado), se ainda não for
            if (leadId) {
              const lead = (STATE.leads || []).find(l => l.id === leadId);
              if (lead && lead.status !== 'fechado') {
                await db.from('leads').update({ status: 'fechado' }).eq('id', leadId);
                lead.status = 'fechado';
              }
            }

            if (typeof toast === 'function') toast('Orçamento fechado! Paciente registrado 🎉');

            // Atualiza telas relevantes
            if (typeof renderLeads === 'function') renderLeads();
            if (typeof renderDashboard === 'function') renderDashboard();
            if (typeof renderPacientes === 'function') renderPacientes();
          }
        } catch (e) {
          console.error('[fechar orçamento no 1º pagamento]', e);
        }
      }

      return r;
    };

    console.log('✅ pagamento-fecha-orcamento-fix.js carregado (Fatia 1)');
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();

// ── Aprovar NÃO fecha mais o lead (só o pagamento fecha) ─────
// Intercepta orcToggleAprovado: deixa aprovar o item normalmente,
// mas reverte qualquer mudança de status do lead para 'fechado'
// causada pela aprovação (a regra agora é: fecha só ao pagar).
(function () {
  function instalarBloqueio() {
    if (typeof orcToggleAprovado !== 'function') return false;

    const _orig = orcToggleAprovado;
    orcToggleAprovado = async function (orcId, itemId, aprovado) {
      // Guarda o status atual do lead antes de aprovar
      const leadId = (typeof ORC !== 'undefined') ? ORC.leadId : null;
      const lead = leadId ? (STATE.leads || []).find(l => l.id === leadId) : null;
      const statusAntes = lead ? lead.status : null;

      // Executa a aprovação original
      const r = await _orig.apply(this, arguments);

      // Se a aprovação fechou o lead, reverte (só pagamento pode fechar)
      if (aprovado && lead && statusAntes && statusAntes !== 'fechado' && lead.status === 'fechado') {
        // Confirma se há pagamento; se NÃO houver, reverte o fechamento
        try {
          const { data: pags } = await db.from('pagamentos').select('id').eq('orcamento_id', orcId).limit(1);
          const temPagamento = (pags || []).length > 0;
          if (!temPagamento) {
            await db.from('leads').update({ status: statusAntes }).eq('id', leadId);
            lead.status = statusAntes;
            if (typeof renderLeads === 'function') renderLeads();
          }
        } catch (e) {}
      }
      return r;
    };
    return true;
  }
  if (!instalarBloqueio()) {
    const iv = setInterval(() => { if (instalarBloqueio()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }
  console.log('✅ aprovação não fecha mais o lead (só pagamento)');
})();
