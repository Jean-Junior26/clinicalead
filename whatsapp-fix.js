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

console.log('✅ whatsapp-fix.js carregado — conectar/desconectar WhatsApp ativo');
