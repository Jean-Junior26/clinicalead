// ============================================================
// CLINICALEAD — Modo SOMBRA: painel pra comparar Claude vs GPT-4.1 mini
// Mostra, lado a lado, a resposta real (Claude) e a resposta de teste
// (GPT) pra cada mensagem, com o custo de cada uma. Só admin.
// ============================================================

(function () {
  'use strict';

  function ehAdmin() {
    const r = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return r === 'admin' || r === 'administrador';
  }

  window.abrirComparacaoSombra = async function () {
    if (!ehAdmin()) return;
    if (!document.getElementById('modalSombra')) {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.id = 'modalSombra';
      ov.innerHTML = `
        <div class="modal" style="max-width:820px;width:96vw;">
          <div class="modal-header">
            <h3><i class="ti ti-scale" style="margin-right:8px;color:var(--gold);"></i>Claude vs GPT-4.1 mini (teste sombra)</h3>
            <button class="btn btn-ghost btn-icon" onclick="closeModal('modalSombra')"><i class="ti ti-x"></i></button>
          </div>
          <div class="modal-body" id="sombraBody" style="max-height:74vh;overflow-y:auto;"></div>
        </div>`;
      document.body.appendChild(ov);
    }
    openModal('modalSombra');
    document.getElementById('sombraBody').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Carregando comparações…</div>';
    await renderSombra();
  };

  async function renderSombra() {
    const body = document.getElementById('sombraBody');
    if (!body) return;

    let linhas = [];
    try {
      const { data } = await db.from('brian_teste_sombra')
        .select('*').order('created_at', { ascending: false }).limit(30);
      linhas = data || [];
    } catch (e) { body.innerHTML = '<div style="padding:20px;color:var(--coral);">Erro ao carregar.</div>'; return; }

    if (!linhas.length) {
      body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Nenhuma comparação registrada ainda. Assim que o Brian atender uma mensagem real na clínica testada, aparece aqui.</div>';
      return;
    }

    const custoTotalClaude = linhas.reduce((s, l) => s + (l.custo_usd_claude || 0), 0) * 5.40;
    const custoTotalGPT = linhas.reduce((s, l) => s + (l.custo_usd_openai || 0), 0) * 5.40;

    body.innerHTML = `
      <div style="display:flex;gap:10px;margin-bottom:16px;">
        <div style="flex:1;background:var(--bg-card,#1C1C20);border-radius:10px;padding:10px 14px;">
          <div style="font-size:11px;color:var(--text-secondary);">Custo Claude (${linhas.length} msgs)</div>
          <div style="font-size:16px;font-weight:700;">R$ ${custoTotalClaude.toFixed(3).replace('.', ',')}</div>
        </div>
        <div style="flex:1;background:var(--bg-card,#1C1C20);border-radius:10px;padding:10px 14px;">
          <div style="font-size:11px;color:var(--text-secondary);">Custo GPT (${linhas.length} msgs)</div>
          <div style="font-size:16px;font-weight:700;color:var(--gold,#C9A84C);">R$ ${custoTotalGPT.toFixed(3).replace('.', ',')}</div>
        </div>
      </div>
      ${linhas.map(l => `
        <div style="background:var(--bg-card,#1C1C20);border-radius:10px;padding:12px 14px;margin-bottom:10px;border:1px solid var(--border-subtle,rgba(255,255,255,0.06));">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">${new Date(l.created_at).toLocaleString('pt-BR')} · paciente disse: "${(l.mensagem_paciente || '—').slice(0, 80)}"</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <div style="flex:1;min-width:220px;padding:8px 10px;background:var(--bg-base,#0A0A0B);border-radius:8px;border-left:3px solid #5B8DB8;">
              <div style="font-size:10px;color:#5B8DB8;font-weight:700;text-transform:uppercase;margin-bottom:4px;">Claude (real, enviado)</div>
              <div style="font-size:13px;">${(l.resposta_claude || '—')}</div>
            </div>
            <div style="flex:1;min-width:220px;padding:8px 10px;background:var(--bg-base,#0A0A0B);border-radius:8px;border-left:3px solid var(--gold,#C9A84C);">
              <div style="font-size:10px;color:var(--gold,#C9A84C);font-weight:700;text-transform:uppercase;margin-bottom:4px;">GPT-4.1 mini (teste, não enviado)</div>
              <div style="font-size:13px;">${(l.resposta_openai || '—')}</div>
            </div>
          </div>
        </div>`).join('')}`;
  }

  // injeta botão no painel de liberações do Brian (admin)
  function injetarBotao() {
    if (!ehAdmin()) return;
    const header = document.querySelector('#modalBrianAdmin .modal-header');
    if (!header || document.getElementById('btnSombra')) return;
    const x = header.querySelector('button');
    const b = document.createElement('button');
    b.id = 'btnSombra';
    b.className = 'btn btn-sm';
    b.style.cssText = 'margin-left:8px;margin-right:8px;border:1px solid #5B8DB8;color:#5B8DB8;';
    b.innerHTML = '<i class="ti ti-scale"></i> Claude vs GPT';
    b.onclick = abrirComparacaoSombra;
    if (x) header.insertBefore(b, x); else header.appendChild(b);
  }
  setInterval(injetarBotao, 1000);

  console.log('✅ brian-sombra-fix.js carregado — comparação Claude vs GPT');
})();
