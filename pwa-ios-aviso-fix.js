// ============================================================
// CLINICALEAD — AVISO "ADICIONAR À TELA" (somente iPhone/Safari)
// Mostra um balão discreto ensinando a instalar na tela inicial.
// Aparece só no iOS/Safari, só se ainda NÃO estiver instalado,
// e respeita "não mostrar de novo" (salvo no navegador do usuário).
// ============================================================

(function () {
  'use strict';

  const KEY = 'clinicalead_ios_aviso_off';

  // já dispensou antes?
  function dispensado() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function dispensar() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    const b = document.getElementById('iosInstallBanner');
    if (b) b.remove();
  }
  window.fecharAvisoIOS = dispensar;

  // é iPhone/iPad?
  function ehIOS() {
    const ua = window.navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad moderno
    return iOS;
  }
  // é o Safari de verdade? (Chrome/Firefox no iOS têm CriOS/FxiOS no UA e não instalam PWA)
  function ehSafari() {
    const ua = window.navigator.userAgent || '';
    return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  }
  // já está rodando instalado (standalone)?
  function jaInstalado() {
    return (window.navigator.standalone === true) ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  function mostrarBanner() {
    if (document.getElementById('iosInstallBanner')) return;

    const css = document.createElement('style');
    css.textContent = `
      #iosInstallBanner {
        position: fixed; left: 12px; right: 12px; bottom: 14px; z-index: 99999;
        background: var(--bg-card, #1C1C20); color: var(--text-primary, #F0EAD6);
        border: 1px solid var(--gold-border, rgba(201,168,76,0.35));
        border-radius: 14px; padding: 14px 16px;
        box-shadow: 0 10px 34px rgba(0,0,0,0.4);
        display: flex; gap: 12px; align-items: flex-start;
        font-family: var(--font, sans-serif); animation: iosUp .3s ease;
        max-width: 460px; margin: 0 auto;
      }
      @keyframes iosUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      #iosInstallBanner .ios-ico { font-size: 26px; color: var(--gold, #C9A84C); line-height: 1; }
      #iosInstallBanner .ios-txt { flex: 1; font-size: 13px; line-height: 1.5; }
      #iosInstallBanner b { color: var(--gold, #C9A84C); }
      #iosInstallBanner .ios-x { background: transparent; border: none; color: var(--text-muted, #9A9484);
        font-size: 20px; cursor: pointer; padding: 0 2px; line-height: 1; }
      #iosInstallBanner .ios-share { display:inline-flex;align-items:center;justify-content:center;
        width:20px;height:20px;border:1px solid var(--gold,#C9A84C);border-radius:5px;color:var(--gold,#C9A84C);
        font-size:13px;vertical-align:middle;margin:0 2px; }
    `;
    document.head.appendChild(css);

    const div = document.createElement('div');
    div.id = 'iosInstallBanner';
    div.innerHTML = `
      <div class="ios-ico"><i class="ti ti-device-mobile-share"></i></div>
      <div class="ios-txt">
        <b>Instale o ClinicaLead na sua tela</b><br>
        Toque em <span class="ios-share"><i class="ti ti-share"></i></span> <b>Compartilhar</b> e depois em <b>"Adicionar à Tela de Início"</b>. Abre igual a um app! 📲
      </div>
      <button class="ios-x" onclick="fecharAvisoIOS()" title="Fechar">&times;</button>`;
    document.body.appendChild(div);
  }

  function avaliar() {
    if (dispensado() || jaInstalado()) return;
    if (!ehIOS() || !ehSafari()) return;
    // espera a interface aparecer (usuário logado) antes de mostrar
    setTimeout(mostrarBanner, 2500);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') avaliar();
  else document.addEventListener('DOMContentLoaded', avaliar);

  console.log('✅ pwa-ios-aviso-fix.js carregado — aviso de instalação no iPhone');
})();
