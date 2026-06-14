// ============================================================
// CLINICALEAD — SEMÁFORO VISUAL DA AGENDA + REGISTRO (PRONTUÁRIO)
// • Compareceu  → linha verde
// • Atendido    → linha dourada + botão abre registro do atendimento
// • 30 min após o horário sem comparecer → alerta vermelho (visual)
// • Botão "Atendido" abre modal: tipo + o que foi feito + próximo passo
//   (tudo opcional). Salvo na consulta (vira histórico do paciente).
// ============================================================

const SEMAFORO_CORES = {
  agendado:   { borda: 'transparent',        nome: 'var(--text-primary)' },
  confirmado: { borda: 'var(--blue, #5B8DB8)', nome: 'var(--text-primary)' },
  compareceu: { borda: '#3FB950',            nome: '#3FB950' },   // verde
  atendido:   { borda: 'var(--gold)',        nome: 'var(--gold)' }, // dourado
  faltou:     { borda: 'var(--coral)',       nome: 'var(--coral)' },
  atrasado:   { borda: '#E5534B',            nome: '#E5534B' },   // vermelho alerta (visual)
};

// Aplica o semáforo visual aos itens da agenda já renderizados
function aplicarSemaforoAgenda() {
  const itens = document.querySelectorAll('#daySchedule .sched-item, .sched-item');
  itens.forEach(item => {
    const onclick = item.getAttribute('onclick') || '';
    const m = onclick.match(/openEditConsulta\('([^']+)'\)/);
    if (!m) return;
    const consultaId = m[1];
    const consulta = (typeof CAL !== 'undefined' && CAL.consultas) ? CAL.consultas.find(c => c.id === consultaId) : null;
    if (!consulta) return;

    // Determina o status visual
    let statusVisual = consulta.status;
    if (consulta.atendido) statusVisual = 'atendido';
    // 30 min de tolerância: se ainda "agendado/confirmado" e passou do horário, alerta vermelho
    if ((consulta.status === 'agendado' || consulta.status === 'confirmado') && !consulta.atendido) {
      if (passou30min(consulta)) statusVisual = 'atrasado';
    }

    const cor = SEMAFORO_CORES[statusVisual] || SEMAFORO_CORES.agendado;

    // Aplica a cor na borda esquerda e no nome
    item.style.borderLeft = `3px solid ${cor.borda}`;
    item.style.paddingLeft = '17px';
    const nomeEl = item.querySelector('.sched-name');
    if (nomeEl) nomeEl.style.color = cor.nome;

    // Adiciona o botão "Atendido" (se compareceu e ainda não foi atendido)
    const acts = item.querySelector('.sched-acts');
    if (acts && consulta.status === 'compareceu' && !consulta.atendido && !acts.querySelector('.btn-atendido')) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-atendido';
      btn.style.cssText = 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);';
      btn.innerHTML = '<i class="ti ti-clipboard-check"></i> Atendido';
      btn.setAttribute('onclick', `event.stopPropagation();abrirRegistroAtendimento('${consultaId}')`);
      acts.appendChild(btn);
    }

    // Se já foi atendido, mostra selo "Atendido" + botão para ver/editar registro
    if (acts && consulta.atendido && !acts.querySelector('.btn-ver-registro')) {
      const selo = document.createElement('button');
      selo.className = 'btn btn-sm btn-ver-registro';
      selo.style.cssText = 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);';
      selo.innerHTML = '<i class="ti ti-file-text"></i> Ver registro';
      selo.setAttribute('onclick', `event.stopPropagation();abrirRegistroAtendimento('${consultaId}')`);
      acts.appendChild(selo);
    }
  });
}

// Verifica se passaram 30 min do horário da consulta (no dia de hoje)
function passou30min(consulta) {
  try {
    if (!consulta.data || !consulta.hora) return false;
    const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
    if (consulta.data !== hojeBRT) return false; // só aplica alerta no dia de hoje
    const [h, min] = String(consulta.hora).split(':').map(Number);
    const agora = new Date(Date.now() - 3 * 3600 * 1000); // BRT
    const minutosAgora = agora.getUTCHours() * 60 + agora.getUTCMinutes();
    const minutosConsulta = h * 60 + (min || 0);
    return minutosAgora > minutosConsulta + 30;
  } catch (e) { return false; }
}

