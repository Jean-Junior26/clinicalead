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
    <button class="ficha-tab-btn" data-tab="pagamentos" onclick="fichaTab('pagamentos')">Pagamentos</button>
    <button class="ficha-tab-btn" data-tab="receitas" onclick="fichaTab('receitas')">Receitas</button>`;

  const consultas = document.createElement('div'); consultas.id = 'fichaTabConsultas'; consultas.className = 'ficha-tab'; consultas.style.display = 'none';
  const orcamentos = document.createElement('div'); orcamentos.id = 'fichaTabOrcamentos'; orcamentos.className = 'ficha-tab'; orcamentos.style.display = 'none';
  const pagamentos = document.createElement('div'); pagamentos.id = 'fichaTabPagamentos'; pagamentos.className = 'ficha-tab'; pagamentos.style.display = 'none';
  const receitas = document.createElement('div'); receitas.id = 'fichaTabReceitas'; receitas.className = 'ficha-tab'; receitas.style.display = 'none';

  modal.appendChild(tabs);
  modal.appendChild(dados);
  modal.appendChild(consultas);
  modal.appendChild(orcamentos);
  modal.appendChild(pagamentos);
  modal.appendChild(receitas);

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
  ['dados', 'consultas', 'orcamentos', 'pagamentos', 'receitas'].forEach(t => {
    const el = document.getElementById('fichaTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) el.style.display = t === qual ? 'block' : 'none';
  });
  document.querySelectorAll('.ficha-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === qual);
  });
  if (qual === 'consultas') fichaCarregarConsultas();
  if (qual === 'orcamentos') fichaCarregarOrcamentos();
  if (qual === 'pagamentos') fichaCarregarPagamentos();
  if (qual === 'receitas') fichaCarregarReceitas();
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

// ── Aba Receitas ─────────────────────────────────────────────
let FICHA_REC = { receitas: [] };

async function fichaCarregarReceitas() {
  const box = document.getElementById('fichaTabReceitas');
  if (!box) return;
  box.innerHTML = '<div class="ficha-vazio">Carregando...</div>';
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  const { data: receitas } = await db.from('receitas')
    .select('*').eq('lead_id', FICHA.leadId).order('created_at', { ascending: false });
  FICHA_REC.receitas = receitas || [];
  if (FICHA_REC.receitas.length) {
    const ids = FICHA_REC.receitas.map(r => r.id);
    const { data: itens } = await db.from('receita_itens').select('*').in('receita_id', ids).order('ordem');
    FICHA_REC.receitas.forEach(r => { r.itens = (itens || []).filter(i => i.receita_id === r.id); });
  }
  fichaRenderReceitas();
}

function fichaRenderReceitas() {
  const box = document.getElementById('fichaTabReceitas');
  if (!box) return;
  const lista = FICHA_REC.receitas.map(r => {
    const itensTxt = (r.itens || []).map(i => i.medicamento).join(', ');
    const data = new Date(r.created_at).toLocaleDateString('pt-BR');
    return `<div class="ficha-linha" style="display:flex;align-items:flex-start;gap:10px;">
      <i class="ti ti-prescription" style="color:var(--gold);margin-top:2px;"></i>
      <div style="flex:1;"><strong>${data}</strong><div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${itensTxt || 'Sem medicamentos'}</div></div>
      <button class="btn btn-sm" onclick="fichaImprimirReceita('${r.id}')" title="Imprimir" style="background:var(--gold,#C9A84C);color:#1a1a1a;"><i class="ti ti-printer"></i></button>
      <button class="btn btn-sm btn-ghost btn-icon" onclick="fichaExcluirReceita('${r.id}')" title="Excluir"><i class="ti ti-trash" style="color:var(--coral);"></i></button>
    </div>`;
  }).join('');
  box.innerHTML = `
    <button class="btn btn-sm btn-primary" style="margin-bottom:14px;" onclick="fichaNovaReceita()"><i class="ti ti-plus"></i> Nova receita</button>
    ${lista || '<div class="ficha-vazio">Nenhuma receita para este paciente.</div>'}`;
}

window.fichaNovaReceita = function () {
  const box = document.getElementById('fichaTabReceitas');
  if (!box) return;
  box.innerHTML = `
    <button class="btn btn-sm btn-ghost" style="margin-bottom:12px;" onclick="fichaCarregarReceitas()"><i class="ti ti-arrow-left"></i> Voltar</button>
    <div id="fichaRecItens"></div>
    <button class="btn" onclick="fichaRecAddItem()" style="width:100%;margin:8px 0 14px;border:1px dashed var(--border-subtle,#444);"><i class="ti ti-plus"></i> Adicionar medicamento</button>
    <div style="margin-bottom:12px;">
      <label class="form-label" style="font-size:12px;color:var(--text-muted);">Orientações gerais (opcional)</label>
      <textarea class="form-input" id="fichaRecObs" rows="2" placeholder="Ex: Tomar após as refeições." style="width:100%;resize:vertical;"></textarea>
    </div>
    <button class="btn btn-primary" onclick="fichaSalvarReceita()" style="width:100%;"><i class="ti ti-device-floppy"></i> Salvar receita</button>
    <div id="fichaRecMsg" style="font-size:12px;color:var(--coral);min-height:14px;margin-top:8px;"></div>`;
  fichaRecAddItem();
};

let fichaRecSeq = 0;
window.fichaRecAddItem = function () {
  const cont = document.getElementById('fichaRecItens');
  if (!cont) return;
  const id = 'fri_' + (fichaRecSeq++);
  const div = document.createElement('div');
  div.className = 'ficha-rec-item';
  div.id = id;
  div.style.cssText = 'background:var(--bg-elevated);border-radius:10px;padding:12px;margin-bottom:10px;';
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Medicamento</span>
      <button class="btn btn-sm btn-ghost btn-icon" onclick="document.getElementById('${id}').remove()"><i class="ti ti-x"></i></button>
    </div>
    <input class="form-input fr-med" placeholder="Ex: Amoxicilina 500mg" style="width:100%;margin-bottom:8px;"/>
    <input class="form-input fr-pos" placeholder="Posologia — ex: 1 cápsula de 8/8h por 7 dias" style="width:100%;margin-bottom:8px;"/>
    <input class="form-input fr-qtd" placeholder="Quantidade — ex: 21 cápsulas" style="width:100%;"/>`;
  cont.appendChild(div);
};

