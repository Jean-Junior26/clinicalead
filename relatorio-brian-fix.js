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

  const RB = { periodo: 30 }; // dias

  // ── cria a página (uma vez) ──
  function garantirPagina() {
    if (document.getElementById('page-relatorio-brian')) return;
    const container = document.querySelector('.main-content') || document.querySelector('main') || document.body;
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'page-relatorio-brian';
    page.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
        <div>
          <h1 style="margin:0;display:flex;align-items:center;gap:8px;"><i class="ti ti-robot" style="color:var(--gold,#C9A84C);"></i> Agendamentos IA</h1>
          <p style="color:var(--text-muted,#888);font-size:13px;margin:4px 0 0;">O impacto do Brian IA na sua clínica</p>
        </div>
        <div id="rbPeriodos" style="display:flex;gap:6px;">
          <button class="rb-per" data-d="7">7 dias</button>
          <button class="rb-per" data-d="30">30 dias</button>
          <button class="rb-per" data-d="90">90 dias</button>
        </div>
      </div>
      <div id="rbConteudo"><div style="padding:40px;text-align:center;color:var(--text-muted,#888);">Carregando…</div></div>`;
    container.appendChild(page);

    // estilo dos botões de período
    const st = document.createElement('style');
    st.textContent = `
      .rb-per{padding:7px 16px;border-radius:8px;border:1px solid var(--gold-border,#333);background:transparent;color:var(--text-secondary,#888);cursor:pointer;font-size:13px;font-weight:600;}
      .rb-per.active{background:var(--gold,#C9A84C);color:#0A0A0B;border-color:var(--gold,#C9A84C);}
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
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-relatorio-brian').classList.add('active');
    const item = document.getElementById('navRelatorioBrian');
    if (item) item.classList.add('active');
    // listeners dos períodos
    document.querySelectorAll('.rb-per').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.d) === RB.periodo);
      b.onclick = () => { RB.periodo = parseInt(b.dataset.d); document.querySelectorAll('.rb-per').forEach(x => x.classList.toggle('active', x === b)); carregarERender(); };
    });
    await carregarERender();
  };

  async function carregarERender() {
    const cont = document.getElementById('rbConteudo');
    if (cont) cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted,#888);">Carregando…</div>';
    const dados = await carregarDados();
    render(dados);
  }

  async function carregarDados() {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic) return null;
    const desde = new Date(Date.now() - RB.periodo * 86400000).toISOString();
    const dadosOut = { leads: 0, agendados: 0, msgs: 0, compareceu: 0, periodo: RB.periodo };
    try {
      // leads captados pelo Brian (origem Brian IA)
      const { count: cLeads } = await database.from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinic.id).eq('origem', 'Brian IA').gte('created_at', desde);
      dadosOut.leads = cLeads || 0;

      // consultas agendadas pelo Brian (observacoes marca isso)
      const { data: cons } = await database.from('consultas')
        .select('id, status, observacoes, created_at')
        .eq('clinic_id', clinic.id).gte('created_at', desde);
      const consBrian = (cons || []).filter(c => (c.observacoes || '').includes('Brian IA'));
      dadosOut.agendados = consBrian.length;
      dadosOut.compareceu = consBrian.filter(c => c.status === 'compareceu').length;

      // mensagens respondidas pelo Brian (BRIAN_AUTO, from_me)
      const { count: cMsgs } = await database.from('mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinic.id).eq('contact_name', 'BRIAN_AUTO').eq('from_me', true).gte('created_at', desde);
      dadosOut.msgs = cMsgs || 0;
    } catch (e) { console.error('[relatorio-brian]', e); }
    return dadosOut;
  }

  function render(d) {
    const cont = document.getElementById('rbConteudo');
    if (!cont) return;
    if (!d) { cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted,#888);">Sem dados.</div>'; return; }

    const conversao = d.leads > 0 ? Math.round((d.agendados / d.leads) * 100) : 0;
    const compareceu = d.agendados > 0 ? Math.round((d.compareceu / d.agendados) * 100) : 0;

    cont.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:20px;">
        <div class="rb-kpi"><div class="rb-kpi-num">${d.leads}</div><div class="rb-kpi-lbl">🤖 Leads captados pelo Brian</div></div>
        <div class="rb-kpi"><div class="rb-kpi-num">${d.agendados}</div><div class="rb-kpi-lbl">📅 Avaliações agendadas</div></div>
        <div class="rb-kpi"><div class="rb-kpi-num">${d.msgs}</div><div class="rb-kpi-lbl">💬 Mensagens respondidas</div></div>
        <div class="rb-kpi"><div class="rb-kpi-num">${conversao}%</div><div class="rb-kpi-lbl">📈 Conversão (lead → agendamento)</div></div>
      </div>

      <div class="rb-kpi" style="margin-bottom:20px;">
        <div style="font-size:15px;font-weight:600;color:var(--text-primary,#F0EAD6);margin-bottom:14px;">💡 Resumo do impacto (últimos ${d.periodo} dias)</div>
        <p style="font-size:14px;color:var(--text-secondary,#8A8570);line-height:1.7;margin:0;">
          Nos últimos ${d.periodo} dias, o <b style="color:var(--gold,#C9A84C);">Brian IA</b> captou <b>${d.leads} leads</b>,
          respondeu <b>${d.msgs} mensagens</b> automaticamente e agendou <b>${d.agendados} avaliações</b> sozinho —
          ${d.compareceu > 0 ? `sendo que <b>${d.compareceu}</b> já compareceram. ` : ''}
          Isso é trabalho que rodou no automático, 24h por dia, sem ocupar sua equipe. 🚀
        </p>
      </div>

      ${d.leads === 0 && d.agendados === 0 ? `
        <div class="rb-kpi" style="text-align:center;color:var(--text-muted,#888);">
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
