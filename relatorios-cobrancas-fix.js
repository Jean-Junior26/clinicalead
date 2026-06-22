// ============================================================
// CLINICALEAD — RELATÓRIOS: COBRANÇAS & MENSALIDADES
// Injeta uma seção na página de Relatórios (page-relatorios) com a
// visão do DONO: em aberto, atrasado, inadimplentes, recebido no
// período e — principalmente — as RENEGOCIAÇÕES do período (qual
// paciente, de quanto era, por quanto ficou, em quantas vezes,
// quando e QUEM fez). Pra não ter "rolo" da equipe. 🔍
// Self-contained; usa mensalidade_parcelas + pagamentos +
// renegociacoes + leads + clinic_users (tudo via RLS).
// ============================================================

(function () {
  'use strict';

  const REL = { periodo: 'mes' };

  const fmt = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hojeISO = () => iso(new Date());
  const restante = (p) => Math.max(0, Number(p.valor || 0) - Number(p.valor_pago || 0));
  function brData(s) {
    if (!s) return '—';
    const d = new Date(String(s).length <= 10 ? s + 'T12:00' : s);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  }

  function ranges(p) {
    const h = new Date();
    if (p === 'tudo') return null;
    if (p === 'mes_passado') {
      return { de: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), ate: iso(new Date(h.getFullYear(), h.getMonth(), 0)) };
    }
    return { de: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: iso(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
  }
  function rotuloPeriodo(p) {
    if (p === 'tudo') return 'todo o período';
    if (p === 'mes_passado') return 'mês passado';
    return 'este mês';
  }

  window.relCobPeriodo = function (p) { REL.periodo = p; relCobCarregar(); };

  function card(rotulo, valor, cor, sub) {
    return `<div style="flex:1;min-width:130px;background:var(--bg-elevated);border:1px solid var(--border-subtle,#2a2a2a);border-radius:10px;padding:12px 14px;">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">${rotulo}</div>
      <div style="font-size:18px;font-weight:700;font-family:var(--mono);color:${cor || 'var(--text-primary)'};margin-top:4px;">${valor}</div>
      ${sub ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${sub}</div>` : ''}
    </div>`;
  }

  async function relCobCarregar() {
    const body = document.getElementById('relCobBody');
    if (!body) return;
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) { body.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:13px;">—</div>'; return; }

    // marca período ativo
    document.querySelectorAll('.relcob-fbtn').forEach(b => {
      b.style.cssText = b.dataset.p === REL.periodo
        ? 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);font-weight:600;' : '';
    });
    body.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:13px;">Carregando…</div>';

    try {
      const hoje = hojeISO();
      const per = ranges(REL.periodo);

      // 1) snapshot ATUAL (independe do período): em aberto / atrasado / inadimplentes
      const { data: abertas } = await db.from('mensalidade_parcelas')
        .select('valor,valor_pago,vencimento,lead_id,status')
        .eq('clinic_id', clinic.id).in('status', ['pendente', 'parcial']);
      let emAberto = 0, atrasado = 0; const inad = new Set();
      (abertas || []).forEach(p => {
        const r = restante(p); emAberto += r;
        if (p.vencimento < hoje) { atrasado += r; if (p.lead_id) inad.add(p.lead_id); }
      });

      // 2) recebido em mensalidades no período (pagamentos ligados a parcela)
      let qp = db.from('pagamentos').select('valor,data').eq('clinic_id', clinic.id).not('parcela_id', 'is', null);
      if (per) qp = qp.gte('data', per.de).lte('data', per.ate);
      const { data: pagos } = await qp;
      const recebido = (pagos || []).reduce((s, x) => s + Number(x.valor || 0), 0);

      // 3) renegociações no período
      let qr = db.from('renegociacoes').select('*').eq('clinic_id', clinic.id).order('created_at', { ascending: false });
      if (per) qr = qr.gte('created_at', per.de + 'T00:00:00').lte('created_at', per.ate + 'T23:59:59');
      const { data: renegs } = await qr;
      const lista = renegs || [];
      const totalNovo = lista.reduce((s, x) => s + Number(x.valor_novo || 0), 0);
      const totalOrig = lista.reduce((s, x) => s + Number(x.valor_original || 0), 0);

      // nomes dos pacientes + quem fez (clinic_users por user_id)
      const nomes = {}; const usuarios = {};
      const leadIds = [...new Set(lista.map(r => r.lead_id).filter(Boolean))];
      const userIds = [...new Set(lista.map(r => r.criado_por).filter(Boolean))];
      if (leadIds.length) {
        const { data: ls } = await db.from('leads').select('id,nome').in('id', leadIds);
        (ls || []).forEach(l => { nomes[l.id] = l.nome; });
      }
      if (userIds.length) {
        const { data: us } = await db.from('clinic_users').select('user_id,nome').in('user_id', userIds);
        (us || []).forEach(u => { usuarios[u.user_id] = u.nome; });
      }

      // ── render ──
      const cards = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
        ${card('Em aberto', fmt(emAberto), '#5B8DB8', 'parcelas a receber (total)')}
        ${card('Atrasado', fmt(atrasado), '#C0624A', 'já vencido e não pago')}
        ${card('Inadimplentes', String(inad.size), inad.size ? '#C0624A' : '#7FB069', 'pacientes com atraso')}
        ${card('Recebido', fmt(recebido), '#7FB069', 'mensalidades · ' + rotuloPeriodo(REL.periodo))}
        ${card('Renegociado', fmt(totalNovo), '#C9A84C', lista.length + ' acordo' + (lista.length === 1 ? '' : 's') + ' · ' + rotuloPeriodo(REL.periodo))}
      </div>`;

      let tabela;
      if (!lista.length) {
        tabela = `<div style="padding:18px;text-align:center;color:var(--text-muted);font-size:13px;border:1px dashed var(--border-subtle,#2a2a2a);border-radius:10px;">
          Nenhuma renegociação em ${rotuloPeriodo(REL.periodo)}.</div>`;
      } else {
        const dif = totalNovo - totalOrig;
        const difTxt = dif === 0 ? '' :
          `<div style="font-size:12px;color:var(--text-secondary);margin:6px 0 12px;">
             Total renegociado: de <b style="font-family:var(--mono);">${fmt(totalOrig)}</b> para <b style="font-family:var(--mono);">${fmt(totalNovo)}</b>
             <span style="color:${dif < 0 ? '#C0624A' : '#7FB069'};">(${dif < 0 ? '−' : '+'}${fmt(Math.abs(dif))})</span>
           </div>`;
        const linhas = lista.map(r => {
          const nome = nomes[r.lead_id] || 'Paciente';
          const quem = r.criado_por ? (usuarios[r.criado_por] || 'usuário') : '—';
          const orig = Number(r.valor_original || 0), novo = Number(r.valor_novo || 0);
          const setaCor = novo < orig ? '#C0624A' : (novo > orig ? '#7FB069' : 'var(--text-secondary)');
          return `<div style="padding:12px 0;border-top:1px solid var(--border-subtle,#2a2a2a);">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline;">
              <div style="font-weight:600;">${nome}</div>
              <div style="font-size:11px;color:var(--text-muted);">${brData(r.created_at)}</div>
            </div>
            <div style="font-size:13px;margin-top:3px;">
              de <b style="font-family:var(--mono);">${fmt(orig)}</b>
              <span style="color:${setaCor};">→</span>
              <b style="font-family:var(--mono);">${fmt(novo)}</b>
              <span style="color:var(--text-secondary);"> · ${r.qtd_parcelas}x · ${r.qtd_origem} parcela${r.qtd_origem === 1 ? '' : 's'} renegociada${r.qtd_origem === 1 ? '' : 's'}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">
              <i class="ti ti-user" style="font-size:13px;"></i> por <b>${quem}</b>${r.observacao ? ` · <span style="color:var(--text-muted);">${r.observacao}</span>` : ''}
            </div>
          </div>`;
        }).join('');
        tabela = `<div style="font-size:13px;font-weight:600;margin-bottom:2px;">Renegociações (${lista.length})</div>${difTxt}${linhas}`;
      }

      body.innerHTML = cards + tabela;
    } catch (e) {
      body.innerHTML = '<div style="padding:14px;color:var(--coral);font-size:13px;">Erro: ' + (e.message || '') + '</div>';
      console.error('[relatorios-cobrancas]', e);
    }
  }

  // ── injeta a seção dentro da página de Relatórios ────────
  function injetar() {
    const page = document.getElementById('page-relatorios');
    if (!page) return;
    if (document.getElementById('relCobrancas')) return;
    const sec = document.createElement('div');
    sec.id = 'relCobrancas';
    sec.className = 'card';
    sec.style.cssText = 'margin-top:20px;padding:18px;';
    sec.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
        <h3 style="margin:0;font-size:16px;"><i class="ti ti-cash" style="color:var(--gold);margin-right:6px;"></i>Cobranças & Mensalidades</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm relcob-fbtn" data-p="mes" onclick="relCobPeriodo('mes')">Este mês</button>
          <button class="btn btn-sm relcob-fbtn" data-p="mes_passado" onclick="relCobPeriodo('mes_passado')">Mês passado</button>
          <button class="btn btn-sm relcob-fbtn" data-p="tudo" onclick="relCobPeriodo('tudo')">Tudo</button>
        </div>
      </div>
      <div id="relCobBody"></div>`;
    page.appendChild(sec);
    relCobCarregar();
  }

  // injeta/atualiza quando a página de relatórios está ativa
  setInterval(() => {
    const page = document.getElementById('page-relatorios');
    if (page && page.classList.contains('active')) injetar();
  }, 800);

  console.log('✅ relatorios-cobrancas-fix.js carregado — seção Cobranças nos Relatórios');
})();
