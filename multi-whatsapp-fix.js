// ============================================================
// CLINICALEAD — MÚLTIPLOS WHATSAPP POR CLÍNICA (Fatia 1)
// Permite que uma clínica tenha vários números (recepção,
// comercial, etc). O número principal continua sendo o
// clinic.whatsapp_instance (intocado). Os extras ficam na
// tabela 'instancias'. Cada um conecta via QR independente.
// ============================================================

let MWA = { clinicId: null, instancias: [], qrPoll: null, qrInstanceName: null };

// Gera um nome técnico único de instância para a clínica
function gerarNomeInstancia(clinic, sufixo) {
  const base = (clinic.nome || 'clinica').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${base}_${sufixo}_${rnd}`;
}

// Abre a tela de gerenciar os números da clínica
async function abrirGerenciarNumeros(clinicId) {
  const clinic = (STATE.clinics || []).find(c => c.id === clinicId);
  if (!clinic) return;
  MWA.clinicId = clinicId;

  if (!document.getElementById('modalNumeros')) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'modalNumeros';
    ov.innerHTML = `
      <div class="modal" style="max-width:560px;width:96vw;">
        <div class="modal-header">
          <h3><i class="ti ti-brand-whatsapp" style="margin-right:8px;color:#25D366;"></i>Números de WhatsApp</h3>
          <button class="btn btn-ghost btn-icon" onclick="fecharGerenciarNumeros()"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="max-height:74vh;overflow-y:auto;">
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
            Conecte vários números nesta clínica (ex: Recepção e Comercial). Cada número tem seu próprio inbox.
          </p>
          <div id="listaNumeros"></div>
          <div id="areaAddNumero" style="margin-top:16px;"></div>
          <div id="areaQRNumero" style="margin-top:16px;display:none;text-align:center;">
            <div id="qrNumeroStatus" style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;"></div>
            <img id="qrNumeroImg" style="max-width:240px;border-radius:12px;border:1px solid var(--gold-border);"/>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }
  await carregarNumeros();
  openModal('modalNumeros');
}

function fecharGerenciarNumeros() {
  if (MWA.qrPoll) { clearInterval(MWA.qrPoll); MWA.qrPoll = null; }
  closeModal('modalNumeros');
}

// Carrega e renderiza a lista de números (principal + extras)
async function carregarNumeros() {
  const clinic = (STATE.clinics || []).find(c => c.id === MWA.clinicId);
  if (!clinic) return;

  const { data: extras } = await db.from('instancias').select('*').eq('clinic_id', clinic.id).order('criado_em');
  MWA.instancias = extras || [];

  const lista = document.getElementById('listaNumeros');
  let html = '';

  // Número PRINCIPAL (o whatsapp_instance da clínica)
  if (clinic.whatsapp_instance) {
    html += linhaNumero('Principal', clinic.whatsapp_instance, true, null);
  } else {
    html += `<div style="padding:12px;background:var(--bg-elevated);border-radius:10px;margin-bottom:8px;font-size:13px;color:var(--text-muted);">
      O número principal ainda não foi conectado. Use o botão "Conectar WhatsApp" na lista de clínicas.
    </div>`;
  }

  // Números EXTRAS (da tabela instancias)
  for (const inst of MWA.instancias) {
    html += linhaNumero(inst.nome_exibicao, inst.instance_name, inst.conectado, inst.id);
  }

  lista.innerHTML = html;

  // Área de adicionar novo número
  document.getElementById('areaAddNumero').innerHTML = `
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
      <div style="flex:1;min-width:160px;">
        <label class="form-label" style="font-size:12px;">Nome do novo número</label>
        <input class="form-input" id="novoNumeroNome" placeholder="Ex: Comercial"/>
      </div>
      <button class="btn btn-primary" onclick="adicionarNumero()"><i class="ti ti-plus"></i> Adicionar e conectar</button>
    </div>`;
}

