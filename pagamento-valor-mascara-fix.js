// ============================================================
// CLINICALEAD — FIX: campo de VALOR do pagamento com máscara
// de TELEFONE (bug do data-mask-tel no campo errado).
//
// O campo pagValor-XXXX (valor do pagamento no orçamento) foi
// marcado por engano com data-mask-tel="1", fazendo a máscara
// global de telefone formatar o valor como "(34) 99946-5229".
//
// Este fix: remove o data-mask-tel dos campos de VALOR e aplica
// neles uma máscara de MOEDA correta (só números, com vírgula
// decimal). Mantém a máscara de telefone nos campos certos.
// Carregar por último no index.
// ============================================================
(function () {
  'use strict';

  // formata como moeda: mantém dígitos e uma vírgula/ponto decimal
  function formatarValor(v) {
    // tira tudo que não é dígito, vírgula ou ponto
    let s = String(v).replace(/[^\d.,]/g, '');
    // troca ponto por vírgula (padrão BR), mantém só a última como decimal
    s = s.replace(/\./g, ',');
    const partes = s.split(',');
    if (partes.length > 2) {
      // junta tudo e deixa só a última vírgula como decimal
      s = partes.slice(0, -1).join('') + ',' + partes[partes.length - 1];
    }
    // limita a 2 casas decimais
    const m = s.match(/^(\d*)(,(\d{0,2}))?/);
    return m ? m[0] : s;
  }

  // desmancha a máscara de telefone e instala a de moeda num campo de valor
  function corrigirCampoValor(campo) {
    if (!campo || campo.__valorCorrigido) return;
    // remove a marcação que ativava a máscara de telefone
    campo.removeAttribute('data-mask-tel');
    // se o valor atual veio formatado como telefone, limpa
    if (/[()\-\s]/.test(campo.value) && campo.value.replace(/\D/g, '').length >= 8) {
      campo.value = '';
    }
    // clona o campo pra remover TODOS os listeners antigos (a máscara de telefone)
    const novo = campo.cloneNode(true);
    campo.parentNode.replaceChild(novo, campo);
    // instala a máscara de moeda correta
    novo.addEventListener('input', function () {
      const pos = novo.selectionStart;
      novo.value = formatarValor(novo.value);
    });
    novo.setAttribute('inputmode', 'decimal');
    novo.__valorCorrigido = true;
  }

  // varre os campos de valor de pagamento e corrige
  function varrer() {
    document.querySelectorAll('[id^="pagValor-"]').forEach(corrigirCampoValor);
    // outros campos de valor que possam ter o mesmo problema
    document.querySelectorAll('input[data-mask-tel]').forEach(campo => {
      const ctx = (campo.id + ' ' + (campo.placeholder || '')).toLowerCase();
      if (/valor|preco|preço|r\$|pag/.test(ctx)) corrigirCampoValor(campo);
    });
  }

  // o form de pagamento abre dinamicamente → fica observando
  varrer();
  setInterval(varrer, 800);

  // também observa mudanças no DOM (quando abre o form)
  const obs = new MutationObserver(() => varrer());
  obs.observe(document.body, { childList: true, subtree: true });

  console.log('✅ pagamento-valor-mascara-fix.js carregado — campo de valor sem máscara de telefone');
})();
