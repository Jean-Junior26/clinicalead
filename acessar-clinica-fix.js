// ============================================================
// CLINICALEAD — BOTÃO "ACESSAR CLÍNICA" (admin master)
// Restaura o botão que permite ao admin entrar em qualquer
// clínica pra dar suporte. Adiciona por cima do painel de
// Gestão de Clínicas, sem alterar o código existente.
// ============================================================

(function () {
  'use strict';

  // Só faz sentido pro admin master
  function ehAdmin() {
    const role = STATE?.profile?.role;
    return role === 'admin' || role === 'administrador';
  }

  // Faz a troca de clínica reaproveitando a função que já existe.
  // Tenta, em ordem: switchClinicById -> switchClinic(idx) -> fallback manual.
  async function acessarClinica(clinicId) {
    try {
      if (typeof switchClinicById === 'function') {
        await switchClinicById(clinicId);
      } else if (typeof switchClinic === 'function') {
        // acha o índice da clínica na lista e usa switchClinic(idx)
        const idx = (STATE.clinics || []).findIndex(c => c.id === clinicId);
        if (idx >= 0) await switchClinic(idx);
        else throw new Error('clínica não encontrada na lista');
      } else {
        throw new Error('nenhuma função de troca disponível');
      }
      if (typeof toast === 'function') toast('Entrando na clínica… ✓');
      // vai pro dashboard da clínica acessada
      setTimeout(() => {
        const dashItem = document.querySelector('.nav-item[data-page="dashboard"]');
        if (dashItem && typeof showPage === 'function') showPage('dashboard', dashItem);
      }, 300);
    } catch (e) {
      console.error('[acessar-clinica] erro:', e);
      if (typeof toast === 'function') toast('Não consegui trocar de clínica', 'error');
    }
  }
  // expõe global pro onclick
  window.acessarClinica = acessarClinica;

  // Descobre o clinic_id de uma linha da tabela.
  // Estratégia: casar o e-mail/nome exibido na linha com STATE.clinics.
  function clinicIdDaLinha(tr) {
    const txt = (tr.innerText || '').toLowerCase();
    const clinicas = STATE.clinics || [];
    // tenta por e-mail (mais único)
    for (const c of clinicas) {
      if (c.email && txt.includes(String(c.email).toLowerCase())) return c.id;
    }
    // depois por nome
    for (const c of clinicas) {
      if (c.nome && txt.includes(String(c.nome).toLowerCase())) return c.id;
    }
    return null;
  }

  // Injeta o botão "Acessar" em cada linha da tabela de clínicas
  function injetarBotoes() {
    if (!ehAdmin()) return;
    // acha a página de gestão de clínicas (visível)
    const pagina = document.getElementById('page-clinicas') || document.querySelector('.page');
    if (!pagina) return;

    // procura linhas de tabela dentro da página de clínicas
    const linhas = pagina.querySelectorAll('table tbody tr, .clinica-row, tr');
    linhas.forEach(tr => {
      // evita duplicar
      if (tr.querySelector('.btn-acessar-clinica')) return;
      // só linhas que realmente representam uma clínica
      const clinicId = clinicIdDaLinha(tr);
      if (!clinicId) return;
      // acha a célula de ações (última td) pra inserir o botão
      const tds = tr.querySelectorAll('td');
      if (!tds.length) return;
      const celulaAcoes = tds[tds.length - 1];

      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-acessar-clinica';
      btn.style.cssText = 'background:var(--gold);color:#1a1a1a;border:none;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;margin-right:6px;';
      btn.innerHTML = '<i class="ti ti-login-2"></i> Acessar';
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        acessarClinica(clinicId);
      };
      // insere como primeiro botão da célula de ações
      celulaAcoes.insertBefore(btn, celulaAcoes.firstChild);
    });
  }

  // Observa a tela: quando a página de clínicas renderizar, injeta os botões
  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    // roda agora
    injetarBotoes();
    // e re-roda quando o DOM muda (troca de página, re-render da tabela)
    const obs = new MutationObserver(() => {
      clearTimeout(window.__acessarClinicaTimer);
      window.__acessarClinicaTimer = setTimeout(injetarBotoes, 200);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('✅ acessar-clinica-fix.js carregado (botão Acessar restaurado)');
    return true;
  }

  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