// ── Modal de registro do atendimento (prontuário) ────────────
function abrirRegistroAtendimento(consultaId) {
  const consulta = CAL.consultas.find(c => c.id === consultaId);
  if (!consulta) return;
  const lead = (STATE.leads || []).find(l => l.id === consulta.lead_id);

  if (!document.getElementById('modalRegistroAtend')) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'modalRegistroAtend';
    ov.innerHTML = `
      <div class="modal" style="max-width:520px;width:96vw;">
        <div class="modal-header">
          <h3><i class="ti ti-clipboard-check" style="margin-right:8px;color:var(--gold);"></i>Registro do atendimento</h3>
          <button class="btn btn-ghost btn-icon" onclick="closeModal('modalRegistroAtend')"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="max-height:72vh;overflow-y:auto;">
          <input type="hidden" id="regConsultaId"/>
          <div id="regPaciente" style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;"></div>
          <div class="form-group">
            <label class="form-label">Tipo de atendimento</label>
            <select class="form-input" id="regTipo">
              <option value="">Selecione...</option>
              <option value="avaliacao">Avaliação</option>
              <option value="atendimento">Atendimento / Procedimento</option>
              <option value="retorno">Retorno</option>
              <option value="manutencao">Manutenção</option>
              <option value="urgencia">Urgência</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">O que foi feito?</label>
            <textarea class="form-input" id="regTexto" rows="4" style="resize:vertical;" placeholder="Ex: Avaliação clínica. Indicado clareamento + 2 restaurações nos dentes 14 e 15."></textarea>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label">Próximo passo sugerido</label>
            <input class="form-input" id="regProximo" placeholder="Ex: Retorno em 30 dias para troca do fio"/>
          </div>
        </div>
        <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn" onclick="closeModal('modalRegistroAtend')">Cancelar</button>
          <button class="btn btn-primary" onclick="salvarRegistroAtendimento()"><i class="ti ti-check"></i> Salvar e marcar atendido</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }

  document.getElementById('regConsultaId').value = consultaId;
  document.getElementById('regPaciente').innerHTML =
    `<strong>${lead?.nome || 'Paciente'}</strong> · ${formatarDataConsulta(consulta)} às ${(consulta.hora || '').slice(0,5)}`;
  document.getElementById('regTipo').value = consulta.registro_tipo || '';
  document.getElementById('regTexto').value = consulta.registro_texto || '';
  document.getElementById('regProximo').value = consulta.registro_proximo || '';
  openModal('modalRegistroAtend');
}

function formatarDataConsulta(consulta) {
  try {
    return new Date(consulta.data + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  } catch (e) { return consulta.data || ''; }
}

async function salvarRegistroAtendimento() {
  const consultaId = document.getElementById('regConsultaId').value;
  const dados = {
    atendido: true,
    atendido_em: new Date().toISOString(),
    registro_tipo: document.getElementById('regTipo').value || null,
    registro_texto: document.getElementById('regTexto').value.trim() || null,
    registro_proximo: document.getElementById('regProximo').value.trim() || null,
  };

  const { error } = await db.from('consultas').update(dados).eq('id', consultaId);
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }

  // Atualiza local
  const c = CAL.consultas.find(x => x.id === consultaId);
  if (c) Object.assign(c, dados);

  toast('Atendimento registrado! ✓');
  closeModal('modalRegistroAtend');
  if (typeof renderDaySchedule === 'function' && CAL.selectedDate) renderDaySchedule(CAL.selectedDate);
}

// ── Intercepta renderDaySchedule pra aplicar o semáforo ──────
(function () {
  function instalar() {
    if (typeof renderDaySchedule !== 'function') return false;
    const _orig = renderDaySchedule;
    renderDaySchedule = function (...args) {
      _orig.apply(this, args);
      setTimeout(aplicarSemaforoAgenda, 30);
    };
    console.log('✅ agenda-semaforo-fix.js carregado — semáforo + registro de atendimento');
    return true;
  }
  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }

  // Reaplica o semáforo a cada minuto (pra o alerta de 30min aparecer sozinho)
  setInterval(() => {
    if (document.querySelector('.sched-item')) aplicarSemaforoAgenda();
  }, 60000);
})();
