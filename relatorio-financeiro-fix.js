// ============================================================
// CLINICALEAD — RELATÓRIO FINANCEIRO
// Seção acoplada ao final da página Relatórios:
//   • Recebido no período + nº de pagamentos
//   • Ticket médio por paciente pagante
//   • Taxa de aprovação de orçamentos (em R$)
//   • Divisão por forma de pagamento (barras)
//   • Receita aprovada por procedimento (ranking)
// ============================================================

let RELFIN = { atalho: '30', inicio: null, fim: null };

function rfIso(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0]; }
function rfHoje() { return rfIso(new Date()); }
function rfDiasAtras(n) { const d = new Date(); d.setDate(d.getDate() - n); return rfIso(d); }
function rfFmt(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }

// Taxa (%) do cartão p/ um pagamento (mesma lógica da comissão).
function rfTaxaPagamento(taxas, forma, parcelas) {
  if (!taxas) return 0;
  const p = Number(parcelas) || 1;
  if (forma === 'cartao_debito') return Number(taxas.debito) || 0;
  if (forma === 'cartao_credito') {
    if (p <= 1) return Number(taxas.credito_vista) || 0;
    const f = (taxas.parcelado || []).find(x => p >= Number(x.de) && p <= Number(x.ate));
    return f ? (Number(f.taxa) || 0) : 0;
  }
  return 0;
}

RELFIN.inicio = rfDiasAtras(30);
RELFIN.fim = rfHoje();

function relfinSetPeriodo(atalho) {
  RELFIN.atalho = atalho;
  if (atalho === 'tudo') { RELFIN.inicio = null; RELFIN.fim = null; }
  else { RELFIN.inicio = rfDiasAtras(Number(atalho)); RELFIN.fim = rfHoje(); }
  relfinRender();
}

function relfinSetDatas() {
  RELFIN.inicio = document.getElementById('relFinDataInicio')?.value || null;
  RELFIN.fim = document.getElementById('relFinDataFim')?.value || rfHoje();
  RELFIN.atalho = 'custom';
  relfinRender();
}

