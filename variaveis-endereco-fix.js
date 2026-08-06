// ============================================================
// CLINICALEAD — VARIÁVEIS {endereco} e {mapa} NAS AUTOMAÇÕES
// Adiciona duas variáveis novas que podem ser usadas em QUALQUER
// mensagem de automação:
//   {endereco} -> endereço cadastrado da clínica (Minha Clínica)
//   {mapa}     -> link do mapa (link_mapa, ou gerado do endereço)
// A variável só age se for escrita no texto. Quem não usa, não
// recebe endereço. Puxa SEMPRE da clínica atual (multi-cliente ok).
//
// ⚠️ NÃO use {endereco} no lembrete 2h: ele já adiciona endereço
// automático pelo sistema (senão duplica).
// ============================================================

(function () {
  'use strict';

  // gera o valor do endereço e do mapa da clínica atual
  function valoresEndereco() {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    const endereco = (clinic && clinic.endereco || '').trim();
    if (!endereco) return { endereco: '', mapa: '' };
    const mapa = (clinic && clinic.link_mapa || '').trim()
      || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
    return { endereco, mapa };
  }

  // troca {endereco} e {mapa} numa string
  function aplicarVars(texto) {
    if (typeof texto !== 'string') return texto;
    if (!texto.includes('{endereco}') && !texto.includes('{mapa}')) return texto;
    const v = valoresEndereco();
    return texto
      .replace(/\{endereco\}/g, v.endereco)
      .replace(/\{mapa\}/g, v.mapa);
  }

  // Intercepta o envio de WhatsApp: aplica as variáveis em toda mensagem
  function instalar() {
    if (typeof window.sendWhatsAppMessage !== 'function' || window.sendWhatsAppMessage.__enderecoVars) {
      return typeof window.sendWhatsAppMessage === 'function';
    }
    const _orig = window.sendWhatsAppMessage;
    // ⚠️ CORREÇÃO 06/08: essa função "embrulha" o envio original só pra
    // aplicar as variáveis {endereco}/{mapa} — mas o wrapper só aceitava 3
    // parâmetros, então quando o envio original passou a precisar de um 4º
    // (clinicId, pra saber rotear entre Evolution e API Oficial), esse
    // parâmetro se perdia no meio do caminho. Isso fazia toda mensagem
    // cair no caminho Evolution por engano, mesmo em clínica já migrada
    // pra API Oficial — e a Evolution rejeitava com "instance does not
    // exist" (usando o Phone Number ID da Meta como se fosse nome de
    // instância). Agora aceita e repassa o 4º parâmetro adiante.
    window.sendWhatsAppMessage = async function (instance, phone, message, clinicId) {
      const nova = aplicarVars(message);
      return _orig.call(this, instance, phone, nova, clinicId);
    };
    window.sendWhatsAppMessage.__enderecoVars = true;
    console.log('✅ variaveis-endereco-fix.js carregado ({endereco} e {mapa} disponíveis)');
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }

  // expõe pra outros fixes usarem se precisar
  window.aplicarVarsEndereco = aplicarVars;
})();
