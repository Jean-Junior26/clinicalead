// ============================================================
// CLINICALEAD — RESPONSÁVEIS: "Agendado por" / "Fechado por" (Fatia 2)
// Lista personalizável de responsáveis por clínica + seletor no
// agendamento (agendado_por). Prepara terreno para comissionamento.
// ============================================================

let RESP = { lista: [] };
let TAXAS = { faixas: [] };

// Carrega a lista de responsáveis da clínica ativa
async function carregarResponsaveis() {
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (!clinic) return [];
  try {
    const { data } = await db.from('responsaveis').select('*').eq('clinic_id', clinic.id).eq('ativo', true).order('nome');
    RESP.lista = data || [];
  } catch (e) { RESP.lista = []; }
  return RESP.lista;
}

// Monta as <option> de um select de responsáveis
function optionsResponsaveis(selecionado) {
  let html = '<option value="">— Selecione —</option>';
  RESP.lista.forEach(r => {
    html += `<option value="${r.nome}" ${selecionado === r.nome ? 'selected' : ''}>${r.nome}</option>`;
  });
  return html;
}

// ── Tela de gerenciar responsáveis ───────────────────────────
async function abrirGerenciarResponsaveis() {
  if (!document.getElementById('modalResponsaveis')) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'modalResponsaveis';
    ov.innerHTML = `
      <div class="modal" style="max-width:480px;width:96vw;">
        <div class="modal-header">
          <h3><i class="ti ti-users" style="margin-right:8px;color:var(--gold);"></i>Responsáveis</h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('modalResponsaveis')"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="max-height:72vh;overflow-y:auto;">
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
            Cadastre quem agenda e fecha na clínica (ex: Maria, João, Recepção, Comercial). Usado nos agendamentos e orçamentos.
          </p>
          <div style="display:flex;gap:8px;margin-bottom:16px;">
            <input class="form-input" id="novoRespNome" placeholder="Nome do responsável" style="flex:1;"/>
            <button class="btn btn-primary" onclick="adicionarResponsavel()"><i class="ti ti-plus"></i> Adicionar</button>
          </div>
          <div id="listaResponsaveis"></div>

          <div id="taxasCartaoBox" style="margin-top:18px;border-top:1px solid var(--border-subtle,#2a2a2a);padding-top:16px;">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px;"><i class="ti ti-credit-card" style="color:var(--gold);margin-right:6px;"></i>Taxas de cartão</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Opcional. Se preenchido, a comissão <b>percentual</b> é calculada sobre o valor <b>líquido</b> (venda − taxa do cartão). Vazio = calcula sobre o valor cheio (como antes).</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
              <div><label class="form-label" style="font-size:12px;">Débito (%)</label><input type="number" step="0.01" class="form-input" id="taxaDebito" placeholder="0" style="width:110px;"/></div>
              <div><label class="form-label" style="font-size:12px;">Crédito à vista (%)</label><input type="number" step="0.01" class="form-input" id="taxaCreditoVista" placeholder="0" style="width:150px;"/></div>
              <div><label class="form-label" style="font-size:12px;">Boleto (%)</label><input type="number" step="0.01" class="form-input" id="taxaBoletoPct" placeholder="0" style="width:110px;"/></div>
              <div><label class="form-label" style="font-size:12px;">Boleto taxa fixa (R$)</label><input type="number" step="0.01" class="form-input" id="taxaBoletoFixo" placeholder="0" style="width:150px;"/></div>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">Crédito parcelado (faixas de parcelas):</div>
            <div id="taxasFaixas"></div>
            <button class="btn btn-sm btn-ghost" onclick="taxaAddFaixa()" style="margin-top:6px;"><i class="ti ti-plus"></i> Adicionar faixa</button>
            <button class="btn btn-sm btn-primary" style="width:100%;margin-top:12px;" onclick="salvarTaxasCartao()"><i class="ti ti-device-floppy"></i> Salvar taxas de cartão</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }
  await renderListaResponsaveis();
  await renderTaxasCartao();
  openModal('modalResponsaveis');
}

async function renderListaResponsaveis() {
  await carregarResponsaveis();
  const cont = document.getElementById('listaResponsaveis');
  if (!cont) return;
  if (!RESP.lista.length) {
    cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Nenhum responsável cadastrado ainda.</div>';
    return;
  }
  cont.innerHTML = RESP.lista.map(r => {
    const aTipo = r.com_agendar_tipo || 'nenhum';
    const fTipo = r.com_fechar_tipo || 'nenhum';
    const cTipo = r.com_comparecer_tipo || 'nenhum';
    const selTipo = (val, atual) => `<option value="${val}" ${atual === val ? 'selected' : ''}>`;
    return `
    <div style="padding:14px;background:var(--bg-elevated);border-radius:10px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
        <span style="font-weight:600;font-size:14px;">${r.nome}</span>
        <button class="btn btn-sm btn-danger" onclick="removerResponsavel('${r.id}')"><i class="ti ti-trash"></i></button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
        <div style="background:var(--bg);border-radius:8px;padding:10px;">
          <div style="font-size:11px;color:var(--blue,#5B8DB8);text-transform:uppercase;font-weight:600;margin-bottom:6px;"><i class="ti ti-calendar-plus"></i> Por agendar</div>
          <select class="form-input" id="cat_${r.id}" style="font-size:12px;padding:5px 8px;margin-bottom:6px;">
            ${selTipo('nenhum', aTipo)}Não ganha</option>
            ${selTipo('fixo', aTipo)}Valor fixo (R$)</option>
            ${selTipo('percentual', aTipo)}Percentual (%)</option>
          </select>
          <input type="number" step="0.01" class="form-input" id="cav_${r.id}" value="${r.com_agendar_valor || ''}" placeholder="0" style="font-size:12px;padding:5px 8px;"/>
        </div>

        <div style="background:var(--bg);border-radius:8px;padding:10px;">
          <div style="font-size:11px;color:var(--green,#5BA877);text-transform:uppercase;font-weight:600;margin-bottom:6px;"><i class="ti ti-user-check"></i> Por comparecer</div>
          <select class="form-input" id="cct_${r.id}" style="font-size:12px;padding:5px 8px;margin-bottom:6px;">
            ${selTipo('nenhum', cTipo)}Não ganha</option>
            ${selTipo('fixo', cTipo)}Valor fixo (R$)</option>
            ${selTipo('percentual', cTipo)}Percentual (%)</option>
          </select>
          <input type="number" step="0.01" class="form-input" id="ccv_${r.id}" value="${r.com_comparecer_valor || ''}" placeholder="0" style="font-size:12px;padding:5px 8px;"/>
          <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Só p/ avaliação</div>
        </div>

        <div style="background:var(--bg);border-radius:8px;padding:10px;">
          <div style="font-size:11px;color:var(--gold);text-transform:uppercase;font-weight:600;margin-bottom:6px;"><i class="ti ti-trophy"></i> Por fechar</div>
          <select class="form-input" id="cft_${r.id}" style="font-size:12px;padding:5px 8px;margin-bottom:6px;">
            ${selTipo('nenhum', fTipo)}Não ganha</option>
            ${selTipo('fixo', fTipo)}Valor fixo (R$)</option>
            ${selTipo('percentual', fTipo)}Percentual (%)</option>
          </select>
          <input type="number" step="0.01" class="form-input" id="cfv_${r.id}" value="${r.com_fechar_valor || ''}" placeholder="0" style="font-size:12px;padding:5px 8px;"/>
        </div>
      </div>

      <button class="btn btn-sm btn-primary" style="width:100%;margin-top:10px;" onclick="salvarComissaoResp('${r.id}')"><i class="ti ti-device-floppy"></i> Salvar comissão</button>
    </div>`;
  }).join('');
}

// Salva a regra de comissão de um responsável
async function salvarComissaoResp(id) {
  const dados = {
    com_agendar_tipo: document.getElementById('cat_' + id).value,
    com_agendar_valor: parseFloat(document.getElementById('cav_' + id).value) || 0,
    com_comparecer_tipo: document.getElementById('cct_' + id).value,
    com_comparecer_valor: parseFloat(document.getElementById('ccv_' + id).value) || 0,
    com_fechar_tipo: document.getElementById('cft_' + id).value,
    com_fechar_valor: parseFloat(document.getElementById('cfv_' + id).value) || 0,
  };
  const { error } = await db.from('responsaveis').update(dados).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  // atualiza memória
  const r = RESP.lista.find(x => x.id === id);
  if (r) Object.assign(r, dados);
  toast('Comissão salva! 💰');
}

// ── Taxas de cartão da clínica (desconto na comissão) ────────
async function renderTaxasCartao() {
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (!clinic) return;
  let cfg = null;
  try {
    const { data } = await db.from('clinicas').select('taxas_cartao').eq('id', clinic.id).maybeSingle();
    cfg = (data && data.taxas_cartao) ? data.taxas_cartao : null;
  } catch (e) { cfg = null; }
  TAXAS.faixas = (cfg && Array.isArray(cfg.parcelado)) ? cfg.parcelado.slice() : [];
  const d = document.getElementById('taxaDebito'); if (d) d.value = (cfg && cfg.debito != null) ? cfg.debito : '';
  const cv = document.getElementById('taxaCreditoVista'); if (cv) cv.value = (cfg && cfg.credito_vista != null) ? cfg.credito_vista : '';
  const bp = document.getElementById('taxaBoletoPct'); if (bp) bp.value = (cfg && cfg.boleto_pct) ? cfg.boleto_pct : '';
  const bf = document.getElementById('taxaBoletoFixo'); if (bf) bf.value = (cfg && cfg.boleto_fixo) ? cfg.boleto_fixo : '';
  renderFaixasTaxa();
}

function renderFaixasTaxa() {
  const cont = document.getElementById('taxasFaixas');
  if (!cont) return;
  if (!TAXAS.faixas.length) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px 0;">Nenhuma faixa. Ex.: de 1 a 6 = 3,5% · de 7 a 12 = 5%.</div>';
    return;
  }
  cont.innerHTML = TAXAS.faixas.map((f, i) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;font-size:12px;flex-wrap:wrap;">
      <span>de</span><input type="number" min="1" class="form-input" style="width:60px;padding:4px 6px;" value="${f.de ?? ''}" onchange="taxaSetFaixa(${i},'de',this.value)"/>
      <span>a</span><input type="number" min="1" class="form-input" style="width:60px;padding:4px 6px;" value="${f.ate ?? ''}" onchange="taxaSetFaixa(${i},'ate',this.value)"/>
      <span>parcelas →</span><input type="number" step="0.01" class="form-input" style="width:80px;padding:4px 6px;" value="${f.taxa ?? ''}" onchange="taxaSetFaixa(${i},'taxa',this.value)"/><span>%</span>
      <button class="btn btn-sm btn-ghost btn-icon" onclick="taxaRemoveFaixa(${i})"><i class="ti ti-trash" style="color:var(--coral);"></i></button>
    </div>`).join('');
}