// ── Renderização da seção ────────────────────────────────────
async function relfinRender() {
  const page = document.getElementById('page-relatorios');
  if (!page) return;

  let sec = document.getElementById('relFinanceiro');
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'relFinanceiro';
    sec.setAttribute('data-html2canvas-ignore', '');
    page.appendChild(sec);
  }

  const btn = (a, label) => `<button class="btn btn-sm" onclick="relfinSetPeriodo('${a}')" style="${RELFIN.atalho === a ? 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);' : ''}">${label}</button>`;

  sec.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin:28px 0 14px;">
      <h2 style="font-size:17px;"><i class="ti ti-cash" style="color:var(--gold);margin-right:8px;"></i>Financeiro</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <div style="display:flex;align-items:center;gap:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-sm,10px);padding:5px 10px;">
          <i class="ti ti-calendar" style="color:var(--gold);font-size:14px;"></i>
          <input type="date" id="relFinDataInicio" class="form-input" style="border:none;background:transparent;padding:0;width:120px;font-size:12px;" value="${RELFIN.inicio || ''}" onchange="relfinSetDatas()"/>
          <span style="color:var(--text-muted);font-size:11px;">até</span>
          <input type="date" id="relFinDataFim" class="form-input" style="border:none;background:transparent;padding:0;width:120px;font-size:12px;" value="${RELFIN.fim || ''}" onchange="relfinSetDatas()"/>
        </div>
        ${btn('30', '30 dias')}${btn('90', '90 dias')}${btn('365', '1 ano')}${btn('tudo', 'Tudo')}
      </div>
    </div>
    <div id="relFinCorpo" style="font-size:13px;color:var(--text-secondary);padding:20px;">Carregando dados financeiros...</div>
  `;

  const clinic = currentClinic();
  if (!clinic) return;

  try {
    // ── Pagamentos do período ──
    let qPag = db.from('pagamentos').select('valor,forma,lead_id,data,parcelas').eq('clinic_id', clinic.id);
    if (RELFIN.inicio) qPag = qPag.gte('data', RELFIN.inicio).lte('data', RELFIN.fim);
    const { data: pags } = await qPag;
    const pagamentos = pags || [];

    const recebido = pagamentos.reduce((s, p) => s + Number(p.valor || 0), 0);
    const pacientesPagantes = new Set(pagamentos.map(p => p.lead_id).filter(Boolean)).size;
    const ticketMedio = pacientesPagantes ? recebido / pacientesPagantes : 0;

    // ── Bruto x Líquido (só se a clínica tiver taxas de cartão cadastradas) ──
    let taxasCartao = null;
    try {
      const { data: cRow } = await db.from('clinicas').select('taxas_cartao').eq('id', clinic.id).maybeSingle();
      taxasCartao = (cRow && cRow.taxas_cartao) ? cRow.taxas_cartao : null;
    } catch (e) { taxasCartao = null; }
    const totalTaxas = taxasCartao
      ? pagamentos.reduce((s, p) => s + Number(p.valor || 0) * rfTaxaPagamento(taxasCartao, p.forma, p.parcelas) / 100, 0)
      : 0;
    const liquido = recebido - totalTaxas;

    // ── Listas de detalhamento (drill-down dos cards) ──
    const leadMap = {};
    (STATE.leads || []).forEach(l => { leadMap[l.id] = l; });
    const FORMA_NOMES = { pix: '💠 Pix', cartao_credito: '💳 Crédito', cartao_debito: '💳 Débito', dinheiro: '💵 Dinheiro', boleto: '🧾 Boleto', transferencia: '🏦 Transf.' };

    RELFIN.det = { recebidos: [], pagantes: [], orcados: [] };
    pagamentos.forEach(p => {
      const lead = leadMap[p.lead_id];
      RELFIN.det.recebidos.push({
        leadId: p.lead_id, nome: lead?.nome || 'Lead', tel: (lead?.telefone || '').replace(/\D/g, ''),
        sub: `${FORMA_NOMES[p.forma] || p.forma} · ${p.data ? new Date(p.data + 'T12:00').toLocaleDateString('pt-BR') : '—'}`,
        valor: Number(p.valor || 0),
      });
    });
    const pagPorLead = {};
    pagamentos.forEach(p => {
      if (!p.lead_id) return;
      if (!pagPorLead[p.lead_id]) pagPorLead[p.lead_id] = { total: 0, qtd: 0 };
      pagPorLead[p.lead_id].total += Number(p.valor || 0);
      pagPorLead[p.lead_id].qtd++;
    });
    Object.entries(pagPorLead).forEach(([leadId, agg]) => {
      const lead = leadMap[leadId];
      RELFIN.det.pagantes.push({
        leadId, nome: lead?.nome || 'Lead', tel: (lead?.telefone || '').replace(/\D/g, ''),
        sub: `${agg.qtd} pagamento${agg.qtd !== 1 ? 's' : ''} no período`,
        valor: agg.total,
      });
    });
    RELFIN.det.pagantes.sort((a, b) => b.valor - a.valor);

    // ── Orçamentos do período (taxa de aprovação + procedimentos) ──
    let qOrc = db.from('orcamentos').select('id,lead_id,created_at').eq('clinic_id', clinic.id).neq('status', 'recusado');
    if (RELFIN.inicio) qOrc = qOrc.gte('created_at', RELFIN.inicio).lte('created_at', RELFIN.fim + 'T23:59:59');
    const { data: orcs } = await qOrc;
    const orcIds = (orcs || []).map(o => o.id);

    let itens = [];
    if (orcIds.length) {
      const { data: its } = await db.from('orcamento_itens')
        .select('orcamento_id,nome,valor,qtd,aprovado').in('orcamento_id', orcIds);
      itens = its || [];
    }
    const valorOrcado = itens.reduce((s, i) => s + Number(i.valor) * Number(i.qtd || 1), 0);
    const valorAprovado = itens.filter(i => i.aprovado).reduce((s, i) => s + Number(i.valor) * Number(i.qtd || 1), 0);
    const taxaAprov = valorOrcado ? Math.round((valorAprovado / valorOrcado) * 100) : 0;

    (orcs || []).forEach(o => {
      const lead = leadMap[o.lead_id];
      const its = itens.filter(i => i.orcamento_id === o.id);
      const tot = its.reduce((s, i) => s + Number(i.valor) * Number(i.qtd || 1), 0);
      const apr = its.filter(i => i.aprovado).reduce((s, i) => s + Number(i.valor) * Number(i.qtd || 1), 0);
      RELFIN.det.orcados.push({
        leadId: o.lead_id, nome: lead?.nome || 'Lead', tel: (lead?.telefone || '').replace(/\D/g, ''),
        sub: `${new Date(o.created_at).toLocaleDateString('pt-BR')} · aprovado ${rfFmt(apr)} de ${rfFmt(tot)}`,
        valor: tot,
      });
    });
    RELFIN.det.orcados.sort((a, b) => b.valor - a.valor);

    // ── Por forma de pagamento ──
    const FORMAS = {
      pix:             { label: '💠 Pix',               cor: '#5B8DB8' },
      cartao_credito:  { label: '💳 Cartão de crédito', cor: '#C9A84C' },
      cartao_debito:   { label: '💳 Cartão de débito',  cor: '#E8C96A' },
      dinheiro:        { label: '💵 Dinheiro',          cor: '#8ABBE8' },
      boleto:          { label: '🧾 Boleto',            cor: '#A07B30' },
      transferencia:   { label: '🏦 Transferência',     cor: '#C0624A' },
    };
    const porForma = {};
    pagamentos.forEach(p => { porForma[p.forma] = (porForma[p.forma] || 0) + Number(p.valor || 0); });
    const formasOrdenadas = Object.entries(porForma).sort((a, b) => b[1] - a[1]);
    const maxForma = formasOrdenadas.length ? formasOrdenadas[0][1] : 0;

    const barrasFormas = formasOrdenadas.map(([forma, valor]) => {
      const f = FORMAS[forma] || { label: forma, cor: 'var(--gold)' };
      const pct = maxForma ? Math.round((valor / maxForma) * 100) : 0;
      const share = recebido ? Math.round((valor / recebido) * 100) : 0;
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0;">
          <span style="width:160px;font-size:12px;color:var(--text-secondary);">${f.label}</span>
          <div style="flex:1;height:14px;background:var(--bg-elevated);border-radius:7px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${f.cor};border-radius:7px;"></div>
          </div>
          <span style="width:110px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--gold);">${rfFmt(valor)}</span>
          <span style="width:40px;text-align:right;font-size:11px;color:var(--text-muted);">${share}%</span>
        </div>`;
    }).join('');

    // ── Receita aprovada por procedimento ──
    const porProc = {};
    itens.filter(i => i.aprovado).forEach(i => {
      porProc[i.nome] = (porProc[i.nome] || 0) + Number(i.valor) * Number(i.qtd || 1);
    });
    const procsOrdenados = Object.entries(porProc).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxProc = procsOrdenados.length ? procsOrdenados[0][1] : 0;

    const barrasProcs = procsOrdenados.map(([nome, valor], idx) => {
      const pct = maxProc ? Math.round((valor / maxProc) * 100) : 0;
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0;">
          <span style="width:24px;font-size:11px;color:var(--text-muted);">${idx + 1}º</span>
          <span style="width:200px;font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${nome.replace(/"/g, '&quot;')}">${nome}</span>
          <div style="flex:1;height:14px;background:var(--bg-elevated);border-radius:7px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:var(--gold);border-radius:7px;"></div>
          </div>
          <span style="width:110px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--gold);">${rfFmt(valor)}</span>
        </div>`;
    }).join('');

    // ── Monta o corpo ──
    const cardKpi = (tipo, titulo, valor, sub, cor) => `
      <div class="card" style="padding:14px 16px;${tipo ? 'cursor:pointer;transition:border-color 0.2s;' : ''}" ${tipo ? `onmouseover="this.style.borderColor='var(--gold-border)'" onmouseout="this.style.borderColor=''" onclick="relfinDetalhe('${tipo}')" title="Clique para ver o detalhamento"` : ''}>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px;">${titulo}</div>
        <div style="font-size:21px;font-weight:700;font-family:var(--mono);color:${cor};margin-top:6px;">${valor}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${sub}${tipo ? ' · <span style="color:var(--gold);">ver →</span>' : ''}</div>
      </div>`;

    document.getElementById('relFinCorpo').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:18px;">
        ${cardKpi('recebidos', 'Recebido', rfFmt(recebido), `${pagamentos.length} pagamento${pagamentos.length !== 1 ? 's' : ''}`, 'var(--gold)')}
        ${cardKpi('pagantes', 'Ticket médio', rfFmt(ticketMedio), `${pacientesPagantes} paciente${pacientesPagantes !== 1 ? 's' : ''} pagante${pacientesPagantes !== 1 ? 's' : ''}`, '#E8C96A')}
        ${cardKpi('orcados', 'Orçado no período', rfFmt(valorOrcado), 'soma dos orçamentos criados', 'var(--text-primary, #F0EAD6)')}
        ${cardKpi('orcados', 'Taxa de aprovação', taxaAprov + '%', `${rfFmt(valorAprovado)} aprovados`, taxaAprov >= 50 ? 'var(--gold)' : 'var(--coral)')}
      </div>

      ${taxasCartao ? `
      <div class="card" style="margin-bottom:14px;">
        <div class="card-header"><h3 style="font-size:13px;"><i class="ti ti-credit-card" style="color:var(--gold);margin-right:6px;"></i>Líquido de taxas de cartão</h3></div>
        <div class="card-body" style="padding-top:6px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
            ${cardKpi('', 'Bruto recebido', rfFmt(recebido), 'antes das taxas', 'var(--text-primary, #F0EAD6)')}
            ${cardKpi('', 'Taxas de cartão', '− ' + rfFmt(totalTaxas), 'descontado das maquininhas', 'var(--coral)')}
            ${cardKpi('', 'Líquido', rfFmt(liquido), 'o que sobra de fato', 'var(--gold)')}
          </div>
        </div>
      </div>` : ''}

      <div class="card" style="margin-bottom:14px;">
        <div class="card-header"><h3 style="font-size:13px;"><i class="ti ti-wallet" style="color:var(--gold);margin-right:6px;"></i>Recebido por forma de pagamento</h3></div>
        <div class="card-body" style="padding-top:6px;">
          ${barrasFormas || '<div style="font-size:12px;color:var(--text-muted);padding:10px 0;">Nenhum pagamento registrado no período.</div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3 style="font-size:13px;"><i class="ti ti-dental" style="color:var(--gold);margin-right:6px;"></i>Receita aprovada por procedimento</h3></div>
        <div class="card-body" style="padding-top:6px;">
          ${barrasProcs || '<div style="font-size:12px;color:var(--text-muted);padding:10px 0;">Nenhum item aprovado no período.</div>'}
        </div>
      </div>
    `;
  } catch (e) {
    console.error('[rel financeiro]', e);
    const corpo = document.getElementById('relFinCorpo');
    if (corpo) corpo.innerHTML = '<div style="color:var(--coral);font-size:12px;">Erro ao carregar o financeiro.</div>';
  }
}

