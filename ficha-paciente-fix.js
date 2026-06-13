// ============================================================
// CLINICALEAD — FICHA RICA DO PACIENTE
// Adiciona abas ao modal "Editar Lead": Dados (form existente),
// Consultas (histórico), Orçamentos e Pagamentos.
// Não altera o formulário — apenas o envolve com navegação.
// ============================================================

let FICHA = { leadId: null };

// ── Injeta a barra de abas + containers (uma vez) ────────────
function fichaGarantirEstrutura() {
  const modal = document.querySelector('#modalEditLead .modal-body');
  if (!modal || document.getElementById('fichaTabs')) return;

  // Envolve o formulário existente numa aba "Dados"
  const dados = document.createElement('div');
  dados.id = 'fichaTabDados';
  dados.className = 'ficha-tab';
  while (modal.firstChild) dados.appendChild(modal.firstChild);

  // Barra de abas
  const tabs = document.createElement('div');
  tabs.id = 'fichaTabs';
  tabs.style.cssText = 'display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:16px;flex-wrap:wrap;';
  tabs.innerHTML = `
    <button class="ficha-tab-btn" data-tab="dados" onclick="fichaTab('dados')">Dados</button>
    <button class="ficha-tab-btn" data-tab="consultas" onclick="fichaTab('consultas')">Consultas</button>
    <button class="ficha-tab-btn" data-tab="orcamentos" onclick="fichaTab('orcamentos')">Orçamentos</button>
    <button class="ficha-tab-btn" data-tab="pagamentos" onclick="fichaTab('pagamentos')">Pagamentos</button>`;

  const consultas = document.createElement('div'); consultas.id = 'fichaTabConsultas'; consultas.className = 'ficha-tab'; consultas.style.display = 'none';
  const orcamentos = document.createElement('div'); orcamentos.id = 'fichaTabOrcamentos'; orcamentos.className = 'ficha-tab'; orcamentos.style.display = 'none';
  const pagamentos = document.createElement('div'); pagamentos.id = 'fichaTabPagamentos'; pagamentos.className = 'ficha-tab'; pagamentos.style.display = 'none';

  modal.appendChild(tabs);
  modal.appendChild(dados);
  modal.appendChild(consultas);
  modal.appendChild(orcamentos);
  modal.appendChild(pagamentos);

  if (!document.getElementById('fichaCSS')) {
    const st = document.createElement('style');
    st.id = 'fichaCSS';
    st.textContent = `
      .ficha-tab-btn{background:transparent;border:none;border-bottom:2px solid transparent;color:var(--text-secondary);padding:8px 14px;font-size:13px;cursor:pointer;font-weight:500;}
      .ficha-tab-btn.active{color:var(--gold);border-bottom-color:var(--gold);}
      .ficha-linha{padding:10px 0;border-bottom:1px solid var(--border-subtle);font-size:13px;}
      .ficha-vazio{text-align:center;padding:30px;color:var(--text-secondary);font-size:13px;}`;
    document.head.appendChild(st);
  }
}

function fichaTab(qual) {
  ['dados', 'consultas', 'orcamentos', 'pagamentos'].forEach(t => {
    const el = document.getElementById('fichaTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) el.style.display = t === qual ? 'block' : 'none';
  });
  document.querySelectorAll('.ficha-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === qual);
  });
  if (qual === 'consultas') fichaCarregarConsultas();
  if (qual === 'orcamentos') fichaCarregarOrcamentos();
  if (qual === 'pagamentos') fichaCarregarPagamentos();
}

function fichaFmt(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }

