// ============================================================
// CLINICALEAD — PAINEL DE ATIVAÇÃO DE PLANOS (ADMIN)
// Ativa/configura o plano de uma clínica num clique:
// - escolhe o plano (Básico/Premium/Platinum) → preenche mensagens automático
// - campo de valor com DESCONTO (cobra o que combinar)
// - WhatsApp adicional (+R$39,90 cada)
// - define o dia de renovação
// - grava tudo na brian_saldo (incluso_mes, dia_renovacao, ativado_em)
// Carregar como script novo no index.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function ehAdminMaster() {
    const r = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return r === 'admin' || r === 'administrador';
  }

  // catálogo de planos CRM completo (msgs + preço cheio de referência)
const PLANOS = {
    basico:   { nome: 'Básico',   msgs: 1500, preco: 189.90 },
    premium:  { nome: 'Premium',  msgs: 2500, preco: 254.90 },
    platinum: { nome: 'Platinum', msgs: 4000, preco: 319.90 },
  };
  // catálogo Brian Solo (só a IA de atendimento, sem CRM completo)
  const PLANOS_SOLO = {
    basico:   { nome: 'Solo Básico',   msgs: 1000, preco: 119.90 },
    premium:  { nome: 'Solo Premium',  msgs: 2000, preco: 199.90 },
    platinum: { nome: 'Solo Platinum', msgs: 3000, preco: 249.90 },
  };
  const WHATSAPP_EXTRA = 39.90;

  window.abrirAtivacaoPlanos = async function () {
    if (!ehAdminMaster()) return;
    const database = getDb();
    let clinicas = [];
    try {
      const { data } = await database.from('clinicas').select('id, nome').order('nome');
      clinicas = data || [];
    } catch (e) {}

    let modal = document.getElementById('modalAtivacao');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalAtivacao';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';

    const opcoesClinica = clinicas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:16px;padding:26px;max-width:520px;width:100%;max-height:90vh;overflow:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <h2 style="margin:0;font-size:19px;">🎯 Ativar plano de cliente</h2>
          <button onclick="document.getElementById('modalAtivacao').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:24px;cursor:pointer;">×</button>
        </div>

        <label style="display:block;font-size:13px;color:var(--text-secondary,#8A8570);margin-bottom:6px;">Clínica</label>
        <select id="atvClinica" class="form-select" style="width:100%;margin-bottom:16px;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);">
          <option value="">Selecione a clínica…</option>${opcoesClinica}
        </select>

        <label style="display:block;font-size:13px;color:var(--text-secondary,#8A8570);margin-bottom:6px;">Tipo de produto</label>
        <select id="atvTipoProduto" class="form-select" style="width:100%;margin-bottom:16px;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);">
          <option value="crm_completo">CRM completo</option>
          <option value="brian_solo">🤖 Brian Solo (só a IA de atendimento)</option>
        </select>

        <label style="display:block;font-size:13px;color:var(--text-secondary,#8A8570);margin-bottom:6px;">Plano</label>
        <select id="atvPlano" class="form-select" style="width:100%;margin-bottom:16px;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);">
       <option value="premium" selected>Carregando…</option>
        </select>

        <div style="display:flex;gap:12px;margin-bottom:16px;">
          <div style="flex:1;">
            <label style="display:block;font-size:13px;color:var(--text-secondary,#8A8570);margin-bottom:6px;">WhatsApp adicional</label>
            <input type="number" id="atvWhats" min="0" value="0" style="width:100%;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);">
          </div>
          <div style="flex:1;">
            <label style="display:block;font-size:13px;color:var(--text-secondary,#8A8570);margin-bottom:6px;">Dia de renovação</label>
            <input type="number" id="atvDia" min="1" max="31" value="${new Date().getDate()}" style="width:100%;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);">
          </div>
        </div>

        <label style="display:block;font-size:13px;color:var(--text-secondary,#8A8570);margin-bottom:6px;">Valor cobrado (R$) — edite pra dar desconto</label>
        <input type="number" id="atvValor" step="0.01" style="width:100%;margin-bottom:6px;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold,#C9A84C);color:var(--gold,#C9A84C);font-size:18px;font-weight:700;">
        <div id="atvResumo" style="font-size:12px;color:var(--text-muted,#888);margin-bottom:18px;"></div>

        <button onclick="executarAtivacao()" style="width:100%;padding:12px;border-radius:10px;border:none;background:var(--gold,#C9A84C);color:#0A0A0B;font-weight:700;font-size:15px;cursor:pointer;">✓ Ativar plano</button>
        <p style="font-size:11px;color:var(--text-muted,#888);margin-top:12px;text-align:center;">Isso configura o saldo e o ciclo de renovação da clínica. O pagamento é combinado por fora (Pix, etc.).</p>
      </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    // recalcula o valor sugerido quando muda plano, tipo de produto ou WhatsApp
    const catalogoAtivo = () => document.getElementById('atvTipoProduto').value === 'brian_solo' ? PLANOS_SOLO : PLANOS;
    const atualizarOpcoesPlano = () => {
      const cat = catalogoAtivo();
      const sel = document.getElementById('atvPlano');
      const atual = sel.value || 'premium';
      sel.innerHTML = Object.entries(cat).map(([id, p]) =>
        `<option value="${id}" ${id === atual ? 'selected' : ''}>${p.nome} — ${p.msgs.toLocaleString('pt-BR')} msgs — R$ ${p.preco.toFixed(2).replace('.', ',')}</option>`
      ).join('');
    };
    const recalc = () => {
      const cat = catalogoAtivo();
      const plano = cat[document.getElementById('atvPlano').value];
      const whats = parseInt(document.getElementById('atvWhats').value) || 0;
      const sugerido = plano.preco + whats * WHATSAPP_EXTRA;
      const campoValor = document.getElementById('atvValor');
      campoValor.value = sugerido.toFixed(2);
      const resumo = document.getElementById('atvResumo');
      resumo.innerHTML = `Preço cheio: R$ ${plano.preco.toFixed(2).replace('.', ',')}${whats > 0 ? ` + ${whats} WhatsApp (R$ ${(whats*WHATSAPP_EXTRA).toFixed(2).replace('.', ',')})` : ''} = <b>R$ ${sugerido.toFixed(2).replace('.', ',')}</b>. Edite o valor acima se for dar desconto.`;
    };
   document.getElementById('atvTipoProduto').onchange = () => { atualizarOpcoesPlano(); recalc(); };
    atualizarOpcoesPlano(); // preenche o dropdown com os planos certos ao ABRIR o modal
    document.getElementById('atvPlano').onchange = recalc;
    document.getElementById('atvWhats').oninput = recalc;
    recalc();
  };

  window.executarAtivacao = async function () {
    if (!ehAdminMaster()) return;
    const database = getDb();
    const clinicId = document.getElementById('atvClinica').value;
    const tipoProduto = document.getElementById('atvTipoProduto').value;
    const planoId = document.getElementById('atvPlano').value;
    const whats = parseInt(document.getElementById('atvWhats').value) || 0;
    const dia = parseInt(document.getElementById('atvDia').value) || new Date().getDate();
    const valor = parseFloat(document.getElementById('atvValor').value) || 0;
    const plano = (tipoProduto === 'brian_solo' ? PLANOS_SOLO : PLANOS)[planoId];

    if (!clinicId) { if (typeof toast === 'function') toast('Selecione a clínica', 'error'); return; }
    if (dia < 1 || dia > 31) { if (typeof toast === 'function') toast('Dia de renovação inválido', 'error'); return; }

    const resumoConfirm = `Ativar ${plano.nome} (${plano.msgs.toLocaleString('pt-BR')} msgs) para esta clínica?\n\n`
      + `Tipo: ${tipoProduto === 'brian_solo' ? 'Brian Solo (só IA)' : 'CRM completo'}\n`
      + `WhatsApp adicional: ${whats}\n`
      + `Valor cobrado: R$ ${valor.toFixed(2).replace('.', ',')}\n`
      + `Renova todo dia ${dia}`;
    if (!confirm(resumoConfirm)) return;

    try {
      // grava o tipo de produto na clínica (controla o que aparece no menu dela)
      await database.from('clinicas').update({ tipo_produto: tipoProduto }).eq('id', clinicId);

      // verifica se já existe saldo pra essa clínica
      const { data: existente } = await database.from('brian_saldo')
        .select('clinic_id, usado_mes, extra_comprado, extra_usado')
        .eq('clinic_id', clinicId).maybeSingle();

      const hoje = new Date().toISOString();
      const hojeISOData = hoje.split('T')[0];
      const dados = {
        clinic_id: clinicId,
        incluso_mes: plano.msgs,
        dia_renovacao: dia,
        ativado_em: hoje,
        // plano + add-ons registrados pra referência
        plano_nome: plano.nome,
        whatsapp_extra: whats,
        valor_cobrado: valor,
      };

      if (existente) {
        // mantém o que já foi usado e os extras comprados (não zera avulsos)
        // NÃO mexe em ultima_renovacao aqui — clínica já existente já tem
        // seu ciclo rodando, trocar de plano não deve resetar isso.
        await database.from('brian_saldo').update(dados).eq('clinic_id', clinicId);
      } else {
        // ⚠️ AJUSTE 14/07: clínica NOVA — antes NÃO gravava ultima_renovacao
        // aqui, ficava em branco até o sistema "adivinhar" a primeira
        // renovação (esperando cair exatamente no dia certo do mês). Isso
        // causou um desalinhamento real numa clínica (o ciclo dela
        // "escorregou" do dia 27 pro dia 9). Agora já grava a data de
        // ativação como o início do primeiro ciclo — sem essa lacuna.
        await database.from('brian_saldo').insert({ ...dados, usado_mes: 0, extra_comprado: 0, extra_usado: 0, ultima_renovacao: hojeISOData });
      }

      if (typeof toast === 'function') toast(`Plano ${plano.nome} ativado! ✓`, 'success');
      const modal = document.getElementById('modalAtivacao');
      if (modal) modal.remove();
    } catch (e) {
      console.error('[ativacao]', e);
      // se falhar por coluna inexistente (plano_nome etc), tenta sem os campos extras
      try {
        const fallback = { clinic_id: clinicId, incluso_mes: plano.msgs, dia_renovacao: dia, ativado_em: new Date().toISOString() };
        const { data: ex } = await database.from('brian_saldo').select('clinic_id').eq('clinic_id', clinicId).maybeSingle();
        if (ex) await database.from('brian_saldo').update(fallback).eq('clinic_id', clinicId);
        else await database.from('brian_saldo').insert({ ...fallback, usado_mes: 0, extra_comprado: 0, extra_usado: 0, ultima_renovacao: new Date().toISOString().split('T')[0] });
        if (typeof toast === 'function') toast(`Plano ${plano.nome} ativado! ✓`, 'success');
        const modal = document.getElementById('modalAtivacao');
        if (modal) modal.remove();
      } catch (e2) {
        console.error('[ativacao] fallback', e2);
        if (typeof toast === 'function') toast('Erro ao ativar plano', 'error');
      }
    }
  };

  // injeta o botão no menu (só admin)
  function injetarBotao() {
    if (!ehAdminMaster()) return;
    if (document.getElementById('navAtivacao')) return;
    const ref = document.querySelector('.nav-item[data-page="clinicas"]')
             || document.querySelector('.nav-item[data-page="cobrancas"]');
    if (!ref) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navAtivacao';
    btn.innerHTML = '<i class="ti ti-rosette-discount-check"></i> Ativar plano';
    btn.onclick = () => abrirAtivacaoPlanos();
    ref.parentNode.insertBefore(btn, ref.nextSibling);
  }

  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    injetarBotao();
    setInterval(injetarBotao, 1500);
    console.log('✅ ativacao-planos-fix.js carregado');
    return true;
  }
  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }
})();
