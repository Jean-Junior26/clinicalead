// ============================================================
// CLINICALEAD — ENDEREÇO DINÂMICO NA CONFIRMAÇÃO DE AGENDAMENTO
// BUG: salvarNovoAgendamento() e sendWAConsulta() tinham o
// endereço da clínica Araguari CHUMBADO na mensagem. No multi-
// cliente, o paciente de OUTRA clínica recebia o endereço errado.
// CORREÇÃO: reescreve as duas para usar o endereço/mapa da
// CLÍNICA ATUAL (clinic.endereco / clinic.link_mapa), sem CEP
// duplicado. Reaproveita sendWhatsAppMessage do sistema.
// ============================================================

(function () {
  'use strict';

  // monta bloco de endereço da clínica (sem duplicar CEP)
  function blocoEndereco(clinic) {
    const endereco = (clinic && clinic.endereco || '').trim();
    if (!endereco) return ''; // sem endereço cadastrado: não inclui
    const link = (clinic && clinic.link_mapa || '').trim()
      || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
    return `\n📍 *Endereço:* ${endereco}\n🗺️ *Como chegar:* ${link}`;
  }

  function instalar() {
    if (typeof currentClinic !== 'function' || typeof sendWhatsAppMessage !== 'function') return false;

    // ── 1) Reescreve salvarNovoAgendamento (mensagem ao agendar) ──
    if (typeof salvarNovoAgendamento === 'function' && !salvarNovoAgendamento.__enderecoFix) {
      const _origSalvar = salvarNovoAgendamento;
      salvarNovoAgendamento = async function () {
        // intercepta o sendWhatsAppMessage SÓ durante esta execução,
        // pra trocar o endereço fixo pelo dinâmico
        const _origSend = window.sendWhatsAppMessage;
        window.sendWhatsAppMessage = async function (instance, phone, message) {
          const clinic = currentClinic();
          // troca o bloco de endereço fixo (Araguari) pelo da clínica atual
          let nova = message;
          // remove qualquer bloco "📍 Endereço ... 🗺️ ... (até quebra dupla)" fixo
          nova = nova.replace(/\n📍 \*Endereço:\*[^\n]*\n🗺️[^\n]*/g, blocoEndereco(clinic));
          return _origSend(instance, phone, nova);
        };
        try {
          return await _origSalvar.apply(this, arguments);
        } finally {
          window.sendWhatsAppMessage = _origSend; // restaura
        }
      };
      salvarNovoAgendamento.__enderecoFix = true;
    }

    // ── 2) Reescreve sendWAConsulta (botão Confirmar da agenda) ──
    if (typeof sendWAConsulta === 'function' && !sendWAConsulta.__enderecoFix) {
      sendWAConsulta = async function (consultaId) {
        const c = (typeof CAL !== 'undefined' && CAL.consultas || []).find(x => x.id === consultaId);
        if (!c) return;
        const lead = (STATE.leads || []).find(l => l.id === c.lead_id);
        const clinic = currentClinic();
        if (!clinic || !clinic.whatsapp_instance || !lead || !lead.telefone) {
          if (typeof toast === 'function') toast('Configure o WhatsApp primeiro!', 'error');
          return;
        }
        const msg = `Oi ${lead.nome}! 👋 Passando para lembrar que *amanhã* você tem consulta conosco!\n\n⏰ *Horário:* ${c.hora}${blocoEndereco(clinic)}\n\nConfirma sua presença? Responda *SIM* ou *NÃO* 😊`;
        try {
          await sendWhatsAppMessage(clinic.whatsapp_instance, lead.telefone, msg);
          await db.from('consultas').update({ status: 'confirmado' }).eq('id', consultaId);
          c.status = 'confirmado';
          if (typeof renderDaySchedule === 'function') renderDaySchedule(CAL.selectedDate);
          if (typeof toast === 'function') toast('Confirmação enviada por WhatsApp! ✓');
        } catch (e) {
          if (typeof toast === 'function') toast('Erro ao enviar WhatsApp', 'error');
        }
      };
      sendWAConsulta.__enderecoFix = true;
    }

    console.log('✅ agendamento-endereco-fix.js carregado (endereço dinâmico da clínica)');
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