// ── Engata no renderRelatorios existente ─────────────────────
(function () {
  if (typeof renderRelatorios !== 'function') {
    console.error('[rel financeiro] renderRelatorios não encontrado');
    return;
  }
  const _renderRelatoriosOriginal = renderRelatorios;
  renderRelatorios = async function (...args) {
    const r = _renderRelatoriosOriginal.apply(this, args);
    if (r && typeof r.then === 'function') await r;
    relfinRender();
    return r;
  };
})();

// ── Modal de detalhamento (quem compõe cada número) ──────────
function relfinDetalhe(tipo) {
  if (!document.getElementById('modalRelFin')) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalRelFin';
    overlay.innerHTML = `
      <div class="modal" style="max-width:620px;width:96vw;">
        <div class="modal-header">
          <h3 id="relFinDetTitulo"></h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('modalRelFin')"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" id="relFinDetBody" style="max-height:65vh;overflow-y:auto;"></div>
      </div>`;
    document.body.appendChild(overlay);
  }

  const config = {
    recebidos: { titulo: '<i class="ti ti-cash" style="color:var(--gold);margin-right:8px;"></i>Pagamentos recebidos', vazio: 'Nenhum pagamento no período.' },
    pagantes:  { titulo: '<i class="ti ti-users" style="color:#E8C96A;margin-right:8px;"></i>Pacientes pagantes', vazio: 'Nenhum paciente pagante no período.' },
    orcados:   { titulo: '<i class="ti ti-file-invoice" style="color:var(--gold);margin-right:8px;"></i>Orçamentos do período', vazio: 'Nenhum orçamento criado no período.' },
  };
  const c = config[tipo];
  const lista = (RELFIN.det && RELFIN.det[tipo]) || [];
  document.getElementById('relFinDetTitulo').innerHTML = c.titulo;

  document.getElementById('relFinDetBody').innerHTML = lista.length ? lista.map(item => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-subtle);flex-wrap:wrap;">
      <div class="avatar" style="${avatarStyle(item.nome)}">${initials(item.nome)}</div>
      <div style="flex:1;min-width:140px;">
        <div style="font-size:13px;font-weight:600;">${item.nome}</div>
        <div style="font-size:11px;color:var(--text-muted);">${item.sub || ''}</div>
      </div>
      <div style="font-family:var(--mono);font-size:14px;color:var(--gold);">${rfFmt(item.valor)}</div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-ghost btn-icon" title="Abrir orçamentos" onclick="closeModal('modalRelFin');openOrcamento('${item.leadId}')"><i class="ti ti-file-invoice" style="color:var(--gold);"></i></button>
        ${item.tel ? `<button class="btn btn-sm btn-ghost btn-icon" title="Conversa no Inbox" onclick="closeModal('modalRelFin');tarefaWhats('${item.tel}')"><i class="ti ti-message-circle" style="color:#25D366;"></i></button>` : ''}
        <button class="btn btn-sm btn-ghost btn-icon" title="Abrir cadastro em nova aba" onclick="abrirCadastroNovaAba('${item.leadId}')"><i class="ti ti-external-link"></i></button>
      </div>
    </div>`).join('')
    : `<div style="text-align:center;padding:30px;color:var(--text-secondary);font-size:13px;">${c.vazio}</div>`;

  document.getElementById('modalRelFin').classList.add('open');
}

console.log('✅ relatorio-financeiro-fix.js carregado — relatório financeiro ativo');
