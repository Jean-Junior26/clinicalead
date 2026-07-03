// ============================================================
// CLINICALEAD — FIX v3: campo de VALOR do pagamento
// v2 parou a máscara de telefone MAS o campo apagava sozinho
// (o setInterval limpava + stopImmediatePropagation cortava input).
//
// v3: abordagem cirúrgica e SEGURA:
//  - NÃO tem setInterval limpando (era ele que apagava).
//  - No modo captura, só REESCREVE o valor como moeda e bloqueia
//    a máscara de telefone. Não zera nada enquanto digita.
//  - Só limpa "cara de telefone" UMA vez, no foco (quando entra
//    no campo), não durante a digitação.
// Carregar por último no index.
// ============================================================
(function () {
  'use strict';

  function ehCampoValor(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    const id = el.id || '';
    const ph = (el.placeholder || '').toLowerCase();
    return id.startsWith('pagValor-') || /valor|r\$|preç|prec/.test(ph);
  }

  // moeda BR: dígitos + uma vírgula decimal (máx 2 casas). NÃO apaga dígitos.
  function formatarMoeda(v) {
    let s = String(v).replace(/[^\d,]/g, '');
    const i = s.indexOf(',');
    if (i !== -1) {
      // mantém só a primeira vírgula, limita 2 casas depois dela
      const intPart = s.slice(0, i).replace(/,/g, '');
      let dec = s.slice(i + 1).replace(/,/g, '').slice(0, 2);
      s = intPart + ',' + dec;
    }
    return s;
  }

  // intercepta ANTES da máscara de telefone (modo captura) e formata como moeda
  document.addEventListener('input', function (e) {
    const el = e.target;
    if (!ehCampoValor(el)) return;
    if (el.hasAttribute('data-mask-tel')) el.removeAttribute('data-mask-tel');
    const pos = el.selectionStart;
    const antes = el.value;
    const novo = formatarMoeda(el.value);
    if (antes !== novo) {
      el.value = novo;
      // tenta manter o cursor numa posição razoável
      try {
        const diff = novo.length - antes.length;
        el.setSelectionRange(Math.max(0, pos + diff), Math.max(0, pos + diff));
      } catch (err) {}
    }
    // impede a máscara de telefone (listener seguinte) de rodar
    e.stopImmediatePropagation();
  }, true);

  // ao ENTRAR no campo (focus), se veio com cara de telefone (parênteses/traço), limpa UMA vez
  document.addEventListener('focus', function (e) {
    const el = e.target;
    if (!ehCampoValor(el)) return;
    if (el.hasAttribute('data-mask-tel')) el.removeAttribute('data-mask-tel');
    if (/[()\-]/.test(el.value)) el.value = '';
    el.setAttribute('inputmode', 'decimal');
  }, true);

  console.log('✅ pagamento-valor-mascara-fix.js v3 carregado — valor como moeda, sem apagar');
})();
