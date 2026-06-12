// ============================================================
// CLINICALEAD — CATÁLOGO DE PROCEDIMENTOS
// Tabela de preços da clínica: lista padrão pré-carregável,
// edição inline (clica, digita, salva sozinho), novo procedimento,
// ativar/desativar e excluir.
// ============================================================

let PROC = { lista: [], carregando: false };

const PROCEDIMENTOS_PADRAO = [
  'Avaliação', 'Limpeza (Profilaxia)', 'Restauração', 'Tratamento de Canal',
  'Extração', 'Extração de Siso', 'Clareamento', 'Implante',
  'Coroa / Prótese', 'Faceta / Lente de Contato', 'Aparelho (Instalação)',
  'Manutenção de Aparelho', 'Radiografia / Raio-X', 'Gengivoplastia',
  'Harmonização Facial', 'Atendimento de Urgência'
];

// ── Carregar do banco ────────────────────────────────────────
async function loadProcedimentos() {
  const clinic = currentClinic();
  if (!clinic) return;
  const { data } = await db
    .from('procedimentos')
    .select('*')
    .eq('clinic_id', clinic.id)
    .order('nome');
  PROC.lista = data || [];
}

// ── Carregar a lista padrão (primeira vez) ───────────────────
async function carregarProcedimentosPadrao() {
  const clinic = currentClinic();
  if (!clinic) return;
  PROC.carregando = true;
  renderProcedimentos();

  const linhas = PROCEDIMENTOS_PADRAO.map(nome => ({
    clinic_id: clinic.id, nome, valor: 0, ativo: true
  }));
  const { error } = await db.from('procedimentos').insert(linhas);
  PROC.carregando = false;
  if (error) { toast('Erro ao carregar lista: ' + error.message, 'error'); return; }
  toast('Lista padrão carregada! Agora é só preencher os valores ✓');
  await loadProcedimentos();
  renderProcedimentos();
}

// ── Adicionar novo procedimento ──────────────────────────────
async function adicionarProcedimento() {
  const clinic = currentClinic();
  if (!clinic) return;
  const nomeEl = document.getElementById('novoProcNome');
  const valorEl = document.getElementById('novoProcValor');
  const nome = (nomeEl?.value || '').trim();
  const valor = parseFloat(String(valorEl?.value || '0').replace(',', '.')) || 0;
  if (!nome) { toast('Digite o nome do procedimento', 'error'); return; }

  const { error } = await db.from('procedimentos').insert({
    clinic_id: clinic.id, nome, valor, ativo: true
  });
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast(`"${nome}" adicionado! ✓`);
  nomeEl.value = '';
  valorEl.value = '';
  await loadProcedimentos();
  renderProcedimentos();
  document.getElementById('novoProcNome')?.focus();
}

// ── Salvar edição inline (nome ou valor) ─────────────────────
async function salvarProcCampo(id, campo, el) {
  let valor = el.value;
  if (campo === 'valor') {
    valor = parseFloat(String(valor).replace(/\./g, '').replace(',', '.')) || 0;
  } else {
    valor = String(valor).trim();
    if (!valor) { toast('O nome não pode ficar vazio', 'error'); renderProcedimentos(); return; }
  }
  const { error } = await db.from('procedimentos').update({ [campo]: valor }).eq('id', id);
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }
  const p = PROC.lista.find(x => x.id === id);
  if (p) p[campo] = valor;
  el.style.borderColor = 'var(--gold)';
  setTimeout(() => { el.style.borderColor = ''; }, 600);
}

