// ============================================================
// CLINICALEAD — BRIAN: Dashboard de custo (ADMIN)
// Mostra, por clínica, o consumo de tokens e o custo REAL em R$
// (lido direto de brian_uso.custo_usd, calculado na Edge Function
// já incluindo tokens de prompt-cache — antes esse valor era ignorado
// e o painel subestimava bastante o custo real).
// O câmbio USD→BRL é ajustável no topo do arquivo.
// Aparece como botão no painel "Brian — Liberações".
// ============================================================

(function () {
  'use strict';

  // câmbio dólar→real (ajuste quando quiser — só afeta a exibição em R$,
  // o custo em USD já vem calculado certo da Edge Function)
  const USD_BRL = 5.40;

  function ehAdmin() {
    const r = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return r === 'admin' || r === 'administrador';
  }

  function fmtBRL(n) { return 'R$ ' + n.toFixed(2).replace('.', ','); }
  function fmtUSD(n) { return 'US$ ' + n.toFixed(4); }

  window.abrirBrianDashboard = async function () {
    if (!ehAdmin()) return;
    if (!document.getElementById('modalBrianDash')) {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.id = 'modalBrianDash';
      ov.innerHTML = `
        <div class="modal" style="max-width:760px;width:96vw;">
          <div class="modal-header">
            <h3><i class="ti ti-chart-bar" style="margin-right:8px;color:var(--gold);"></i>Brian — Custo por clínica</h3>
            <button class="btn btn-ghost btn-icon" onclick="closeModal('modalBrianDash')"><i class="ti ti-x"></i></button>
          </div>
          <div class="modal-body" id="brianDashBody" style="max-height:74vh;overflow-y:auto;"></div>
        </div>`;
      document.body.appendChild(ov);
    }
    openModal('modalBrianDash');
    document.getElementById('brianDashBody').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Calculando consumo…</div>';
    await renderDash();
  };

  async function renderDash() {
    const body = document.getElementById('brianDashBody');
    if (!body) return;

    // nomes das clínicas
    let nomes = {};
    try { const { data } = await db.from('clinicas').select('id, nome'); (data || []).forEach(c => nomes[c.id] = c.nome); } catch (e) {}

    // saldo/pacote de cada clínica (pra comparar custo real vs. o que ela paga)
    let saldos = {};
    try {
      const { data } = await db.from('brian_saldo').select('clinic_id, incluso_mes');
      (data || []).forEach(s => saldos[s.clinic_id] = s.incluso_mes || 0);
    } catch (e) {}

    // consumo real: lê direto o custo_usd já calculado (inclui tokens de cache)
    let usos = [];
    try {
      const { data } = await db.from('brian_uso').select('clinic_id, tokens_in, tokens_out, tokens_cache_write, tokens_cache_read, custo_usd, created_at');
      usos = data || [];
    } catch (e) { body.innerHTML = '<div style="padding:20px;color:var(--coral);">Erro ao carregar consumo.</div>'; return; }

    // se ainda existirem linhas antigas sem custo_usd (gravadas antes da correção),
    // calcula um custo aproximado só com tokens_in/tokens_out pra não sumir do histórico
    // (deixa marcado como estimado, pois não tem o dado de cache daquela chamada antiga).
    const PRECO_IN_FALLBACK = 1.0 / 1_000_000;
    const PRECO_OUT_FALLBACK = 5.0 / 1_000_000;

    // agrega por clínica (total e mês atual)
    const agora = new Date();
    const mesIni = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const ag = {};
    usos.forEach(u => {
      const id = u.clinic_id;
      if (!ag[id]) ag[id] = { msgs: 0, custoUsd: 0, msgsMes: 0, custoUsdMes: 0 };
      const custo = (u.custo_usd != null && u.custo_usd > 0)
        ? u.custo_usd
        : ((u.tokens_in || 0) * PRECO_IN_FALLBACK + (u.tokens_out || 0) * PRECO_OUT_FALLBACK);
      ag[id].msgs++; ag[id].custoUsd += custo;
      if (new Date(u.created_at) >= mesIni) { ag[id].msgsMes++; ag[id].custoUsdMes += custo; }
    });

    const ids = Object.keys(ag);
    let totalMesBRL = 0, totalGeralBRL = 0;
    ids.forEach(id => { totalMesBRL += ag[id].custoUsdMes * USD_BRL; totalGeralBRL += ag[id].custoUsd * USD_BRL; });

    if (!ids.length) {
      body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Nenhum consumo registrado ainda. Quando o Brian gerar sugestões, o custo aparece aqui.</div>';
      return;
    }

    body.innerHTML = `
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;background:var(--bg-card,#1C1C20);border:1px solid var(--gold-border,rgba(201,168,76,0.25));border-radius:10px;padding:12px 14px;">
          <div style="font-size:11px;color:var(--text-secondary);">Custo este mês (total)</div>
          <div style="font-size:20px;font-weight:700;color:var(--gold,#C9A84C);">${fmtBRL(totalMesBRL)}</div>
        </div>
        <div style="flex:1;min-width:140px;background:var(--bg-card,#1C1C20);border:1px solid var(--border-subtle,rgba(255,255,255,0.06));border-radius:10px;padding:12px 14px;">
          <div style="font-size:11px;color:var(--text-secondary);">Custo acumulado (tudo)</div>
          <div style="font-size:20px;font-weight:700;color:var(--text-primary);">${fmtBRL(totalGeralBRL)}</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">
        Custo real (inclui tokens de prompt-cache) · câmbio R$ ${USD_BRL.toFixed(2)}.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="text-align:left;color:var(--text-secondary);border-bottom:1px solid var(--border,rgba(201,168,76,0.15));">
            <th style="padding:8px 6px;">Clínica</th>
            <th style="padding:8px 6px;text-align:right;">Msgs (mês)</th>
            <th style="padding:8px 6px;text-align:right;">Custo (mês)</th>
            <th style="padding:8px 6px;text-align:right;">Pacote/mês</th>
            <th style="padding:8px 6px;text-align:right;">Custo/msg (mês)</th>
            <th style="padding:8px 6px;text-align:right;">Custo (total)</th>
          </tr>
        </thead>
        <tbody>
          ${ids.sort((a, b) => ag[b].custoUsdMes - ag[a].custoUsdMes).map(id => {
            const custoMesBRL = ag[id].custoUsdMes * USD_BRL;
            const custoPorMsg = ag[id].msgsMes ? (custoMesBRL / ag[id].msgsMes) : 0;
            const pacote = saldos[id] || 0;
            return `
            <tr style="border-bottom:1px solid var(--border-subtle,rgba(255,255,255,0.05));">
              <td style="padding:8px 6px;color:var(--text-primary);">${nomes[id] || id.slice(0, 8)}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--text-secondary);">${ag[id].msgsMes}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--gold,#C9A84C);font-weight:600;">${fmtBRL(custoMesBRL)}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--text-muted);">${pacote || '—'}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--text-secondary);">${fmtBRL(custoPorMsg)}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--text-muted);">${fmtBRL(ag[id].custoUsd * USD_BRL)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div style="font-size:11px;color:var(--text-muted);margin-top:14px;line-height:1.5;">
        💡 Custo médio por mensagem (geral): <b style="color:var(--text-secondary);">${(() => {
          const tm = ids.reduce((s, id) => s + ag[id].msgs, 0);
          const tc = ids.reduce((s, id) => s + ag[id].custoUsd, 0) * USD_BRL;
          return tm ? fmtBRL(tc / tm) : 'R$ 0,00';
        })()}</b> — use esse número × tamanho do pacote (ex.: 3.000 msgs) pra saber o custo real de cada pacote antes de precificar.
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

  console.log('✅ brian-dashboard-fix.js carregado — dashboard de custo REAL do Brian (admin)');
})();
