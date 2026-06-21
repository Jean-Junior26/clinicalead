// ============================================================
// CLINICALEAD — CAMPOS EXTRAS DO CADASTRO (CPF, Endereço, Responsável)
// Injeta na aba "Dados" da ficha do paciente (#modalEditLead).
//   - CPF (máscara + validação de dígito verificador) e Endereço.
//   - Bloco "Responsável" aparece AUTOMÁTICO quando o paciente é
//     menor de 18 anos (pela data de nascimento).
// Salva direto na tabela leads (cpf, endereco, responsavel_*),
// sem mexer no form nem na função de salvar do core: autosave ao
// sair de cada campo. CPF e telefone são guardados só com dígitos
// (a máscara é apenas visual), igual ao resto do sistema.
// ============================================================

(function () {
  'use strict';

  const CE = { leadId: null };

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

  // ── injeta os campos na aba "Dados" (uma vez) ─────────────
  function injetar() {
    const dados = document.getElementById('fichaTabDados');
    if (!dados) return false;                 // ficha ainda não montou
    if (document.getElementById('ceBox')) return true; // já injetado

    const box = document.createElement('div');
    box.id = 'ceBox';
    box.style.cssText = 'margin-top:8px;padding-top:12px;border-top:1px solid var(--border-subtle,#2a2a2a);';
    box.innerHTML = `
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:10px;">Dados complementares</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px;">
        <div>
          <label class="form-label" style="font-size:12px;">CPF</label>
          <input class="form-input" id="ceCpf" inputmode="numeric" placeholder="000.000.000-00" maxlength="14"/>
          <div id="ceCpfHint" style="font-size:11px;color:var(--coral);min-height:13px;"></div>
        </div>
        <div>
          <label class="form-label" style="font-size:12px;">Endereço</label>
          <input class="form-input" id="ceEndereco" placeholder="Rua, nº, bairro, cidade"/>
        </div>
      </div>
      <div id="ceRespBox" style="display:none;border:1px solid var(--gold,#C9A84C);background:rgba(201,168,76,.06);border-radius:10px;padding:12px;margin-bottom:8px;">
        <div style="font-size:12px;color:var(--gold);font-weight:600;margin-bottom:10px;">
          <i class="ti ti-shield-check"></i> Paciente menor de idade — informe o responsável
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label class="form-label" style="font-size:12px;">Nome do responsável</label>
            <input class="form-input" id="ceRespNome" placeholder="Nome completo"/>
          </div>
          <div>
            <label class="form-label" style="font-size:12px;">Parentesco</label>
            <select class="form-input" id="ceRespParentesco">
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
            <input class="form-input" id="ceRespTelefone" inputmode="numeric" placeholder="(00) 00000-0000" maxlength="15"/>
          </div>
          <div>
            <label class="form-label" style="font-size:12px;">CPF do responsável</label>
            <input class="form-input" id="ceRespCpf" inputmode="numeric" placeholder="000.000.000-00" maxlength="14"/>
            <div id="ceRespCpfHint" style="font-size:11px;color:var(--coral);min-height:13px;"></div>
          </div>
        </div>
      </div>
      <div id="ceMsg" style="font-size:12px;color:var(--text-muted);min-height:15px;"></div>`;

    // insere antes do bloco que contém o primeiro botão da aba (ex.: "Salvar"); senão, anexa ao fim
    let ref = dados.querySelector('button');
    if (ref) { while (ref && ref.parentNode !== dados) ref = ref.parentNode; }
    if (ref && ref.parentNode === dados) dados.insertBefore(box, ref);
    else dados.appendChild(box);

    wireEventos();
    return true;
  }

  // ── eventos (máscaras + autosave) ────────────────────────
  function wireEventos() {
    const cpf = document.getElementById('ceCpf');
    const rcpf = document.getElementById('ceRespCpf');
    const rtel = document.getElementById('ceRespTelefone');
    if (cpf) cpf.addEventListener('input', () => { cpf.value = mascararCPF(cpf.value); validarCpfHint(cpf, 'ceCpfHint'); });
    if (rcpf) rcpf.addEventListener('input', () => { rcpf.value = mascararCPF(rcpf.value); validarCpfHint(rcpf, 'ceRespCpfHint'); });
    if (rtel) rtel.addEventListener('input', () => { rtel.value = mascararTel(rtel.value); });

    ['ceCpf', 'ceEndereco', 'ceRespNome', 'ceRespTelefone', 'ceRespCpf'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('blur', salvar);
    });
    const sel = document.getElementById('ceRespParentesco');
    if (sel) sel.addEventListener('change', salvar);
  }

  // ── persiste os campos extras direto na tabela leads ─────
  async function salvar() {
    if (!CE.leadId || typeof db === 'undefined') return;
    const val = (id) => (document.getElementById(id)?.value || '').trim();
    const dados = {
      cpf: soDig(val('ceCpf')) || null,
      endereco: val('ceEndereco') || null,
      responsavel_nome: val('ceRespNome') || null,
      responsavel_parentesco: val('ceRespParentesco') || null,
      responsavel_telefone: soDig(val('ceRespTelefone')) || null,
      responsavel_cpf: soDig(val('ceRespCpf')) || null,
    };
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
      console.error('[cadastro-extra]', e);
    }
  }

  // ── popula os campos ao abrir a ficha de um lead ─────────
  async function popular() {
    if (!CE.leadId || typeof db === 'undefined') return;
    let lead = {};
    try {
      const { data } = await db.from('leads')
        .select('cpf,endereco,responsavel_nome,responsavel_parentesco,responsavel_telefone,responsavel_cpf,data_nascimento')
        .eq('id', CE.leadId).single();
      lead = data || {};
    } catch (e) { lead = {}; }

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('ceCpf', lead.cpf ? mascararCPF(lead.cpf) : '');
    set('ceEndereco', lead.endereco || '');
    set('ceRespNome', lead.responsavel_nome || '');
    set('ceRespParentesco', lead.responsavel_parentesco || '');
    set('ceRespTelefone', lead.responsavel_telefone ? mascararTel(lead.responsavel_telefone) : '');
    set('ceRespCpf', lead.responsavel_cpf ? mascararCPF(lead.responsavel_cpf) : '');
    ['ceCpfHint', 'ceRespCpfHint'].forEach(id => { const h = document.getElementById(id); if (h) h.textContent = ''; });

    avaliarMenor(lead.data_nascimento);
    ligarToggleData();
  }

  // mostra/esconde o bloco do responsável conforme a idade
  function avaliarMenor(dataISO) {
    const box = document.getElementById('ceRespBox');
    if (!box) return;
    const a = idadeAnos(dataISO);
    box.style.display = (a !== null && a < 18) ? 'block' : 'none';
  }

  // escuta o campo de data da aba pra reavaliar ao vivo
  function ligarToggleData() {
    const dados = document.getElementById('fichaTabDados');
    if (!dados) return;
    const dateInput = dados.querySelector('input[type="date"]');
    if (!dateInput || dateInput.dataset.ceBound) return;
    dateInput.dataset.ceBound = '1';
    dateInput.addEventListener('change', () => avaliarMenor(dateInput.value));
  }

  // ── engata no openEditLead (independente da ordem de carga) ─
  function aoAbrir(id) {
    CE.leadId = id;
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (injetar()) { popular(); clearInterval(iv); }
      if (tries > 40) clearInterval(iv); // ~2.4s de segurança
    }, 60);
  }

  function instalarHook() {
    if (typeof openEditLead !== 'function') return false;
    const _orig = openEditLead;
    openEditLead = function () {
      const r = _orig.apply(this, arguments);
      aoAbrir(arguments[0]);
      return r;
    };
    return true;
  }

  if (!instalarHook()) {
    const iv = setInterval(() => { if (instalarHook()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }

  console.log('✅ cadastro-extra-fix.js carregado — CPF / Endereço / Responsável');
})();
