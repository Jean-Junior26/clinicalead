// ============================================================
// CLINICALEAD — IMPORTADOR DE PACIENTES (CSV / Excel)
// Genérico: funciona com qualquer sistema que exporte planilha.
// Fluxo: sobe arquivo -> mapeia colunas -> pré-visualiza -> importa.
// - Obrigatórios: nome + telefone
// - Opcionais: nascimento, email, observações
// - Pula duplicados (mesmo telefone na clínica)
// - Status escolhido na importação (padrão 'novo')
// Fica no "Minha Clínica". Lê Excel via SheetJS (CDN sob demanda).
// ============================================================

(function () {
  'use strict';

  const IMP = { linhas: [], colunas: [], mapa: {} };

  // carrega a SheetJS sob demanda (só quando precisa de Excel)
  function carregarSheetJS() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Falha ao carregar leitor de Excel'));
      document.head.appendChild(s);
    });
  }

  // normaliza telefone: só dígitos
  function normTel(t) {
    return String(t || '').replace(/\D/g, '');
  }

  // ── abre o modal do importador ───────────────────────────
  window.abrirImportador = function () {
    if (document.getElementById('modalImportador')) {
      document.getElementById('modalImportador').remove();
    }
    const ov = document.createElement('div');
    ov.className = 'modal-overlay open';
    ov.id = 'modalImportador';
    ov.innerHTML = `
      <div class="modal" style="max-width:560px;width:96vw;">
        <div class="modal-header">
          <h3><i class="ti ti-upload" style="margin-right:8px;color:var(--gold);"></i>Importar pacientes</h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('modalImportador')"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" id="impBody" style="max-height:76vh;overflow-y:auto;">
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
            Importe seus pacientes de outro sistema. Exporte a lista como <b>CSV</b> ou <b>Excel</b> e suba aqui.
          </p>
          <div style="border:2px dashed var(--border-subtle,#333);border-radius:12px;padding:30px;text-align:center;">
            <input type="file" id="impArquivo" accept=".csv,.xlsx,.xls" style="display:none;" onchange="impLerArquivo(this)">
            <i class="ti ti-file-spreadsheet" style="font-size:36px;color:var(--gold);"></i>
            <div style="margin-top:10px;font-size:13px;color:var(--text-secondary);">Selecione o arquivo CSV ou Excel</div>
            <button class="btn btn-primary" style="margin-top:14px;" onclick="document.getElementById('impArquivo').click()">
              <i class="ti ti-upload"></i> Escolher arquivo
            </button>
          </div>
          <div id="impMsg" style="font-size:12px;color:var(--coral);min-height:14px;margin-top:10px;"></div>
        </div>
      </div>`;
    document.body.appendChild(ov);
  };

  // ── lê o arquivo (CSV ou Excel) ──────────────────────────
  window.impLerArquivo = async function (input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const msg = document.getElementById('impMsg');
    const setMsg = (t) => { if (msg) msg.textContent = t || ''; };
    setMsg('Lendo arquivo…');

    try {
      let linhas = [];
      const nome = file.name.toLowerCase();

      if (nome.endsWith('.csv')) {
        const texto = await file.text();
        linhas = parseCSV(texto);
      } else {
        await carregarSheetJS();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      }

      // remove linhas vazias
      linhas = linhas.filter(l => l.some(c => String(c).trim() !== ''));
      if (linhas.length < 2) { setMsg('O arquivo precisa ter um cabeçalho e ao menos 1 paciente.'); return; }

      IMP.colunas = linhas[0].map(c => String(c).trim());
      IMP.linhas = linhas.slice(1);
      setMsg('');
      renderMapeamento();
    } catch (e) {
      setMsg('Erro ao ler: ' + (e.message || 'arquivo inválido'));
      console.error('[importador]', e);
    }
  };

  // parser CSV simples (vírgula ou ponto-e-vírgula)
  function parseCSV(texto) {
    const sep = (texto.split('\n')[0].split(';').length > texto.split('\n')[0].split(',').length) ? ';' : ',';
    return texto.split(/\r?\n/).map(linha => {
      // respeita aspas
      const out = []; let cur = ''; let dentro = false;
      for (let i = 0; i < linha.length; i++) {
        const ch = linha[i];
        if (ch === '"') { dentro = !dentro; }
        else if (ch === sep && !dentro) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out.map(c => c.trim().replace(/^"|"$/g, ''));
    });
  }

  // ── tela de mapeamento de colunas ────────────────────────
  function renderMapeamento() {
    const body = document.getElementById('impBody');
    if (!body) return;
    const opcoes = (sel) => `
      <option value="">— ignorar —</option>
      ${IMP.colunas.map((c, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${c || ('Coluna ' + (i + 1))}</option>`).join('')}`;

    // tenta adivinhar colunas pelo nome
    const adivinha = (termos) => IMP.colunas.findIndex(c => termos.some(t => c.toLowerCase().includes(t)));
    const gNome = adivinha(['nome', 'paciente', 'name']);
    const gTel = adivinha(['tel', 'celular', 'fone', 'whats', 'phone']);
    const gNasc = adivinha(['nasc', 'birth', 'aniver']);
    const gEmail = adivinha(['email', 'e-mail']);

    body.innerHTML = `
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
        Encontramos <b>${IMP.linhas.length}</b> pacientes. Diga qual coluna é cada informação:
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label class="form-label" style="font-size:12px;">Nome <span style="color:var(--coral);">*</span></label>
          <select class="form-input" id="mapNome">${opcoes(gNome >= 0 ? gNome : '')}</select>
        </div>
        <div>
          <label class="form-label" style="font-size:12px;">Telefone <span style="color:var(--coral);">*</span></label>
          <select class="form-input" id="mapTel">${opcoes(gTel >= 0 ? gTel : '')}</select>
        </div>
        <div>
          <label class="form-label" style="font-size:12px;">Data de nascimento (opcional)</label>
          <select class="form-input" id="mapNasc">${opcoes(gNasc >= 0 ? gNasc : '')}</select>
        </div>
        <div>
          <label class="form-label" style="font-size:12px;">Email (opcional)</label>
          <select class="form-input" id="mapEmail">${opcoes(gEmail >= 0 ? gEmail : '')}</select>
        </div>
        <div>
          <label class="form-label" style="font-size:12px;">Status dos pacientes importados</label>
          <select class="form-input" id="mapStatus">
            <option value="novo">novo</option>
            <option value="contato">contato</option>
            <option value="compareceu">compareceu</option>
            <option value="fechado">fechado (cliente)</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:16px;" onclick="impPreVisualizar()">
        <i class="ti ti-eye"></i> Pré-visualizar
      </button>
      <div id="impMsg" style="font-size:12px;color:var(--coral);min-height:14px;margin-top:10px;"></div>`;
  }

  // ── pré-visualização ─────────────────────────────────────
  window.impPreVisualizar = function () {
    const msg = document.getElementById('impMsg');
    const setMsg = (t) => { if (msg) msg.textContent = t || ''; };
    const iNome = document.getElementById('mapNome').value;
    const iTel = document.getElementById('mapTel').value;
    if (iNome === '' || iTel === '') { setMsg('Nome e telefone são obrigatórios.'); return; }

    IMP.mapa = {
      nome: parseInt(iNome), tel: parseInt(iTel),
      nasc: document.getElementById('mapNasc').value !== '' ? parseInt(document.getElementById('mapNasc').value) : null,
      email: document.getElementById('mapEmail').value !== '' ? parseInt(document.getElementById('mapEmail').value) : null,
      status: document.getElementById('mapStatus').value,
    };

    // monta os pacientes
    const pacientes = IMP.linhas.map(l => ({
      nome: String(l[IMP.mapa.nome] || '').trim(),
      telefone: normTel(l[IMP.mapa.tel]),
      data_nascimento: IMP.mapa.nasc !== null ? converterData(l[IMP.mapa.nasc]) : null,
      email: IMP.mapa.email !== null ? String(l[IMP.mapa.email] || '').trim() : null,
    })).filter(p => p.nome && p.telefone.length >= 8);

    IMP.pacientes = pacientes;

    const body = document.getElementById('impBody');
    const amostra = pacientes.slice(0, 5);
    body.innerHTML = `
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
        <b>${pacientes.length}</b> pacientes válidos prontos pra importar. Confira os primeiros:
      </div>
      <div style="border:1px solid var(--border-subtle,#2a2a2a);border-radius:10px;overflow:hidden;margin-bottom:16px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:var(--bg-elevated);">
            <th style="padding:8px;text-align:left;">Nome</th><th style="padding:8px;text-align:left;">Telefone</th><th style="padding:8px;text-align:left;">Nasc.</th>
          </tr></thead>
          <tbody>
            ${amostra.map(p => `<tr style="border-top:1px solid var(--border-subtle,#2a2a2a);">
              <td style="padding:8px;">${p.nome}</td><td style="padding:8px;">${p.telefone}</td><td style="padding:8px;">${p.data_nascimento || '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="renderMapeamentoVoltar()" style="flex:1;"><i class="ti ti-arrow-left"></i> Voltar</button>
        <button class="btn btn-primary" onclick="impConfirmar()" style="flex:2;"><i class="ti ti-check"></i> Importar ${pacientes.length} pacientes</button>
      </div>
      <div id="impMsg" style="font-size:12px;min-height:14px;margin-top:10px;"></div>`;
  };

  window.renderMapeamentoVoltar = function () { renderMapeamento(); };

  // converte data de vários formatos pra YYYY-MM-DD
  function converterData(v) {
    if (!v) return null;
    const s = String(v).trim();
    // dd/mm/aaaa
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      let ano = m[3].length === 2 ? '19' + m[3] : m[3];
      return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    // aaaa-mm-dd (já ok)
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return null;
  }

  // ── confirma e importa ───────────────────────────────────
  window.impConfirmar = async function () {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;
    const msg = document.getElementById('impMsg');
    const setMsg = (t, cor) => { if (msg) { msg.textContent = t; msg.style.color = cor || 'var(--text-secondary)'; } };

    setMsg('Importando… aguarde.');

    try {
      // pega telefones já existentes na clínica (pra pular duplicados)
      const { data: existentes } = await db.from('leads')
        .select('telefone').eq('clinic_id', clinic.id);
      const jaTem = new Set((existentes || []).map(l => normTel(l.telefone)));

      const novos = IMP.pacientes.filter(p => !jaTem.has(p.telefone));
      const pulados = IMP.pacientes.length - novos.length;

      if (!novos.length) { setMsg(`Nenhum novo: todos os ${IMP.pacientes.length} já existem.`, 'var(--gold)'); return; }

      // insere em lotes de 100
      const status = IMP.mapa.status || 'novo';
      let importados = 0;
      for (let i = 0; i < novos.length; i += 100) {
        const lote = novos.slice(i, i + 100).map(p => ({
          clinic_id: clinic.id,
          nome: p.nome,
          telefone: p.telefone,
          data_nascimento: p.data_nascimento || null,
          email: p.email || null,
          status,
          origem: 'Importação',
        }));
        const { error } = await db.from('leads').insert(lote);
        if (error) throw error;
        importados += lote.length;
        setMsg(`Importando… ${importados}/${novos.length}`);
      }

      const body = document.getElementById('impBody');
      body.innerHTML = `
        <div style="text-align:center;padding:24px;">
          <i class="ti ti-circle-check" style="font-size:48px;color:#7FB069;"></i>
          <h3 style="margin:12px 0 6px;">Importação concluída! 🎉</h3>
          <p style="font-size:14px;color:var(--text-secondary);">
            <b>${importados}</b> pacientes importados.<br>
            ${pulados > 0 ? `<span style="color:var(--text-muted);">${pulados} já existiam e foram pulados.</span>` : ''}
          </p>
          <button class="btn btn-primary" style="margin-top:16px;" onclick="closeModal('modalImportador');location.reload();">
            <i class="ti ti-check"></i> Concluir
          </button>
        </div>`;
    } catch (e) {
      setMsg('Erro ao importar: ' + (e.message || 'tente de novo'), 'var(--coral)');
      console.error('[importador]', e);
    }
  };

  // ── injeta botão "Importar pacientes" no Minha Clínica ───
  function injetarBotao() {
    const page = document.getElementById('page-minha-clinica');
    if (!page) return;
    if (document.getElementById('btnImportarPacientes')) return;
    // acha um lugar bom: depois do primeiro card
    const alvo = page.querySelector('.card') || page;
    const div = document.createElement('div');
    div.style.cssText = 'margin-top:16px;';
    div.innerHTML = `
      <button class="btn" id="btnImportarPacientes" onclick="abrirImportador()" style="border:1px solid var(--gold,#C9A84C);color:var(--gold,#C9A84C);">
        <i class="ti ti-upload"></i> Importar pacientes (CSV/Excel)
      </button>`;
    alvo.appendChild(div);
  }

  setInterval(() => {
    const page = document.getElementById('page-minha-clinica');
    if (page && page.classList.contains('active')) injetarBotao();
  }, 800);

  console.log('✅ importar-pacientes-fix.js carregado');
})();
