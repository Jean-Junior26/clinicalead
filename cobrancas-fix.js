// ============================================================
// CLINICALEAD — COBRANÇAS (visão geral das mensalidades) — Fase 1
// Item "Cobranças" no menu lateral -> abre um painel com as parcelas
// da clínica: atrasadas, deste mês e do próximo mês, com o nome do
// paciente, totais e "marcar paga" direto (cria pagamento).
// Self-contained; usa as tabelas mensalidade_parcelas + leads (RLS).
// ============================================================

(function () {
  'use strict';

  const COB = { filtro: 'mes', marcando: null, parcelas: [], nomes: {} };
  const FORMA = { pix: 'Pix', cartao_credito: 'Crédito', cartao_debito: 'Débito', dinheiro: 'Dinheiro', boleto: 'Boleto', transferencia: 'Transferência' };

  const fmt = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hojeISO = () => iso(new Date());
  function brData(s) { if (!s) return '—'; const d = new Date(s + 'T12:00'); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR'); }

  function periodo(filtro) {
    const h = new Date();
    if (filtro === 'atrasadas') return { tipo: 'atrasadas' };
    if (filtro === 'proximo') {
      return { tipo: 'range', de: iso(new Date(h.getFullYear(), h.getMonth() + 1, 1)), ate: iso(new Date(h.getFullYear(), h.getMonth() + 2, 0)) };
    }
    // este mês (padrão)
    return { tipo: 'range', de: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: iso(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
  }

  // ── abre o painel ────────────────────────────────────────
  window.abrirCobrancas = function () {
    if (!document.getElementById('modalCobrancas')) {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.id = 'modalCobrancas';
      ov.innerHTML = `
        <div class="modal" style="max-width:620px;width:96vw;">
          <div class="modal-header">
            <h3><i class="ti ti-cash" style="margin-right:8px;color:var(--gold);"></i>Cobranças</h3>
            <button class="btn btn-ghost btn-icon" onclick="closeModal('modalCobrancas')"><i class="ti ti-x"></i></button>
          </div>
          <div class="modal-body" style="max-height:78vh;overflow-y:auto;">
            <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
              <button class="btn btn-sm cob-fbtn" data-f="atrasadas" onclick="cobFiltro('atrasadas')">Atrasadas</button>
              <button class="btn btn-sm cob-fbtn" data-f="mes" onclick="cobFiltro('mes')">Este mês</button>
              <button class="btn btn-sm cob-fbtn" data-f="proximo" onclick="cobFiltro('proximo')">Próximo mês</button>
            </div>
            <div id="cobResumo" style="font-size:13px;margin-bottom:12px;"></div>
            <div id="cobLista"></div>
          </div>
        </div>`;
      document.body.appendChild(ov);
    }
    COB.marcando = null;
    cobCarregar();
    openModal('modalCobrancas');
  };

  window.cobFiltro = function (f) { COB.filtro = f; COB.marcando = null; cobCarregar(); };

  async function cobCarregar() {
    const lista = document.getElementById('cobLista');
    const resumo = document.getElementById('cobResumo');
    if (!lista) return;
    // marca o filtro ativo
    document.querySelectorAll('.cob-fbtn').forEach(b => {
      b.style.cssText = b.dataset.f === COB.filtro
        ? 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);font-weight:600;' : '';
    });
    lista.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Carregando...</div>';
    if (resumo) resumo.innerHTML = '';
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;

    try {
      let q = db.from('mensalidade_parcelas').select('*')
        .eq('clinic_id', clinic.id).eq('status', 'pendente');
      const per = periodo(COB.filtro);
      if (per.tipo === 'atrasadas') q = q.lt('vencimento', hojeISO());
      else q = q.gte('vencimento', per.de).lte('vencimento', per.ate);
      const { data: parcelas } = await q.order('vencimento');
      COB.parcelas = parcelas || [];

      // nomes dos pacientes
      COB.nomes = {};
      const ids = [...new Set(COB.parcelas.map(p => p.lead_id).filter(Boolean))];
      if (ids.length) {
        const { data: leads } = await db.from('leads').select('id,nome').in('id', ids);
        (leads || []).forEach(l => { COB.nomes[l.id] = l.nome; });
      }
      cobRender();
    } catch (e) {
      lista.innerHTML = '<div style="padding:20px;color:var(--coral);font-size:13px;">Erro: ' + (e.message || '') + '</div>';
    }
  }

  function cobRender() {
    const lista = document.getElementById('cobLista');
    const resumo = document.getElementById('cobResumo');
    if (!lista) return;
    const hoje = hojeISO();

    const total = COB.parcelas.reduce((s, p) => s + Number(p.valor || 0), 0);
    const atrasado = COB.parcelas.filter(p => p.vencimento < hoje).reduce((s, p) => s + Number(p.valor || 0), 0);
    if (resumo) {
      resumo.innerHTML = `
        <span style="margin-right:16px;">Total: <strong style="font-family:var(--mono);">${fmt(total)}</strong></span>
        ${atrasado > 0 ? `<span style="color:#C0624A;">Atrasado: <strong style="font-family:var(--mono);">${fmt(atrasado)}</strong></span>` : ''}
        <span style="color:var(--text-muted);margin-left:8px;">(${COB.parcelas.length} parcela${COB.parcelas.length === 1 ? '' : 's'})</span>`;
    }

    if (!COB.parcelas.length) {
      lista.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">Nenhuma parcela em aberto neste período. 🎉</div>';
      return;
    }

    lista.innerHTML = COB.parcelas.map(p => {
      const venc = p.vencimento;
      const atrasada = venc < hoje;
      const cor = atrasada ? '#C0624A' : '#5B8DB8';
      const nome = COB.nomes[p.lead_id] || 'Paciente';
      let acao;
      if (COB.marcando === p.id) {
        acao = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px;">
          <select class="form-input" id="cbForma_${p.id}" style="font-size:12px;padding:4px 6px;width:auto;">
            ${Object.entries(FORMA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
          <input class="form-input" id="cbData_${p.id}" type="date" value="${hoje}" style="font-size:12px;padding:4px 6px;width:auto;"/>
          <button class="btn btn-sm btn-primary" onclick="cobConfirmar('${p.id}')">Confirmar</button>
          <button class="btn btn-sm btn-ghost" onclick="cobCancelar()">Cancelar</button>
        </div>`;
      } else {
        acao = `<button class="btn btn-sm" style="border:1px solid var(--gold,#C9A84C);color:var(--gold,#C9A84C);" onclick="cobMarcar('${p.id}')"><i class="ti ti-check"></i> Marcar paga</button>`;
      }
      return `<div class="ficha-linha" style="padding:12px 0;border-bottom:1px solid var(--border-subtle,#2a2a2a);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <a onclick="cobAbrirPaciente('${p.lead_id}')" style="font-weight:600;cursor:pointer;color:var(--text-primary);text-decoration:underline;text-decoration-color:var(--border-subtle,#444);">${nome}</a>
            <div style="font-size:12px;color:var(--text-secondary);">parcela #${p.numero} · venc. ${brData(venc)} · <strong style="font-family:var(--mono);">${fmt(p.valor)}</strong></div>
          </div>
          <span class="badge" style="background:${cor}22;color:${cor};border:1px solid ${cor}44;">${atrasada ? 'Atrasada' : 'A vencer'}</span>
        </div>
        ${acao}
      </div>`;
    }).join('');
  }

  window.cobMarcar = function (id) { COB.marcando = id; cobRender(); };
  window.cobCancelar = function () { COB.marcando = null; cobRender(); };

  window.cobConfirmar = async function (id) {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;
    const p = COB.parcelas.find(x => x.id === id); if (!p) return;
    const forma = document.getElementById('cbForma_' + id)?.value || 'pix';
    const data = document.getElementById('cbData_' + id)?.value || hojeISO();
    try {
      const { data: pag, error } = await db.from('pagamentos').insert({
        clinic_id: clinic.id, lead_id: p.lead_id, valor: p.valor, forma, data,
        observacao: `Mensalidade (parcela ${p.numero})`,
      }).select().single();
      if (error) throw error;
      const { error: e2 } = await db.from('mensalidade_parcelas')
        .update({ status: 'pago', pago_em: data, pagamento_id: pag.id }).eq('id', id);
      if (e2) throw e2;
      COB.marcando = null;
      if (typeof toast === 'function') toast('Parcela paga! ✅');
      cobCarregar();
    } catch (e) {
      if (typeof toast === 'function') toast('Erro: ' + (e.message || ''), 'error');
      console.error('[cobrancas pagamento]', e);
    }
  };

  window.cobAbrirPaciente = function (leadId) {
    if (!leadId) return;
    closeModal('modalCobrancas');
    if (typeof openEditLead === 'function') openEditLead(leadId);
  };

  // ── injeta o item "Cobranças" no menu lateral ────────────
  function injetarMenu() {
    if (document.getElementById('navCobrancas')) return;
    const anchor = document.querySelector('.nav-item[data-page="financeiro"]')
      || document.querySelector('.nav-item[data-page="relatorios"]')
      || document.querySelector('.nav-item[data-page="automacoes"]');
    if (!anchor) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navCobrancas';
    btn.innerHTML = '<i class="ti ti-cash"></i> Cobranças';
    btn.onclick = function () { window.abrirCobrancas(); };
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  }
  injetarMenu();
  setTimeout(injetarMenu, 1500);
  setTimeout(injetarMenu, 4000);

  console.log('✅ cobrancas-fix.js carregado — painel de Cobranças');
})();