// ── Ativar/desativar ─────────────────────────────────────────
async function toggleProcAtivo(id) {
  const p = PROC.lista.find(x => x.id === id);
  if (!p) return;
  const novo = !p.ativo;
  const { error } = await db.from('procedimentos').update({ ativo: novo }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  p.ativo = novo;
  toast(novo ? 'Procedimento ativado ✓' : 'Procedimento desativado');
  renderProcedimentos();
}

// ── Excluir ──────────────────────────────────────────────────
async function excluirProcedimento(id) {
  const p = PROC.lista.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Excluir "${p.nome}" do catálogo?\n\n(Orçamentos antigos que usaram este procedimento NÃO serão afetados.)`)) return;
  const { error } = await db.from('procedimentos').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast(`"${p.nome}" excluído`);
  PROC.lista = PROC.lista.filter(x => x.id !== id);
  renderProcedimentos();
}

// ── Renderização ─────────────────────────────────────────────
async function renderProcedimentos(skipLoad) {
  const page = document.getElementById('page-procedimentos');
  if (!page) return;

  if (!skipLoad && !PROC.carregando) {
    page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);">Carregando catálogo...</div>';
    await loadProcedimentos();
  }

  const ativos = PROC.lista.filter(p => p.ativo).length;

  page.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Procedimentos</h2>
        <p>${PROC.lista.length} no catálogo · ${ativos} ativo${ativos !== 1 ? 's' : ''} — clique no nome ou valor para editar</p>
      </div>
    </div>

    <!-- Adicionar novo -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <i class="ti ti-plus" style="color:var(--gold);font-size:18px;"></i>
        <input type="text" id="novoProcNome" class="form-input" placeholder="Nome do procedimento (ex: Bichectomia)" style="flex:1;min-width:220px;" onkeydown="if(event.key==='Enter')adicionarProcedimento()"/>
        <input type="text" id="novoProcValor" class="form-input" placeholder="Valor (R$)" style="width:130px;" onkeydown="if(event.key==='Enter')adicionarProcedimento()"/>
        <button class="btn btn-primary" onclick="adicionarProcedimento()"><i class="ti ti-plus"></i> Adicionar</button>
      </div>
    </div>

    ${!PROC.lista.length && !PROC.carregando ? `
      <div class="card">
        <div class="card-body" style="text-align:center;padding:40px 20px;">
          <div style="font-size:34px;margin-bottom:10px;">🦷</div>
          <div style="font-size:15px;font-weight:600;margin-bottom:6px;">Catálogo vazio</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:18px;">Comece com a lista dos procedimentos mais comuns da odontologia —<br>depois é só clicar nos valores e preencher os preços da clínica.</div>
          <button class="btn btn-primary" onclick="carregarProcedimentosPadrao()"><i class="ti ti-sparkles"></i> Carregar lista padrão (${PROCEDIMENTOS_PADRAO.length} procedimentos)</button>
        </div>
      </div>` : ''}

    ${PROC.carregando ? '<div style="padding:30px;text-align:center;color:var(--text-secondary);">Carregando lista padrão...</div>' : ''}

    ${PROC.lista.length ? `
      <div class="card">
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead style="background:var(--bg-elevated);">
              <tr>
                <th style="padding:10px 16px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--gold-dim);text-align:left;border-bottom:1px solid var(--border);">Procedimento</th>
                <th style="padding:10px 16px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--gold-dim);text-align:left;border-bottom:1px solid var(--border);width:170px;">Valor (R$)</th>
                <th style="padding:10px 16px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--gold-dim);text-align:left;border-bottom:1px solid var(--border);width:110px;">Ativo</th>
                <th style="padding:10px 16px;border-bottom:1px solid var(--border);width:60px;"></th>
              </tr>
            </thead>
            <tbody>
              ${PROC.lista.map(p => `
                <tr style="${!p.ativo ? 'opacity:0.45;' : ''}">
                  <td style="padding:8px 16px;border-bottom:1px solid var(--border-subtle);">
                    <input type="text" value="${String(p.nome).replace(/"/g, '&quot;')}" class="form-input" style="background:transparent;border:1px solid transparent;width:100%;font-size:13px;padding:6px 8px;transition:border-color 0.3s;"
                      onfocus="this.style.borderColor='var(--border)'"
                      onchange="salvarProcCampo('${p.id}','nome',this)"/>
                  </td>
                  <td style="padding:8px 16px;border-bottom:1px solid var(--border-subtle);">
                    <input type="text" value="${Number(p.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}" class="form-input" style="background:transparent;border:1px solid transparent;width:130px;font-size:13px;padding:6px 8px;font-family:var(--mono);color:var(--gold);transition:border-color 0.3s;"
                      onfocus="this.style.borderColor='var(--border)';this.select()"
                      onchange="salvarProcCampo('${p.id}','valor',this)"/>
                  </td>
                  <td style="padding:8px 16px;border-bottom:1px solid var(--border-subtle);">
                    <button class="btn btn-sm" onclick="toggleProcAtivo('${p.id}')" style="${p.ativo ? 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);' : ''}">
                      ${p.ativo ? '<i class="ti ti-check"></i> Sim' : 'Não'}
                    </button>
                  </td>
                  <td style="padding:8px 16px;border-bottom:1px solid var(--border-subtle);">
                    <button class="btn btn-sm btn-ghost btn-icon" title="Excluir" onclick="excluirProcedimento('${p.id}')"><i class="ti ti-trash" style="color:var(--coral);"></i></button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
  `;
}

// ── Engata no roteador de páginas ────────────────────────────
(function () {
  if (typeof renderPage !== 'function') {
    console.error('[procedimentos] renderPage não encontrado');
    return;
  }
  const _renderPageOriginal = renderPage;
  renderPage = function (id) {
    if (id === 'procedimentos') { renderProcedimentos(); return; }
    return _renderPageOriginal(id);
  };
})();

console.log('✅ procedimentos-fix.js carregado — catálogo de Procedimentos ativo');
