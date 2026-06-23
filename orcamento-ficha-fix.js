// ============================================================
// CLINICALEAD — BOTÃO "NOVO ORÇAMENTO" NA ABA DO PACIENTE
// A aba Orçamentos (no cadastro do paciente) não tinha botão de
// criar quando o paciente ainda não tinha orçamento. Aqui garantimos
// o botão "Novo orçamento" sempre — abrindo a gestão já no paciente.
// Carregar APÓS ficha-paciente-fix.js.
// ============================================================

(function () {
  'use strict';

  function instalar() {
    if (typeof fichaCarregarOrcamentos !== 'function' || fichaCarregarOrcamentos.__patched) return false;
    const _orig = fichaCarregarOrcamentos;
    fichaCarregarOrcamentos = async function () {
      const r = await _orig.apply(this, arguments);
      try {
        const box = document.getElementById('fichaTabOrcamentos');
        if (box && !box.querySelector('button')) {
          // caso "vazio": injeta o botão de criar
          const leadId = (typeof FICHA !== 'undefined' && FICHA.leadId) ? FICHA.leadId : null;
          const wrap = document.createElement('div');
          wrap.style.cssText = 'text-align:center;margin-top:14px;';
          const btn = document.createElement('button');
          btn.className = 'btn btn-sm btn-primary';
          btn.innerHTML = '<i class="ti ti-plus"></i> Novo orçamento';
          btn.onclick = function () {
            if (typeof closeModal === 'function') closeModal('modalEditLead');
            if (typeof openOrcamento === 'function') openOrcamento(leadId);
          };
          wrap.appendChild(btn);
          box.appendChild(wrap);
        }
      } catch (e) { console.error('[orc ficha]', e); }
      return r;
    };
    fichaCarregarOrcamentos.__patched = true;
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }

  console.log('✅ orcamento-ficha-fix.js carregado — botão Novo orçamento na aba do paciente');
})();
