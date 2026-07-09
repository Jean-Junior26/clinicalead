// ============================================================
// CLINICALEAD — BRIAN SOLO: esconde os módulos de CRM completo
// pra clínicas que contrataram só a IA de atendimento (tipo_produto
// = 'brian_solo' na tabela clinicas). Mantém: Dashboard, Leads,
// Agenda, Inbox WhatsApp, Meu Plano, e o botão do Brian IA.
// Esconde: Funil de Vendas, Pacientes, Automações, Relatórios,
// Procedimentos, Clínicas (gestão multi-clínica).
// ============================================================

(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }

  // páginas escondidas no modo Brian Solo (por data-page)
  const PAGINAS_OCULTAS = ['kanban', 'pacientes', 'automacoes', 'relatorios', 'procedimentos', 'clinicas'];

  let ultimoClinicId = null;
  let ultimoTipo = null;

  async function aplicarModoSolo() {
    const clinic = clinicAtual();
    if (!clinic || !clinic.id) return;

    // só reconsulta se trocou de clínica (evita bater no banco toda hora)
    if (clinic.id === ultimoClinicId && ultimoTipo !== null) {
      aplicarVisibilidade(ultimoTipo === 'brian_solo');
      return;
    }

    let tipo = 'crm_completo';
    try {
      const database = getDb();
      const { data } = await database.from('clinicas').select('tipo_produto').eq('id', clinic.id).maybeSingle();
      tipo = (data && data.tipo_produto) ? data.tipo_produto : 'crm_completo';
    } catch (e) { /* se falhar, assume CRM completo (mais seguro, não esconde nada) */ }

    ultimoClinicId = clinic.id;
    ultimoTipo = tipo;
    aplicarVisibilidade(tipo === 'brian_solo');
  }

  function aplicarVisibilidade(ehSolo) {
    PAGINAS_OCULTAS.forEach(pagina => {
      const btn = document.querySelector(`.nav-item[data-page="${pagina}"]`);
      if (btn) btn.style.display = ehSolo ? 'none' : '';
    });

    // se a clínica é Brian Solo e a página atual escondida ficou ativa
    // (ex: usuário estava em "Relatórios" e o admin mudou o tipo), joga
    // pro Dashboard pra não deixar tela quebrada.
    if (ehSolo) {
      const ativo = document.querySelector('.nav-item.active');
      if (ativo && PAGINAS_OCULTAS.includes(ativo.dataset.page)) {
        const dash = document.querySelector('.nav-item[data-page="dashboard"]');
        if (dash && typeof showPage === 'function') showPage('dashboard', dash);
      }
    }

    // marca visualmente (opcional) — mostra uma tag "Brian Solo" ao lado do nome da clínica
    const nomeEl = document.getElementById('clinicName');
    if (nomeEl && ehSolo && !document.getElementById('tagBrianSolo')) {
      const tag = document.createElement('span');
      tag.id = 'tagBrianSolo';
      tag.textContent = ' 🤖 Solo';
      tag.style.cssText = 'font-size:10px;color:var(--gold,#C9A84C);font-weight:600;';
      nomeEl.appendChild(tag);
    } else if (nomeEl && !ehSolo) {
      const tagExistente = document.getElementById('tagBrianSolo');
      if (tagExistente) tagExistente.remove();
    }
  }

  setInterval(aplicarModoSolo, 1500);

  console.log('✅ brian-solo-modo-fix.js carregado — esconde CRM completo pra clínicas Brian Solo');
})();
