// ============================================================
// CLINICALEAD — Conexão WhatsApp via API OFICIAL (Embedded Signup)
// ⚠️ 01/08: simplificado — o botão em si agora vive DENTRO do
// minha-clinica-fix.js (no card de WhatsApp), não é mais injetado
// "por fora" aqui (isso não funcionava, porque a tela é reconstruída
// dinamicamente e minha injeção nunca encontrava onde encaixar).
// Esse arquivo agora só cuida da LÓGICA: carregar o SDK do Facebook
// e conduzir o fluxo de login quando o botão for clicado.
// ============================================================
(function () {
  'use strict';

  const META_APP_ID = '2170841700506560'; // "ClinicaLead CRM"
  const META_CONFIG_ID = '1027159793407657'; // "ClinicaLead Embedded Signup"

  let sdkCarregado = false;

  function carregarSdkFacebook() {
    if (sdkCarregado || window.FB) { sdkCarregado = true; return; }
    window.fbAsyncInit = function () {
      window.FB.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: false, version: 'v21.0' });
      sdkCarregado = true;
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }
  carregarSdkFacebook();

  // chamada pelo botão em minha-clinica-fix.js
  window.iniciarConexaoOficial = function (clinicId) {
    if (!window.FB) {
      toast && toast('Aguarde, carregando conexão com a Meta...', 'info');
      setTimeout(() => window.iniciarConexaoOficial(clinicId), 1500); // tenta de novo em breve
      return;
    }

    window.FB.login(function (response) {
      if (response.authResponse && response.authResponse.code) {
        finalizarConexaoOficial(clinicId, response.authResponse.code);
      } else {
        toast && toast('Conexão cancelada ou não autorizada.', 'error');
      }
    }, {
      config_id: META_CONFIG_ID,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: 'whatsapp_business_app_onboarding', // preserva Coexistência
        sessionInfoVersion: '3',
      },
    });
  };

  async function finalizarConexaoOficial(clinicId, code) {
    toast && toast('Conectando... isso pode levar alguns segundos.', 'info');
    try {
      const resp = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: 'finalizar_embedded_signup', clinic_id: clinicId, code }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.erro || 'Falha ao conectar');
      toast && toast('WhatsApp conectado com sucesso! 🎉', 'success');
      if (typeof renderMinhaClinica === 'function') renderMinhaClinica(); // atualiza a tela
    } catch (e) {
      console.error('[embedded-signup]', e);
      toast && toast('Erro ao finalizar conexão: ' + e.message, 'error');
    }
  }

  console.log('✅ whatsapp-oficial-conectar-fix.js carregado');
})();
