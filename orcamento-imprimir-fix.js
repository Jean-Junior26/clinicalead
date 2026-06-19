// ============================================================
// CLINICALEAD — IMPRESSÃO / PDF DE ORÇAMENTO
// Adiciona um botão "Imprimir / PDF" no modal de orçamento.
// Gera uma página limpa e profissional (cabeçalho da clínica,
// dados do paciente, itens, valores) pronta pra imprimir ou
// salvar como PDF (via "Salvar como PDF" da impressão do navegador).
// ============================================================

(function () {
  'use strict';

  function fmt(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  // monta o HTML imprimível de um orçamento
  function htmlImpressao(orc, lead, clinic) {
    const itens = orc.itens || [];
    const subtotal = itens.reduce((s, i) => s + (Number(i.valor) * Number(i.qtd || 1)), 0);
    const desconto = Number(orc.desconto || 0);
    const total = Math.max(0, subtotal - desconto);
    const hoje = new Date().toLocaleDateString('pt-BR');

    const linhasItens = itens.map((i, idx) => `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;">${idx + 1}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;">${i.nome || '—'}${i.dente ? ` <span style="color:#888;font-size:12px;">(dente ${i.dente})</span>` : ''}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;">${i.qtd || 1}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;">${fmt(i.valor)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;">${fmt(Number(i.valor) * Number(i.qtd || 1))}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento - ${lead.nome || ''}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; color:#222; padding:32px; max-width:760px; margin:0 auto; }
  .cab { display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C9A84C;padding-bottom:16px;margin-bottom:20px; }
  .clinica-nome { font-size:22px;font-weight:700;color:#C9A84C; }
  .clinica-info { font-size:12px;color:#666;margin-top:4px;line-height:1.5; }
  .doc-titulo { font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px;text-align:right; }
  .doc-data { font-size:12px;color:#888;text-align:right;margin-top:4px; }
  .secao { margin-bottom:18px; }
  .secao-titulo { font-size:11px;text-transform:uppercase;color:#888;letter-spacing:0.5px;margin-bottom:6px; }
  .paciente { font-size:15px;font-weight:600; }
  table { width:100%;border-collapse:collapse;margin-top:8px; }
  th { background:#faf6ec;padding:8px 6px;text-align:left;font-size:12px;color:#9a7d30;text-transform:uppercase;border-bottom:2px solid #C9A84C; }
  th.num,td.num { text-align:right; }
  .totais { margin-top:16px;margin-left:auto;width:280px; }
  .totais-linha { display:flex;justify-content:space-between;padding:6px 0;font-size:14px; }
  .totais-total { border-top:2px solid #C9A84C;margin-top:6px;padding-top:10px;font-size:18px;font-weight:700;color:#C9A84C; }
  .rodape { margin-top:40px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center; }
  .assinatura { margin-top:48px;text-align:center; }
  .assinatura-linha { border-top:1px solid #333;width:260px;margin:0 auto;padding-top:6px;font-size:12px;color:#666; }
  @media print { body { padding:12px; } .no-print { display:none; } }
</style></head><body>

  <div class="cab">
    <div>
      <div class="clinica-nome">${clinic.nome || 'Clínica'}</div>
      <div class="clinica-info">
        ${clinic.endereco ? clinic.endereco + '<br>' : ''}
        ${clinic.telefone ? 'Tel: ' + clinic.telefone : ''}
      </div>
    </div>
    <div>
      <div class="doc-titulo">Orçamento</div>
      <div class="doc-data">Emitido em ${hoje}</div>
    </div>
  </div>

  <div class="secao">
    <div class="secao-titulo">Paciente</div>
    <div class="paciente">${lead.nome || '—'}</div>
    ${lead.telefone ? `<div style="font-size:13px;color:#666;">${lead.telefone}</div>` : ''}
  </div>

  <div class="secao">
    <div class="secao-titulo">Procedimentos</div>
    <table>
      <thead><tr>
        <th style="width:30px;">#</th>
        <th>Procedimento</th>
        <th style="text-align:center;width:50px;">Qtd</th>
        <th style="text-align:right;width:100px;">Valor</th>
        <th style="text-align:right;width:110px;">Subtotal</th>
      </tr></thead>
      <tbody>${linhasItens || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#999;">Nenhum item</td></tr>'}</tbody>
    </table>
  </div>

  <div class="totais">
    <div class="totais-linha"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    ${desconto > 0 ? `<div class="totais-linha"><span>Desconto</span><span>- ${fmt(desconto)}</span></div>` : ''}
    <div class="totais-linha totais-total"><span>Total</span><span>${fmt(total)}</span></div>
  </div>

  <div class="assinatura">
    <div class="assinatura-linha">${clinic.responsavel || clinic.nome || 'Responsável'}</div>
  </div>

  <div class="rodape">
    Este orçamento é válido por 30 dias. ${clinic.nome || ''} agradece a confiança! 🦷
  </div>

  <div class="no-print" style="text-align:center;margin-top:24px;">
    <button onclick="window.print()" style="padding:12px 24px;background:#C9A84C;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600;">🖨️ Imprimir / Salvar PDF</button>
  </div>

</body></html>`;
  }

  // abre a janela de impressão com o orçamento
  window.imprimirOrcamento = function (orcId) {
    // acha o orçamento no estado (ORC.orcamentos vem do orcamentos-fix)
    const orc = (typeof ORC !== 'undefined' && ORC.orcamentos || []).find(o => o.id === orcId)
      || (typeof ORC !== 'undefined' && ORC.orcamentos || [])[0];
    if (!orc) { if (typeof toast === 'function') toast('Orçamento não encontrado', 'error'); return; }

    const lead = (STATE.leads || []).find(l => l.id === orc.lead_id) || {};
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : {};

    const win = window.open('', '_blank');
    if (!win) { if (typeof toast === 'function') toast('Permita pop-ups para imprimir', 'error'); return; }
    win.document.write(htmlImpressao(orc, lead, clinic));
    win.document.close();
  };

  // injeta o botão "Imprimir" no modal de orçamento
  function injetarBotaoImprimir() {
    const modal = document.getElementById('modalOrcamento');
    if (!modal || !modal.classList.contains('open')) return;
    const header = modal.querySelector('.modal-header');
    if (!header || header.querySelector('.btn-imprimir-orc')) return;

    // pega o orçamento atual (o primeiro/único aberto)
    const orc = (typeof ORC !== 'undefined' && ORC.orcamentos || [])[0];
    if (!orc) return;

    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-imprimir-orc';
    btn.style.cssText = 'margin-left:auto;margin-right:8px;';
    btn.innerHTML = '<i class="ti ti-printer"></i> Imprimir';
    btn.onclick = () => imprimirOrcamento(orc.id);
    // insere antes do botão de fechar
    const fechar = header.querySelector('.btn-ghost.btn-icon, button:last-child');
    header.insertBefore(btn, fechar);
  }

  // observa a abertura do modal pra injetar o botão
  const obs = new MutationObserver(() => {
    if (document.getElementById('modalOrcamento')?.classList.contains('open')) {
      setTimeout(injetarBotaoImprimir, 150);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  console.log('✅ orcamento-imprimir-fix.js carregado');
})();
