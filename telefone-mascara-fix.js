// ============================================================
// CLINICALEAD — MÁSCARA DE TELEFONE (global, visual)
// Formata qualquer campo de telefone enquanto digita:
//   fixo:    (34) 3333-3333   (8 dígitos)
//   celular: (34) 99999-9999  (9 dígitos)
// A máscara é SÓ VISUAL — o sistema continua salvando/usando só os
// dígitos (o WhatsApp não quebra). Pega campos novos automaticamente.
// ============================================================

(function () {
  'use strict';

  // formata uma string de dígitos no padrão BR (com DDD)
  function formatar(digitos) {
    let d = String(digitos || '').replace(/\D/g, '').slice(0, 11); // máx 11 (DDD + 9)
    if (d.length === 0) return '';
    if (d.length <= 2) return '(' + d;
    const ddd = d.slice(0, 2);
    const resto = d.slice(2);
    // 8 dígitos = fixo (4+4); 9 dígitos = celular (5+4)
    if (resto.length <= 4) return `(${ddd}) ${resto}`;
    if (resto.length <= 8) return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
    return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5, 9)}`;
  }

  // decide se um input é de telefone (por vários sinais)
  function ehTelefone(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    if (el.dataset.maskTel === '1') return false; // já tratado
    // ⚠️ AJUSTE 22/07: NUNCA aplica em caixas de BUSCA — mesmo que a
    // palavra "telefone" apareça no placeholder (ex: "Buscar por nome ou
    // telefone..."), são campos de texto LIVRE que buscam por vários
    // critérios ao mesmo tempo, não um campo de telefone puro. Aplicar a
    // máscara aqui apagava qualquer LETRA digitada (a máscara só aceita
    // dígito) e também quebrava a própria busca por telefone (reformatava
    // o texto digitado com parênteses/traço — "(34) 99946-5229" — que
    // nunca bate com o telefone cru salvo no banco, tipo "5534999465229").
    // Caso real: campo de busca da tela Pacientes.
    if (el.closest('.search-box')) return false;
    const tipo = (el.type || '').toLowerCase();
    if (tipo === 'tel') return true;
    if (tipo && tipo !== 'text' && tipo !== 'search') return false; // ignora number/email/date/etc.
    const alvo = ((el.id || '') + ' ' + (el.name || '') + ' ' + (el.placeholder || '') + ' ' + (el.className || '')).toLowerCase();
    // reforço extra: qualquer campo com cara de BUSCA nunca é telefone puro
    if (/buscar|pesquisar|procurar/.test(alvo)) return false;
    // palavras-chave (sem exigir borda de palavra: pega nlPhone, editPhone, telCliente, etc.)
    if (/telefone|whatsapp|whats|celular|fone|phone|contato|tel\b|ddd/.test(alvo)) return true;
    // placeholder com cara de telefone: (XX), (00), (34) 9...
    const ph = (el.placeholder || '');
    if (/\(\s*\d{2}\s*\)/.test(ph) || /\(\s*x{2}\s*\)/i.test(ph)) return true;
    return false;
  }

  function aplicar(el) {
    if (!ehTelefone(el)) return;
    // segurança: se já vier um valor com mais de 11 dígitos (ex.: com 55 do país),
    // NÃO mexe nesse campo — evita cortar/estragar número já salvo.
    if (el.value && String(el.value).replace(/\D/g, '').length > 11) { el.dataset.maskTel = '1'; return; }
    el.dataset.maskTel = '1';
    el.setAttribute('inputmode', 'numeric'); // teclado numérico no celular
    // formata o que já estiver lá
    if (el.value) el.value = formatar(el.value);
    el.addEventListener('input', function () {
      const pos = el.selectionStart;
      const antes = el.value;
      el.value = formatar(el.value);
      // mantém o cursor perto do fim quando digitando no final
      if (pos >= antes.length) {
        // cursor no fim (caso comum)
      } else {
        try { el.setSelectionRange(pos, pos); } catch (e) {}
      }
    });
  }

  // varre os inputs da página e aplica nos de telefone
  function varrer(raiz) {
    (raiz || document).querySelectorAll('input').forEach(aplicar);
  }

  // primeira passada
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => varrer(document));
  } else {
    varrer(document);
  }

  // pega campos criados depois (modais abrem dinamicamente)
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes && m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.tagName === 'INPUT') aplicar(n);
        else if (n.querySelectorAll) n.querySelectorAll('input').forEach(aplicar);
      });
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // reforço leve (caso algum modal escape do observer)
  setInterval(() => varrer(document), 2000);

  console.log('✅ telefone-mascara-fix.js carregado — máscara de telefone (visual)');
})();
