// ============================================================
// CLINICALEAD — ENDEREÇO DINÂMICO POR CLÍNICA
// Substitui o endereço fixo (hardcoded) por dados reais da clínica.
//   • {endereco} → endereço cadastrado da clínica
//   • {mapa}     → link do mapa (manual) ou gerado do endereço (backup)
// Inclui botão "Editar" na tela de Clínicas para preencher esses dados.
// ============================================================

// ── Helpers: endereço e link do mapa da clínica ──────────────
function enderecoClinica(clinic) {
  const c = clinic || (typeof currentClinic === 'function' ? currentClinic() : null);
  return (c && c.endereco) ? c.endereco : '';
}

function linkMapaClinica(clinic) {
  const c = clinic || (typeof currentClinic === 'function' ? currentClinic() : null);
  if (!c) return '';
  // 1) link manual cadastrado tem prioridade (mais preciso)
  if (c.link_mapa) return c.link_mapa;
  // 2) backup: gera busca no Google Maps a partir do endereço
  if (c.endereco) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.endereco);
  }
  return '';
}

// Bloco de endereço pronto para colar nas mensagens (só aparece se houver endereço)
function blocoEndereco(clinic) {
  const end = enderecoClinica(clinic);
  if (!end) return '';
  const mapa = linkMapaClinica(clinic);
  let txt = `\n📍 *Endereço:* ${end}`;
  if (mapa) txt += `\n🗺️ *Como chegar:* ${mapa}`;
  return txt;
}

// Substitui as variáveis de endereço num texto qualquer
function aplicarEndereco(texto, clinic) {
  if (!texto) return texto;
  return texto
    .replaceAll('{endereco}', enderecoClinica(clinic) || '')
    .replaceAll('{mapa}', linkMapaClinica(clinic) || '');
}

// ── Substitui a função de LEMBRETE 24h (texto fixo → dinâmico) ──
(function () {
  // A função original monta a msg com endereço fixo. Interceptamos o
  // sendWhatsAppMessage só não dá (perde contexto), então substituímos
  // os disparadores conhecidos via wrapper de envio que troca o trecho fixo.
  const ENDERECO_FIXO = 'R. Rui Barbosa, 483 - Centro, Araguari - MG';
  const MAPA_FIXO = 'https://share.google/aBRk2BmdSOHL2iN9X';

  if (typeof sendWhatsAppMessage === 'function') {
    const _origSend = sendWhatsAppMessage;
    sendWhatsAppMessage = async function (instanceName, phone, message) {
      let msgFinal = message;
      // Se a mensagem contém o endereço fixo da GOU, troca pelo da clínica ativa
      if (typeof msgFinal === 'string' && msgFinal.includes(ENDERECO_FIXO)) {
        const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
        const endReal = enderecoClinica(clinic);
        const mapaReal = linkMapaClinica(clinic);
        if (endReal) msgFinal = msgFinal.replaceAll(ENDERECO_FIXO, endReal);
        if (mapaReal) msgFinal = msgFinal.replaceAll(MAPA_FIXO, mapaReal);
      }
      // Também resolve as variáveis {endereco} e {mapa} se existirem
      msgFinal = aplicarEndereco(msgFinal, (typeof currentClinic === 'function') ? currentClinic() : null);
      return _origSend(instanceName, phone, msgFinal);
    };
  }
})();

