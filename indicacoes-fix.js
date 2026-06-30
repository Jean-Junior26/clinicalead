// ============================================================
// CLINICALEAD — MÁQUINA DE INDICAÇÃO (painel da clínica)
// Configura recompensa (sugestões prontas + editável) e mostra
// o ranking de quem mais indica + indicações recebidas.
// Carregar como script novo no index.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }

  // sugestões prontas de recompensa (a clínica pode usar ou criar a sua)
  const SUGESTOES_INDICA = [
    'Clareamento grátis',
    'Limpeza + profilaxia grátis',
    'R$ 100 de desconto no tratamento',
    '1 mês de manutenção do aparelho grátis',
  ];
  const SUGESTOES_VEM = [
    '10% de desconto na primeira avaliação',
    'Avaliação + raio-x grátis',
    'R$ 50 de desconto no tratamento',
    'Limpeza grátis na primeira consulta',
  ];

  window.abrirIndicacoes = async function () {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic) return;

    // carrega config + indicações
    let config = {}, indicacoes = [];
    try {
      const { data: c } = await database.from('indicacao_config').select('*').eq('clinic_id', clinic.id).maybeSingle();
      config = c || {};
      const { data: i } = await database.from('indicacoes').select('*').eq('clinic_id', clinic.id).order('criado_em', { ascending: false });
      indicacoes = i || [];
    } catch (e) { console.error('[indicacoes]', e); }

    // ranking de quem mais indica
    const ranking = {};
    indicacoes.forEach(ind => {
      const k = ind.indicador_nome || ind.indicador_telefone || 'Anônimo';
      ranking[k] = (ranking[k] || 0) + 1;
    });
    const rankingArr = Object.entries(ranking).sort((a, b) => b[1] - a[1]).slice(0, 10);

    let modal = document.getElementById('modalIndicacoes');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalIndicacoes';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

    const inp = 'width:100%;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);font-size:13px;margin-bottom:6px;';
    const lbl = 'display:block;font-size:13px;color:var(--text-secondary,#8A8570);margin-bottom:5px;margin-top:10px;';

    const chips = (arr, alvo) => arr.map(s =>
      `<button onclick="document.getElementById('${alvo}').value='${s.replace(/'/g, "")}'" style="background:var(--bg-card,#1C1C20);border:1px solid var(--gold-border,#333);color:var(--text-secondary,#8A8570);border-radius:20px;padding:4px 10px;font-size:11px;cursor:pointer;margin:2px;">${s}</button>`
    ).join('');

    const totalIndicacoes = indicacoes.length;
    const compareceram = indicacoes.filter(i => i.status === 'compareceu' || i.status === 'recompensado').length;

    const rankingHtml = rankingArr.length
      ? rankingArr.map(([nome, qtd], i) => `
        <div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--bg-base,#0A0A0B);border-radius:8px;margin-bottom:6px;">
          <span style="font-size:13px;color:var(--text-primary,#F0EAD6);">${i === 0 ? '🏆' : (i + 1) + '.'} ${nome}</span>
          <span style="font-size:13px;color:var(--gold,#C9A84C);font-weight:600;">${qtd} indicaç${qtd > 1 ? 'ões' : 'ão'}</span>
        </div>`).join('')
      : '<p style="font-size:12px;color:var(--text-muted,#888);text-align:center;padding:12px;">Ainda nenhuma indicação. Quando o Brian começar a pedir, aparecem aqui.</p>';

    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:14px;max-width:540px;width:100%;max-height:90vh;overflow-y:auto;">
        <div style="padding:20px 24px;border-bottom:1px solid var(--gold-border,#333);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:17px;font-weight:600;color:var(--gold,#C9A84C);">🤝 Máquina de Indicação</div>
          <button onclick="document.getElementById('modalIndicacoes').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:22px;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:16px 24px;">

          <div style="display:flex;gap:10px;margin-bottom:16px;">
            <div style="flex:1;background:var(--bg-card,#1C1C20);border-radius:10px;padding:12px;text-align:center;">
              <div style="font-size:22px;font-weight:700;color:var(--gold,#C9A84C);">${totalIndicacoes}</div>
              <div style="font-size:11px;color:var(--text-muted,#888);">Indicações</div>
            </div>
            <div style="flex:1;background:var(--bg-card,#1C1C20);border-radius:10px;padding:12px;text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#6FBF8E;">${compareceram}</div>
              <div style="font-size:11px;color:var(--text-muted,#888);">Compareceram</div>
            </div>
          </div>

          <div style="font-weight:600;font-size:14px;color:var(--text-primary,#F0EAD6);margin-bottom:4px;">🎁 Recompensas</div>
          <p style="font-size:11px;color:var(--text-muted,#888);margin:0 0 10px;">Clique numa sugestão ou escreva a sua.</p>

          <label style="${lbl}">Quem INDICA ganha:</label>
          <input type="text" id="recIndica" value="${(config.recompensa_quem_indica || '').replace(/"/g, '&quot;')}" placeholder="Ex: Clareamento grátis" style="${inp}">
          <div style="margin-bottom:8px;">${chips(SUGESTOES_INDICA, 'recIndica')}</div>

          <label style="${lbl}">Quem VEM indicado ganha:</label>
          <input type="text" id="recVem" value="${(config.recompensa_quem_vem || '').replace(/"/g, '&quot;')}" placeholder="Ex: 10% na primeira avaliação" style="${inp}">
          <div style="margin-bottom:8px;">${chips(SUGESTOES_VEM, 'recVem')}</div>

          <label style="${lbl}">Como o Brian pede a indicação (opcional):</label>
          <textarea id="recMsg" placeholder="Deixe vazio pra usar o padrão do Brian" style="${inp}min-height:60px;resize:vertical;">${config.mensagem_brian || ''}</textarea>

          <button onclick="salvarIndicacaoConfig()" style="width:100%;padding:11px;border-radius:9px;border:none;background:var(--gold,#C9A84C);color:#0A0A0B;font-weight:700;cursor:pointer;margin:10px 0 18px;">Salvar recompensas</button>

          <div style="font-weight:600;font-size:14px;color:var(--text-primary,#F0EAD6);margin-bottom:8px;">🏆 Quem mais indica</div>
          ${rankingHtml}
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  };

  window.salvarIndicacaoConfig = async function () {
    const database = getDb(); const clinic = clinicAtual();
    const dados = {
      clinic_id: clinic.id,
      ativo: true,
      recompensa_quem_indica: document.getElementById('recIndica').value.trim() || null,
      recompensa_quem_vem: document.getElementById('recVem').value.trim() || null,
      mensagem_brian: document.getElementById('recMsg').value.trim() || null,
      atualizado_em: new Date().toISOString(),
    };
    try {
      // upsert (cria ou atualiza)
      const { data: existe } = await database.from('indicacao_config').select('clinic_id').eq('clinic_id', clinic.id).maybeSingle();
      if (existe) await database.from('indicacao_config').update(dados).eq('clinic_id', clinic.id);
      else await database.from('indicacao_config').insert(dados);
      if (typeof toast === 'function') toast('Recompensas salvas! 🎁', 'success');
    } catch (e) { console.error('[salvar-indicacao]', e); if (typeof toast === 'function') toast('Erro ao salvar', 'error'); }
  };

  // botão no menu
  function injetarBotao() {
    if (document.getElementById('navIndicacoes')) return;
    const ref = document.querySelector('.nav-item[data-page="pistas"]')
             || document.querySelector('.nav-item[data-page="leads"]')
             || document.querySelector('.nav-item[data-page="brian"]');
    if (!ref) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navIndicacoes';
    btn.innerHTML = '<i class="ti ti-users-group"></i> Indicações';
    btn.onclick = () => abrirIndicacoes();
    ref.parentNode.insertBefore(btn, ref.nextSibling);
  }
  setInterval(injetarBotao, 1500);

  console.log('✅ indicacoes-fix.js carregado');
})();
