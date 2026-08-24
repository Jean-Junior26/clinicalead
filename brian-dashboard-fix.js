// ============================================================
// CLINICALEAD — BRIAN: Dashboard de custo (ADMIN)
// Mostra, por clínica, quantas mensagens a IA gerou e quanto custou
// de verdade (lê brian_uso.custo_usd, já calculado na Edge Function
// incluindo tokens de prompt-cache).
//
// ⚠️ CORREÇÃO 23/08 — BUG SÉRIO: a consulta antiga era um
// `.select()` puro, sem paginação. O Supabase corta em 1.000 linhas
// por padrão, então o painel só somava as PRIMEIRAS 1.000 mensagens
// e ignorava todo o resto — quanto mais o sistema era usado, mais
// errado (pra menos) ficava o número. Agora busca em páginas até
// acabar de verdade.
//
// ⚠️ NOVO 23/08: filtro de PERÍODO (hoje / 7 dias / 30 dias / este mês
// / tudo / personalizado), mostrando total de mensagens e custo do
// período escolhido.
// ============================================================

(function () {
  'use strict';

  // câmbio dólar→real (ajuste quando quiser — só afeta a exibição em R$,
  // o custo em USD já vem calculado certo da Edge Function)
  const USD_BRL = 5.40;

  // período selecionado no momento
  let PERIODO = { tipo: '30d', de: null, ate: null };

  function ehAdmin() {
    const r = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return r === 'admin' || r === 'administrador';
  }

  function fmtBRL(n) { return 'R$ ' + n.toFixed(2).replace('.', ','); }
  function fmtInt(n) { return n.toLocaleString('pt-BR'); }

  // devolve { desde, ate } em ISO, ou nulls quando é "tudo"
  function limitesDoPeriodo() {
    const agora = new Date();
    const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    switch (PERIODO.tipo) {
      case 'hoje': return { desde: hoje0.toISOString(), ate: null };
      case '7d':   return { desde: new Date(hoje0.getTime() - 6 * 86400000).toISOString(), ate: null };
      case '30d':  return { desde: new Date(hoje0.getTime() - 29 * 86400000).toISOString(), ate: null };
      case 'mes':  return { desde: new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString(), ate: null };
      case 'custom': {
        const d = PERIODO.de ? new Date(PERIODO.de + 'T00:00:00').toISOString() : null;
        const a = PERIODO.ate ? new Date(PERIODO.ate + 'T23:59:59').toISOString() : null;
        return { desde: d, ate: a };
      }
      default: return { desde: null, ate: null }; // 'tudo'
    }
  }

  function rotuloPeriodo() {
    switch (PERIODO.tipo) {
      case 'hoje': return 'hoje';
      case '7d': return 'nos últimos 7 dias';
      case '30d': return 'nos últimos 30 dias';
      case 'mes': return 'neste mês';
      case 'custom': return `de ${PERIODO.de || '?'} até ${PERIODO.ate || '?'}`;
      default: return 'desde o início';
    }
  }

  // ⚠️ busca PAGINADA — sem isso o Supabase devolve só 1.000 linhas
  async function buscarUsos(desde, ate) {
    const TAM = 1000;
    let todos = [];
    let inicio = 0;
    while (true) {
      let q = db.from('brian_uso')
        .select('clinic_id, tokens_in, tokens_out, custo_usd, created_at')
        .order('created_at', { ascending: false })
        .range(inicio, inicio + TAM - 1);
      if (desde) q = q.gte('created_at', desde);
      if (ate) q = q.lte('created_at', ate);
      const { data, error } = await q;
      if (error) throw error;
      const lote = data || [];
      todos = todos.concat(lote);
      if (lote.length < TAM) break;      // acabou
      inicio += TAM;
      if (inicio > 200000) break;        // trava de segurança
    }
    return todos;
  }

  window.abrirBrianDashboard = async function () {
    if (!ehAdmin()) return;
    if (!document.getElementById('modalBrianDash')) {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.id = 'modalBrianDash';
      ov.innerHTML = `
        <div class="modal" style="max-width:820px;width:96vw;">
          <div class="modal-header">
            <h3><i class="ti ti-chart-bar" style="margin-right:8px;color:var(--gold);"></i>Brian — Custo por clínica</h3>
            <button class="btn btn-ghost btn-icon" onclick="closeModal('modalBrianDash')"><i class="ti ti-x"></i></button>
          </div>
          <div class="modal-body" style="max-height:78vh;overflow-y:auto;">
            <div id="brianDashFiltro" style="margin-bottom:14px;"></div>
            <div id="brianDashBody"></div>
          </div>
        </div>`;
      document.body.appendChild(ov);
    }
    openModal('modalBrianDash');
    renderFiltro();
    await renderDash();
  };

  function renderFiltro() {
    const el = document.getElementById('brianDashFiltro');
    if (!el) return;
    const botao = (tipo, texto) => `
      <button onclick="brianDashPeriodo('${tipo}')" style="
        padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer;
        border:1px solid ${PERIODO.tipo === tipo ? 'var(--gold,#C9A84C)' : 'var(--border-subtle,rgba(255,255,255,0.12))'};
        background:${PERIODO.tipo === tipo ? 'rgba(201,168,76,0.15)' : 'transparent'};
        color:${PERIODO.tipo === tipo ? 'var(--gold,#C9A84C)' : 'var(--text-secondary,#A1A1AA)'};
        font-weight:${PERIODO.tipo === tipo ? '600' : '400'};">${texto}</button>`;

    el.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        ${botao('hoje', 'Hoje')}
        ${botao('7d', '7 dias')}
        ${botao('30d', '30 dias')}
        ${botao('mes', 'Este mês')}
        ${botao('tudo', 'Tudo')}
        ${botao('custom', 'Personalizado')}
      </div>
      ${PERIODO.tipo === 'custom' ? `
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;">
        <label style="font-size:12px;color:var(--text-secondary);">De</label>
        <input type="date" id="brianDashDe" value="${PERIODO.de || ''}" class="form-input" style="width:auto;padding:5px 8px;font-size:12px;">
        <label style="font-size:12px;color:var(--text-secondary);">até</label>
        <input type="date" id="brianDashAte" value="${PERIODO.ate || ''}" class="form-input" style="width:auto;padding:5px 8px;font-size:12px;">
        <button class="btn btn-sm btn-primary" onclick="brianDashAplicarCustom()">Aplicar</button>
      </div>` : ''}
    `;
  }

  window.brianDashPeriodo = async function (tipo) {
    PERIODO.tipo = tipo;
    renderFiltro();
    if (tipo !== 'custom') await renderDash();
  };

  window.brianDashAplicarCustom = async function () {
    const de = document.getElementById('brianDashDe')?.value;
    const ate = document.getElementById('brianDashAte')?.value;
    if (!de || !ate) { if (typeof toast === 'function') toast('Escolha as duas datas', 'error'); return; }
    if (de > ate) { if (typeof toast === 'function') toast('A data inicial é maior que a final', 'error'); return; }
    PERIODO.de = de; PERIODO.ate = ate;
    await renderDash();
  };

  async function renderDash() {
    const body = document.getElementById('brianDashBody');
    if (!body) return;
    body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Calculando consumo…</div>';

    // nomes das clínicas
    let nomes = {};
    try { const { data } = await db.from('clinicas').select('id, nome'); (data || []).forEach(c => nomes[c.id] = c.nome); } catch (e) { }

    // pacote contratado de cada clínica (pra comparar com o custo real)
    let saldos = {};
    try {
      const { data } = await db.from('brian_saldo').select('clinic_id, incluso_mes');
      (data || []).forEach(s => saldos[s.clinic_id] = s.incluso_mes || 0);
    } catch (e) { }

    const { desde, ate } = limitesDoPeriodo();
    let usos = [];
    try {
      usos = await buscarUsos(desde, ate);
    } catch (e) {
      body.innerHTML = '<div style="padding:20px;color:var(--coral,#C0624A);">Erro ao carregar consumo: ' + (e.message || e) + '</div>';
      return;
    }

    // linhas antigas (gravadas antes do rastreamento de custo existir) não têm
    // custo_usd — estima pelos tokens pra não sumir do histórico, e conta
    // quantas foram, pra avisar que o número daquele período é parcial.
    const PRECO_IN_FALLBACK = 1.0 / 1_000_000;
    const PRECO_OUT_FALLBACK = 5.0 / 1_000_000;
    let semCustoReal = 0;

    const ag = {};
    usos.forEach(u => {
      const id = u.clinic_id;
      if (!ag[id]) ag[id] = { msgs: 0, custoUsd: 0 };
      let custo = u.custo_usd;
      if (custo == null || custo <= 0) {
        custo = (u.tokens_in || 0) * PRECO_IN_FALLBACK + (u.tokens_out || 0) * PRECO_OUT_FALLBACK;
        if (!custo) semCustoReal++;
      }
      ag[id].msgs++;
      ag[id].custoUsd += custo;
    });

    const ids = Object.keys(ag);
    if (!ids.length) {
      body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);">Nenhum consumo registrado ${rotuloPeriodo()}.</div>`;
      return;
    }

    const totalMsgs = ids.reduce((s, id) => s + ag[id].msgs, 0);
    const totalBRL = ids.reduce((s, id) => s + ag[id].custoUsd, 0) * USD_BRL;
    const mediaPorMsg = totalMsgs ? totalBRL / totalMsgs : 0;

    const card = (rotulo, valor, destaque) => `
      <div style="flex:1;min-width:140px;background:var(--bg-card,#1C1C20);border:1px solid ${destaque ? 'var(--gold-border,rgba(201,168,76,0.25))' : 'var(--border-subtle,rgba(255,255,255,0.06))'};border-radius:10px;padding:12px 14px;">
        <div style="font-size:11px;color:var(--text-secondary);">${rotulo}</div>
        <div style="font-size:20px;font-weight:700;color:${destaque ? 'var(--gold,#C9A84C)' : 'var(--text-primary)'};">${valor}</div>
      </div>`;

    body.innerHTML = `
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
        ${card('Mensagens ' + rotuloPeriodo(), fmtInt(totalMsgs), false)}
        ${card('Custo ' + rotuloPeriodo(), fmtBRL(totalBRL), true)}
        ${card('Custo médio por msg', fmtBRL(mediaPorMsg), false)}
      </div>
      ${semCustoReal ? `<div style="font-size:11px;color:var(--coral,#C0624A);margin-bottom:10px;">
        ⚠️ ${fmtInt(semCustoReal)} mensagem(ns) desse período são anteriores ao rastreamento de custo (antes de 08/07/2026) e entram como R$ 0,00 — o custo real desse período é maior que o mostrado.
      </div>` : ''}
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">
        Custo real, já incluindo tokens de prompt-cache · câmbio R$ ${USD_BRL.toFixed(2)}.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="text-align:left;color:var(--text-secondary);border-bottom:1px solid var(--border,rgba(201,168,76,0.15));">
            <th style="padding:8px 6px;">Clínica</th>
            <th style="padding:8px 6px;text-align:right;">Mensagens</th>
            <th style="padding:8px 6px;text-align:right;">Custo</th>
            <th style="padding:8px 6px;text-align:right;">Custo/msg</th>
            <th style="padding:8px 6px;text-align:right;">Pacote/mês</th>
          </tr>
        </thead>
        <tbody>
          ${ids.sort((a, b) => ag[b].custoUsd - ag[a].custoUsd).map(id => {
            const custoBRL = ag[id].custoUsd * USD_BRL;
            const porMsg = ag[id].msgs ? (custoBRL / ag[id].msgs) : 0;
            const pacote = saldos[id] || 0;
            return `
            <tr style="border-bottom:1px solid var(--border-subtle,rgba(255,255,255,0.05));">
              <td style="padding:8px 6px;color:var(--text-primary);">${nomes[id] || id.slice(0, 8)}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--text-secondary);">${fmtInt(ag[id].msgs)}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--gold,#C9A84C);font-weight:600;">${fmtBRL(custoBRL)}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--text-secondary);">${fmtBRL(porMsg)}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--text-muted);">${pacote ? fmtInt(pacote) : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div style="font-size:11px;color:var(--text-muted);margin-top:14px;line-height:1.5;">
        💡 Pra precificar um pacote: multiplique o <b style="color:var(--text-secondary);">custo médio por msg (${fmtBRL(mediaPorMsg)})</b> pelo tamanho do pacote.
        Ex.: 3.000 mensagens ≈ <b style="color:var(--text-secondary);">${fmtBRL(mediaPorMsg * 3000)}</b> de custo real.
      </div>`;
  }

  // injeta um botão "Ver custos" no painel de liberações do admin
  function injetarBotao() {
    if (!ehAdmin()) return;
    const header = document.querySelector('#modalBrianAdmin .modal-header');
    if (!header || document.getElementById('btnBrianDash')) return;
    const x = header.querySelector('button');
    const b = document.createElement('button');
    b.id = 'btnBrianDash';
    b.className = 'btn btn-sm';
    b.style.cssText = 'margin-left:auto;margin-right:8px;border:1px solid var(--gold-border,rgba(201,168,76,0.35));color:var(--gold,#C9A84C);';
    b.innerHTML = '<i class="ti ti-chart-bar"></i> Ver custos';
    b.onclick = abrirBrianDashboard;
    if (x) header.insertBefore(b, x); else header.appendChild(b);
  }
  setInterval(injetarBotao, 1000);

  console.log('✅ brian-dashboard-fix.js carregado — dashboard de custo REAL do Brian (admin, com filtro de período)');
})();