// ── Aba Consultas ────────────────────────────────────────────
async function fichaCarregarConsultas() {
  const box = document.getElementById('fichaTabConsultas');
  if (!box) return;
  box.innerHTML = '<div class="ficha-vazio">Carregando...</div>';
  const { data } = await db.from('consultas').select('*').eq('lead_id', FICHA.leadId).order('data', { ascending: false });
  const STATUS = { agendado: ['Agendado', '#5B8DB8'], confirmado: ['Confirmado', '#C9A84C'], compareceu: ['Compareceu', '#7FB069'], faltou: ['Faltou', '#C0624A'], cancelado: ['Cancelado', '#8A8570'] };
  box.innerHTML = (data && data.length) ? data.map(c => {
    const s = STATUS[c.status] || [c.status, 'var(--text-muted)'];
    const dataFmt = c.data ? new Date(c.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    return `<div class="ficha-linha" style="display:flex;align-items:center;gap:10px;">
      <i class="ti ti-calendar-event" style="color:var(--gold);"></i>
      <div style="flex:1;"><strong>${dataFmt}</strong> às ${c.hora || '—'}${c.procedimento ? ` · ${c.procedimento}` : ''}${c.observacoes ? `<div style="font-size:11px;color:var(--text-muted);">${c.observacoes}</div>` : ''}</div>
      <span class="badge" style="background:${s[1]}22;color:${s[1]};border:1px solid ${s[1]}44;">${s[0]}</span>
    </div>`;
  }).join('') : '<div class="ficha-vazio">Nenhuma consulta registrada para este paciente.</div>';
}

// ── Aba Orçamentos ───────────────────────────────────────────
async function fichaCarregarOrcamentos() {
  const box = document.getElementById('fichaTabOrcamentos');
  if (!box) return;
  box.innerHTML = '<div class="ficha-vazio">Carregando...</div>';
  const { data: orcs } = await db.from('orcamentos').select('*').eq('lead_id', FICHA.leadId).order('created_at', { ascending: false });
  if (!orcs || !orcs.length) { box.innerHTML = '<div class="ficha-vazio">Nenhum orçamento para este paciente.</div>'; return; }
  const ids = orcs.map(o => o.id);
  const { data: itens } = await db.from('orcamento_itens').select('*').in('orcamento_id', ids);
  const ORC_ST = { rascunho: ['Em aberto', '#E8C96A'], enviado: ['Enviado', '#5B8DB8'], aprovado_parcial: ['Parcial', '#5B8DB8'], aprovado: ['Aprovado', '#7FB069'], recusado: ['Recusado', '#C0624A'] };

  box.innerHTML = orcs.map(o => {
    const its = (itens || []).filter(i => i.orcamento_id === o.id);
    const total = its.reduce((s, i) => s + i.valor * i.qtd, 0) - (o.desconto || 0);
    const aprov = its.filter(i => i.aprovado).reduce((s, i) => s + i.valor * i.qtd, 0);
    const st = ORC_ST[o.status] || [o.status, 'var(--text-muted)'];
    return `<div class="ficha-linha">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <strong>${new Date(o.created_at).toLocaleDateString('pt-BR')}</strong>
        <span class="badge" style="background:${st[1]}22;color:${st[1]};border:1px solid ${st[1]}44;">${st[0]}</span>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);">${its.map(i => `${i.nome}${i.dente ? ` (dente ${i.dente})` : ''}${i.qtd > 1 ? ` ×${i.qtd}` : ''}`).join(' · ') || 'Sem itens'}</div>
      <div style="display:flex;gap:16px;margin-top:6px;font-size:12px;"><span>Total: <strong>${fichaFmt(total)}</strong></span><span style="color:#7FB069;">Aprovado: <strong>${fichaFmt(aprov)}</strong></span></div>
    </div>`;
  }).join('') + `<button class="btn btn-sm btn-primary" style="margin-top:12px;" onclick="closeModal('modalEditLead');openOrcamento('${FICHA.leadId}')"><i class="ti ti-file-invoice"></i> Abrir gestão de orçamentos</button>`;
}

// ── Aba Pagamentos ───────────────────────────────────────────
async function fichaCarregarPagamentos() {
  const box = document.getElementById('fichaTabPagamentos');
  if (!box) return;
  box.innerHTML = '<div class="ficha-vazio">Carregando...</div>';
  const { data } = await db.from('pagamentos').select('*').eq('lead_id', FICHA.leadId).order('data', { ascending: false });
  const FORMA = { pix: '💠 Pix', cartao_credito: '💳 Crédito', cartao_debito: '💳 Débito', dinheiro: '💵 Dinheiro', boleto: '🧾 Boleto', transferencia: '🏦 Transferência' };
  if (!data || !data.length) { box.innerHTML = '<div class="ficha-vazio">Nenhum pagamento registrado.</div>'; return; }
  const total = data.reduce((s, p) => s + Number(p.valor || 0), 0);
  box.innerHTML = `<div style="padding:10px 0;font-size:13px;">Total recebido: <strong style="color:var(--gold);font-family:var(--mono);">${fichaFmt(total)}</strong></div>` +
    data.map(p => `<div class="ficha-linha" style="display:flex;align-items:center;gap:10px;">
      <span>${(FORMA[p.forma] || p.forma).split(' ')[0]}</span>
      <div style="flex:1;">${FORMA[p.forma] || p.forma}${p.parcelas > 1 ? ` (${p.parcelas}x)` : ''}<div style="font-size:11px;color:var(--text-muted);">${p.data ? new Date(p.data + 'T12:00').toLocaleDateString('pt-BR') : '—'}</div></div>
      <strong style="font-family:var(--mono);color:var(--gold);">${fichaFmt(p.valor)}</strong>
    </div>`).join('');
}

// ── Engata no openEditLead ───────────────────────────────────
(function () {
  if (typeof openEditLead !== 'function') { console.error('[ficha] openEditLead não encontrado'); return; }
  const _orig = openEditLead;
  openEditLead = function (id) {
    _orig(id);
    FICHA.leadId = id;
    setTimeout(() => { fichaGarantirEstrutura(); fichaTab('dados'); }, 50);
  };
})();

console.log('✅ ficha-paciente-fix.js carregado — ficha rica do paciente ativa');
