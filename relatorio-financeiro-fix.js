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

RELFIN.inicio = rfDiasAtras(30);
RELFIN.fim = rfHoje();

function relfinSetPeriodo(atalho) {
  RELFIN.atalho = atalho;
  if (atalho === 'tudo') { RELFIN.inicio = null; RELFIN.fim = null; }
  else { RELFIN.inicio = rfDiasAtras(Number(atalho)); RELFIN.fim = rfHoje(); }
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
      <div style="display:flex;gap:8px;">${btn('30', '30 dias')}${btn('90', '90 dias')}${btn('365', '1 ano')}${btn('tudo', 'Tudo')}</div>
    </div>
    <div id="relFinCorpo" style="font-size:13px;color:var(--text-secondary);padding:20px;">Carregando dados financeiros...</div>
  `;

  const clinic = currentClinic();
  if (!clinic) return;

  try {
    // ── Pagamentos do período ──
    let qPag = db.from('pagamentos').select('valor,forma,lead_id,data').eq('clinic_id', clinic.id);
    if (RELFIN.inicio) qPag = qPag.gte('data', RELFIN.inicio).lte('data', RELFIN.fim);
    const { data: pags } = await qPag;
    const pagamentos = pags || [];

    const recebido = pagamentos.reduce((s, p) => s + Number(p.valor || 0), 0);
    const pacientesPagantes = new Set(pagamentos.map(p => p.lead_id).filter(Boolean)).size;
    const ticketMedio = pacientesPagantes ? recebido / pacientesPagantes : 0;

    // ── Orçamentos do período (taxa de aprovação + procedimentos) ──
    let qOrc = db.from('orcamentos').select('id,created_at').eq('clinic_id', clinic.id).neq('status', 'recusado');
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
    const cardKpi = (titulo, valor, sub, cor) => `
      <div class="card" style="padding:14px 16px;">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px;">${titulo}</div>
        <div style="font-size:21px;font-weight:700;font-family:var(--mono);color:${cor};margin-top:6px;">${valor}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${sub}</div>
      </div>`;

    document.getElementById('relFinCorpo').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:18px;">
        ${cardKpi('Recebido', rfFmt(recebido), `${pagamentos.length} pagamento${pagamentos.length !== 1 ? 's' : ''}`, 'var(--gold)')}
        ${cardKpi('Ticket médio', rfFmt(ticketMedio), `${pacientesPagantes} paciente${pacientesPagantes !== 1 ? 's' : ''} pagante${pacientesPagantes !== 1 ? 's' : ''}`, '#E8C96A')}
        ${cardKpi('Orçado no período', rfFmt(valorOrcado), 'soma dos orçamentos criados', 'var(--text-primary, #F0EAD6)')}
        ${cardKpi('Taxa de aprovação', taxaAprov + '%', `${rfFmt(valorAprovado)} aprovados`, taxaAprov >= 50 ? 'var(--gold)' : 'var(--coral)')}
      </div>

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

console.log('✅ relatorio-financeiro-fix.js carregado — relatório financeiro ativo');
