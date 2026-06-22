// ============================================================
// CLINICALEAD — MOTOR DE AUTOMAÇÕES (TELA / Fase 2)
// Página "Automações Pro" onde a clínica (e o admin) vê e cria
// automações genéricas no formato de FRASE:
//   "Quando [evento], esperar [tempo], então [ação]: [mensagem]"
// - Globais (do sistema): a clínica só liga/desliga (não edita/exclui).
// - Personalizadas: a clínica cria/edita/exclui as próprias.
// Lê/grava em automacoes_regras. Desativação de global em
// automacoes_clinica_off.
// ============================================================

(function () {
  'use strict';

  const AP = { regras: [], desativadas: new Set() };

  // catálogo de eventos (valor técnico -> rótulo humano)
  const EVENTOS = [
    { v: 'lead_criado',        l: 'um lead novo entra' },
    { v: 'lead_agendou',       l: 'o lead agenda uma consulta' },
    { v: 'compareceu',         l: 'o paciente comparece' },
    { v: 'faltou',             l: 'o paciente falta' },
    { v: 'dias_sem_resposta',  l: 'o lead fica sem responder' },
    { v: 'aniversario',        l: 'é o aniversário do paciente' },
    { v: 'apos_consulta',      l: 'passa um tempo após a consulta' },
    { v: 'mensalidade_vence',  l: 'vence uma mensalidade do paciente' },
  ];
  const ACOES = [
    { v: 'mensagem',      l: 'enviar uma mensagem no WhatsApp' },
    { v: 'tarefa',        l: 'criar uma tarefa para a equipe' },
    { v: 'mudar_status',  l: 'mudar o status do lead' },
  ];
  const STATUS_LEAD = ['novo', 'contato', 'agendado', 'compareceu', 'fechado', 'sem_resposta'];

  function rotuloEvento(v) { return (EVENTOS.find(e => e.v === v) || {}).l || v; }
  function rotuloAcao(v) { return (ACOES.find(a => a.v === v) || {}).l || v; }

  function ehAdminMaster() {
    const role = STATE?.profile?.role;
    return role === 'admin' || role === 'administrador';
  }

  // eventos que usam "espera" (tempo). 'lead_criado' é instantâneo puro.
  function usaEspera(evento) {
    return ['dias_sem_resposta', 'apos_consulta', 'faltou', 'compareceu', 'lead_agendou'].includes(evento);
  }

  // ── carrega regras do banco (globais + da clínica) ───────
  async function carregarRegras() {
    const clinic = currentClinic();
    if (!clinic) { AP.regras = []; return; }
    const { data: regras } = await db.from('automacoes_regras')
      .select('*')
      .or(`global.eq.true,clinic_id.eq.${clinic.id}`)
      .order('created_at', { ascending: false });
    AP.regras = regras || [];

    // quais globais esta clínica desativou
    const { data: off } = await db.from('automacoes_clinica_off')
      .select('regra_id').eq('clinic_id', clinic.id);
    AP.desativadas = new Set((off || []).map(o => o.regra_id));
  }

  // uma regra está ativa PRA ESTA CLÍNICA?
  function regraAtivaAqui(r) {
    if (r.global) return r.ativo && !AP.desativadas.has(r.id); // global: ativo e não desativada aqui
    return r.ativo; // própria: usa o ativo dela
  }

  // monta a "frase" legível de uma regra
  function fraseDaRegra(r) {
    if (r.evento === 'mensalidade_vence') {
      const o = Number(r.espera_valor || 0);
      const quando = o < 0 ? `faltando ${-o} dia${-o === 1 ? '' : 's'} para o vencimento`
        : (o > 0 ? `${o} dia${o === 1 ? '' : 's'} após o vencimento` : 'no dia do vencimento');
      let fm = `<b>Quando</b> uma mensalidade está ${quando}, <b>então</b> ${rotuloAcao(r.acao)}`;
      if (r.acao === 'mudar_status' && r.nova_status) fm += ` para "${r.nova_status}"`;
      return fm;
    }
    let f = `<b>Quando</b> ${rotuloEvento(r.evento)}`;
    if (usaEspera(r.evento) && r.espera_valor > 0) {
      f += `, <b>após</b> ${r.espera_valor} ${r.espera_unidade}`;
    }
    f += `, <b>então</b> ${rotuloAcao(r.acao)}`;
    if (r.acao === 'mudar_status' && r.nova_status) f += ` para "${r.nova_status}"`;
    return f;
  }

  // ── garante a página ─────────────────────────────────────
  function garantirPagina() {
    if (document.getElementById('page-automacoes-pro')) return;
    const algumaPagina = document.querySelector('.page');
    const container = algumaPagina ? algumaPagina.parentElement : document.querySelector('main') || document.body;
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'page-automacoes-pro';
    page.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px;">
        <div>
          <h1 style="margin:0;">Automações</h1>
          <p style="color:var(--text-muted);font-size:13px;margin:4px 0 0;">Crie mensagens, lembretes e tarefas automáticas</p>
        </div>
        <button class="btn btn-primary" onclick="apAbrirCriar()"><i class="ti ti-plus"></i> Criar automação</button>
      </div>
      <div id="apLista"></div>`;
    container.appendChild(page);
  }

  // ── abre a página ────────────────────────────────────────
  window.abrirAutomacoesPro = async function () {
    garantirPagina();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-automacoes-pro').classList.add('active');
    const item = document.getElementById('navAutomacoesPro');
    if (item) item.classList.add('active');
    document.getElementById('apLista').innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);">Carregando…</div>';
    await carregarRegras();
    renderLista();
  };

  // ── renderiza a lista de automações ──────────────────────
  function renderLista() {
    const cont = document.getElementById('apLista');
    if (!cont) return;
    const admin = ehAdminMaster();

    if (!AP.regras.length) {
      cont.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--text-secondary);">
        Nenhuma automação ainda. Clique em <b>Criar automação</b> para começar! 🚀</div>`;
      return;
    }

    const globais = AP.regras.filter(r => r.global);
    const proprias = AP.regras.filter(r => !r.global);

    const cardRegra = (r) => {
      const ativa = regraAtivaAqui(r);
      const ehGlobal = r.global;
      // admin pode editar/excluir tudo; clínica só as próprias
      const podeEditar = admin || !ehGlobal;
      return `
        <div class="card" style="padding:16px;margin-bottom:10px;border-left:3px solid ${ativa ? 'var(--gold)' : 'var(--border-subtle,#333)'};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div style="flex:1;">
              <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${r.nome || 'Automação'}
                ${ehGlobal ? '<span style="font-size:10px;background:var(--gold-pale);color:var(--gold);padding:2px 8px;border-radius:10px;margin-left:6px;">Do sistema</span>' : ''}
              </div>
              <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">${fraseDaRegra(r)}</div>
              ${r.mensagem ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;font-style:italic;">"${(r.mensagem || '').slice(0, 80)}${(r.mensagem || '').length > 80 ? '…' : ''}"</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
              <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;">
                <input type="checkbox" ${ativa ? 'checked' : ''} onchange="apToggle('${r.id}', this.checked)" style="opacity:0;width:0;height:0;">
                <span style="position:absolute;inset:0;background:${ativa ? 'var(--gold)' : 'var(--border-subtle,#444)'};border-radius:24px;transition:0.2s;">
                  <span style="position:absolute;height:18px;width:18px;left:${ativa ? '23px' : '3px'};top:3px;background:#fff;border-radius:50%;transition:0.2s;"></span>
                </span>
              </label>
              ${podeEditar ? `<div style="display:flex;gap:4px;">
                <button class="btn btn-sm btn-ghost btn-icon" onclick="apEditar('${r.id}')" title="Editar"><i class="ti ti-edit"></i></button>
                <button class="btn btn-sm btn-ghost btn-icon" onclick="apExcluir('${r.id}')" title="Excluir"><i class="ti ti-trash" style="color:var(--coral);"></i></button>
              </div>` : ''}
            </div>
          </div>
        </div>`;
    };

    let html = '';
    if (globais.length) {
      html += `<div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px;">Do sistema</div>`;
      html += globais.map(cardRegra).join('');
    }
    if (proprias.length) {
      html += `<div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:18px 0 8px;">Suas automações</div>`;
      html += proprias.map(cardRegra).join('');
    }
    cont.innerHTML = html;
  }

  // ── liga/desliga uma automação ───────────────────────────
  window.apToggle = async function (id, ligar) {
    const r = AP.regras.find(x => x.id === id);
    if (!r) return;
    const clinic = currentClinic();
    try {
      if (r.global) {
        // global: usa a tabela de exceções (desativar = inserir; ativar = remover)
        if (ligar) {
          await db.from('automacoes_clinica_off').delete().eq('clinic_id', clinic.id).eq('regra_id', id);
          AP.desativadas.delete(id);
        } else {
          await db.from('automacoes_clinica_off').upsert({ clinic_id: clinic.id, regra_id: id }, { onConflict: 'clinic_id,regra_id' });
          AP.desativadas.add(id);
        }
      } else {
        // própria: muda o ativo na regra
        await db.from('automacoes_regras').update({ ativo: ligar }).eq('id', id);
        r.ativo = ligar;
      }
      if (typeof toast === 'function') toast(ligar ? 'Automação ativada ✓' : 'Automação desativada');
      renderLista();
    } catch (e) {
      if (typeof toast === 'function') toast('Erro ao salvar', 'error');
      console.error('[ap toggle]', e);
    }
  };

  // ── modal de criar/editar ────────────────────────────────
  window.apAbrirCriar = function (regraExistente) {
    const r = regraExistente || {};
    const ehEdicao = !!regraExistente;
    const admin = ehAdminMaster();
    // pré-preenche o controle de mensalidade a partir do offset (espera_valor sinalizado)
    const _mo = Number(r.espera_valor || 0);
    const mensQuando = (r.evento === 'mensalidade_vence')
      ? (_mo < 0 ? 'antes' : (_mo > 0 ? 'depois' : 'dia')) : 'antes';
    const mensDias = Math.abs(_mo) || 3;

    if (document.getElementById('apModal')) document.getElementById('apModal').remove();
    const ov = document.createElement('div');
    ov.id = 'apModal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML = `
      <div style="max-width:520px;width:100%;max-height:88vh;overflow-y:auto;background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#3a3320);border-radius:16px;">
        <div style="padding:20px 22px;border-bottom:1px solid var(--border-subtle,#2a2a2a);display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:17px;">${ehEdicao ? 'Editar automação' : 'Criar automação'}</h3>
          <button onclick="document.getElementById('apModal').remove()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:20px;"><i class="ti ti-x"></i></button>
        </div>
        <div style="padding:20px 22px;display:flex;flex-direction:column;gap:16px;">

          <div>
            <label class="form-label" style="font-size:12px;color:var(--text-muted);">Nome da automação</label>
            <input class="form-input" id="apNome" value="${(r.nome || '').replace(/"/g, '&quot;')}" placeholder="Ex: Boas-vindas ao novo lead" style="width:100%;"/>
          </div>

          <div style="background:var(--bg-elevated);border-radius:10px;padding:14px;font-size:14px;line-height:2.2;">
            <span style="color:var(--gold);font-weight:600;">Quando</span>
            <select class="form-input" id="apEvento" onchange="apAtualizarCampos()" style="display:inline-block;width:auto;font-size:13px;padding:4px 8px;">
              ${EVENTOS.map(e => `<option value="${e.v}" ${r.evento === e.v ? 'selected' : ''}>${e.l}</option>`).join('')}
            </select>

            <span id="apEsperaBloco">
              <span style="color:var(--gold);font-weight:600;">, após</span>
              <input type="number" id="apEsperaValor" value="${r.espera_valor || 0}" min="0" style="width:60px;font-size:13px;padding:4px 8px;" class="form-input"/>
              <select class="form-input" id="apEsperaUnidade" style="display:inline-block;width:auto;font-size:13px;padding:4px 8px;">
                <option value="horas" ${r.espera_unidade === 'horas' ? 'selected' : ''}>horas</option>
                <option value="dias" ${r.espera_unidade === 'dias' ? 'selected' : ''}>dias</option>
              </select>
            </span>

            <br>
            <span style="color:var(--gold);font-weight:600;">então</span>
            <select class="form-input" id="apAcao" onchange="apAtualizarCampos()" style="display:inline-block;width:auto;font-size:13px;padding:4px 8px;">
              ${ACOES.map(a => `<option value="${a.v}" ${r.acao === a.v ? 'selected' : ''}>${a.l}</option>`).join('')}
            </select>
          </div>

          <div id="apBlocoMensagem">
            <label class="form-label" style="font-size:12px;color:var(--text-muted);">Mensagem</label>
            <textarea class="form-input" id="apMensagem" rows="4" placeholder="Oi {nome}! ..." style="width:100%;resize:vertical;">${r.mensagem || ''}</textarea>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Variáveis: {nome}, {clinica}, {valor}, {vencimento}, {procedimento}, {data}, {hora}</div>
          </div>

          <div id="apBlocoStatus" style="display:none;">
            <label class="form-label" style="font-size:12px;color:var(--text-muted);">Novo status do lead</label>
            <select class="form-input" id="apNovoStatus" style="width:100%;">
              ${STATUS_LEAD.map(s => `<option value="${s}" ${r.nova_status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>

          <div id="apBlocoMensalidade" style="display:none;">
            <label class="form-label" style="font-size:12px;color:var(--text-muted);">Quando avisar</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <select class="form-input" id="apMensQuando" onchange="apMensQuandoMudou()" style="display:inline-block;width:auto;font-size:13px;padding:4px 8px;">
                <option value="antes" ${mensQuando === 'antes' ? 'selected' : ''}>dias ANTES do vencimento</option>
                <option value="dia" ${mensQuando === 'dia' ? 'selected' : ''}>no DIA do vencimento</option>
                <option value="depois" ${mensQuando === 'depois' ? 'selected' : ''}>dias DEPOIS do vencimento</option>
              </select>
              <input type="number" id="apMensDias" min="1" value="${mensDias}" class="form-input" style="width:70px;font-size:13px;padding:4px 8px;"/>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Ex.: "3 dias antes", "no dia", "2 dias depois". Aplica a todas as mensalidades dos pacientes.</div>
          </div>

          ${admin ? `
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="apGlobal" ${r.global ? 'checked' : ''}>
            <span>Disponibilizar para <b>todas as clínicas</b> (automação do sistema)</span>
          </label>` : ''}

          <button class="btn btn-primary" onclick="apSalvar('${ehEdicao ? r.id : ''}')" style="width:100%;">
            <i class="ti ti-device-floppy"></i> ${ehEdicao ? 'Salvar alterações' : 'Criar automação'}
          </button>
          <div id="apMsgErro" style="font-size:12px;color:var(--coral);min-height:14px;"></div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    apAtualizarCampos();
  };

  // mostra/esconde campos conforme evento e ação
  window.apAtualizarCampos = function () {
    const evento = document.getElementById('apEvento')?.value;
    const acao = document.getElementById('apAcao')?.value;
    const ehMens = (evento === 'mensalidade_vence');
    // bloco de espera só pra eventos temporais (mensalidade usa o próprio controle)
    const esperaBloco = document.getElementById('apEsperaBloco');
    if (esperaBloco) esperaBloco.style.display = (usaEspera(evento) && !ehMens) ? 'inline' : 'none';
    // controle específico de mensalidade (antes/no dia/depois)
    const blocoMens = document.getElementById('apBlocoMensalidade');
    if (blocoMens) blocoMens.style.display = ehMens ? 'block' : 'none';
    if (ehMens) apMensQuandoMudou();
    // mensagem vs status conforme ação
    const blocoMsg = document.getElementById('apBlocoMensagem');
    const blocoStatus = document.getElementById('apBlocoStatus');
    if (blocoMsg) blocoMsg.style.display = (acao === 'mensagem' || acao === 'tarefa') ? 'block' : 'none';
    if (blocoStatus) blocoStatus.style.display = (acao === 'mudar_status') ? 'block' : 'none';
  };

  // mostra/esconde o nº de dias conforme "antes/no dia/depois"
  window.apMensQuandoMudou = function () {
    const q = document.getElementById('apMensQuando')?.value;
    const dias = document.getElementById('apMensDias');
    if (dias) dias.style.display = (q === 'dia') ? 'none' : '';
  };

  // ── salva (cria ou edita) ────────────────────────────────
  window.apSalvar = async function (idExistente) {
    const clinic = currentClinic();
    const erro = document.getElementById('apMsgErro');
    const setErro = (t) => { if (erro) erro.textContent = t || ''; };

    const nome = (document.getElementById('apNome').value || '').trim();
    if (!nome) { setErro('Dê um nome à automação.'); return; }
    const evento = document.getElementById('apEvento').value;
    const acao = document.getElementById('apAcao').value;
    let espera_valor, espera_unidade;
    if (evento === 'mensalidade_vence') {
      const q = document.getElementById('apMensQuando').value;
      const d = parseInt(document.getElementById('apMensDias').value) || 0;
      espera_valor = (q === 'antes') ? -Math.abs(d) : (q === 'depois' ? Math.abs(d) : 0);
      espera_unidade = 'dias';
    } else {
      espera_valor = usaEspera(evento) ? (parseInt(document.getElementById('apEsperaValor').value) || 0) : 0;
      espera_unidade = document.getElementById('apEsperaUnidade')?.value || 'horas';
    }
    const mensagem = (acao === 'mensagem' || acao === 'tarefa') ? (document.getElementById('apMensagem').value || '').trim() : null;
    const nova_status = (acao === 'mudar_status') ? document.getElementById('apNovoStatus').value : null;
    const ehGlobalCheck = document.getElementById('apGlobal');
    const global = ehGlobalCheck ? ehGlobalCheck.checked : false;

    if ((acao === 'mensagem' || acao === 'tarefa') && !mensagem) { setErro('Escreva a mensagem.'); return; }

    const dados = {
      nome, evento, espera_valor, espera_unidade, acao, mensagem, nova_status,
      ativo: true,
      global,
      clinic_id: global ? null : clinic.id,
    };

    try {
      if (idExistente) {
        await db.from('automacoes_regras').update(dados).eq('id', idExistente);
      } else {
        await db.from('automacoes_regras').insert(dados);
      }
      document.getElementById('apModal').remove();
      if (typeof toast === 'function') toast(idExistente ? 'Automação salva ✓' : 'Automação criada! 🎉');
      await carregarRegras();
      renderLista();
    } catch (e) {
      setErro('Erro ao salvar: ' + (e.message || 'tente de novo'));
      console.error('[ap salvar]', e);
    }
  };

  window.apEditar = function (id) {
    const r = AP.regras.find(x => x.id === id);
    if (r) apAbrirCriar(r);
  };

  window.apExcluir = async function (id) {
    if (!confirm('Excluir esta automação? Esta ação não pode ser desfeita.')) return;
    try {
      await db.from('automacoes_regras').delete().eq('id', id);
      if (typeof toast === 'function') toast('Automação excluída');
      await carregarRegras();
      renderLista();
    } catch (e) {
      if (typeof toast === 'function') toast('Erro ao excluir', 'error');
    }
  };

  // ── injeta item no menu lateral ──────────────────────────
  function injetarMenu() {
    if (document.getElementById('navAutomacoesPro')) return true;
    const ref = document.querySelector('.nav-item[data-page="automacoes"]');
    if (!ref) return false;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navAutomacoesPro';
    btn.innerHTML = '<i class="ti ti-bolt"></i> Automações Pro';
    btn.onclick = function () { abrirAutomacoesPro(); };
    ref.parentNode.insertBefore(btn, ref.nextSibling);
    return true;
  }

  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    garantirPagina();
    injetarMenu();
    let n = 0;
    const iv = setInterval(() => { injetarMenu(); if (++n > 30) clearInterval(iv); }, 600);
    console.log('✅ automacoes-pro-fix.js carregado');
    return true;
  }

  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }
})();
