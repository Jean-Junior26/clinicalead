// ============================================================
// CLINICALEAD — ORIGENS DE LEAD PERSONALIZÁVEIS (tags)
// Lista gerenciável de origens por clínica. Cada clínica nasce
// com as padrão (WhatsApp, Instagram, Google, Indicação,
// Facebook, Site) e pode adicionar/remover (ex: "Parceria X").
// Os selects de origem do lead passam a usar essa lista.
// ============================================================

let ORIGENS = { lista: [] };
const ORIGENS_PADRAO = ['WhatsApp', 'Instagram', 'Google', 'Indicação', 'Facebook', 'Site'];

// Carrega as origens da clínica; semeia as padrão na 1ª vez
async function carregarOrigens() {
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (!clinic) return [];
  try {
    let { data } = await db.from('origens').select('*').eq('clinic_id', clinic.id).eq('ativo', true).order('nome');
    // Semeia padrões se a clínica ainda não tem nenhuma
    if (!data || !data.length) {
      const novas = ORIGENS_PADRAO.map(nome => ({ clinic_id: clinic.id, nome }));
      await db.from('origens').insert(novas);
      const res = await db.from('origens').select('*').eq('clinic_id', clinic.id).eq('ativo', true).order('nome');
      data = res.data || [];
    }
    ORIGENS.lista = data || [];
  } catch (e) { ORIGENS.lista = ORIGENS_PADRAO.map(n => ({ nome: n })); }
  return ORIGENS.lista;
}

// Popula um <select> de origem com a lista (preservando o valor atual)
function popularSelectOrigem(selectId, valorAtual) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const atual = valorAtual || sel.value || '';
  sel.innerHTML = ORIGENS.lista.map(o => `<option ${o.nome === atual ? 'selected' : ''}>${o.nome}</option>`).join('');
  // se o valor atual não está na lista (origem antiga), adiciona pra não perder
  if (atual && !ORIGENS.lista.some(o => o.nome === atual)) {
    sel.insertAdjacentHTML('afterbegin', `<option selected>${atual}</option>`);
  }
}

// ── Tela de gerenciar origens ────────────────────────────────
async function abrirGerenciarOrigens() {
  if (!document.getElementById('modalOrigens')) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'modalOrigens';
    ov.innerHTML = `
      <div class="modal" style="max-width:460px;width:96vw;">
        <div class="modal-header">
          <h3><i class="ti ti-tag" style="margin-right:8px;color:var(--gold);"></i>Origens de lead</h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('modalOrigens')"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="max-height:72vh;overflow-y:auto;">
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
            De onde seus leads chegam. Adicione parcerias e canais novos para mensurar (ex: "Parceria Mercado X").
          </p>
          <div style="display:flex;gap:8px;margin-bottom:16px;">
            <input class="form-input" id="novaOrigemNome" placeholder="Nova origem (ex: Parceria X)" style="flex:1;"/>
            <button class="btn btn-primary" onclick="adicionarOrigem()"><i class="ti ti-plus"></i> Adicionar</button>
          </div>
          <div id="listaOrigens"></div>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }
  await renderListaOrigens();
  openModal('modalOrigens');
}

async function renderListaOrigens() {
  await carregarOrigens();
  const cont = document.getElementById('listaOrigens');
  if (!cont) return;
  if (!ORIGENS.lista.length) {
    cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Nenhuma origem cadastrada.</div>';
    return;
  }
  cont.innerHTML = ORIGENS.lista.map(o => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:var(--bg-elevated);border-radius:10px;margin-bottom:8px;">
      <span style="font-weight:500;"><i class="ti ti-tag" style="color:var(--gold);margin-right:6px;font-size:13px;"></i>${o.nome}</span>
      <button class="btn btn-sm btn-danger" onclick="removerOrigem('${o.id}')"><i class="ti ti-trash"></i></button>
    </div>`).join('');
}

async function adicionarOrigem() {
  const nome = (document.getElementById('novaOrigemNome')?.value || '').trim();
  if (!nome) { toast('Digite o nome da origem', 'error'); return; }
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (!clinic) return;
  // evita duplicar
  if (ORIGENS.lista.some(o => o.nome.toLowerCase() === nome.toLowerCase())) {
    toast('Essa origem já existe', 'error'); return;
  }
  const { error } = await db.from('origens').insert({ clinic_id: clinic.id, nome });
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  document.getElementById('novaOrigemNome').value = '';
  toast('Origem adicionada!');
  await renderListaOrigens();
}

async function removerOrigem(id) {
  const { error } = await db.from('origens').update({ ativo: false }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Origem removida');
  await renderListaOrigens();
}

// ── Faz os selects de origem usarem a lista da clínica ───────
(function () {
  // Ao abrir "Novo lead"
  if (typeof openNewLead === 'function') {
    const _orig = openNewLead;
    openNewLead = function (...args) {
      const r = _orig.apply(this, args);
      carregarOrigens().then(() => popularSelectOrigem('nlSource'));
      return r;
    };
  }
  // Ao abrir "Editar lead"
  if (typeof openEditLead === 'function') {
    const _orig = openEditLead;
    openEditLead = function (id, ...rest) {
      const r = _orig.apply(this, [id, ...rest]);
      const lead = (STATE.leads || []).find(l => l.id === id);
      carregarOrigens().then(() => popularSelectOrigem('editLeadSource', lead?.origem));
      return r;
    };
  }

  // Injeta item "Origens" no menu (perto de Responsáveis)
  function injetarMenu() {
    const navResp = document.getElementById('navResponsaveis');
    const ancora = navResp || document.querySelector('.nav-item[data-page="automacoes"]');
    if (!ancora || document.getElementById('navOrigens')) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navOrigens';
    btn.innerHTML = '<i class="ti ti-tag"></i> Origens';
    btn.onclick = function () { abrirGerenciarOrigens(); };
    ancora.parentNode.insertBefore(btn, ancora.nextSibling);
  }
  injetarMenu();
  setTimeout(injetarMenu, 1500);
  setTimeout(injetarMenu, 4000);

  console.log('✅ origens-fix.js carregado (origens personalizáveis)');
})();
