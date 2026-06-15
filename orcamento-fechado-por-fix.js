// ============================================================
// CLINICALEAD — "FECHADO POR" NO ORÇAMENTO (Fatia 2 - parte 2)
// Quando um item do orçamento é aprovado e o orçamento ainda não
// tem "fechado_por", pergunta quem fechou (lista de responsáveis)
// e salva em orcamentos.fechado_por. Base para comissionamento.
// ============================================================

(function () {
  function instalar() {
    if (typeof orcToggleAprovado !== 'function') return false;

    const _orig = orcToggleAprovado;
    orcToggleAprovado = async function (orcId, itemId, aprovado) {
      // Executa o comportamento original primeiro (aprova, fecha lead, etc)
      const r = await _orig.apply(this, arguments);

      // Só age ao APROVAR (não ao desmarcar)
      if (aprovado) {
        try {
          // Verifica se o orçamento já tem fechado_por
          const { data: orc } = await db.from('orcamentos').select('fechado_por').eq('id', orcId).single();
          if (orc && !orc.fechado_por) {
            await perguntarFechadoPor(orcId);
          }
        } catch (e) { /* silencioso */ }
      }
      return r;
    };

    console.log('✅ orcamento-fechado-por-fix.js carregado (Fatia 2 - fechado por)');
    return true;
  }
  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();

// Modal pra escolher quem fechou
async function perguntarFechadoPor(orcId) {
  // Carrega responsáveis (usa a função do responsaveis-fix se existir)
  let lista = [];
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (clinic) {
    try {
      const { data } = await db.from('responsaveis').select('*').eq('clinic_id', clinic.id).eq('ativo', true).order('nome');
      lista = data || [];
    } catch (e) {}
  }

  if (!document.getElementById('modalFechadoPor')) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'modalFechadoPor';
    ov.innerHTML = `
      <div class="modal" style="max-width:420px;width:94vw;">
        <div class="modal-header">
          <h3><i class="ti ti-trophy" style="margin-right:8px;color:var(--gold);"></i>Quem fechou?</h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('modalFechadoPor')"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
            Registre quem fechou esta venda (para controle de comissão).
          </p>
          <input type="hidden" id="fechadoOrcId"/>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Fechado por</label>
            <select class="form-input" id="fechadoPorSel"></select>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" onclick="closeModal('modalFechadoPor')">Pular</button>
          <button class="btn btn-primary" onclick="salvarFechadoPor()"><i class="ti ti-check"></i> Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }

  document.getElementById('fechadoOrcId').value = orcId;
  const sel = document.getElementById('fechadoPorSel');
  sel.innerHTML = '<option value="">— Selecione —</option>' +
    lista.map(r => `<option value="${r.nome}">${r.nome}</option>`).join('');

  // Se não há responsáveis cadastrados, avisa
  if (!lista.length) {
    sel.innerHTML = '<option value="">Cadastre responsáveis no menu primeiro</option>';
  }

  openModal('modalFechadoPor');
}

async function salvarFechadoPor() {
  const orcId = document.getElementById('fechadoOrcId').value;
  const nome = document.getElementById('fechadoPorSel').value;
  if (!nome) { closeModal('modalFechadoPor'); return; }
  const { error } = await db.from('orcamentos').update({ fechado_por: nome }).eq('id', orcId);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  // Atualiza memória se o ORC estiver carregado
  if (typeof ORC !== 'undefined' && ORC.orcamentos) {
    const o = ORC.orcamentos.find(x => x.id === orcId);
    if (o) o.fechado_por = nome;
  }
  toast('Fechamento registrado: ' + nome + ' 🏆');
  closeModal('modalFechadoPor');
}