window.taxaSetFaixa = function (i, campo, val) { if (TAXAS.faixas[i]) TAXAS.faixas[i][campo] = (val === '' ? null : Number(val)); };
window.taxaAddFaixa = function () { TAXAS.faixas.push({ de: null, ate: null, taxa: null }); renderFaixasTaxa(); };
window.taxaRemoveFaixa = function (i) { TAXAS.faixas.splice(i, 1); renderFaixasTaxa(); };

window.salvarTaxasCartao = async function () {
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (!clinic) return;
  const debito = parseFloat(document.getElementById('taxaDebito').value);
  const creditoVista = parseFloat(document.getElementById('taxaCreditoVista').value);
  const boletoPct = parseFloat(document.getElementById('taxaBoletoPct')?.value);
  const boletoFixo = parseFloat(document.getElementById('taxaBoletoFixo')?.value);
  const parcelado = TAXAS.faixas
    .filter(f => f.de != null && f.ate != null && f.taxa != null)
    .map(f => ({ de: Number(f.de), ate: Number(f.ate), taxa: Number(f.taxa) }));
  const cfg = {
    debito: isNaN(debito) ? 0 : debito,
    credito_vista: isNaN(creditoVista) ? 0 : creditoVista,
    boleto_pct: isNaN(boletoPct) ? 0 : boletoPct,
    boleto_fixo: isNaN(boletoFixo) ? 0 : boletoFixo,
    parcelado,
  };
  const vazio = !cfg.debito && !cfg.credito_vista && !cfg.boleto_pct && !cfg.boleto_fixo && !parcelado.length;
  const { error } = await db.from('clinicas').update({ taxas_cartao: vazio ? null : cfg }).eq('id', clinic.id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  // atualiza o estado local da clínica, se existir
  if (typeof currentClinic === 'function') { const c = currentClinic(); if (c) c.taxas_cartao = vazio ? null : cfg; }
  toast('Taxas de cartão salvas! 💳');
};

async function adicionarResponsavel() {
  const nome = (document.getElementById('novoRespNome')?.value || '').trim();
  if (!nome) { toast('Digite o nome', 'error'); return; }
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (!clinic) return;
  const { error } = await db.from('responsaveis').insert({ clinic_id: clinic.id, nome });
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  document.getElementById('novoRespNome').value = '';
  toast('Responsável adicionado!');
  await renderListaResponsaveis();
}

async function removerResponsavel(id) {
  const { error } = await db.from('responsaveis').update({ ativo: false }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Responsável removido');
  await renderListaResponsaveis();
}

// ── Injeta o seletor "Agendado por" no modal de agendamento ──
async function injetarAgendadoPor() {
  const modal = document.getElementById('modalNovoAgendamento');
  if (!modal) return;
  // Acha o campo de observações pra inserir o seletor antes dele
  const obsField = document.getElementById('naObs');
  if (!obsField || document.getElementById('naAgendadoPor')) return; // já injetado

  await carregarResponsaveis();
  // Cria o grupo do seletor
  const grupo = document.createElement('div');
  grupo.className = 'form-group';
  grupo.id = 'grupoAgendadoPor';
  grupo.innerHTML = `
    <label class="form-label">Agendado por</label>
    <select class="form-input" id="naAgendadoPor">${optionsResponsaveis()}</select>`;
  // Insere antes do campo de observações (ou seu grupo pai)
  const obsGrupo = obsField.closest('.form-group') || obsField;
  obsGrupo.parentNode.insertBefore(grupo, obsGrupo);
}

// ── Intercepta abertura do agendamento e o salvamento ────────
(function () {
  // injeta o seletor quando abre o agendamento
  ['openNovoAgendamento', 'openNovoAgendamentoHora'].forEach(fn => {
    if (typeof window[fn] === 'function') {
      const _orig = window[fn];
      window[fn] = function (...args) {
        const r = _orig.apply(this, args);
        setTimeout(injetarAgendadoPor, 100);
        return r;
      };
    }
  });

  // intercepta o salvar pra incluir agendado_por
  function instalarSalvar() {
    if (typeof salvarNovoAgendamento !== 'function') return false;
    const _orig = salvarNovoAgendamento;
    salvarNovoAgendamento = async function (...args) {
      // Guarda o agendado_por escolhido pra aplicar após o insert
      const sel = document.getElementById('naAgendadoPor');
      RESP._ultimoAgendadoPor = sel ? sel.value : '';
      const r = await _orig.apply(this, args);
      // Após salvar, atualiza a última consulta criada com agendado_por
      if (RESP._ultimoAgendadoPor && typeof CAL !== 'undefined' && CAL.consultas?.length) {
        // pega a consulta mais recente (a recém-criada)
        const ultima = CAL.consultas[CAL.consultas.length - 1];
        if (ultima && !ultima.agendado_por) {
          await db.from('consultas').update({ agendado_por: RESP._ultimoAgendadoPor }).eq('id', ultima.id);
          ultima.agendado_por = RESP._ultimoAgendadoPor;
        }
      }
      return r;
    };
    return true;
  }
  if (!instalarSalvar()) {
    const iv = setInterval(() => { if (instalarSalvar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }

  console.log('✅ responsaveis-fix.js carregado (Fatia 2 - agendado por)');
})();

// ── Injeta o item "Responsáveis" no menu lateral ─────────────
(function () {
  function injetarMenu() {
    const menuAutomacoes = document.querySelector('.nav-item[data-page="automacoes"]');
    if (!menuAutomacoes || document.getElementById('navResponsaveis')) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navResponsaveis';
    btn.innerHTML = '<i class="ti ti-users"></i> Responsáveis';
    btn.onclick = function () { abrirGerenciarResponsaveis(); };
    // insere logo após Automações
    menuAutomacoes.parentNode.insertBefore(btn, menuAutomacoes.nextSibling);
  }
  injetarMenu();
  setTimeout(injetarMenu, 1500);
  setTimeout(injetarMenu, 4000);
})();
