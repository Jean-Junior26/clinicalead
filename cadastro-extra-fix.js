// ============================================================
// CLINICALEAD — CAMPOS EXTRAS DO CADASTRO (CPF, Endereço, Responsável financeiro)
// Funciona em DOIS lugares:
//   1) Ficha de edição do paciente (#modalEditLead, aba "Dados")  -> autosave por campo
//   2) Novo lead (#modalNewLead)                                  -> grava junto ao criar
// Regras:
//   - CPF (máscara + validação de dígito) e Endereço.
//   - "Responsável financeiro" aparece AUTOMÁTICO quando o paciente
//     é menor de 18 (pela data de nascimento). No novo lead, como não
//     havia campo de nascimento, ele é adicionado aqui também.
//   - CPF e telefones são guardados só com dígitos (máscara é visual).
// ============================================================

(function () {
  'use strict';

  const CE = { leadId: null };      // lead aberto na ficha de edição

  // ── helpers ──────────────────────────────────────────────
  const soDig = (v) => String(v || '').replace(/\D/g, '');

  function ehCPF(v) {
    const d = soDig(v);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (let t = 9; t < 11; t++) {
      let s = 0;
      for (let i = 0; i < t; i++) s += parseInt(d[i], 10) * ((t + 1) - i);
      let dig = (s * 10) % 11; if (dig === 10) dig = 0;
      if (dig !== parseInt(d[t], 10)) return false;
    }
    return true;
  }

  function mascararCPF(v) {
    const d = soDig(v).slice(0, 11);
    if (d.length > 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
    if (d.length > 6) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    if (d.length > 3) return `${d.slice(0,3)}.${d.slice(3)}`;
    return d;
  }

  function mascararTel(v) {
    const d = soDig(v).slice(0, 11);
    const ddd = d.slice(0, 2), resto = d.slice(2);
    if (!d.length) return '';
    if (d.length <= 2) return `(${ddd}`;
    if (resto.length <= 4) return `(${ddd}) ${resto}`;
    if (d.length <= 10) return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
    return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
  }

  function mascararCEP(v) {
    const d = soDig(v).slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  }

  // busca o endereço pelo CEP (ViaCEP, grátis) e preenche o campo Endereço
  async function buscarCEP(p, onDepois) {
    const cepEl = document.getElementById(p + 'Cep');
    const endEl = document.getElementById(p + 'Endereco');
    const hint = document.getElementById(p + 'CepHint');
    if (!cepEl) return;
    const cep = soDig(cepEl.value);
    if (cep.length !== 8) return;
    if (cepEl.dataset.last === cep) return;     // evita refazer a mesma busca
    cepEl.dataset.last = cep;
    const setHint = (t, cor) => { if (hint) { hint.style.color = cor || 'var(--text-muted)'; hint.textContent = t || ''; } };
    setHint('Buscando endereço…');
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await resp.json();
      if (d.erro) { setHint('CEP não encontrado', 'var(--coral)'); return; }
      const cidadeUf = (d.localidade && d.uf) ? `${d.localidade}/${d.uf}` : (d.localidade || '');
      const txt = [d.logradouro, d.bairro, cidadeUf].filter(Boolean).join(', ');
      if (endEl && txt) endEl.value = txt;
      setHint('Endereço preenchido — complete o número');
      if (typeof onDepois === 'function') onDepois();
    } catch (e) {
      setHint('Não consegui buscar o CEP', 'var(--coral)');
    }
  }

  function idadeAnos(dataISO) {
    if (!dataISO) return null;
    const m = String(dataISO).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const nasc = new Date(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(nasc.getTime())) return null;
    const hoje = new Date();
    let a = hoje.getFullYear() - nasc.getFullYear();
    const mm = hoje.getMonth() - nasc.getMonth();
    if (mm < 0 || (mm === 0 && hoje.getDate() < nasc.getDate())) a--;
    return a;
  }

  function validarCpfHint(el, hintId) {
    const h = document.getElementById(hintId);
    if (!h) return;
    const d = soDig(el.value);
    if (d.length === 11 && !ehCPF(d)) { h.textContent = 'CPF inválido'; el.style.borderColor = 'var(--coral)'; }
    else { h.textContent = ''; el.style.borderColor = ''; }
  }

  // mostra/esconde o bloco do responsável conforme a idade
  function avaliarMenor(p, dataISO) {
    const box = document.getElementById(p + 'RespBox');
    if (!box) return;
    const a = idadeAnos(dataISO);
    box.style.display = (a !== null && a < 18) ? 'block' : 'none';
  }

  // HTML dos campos extras. p = prefixo de id ('ce' edição, 'cl' criação)
  function htmlExtras(p, incluirNasc) {
    return `
      <div id="${p}Box" style="margin-top:8px;padding-top:12px;border-top:1px solid var(--border-subtle,#2a2a2a);">
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:10px;">Dados complementares</div>
        ${incluirNasc ? `
        <div style="margin-bottom:10px;">
          <label class="form-label" style="font-size:12px;">Data de nascimento</label>
          <input class="form-input" type="date" id="${p}Nasc"/>
        </div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px;">
          <div>
            <label class="form-label" style="font-size:12px;">CPF</label>
            <input class="form-input" id="${p}Cpf" inputmode="numeric" placeholder="000.000.000-00" maxlength="14"/>
            <div id="${p}CpfHint" style="font-size:11px;color:var(--coral);min-height:13px;"></div>
          </div>
          <div>
            <label class="form-label" style="font-size:12px;">CEP</label>
            <input class="form-input" id="${p}Cep" inputmode="numeric" placeholder="00000-000" maxlength="9"/>
            <div id="${p}CepHint" style="font-size:11px;color:var(--text-muted);min-height:13px;"></div>
          </div>
        </div>
        <div style="margin-bottom:10px;">
          <label class="form-label" style="font-size:12px;">Endereço</label>
          <input class="form-input" id="${p}Endereco" placeholder="Rua, nº, bairro, cidade"/>
        </div>
        <div id="${p}RespBox" style="display:none;border:1px solid var(--gold,#C9A84C);background:rgba(201,168,76,.06);border-radius:10px;padding:12px;margin-bottom:8px;">
          <div style="font-size:12px;color:var(--gold);font-weight:600;margin-bottom:10px;">
            <i class="ti ti-cash"></i> Paciente menor de idade — informe o responsável financeiro
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label" style="font-size:12px;">Nome do responsável</label>
              <input class="form-input" id="${p}RespNome" placeholder="Nome completo"/>
            </div>
            <div>
              <label class="form-label" style="font-size:12px;">Parentesco</label>
              <select class="form-input" id="${p}RespParentesco">
                <option value="">—</option>
                <option>Mãe</option><option>Pai</option>
                <option>Avó</option><option>Avô</option>
                <option>Tia</option><option>Tio</option>
                <option>Irmã</option><option>Irmão</option>
                <option>Tutor(a) legal</option><option>Outro</option>
              </select>
            </div>
            <div>
              <label class="form-label" style="font-size:12px;">Telefone do responsável</label>
              <input class="form-input" id="${p}RespTelefone" inputmode="numeric" placeholder="(00) 00000-0000" maxlength="15"/>
            </div>
            <div>
              <label class="form-label" style="font-size:12px;">CPF do responsável</label>
              <input class="form-input" id="${p}RespCpf" inputmode="numeric" placeholder="000.000.000-00" maxlength="14"/>
              <div id="${p}RespCpfHint" style="font-size:11px;color:var(--coral);min-height:13px;"></div>
            </div>
          </div>
        </div>
        <div id="${p}Msg" style="font-size:12px;color:var(--text-muted);min-height:15px;"></div>
      </div>`;
  }

  // máscaras + (na edição) autosave por campo
  function wireEventos(p, onAutosave) {
    const cpf = document.getElementById(p + 'Cpf');
    const rcpf = document.getElementById(p + 'RespCpf');
    const rtel = document.getElementById(p + 'RespTelefone');
    const nasc = document.getElementById(p + 'Nasc');
    const cep = document.getElementById(p + 'Cep');
    if (cpf) cpf.addEventListener('input', () => { cpf.value = mascararCPF(cpf.value); validarCpfHint(cpf, p + 'CpfHint'); });
    if (rcpf) rcpf.addEventListener('input', () => { rcpf.value = mascararCPF(rcpf.value); validarCpfHint(rcpf, p + 'RespCpfHint'); });
    if (rtel) rtel.addEventListener('input', () => { rtel.value = mascararTel(rtel.value); });
    if (nasc) nasc.addEventListener('change', () => avaliarMenor(p, nasc.value));
    if (cep) {
      cep.addEventListener('input', () => {
        cep.value = mascararCEP(cep.value);
        if (soDig(cep.value).length === 8) buscarCEP(p, onAutosave);
      });
      if (onAutosave) cep.addEventListener('blur', onAutosave);
    }
    if (onAutosave) {
      [p + 'Cpf', p + 'Endereco', p + 'RespNome', p + 'RespTelefone', p + 'RespCpf'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('blur', onAutosave);
      });
      const sel = document.getElementById(p + 'RespParentesco');
      if (sel) sel.addEventListener('change', onAutosave);
    }
  }

  // lê os campos extras de um prefixo -> objeto pronto pro banco
  function lerExtras(p, incluirNasc) {
    const val = (id) => (document.getElementById(id)?.value || '').trim();
    const o = {
      cpf: soDig(val(p + 'Cpf')) || null,
      cep: soDig(val(p + 'Cep')) || null,
      endereco: val(p + 'Endereco') || null,
      responsavel_nome: val(p + 'RespNome') || null,
      responsavel_parentesco: val(p + 'RespParentesco') || null,
      responsavel_telefone: soDig(val(p + 'RespTelefone')) || null,
      responsavel_cpf: soDig(val(p + 'RespCpf')) || null,
    };
    if (incluirNasc) o.data_nascimento = val(p + 'Nasc') || null;
    return o;
  }

  const temAlgo = (o) => Object.values(o).some(v => v !== null && v !== '' && v !== undefined);

  // =========================================================
  // 1) FICHA DE EDIÇÃO  (#modalEditLead -> aba Dados)
  // =========================================================
  function injetarEdit() {
    const dados = document.getElementById('fichaTabDados');
    if (!dados) return false;
    if (document.getElementById('ceBox')) return true;

    const wrap = document.createElement('div');
    wrap.innerHTML = htmlExtras('ce', false); // edição já tem o campo de nascimento no form do core
    const box = wrap.firstElementChild;

    let ref = dados.querySelector('button');
    if (ref) { while (ref && ref.parentNode !== dados) ref = ref.parentNode; }
    if (ref && ref.parentNode === dados) dados.insertBefore(box, ref);
    else dados.appendChild(box);

    wireEventos('ce', salvarEdit);
    return true;
  }

  async function salvarEdit() {
    if (!CE.leadId || typeof db === 'undefined') return;
    const dados = lerExtras('ce', false);
    const msg = document.getElementById('ceMsg');
    try {
      const { error } = await db.from('leads').update(dados).eq('id', CE.leadId);
      if (error) throw error;
      if (msg) {
        msg.style.color = 'var(--text-muted)';
        msg.textContent = '✓ salvo';
        setTimeout(() => { if (msg.textContent === '✓ salvo') msg.textContent = ''; }, 1500);
      }
    } catch (e) {
      if (msg) { msg.style.color = 'var(--coral)'; msg.textContent = 'Erro ao salvar: ' + (e.message || ''); }
      console.error('[cadastro-extra edição]', e);
    }
  }

  async function popularEdit() {
    if (!CE.leadId || typeof db === 'undefined') return;
    let lead = {};
    try {
      const { data } = await db.from('leads')
        .select('cpf,cep,endereco,responsavel_nome,responsavel_parentesco,responsavel_telefone,responsavel_cpf,data_nascimento')
        .eq('id', CE.leadId).single();
      lead = data || {};
    } catch (e) { lead = {}; }

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('ceCpf', lead.cpf ? mascararCPF(lead.cpf) : '');
    set('ceCep', lead.cep ? mascararCEP(lead.cep) : '');
    set('ceEndereco', lead.endereco || '');
    set('ceRespNome', lead.responsavel_nome || '');
    set('ceRespParentesco', lead.responsavel_parentesco || '');
    set('ceRespTelefone', lead.responsavel_telefone ? mascararTel(lead.responsavel_telefone) : '');
    set('ceRespCpf', lead.responsavel_cpf ? mascararCPF(lead.responsavel_cpf) : '');
    ['ceCpfHint', 'ceRespCpfHint'].forEach(id => { const h = document.getElementById(id); if (h) h.textContent = ''; });
    const cepEl = document.getElementById('ceCep'); if (cepEl && cepEl.dataset) delete cepEl.dataset.last;

    avaliarMenor('ce', lead.data_nascimento);
    // escuta o campo de data do form do core (toggle ao vivo)
    const dadosTab = document.getElementById('fichaTabDados');
    const dateInput = dadosTab && dadosTab.querySelector('input[type="date"]');
    if (dateInput && !dateInput.dataset.ceBound) {
      dateInput.dataset.ceBound = '1';
      dateInput.addEventListener('change', () => avaliarMenor('ce', dateInput.value));
    }
  }

  function aoAbrirEdit(id) {
    CE.leadId = id;
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (injetarEdit()) { popularEdit(); clearInterval(iv); }
      if (tries > 40) clearInterval(iv);
    }, 60);
  }

  let hookedEdit = false, hookedCriar = false;

  function hookEdit() {
    if (hookedEdit) return true;
    if (typeof openEditLead !== 'function') return false;
    const _orig = openEditLead;
    openEditLead = function () {
      const r = _orig.apply(this, arguments);
      aoAbrirEdit(arguments[0]);
      return r;
    };
    hookedEdit = true;
    return true;
  }

  // =========================================================
  // 2) NOVO LEAD  (#modalNewLead -> saveNewLead)
  // =========================================================
  let criarDate = null; // campo de nascimento que JÁ existe no modal de novo lead

  function injetarCriar() {
    const modal = document.getElementById('modalNewLead');
    if (!modal) return false;

    // acha o campo de nascimento já existente no modal e usa ele pro toggle de menor
    criarDate = modal.querySelector('input[type="date"]');
    if (criarDate && !criarDate.dataset.clBound) {
      criarDate.dataset.clBound = '1';
      criarDate.addEventListener('change', () => avaliarMenor('cl', criarDate.value));
    }

    if (document.getElementById('clBox')) return true;
    const corpo = modal.querySelector('.modal-body') || modal;

    const wrap = document.createElement('div');
    wrap.innerHTML = htmlExtras('cl', false); // o modal já tem data de nascimento -> NÃO duplicar
    const box = wrap.firstElementChild;

    let ref = corpo.querySelector('button');
    if (ref) { while (ref && ref.parentNode !== corpo) ref = ref.parentNode; }
    if (ref && ref.parentNode === corpo) corpo.insertBefore(box, ref);
    else corpo.appendChild(box);

    wireEventos('cl', null); // sem autosave: grava junto ao criar
    return true;
  }

  function resetCriar() {
    ['clCpf', 'clCep', 'clEndereco', 'clRespNome', 'clRespParentesco', 'clRespTelefone', 'clRespCpf']
      .forEach(id => { const el = document.getElementById(id); if (el) { el.value = ''; if (el.dataset) delete el.dataset.last; } });
    ['clCpfHint', 'clCepHint', 'clRespCpfHint', 'clMsg'].forEach(id => { const h = document.getElementById(id); if (h) h.textContent = ''; });
    avaliarMenor('cl', criarDate ? criarDate.value : null);
  }

  function hookCriar() {
    if (hookedCriar) return true;
    if (typeof saveNewLead !== 'function' || typeof openModal !== 'function') return false;

    // injeta + reseta sempre que o modal de novo lead abre
    const _openModal = openModal;
    openModal = function (id) {
      const r = _openModal.apply(this, arguments);
      if (id === 'modalNewLead') { injetarCriar(); resetCriar(); }
      return r;
    };

    // intercepta o salvar pra gravar os campos extras no lead recém-criado
    const _save = saveNewLead;
    saveNewLead = async function () {
      const extras = lerExtras('cl', false);         // lê ANTES (a original limpa/fecha o modal)
      if (criarDate && criarDate.value) extras.data_nascimento = criarDate.value; // salva o nascimento (hoje não é salvo na criação)
      const antes = (typeof STATE !== 'undefined' && STATE.leads) ? STATE.leads.length : -1;
      const r = await _save.apply(this, arguments);
      try {
        if (typeof STATE !== 'undefined' && STATE.leads && STATE.leads.length > antes) {
          const novo = STATE.leads[0];               // saveNewLead faz unshift do novo lead
          if (novo && novo.id && temAlgo(extras)) {
            const { error } = await db.from('leads').update(extras).eq('id', novo.id);
            if (!error) Object.assign(novo, extras);
          }
        }
      } catch (e) { console.error('[cadastro-extra criar]', e); }
      return r;
    };
    hookedCriar = true;
    return true;
  }

  // ── instala os hooks (independente da ordem de carga) ────
  function instalar() {
    const okEdit = hookEdit();
    const okCriar = hookCriar();
    return okEdit && okCriar;
  }
  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }

  console.log('✅ cadastro-extra-fix.js carregado — CPF / Endereço / Responsável financeiro (edição + novo lead)');
})();