function linhaNumero(nome, instanceName, conectado, instId) {
  const cor = conectado ? '#3FB950' : 'var(--text-muted)';
  const status = conectado ? 'Conectado' : 'Não conectado';
  const acoes = instId
    ? `<button class="btn btn-sm" onclick="conectarNumero('${instId}')"><i class="ti ti-qrcode"></i> ${conectado ? 'Reconectar' : 'Conectar'}</button>
       <button class="btn btn-sm btn-danger" onclick="removerNumero('${instId}')"><i class="ti ti-trash"></i></button>`
    : `<span style="font-size:12px;color:var(--text-muted);">número principal</span>`;
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;background:var(--bg-elevated);border-radius:10px;margin-bottom:8px;">
      <div>
        <div style="font-weight:600;">${nome}</div>
        <div style="font-size:12px;color:${cor};">● ${status}</div>
      </div>
      <div style="display:flex;gap:6px;">${acoes}</div>
    </div>`;
}

// Adiciona um novo número (cria registro + abre QR)
async function adicionarNumero() {
  const nome = (document.getElementById('novoNumeroNome')?.value || '').trim();
  if (!nome) { toast('Dê um nome ao número (ex: Comercial)', 'error'); return; }
  const clinic = (STATE.clinics || []).find(c => c.id === MWA.clinicId);
  if (!clinic) return;

  const instanceName = gerarNomeInstancia(clinic, nome.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'num');

  const { data, error } = await db.from('instancias').insert({
    clinic_id: clinic.id,
    nome_exibicao: nome,
    instance_name: instanceName,
    tipo: 'geral',
    conectado: false,
  }).select().single();

  if (error) { toast('Erro ao criar número: ' + error.message, 'error'); return; }

  await carregarNumeros();
  // Já abre o QR pra conectar
  conectarNumero(data.id);
}

// Conecta (ou reconecta) um número específico via QR
async function conectarNumero(instId) {
  const inst = MWA.instancias.find(i => i.id === instId);
  if (!inst) return;
  MWA.qrInstanceName = inst.instance_name;

  const area = document.getElementById('areaQRNumero');
  const statusEl = document.getElementById('qrNumeroStatus');
  area.style.display = 'block';
  statusEl.textContent = 'Gerando QR Code para ' + inst.nome_exibicao + '...';

  try {
    // Cria a instância no Evolution
    await createWhatsAppInstance(inst.instance_name);
    await new Promise(r => setTimeout(r, 2000));
    const data = await getQRCode(inst.instance_name);
    if (data?.base64) {
      document.getElementById('qrNumeroImg').src = data.base64;
      statusEl.textContent = 'Escaneie o QR Code com o WhatsApp de ' + inst.nome_exibicao;

      if (MWA.qrPoll) clearInterval(MWA.qrPoll);
      MWA.qrPoll = setInterval(async () => {
        try {
          const s = await getInstanceStatus(inst.instance_name);
          if (s?.instance?.state === 'open') {
            clearInterval(MWA.qrPoll); MWA.qrPoll = null;
            // Configura o webhook pra essa instância
            fetch('/api/setup-webhook', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ instance: inst.instance_name }),
            });
            await db.from('instancias').update({ conectado: true }).eq('id', inst.id);
            statusEl.innerHTML = '<span style="color:#3FB950;font-weight:600;">✅ ' + inst.nome_exibicao + ' conectado!</span>';
            document.getElementById('qrNumeroImg').src = '';
            await carregarNumeros();
            toast(inst.nome_exibicao + ' conectado! 🎉');
          }
        } catch (e) { /* continua tentando */ }
      }, 3000);
    } else {
      statusEl.textContent = 'Erro ao gerar QR. Tente novamente.';
    }
  } catch (e) {
    statusEl.textContent = 'Erro ao conectar: ' + e.message;
  }
}

// Remove um número extra
async function removerNumero(instId) {
  const inst = MWA.instancias.find(i => i.id === instId);
  if (!inst) return;
  if (!confirm(`Remover o número "${inst.nome_exibicao}"? As conversas dele deixarão de ser recebidas.`)) return;

  // Tenta deletar a instância no Evolution (silencioso se falhar)
  try { await evoRequest('DELETE', `/instance/delete/${inst.instance_name}`); } catch (e) {}

  const { error } = await db.from('instancias').delete().eq('id', instId);
  if (error) { toast('Erro ao remover: ' + error.message, 'error'); return; }
  toast('Número removido');
  await carregarNumeros();
}

console.log('✅ multi-whatsapp-fix.js carregado (Fatia 1)');

// ── Injeta o botão "Números" na tela de Clínicas ─────────────
(function () {
  function injetarBotoes() {
    // Acha as linhas da tabela de clínicas e adiciona o botão de números
    document.querySelectorAll('button[onclick^="switchClinicById"]').forEach(btnAcessar => {
      const m = (btnAcessar.getAttribute('onclick') || '').match(/switchClinicById\('([^']+)'\)/);
      if (!m) return;
      const clinicId = m[1];
      const container = btnAcessar.parentElement;
      if (!container || container.querySelector('.btn-numeros')) return; // já injetado
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-numeros';
      btn.innerHTML = '<i class="ti ti-brand-whatsapp" style="color:#25D366;"></i> Números';
      btn.setAttribute('onclick', `abrirGerenciarNumeros('${clinicId}')`);
      container.insertBefore(btn, btnAcessar);
    });
  }

  // Intercepta renderClinicas
  if (typeof renderClinicas === 'function') {
    const _orig = renderClinicas;
    renderClinicas = async function (...args) {
      const r = await _orig.apply(this, args);
      setTimeout(injetarBotoes, 50);
      return r;
    };
  }
  // Também injeta ao abrir a página de clínicas
  if (typeof showPage === 'function') {
    const _origShow = showPage;
    showPage = function (id, el) {
      _origShow(id, el);
      if (id === 'clinicas' || id === 'clinics') setTimeout(injetarBotoes, 200);
    };
  }
  setTimeout(injetarBotoes, 1500);
})();