window.fichaSalvarReceita = async function () {
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  const msg = document.getElementById('fichaRecMsg');
  const setMsg = (t) => { if (msg) msg.textContent = t || ''; };
  const itens = [];
  document.querySelectorAll('#fichaRecItens .ficha-rec-item').forEach((d, idx) => {
    const med = d.querySelector('.fr-med').value.trim();
    if (!med) return;
    itens.push({ medicamento: med, posologia: d.querySelector('.fr-pos').value.trim(), quantidade: d.querySelector('.fr-qtd').value.trim(), ordem: idx });
  });
  if (!itens.length) { setMsg('Adicione pelo menos um medicamento.'); return; }
  const observacoes = (document.getElementById('fichaRecObs')?.value || '').trim();
  try {
    const { data: rec, error } = await db.from('receitas').insert({
      clinic_id: clinic.id, lead_id: FICHA.leadId, tipo: 'comum', observacoes,
    }).select().single();
    if (error) throw error;
    const { error: e2 } = await db.from('receita_itens').insert(itens.map(i => ({ ...i, receita_id: rec.id })));
    if (e2) throw e2;
    if (typeof toast === 'function') toast('Receita salva! 💊');
    fichaCarregarReceitas();
  } catch (e) {
    setMsg('Erro ao salvar: ' + (e.message || 'tente de novo'));
    console.error('[ficha receita]', e);
  }
};

