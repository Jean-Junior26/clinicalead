// ============================================================
// CLINICALEAD — FIX v4 DEFINITIVO: campo de VALOR do pagamento
//
// DIAGNÓSTICO REAL: o campo tinha 17 listeners de input empilhados
// (máscara de telefone + versões antigas do fix brigando). Por isso
// o comportamento errático: digitava certo e depois virava telefone.
//
// v4: em vez de ADICIONAR listener (que empilha), a gente CLONA o
// campo (remove TODOS os listeners de uma vez) e coloca UM único
// listener de moeda. Faz isso sempre que o campo aparece/muda,
// mas de forma idempotente (só age se ainda não foi "blindado").
// Carregar por último no index. Pode remover os fixes antigos.
// ============================================================
(function () {
  'use strict';

  function ehCampoValor(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    const id = el.id || '';
    const ph = (el.placeholder || '').toLowerCase();
    return id.startsWith('pagValor-') || /valor|r\$|preç|prec/.test(ph);
  }

  function formatarMoeda(v) {
    let s = String(v).replace(/[^\d,]/g, '');
    const i = s.indexOf(',');
    if (i !== -1) {
      const intPart = s.slice(0, i).replace(/,/g, '');
      const dec = s.slice(i + 1).replace(/,/g, '').slice(0, 2);
      s = intPart + ',' + dec;
    }
    return s;
  }

  // "Blinda" o campo: remove TODOS os listeners (via clone) e põe UM só.
  function blindarCampo(campo) {
    // marca via atributo (sobrevive ao clone? não — então checa por flag no id set)
    if (campo.dataset.valorBlindado === '1') return;

    // remove a marcação de telefone
    campo.removeAttribute('data-mask-tel');
    // limpa valor com cara de telefone
    if (/[()\-]/.test(campo.value)) campo.value = '';

    // CLONA pra remover todos os 17 listeners empilhados
    const limpo = campo.cloneNode(true);
    limpo.removeAttribute('data-mask-tel');
    limpo.dataset.valorBlindado = '1';
    limpo.setAttribute('inputmode', 'decimal');

    // UM único listener de moeda
    limpo.addEventListener('input', function () {
      const pos = limpo.selectionStart;
      const antes = limpo.value;
      const novo = formatarMoeda(limpo.value);
      if (antes !== novo) {
        limpo.value = novo;
        try {
          const diff = novo.length - antes.length;
          limpo.setSelectionRange(Math.max(0, pos + diff), Math.max(0, pos + diff));
        } catch (e) {}
      }
    });

    if (campo.parentNode) campo.parentNode.replaceChild(limpo, campo);
  }

  function varrer() {
    document.querySelectorAll('[id^="pagValor-"]').forEach(el => {
      if (el.dataset.valorBlindado !== '1') blindarCampo(el);
    });
  }

  // observa o DOM: quando o form de pagamento abre, blinda o campo
  const obs = new MutationObserver(() => varrer());
  obs.observe(document.body, { childList: true, subtree: true });
  varrer();

  console.log('✅ pagamento-valor-mascara-fix.js v4 carregado — campo de valor blindado (listener único)');
})();
