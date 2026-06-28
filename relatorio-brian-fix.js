// ============================================================
// CLINICALEAD — RELATÓRIO "AGENDAMENTOS IA" (dashboard do Brian)
// Aba nova no menu que mostra o impacto do Brian IA: leads captados,
// consultas agendadas, mensagens respondidas, conversão — por período.
// Serve pra você acompanhar E pra mostrar pro cliente (prova de valor).
// Carregar como script novo no index.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }
  function ehAdminMaster() {
    const role = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return role === 'admin' || role === 'administrador';
  }

  const RB = { periodo: 30, dataIni: null, dataFim: null, escopo: 'atual', clinicasLista: [] };
  // escopo: 'atual' (clínica selecionada) | 'todas' (consolidado) | <clinic_id> (uma específica)

  // ── cria a página (uma vez) ──
  function garantirPagina() {
    const existente = document.getElementById('page-relatorio-brian');
    // container correto: o mesmo .content onde ficam as outras páginas (page-dashboard, etc.)
    const container = document.querySelector('.content')
      || (document.getElementById('page-dashboard') || document.querySelector('.page'))?.parentElement
      || document.querySelector('.main-content') || document.body;

    if (existente) {
      // se por algum motivo foi criada no lugar errado (body), move pro container certo
      if (container && existente.parentElement !== container) container.appendChild(existente);
      return;
    }
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'page-relatorio-brian';
    page.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
        <div>
          <h1 style="margin:0;display:flex;align-items:center;gap:8px;"><i class="ti ti-robot" style="color:var(--gold,#C9A84C);"></i> Agendamentos IA</h1>
          <p style="color:var(--text-muted,#888);font-size:13px;margin:4px 0 0;">O impacto do Brian IA${ehAdminMaster() ? ' (visão de administrador)' : ' na sua clínica'}</p>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <select id="rbEscopo" class="rb-data" style="display:none;font-weight:600;padding:7px 10px;"></select>
          <div id="rbPeriodos" style="display:flex;gap:6px;">
            <button class="rb-per" data-d="7">7 dias</button>
            <button class="rb-per" data-d="30">30 dias</button>
            <button class="rb-per" data-d="90">90 dias</button>
          </div>
          <div style="display:flex;gap:6px;align-items:center;border-left:1px solid var(--gold-border,#333);padding-left:10px;">
            <input type="date" id="rbDataIni" class="rb-data" title="Data inicial">
            <span style="color:var(--text-muted,#888);font-size:12px;">até</span>
            <input type="date" id="rbDataFim" class="rb-data" title="Data final">
            <button id="rbAplicarData" class="rb-per">Aplicar</button>
          </div>
        </div>
      </div>
      <div id="rbConteudo"><div style="padding:40px;text-align:center;color:var(--text-muted,#888);">Carregando…</div></div>`;
    container.appendChild(page);

    const st = document.createElement('style');
    st.textContent = `
      .rb-per{padding:7px 16px;border-radius:8px;border:1px solid var(--gold-border,#333);background:transparent;color:var(--text-secondary,#888);cursor:pointer;font-size:13px;font-weight:600;}
      .rb-per.active{background:var(--gold,#C9A84C);color:#0A0A0B;border-color:var(--gold,#C9A84C);}
      .rb-data{padding:6px 8px;border-radius:7px;border:1px solid var(--gold-border,#333);background:var(--bg-base,#0A0A0B);color:var(--text-primary,#F0EAD6);font-size:12px;}
      .rb-kpi{background:var(--bg-card,#1C1C20);border:1px solid var(--gold-border,rgba(201,168,76,0.2));border-radius:14px;padding:22px;}
      .rb-kpi-num{font-size:34px;font-weight:800;color:var(--gold,#C9A84C);line-height:1;}
      .rb-kpi-lbl{font-size:13px;color:var(--text-secondary,#8A8570);margin-top:8px;}`;
    page.appendChild(st);
  }

  // ── injeta item no menu lateral ──
  function injetarMenu() {
    if (document.getElementById('navRelatorioBrian')) return true;
    // coloca perto de "Brian IA" ou de "Relatórios"
    const ref = document.querySelector('.nav-item[data-page="relatorios"]')
             || document.querySelector('.nav-item[data-page="brian"]')
             || document.querySelector('.nav-item[data-page="automacoes"]');
    if (!ref) return false;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navRelatorioBrian';
    btn.innerHTML = '<i class="ti ti-robot"></i> Agendamentos IA';
    btn.onclick = function () { abrirRelatorioBrian(); };
    ref.parentNode.insertBefore(btn, ref.nextSibling);
    return true;
  }

  window.abrirRelatorioBrian = async function () {
    garantirPagina();
    // usa o MESMO padrão das outras páginas: só a classe 'active' controla a exibição
    // (o CSS do sistema já cuida do display via .page / .page.active)
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const pg = document.getElementById('page-relatorio-brian');
    pg.classList.add('active');
    window.scrollTo(0, 0);
    const item = document.getElementById('navRelatorioBrian');
    if (item) item.classList.add('active');

    // ── SELETOR DE CLÍNICA (só admin master) ──
    const selEscopo = document.getElementById('rbEscopo');
    if (selEscopo && ehAdminMaster()) {
      selEscopo.style.display = 'inline-block';
      if (!RB.clinicasLista.length) await carregarClinicas();
      const opcoes = ['<option value="todas">🌐 Todas as clínicas</option>']
        .concat(RB.clinicasLista.map(c => `<option value="${c.id}">${c.nome}</option>`));
      selEscopo.innerHTML = opcoes.join('');
      // valor atual: se escopo é 'atual', seleciona a clínica atual; senão o escopo
      const atual = clinicAtual();
      if (RB.escopo === 'atual' && atual) { RB.escopo = atual.id; }
      selEscopo.value = RB.escopo;
      selEscopo.onchange = () => { RB.escopo = selEscopo.value; carregarERender(); };
    } else if (selEscopo) {
      selEscopo.style.display = 'none';
      RB.escopo = 'atual'; // cliente comum: sempre só a própria clínica
    }

    // listeners dos períodos rápidos
    document.querySelectorAll('.rb-per[data-d]').forEach(b => {
      b.classList.toggle('active', !RB.dataIni && parseInt(b.dataset.d) === RB.periodo);
      b.onclick = () => {
        RB.periodo = parseInt(b.dataset.d); RB.dataIni = null; RB.dataFim = null;
        document.querySelectorAll('.rb-per[data-d]').forEach(x => x.classList.toggle('active', x === b));
        const di = document.getElementById('rbDataIni'); const df = document.getElementById('rbDataFim');
        if (di) di.value = ''; if (df) df.value = '';
        carregarERender();
      };
    });
    // listener da data personalizada
    const aplicar = document.getElementById('rbAplicarData');
    if (aplicar) aplicar.onclick = () => {
      const di = document.getElementById('rbDataIni').value;
      const df = document.getElementById('rbDataFim').value;
      if (!di || !df) { if (typeof toast === 'function') toast('Escolha as duas datas', 'error'); return; }
      if (di > df) { if (typeof toast === 'function') toast('Data inicial deve ser antes da final', 'error'); return; }
      RB.dataIni = di; RB.dataFim = df;
      document.querySelectorAll('.rb-per[data-d]').forEach(x => x.classList.remove('active'));
      carregarERender();
    };

    await carregarERender();
  };

  async function carregarERender() {
    const cont = document.getElementById('rbConteudo');
    if (cont) cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted,#888);">Carregando…</div>';
    const dados = await carregarDados();
    render(dados);
  }

  // carrega a lista de clínicas (só admin precisa)
  async function carregarClinicas() {
    const database = getDb();
    if (!database) return;
    try {
      const { data } = await database.from('clinicas').select('id, nome').order('nome');
      RB.clinicasLista = data || [];
    } catch (e) { console.error('[relatorio-brian] carregar clínicas', e); RB.clinicasLista = []; }
  }

  async function carregarDados() {
    const database = getDb();
    if (!database) return null;

    // define o ESCOPO de clínicas: todas, uma específica, ou a atual
    let clinicIds = null; // null = todas; array = filtra por essas
    let escopoLabel = '';
    if (RB.escopo === 'todas' && ehAdminMaster()) {
      clinicIds = null; // todas as clínicas (consolidado) — só admin
      escopoLabel = 'Todas as clínicas';
    } else if (RB.escopo && RB.escopo !== 'atual' && RB.escopo !== 'todas' && ehAdminMaster()) {
      clinicIds = [RB.escopo]; // uma clínica específica (só admin pode escolher outra)
      const c = RB.clinicasLista.find(x => x.id === RB.escopo);
      escopoLabel = c ? c.nome : '';
    } else {
      // cliente comum (ou admin com escopo 'atual'): SEMPRE só a clínica atual
      const clinic = clinicAtual();
      if (!clinic) return null;
      clinicIds = [clinic.id];
      escopoLabel = clinic.nome || '';
    }

    // define o intervalo: datas personalizadas OU últimos N dias
    let desde, ateInc, rotuloPeriodo;
    if (RB.dataIni && RB.dataFim) {
      desde = new Date(RB.dataIni + 'T00:00:00').toISOString();
      ateInc = new Date(RB.dataFim + 'T23:59:59').toISOString();
      const fmt = (s) => s.split('-').reverse().join('/');
      rotuloPeriodo = `${fmt(RB.dataIni)} a ${fmt(RB.dataFim)}`;
    } else {
      desde = new Date(Date.now() - RB.periodo * 86400000).toISOString();
      ateInc = new Date().toISOString();
      rotuloPeriodo = `últimos ${RB.periodo} dias`;
    }
    const dadosOut = { leads: 0, agendados: 0, msgs: 0, compareceu: 0, rotulo: rotuloPeriodo, escopoLabel };

    // helper: aplica o filtro de clínica numa query (se clinicIds for null, não filtra = todas)
    const aplicarEscopo = (q) => clinicIds ? q.in('clinic_id', clinicIds) : q;

    try {
      // leads captados pelo Brian (origem Brian IA)
      let qLeads = database.from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('origem', 'Brian IA').gte('created_at', desde).lte('created_at', ateInc);
      qLeads = aplicarEscopo(qLeads);
      const { count: cLeads } = await qLeads;
      dadosOut.leads = cLeads || 0;

      // consultas agendadas pelo Brian (observacoes marca isso)
      let qCons = database.from('consultas')
        .select('id, status, observacoes, created_at, clinic_id')
        .gte('created_at', desde).lte('created_at', ateInc);
      qCons = aplicarEscopo(qCons);
      const { data: cons } = await qCons;
      const consBrian = (cons || []).filter(c => (c.observacoes || '').includes('Brian IA'));
      dadosOut.agendados = consBrian.length;
      dadosOut.compareceu = consBrian.filter(c => c.status === 'compareceu').length;

      // mensagens respondidas pelo Brian (BRIAN_AUTO, from_me)
      let qMsgs = database.from('mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('contact_name', 'BRIAN_AUTO').eq('from_me', true).gte('created_at', desde).lte('created_at', ateInc);
      qMsgs = aplicarEscopo(qMsgs);
      const { count: cMsgs } = await qMsgs;
      dadosOut.msgs = cMsgs || 0;
    } catch (e) { console.error('[relatorio-brian]', e); }
    return dadosOut;
  }

  function render(d) {
    const cont = document.getElementById('rbConteudo');
    if (!cont) return;
    if (!d) { cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted,#888);">Sem dados.</div>'; return; }

    const conversao = d.leads > 0 ? Math.round((d.agendados / d.leads) * 100) : 0;

    cont.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px;">
        <div class="rb-kpi" style="border-left:4px solid var(--gold,#C9A84C);">
          <div class="rb-kpi-num">${d.leads}</div>
          <div class="rb-kpi-lbl">🤖 Leads captados pelo Brian</div>
        </div>
        <div class="rb-kpi" style="border-left:4px solid #5B8DB8;">
          <div class="rb-kpi-num" style="color:#7BA9D0;">${d.agendados}</div>
          <div class="rb-kpi-lbl">📅 Avaliações agendadas</div>
        </div>
        <div class="rb-kpi" style="border-left:4px solid #6FBF8E;">
          <div class="rb-kpi-num" style="color:#6FBF8E;">${d.msgs}</div>
          <div class="rb-kpi-lbl">💬 Mensagens respondidas</div>
        </div>
        <div class="rb-kpi" style="border-left:4px solid var(--gold,#C9A84C);">
          <div class="rb-kpi-num">${conversao}%</div>
          <div class="rb-kpi-lbl">📈 Conversão (lead → agendamento)</div>
        </div>
      </div>

      <div class="rb-kpi" style="background:linear-gradient(135deg, rgba(201,168,76,0.08), rgba(201,168,76,0.02));border:1px solid var(--gold-border,rgba(201,168,76,0.3));">
        <div style="font-size:16px;font-weight:700;color:var(--gold,#C9A84C);margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          💡 Resumo do impacto
          <span style="font-size:12px;font-weight:500;color:var(--text-muted,#888);">(${d.rotulo}${d.escopoLabel ? ' · ' + d.escopoLabel : ''})</span>
        </div>
        <p style="font-size:15px;color:var(--text-secondary,#C8C2AE);line-height:1.8;margin:0;">
          O <b style="color:var(--gold,#C9A84C);">Brian IA</b> captou <b style="color:var(--text-primary,#F0EAD6);">${d.leads} leads</b>,
          respondeu <b style="color:var(--text-primary,#F0EAD6);">${d.msgs} mensagens</b> automaticamente
          e agendou <b style="color:var(--text-primary,#F0EAD6);">${d.agendados} avaliações</b> sozinho${d.compareceu > 0 ? `,
          sendo que <b style="color:var(--text-primary,#F0EAD6);">${d.compareceu}</b> já compareceram` : ''}.
          <br><br>
          Tudo isso no <b>automático, 24h por dia</b>, sem ocupar a sua equipe. 🚀
        </p>
      </div>

      ${d.leads === 0 && d.agendados === 0 && d.msgs === 0 ? `
        <div class="rb-kpi" style="text-align:center;color:var(--text-muted,#888);margin-top:16px;">
          Ainda não há dados do Brian nesse período. Conforme ele atende, os números aparecem aqui! 😊
        </div>` : ''}
    `;
  }

  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    garantirPagina();
    injetarMenu();
    let n = 0;
    const iv = setInterval(() => { injetarMenu(); if (++n > 30) clearInterval(iv); }, 600);
    console.log('✅ relatorio-brian-fix.js carregado');
    return true;
  }

  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }
})();
