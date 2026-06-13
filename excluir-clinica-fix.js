// ============================================================
// CLINICALEAD — EXCLUIR CLÍNICA (ADM)
// Remove a clínica e TODOS os dados vinculados a ela.
// Proteções: só ADM, dupla confirmação digitando o nome,
// e bloqueio de excluir a própria clínica ativa.
// ============================================================

async function excluirClinica(clinicId) {
  const isAdmin = (typeof STATE !== 'undefined' && STATE.profile && STATE.profile.role === 'admin');
  if (!isAdmin) { toast('Apenas administradores podem excluir clínicas', 'error'); return; }

  // Busca a clínica (admin enxerga todas, então busca no banco se preciso)
  let clinic = (STATE.clinics || []).find(c => c.id === clinicId);
  if (!clinic) {
    const { data } = await db.from('clinicas').select('*').eq('id', clinicId).maybeSingle();
    clinic = data;
  }
  if (!clinic) { toast('Clínica não encontrada', 'error'); return; }

  // Trava: não excluir a clínica que está ativa no momento
  const ativa = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (ativa && ativa.id === clinicId) {
    toast('Você não pode excluir a clínica que está acessando agora. Troque de clínica primeiro.', 'error');
    return;
  }

  // Confirmação 1: o aviso
  const ok1 = confirm(
    `⚠️ EXCLUIR A CLÍNICA "${clinic.nome}"?\n\n` +
    `Isto vai apagar PERMANENTEMENTE:\n` +
    `• A clínica e o acesso dela\n` +
    `• Todos os leads/pacientes\n` +
    `• Consultas, orçamentos, pagamentos\n` +
    `• Procedimentos, automações e mensagens\n\n` +
    `Esta ação NÃO pode ser desfeita.`
  );
  if (!ok1) return;

  // Confirmação 2: digitar o nome exato
  const txt = prompt(`Para confirmar, digite o nome da clínica exatamente como aparece:\n\n${clinic.nome}`);
  if (txt == null) return;
  if (txt.trim() !== clinic.nome.trim()) { toast('Nome não confere — exclusão cancelada', 'error'); return; }

  toast('Excluindo clínica e dados vinculados...');

  // (Opcional) tenta apagar a instância do Evolution, se houver
  if (clinic.whatsapp_instance && typeof evoRequest === 'function') {
    try { await evoRequest('DELETE', `/instance/logout/${clinic.whatsapp_instance}`); } catch (e) {}
    try { await evoRequest('DELETE', `/instance/delete/${clinic.whatsapp_instance}`); } catch (e) {}
  }

  // Apaga os dados vinculados (tabelas que têm clinic_id)
  const tabelas = ['pagamentos', 'orcamento_itens', 'orcamentos', 'consultas', 'mensagens', 'automacoes', 'agenda_config', 'procedimentos', 'tarefas_resolvidas', 'assinaturas', 'leads'];
  for (const t of tabelas) {
    try {
      // orcamento_itens não tem clinic_id direto — apaga via orçamentos da clínica
      if (t === 'orcamento_itens') {
        const { data: orcs } = await db.from('orcamentos').select('id').eq('clinic_id', clinicId);
        const ids = (orcs || []).map(o => o.id);
        if (ids.length) await db.from('orcamento_itens').delete().in('orcamento_id', ids);
        continue;
      }
      await db.from(t).delete().eq('clinic_id', clinicId);
    } catch (e) {
      console.warn(`[excluir-clinica] limpeza de ${t} falhou (seguindo):`, e.message);
    }
  }

  // Por fim, apaga a clínica
  const { error } = await db.from('clinicas').delete().eq('id', clinicId);
  if (error) { toast('Erro ao excluir a clínica: ' + error.message, 'error'); return; }

  // Atualiza estado local e tela
  STATE.clinics = (STATE.clinics || []).filter(c => c.id !== clinicId);
  toast(`Clínica "${clinic.nome}" excluída por completo. 🗑️`);
  if (typeof renderClinicas === 'function') renderClinicas();
}

console.log('✅ excluir-clinica-fix.js carregado — exclusão de clínica (ADM) ativa');