// ── Botão "Editar" na tela de Clínicas + modal de dados ──────
function abrirEditarClinica(clinicId) {
  const c = (STATE.clinics || []).find(x => x.id === clinicId);
  if (!c) { toast('Clínica não encontrada', 'error'); return; }

  if (!document.getElementById('modalEditClinica')) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'modalEditClinica';
    ov.innerHTML = `
      <div class="modal" style="max-width:520px;width:96vw;">
        <div class="modal-header">
          <h3><i class="ti ti-building-hospital" style="margin-right:8px;color:var(--gold);"></i>Editar dados da clínica</h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('modalEditClinica')"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto;">
          <input type="hidden" id="editClinicaId"/>
          <div class="form-group"><label class="form-label">Nome da clínica</label><input class="form-input" id="editClinicaNome"/></div>
          <div class="form-group"><label class="form-label">Telefone</label><input class="form-input" id="editClinicaTel" placeholder="(XX) XXXXX-XXXX"/></div>
          <div class="form-group"><label class="form-label">Endereço completo</label><input class="form-input" id="editClinicaEndereco" placeholder="Rua, número, bairro, cidade - UF"/><div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Usado nas mensagens de confirmação e lembrete.</div></div>
          <div class="form-group" style="margin-bottom:0;"><label class="form-label">Link do mapa (opcional)</label><input class="form-input" id="editClinicaMapa" placeholder="https://maps.google.com/... ou link do Google Meu Negócio"/><div style="font-size:11px;color:var(--text-muted);margin-top:4px;">💡 Cole o link do Google Maps da clínica para máxima precisão. Se deixar vazio, geramos um automático a partir do endereço.</div></div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" onclick="closeModal('modalEditClinica')">Cancelar</button>
          <button class="btn btn-primary" onclick="salvarEditarClinica()"><i class="ti ti-check"></i> Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }
  document.getElementById('editClinicaId').value = c.id;
  document.getElementById('editClinicaNome').value = c.nome || '';
  document.getElementById('editClinicaTel').value = c.telefone || '';
  document.getElementById('editClinicaEndereco').value = c.endereco || '';
  document.getElementById('editClinicaMapa').value = c.link_mapa || '';
  openModal('modalEditClinica');
}

async function salvarEditarClinica() {
  const id = document.getElementById('editClinicaId').value;
  const dados = {
    nome: document.getElementById('editClinicaNome').value.trim(),
    telefone: document.getElementById('editClinicaTel').value.trim() || null,
    endereco: document.getElementById('editClinicaEndereco').value.trim() || null,
    link_mapa: document.getElementById('editClinicaMapa').value.trim() || null,
  };
  if (!dados.nome) { toast('O nome é obrigatório', 'error'); return; }

  const { error } = await db.from('clinicas').update(dados).eq('id', id);
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }

  // Atualiza no STATE local
  const c = (STATE.clinics || []).find(x => x.id === id);
  if (c) Object.assign(c, dados);

  toast('Dados da clínica atualizados! ✓');
  closeModal('modalEditClinica');
  if (typeof renderClinics === 'function') renderClinics();
}

// ── Injeta o botão "Editar" em cada linha da tabela de Clínicas ──
(function () {
  function adicionarBotoes() {
    const lista = document.getElementById('clinicasList');
    if (!lista) return;
    lista.querySelectorAll('tr').forEach(tr => {
      if (tr.querySelector('.btn-editar-clinica')) return; // já tem
      // tenta achar o id da clínica pelo botão "Acessar"
      const acessarBtn = tr.querySelector('[onclick*="switchClinicById"]');
      if (!acessarBtn) return;
      const match = acessarBtn.getAttribute('onclick').match(/switchClinicById\('([^']+)'\)/);
      if (!match) return;
      const clinicId = match[1];
      const tdAcoes = acessarBtn.closest('td');
      const div = tdAcoes.querySelector('div') || tdAcoes;
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-editar-clinica';
      btn.innerHTML = '<i class="ti ti-edit"></i> Editar';
      btn.setAttribute('onclick', `abrirEditarClinica('${clinicId}')`);
      div.insertBefore(btn, div.firstChild);
    });
  }
  // observa mudanças na lista de clínicas
  const obs = new MutationObserver(() => adicionarBotoes());
  function start() {
    const lista = document.getElementById('clinicasList');
    if (lista) { obs.observe(lista, { childList: true, subtree: true }); adicionarBotoes(); }
    else setTimeout(start, 800);
  }
  start();
})();

console.log('✅ endereco-dinamico-fix.js carregado — endereço dinâmico por clínica');
