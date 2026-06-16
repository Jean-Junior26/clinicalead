// ============================================================
// CLINICALEAD — FAIXA FINANCEIRA POR PAGAMENTOS (Fatia 3)
// Reescreve a faixa financeira do Dashboard pela regra nova:
//  • Fechamentos = nº de orçamentos com 1º pagamento (fechado_em)
//  • Recebido    = soma dos pagamentos (dinheiro que entrou)
//  • A receber   = residual dos orçamentos fechados (falta pagar)
// Mantém o funil comercial e o "Potencial" intactos.
// ============================================================

async function atualizarFinanceiroPagamentos() {
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  const page = document.getElementById('page-dashboard');
  const metrics = page?.querySelector('.metrics-grid');
  if (!clinic || !page || !metrics) return;

  let faixa = document.getElementById('painelFinanceiroPag');
  if (!faixa) {
    faixa = document.createElement('div');
    faixa.id = 'painelFinanceiroPag';
    faixa.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:16px 0;';
    metrics.insertAdjacentElement('afterend', faixa);
  }
  faixa.innerHTML = `<div style="grid-column:1/-1;font-size:12px;color:var(--text-muted);padding:8px;">Carregando financeiro...</div>`;

  try {
    const fmt = (typeof fmtCurrency === 'function') ? fmtCurrency : (v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));

    // Orçamentos FECHADOS (têm fechado_em = 1º pagamento)
    const { data: orcsFechados } = await db.from('orcamentos')
      .select('id, fechado_em').eq('clinic_id', clinic.id).not('fechado_em', 'is', null);
    const idsFechados = (orcsFechados || []).map(o => o.id);
    const numFechamentos = idsFechados.length;

    // Recebido = soma de TODOS os pagamentos da clínica
    const { data: pagamentos } = await db.from('pagamentos').select('valor, orcamento_id').eq('clinic_id', clinic.id);
    const totalRecebido = (pagamentos || []).reduce((s, p) => s + Number(p.valor || 0), 0);

    // Valor total dos orçamentos fechados (pra calcular o "a receber")
    let totalFechado = 0;
    if (idsFechados.length) {
      const { data: itens } = await db.from('orcamento_itens')
        .select('valor, qtd, orcamento_id').in('orcamento_id', idsFechados);
      (itens || []).forEach(i => { totalFechado += Number(i.valor || 0) * Number(i.qtd || 1); });
    }
    // A receber = total dos orçamentos fechados - o que já foi pago neles
    const pagoNosFechados = (pagamentos || [])
      .filter(p => idsFechados.includes(p.orcamento_id))
      .reduce((s, p) => s + Number(p.valor || 0), 0);
    const aReceber = Math.max(0, totalFechado - pagoNosFechados);

    const cards = [
      { label: 'Fechamentos', valor: numFechamentos, cor: 'var(--gold)', isNum: true, icone: 'ti-trophy' },
      { label: 'Recebido', valor: totalRecebido, cor: '#3FB950', icone: 'ti-cash' },
      { label: 'A receber', valor: aReceber, cor: 'var(--blue, #5B8DB8)', icone: 'ti-clock-dollar' },
    ];

    faixa.innerHTML = cards.map(c => `
      <div class="card" style="padding:14px 16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <i class="ti ${c.icone}" style="color:${c.cor};font-size:16px;"></i>
          <span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">${c.label}</span>
        </div>
        <div style="font-size:22px;font-weight:700;color:${c.cor};font-family:${c.isNum ? 'inherit' : 'var(--mono)'};">
          ${c.isNum ? c.valor : fmt(c.valor)}
        </div>
      </div>`).join('');

  } catch (e) {
    faixa.innerHTML = `<div style="grid-column:1/-1;font-size:12px;color:var(--coral);padding:8px;">Erro ao carregar financeiro: ${e.message}</div>`;
  }
}

// ── Substitui a faixa antiga e dispara a nova ────────────────
(function () {
  // Sobrescreve a função antiga (se existir) pela nova
  if (typeof window !== 'undefined') {
    window.atualizarFinanceiroDashboard = atualizarFinanceiroPagamentos;
  }

  // Dispara ao entrar no dashboard
  if (typeof showPage === 'function') {
    const _orig = showPage;
    showPage = function (id, el) {
      _orig(id, el);
      if (id === 'dashboard') setTimeout(atualizarFinanceiroPagamentos, 300);
    };
  }
  // Esconde a faixa antiga se ela existir (evita duplicar)
  setTimeout(() => {
    const antiga = document.getElementById('painelFinanceiro');
    if (antiga) antiga.style.display = 'none';
  }, 500);

  setTimeout(atualizarFinanceiroPagamentos, 1500);
  console.log('✅ dashboard-financeiro-pagamentos-fix.js carregado (Fatia 3)');
})();
