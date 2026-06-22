// ============================================================
// CLINICALEAD — MENSALIDADES (cobrança recorrente do paciente) — Fase 1
// Aba "Mensalidades" na ficha do paciente (#modalEditLead).
//   - Cria/edita plano, gera parcelas, pagamento parcial
//   - RENEGOCIAÇÃO: seleciona parcelas em aberto e gera um acordo novo
//   - "Atrasado" calculado na hora (em aberto + vencimento já passou)
// ============================================================

(function () {
  'use strict';

  const MENS = { leadId: null, plano: null, parcelas: [], marcando: null };
  const FORMA = { pix: 'Pix', cartao_credito: 'Crédito', cartao_debito: 'Débito', dinheiro: 'Dinheiro', boleto: 'Boleto', transferencia: 'Transferência' };

  const fmt = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const hojeISO = () => new Date().toISOString().slice(0, 10);
  const esc = (s) => String(s || '').replace(/"/g, '&quot;');
  const restante = (p) => Math.max(0, Number(p.valor || 0) - Number(p.valor_pago || 0));
  const aberta = (p) => !['pago', 'cancelado', 'renegociado'].includes(p.status);

  function brData(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T12:00');
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  }
  function venc(ano, mes, dia) {
    const ult = new Date(ano, mes + 1, 0).getDate();
    return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(dia, ult)).padStart(2, '0')}`;
  }
  function comp(ano, mes) { return `${ano}-${String(mes + 1).padStart(2, '0')}-01`; }

  function statusVis(p) {
    if (p.status === 'pago') return { label: 'Pago', cor: '#7FB069' };
    if (p.status === 'cancelado') return { label: 'Cancelado', cor: '#8A8570' };
    if (p.status === 'renegociado') return { label: 'Renegociada', cor: '#8A8570' };
    const atrasada = p.vencimento < hojeISO();
    if (Number(p.valor_pago || 0) > 0) return { label: atrasada ? 'Parcial · atrasada' : 'Parcial', cor: '#C9A84C' };
    if (atrasada) return { label: 'Atrasada', cor: '#C0624A' };
    return { label: 'Pendente', cor: '#5B8DB8' };
  }

  function gerarParcelas(plano, anoIni, mesIni, numIni, qtd) {
    const out = [];
    for (let i = 0; i < qtd; i++) {
      const tot = mesIni + i;
      const a = anoIni + Math.floor(tot / 12);
      const m = ((tot % 12) + 12) % 12;
      out.push({
        mensalidade_id: plano.id, clinic_id: plano.clinic_id, lead_id: plano.lead_id,
        numero: numIni + i, competencia: comp(a, m), vencimento: venc(a, m, plano.dia_vencimento),
        valor: plano.valor, status: 'pendente',
      });
    }
    return out;
  }

  // ── carga ────────────────────────────────────────────────
  window.mensCarregar = async function () {
    const box = document.getElementById('fichaTabMensalidades');
    if (!box) return;
    box.innerHTML = '<div class="ficha-vazio">Carregando...</div>';
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic || !MENS.leadId) { box.innerHTML = '<div class="ficha-vazio">—</div>'; return; }
    try {
      const { data: planos } = await db.from('mensalidades')
        .select('*').eq('lead_id', MENS.leadId).eq('ativo', true)
        .order('created_at', { ascending: false }).limit(1);
      MENS.plano = (planos && planos[0]) || null;
      if (!MENS.plano) { renderCriar(); return; }
      const { data: parcelas } = await db.from('mensalidade_parcelas')
        .select('*').eq('mensalidade_id', MENS.plano.id).order('numero');
      MENS.parcelas = parcelas || [];
      renderPlano();
    } catch (e) {
      box.innerHTML = '<div style="padding:20px;color:var(--coral);font-size:13px;">Erro: ' + (e.message || '') + '</div>';
    }
  };

  // ── tela: criar plano ────────────────────────────────────
  function renderCriar() {
    const box = document.getElementById('fichaTabMensalidades');
    if (!box) return;
    box.innerHTML = `
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
        Nenhuma mensalidade ativa. Crie o plano recorrente do paciente (ex.: ortodontia).
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label class="form-label" style="font-size:12px;">Descrição</label>
          <input class="form-input" id="mensDesc" placeholder="Ex: Manutenção ortodôntica"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div><label class="form-label" style="font-size:12px;">Valor mensal (R$)</label>
            <input class="form-input" id="mensValor" type="number" step="0.01" placeholder="0,00"/></div>
          <div><label class="form-label" style="font-size:12px;">Dia de vencimento</label>
            <input class="form-input" id="mensDia" type="number" min="1" max="31" value="10"/></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div><label class="form-label" style="font-size:12px;">Início</label>
            <input class="form-input" id="mensInicio" type="date" value="${hojeISO()}"/></div>
          <div><label class="form-label" style="font-size:12px;">Duração</label>
            <select class="form-input" id="mensTipo" onchange="mensToggleParcelas()">
              <option value="fixo">Número de parcelas</option>
              <option value="semfim">Sem fim (contínuo)</option>
            </select></div>
        </div>
        <div id="mensQtdWrap"><label class="form-label" style="font-size:12px;">Quantas parcelas</label>
          <input class="form-input" id="mensQtd" type="number" min="1" value="12"/></div>
        <button class="btn btn-primary" onclick="mensCriarPlano()" style="margin-top:6px;"><i class="ti ti-plus"></i> Criar plano</button>
        <div id="mensMsg" style="font-size:12px;color:var(--coral);min-height:14px;"></div>
      </div>`;
  }

  window.mensToggleParcelas = function () {
    const tipo = document.getElementById('mensTipo')?.value;
    const wrap = document.getElementById('mensQtdWrap');
    if (wrap) wrap.style.display = (tipo === 'semfim') ? 'none' : 'block';
  };

  window.mensCriarPlano = async function () {
    const msg = document.getElementById('mensMsg'); const set = (t) => { if (msg) msg.textContent = t || ''; };
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic || !MENS.leadId) return;
    const desc = (document.getElementById('mensDesc')?.value || '').trim();
    const valor = parseFloat(document.getElementById('mensValor')?.value) || 0;
    const dia = parseInt(document.getElementById('mensDia')?.value) || 10;
    const inicio = document.getElementById('mensInicio')?.value;
    const tipo = document.getElementById('mensTipo')?.value;
    const qtd = (tipo === 'semfim') ? 12 : (parseInt(document.getElementById('mensQtd')?.value) || 12);
    const total = (tipo === 'semfim') ? null : qtd;
    if (valor <= 0) { set('Informe o valor da parcela.'); return; }
    if (!inicio) { set('Informe a data de início.'); return; }
    if (dia < 1 || dia > 31) { set('Dia de vencimento inválido.'); return; }
    set('Criando…');
    try {
      const { data: plano, error } = await db.from('mensalidades').insert({
        clinic_id: clinic.id, lead_id: MENS.leadId, descricao: desc || null,
        valor, dia_vencimento: dia, data_inicio: inicio, total_parcelas: total, ativo: true,
      }).select().single();
      if (error) throw error;
      const ini = new Date(inicio + 'T12:00');
      const parc = gerarParcelas(plano, ini.getFullYear(), ini.getMonth(), 1, qtd);
      const { error: e2 } = await db.from('mensalidade_parcelas').insert(parc);
      if (e2) throw e2;
      if (typeof toast === 'function') toast('Mensalidade criada! 💰');
      window.mensCarregar();
    } catch (e) { set('Erro: ' + (e.message || '')); console.error('[mensalidade criar]', e); }
  };

  // ── tela: plano + parcelas ───────────────────────────────
  function renderPlano() {
    const box = document.getElementById('fichaTabMensalidades');
    if (!box) return;
    const p = MENS.plano, parc = MENS.parcelas, hoje = hojeISO();
    let pago = 0, aberto = 0, atrasado = 0;
    parc.forEach(x => {
      pago += Number(x.valor_pago || 0);
      if (!aberta(x)) return;
      const rest = restante(x);
      aberto += rest;
      if (x.vencimento < hoje) atrasado += rest;
    });
    const temAberta = parc.some(aberta);

    // ordem: acordo em aberto no TOPO, demais em aberto depois (por vencimento),
    // e o histórico (pago/renegociada/cancelada) por último
    const grupo = (p) => {
      if (!aberta(p)) return 2;
      if (p.renegociacao_id && p.status !== 'renegociado') return 0; // parcela de acordo: topo
      return 1;
    };
    const ordenadas = [...parc].sort((a, b) => {
      const ga = grupo(a), gb = grupo(b);
      if (ga !== gb) return ga - gb;
      return String(a.vencimento).localeCompare(String(b.vencimento));
    });

    const linhas = ordenadas.map(x => {
      const sv = statusVis(x);
      const rest = restante(x);
      const vp = Number(x.valor_pago || 0);
      const acordo = x.renegociacao_id && x.status !== 'renegociado';
      let acao = '';
      if (MENS.marcando === x.id && aberta(x)) {
        acao = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px;">
          <input class="form-input" id="mfValor_${x.id}" type="number" step="0.01" value="${rest}" title="Valor a pagar" style="font-size:12px;padding:4px 6px;width:96px;"/>
          <select class="form-input" id="mfForma_${x.id}" style="font-size:12px;padding:4px 6px;width:auto;">
            ${Object.entries(FORMA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
          <input class="form-input" id="mfData_${x.id}" type="date" value="${hoje}" style="font-size:12px;padding:4px 6px;width:auto;"/>
          <button class="btn btn-sm btn-primary" onclick="mensConfirmarPagamento('${x.id}')">Confirmar</button>
          <button class="btn btn-sm btn-ghost" onclick="mensCancelarMarcacao()">Cancelar</button>
        </div>`;
      } else if (aberta(x)) {
        acao = `<button class="btn btn-sm" style="border:1px solid var(--gold,#C9A84C);color:var(--gold,#C9A84C);" onclick="mensMarcarPaga('${x.id}')"><i class="ti ti-check"></i> ${vp > 0 ? 'Pagar restante' : 'Marcar paga'}</button>`;
      } else if (x.status === 'pago') {
        acao = `<button class="btn btn-sm btn-ghost" onclick="mensDesmarcar('${x.id}')" title="Desfazer"><i class="ti ti-arrow-back-up"></i> Desmarcar</button>`;
      }
      const detPago = vp > 0 ? `<span style="color:var(--text-muted);"> · pago ${fmt(vp)}${rest > 0 ? ` · falta ${fmt(rest)}` : ''}</span>` : '';
      const tagAcordo = acordo ? `<span style="font-size:10px;color:var(--gold);border:1px solid var(--gold,#C9A84C);border-radius:6px;padding:0 5px;margin-left:6px;">acordo</span>` : '';
      return `<div class="ficha-linha">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div><strong>#${x.numero}</strong>${tagAcordo} · venc. ${brData(x.vencimento)} · <strong style="font-family:var(--mono);">${fmt(x.valor)}</strong>${detPago}</div>
          <span class="badge" style="background:${sv.cor}22;color:${sv.cor};border:1px solid ${sv.cor}44;">${sv.label}</span>
        </div>
        ${acao}
      </div>`;
    }).join('');

    box.innerHTML = `
      <div style="background:var(--bg-elevated);border-radius:10px;padding:14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:600;font-size:15px;">${p.descricao || 'Mensalidade'}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${fmt(p.valor)}/mês · vence dia ${p.dia_vencimento}${p.total_parcelas ? ` · ${p.total_parcelas} parcelas` : ' · contínuo'}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-ghost btn-icon" onclick="mensEditarPlano()" title="Editar"><i class="ti ti-pencil"></i></button>
            <button class="btn btn-sm btn-ghost btn-icon" onclick="mensEncerrar()" title="Encerrar plano"><i class="ti ti-x" style="color:var(--coral);"></i></button>
          </div>
        </div>
        <div style="display:flex;gap:18px;margin-top:12px;flex-wrap:wrap;font-size:12px;">
          <div>Pago: <strong style="color:#7FB069;font-family:var(--mono);">${fmt(pago)}</strong></div>
          <div>Em aberto: <strong style="color:#5B8DB8;font-family:var(--mono);">${fmt(aberto)}</strong></div>
          <div>Atrasado: <strong style="color:#C0624A;font-family:var(--mono);">${fmt(atrasado)}</strong></div>
        </div>
        ${temAberta ? `<button class="btn btn-sm" style="margin-top:12px;border:1px solid var(--gold,#C9A84C);color:var(--gold,#C9A84C);" onclick="mensRenegociar()"><i class="ti ti-refresh"></i> Renegociar parcelas em aberto</button>` : ''}
      </div>
      ${linhas || '<div class="ficha-vazio">Sem parcelas.</div>'}
      ${!p.total_parcelas ? `<button class="btn btn-sm btn-ghost" style="margin-top:10px;" onclick="mensGerarMais()"><i class="ti ti-plus"></i> Gerar mais 12 meses</button>` : ''}
      <div id="mensMsg" style="font-size:12px;color:var(--coral);min-height:14px;margin-top:8px;"></div>`;
  }

  window.mensMarcarPaga = function (id) { MENS.marcando = id; renderPlano(); };
  window.mensCancelarMarcacao = function () { MENS.marcando = null; renderPlano(); };

  window.mensConfirmarPagamento = async function (id) {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;
    const p = MENS.parcelas.find(x => x.id === id); if (!p) return;
    const rest = restante(p);
    const inp = parseFloat(document.getElementById('mfValor_' + id)?.value);
    let amount = isNaN(inp) ? rest : inp;
    if (amount <= 0) { const m = document.getElementById('mensMsg'); if (m) m.textContent = 'Valor inválido.'; return; }
    if (amount > rest) amount = rest;
    const forma = document.getElementById('mfForma_' + id)?.value || 'pix';
    const data = document.getElementById('mfData_' + id)?.value || hojeISO();
    try {
      const { data: pag, error } = await db.from('pagamentos').insert({
        clinic_id: clinic.id, lead_id: MENS.leadId, valor: amount, forma, data, parcela_id: id,
        observacao: `Mensalidade${MENS.plano?.descricao ? (' - ' + MENS.plano.descricao) : ''} (parcela ${p.numero})`,
      }).select().single();
      if (error) throw error;
      const novoPago = Number(p.valor_pago || 0) + amount;
      const quitado = novoPago >= Number(p.valor || 0) - 0.005;
      const { error: e2 } = await db.from('mensalidade_parcelas').update({
        valor_pago: novoPago, status: quitado ? 'pago' : 'parcial', pago_em: quitado ? data : null,
      }).eq('id', id);
      if (e2) throw e2;
      MENS.marcando = null;
      if (typeof toast === 'function') toast(quitado ? 'Parcela quitada! ✅' : 'Pagamento parcial registrado 💵');
      window.mensCarregar();
    } catch (e) {
      const m = document.getElementById('mensMsg'); if (m) m.textContent = 'Erro: ' + (e.message || '');
      console.error('[mensalidade pagamento]', e);
    }
  };

  window.mensDesmarcar = async function (id) {
    const p = MENS.parcelas.find(x => x.id === id); if (!p) return;
    if (!confirm('Desfazer os pagamentos desta parcela? Os lançamentos no financeiro serão removidos.')) return;
    try {
      await db.from('pagamentos').delete().eq('parcela_id', id);
      await db.from('mensalidade_parcelas').update({ status: 'pendente', valor_pago: 0, pago_em: null, pagamento_id: null }).eq('id', id);
      if (typeof toast === 'function') toast('Pagamentos desfeitos');
      window.mensCarregar();
    } catch (e) { console.error('[mensalidade desmarcar]', e); if (typeof toast === 'function') toast('Erro ao desfazer', 'error'); }
  };

  // ── RENEGOCIAÇÃO ─────────────────────────────────────────
  window.mensRenegociar = function () {
    const box = document.getElementById('fichaTabMensalidades');
    if (!box || !MENS.plano) return;
    const abertas = MENS.parcelas.filter(aberta);
    if (!abertas.length) { if (typeof toast === 'function') toast('Não há parcelas em aberto'); return; }
    const hoje = hojeISO();
    const h = new Date();
    const venc1 = venc(h.getFullYear(), h.getMonth() + 1, MENS.plano.dia_vencimento);

    box.innerHTML = `
      <button class="btn btn-sm btn-ghost" onclick="mensCarregar()"><i class="ti ti-arrow-left"></i> Voltar</button>
      <div style="font-size:13px;color:var(--text-secondary);margin:12px 0;">
        Selecione as parcelas que entram no acordo. Elas serão marcadas como <b>renegociadas</b> e um novo conjunto de parcelas será gerado pelo valor acordado.
      </div>
      <div style="border:1px solid var(--border-subtle,#2a2a2a);border-radius:10px;padding:10px;margin-bottom:14px;max-height:30vh;overflow-y:auto;">
        ${abertas.map(x => {
          const atrasada = x.vencimento < hoje;
          return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;cursor:pointer;">
            <input type="checkbox" class="reneg-chk" data-id="${x.id}" data-rest="${restante(x)}" ${atrasada ? 'checked' : ''} onchange="mensRenegCalc()"/>
            <span style="flex:1;">#${x.numero} · venc. ${brData(x.vencimento)} · <strong style="font-family:var(--mono);">${fmt(restante(x))}</strong>${atrasada ? ' <span style="color:#C0624A;">(atrasada)</span>' : ''}</span>
          </label>`;
        }).join('')}
      </div>
      <div style="font-size:13px;margin-bottom:12px;">Selecionado: <strong id="renegSel" style="font-family:var(--mono);">R$ 0,00</strong></div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div><label class="form-label" style="font-size:12px;">Valor total do acordo (R$)</label>
            <input class="form-input" id="renegValor" type="number" step="0.01"/></div>
          <div><label class="form-label" style="font-size:12px;">Em quantas parcelas</label>
            <input class="form-input" id="renegQtd" type="number" min="1" value="1"/></div>
        </div>
        <div><label class="form-label" style="font-size:12px;">1º vencimento</label>
          <input class="form-input" id="renegVenc" type="date" value="${venc1}"/></div>
        <div><label class="form-label" style="font-size:12px;">Observação (opcional)</label>
          <input class="form-input" id="renegObs" placeholder="Ex: acordo verbal, desconto de juros"/></div>
        <button class="btn btn-primary" onclick="mensConfirmarRenegociacao()"><i class="ti ti-check"></i> Gerar acordo</button>
        <div id="mensMsg" style="font-size:12px;color:var(--coral);min-height:14px;"></div>
      </div>`;
    mensRenegCalc();
  };

  window.mensRenegCalc = function () {
    let total = 0;
    document.querySelectorAll('.reneg-chk:checked').forEach(c => { total += Number(c.dataset.rest || 0); });
    const sel = document.getElementById('renegSel'); if (sel) sel.textContent = fmt(total);
    const v = document.getElementById('renegValor'); if (v && !v.dataset.touched) v.value = total.toFixed(2);
    const q = document.getElementById('renegQtd');
    const n = document.querySelectorAll('.reneg-chk:checked').length;
    if (q && !q.dataset.touched && n > 0) q.value = n;
  };

  window.mensConfirmarRenegociacao = async function () {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    const msg = document.getElementById('mensMsg'); const set = (t) => { if (msg) msg.textContent = t || ''; };
    if (!clinic || !MENS.plano) return;
    const sel = [...document.querySelectorAll('.reneg-chk:checked')].map(c => c.dataset.id);
    if (!sel.length) { set('Selecione ao menos uma parcela.'); return; }
    const valorOriginal = [...document.querySelectorAll('.reneg-chk:checked')].reduce((s, c) => s + Number(c.dataset.rest || 0), 0);
    const valorNovo = parseFloat(document.getElementById('renegValor')?.value) || 0;
    const qtd = parseInt(document.getElementById('renegQtd')?.value) || 1;
    const venc1 = document.getElementById('renegVenc')?.value;
    const obs = (document.getElementById('renegObs')?.value || '').trim();
    if (valorNovo <= 0) { set('Informe o valor do acordo.'); return; }
    if (qtd < 1) { set('Número de parcelas inválido.'); return; }
    if (!venc1) { set('Informe o 1º vencimento.'); return; }
    set('Gerando acordo…');
    try {
      let criadoPor = null;
      try { const { data: u } = await db.auth.getUser(); criadoPor = u?.user?.id || null; } catch (_) {}
      const { data: acordo, error } = await db.from('renegociacoes').insert({
        clinic_id: clinic.id, lead_id: MENS.leadId, mensalidade_id: MENS.plano.id,
        qtd_origem: sel.length, valor_original: valorOriginal, valor_novo: valorNovo,
        qtd_parcelas: qtd, observacao: obs || null, criado_por: criadoPor,
      }).select().single();
      if (error) throw error;

      // marca as parcelas escolhidas como renegociadas
      await db.from('mensalidade_parcelas')
        .update({ status: 'renegociado', renegociacao_id: acordo.id }).in('id', sel);

      // gera as novas parcelas do acordo
      const d = new Date(venc1 + 'T12:00');
      const dia = d.getDate();
      const maxNum = MENS.parcelas.reduce((a, b) => Math.max(a, b.numero || 0), 0);
      const base = Math.floor((valorNovo / qtd) * 100) / 100;
      let resto = valorNovo;
      const novas = [];
      for (let i = 0; i < qtd; i++) {
        const tot = d.getMonth() + i;
        const a = d.getFullYear() + Math.floor(tot / 12);
        const m = ((tot % 12) + 12) % 12;
        const valor = (i === qtd - 1) ? Math.round(resto * 100) / 100 : base;
        resto -= base;
        novas.push({
          mensalidade_id: MENS.plano.id, clinic_id: clinic.id, lead_id: MENS.leadId,
          numero: maxNum + 1 + i, competencia: comp(a, m), vencimento: venc(a, m, dia),
          valor, status: 'pendente', renegociacao_id: acordo.id,
        });
      }
      const { error: e3 } = await db.from('mensalidade_parcelas').insert(novas);
      if (e3) throw e3;

      if (typeof toast === 'function') toast('Acordo criado! 🤝');
      window.mensCarregar();
    } catch (e) { set('Erro: ' + (e.message || '')); console.error('[renegociacao]', e); }
  };

  // ── editar / encerrar / gerar mais ───────────────────────
  window.mensEditarPlano = function () {
    const box = document.getElementById('fichaTabMensalidades');
    if (!box || !MENS.plano) return;
    const p = MENS.plano;
    box.innerHTML = `
      <button class="btn btn-sm btn-ghost" onclick="mensCarregar()"><i class="ti ti-arrow-left"></i> Voltar</button>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">
        <div><label class="form-label" style="font-size:12px;">Descrição</label>
          <input class="form-input" id="meDesc" value="${esc(p.descricao)}"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div><label class="form-label" style="font-size:12px;">Valor mensal (R$)</label>
            <input class="form-input" id="meValor" type="number" step="0.01" value="${p.valor}"/></div>
          <div><label class="form-label" style="font-size:12px;">Dia de vencimento</label>
            <input class="form-input" id="meDia" type="number" min="1" max="31" value="${p.dia_vencimento}"/></div>
        </div>
        <label style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="meAplicar" checked/> Aplicar novo valor/vencimento às parcelas em aberto (não pagas)
        </label>
        <button class="btn btn-primary" onclick="mensSalvarEdicao()"><i class="ti ti-device-floppy"></i> Salvar</button>
        <div id="mensMsg" style="font-size:12px;color:var(--coral);min-height:14px;"></div>
      </div>`;
  };

  window.mensSalvarEdicao = async function () {
    const p = MENS.plano; if (!p) return;
    const msg = document.getElementById('mensMsg'); const set = (t) => { if (msg) msg.textContent = t || ''; };
    const desc = (document.getElementById('meDesc')?.value || '').trim();
    const valor = parseFloat(document.getElementById('meValor')?.value) || 0;
    const dia = parseInt(document.getElementById('meDia')?.value) || p.dia_vencimento;
    const aplicar = document.getElementById('meAplicar')?.checked;
    if (valor <= 0) { set('Valor inválido.'); return; }
    if (dia < 1 || dia > 31) { set('Dia inválido.'); return; }
    set('Salvando…');
    try {
      await db.from('mensalidades').update({ descricao: desc || null, valor, dia_vencimento: dia }).eq('id', p.id);
      if (aplicar) {
        const pend = MENS.parcelas.filter(x => x.status === 'pendente' && !x.renegociacao_id);
        for (const x of pend) {
          const c = new Date(x.competencia + 'T12:00');
          await db.from('mensalidade_parcelas').update({ valor, vencimento: venc(c.getFullYear(), c.getMonth(), dia) }).eq('id', x.id);
        }
      }
      if (typeof toast === 'function') toast('Plano atualizado ✓');
      window.mensCarregar();
    } catch (e) { set('Erro: ' + (e.message || '')); console.error('[mensalidade editar]', e); }
  };

  window.mensEncerrar = async function () {
    const p = MENS.plano; if (!p) return;
    if (!confirm('Encerrar o plano? As parcelas em aberto serão canceladas (as pagas permanecem).')) return;
    try {
      await db.from('mensalidades').update({ ativo: false }).eq('id', p.id);
      await db.from('mensalidade_parcelas').update({ status: 'cancelado' }).eq('mensalidade_id', p.id).in('status', ['pendente', 'parcial']);
      if (typeof toast === 'function') toast('Plano encerrado');
      window.mensCarregar();
    } catch (e) { console.error('[mensalidade encerrar]', e); if (typeof toast === 'function') toast('Erro', 'error'); }
  };

  window.mensGerarMais = async function () {
    const p = MENS.plano; if (!p || !MENS.parcelas.length) return;
    try {
      const ultimo = MENS.parcelas.reduce((a, b) => (b.numero > a.numero ? b : a), MENS.parcelas[0]);
      const c = new Date(ultimo.competencia + 'T12:00');
      const novos = gerarParcelas(p, c.getFullYear(), c.getMonth() + 1, ultimo.numero + 1, 12);
      const { error } = await db.from('mensalidade_parcelas').insert(novos);
      if (error) throw error;
      if (typeof toast === 'function') toast('Mais 12 meses gerados');
      window.mensCarregar();
    } catch (e) { console.error('[mensalidade gerar]', e); if (typeof toast === 'function') toast('Erro', 'error'); }
  };

  // ── injeta a aba na ficha + troca de abas ────────────────
  function injetarTab() {
    const tabs = document.getElementById('fichaTabs');
    const modalBody = document.querySelector('#modalEditLead .modal-body');
    if (!tabs || !modalBody) return false;
    if (!document.getElementById('fichaTabBtnMensalidades')) {
      const btn = document.createElement('button');
      btn.className = 'ficha-tab-btn'; btn.id = 'fichaTabBtnMensalidades';
      btn.dataset.tab = 'mensalidades'; btn.textContent = 'Mensalidades';
      btn.onclick = window.mensAbrirTab;
      tabs.appendChild(btn);
    }
    if (!document.getElementById('fichaTabMensalidades')) {
      const c = document.createElement('div');
      c.id = 'fichaTabMensalidades'; c.className = 'ficha-tab'; c.style.display = 'none';
      modalBody.appendChild(c);
    }
    return true;
  }

  window.mensAbrirTab = function () {
    ['dados', 'consultas', 'orcamentos', 'pagamentos', 'receitas'].forEach(t => {
      const el = document.getElementById('fichaTab' + cap(t)); if (el) el.style.display = 'none';
    });
    document.querySelectorAll('.ficha-tab-btn').forEach(b => b.classList.remove('active'));
    const meu = document.getElementById('fichaTabMensalidades'); if (meu) meu.style.display = 'block';
    const btn = document.getElementById('fichaTabBtnMensalidades'); if (btn) btn.classList.add('active');
    MENS.marcando = null;
    window.mensCarregar();
  };

  function aoAbrir(id) {
    MENS.leadId = id; MENS.marcando = null;
    let tries = 0;
    const iv = setInterval(() => { tries++; if (injetarTab()) clearInterval(iv); if (tries > 40) clearInterval(iv); }, 60);
  }

  let hooked = false;
  function hook() {
    if (hooked) return true;
    if (typeof openEditLead !== 'function') return false;
    const _o = openEditLead;
    openEditLead = function () { const r = _o.apply(this, arguments); aoAbrir(arguments[0]); return r; };
    if (typeof fichaTab === 'function') {
      const _ft = fichaTab;
      fichaTab = function () {
        const r = _ft.apply(this, arguments);
        const meu = document.getElementById('fichaTabMensalidades'); if (meu) meu.style.display = 'none';
        const btn = document.getElementById('fichaTabBtnMensalidades'); if (btn) btn.classList.remove('active');
        return r;
      };
    }
    hooked = true;
    return true;
  }
  if (!hook()) {
    const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }

  // marca campos de renegociação como "tocados" pra não sobrescrever
  document.addEventListener('input', (e) => {
    if (e.target && (e.target.id === 'renegValor' || e.target.id === 'renegQtd')) e.target.dataset.touched = '1';
  });

  console.log('✅ mensalidades-fix.js carregado — Mensalidades (parcial + renegociação)');
})();
