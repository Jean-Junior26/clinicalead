// ============================================================
// CLINICALEAD — FIX v2: campo de VALOR do pagamento com máscara
// de TELEFONE (bug do data-mask-tel + listener de telefone).
//
// PROBLEMA: o campo pagValor-XXXX é recriado com data-mask-tel="1",
// e a máscara global de telefone (função 'formatar') roda no input,
// transformando "500" em "(50) 0". O campo é re-renderizado, então
// corrigir "depois" perde a corrida.
//
// SOLUÇÃO v2: intercepta o input no MODO CAPTURA (roda ANTES de
// todos os outros listeners) e, se o campo for de VALOR, formata
// como moeda e IMPEDE a máscara de telefone de rodar
// (stopImmediatePropagation). Assim vence a corrida sempre.
// Carregar por último no index.
// ============================================================
(function () {
  'use strict';

  // é um campo de valor de pagamento?
  function ehCampoValor(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    const id = el.id || '';
    const ph = (el.placeholder || '').toLowerCase();
    return id.startsWith('pagValor-') || /valor|r\$|preç|prec/.test(ph);
  }

  // formata como moeda BR: dígitos + vírgula decimal (máx 2 casas)
  function formatarMoeda(v) {
    let s = String(v).replace(/[^\d,]/g, '');       // só dígitos e vírgula
    const partes = s.split(',');
    if (partes.length > 2) s = partes[0] + ',' + partes.slice(1).join('');
    const m = s.match(/^(\d*)(,\d{0,2})?/);
    return m ? m[0] : s;
  }

  // INTERCEPTA no modo captura (true) — roda ANTES da máscara de telefone.
  // Se for campo de valor: formata como moeda e BLOQUEIA os outros
  // listeners de input (a máscara de telefone não chega a rodar).
  document.addEventListener('input', function (e) {
    const el = e.target;
    if (!ehCampoValor(el)) return;
    // remove a marcação de telefone (defensivo)
    if (el.hasAttribute('data-mask-tel')) el.removeAttribute('data-mask-tel');
    // formata como moeda
    const novo = formatarMoeda(el.value);
    if (el.value !== novo) el.value = novo;
    // impede a máscara de telefone (e qualquer outro listener) de rodar
    e.stopImmediatePropagation();
  }, true); // <-- captura: essencial pra rodar ANTES da máscara

  // limpa valores que JÁ vieram formatados como telefone (ao abrir o form)
  function limparValoresTelefone() {
    document.querySelectorAll('[id^="pagValor-"]').forEach(el => {
      if (el.hasAttribute('data-mask-tel')) el.removeAttribute('data-mask-tel');
      // se tem parênteses/traço (cara de telefone), limpa
      if (/[()\-]/.test(el.value)) el.value = '';
      el.setAttribute('inputmode', 'decimal');
    });
  }
  limparValoresTelefone();
  setInterval(limparValoresTelefone, 1000);

  console.log('✅ pagamento-valor-mascara-fix.js v2 carregado — campo de valor protegido da máscara de telefone');
})();
