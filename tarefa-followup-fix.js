// ============================================================
// CLINICALEAD — Tarefa de follow-up pelo inbox
// Botão "Tarefa" na barra de digitação da conversa → cria uma
// tarefa manual (data + hora + descrição) que aparece no
// dashboard SÓ quando chega a data/hora agendada (aparecer_em).
//
// Ex: "entra em contato daqui 1 mês" → cria tarefa com
// aparecer_em = hoje+30d → só aparece no dashboard nessa data.
//
// Depende da tabela tarefas_manuais (criada via SQL).
// Carregar por último no index (depois do tarefas-fix).
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || null); }

  // ── 1) Injeta o botão "Tarefa" na barra de digitação ──────────
  // (o header do chat fica ATRÁS da topbar — os primeiros ~62px são
  //  cobertos pela barra superior. Por isso o botão vai na barra de
  //  baixo, junto dos ícones de emoji/imagem/áudio, que é clicável.)
  function injetarBotaoTarefa() {
    if (typeof INBOX === 'undefined' || !INBOX.activeChat) return;
    // pode haver mais de uma .chat-input-btns no DOM (uma oculta).
    // Pega só a VISÍVEL (offsetParent != null e com largura real).
    const barras = Array.from(document.querySelectorAll('.chat-input-btns'));
    const barra = barras.find(b => b.offsetParent !== null && b.getBoundingClientRect().width > 0);
    if (!barra) return;
    // remove botões-fantasma de barras ocultas/antigas
    document.querySelectorAll('.btn-criar-tarefa').forEach(b => {
      if (!barra.contains(b)) b.remove();
    });
    if (barra.querySelector('.btn-criar-tarefa')) return;

    const btn = document.createElement('button');
    btn.className = 'chat-input-btn btn-criar-tarefa';
    btn.type = 'button';
    btn.title = 'Criar tarefa de retorno';
    btn.innerHTML = '<i class="ti ti-calendar-plus"></i>';
    barra.insertBefore(btn, barra.firstChild);
  }

  // Listener DELEGADO no document (captura): funciona mesmo se a
  // barra for re-renderizada. Detecta o clique no botão.
  document.addEventListener('click', function (e) {
    const btn = e.target.closest && e.target.closest('.btn-criar-tarefa');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.abrirFormTarefa === 'function') window.abrirFormTarefa();
    }
  }, true);

  // ── 2) Abre o formulário de nova tarefa ───────────────────────
  window.abrirFormTarefa = function () {
    const chat = INBOX.activeChat;
    if (!chat) return;
    const nome = chat.name || 'Contato';
    const telefone = chat.phone || (chat.lead && chat.lead.telefone) || '';
    const leadId = chat.lead ? chat.lead.id : null;

    const amanha = new Date(Date.now() + 24 * 3600 * 1000);
    const dataPadrao = amanha.toISOString().split('T')[0];

    let modal = document.getElementById('modalTarefaFollowup');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modalTarefaFollowup';
    modal.innerHTML = `
      <div class="modal" style="max-width:460px;width:96vw;">
        <div class="modal-header">
          <h3><i class="ti ti-calendar-plus" style="margin-right:8px;color:var(--gold);"></i>Criar tarefa de retorno</h3>
          <button class="btn btn-ghost btn-icon" onclick="document.getElementById('modalTarefaFollowup').remove()"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="padding:20px;">
          <p style="font-size:13px;color:var(--text-secondary);margin:0 0 16px;">
            Para <strong>${nome}</strong> — a tarefa aparece no painel só na data/hora marcada.
          </p>
          <div style="display:flex;gap:10px;margin-bottom:12px;">
            <div style="flex:1;">
              <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Data</label>
              <input type="date" id="tfData" class="form-input" value="${dataPadrao}" style="width:100%;">
            </div>
            <div style="width:110px;">
              <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Hora</label>
              <input type="time" id="tfHora" class="form-input" value="09:00" style="width:100%;">
            </div>
          </div>
          <div style="margin-bottom:12px;">
            <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">O que fazer</label>
            <input type="text" id="tfTitulo" class="form-input" placeholder="Ex: Ligar para confirmar interesse" style="width:100%;">
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
            <button class="btn btn-sm" onclick="tfAtalhoData(1)" style="font-size:11px;">Amanhã</button>
            <button class="btn btn-sm" onclick="tfAtalhoData(7)" style="font-size:11px;">Em 1 semana</button>
            <button class="btn btn-sm" onclick="tfAtalhoData(15)" style="font-size:11px;">Em 15 dias</button>
            <button class="btn btn-sm" onclick="tfAtalhoData(30)" style="font-size:11px;">Em 1 mês</button>
            <button class="btn btn-sm" onclick="tfAtalhoData(90)" style="font-size:11px;">Em 3 meses</button>
          </div>
          <button class="btn btn-primary" style="width:100%;" onclick="salvarTarefaFollowup('${leadId || ''}','${telefone}','${nome.replace(/'/g, '')}')">
            <i class="ti ti-check"></i> Criar tarefa
          </button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  };

  window.tfAtalhoData = function (dias) {
    const d = new Date(Date.now() + dias * 24 * 3600 * 1000);
    const inp = document.getElementById('tfData');
    if (inp) inp.value = d.toISOString().split('T')[0];
  };

  // ── 3) Salva a tarefa ─────────────────────────────────────────
  window.salvarTarefaFollowup = async function (leadId, telefone, nome) {
    const data = document.getElementById('tfData').value;
    const hora = document.getElementById('tfHora').value || '09:00';
    const titulo = document.getElementById('tfTitulo').value.trim();
    if (!data) { if (typeof toast === 'function') toast('Escolha a data', 'error'); return; }
    if (!titulo) { if (typeof toast === 'function') toast('Escreva o que fazer', 'error'); return; }

    const clinic = currentClinic();
    const aparecerEm = new Date(`${data}T${hora}:00-03:00`).toISOString();

    try {
      const { error } = await getDb().from('tarefas_manuais').insert({
        clinic_id: clinic.id,
        lead_id: leadId || null,
        telefone: telefone || null,
        titulo: titulo,
        aparecer_em: aparecerEm,
        concluida: false,
      });
      if (error) { if (typeof toast === 'function') toast('Erro: ' + error.message, 'error'); return; }
      if (typeof toast === 'function') {
        const dataFmt = data.split('-').reverse().join('/');
        toast(`Tarefa criada! Aparece em ${dataFmt} às ${hora} ⏰`);
      }
      const modal = document.getElementById('modalTarefaFollowup');
      if (modal) modal.remove();
      // recarrega já (caso a tarefa seja pra agora/passado)
      await carregarTarefasManuais();
      if (typeof tarefasGerar === 'function') tarefasGerar();
      if (typeof tarefasRenderCard === 'function') tarefasRenderCard();
      if (typeof tarefasAtualizarBadge === 'function') tarefasAtualizarBadge();
    } catch (e) {
      if (typeof toast === 'function') toast('Erro ao criar tarefa', 'error');
    }
  };

  // ── 4) Integra as tarefas manuais VENCIDAS no dashboard ───────
  window.TAREFAS_MANUAIS_CACHE = [];

  async function carregarTarefasManuais() {
    if (typeof currentClinic !== 'function') return;
    const clinic = currentClinic();
    if (!clinic) return;
    const agora = new Date().toISOString();
    try {
      const { data } = await getDb().from('tarefas_manuais')
        .select('*')
        .eq('clinic_id', clinic.id)
        .eq('concluida', false)
        .lte('aparecer_em', agora)
        .order('aparecer_em', { ascending: true });
      window.TAREFAS_MANUAIS_CACHE = data || [];
    } catch (e) { window.TAREFAS_MANUAIS_CACHE = []; }
  }

  if (typeof window.tarefasGerar === 'function' && !window.tarefasGerar.__followupFix) {
    const _origGerar = window.tarefasGerar;
    window.tarefasGerar = function () {
      _origGerar.apply(this, arguments);
      try {
        if (typeof TAREFAS === 'undefined' || !TAREFAS.lista) return;
        (window.TAREFAS_MANUAIS_CACHE || []).forEach(t => {
          const chave = `manual:${t.id}`;
          if (typeof tarefaEstaOculta === 'function' && tarefaEstaOculta(chave)) return;
          if (TAREFAS.lista.some(x => x.chave === chave)) return;
          const dt = new Date(t.aparecer_em);
          const dataFmt = dt.toLocaleDateString('pt-BR').slice(0, 5);
          TAREFAS.lista.push({
            chave,
            prio: 2,
            icon: 'ti-calendar-check',
            titulo: `📞 ${t.titulo}`,
            desc: `Retorno agendado${t.telefone ? ' — ' + t.telefone : ''} (marcado para ${dataFmt})`,
            telefone: t.telefone || null,
            _tarefaManualId: t.id,
          });
        });
        TAREFAS.lista.sort((a, b) => a.prio - b.prio);
      } catch (e) { console.error('[tarefa-followup] erro:', e); }
    };
    window.tarefasGerar.__followupFix = true;
  }

  carregarTarefasManuais();
  setInterval(async () => {
    await carregarTarefasManuais();
    if (typeof tarefasGerar === 'function') tarefasGerar();
    if (typeof tarefasRenderCard === 'function') tarefasRenderCard();
    if (typeof tarefasAtualizarBadge === 'function') tarefasAtualizarBadge();
  }, 60000);

  setInterval(injetarBotaoTarefa, 800);

  console.log('✅ tarefa-followup-fix.js carregado — tarefas de retorno pelo inbox');
})();
