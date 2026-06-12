// ============================================================
// CLINICALEAD — ORÇAMENTOS
// Modal por lead: lista de orçamentos + construtor com chips
// de procedimentos, campo de dente, desconto e total ao vivo.
// Aprovação POR ITEM: ao aprovar o 1º item, o lead vira
// "fechado" (paciente) automaticamente.
// ============================================================

let ORC = {
  leadId: null,
  lead: null,
  procedimentos: [],
  orcamentos: [],     // cada um com .itens
  view: 'lista',      // 'lista' | 'builder'
  itens: [],          // builder (em memória até salvar)
  desconto: 0,
};

const ORC_STATUS = {
  rascunho:         { label: 'Em aberto', cls: 'badge-amber' },
  enviado:          { label: 'Enviado',   cls: 'badge-blue' },
  aprovado_parcial: { label: 'Parcial',   cls: 'badge-blue' },
  aprovado:         { label: 'Aprovado',  cls: 'badge-gold' },
  recusado:         { label: 'Recusado',  cls: 'badge-coral' },
};

function orcFmt(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

// ── Abrir o modal de orçamentos de um lead ───────────────────
async function openOrcamento(leadId) {
  ORC.leadId = leadId;
  ORC.lead = (STATE.leads || []).find(l => l.id === leadId) || null;
  ORC.view = 'lista';
  ORC.itens = [];
  ORC.desconto = 0;

  orcGarantirModal();
  orcRender('<div style="padding:30px;text-align:center;color:var(--text-secondary);">Carregando...</div>');
  document.getElementById('modalOrcamento').classList.add('open');

  await orcCarregarDados();
  orcRenderView();
}

async function orcCarregarDados() {
  const clinic = currentClinic();
  if (!clinic) return;

  const { data: procs } = await db.from('procedimentos')
    .select('*').eq('clinic_id', clinic.id).eq('ativo', true).order('nome');
  ORC.procedimentos = procs || [];

  const { data: orcs } = await db.from('orcamentos')
    .select('*').eq('lead_id', ORC.leadId).order('created_at', { ascending: false });
  ORC.orcamentos = orcs || [];

  if (ORC.orcamentos.length) {
    const ids = ORC.orcamentos.map(o => o.id);
    const { data: itens } = await db.from('orcamento_itens')
      .select('*').in('orcamento_id', ids);
    const { data: pags } = await db.from('pagamentos')
      .select('*').in('orcamento_id', ids).order('data');
    ORC.orcamentos.forEach(o => {
      o.itens = (itens || []).filter(i => i.orcamento_id === o.id);
      o.pagamentos = (pags || []).filter(p => p.orcamento_id === o.id);
    });
  }
}

// ── Estrutura do modal ───────────────────────────────────────
function orcGarantirModal() {
  if (document.getElementById('modalOrcamento')) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modalOrcamento';
  overlay.innerHTML = `
    <div class="modal" style="max-width:760px;width:96vw;">
      <div class="modal-header">
        <h3 id="orcTitulo"><i class="ti ti-file-invoice" style="margin-right:8px;color:var(--gold);"></i>Orçamentos</h3>
        <button class="btn btn-ghost btn-icon" onclick="closeModal('modalOrcamento')"><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body" id="orcBody" style="max-height:70vh;overflow-y:auto;"></div>
    </div>`;
  document.body.appendChild(overlay);
}

function orcRender(html) {
  const titulo = document.getElementById('orcTitulo');
  if (titulo) {
    const tel = (ORC.lead?.telefone || '').replace(/\D/g, '');
    const btnInbox = tel ? `<button class="btn btn-sm btn-ghost btn-icon" title="Conversa no Inbox" style="margin-left:10px;" onclick="closeModal('modalOrcamento');tarefaWhats('${tel}')"><i class="ti ti-message-circle" style="color:#25D366;"></i></button>` : '';
    const btnLead = ORC.lead ? `<button class="btn btn-sm btn-ghost btn-icon" title="Abrir cadastro" onclick="closeModal('modalOrcamento');openEditLead('${ORC.lead.id}')"><i class="ti ti-user"></i></button>` : '';
    titulo.innerHTML = `<i class="ti ti-file-invoice" style="margin-right:8px;color:var(--gold);"></i>Orçamentos — ${ORC.lead?.nome || 'Lead'}${btnInbox}${btnLead}`;
  }
  const body = document.getElementById('orcBody');
  if (body) body.innerHTML = html;
}

function orcRenderView() {
  if (ORC.view === 'builder') orcRenderBuilder();
  else orcRenderLista();
}

// ── VIEW: lista de orçamentos do lead ────────────────────────
function orcRenderLista() {
  const orcs = ORC.orcamentos;

  const cards = orcs.map(o => {
    const total = (o.itens || []).reduce((s, i) => s + (i.valor * i.qtd), 0) - (o.desconto || 0);
    const aprovadoV = (o.itens || []).filter(i => i.aprovado).reduce((s, i) => s + (i.valor * i.qtd), 0);
    const pendenteV = Math.max(0, total - aprovadoV);
    const st = ORC_STATUS[o.status] || ORC_STATUS.rascunho;
    const data = new Date(o.created_at).toLocaleDateString('pt-BR');

    const linhas = (o.itens || []).map(i => `
      <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border-subtle);">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;">
          <input type="checkbox" ${i.aprovado ? 'checked' : ''} onchange="orcToggleAprovado('${o.id}','${i.id}', this.checked)" style="accent-color:var(--gold);width:16px;height:16px;cursor:pointer;"/>
          <span style="font-size:13px;${i.aprovado ? 'color:var(--gold);' : ''}">${i.nome}${i.dente ? ` <span style="font-size:11px;color:var(--text-muted);">(dente ${i.dente})</span>` : ''}${i.qtd > 1 ? ` <span style="font-size:11px;color:var(--text-muted);">× ${i.qtd}</span>` : ''}</span>
        </label>
        <span style="font-family:var(--mono);font-size:12px;color:${i.aprovado ? 'var(--gold)' : 'var(--text-secondary)'};">${orcFmt(i.valor * i.qtd)}</span>
      </div>`).join('');

    const pagoV = (o.pagamentos || []).reduce((s, p) => s + Number(p.valor || 0), 0);
    const aReceber = Math.max(0, aprovadoV - pagoV);

    const FORMA_ICON = { pix: '💠', cartao_credito: '💳', cartao_debito: '💳', dinheiro: '💵', boleto: '🧾', transferencia: '🏦' };
    const FORMA_LABEL = { pix: 'Pix', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', dinheiro: 'Dinheiro', boleto: 'Boleto', transferencia: 'Transferência' };

    const pagLinhas = (o.pagamentos || []).map(p => `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;">
        <span>${FORMA_ICON[p.forma] || '💰'}</span>
        <span style="flex:1;color:var(--text-secondary);">${FORMA_LABEL[p.forma] || p.forma}${p.parcelas > 1 ? ` (${p.parcelas}x)` : ''} · ${new Date(p.data + 'T12:00').toLocaleDateString('pt-BR')}</span>
        <span style="font-family:var(--mono);color:var(--gold);">${orcFmt(p.valor)}</span>
        <button class="btn btn-sm btn-ghost btn-icon" style="padding:2px 6px;" title="Excluir pagamento" onclick="orcExcluirPagamento('${p.id}','${o.id}')"><i class="ti ti-x" style="color:var(--coral);font-size:12px;"></i></button>
      </div>`).join('');

    const pagamentosBloco = aprovadoV > 0 ? `
      <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div style="font-size:12px;">
            <span style="color:var(--text-muted);">Pago:</span> <strong style="color:var(--gold);font-family:var(--mono);">${orcFmt(pagoV)}</strong>
            <span style="color:var(--text-muted);margin-left:10px;">A receber:</span> <strong style="color:${aReceber > 0 ? 'var(--coral)' : 'var(--gold)'};font-family:var(--mono);">${orcFmt(aReceber)}</strong>
            ${aReceber === 0 && pagoV > 0 ? ' <span style="font-size:11px;">✅ quitado</span>' : ''}
          </div>
          <button class="btn btn-sm" onclick="orcTogglePagForm('${o.id}')"><i class="ti ti-cash"></i> Registrar pagamento</button>
        </div>
        ${pagLinhas ? `<div style="margin-top:6px;">${pagLinhas}</div>` : ''}
        <div id="orcPagForm-${o.id}" style="display:none;margin-top:10px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--r-sm,10px);padding:12px;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <input type="text" id="pagValor-${o.id}" class="form-input" placeholder="Valor (R$)" style="width:110px;font-size:12px;padding:6px 8px;"/>
            <select id="pagForma-${o.id}" class="form-input" style="width:150px;font-size:12px;padding:6px 8px;" onchange="document.getElementById('pagParcelasWrap-${o.id}').style.display = this.value==='cartao_credito' ? 'flex' : 'none'">
              <option value="pix">💠 Pix</option>
              <option value="cartao_credito">💳 Cartão de crédito</option>
              <option value="cartao_debito">💳 Cartão de débito</option>
              <option value="dinheiro">💵 Dinheiro</option>
              <option value="boleto">🧾 Boleto</option>
              <option value="transferencia">🏦 Transferência</option>
            </select>
            <div id="pagParcelasWrap-${o.id}" style="display:none;align-items:center;gap:4px;">
              <select id="pagParcelas-${o.id}" class="form-input" style="width:70px;font-size:12px;padding:6px 8px;">
                ${[1,2,3,4,5,6,7,8,9,10,11,12].map(n => `<option value="${n}">${n}x</option>`).join('')}
              </select>
            </div>
            <input type="date" id="pagData-${o.id}" class="form-input" style="width:140px;font-size:12px;padding:6px 8px;" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]}"/>
            <button class="btn btn-primary btn-sm" onclick="orcRegistrarPagamento('${o.id}')"><i class="ti ti-check"></i> Confirmar</button>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">💡 Pagou metade no dinheiro e metade no cartão? Registre 2 pagamentos, um de cada forma.</div>
        </div>
      </div>` : '';

    return `
      <div class="card" style="margin-bottom:14px;">
        <div class="card-header">
          <h3 style="font-size:13px;">Orçamento de ${data} ${badgeHtmlSafe(st)}</h3>
          <button class="btn btn-sm btn-ghost btn-icon" title="Excluir orçamento" onclick="orcExcluir('${o.id}')"><i class="ti ti-trash" style="color:var(--coral);"></i></button>
        </div>
        <div class="card-body" style="padding-top:6px;">
          ${linhas || '<div style="color:var(--text-secondary);font-size:13px;">Sem itens</div>'}
          ${o.desconto ? `<div style="display:flex;justify-content:space-between;padding:7px 0;font-size:12px;color:var(--coral);"><span>Desconto</span><span>- ${orcFmt(o.desconto)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;gap:12px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);flex-wrap:wrap;">
            <div style="font-size:12px;"><span style="color:var(--text-muted);">Total</span><br><strong style="font-size:15px;">${orcFmt(total)}</strong></div>
            <div style="font-size:12px;"><span style="color:var(--text-muted);">Aprovado</span><br><strong style="font-size:15px;color:var(--gold);">${orcFmt(aprovadoV)}</strong></div>
            <div style="font-size:12px;"><span style="color:var(--text-muted);">Pendente</span><br><strong style="font-size:15px;color:${pendenteV > 0 ? 'var(--coral)' : 'var(--text-secondary)'};">${orcFmt(pendenteV)}</strong></div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px;"><i class="ti ti-info-circle"></i> Marque os itens que o paciente aprovou — o restante fica como pendente.</div>
          ${pagamentosBloco}
        </div>
      </div>`;
  }).join('');

  orcRender(`
    <button class="btn btn-primary" style="width:100%;margin-bottom:16px;" onclick="orcNovo()"><i class="ti ti-plus"></i> Novo orçamento</button>
    ${cards || `<div style="text-align:center;padding:30px;color:var(--text-secondary);font-size:13px;">Nenhum orçamento ainda para ${ORC.lead?.nome || 'este lead'}.<br>Clique em "Novo orçamento" para montar o primeiro. 💰</div>`}
  `);
}

function badgeHtmlSafe(st) {
  return `<span class="badge ${st.cls}" style="margin-left:8px;">${st.label}</span>`;
}

// ── VIEW: construtor (chips) ─────────────────────────────────
function orcNovo() {
  ORC.view = 'builder';
  ORC.itens = [];
  ORC.desconto = 0;
  orcRenderBuilder();
}

function orcRenderBuilder() {
  const chips = ORC.procedimentos.map(p => `
    <button class="btn btn-sm" style="margin:0;" onclick="orcAddProc('${p.id}')">
      ${p.nome} <span style="font-family:var(--mono);font-size:11px;color:var(--gold);margin-left:4px;">${orcFmt(p.valor)}</span>
    </button>`).join('');

  const linhas = ORC.itens.map((i, idx) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-subtle);flex-wrap:wrap;">
      <span style="flex:1;min-width:140px;font-size:13px;">${i.nome}</span>
      <input type="text" placeholder="dente" value="${i.dente || ''}" onchange="orcCampoItem(${idx},'dente',this.value)" class="form-input" style="width:70px;font-size:12px;padding:5px 8px;" title="Nº do dente (opcional)"/>
      <input type="text" value="${Number(i.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}" onchange="orcCampoItem(${idx},'valor',this.value)" class="form-input" style="width:100px;font-size:12px;padding:5px 8px;font-family:var(--mono);color:var(--gold);"/>
      <div style="display:flex;align-items:center;gap:4px;">
        <button class="btn btn-sm btn-icon" onclick="orcQtd(${idx},-1)" style="padding:3px 8px;">−</button>
        <span style="font-size:13px;min-width:18px;text-align:center;">${i.qtd}</span>
        <button class="btn btn-sm btn-icon" onclick="orcQtd(${idx},1)" style="padding:3px 8px;">+</button>
      </div>
      <button class="btn btn-sm btn-ghost btn-icon" onclick="orcRemoveItem(${idx})"><i class="ti ti-x" style="color:var(--coral);"></i></button>
    </div>`).join('');

  const subtotal = ORC.itens.reduce((s, i) => s + (i.valor * i.qtd), 0);
  const total = Math.max(0, subtotal - (ORC.desconto || 0));

  orcRender(`
    <div style="margin-bottom:6px;font-size:12px;color:var(--text-secondary);">Toque nos procedimentos para adicionar:</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;">
      ${chips || '<div style="font-size:13px;color:var(--text-secondary);">Nenhum procedimento ativo no catálogo. Cadastre na página <strong>Procedimentos</strong>.</div>'}
    </div>

    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">Itens do orçamento:</div>
    <div style="min-height:40px;">
      ${linhas || '<div style="font-size:13px;color:var(--text-muted);padding:10px 0;">Nenhum item ainda — toque num chip acima 👆</div>'}
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:12px;color:var(--text-secondary);">Desconto (R$):</span>
        <input type="text" value="${ORC.desconto || ''}" placeholder="0,00" onchange="orcSetDesconto(this.value)" class="form-input" style="width:100px;font-size:12px;padding:5px 8px;"/>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:var(--text-muted);">TOTAL</div>
        <div style="font-size:22px;font-weight:700;color:var(--gold);font-family:var(--mono);">${orcFmt(total)}</div>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-top:18px;">
      <button class="btn" style="flex:1;" onclick="ORC.view='lista';orcRenderLista()">← Voltar</button>
      <button class="btn btn-primary" style="flex:2;" onclick="orcSalvar()" ${!ORC.itens.length ? 'disabled' : ''}><i class="ti ti-device-floppy"></i> Salvar orçamento</button>
    </div>
  `);
}

function orcAddProc(procId) {
  const p = ORC.procedimentos.find(x => x.id === procId);
  if (!p) return;
  ORC.itens.push({ procedimento_id: p.id, nome: p.nome, valor: Number(p.valor || 0), qtd: 1, dente: '' });
  orcRenderBuilder();
}

function orcRemoveItem(idx) { ORC.itens.splice(idx, 1); orcRenderBuilder(); }

function orcQtd(idx, delta) {
  const i = ORC.itens[idx];
  if (!i) return;
  i.qtd = Math.max(1, i.qtd + delta);
  orcRenderBuilder();
}

function orcCampoItem(idx, campo, valor) {
  const i = ORC.itens[idx];
  if (!i) return;
  if (campo === 'valor') i.valor = parseFloat(String(valor).replace(/\./g, '').replace(',', '.')) || 0;
  else i[campo] = String(valor).trim();
  orcRenderBuilder();
}

function orcSetDesconto(v) {
  ORC.desconto = parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0;
  orcRenderBuilder();
}

// ── Salvar orçamento ─────────────────────────────────────────
async function orcSalvar() {
  const clinic = currentClinic();
  if (!clinic || !ORC.itens.length) return;

  const { data: novo, error } = await db.from('orcamentos').insert({
    clinic_id: clinic.id,
    lead_id: ORC.leadId,
    status: 'rascunho',
    desconto: ORC.desconto || 0,
  }).select().single();

  if (error || !novo) { toast('Erro ao salvar: ' + (error?.message || ''), 'error'); return; }

  const itens = ORC.itens.map(i => ({
    orcamento_id: novo.id,
    procedimento_id: i.procedimento_id,
    nome: i.nome,
    valor: i.valor,
    qtd: i.qtd,
    dente: i.dente || null,
    aprovado: false,
  }));
  const { error: e2 } = await db.from('orcamento_itens').insert(itens);
  if (e2) { toast('Erro nos itens: ' + e2.message, 'error'); return; }

  toast('Orçamento salvo! 💰');
  ORC.view = 'lista';
  await orcCarregarDados();
  orcRenderLista();
}

// ── Aprovar item (e fechar o lead automaticamente) ───────────
async function orcToggleAprovado(orcId, itemId, aprovado) {
  await db.from('orcamento_itens').update({ aprovado }).eq('id', itemId);

  // Atualiza memória
  const o = ORC.orcamentos.find(x => x.id === orcId);
  const item = o?.itens?.find(x => x.id === itemId);
  if (item) item.aprovado = aprovado;

  // Recalcula status do orçamento
  if (o) {
    const aprovados = o.itens.filter(i => i.aprovado).length;
    const novoStatus = aprovados === 0 ? 'rascunho' : (aprovados === o.itens.length ? 'aprovado' : 'aprovado_parcial');
    if (novoStatus !== o.status) {
      o.status = novoStatus;
      await db.from('orcamentos').update({ status: novoStatus, atualizado_em: new Date().toISOString() }).eq('id', orcId);
    }
  }

  // 🎯 A cascata: 1º item aprovado => lead vira "fechado" (paciente)
  if (aprovado && ORC.lead && ORC.lead.status !== 'fechado') {
    const valorAprovado = ORC.orcamentos.flatMap(x => x.itens || []).filter(i => i.aprovado).reduce((s, i) => s + i.valor * i.qtd, 0);
    const { error } = await db.from('leads').update({ status: 'fechado', valor: valorAprovado }).eq('id', ORC.leadId);
    if (!error) {
      ORC.lead.status = 'fechado';
      ORC.lead.valor = valorAprovado;
      toast(`🎉 ${ORC.lead.nome} virou PACIENTE automaticamente!`);
    }
  } else if (ORC.lead && ORC.lead.status === 'fechado') {
    // Mantém o valor do lead sincronizado com o total aprovado
    const valorAprovado = ORC.orcamentos.flatMap(x => x.itens || []).filter(i => i.aprovado).reduce((s, i) => s + i.valor * i.qtd, 0);
    await db.from('leads').update({ valor: valorAprovado }).eq('id', ORC.leadId);
    ORC.lead.valor = valorAprovado;
  }

  orcRenderLista();
}

// ── Excluir orçamento ────────────────────────────────────────
async function orcExcluir(orcId) {
  if (!confirm('Excluir este orçamento? Os itens dele serão removidos juntos.')) return;
  const { error } = await db.from('orcamentos').delete().eq('id', orcId);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Orçamento excluído');
  await orcCarregarDados();
  orcRenderLista();
}

// ── Pagamentos ───────────────────────────────────────────────
function orcTogglePagForm(orcId) {
  const f = document.getElementById('orcPagForm-' + orcId);
  if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function orcRegistrarPagamento(orcId) {
  const clinic = currentClinic();
  if (!clinic) return;

  const valor = parseFloat(String(document.getElementById('pagValor-' + orcId)?.value || '').replace(/\./g, '').replace(',', '.')) || 0;
  const forma = document.getElementById('pagForma-' + orcId)?.value || 'pix';
  const parcelas = forma === 'cartao_credito' ? Number(document.getElementById('pagParcelas-' + orcId)?.value || 1) : 1;
  const data = document.getElementById('pagData-' + orcId)?.value || new Date().toISOString().split('T')[0];

  if (valor <= 0) { toast('Digite o valor do pagamento', 'error'); return; }

  const { error } = await db.from('pagamentos').insert({
    clinic_id: clinic.id,
    lead_id: ORC.leadId,
    orcamento_id: orcId,
    valor, forma, parcelas, data,
  });
  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  toast(`Pagamento de ${orcFmt(valor)} registrado! 💰`);
  await orcCarregarDados();
  orcRenderLista();
}

async function orcExcluirPagamento(pagId, orcId) {
  if (!confirm('Excluir este pagamento?')) return;
  const { error } = await db.from('pagamentos').delete().eq('id', pagId);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Pagamento excluído');
  await orcCarregarDados();
  orcRenderLista();
}

console.log('✅ orcamentos-fix.js carregado — módulo de Orçamentos ativo');
