// ============================================================
// CLINICALEAD — BRIAN: Dashboard de custo (ADMIN)
// Mostra, por clínica, o consumo de tokens e o custo estimado em R$
// (baseado na tabela brian_uso). Ajuda a medir o custo real e precificar.
// Preços Claude Haiku 4.5: US$1,00/milhão (entrada) e US$5,00/milhão (saída).
// O Brian usa Haiku (não Sonnet) — modelo rápido e econômico.
// O câmbio USD→BRL é ajustável no topo do arquivo.
// Aparece como botão no painel "Brian — Liberações".
// ============================================================

(function () {
  'use strict';

  // ── parâmetros de custo (Haiku 4.5 — o modelo que o Brian usa de verdade) ──
  const USD_POR_MI_IN = 1.00;    // entrada: US$ por 1 milhão de tokens (Haiku 4.5)
  const USD_POR_MI_OUT = 5.00;   // saída: US$ por 1 milhão de tokens (Haiku 4.5)
  const USD_BRL = 5.40;          // câmbio dólar→real (ajuste quando quiser)

  function ehAdmin() {
    const r = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return r === 'admin' || r === 'administrador';
  }

  function custoBRL(tokIn, tokOut) {
    const usd = (tokIn / 1e6) * USD_POR_MI_IN + (tokOut / 1e6) * USD_POR_MI_OUT;
    return usd * USD_BRL;
  }
  function fmt(n) { return 'R$ ' + n.toFixed(2).replace('.', ','); }

  window.abrirBrianDashboard = async function () {
    if (!ehAdmin()) return;
    if (!document.getElementById('modalBrianDash')) {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.id = 'modalBrianDash';
      ov.innerHTML = `
        <div class="modal" style="max-width:680px;width:96vw;">
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

    // consumo: soma tokens por clínica (toda a tabela brian_uso)
    let usos = [];
    try {
      const { data } = await db.from('brian_uso').select('clinic_id, tokens_in, tokens_out, created_at');
      usos = data || [];
    } catch (e) { body.innerHTML = '<div style="padding:20px;color:var(--coral);">Erro ao carregar consumo.</div>'; return; }

    // agrega por clínica (total e mês atual)
    const agora = new Date();
    const mesIni = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const ag = {};
    usos.forEach(u => {
      const id = u.clinic_id;
      if (!ag[id]) ag[id] = { msgs: 0, tin: 0, tout: 0, msgsMes: 0, tinMes: 0, toutMes: 0 };
      ag[id].msgs++; ag[id].tin += (u.tokens_in || 0); ag[id].tout += (u.tokens_out || 0);
      if (new Date(u.created_at) >= mesIni) { ag[id].msgsMes++; ag[id].tinMes += (u.tokens_in || 0); ag[id].toutMes += (u.tokens_out || 0); }
    });

    const ids = Object.keys(ag);
    let totalMesBRL = 0, totalGeralBRL = 0;
    ids.forEach(id => { totalMesBRL += custoBRL(ag[id].tinMes, ag[id].toutMes); totalGeralBRL += custoBRL(ag[id].tin, ag[id].tout); });

    if (!ids.length) {
      body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Nenhum consumo registrado ainda. Quando o Brian gerar sugestões, o custo aparece aqui.</div>';
      return;
    }

    body.innerHTML = `
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:140px;background:var(--bg-card,#1C1C20);border:1px solid var(--gold-border,rgba(201,168,76,0.25));border-radius:10px;padding:12px 14px;">
          <div style="font-size:11px;color:var(--text-secondary);">Custo este mês (total)</div>
          <div style="font-size:20px;font-weight:700;color:var(--gold,#C9A84C);">${fmt(totalMesBRL)}</div>
        </div>
        <div style="flex:1;min-width:140px;background:var(--bg-card,#1C1C20);border:1px solid var(--border-subtle,rgba(255,255,255,0.06));border-radius:10px;padding:12px 14px;">
          <div style="font-size:11px;color:var(--text-secondary);">Custo acumulado (tudo)</div>
          <div style="font-size:20px;font-weight:700;color:var(--text-primary);">${fmt(totalGeralBRL)}</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">
        Base: Haiku 4.5 (US$ ${USD_POR_MI_IN.toFixed(2)}/mi entrada, US$ ${USD_POR_MI_OUT.toFixed(2)}/mi saída) · câmbio R$ ${USD_BRL.toFixed(2)}.
        Com prompt caching ativo, o custo real de entrada é ainda menor.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="text-align:left;color:var(--text-secondary);border-bottom:1px solid var(--border,rgba(201,168,76,0.15));">
            <th style="padding:8px 6px;">Clínica</th>
            <th style="padding:8px 6px;text-align:right;">Msgs (mês)</th>
            <th style="padding:8px 6px;text-align:right;">Custo (mês)</th>
            <th style="padding:8px 6px;text-align:right;">Msgs (total)</th>
            <th style="padding:8px 6px;text-align:right;">Custo (total)</th>
          </tr>
        </thead>
        <tbody>
          ${ids.sort((a, b) => custoBRL(ag[b].tinMes, ag[b].toutMes) - custoBRL(ag[a].tinMes, ag[a].toutMes)).map(id => `
            <tr style="border-bottom:1px solid var(--border-subtle,rgba(255,255,255,0.05));">
              <td style="padding:8px 6px;color:var(--text-primary);">${nomes[id] || id.slice(0, 8)}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--text-secondary);">${ag[id].msgsMes}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--gold,#C9A84C);font-weight:600;">${fmt(custoBRL(ag[id].tinMes, ag[id].toutMes))}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--text-muted);">${ag[id].msgs}</td>
              <td style="padding:8px 6px;text-align:right;color:var(--text-secondary);">${fmt(custoBRL(ag[id].tin, ag[id].tout))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div style="font-size:11px;color:var(--text-muted);margin-top:14px;line-height:1.5;">
        💡 Custo médio por mensagem: <b style="color:var(--text-secondary);">${(() => {
          const tm = ids.reduce((s, id) => s + ag[id].msgs, 0);
          const tc = ids.reduce((s, id) => s + custoBRL(ag[id].tin, ag[id].tout), 0);
          return tm ? fmt(tc / tm) : 'R$ 0,00';
        })()}</b>. Para lucrar, venda a mensagem por pelo menos o dobro disso.
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

  console.log('✅ brian-dashboard-fix.js carregado — dashboard de custo do Brian (admin)');
})();
