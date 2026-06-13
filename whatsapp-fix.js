// ============================================================
// CLINICALEAD — CONEXÃO WHATSAPP NA TABELA DE CLÍNICAS
// Botões: Conectar/Reconectar (QR Code) e Desconectar
// ============================================================

// ── Abrir o modal de conexão (QR Code) pela clínica certa ────
function conectarWhatsAppClinica(clinicId) {
  const idx = STATE.clinics.findIndex(c => c.id === clinicId);
  if (idx < 0) { toast('Clínica não encontrada', 'error'); return; }
  openWhatsAppConnect(idx);
}

// ── Desconectar o WhatsApp da clínica ────────────────────────
async function desconectarWhatsAppClinica(clinicId) {
  const clinic = STATE.clinics.find(c => c.id === clinicId);
  if (!clinic) return;
  if (!clinic.whatsapp_instance) { toast('Esta clínica não está conectada', 'error'); return; }

  const confirmar = confirm(
    `Desconectar o WhatsApp da clínica "${clinic.nome}"?\n\n` +
    `⚠️ Lembretes automáticos, automações e o Inbox desta clínica vão parar de funcionar até reconectar.`
  );
  if (!confirmar) return;

  toast('Desconectando...');

  // 1. Desloga a sessão no Evolution (se falhar, segue em frente)
  try {
    await evoRequest('DELETE', `/instance/logout/${clinic.whatsapp_instance}`);
  } catch (e) {
    console.warn('[whatsapp-fix] Logout no Evolution falhou (seguindo):', e.message);
  }

  // 2. Remove o vínculo no banco
  const { error } = await db
    .from('clinicas')
    .update({ whatsapp_instance: null })
    .eq('id', clinicId);

  if (error) { toast('Erro ao desconectar: ' + error.message, 'error'); return; }

  // 3. Atualiza o estado local e a tela
  clinic.whatsapp_instance = null;
  toast('WhatsApp desconectado! 🔌');
  if (typeof renderClinicas === 'function') renderClinicas();
}

// ── EXCLUIR a instância do Evolution (ADM) ───────────────────
// Diferente de desconectar: apaga a instância INTEIRA do servidor.
// Use para limpar instâncias de teste/antigas e liberar recursos.
async function excluirInstanciaClinica(clinicId) {
  const isAdmin = (typeof STATE !== 'undefined' && STATE.profile && STATE.profile.role === 'admin');
  if (!isAdmin) { toast('Apenas administradores podem excluir instâncias', 'error'); return; }

  const clinic = STATE.clinics.find(c => c.id === clinicId);
  if (!clinic) return;
  const inst = clinic.whatsapp_instance;
  if (!inst) { toast('Esta clínica não tem instância vinculada', 'error'); return; }

  const txt = prompt(
    `⚠️ ATENÇÃO — AÇÃO IRREVERSÍVEL

` +
    `Isto vai APAGAR a instância "${inst}" do servidor Evolution por completo.
` +
    `A clínica "${clinic.nome}" precisará reconectar do zero (novo QR Code).

` +
    `Para confirmar, digite EXCLUIR:`
  );
  if (txt !== 'EXCLUIR') { toast('Exclusão cancelada'); return; }

  toast('Excluindo instância...');

  // 1. Logout (boa prática antes de deletar; ignora erro)
  try { await evoRequest('DELETE', `/instance/logout/${inst}`); } catch (e) {}

  // 2. Apaga a instância do Evolution
  try {
    await evoRequest('DELETE', `/instance/delete/${inst}`);
  } catch (e) {
    toast('Erro ao excluir no Evolution: ' + (e.message || 'verifique a conexão'), 'error');
    return;
  }

  // 3. Limpa o vínculo no banco
  const { error } = await db.from('clinicas').update({ whatsapp_instance: null }).eq('id', clinicId);
  if (error) { toast('Instância apagada, mas erro ao limpar o banco: ' + error.message, 'error'); return; }

  clinic.whatsapp_instance = null;
  toast(`Instância "${inst}" excluída do servidor! 🗑️`);
  if (typeof renderClinicas === 'function') renderClinicas();
}

console.log('✅ whatsapp-fix.js carregado — conectar/desconectar/excluir WhatsApp ativo');
