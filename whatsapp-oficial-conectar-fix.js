// ============================================================
// CLINICALEAD — Botão "Conectar WhatsApp (API Oficial)" via
// Embedded Signup da Meta — preserva a Coexistência (app do celular
// continua funcionando junto com a API).
// ⚠️ 01/08: construído com cuidado, SEM afetar nenhuma conexão já
// ativa — só adiciona uma opção nova na tela "Minha Clínica".
// ============================================================
(function () {
  'use strict';

  // ⚠️ PENDENTE: preencher depois que a extensão confirmar esses
  // valores no painel da Meta (App Secret fica só no BACKEND, nunca
  // aqui no frontend — só o Configuration ID e o App ID vêm aqui).
  const META_APP_ID = '2170841700506560'; // "ClinicaLead CRM" — já confirmado
  const META_CONFIG_ID = '1027159793407657'; // "ClinicaLead Embedded Signup" — confirmado 01/08

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

  // injeta o botão dentro da tela "Minha Clínica" — procura um local
  // já existente relacionado a WhatsApp pra encaixar do lado
  function injetarBotao() {
    if (document.getElementById('btnConectarWhatsAppOficial')) return;
    const alvo = document.getElementById('secaoWhatsAppMinhaClinica') || document.querySelector('[data-secao="whatsapp"]');
    if (!alvo) return; // tenta de novo depois, a tela pode não ter carregado ainda

    const btn = document.createElement('button');
    btn.id = 'btnConectarWhatsAppOficial';
    btn.className = 'btn btn-primary';
    btn.style.marginTop = '12px';
    btn.innerHTML = '<i class="ti ti-brand-whatsapp"></i> Conectar WhatsApp (API Oficial)';
    btn.onclick = iniciarConexaoOficial;
    alvo.appendChild(btn);
  }
  setInterval(injetarBotao, 1000);

  function iniciarConexaoOficial() {
    if (!window.FB) {
      toast && toast('Aguarde, carregando conexão com a Meta...', 'info');
      return;
    }
    if (META_CONFIG_ID === 'PENDENTE_CONFIGURATION_ID') {
      toast && toast('Configuração ainda não finalizada — fala com o suporte.', 'error');
      return;
    }

    window.FB.login(function (response) {
      if (response.authResponse && response.authResponse.code) {
        finalizarConexao(response.authResponse.code);
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
  }

  async function finalizarConexao(code) {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;
    toast && toast('Conectando... isso pode levar alguns segundos.', 'info');
    try {
      const resp = await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: 'finalizar_embedded_signup', clinic_id: clinic.id, code }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.erro || 'Falha ao conectar');
      toast && toast('WhatsApp conectado com sucesso! 🎉', 'success');
    } catch (e) {
      console.error('[embedded-signup]', e);
      toast && toast('Erro ao finalizar conexão: ' + e.message, 'error');
    }
  }

  console.log('✅ whatsapp-oficial-conectar-fix.js carregado');
})();
