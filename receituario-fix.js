// ============================================================
// CLINICALEAD — RECEITUÁRIO (Fase 1: receita comum)
// Cria, lista e imprime receitas de um paciente.
// ============================================================

(function () {
  'use strict';

  const REC = { leadId: null, lead: null, receitas: [] };

  async function carregarReceitas(leadId) {
    const clinic = currentClinic();
    if (!clinic) return [];
    const { data: receitas } = await db.from('receitas')
      .select('*')
      .eq('clinic_id', clinic.id)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    REC.receitas = receitas || [];
    if (REC.receitas.length) {
      const ids = REC.receitas.map(r => r.id);
      const { data: itens } = await db.from('receita_itens')
        .select('*').in('receita_id', ids).order('ordem');
      REC.receitas.forEach(r => { r.itens = (itens || []).filter(i => i.receita_id === r.id); });
    }
    return REC.receitas;
  }

  window.abrirReceitas = async function (leadId) {
    REC.leadId = leadId;
    REC.lead = (STATE.leads || []).find(l => l.id === leadId) || {};
    if (!document.getElementById('modalReceitas')) {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.id = 'modalReceitas';
      ov.innerHTML = `
        <div class="modal" style="max-width:620px;width:96vw;">
          <div class="modal-header">
            <h3 id="recTitulo"><i class="ti ti-prescription" style="margin-right:8px;color:var(--gold);"></i>Receitas</h3>
            <button class="btn btn-ghost btn-icon" onclick="closeModal('modalReceitas')"><i class="ti ti-x"></i></button>
          </div>
          <div class="modal-body" id="recBody" style="max-height:74vh;overflow-y:auto;"></div>
        </div>`;
      document.body.appendChild(ov);
    }
    document.getElementById('recTitulo').innerHTML = `<i class="ti ti-prescription" style="margin-right:8px;color:var(--gold);"></i>Receitas — ${REC.lead.nome || 'Paciente'}`;
    openModal('modalReceitas');
    document.getElementById('recBody').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Carregando…</div>';
    await carregarReceitas(leadId);
    renderReceitas();
  };

  function renderReceitas() {
    const body = document.getElementById('recBody');
    if (!body) return;
    const lista = REC.receitas.map(r => {
      const itensTxt = (r.itens || []).map(i => i.medicamento).join(', ');
      const data = new Date(r.created_at).toLocaleDateString('pt-BR');
      return `
        <div class="card" style="padding:14px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;">Receita de ${data}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${itensTxt || 'Sem medicamentos'}</div>
            </div>
            <div style="display:flex;gap:4px;">
              <button class="btn btn-sm" onclick="imprimirReceita('${r.id}')" title="Imprimir" style="background:var(--gold,#C9A84C);color:#1a1a1a;"><i class="ti ti-printer"></i></button>
              <button class="btn btn-sm btn-ghost btn-icon" onclick="excluirReceita('${r.id}')" title="Excluir"><i class="ti ti-trash" style="color:var(--coral);"></i></button>
            </div>
          </div>
        </div>`;
    }).join('');
    body.innerHTML = `
      <button class="btn btn-primary" onclick="novaReceita()" style="width:100%;margin-bottom:16px;">
        <i class="ti ti-plus"></i> Nova receita
      </button>
      ${lista || '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Nenhuma receita ainda.</div>'}`;
  }

  window.novaReceita = function () {
    const body = document.getElementById('recBody');
    if (!body) return;
    body.innerHTML = `
      <div style="margin-bottom:14px;">
        <button class="btn btn-sm btn-ghost" onclick="renderReceitasVoltar()"><i class="ti ti-arrow-left"></i> Voltar</button>
      </div>
      <div id="recItens"></div>
      <button class="btn" onclick="recAddItem()" style="width:100%;margin:8px 0 16px;border:1px dashed var(--border-subtle,#444);">
        <i class="ti ti-plus"></i> Adicionar medicamento
      </button>
      <div style="margin-bottom:14px;">
        <label class="form-label" style="font-size:12px;color:var(--text-muted);">Orientações gerais (opcional)</label>
        <textarea class="form-input" id="recObs" rows="2" placeholder="Ex: Tomar após as refeições. Retornar se houver dor." style="width:100%;resize:vertical;"></textarea>
      </div>
      <button class="btn btn-primary" onclick="salvarReceita()" style="width:100%;">
        <i class="ti ti-device-floppy"></i> Salvar receita
      </button>
      <div id="recMsg" style="font-size:12px;color:var(--coral);min-height:14px;margin-top:8px;"></div>`;
    recAddItem();
  };

  window.renderReceitasVoltar = function () { renderReceitas(); };

  let recItemSeq = 0;
  window.recAddItem = function () {
    const cont = document.getElementById('recItens');
    if (!cont) return;
    const id = 'ri_' + (recItemSeq++);
    const div = document.createElement('div');
    div.className = 'rec-item';
    div.id = id;
    div.style.cssText = 'background:var(--bg-elevated);border-radius:10px;padding:12px;margin-bottom:10px;';
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Medicamento</span>
        <button class="btn btn-sm btn-ghost btn-icon" onclick="document.getElementById('${id}').remove()" title="Remover"><i class="ti ti-x"></i></button>
      </div>
      <input class="form-input rec-med" placeholder="Ex: Amoxicilina 500mg" style="width:100%;margin-bottom:8px;"/>
      <input class="form-input rec-pos" placeholder="Posologia — ex: 1 cápsula de 8/8h por 7 dias" style="width:100%;margin-bottom:8px;"/>
      <input class="form-input rec-qtd" placeholder="Quantidade — ex: 21 cápsulas" style="width:100%;"/>`;
    cont.appendChild(div);
  };

  window.salvarReceita = async function () {
    const clinic = currentClinic();
    const msg = document.getElementById('recMsg');
    const setMsg = (t) => { if (msg) msg.textContent = t || ''; };
    const itensDom = document.querySelectorAll('#recItens .rec-item');
    const itens = [];
    itensDom.forEach((d, idx) => {
      const med = d.querySelector('.rec-med').value.trim();
      if (!med) return;
      itens.push({
        medicamento: med,
        posologia: d.querySelector('.rec-pos').value.trim(),
        quantidade: d.querySelector('.rec-qtd').value.trim(),
        ordem: idx,
      });
    });
    if (!itens.length) { setMsg('Adicione pelo menos um medicamento.'); return; }
    const observacoes = (document.getElementById('recObs')?.value || '').trim();
    try {
      const { data: rec, error } = await db.from('receitas').insert({
        clinic_id: clinic.id, lead_id: REC.leadId, tipo: 'comum', observacoes,
      }).select().single();
      if (error) throw error;
      const itensInsert = itens.map(i => ({ ...i, receita_id: rec.id }));
      const { error: errItens } = await db.from('receita_itens').insert(itensInsert);
      if (errItens) throw errItens;
      if (typeof toast === 'function') toast('Receita salva! 💊');
      await carregarReceitas(REC.leadId);
      renderReceitas();
    } catch (e) {
      setMsg('Erro ao salvar: ' + (e.message || 'tente de novo'));
      console.error('[receita] erro:', e);
    }
  };

  window.excluirReceita = async function (id) {
    if (!confirm('Excluir esta receita?')) return;
    try {
      await db.from('receitas').delete().eq('id', id);
      if (typeof toast === 'function') toast('Receita excluída');
      await carregarReceitas(REC.leadId);
      renderReceitas();
    } catch (e) {
      if (typeof toast === 'function') toast('Erro ao excluir', 'error');
    }
  };

  window.imprimirReceita = function (id) {
    const rec = REC.receitas.find(r => r.id === id);
    if (!rec) return;
    const lead = REC.lead || {};
    const clinic = currentClinic() || {};
    const hoje = new Date(rec.created_at).toLocaleDateString('pt-BR');

    const itensHtml = (rec.itens || []).map((i, idx) => `
      <div style="margin-bottom:9px;padding-bottom:7px;border-bottom:1px solid #eee;">
        <div style="font-size:13px;font-weight:600;">${idx + 1}. ${i.medicamento}${i.quantidade ? ` <span style="font-weight:400;color:#666;">— ${i.quantidade}</span>` : ''}</div>
        ${i.posologia ? `<div style="font-size:12px;color:#444;margin-top:2px;">${i.posologia}</div>` : ''}
      </div>`).join('') || '<div style="color:#999;font-size:12px;">Nenhum medicamento.</div>';

    // Uma via (idêntica) — duas saem lado a lado em paisagem
    const via = (rotulo, corte) => `
      <div class="via" style="${corte ? 'border-left:2px dashed #bbb;' : ''}">
        <div class="via-rotulo">${rotulo}</div>
        <div class="cab">
          ${clinic.logo_url ? `<img src="${clinic.logo_url}" style="max-width:54px;max-height:54px;object-fit:contain;">` : ''}
          <div>
            <div class="clinica-nome">${clinic.nome || 'Clínica'}</div>
            <div class="clinica-info">${clinic.endereco ? clinic.endereco + '<br>' : ''}${clinic.telefone ? 'Tel: ' + clinic.telefone : ''}</div>
          </div>
        </div>
        <div class="titulo-doc">Receituário</div>
        <div class="paciente"><strong>Paciente:</strong> ${lead.nome || '—'} &nbsp;&nbsp; <strong>Data:</strong> ${hoje}</div>
        <div class="itens">${itensHtml}</div>
        ${rec.observacoes ? `<div class="obs"><strong>Orientações:</strong> ${rec.observacoes}</div>` : ''}
        <div class="assinatura"><div class="assinatura-linha">${clinic.responsavel || clinic.nome || 'Responsável'}</div></div>
      </div>`;

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Receita - ${lead.nome || ''}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing:border-box;margin:0;padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif;color:#222;padding:16px; }
  .folha { display:flex;align-items:stretch; }
  .via { width:50%;padding:0 18px; }
  .via-rotulo { text-align:center;font-size:10px;letter-spacing:1.5px;color:#999;text-transform:uppercase;margin-bottom:10px; }
  .cab { display:flex;align-items:center;gap:10px;border-bottom:2px solid #C9A84C;padding-bottom:10px;margin-bottom:12px; }
  .clinica-nome { font-size:17px;font-weight:700;color:#C9A84C;line-height:1.1; }
  .clinica-info { font-size:10px;color:#666;margin-top:3px;line-height:1.4; }
  .titulo-doc { text-align:center;font-size:14px;font-weight:700;letter-spacing:2px;color:#444;margin-bottom:12px;text-transform:uppercase; }
  .paciente { font-size:12px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px dashed #ccc; }
  .itens { min-height:120px; }
  .obs { margin-top:10px;padding:10px;background:#faf6ec;border-radius:6px;font-size:11px;color:#555; }
  .assinatura { margin-top:42px;text-align:center; }
  .assinatura-linha { border-top:1px solid #333;width:220px;margin:0 auto;padding-top:5px;font-size:11px;color:#666; }
  @media print { body { padding:0; } .no-print { display:none; } }
</style></head><body>
  <div class="folha">
    ${via('Via do Paciente', false)}
    ${via('Via da Clínica', true)}
  </div>
  <div class="no-print" style="text-align:center;margin-top:20px;">
    <button onclick="window.print()" style="padding:12px 24px;background:#C9A84C;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:600;">🖨️ Imprimir / Salvar PDF</button>
  </div>
</body></html>`;
    const win = window.open('', '_blank');
    if (!win) { if (typeof toast === 'function') toast('Permita pop-ups para imprimir', 'error'); return; }
    win.document.write(html);
    win.document.close();
  };

  function injetarBotaoReceitas() {
    const modal = document.getElementById('modalLead');
    if (!modal || !modal.classList.contains('open')) return;
    const body = document.getElementById('modalLeadBody');
    if (!body || document.getElementById('btnReceitasLead')) return;
    const editBtn = body.querySelector('button[onclick*="openEditLead"]');
    if (!editBtn) return;
    const m = editBtn.getAttribute('onclick').match(/openEditLead\('([^']+)'\)/);
    if (!m) return;
    const leadId = m[1];
    const btnRow = editBtn.parentElement;
    if (!btnRow) return;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.id = 'btnReceitasLead';
    btn.style.cssText = 'flex:1;';
    btn.innerHTML = '<i class="ti ti-prescription"></i> Receitas';
    btn.onclick = () => { closeModal('modalLead'); abrirReceitas(leadId); };
    btnRow.appendChild(btn);
  }

  setInterval(() => {
    const m = document.getElementById('modalLead');
    if (m && m.classList.contains('open')) injetarBotaoReceitas();
  }, 600);

  console.log('✅ receituario-fix.js carregado');
})();
