// ============================================================
// CLINICALEAD — DATA DE NASCIMENTO NO CADASTRO DO LEAD
// Injeta o campo "Data de nascimento" (opcional) nos modais de
// novo lead e edição, salvando em leads.data_nascimento.
// Alimenta a tarefa de aniversário da Central. 🎂
// ============================================================

// ── Injeta os campos nos dois modais (uma vez, no load) ──────
(function () {
  function criarCampo(idInput, idAncora) {
    if (document.getElementById(idInput)) return;
    const ancora = document.getElementById(idAncora)?.closest('.form-group');
    if (!ancora) return;
    const g = document.createElement('div');
    g.className = 'form-group';
    g.innerHTML = `
      <label class="form-label">Data de nascimento <span style="color:var(--text-muted);font-weight:400;">(opcional — ativa o lembrete de aniversário 🎂)</span></label>
      <input class="form-input" type="date" id="${idInput}"/>`;
    ancora.insertAdjacentElement('afterend', g);
  }
  criarCampo('nlNascimento', 'nlPhone');
  criarCampo('editLeadNascimento', 'editLeadPhone');
})();

// ── Novo lead: salvar com a data ─────────────────────────────
saveNewLead = async function () {
  const nome = document.getElementById('nlName').value.trim();
  const procedimento = document.getElementById('nlProc').value;
  if (!nome || !procedimento) { toast('Preencha nome e procedimento', 'error'); return; }
  const newLead = {
    clinic_id: currentClinic().id,
    nome,
    telefone: document.getElementById('nlPhone').value,
    procedimento,
    origem: document.getElementById('nlSource').value,
    valor: parseFloat(document.getElementById('nlValue').value) || null,
    observacoes: document.getElementById('nlObs').value,
    data_nascimento: document.getElementById('nlNascimento')?.value || null,
    status: 'novo',
  };
  const { data, error } = await db.from('leads').insert(newLead).select().single();
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }
  STATE.leads.unshift(data);
  document.getElementById('navLeadsBadge').textContent = STATE.leads.length;
  closeModal('modalNewLead');
  renderPage(document.querySelector('.page.active')?.id?.replace('page-', ''));
  toast(`${nome} adicionado como novo lead! 🎉`);
};

// ── Edição: salvar com a data ────────────────────────────────
saveEditLead = async function () {
  const id = document.getElementById('editLeadId').value;
  const updates = {
    nome: document.getElementById('editLeadName').value,
    telefone: document.getElementById('editLeadPhone').value,
    procedimento: document.getElementById('editLeadProc').value,
    valor: parseFloat(document.getElementById('editLeadValue').value) || null,
    origem: document.getElementById('editLeadSource').value,
    status: document.getElementById('editLeadStatus').value,
    observacoes: document.getElementById('editLeadObs').value,
    data_nascimento: document.getElementById('editLeadNascimento')?.value || null,
  };
  const { error } = await db.from('leads').update(updates).eq('id', id);
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }
  const l = STATE.leads.find(x => x.id === id);
  if (l) Object.assign(l, updates);
  closeModal('modalEditLead');
  renderPage(document.querySelector('.page.active')?.id?.replace('page-', ''));
  toast('Lead atualizado!');
};

// ── Edição: preencher o campo ao abrir ───────────────────────
(function () {
  if (typeof openEditLead !== 'function') return;
  const _openEditLeadOriginal = openEditLead;
  openEditLead = function (id) {
    _openEditLeadOriginal(id);
    const lead = (STATE.leads || []).find(l => l.id === id);
    const campo = document.getElementById('editLeadNascimento');
    if (campo) campo.value = lead?.data_nascimento || '';
  };
})();

console.log('✅ nascimento-fix.js carregado — data de nascimento no cadastro ativa');