window.fichaExcluirReceita = async function (id) {
  if (!confirm('Excluir esta receita?')) return;
  try { await db.from('receitas').delete().eq('id', id); if (typeof toast === 'function') toast('Receita excluída'); fichaCarregarReceitas(); }
  catch (e) { if (typeof toast === 'function') toast('Erro ao excluir', 'error'); }
};

window.fichaImprimirReceita = function (id) {
  const rec = FICHA_REC.receitas.find(r => r.id === id);
  if (!rec) return;
  const lead = (STATE.leads || []).find(l => l.id === FICHA.leadId) || {};
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : {};
  const hoje = new Date(rec.created_at).toLocaleDateString('pt-BR');
  const itens = (rec.itens || []).map((i, idx) => `
    <div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #eee;">
      <div style="font-size:15px;font-weight:600;">${idx + 1}. ${i.medicamento}${i.quantidade ? ` <span style="font-weight:400;color:#666;">— ${i.quantidade}</span>` : ''}</div>
      ${i.posologia ? `<div style="font-size:14px;color:#444;margin-top:4px;">${i.posologia}</div>` : ''}
    </div>`).join('');
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Receita - ${lead.nome || ''}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#222;padding:40px;max-width:720px;margin:0 auto;}
  .cab{display:flex;align-items:center;gap:14px;border-bottom:2px solid #C9A84C;padding-bottom:16px;margin-bottom:24px;}
  .clinica-nome{font-size:22px;font-weight:700;color:#C9A84C;}
  .clinica-info{font-size:12px;color:#666;margin-top:4px;line-height:1.5;}
  .titulo-doc{text-align:center;font-size:18px;font-weight:700;letter-spacing:2px;color:#444;margin-bottom:24px;text-transform:uppercase;}
  .paciente{font-size:14px;margin-bottom:24px;padding-bottom:12px;border-bottom:1px dashed #ccc;}
  .obs{margin-top:20px;padding:14px;background:#faf6ec;border-radius:8px;font-size:13px;color:#555;}
  .assinatura{margin-top:64px;text-align:center;}
  .assinatura-linha{border-top:1px solid #333;width:280px;margin:0 auto;padding-top:6px;font-size:13px;color:#666;}
  .rodape{margin-top:32px;text-align:center;font-size:11px;color:#999;}
  @media print{body{padding:16px;}.no-print{display:none;}}
</style></head><body>
  <div class="cab">
    ${clinic.logo_url ? `<img src="${clinic.logo_url}" style="max-width:72px;max-height:72px;object-fit:contain;">` : ''}
    <div><div class="clinica-nome">${clinic.nome || 'Clínica'}</div>
    <div class="clinica-info">${clinic.endereco ? clinic.endereco + '<br>' : ''}${clinic.telefone ? 'Tel: ' + clinic.telefone : ''}</div></div>
  </div>
  <div class="titulo-doc">Receituário</div>
  <div class="paciente"><strong>Paciente:</strong> ${lead.nome || '—'}　　<strong>Data:</strong> ${hoje}</div>
  <div>${itens || '<div style="color:#999;">Nenhum medicamento.</div>'}</div>
  ${rec.observacoes ? `<div class="obs"><strong>Orientações:</strong> ${rec.observacoes}</div>` : ''}
  <div class="assinatura"><div class="assinatura-linha">${clinic.responsavel || clinic.nome || 'Responsável'}</div></div>
  <div class="rodape">${clinic.nome || ''} · ${clinic.endereco || ''}</div>
  <div class="no-print" style="text-align:center;margin-top:28px;">
    <button onclick="window.print()" style="padding:12px 24px;background:#C9A84C;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600;">🖨️ Imprimir / Salvar PDF</button>
  </div>
</body></html>`;
  const win = window.open('', '_blank');
  if (!win) { if (typeof toast === 'function') toast('Permita pop-ups para imprimir', 'error'); return; }
  win.document.write(html); win.document.close();
};

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
