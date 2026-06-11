// ============================================================
// CLINICALEAD — RELATÓRIOS INTELIGENTES v2
// Novidades: evolução diária, exportar PDF real,
// comparação com período anterior
// ============================================================

// ── STATE DOS RELATÓRIOS ─────────────────────────────────────
let REL = {
  dataInicio: null,
  dataFim: null,
  prevInicio: null,
  prevFim: null,
  consultas: [],
  consultasPrev: [],
};

// ── INICIALIZAR DATAS PADRÃO (últimos 30 dias) ───────────────
function initRelDatas() {
  const hoje = new Date();
  const inicio = new Date();
  inicio.setDate(hoje.getDate() - 30);
  REL.dataFim = hoje.toISOString().split('T')[0];
  REL.dataInicio = inicio.toISOString().split('T')[0];
  const ini = document.getElementById('relDataInicio');
  const fim = document.getElementById('relDataFim');
  if (ini) ini.value = REL.dataInicio;
  if (fim) fim.value = REL.dataFim;
}

// ── CALCULAR PERÍODO ANTERIOR (mesma duração) ────────────────
function calcPeriodoAnterior() {
  const ini = new Date(REL.dataInicio + 'T12:00');
  const fim = new Date(REL.dataFim + 'T12:00');
  const dias = Math.round((fim - ini) / (1000 * 60 * 60 * 24)) + 1;
  const prevFim = new Date(ini); prevFim.setDate(prevFim.getDate() - 1);
  const prevIni = new Date(prevFim); prevIni.setDate(prevIni.getDate() - (dias - 1));
  REL.prevFim = prevFim.toISOString().split('T')[0];
  REL.prevInicio = prevIni.toISOString().split('T')[0];
}

// ── CARREGAR CONSULTAS (período atual + anterior, 1 query) ───
async function loadRelConsultas() {
  const clinic = currentClinic();
  if (!clinic) return;
  const { data } = await db
    .from('consultas')
    .select('*')
    .eq('clinic_id', clinic.id)
    .gte('data', REL.prevInicio)
    .lte('data', REL.dataFim);
  const todas = data || [];
  REL.consultas = todas.filter(c => c.data >= REL.dataInicio);
  REL.consultasPrev = todas.filter(c => c.data <= REL.prevFim);
}

// ── FILTRAR LEADS POR INTERVALO ───────────────────────────────
function getLeadsRange(inicio, fim) {
  return currentLeads().filter(l => {
    const d = l.created_at?.split('T')[0];
    return d && d >= inicio && d <= fim;
  });
}

function getLeadsPeriodo() {
  return getLeadsRange(REL.dataInicio, REL.dataFim);
}

// ── RENDERIZAR RELATÓRIOS ─────────────────────────────────────
async function renderRelatorios() {
  const page = document.getElementById('page-relatorios');
  if (!page) return;

  page.innerHTML = `
    <div class="page-header">
      <div class="page-header-left">
        <h2>Relatórios Inteligentes</h2>
        <p id="relSubtitle">Performance da clínica no período</p>
      </div>
      <div class="page-header-actions" data-html2canvas-ignore="true">
        <div style="display:flex;align-items:center;gap:8px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--r-sm);padding:6px 12px;">
          <i class="ti ti-calendar" style="color:var(--gold);font-size:15px;"></i>
          <input type="date" id="relDataInicio" class="form-input" style="border:none;background:transparent;padding:0;width:130px;font-size:13px;" onchange="atualizarRelatorios()"/>
          <span style="color:var(--text-muted);font-size:12px;">até</span>
          <input type="date" id="relDataFim" class="form-input" style="border:none;background:transparent;padding:0;width:130px;font-size:13px;" onchange="atualizarRelatorios()"/>
        </div>
        <button class="btn" onclick="setRelPeriodo(7)">7 dias</button>
        <button class="btn" onclick="setRelPeriodo(30)">30 dias</button>
        <button class="btn" onclick="setRelPeriodo(90)">90 dias</button>
        <button class="btn btn-primary" id="btnExportarPDF" onclick="exportarRelatorioPDF()"><i class="ti ti-file-download"></i> Exportar PDF</button>
      </div>
    </div>

    <!-- MÉTRICAS PRINCIPAIS -->
    <div class="metrics-grid" style="margin-bottom:20px;" id="relMetricas">
      <div class="metric-card"><div class="metric-top-bar" style="background:var(--gold);"></div>
        <div class="metric-icon gold"><i class="ti ti-users"></i></div>
        <div class="metric-label">Leads no período</div>
        <div class="metric-value" id="relMLeads">—</div>
        <div class="metric-delta" id="relMLeadsDelta">—</div>
        <div style="margin-top:4px;" id="relMLeadsComp"></div>
      </div>
      <div class="metric-card"><div class="metric-top-bar" style="background:var(--blue);"></div>
        <div class="metric-icon blue"><i class="ti ti-calendar-check"></i></div>
        <div class="metric-label">Agendamentos</div>
        <div class="metric-value" id="relMAgendam">—</div>
        <div class="metric-delta" id="relMAgendamDelta">—</div>
        <div style="margin-top:4px;" id="relMAgendamComp"></div>
      </div>
      <div class="metric-card"><div class="metric-top-bar" style="background:var(--gold-bright);"></div>
        <div class="metric-icon gold"><i class="ti ti-door-enter"></i></div>
        <div class="metric-label">Comparecimentos</div>
        <div class="metric-value" id="relMCompare">—</div>
        <div class="metric-delta" id="relMCompareDelta">—</div>
        <div style="margin-top:4px;" id="relMCompareComp"></div>
      </div>
      <div class="metric-card"><div class="metric-top-bar" style="background:var(--coral);"></div>
        <div class="metric-icon coral"><i class="ti ti-currency-dollar"></i></div>
        <div class="metric-label">Receita perdida (faltas)</div>
        <div class="metric-value" id="relMPerdido">—</div>
        <div class="metric-delta" style="color:var(--coral);" id="relMPerdidoDelta">—</div>
        <div style="margin-top:4px;" id="relMPerdidoComp"></div>
      </div>
    </div>

    <!-- EVOLUÇÃO DIÁRIA -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <h3><i class="ti ti-chart-line" style="margin-right:6px;color:var(--text-secondary);font-size:15px;"></i>Evolução diária de leads</h3>
        <span style="font-size:11px;color:var(--gold);" id="relEvolucaoResumo">—</span>
      </div>
      <div class="card-body" id="relEvolucao">
        <div style="color:var(--text-secondary);font-size:13px;">Carregando...</div>
      </div>
    </div>

    <!-- FUNIL DO PERÍODO -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">

      <div class="card">
        <div class="card-header">
          <h3><i class="ti ti-filter" style="margin-right:6px;color:var(--text-secondary);font-size:15px;"></i>Funil do período</h3>
          <span style="font-size:11px;color:var(--text-muted);" id="relFunilPeriodo">—</span>
        </div>
        <div class="card-body" id="relFunil">
          <div style="color:var(--text-secondary);font-size:13px;">Carregando...</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3><i class="ti ti-clock" style="margin-right:6px;color:var(--text-secondary);font-size:15px;"></i>Velocidade do funil</h3>
          <span style="font-size:11px;color:var(--gold);">Tempo médio por etapa</span>
        </div>
        <div class="card-body" id="relVelocidade">
          <div style="color:var(--text-secondary);font-size:13px;">Carregando...</div>
        </div>
      </div>

    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">

      <div class="card">
        <div class="card-header">
          <h3><i class="ti ti-chart-bar" style="margin-right:6px;color:var(--text-secondary);font-size:15px;"></i>Taxa de no-show por origem</h3>
          <span style="font-size:11px;color:var(--gold);">Qual canal falta mais?</span>
        </div>
        <div class="card-body" id="relNoShow">
          <div style="color:var(--text-secondary);font-size:13px;">Carregando...</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3><i class="ti ti-calendar" style="margin-right:6px;color:var(--text-secondary);font-size:15px;"></i>Melhor dia da semana</h3>
          <span style="font-size:11px;color:var(--gold);">Maior comparecimento</span>
        </div>
        <div class="card-body" id="relDiaSemana">
          <div style="color:var(--text-secondary);font-size:13px;">Carregando...</div>
        </div>
      </div>

    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">

      <div class="card">
        <div class="card-header">
          <h3><i class="ti ti-map-pin" style="margin-right:6px;color:var(--text-secondary);font-size:15px;"></i>Leads por origem</h3>
        </div>
        <div class="card-body" id="relOrigem">
          <div style="color:var(--text-secondary);font-size:13px;">Carregando...</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3><i class="ti ti-stethoscope" style="margin-right:6px;color:var(--text-secondary);font-size:15px;"></i>Procedimentos mais procurados</h3>
        </div>
        <div class="card-body" id="relProcedimentos">
          <div style="color:var(--text-secondary);font-size:13px;">Carregando...</div>
        </div>
      </div>

    </div>

    <!-- AGENDA DO PERÍODO -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <h3><i class="ti ti-list" style="margin-right:6px;color:var(--text-secondary);font-size:15px;"></i>Agenda do período</h3>
        <div style="display:flex;gap:8px;" data-html2canvas-ignore="true">
          <button class="btn btn-sm" onclick="filtrarAgendaRel('todos')" id="btnRelTodos" style="background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);">Todos</button>
          <button class="btn btn-sm" onclick="filtrarAgendaRel('compareceu')" id="btnRelCompareceu">Comparecimentos</button>
          <button class="btn btn-sm" onclick="filtrarAgendaRel('faltou')" id="btnRelFaltou">Faltas</button>
          <button class="btn btn-sm" onclick="filtrarAgendaRel('agendado')" id="btnRelAgendado">Agendados</button>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead style="background:var(--bg-elevated);">
            <tr>
              <th style="padding:10px 16px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--gold-dim);text-align:left;border-bottom:1px solid var(--border);">Paciente</th>
              <th style="padding:10px 16px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--gold-dim);text-align:left;border-bottom:1px solid var(--border);">Data</th>
              <th style="padding:10px 16px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--gold-dim);text-align:left;border-bottom:1px solid var(--border);">Horário</th>
              <th style="padding:10px 16px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--gold-dim);text-align:left;border-bottom:1px solid var(--border);">Procedimento</th>
              <th style="padding:10px 16px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--gold-dim);text-align:left;border-bottom:1px solid var(--border);">Status</th>
              <th style="padding:10px 16px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--gold-dim);text-align:left;border-bottom:1px solid var(--border);">Valor est.</th>
            </tr>
          </thead>
          <tbody id="relAgendaTabela">
            <tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary);">Carregando...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  initRelDatas();
  await calcularRelatorios();
}

// ── ATUALIZAR AO MUDAR DATA ───────────────────────────────────
async function atualizarRelatorios() {
  REL.dataInicio = document.getElementById('relDataInicio').value;
  REL.dataFim = document.getElementById('relDataFim').value;
  await calcularRelatorios();
}

// ── ATALHOS DE PERÍODO ────────────────────────────────────────
async function setRelPeriodo(dias) {
  const hoje = new Date();
  const inicio = new Date();
  inicio.setDate(hoje.getDate() - dias);
  REL.dataFim = hoje.toISOString().split('T')[0];
  REL.dataInicio = inicio.toISOString().split('T')[0];
  document.getElementById('relDataInicio').value = REL.dataInicio;
  document.getElementById('relDataFim').value = REL.dataFim;
  await calcularRelatorios();
}

// ── CALCULAR TODOS OS RELATÓRIOS ──────────────────────────────
async function calcularRelatorios() {
  calcPeriodoAnterior();
  await loadRelConsultas();
  const leads = getLeadsPeriodo();
  const leadsPrev = getLeadsRange(REL.prevInicio, REL.prevFim);
  const consultas = REL.consultas;
  const consultasPrev = REL.consultasPrev;

  // Atualiza subtítulo
  const ini = new Date(REL.dataInicio + 'T12:00').toLocaleDateString('pt-BR', {day:'numeric',month:'short'});
  const fim = new Date(REL.dataFim + 'T12:00').toLocaleDateString('pt-BR', {day:'numeric',month:'short'});
  const subEl = document.getElementById('relSubtitle');
  if (subEl) subEl.textContent = `Período: ${ini} até ${fim}`;
  const funilEl = document.getElementById('relFunilPeriodo');
  if (funilEl) funilEl.textContent = `${ini} — ${fim}`;

  calcMetricas(leads, consultas, leadsPrev, consultasPrev);
  calcEvolucao(leads);
  calcFunil(leads);
  calcVelocidade(leads);
  calcNoShow(leads, consultas);
  calcDiaSemana(consultas);
  calcOrigem(leads);
  calcProcedimentos(leads);
  renderAgendaRel('todos');
}

// ── BADGE DE COMPARAÇÃO COM PERÍODO ANTERIOR ─────────────────
// invert=true: crescer é RUIM (ex: receita perdida)
function deltaBadge(cur, prev, invert = false) {
  if (prev === 0 && cur === 0) {
    return `<span style="color:var(--text-muted);font-size:11px;"><i class="ti ti-minus" style="font-size:11px;"></i> sem dados anteriores</span>`;
  }
  if (prev === 0) {
    const cor = invert ? 'var(--coral)' : 'var(--gold)';
    return `<span style="color:${cor};font-size:11px;"><i class="ti ti-arrow-up-right" style="font-size:11px;"></i> novo (antes: 0)</span>`;
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  const subiu = pct > 0;
  const bom = invert ? !subiu : subiu;
  const cor = pct === 0 ? 'var(--text-muted)' : (bom ? 'var(--gold)' : 'var(--coral)');
  const icon = pct === 0 ? 'ti-minus' : (subiu ? 'ti-arrow-up-right' : 'ti-arrow-down-right');
  return `<span style="color:${cor};font-size:11px;"><i class="ti ${icon}" style="font-size:11px;"></i> ${pct > 0 ? '+' : ''}${pct}% vs anterior</span>`;
}

// ── MÉTRICAS PRINCIPAIS ───────────────────────────────────────
function calcMetricas(leads, consultas, leadsPrev, consultasPrev) {
  const agendados = consultas.length;
  const compareceram = consultas.filter(c => c.status === 'compareceu').length;
  const faltaram = consultas.filter(c => c.status === 'faltou').length;

  // Período anterior
  const agendadosPrev = consultasPrev.length;
  const compareceramPrev = consultasPrev.filter(c => c.status === 'compareceu').length;
  const faltaramPrev = consultasPrev.filter(c => c.status === 'faltou').length;

  // Receita perdida = faltas * valor médio dos leads
  const valorMedio = leads.length
    ? leads.filter(l => l.valor).reduce((s,l) => s + (l.valor||0), 0) / (leads.filter(l=>l.valor).length || 1)
    : 0;
  const receitaPerdida = faltaram * valorMedio;
  const receitaPerdidaPrev = faltaramPrev * valorMedio;

  const taxaConv = leads.length ? Math.round((compareceram / leads.length) * 100) : 0;
  const taxaPresenca = agendados ? Math.round((compareceram / agendados) * 100) : 0;

  document.getElementById('relMLeads').textContent = leads.length;
  document.getElementById('relMLeadsDelta').innerHTML = `<i class="ti ti-trending-up" style="font-size:11px;"></i> ${taxaConv}% viraram consulta`;
  document.getElementById('relMLeadsComp').innerHTML = deltaBadge(leads.length, leadsPrev.length);

  document.getElementById('relMAgendam').textContent = agendados;
  document.getElementById('relMAgendamDelta').innerHTML = `<i class="ti ti-calendar" style="font-size:11px;"></i> ${taxaPresenca}% de presença`;
  document.getElementById('relMAgendamComp').innerHTML = deltaBadge(agendados, agendadosPrev);

  document.getElementById('relMCompare').textContent = compareceram;
  document.getElementById('relMCompareDelta').innerHTML = `<i class="ti ti-x" style="font-size:11px;color:var(--coral);"></i> <span style="color:var(--coral);">${faltaram} faltas</span>`;
  document.getElementById('relMCompareComp').innerHTML = deltaBadge(compareceram, compareceramPrev);

  document.getElementById('relMPerdido').textContent = fmtCurrency(receitaPerdida);
  document.getElementById('relMPerdidoDelta').textContent = `${faltaram} pacientes faltaram`;
  document.getElementById('relMPerdidoComp').innerHTML = deltaBadge(receitaPerdida, receitaPerdidaPrev, true);
}

// ── EVOLUÇÃO DIÁRIA DE LEADS ─────────────────────────────────
function calcEvolucao(leads) {
  const el = document.getElementById('relEvolucao');
  if (!el) return;

  // Lista de todos os dias do período
  const ini = new Date(REL.dataInicio + 'T12:00');
  const fim = new Date(REL.dataFim + 'T12:00');
  const dias = [];
  for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
    dias.push(d.toISOString().split('T')[0]);
  }

  // Contagem de leads por dia
  const porDia = {};
  leads.forEach(l => {
    const d = l.created_at?.split('T')[0];
    if (d) porDia[d] = (porDia[d] || 0) + 1;
  });

  const max = Math.max(...dias.map(d => porDia[d] || 0), 1);
  const total = leads.length;

  const resumoEl = document.getElementById('relEvolucaoResumo');
  if (resumoEl) resumoEl.textContent = `${total} leads · pico de ${max}/dia`;

  if (!total) {
    el.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">Nenhum lead captado no período</div>';
    return;
  }

  const fmtDia = d => new Date(d + 'T12:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});

  const barras = dias.map(d => {
    const n = porDia[d] || 0;
    const h = n ? Math.max(10, Math.round((n / max) * 100)) : 3;
    const bg = n ? 'var(--gold)' : 'rgba(255,255,255,0.06)';
    return `<div title="${fmtDia(d)}: ${n} lead${n === 1 ? '' : 's'}" style="flex:1;min-width:3px;height:${h}%;background:${bg};border-radius:2px 2px 0 0;transition:opacity 0.15s;cursor:default;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'"></div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:2px;height:120px;padding-top:8px;">${barras}</div>
    <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:var(--text-muted);">
      <span>${fmtDia(REL.dataInicio)}</span>
      <span style="color:var(--gold-dim);">passe o mouse nas barras para ver o dia</span>
      <span>${fmtDia(REL.dataFim)}</span>
    </div>`;
}

// ── EXPORTAR PDF REAL ─────────────────────────────────────────
function loadHtml2Pdf() {
  return new Promise((resolve, reject) => {
    if (window.html2pdf) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Falha ao carregar gerador de PDF'));
    document.head.appendChild(s);
  });
}

async function exportarRelatorioPDF() {
  const btn = document.getElementById('btnExportarPDF');
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i> Gerando...'; }
    toast('Gerando PDF do relatório...');
    await loadHtml2Pdf();

    const el = document.getElementById('page-relatorios');
    const clinic = currentClinic();
    const nomeClinica = (clinic?.nome || 'clinica').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').toLowerCase();
    const bgColor = getComputedStyle(document.body).backgroundColor || '#0E0F12';

    const opt = {
      margin: 5,
      filename: `relatorio-${nomeClinica}-${REL.dataInicio}-a-${REL.dataFim}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: bgColor, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    };

    await html2pdf().set(opt).from(el).save();
    toast('PDF gerado com sucesso! 📄');
  } catch (e) {
    console.error('Erro ao exportar PDF:', e);
    toast('Erro ao gerar o PDF. Tente novamente.');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-file-download"></i> Exportar PDF'; }
  }
}

// ── FUNIL DO PERÍODO ──────────────────────────────────────────
function calcFunil(leads) {
  const total = leads.length || 1;
  const etapas = [
    { label: 'Leads captados',   n: leads.length,                                                          color: '#C9A84C' },
    { label: 'Contato feito',    n: leads.filter(l => ['contato','agendado','compareceu','fechado'].includes(l.status)).length, color: '#E8C96A' },
    { label: 'Agendados',        n: leads.filter(l => ['agendado','compareceu','fechado'].includes(l.status)).length,           color: '#5B8DB8' },
    { label: 'Compareceram',     n: leads.filter(l => ['compareceu','fechado'].includes(l.status)).length,  color: '#8ABBE8' },
    { label: 'Fechados',         n: leads.filter(l => l.status === 'fechado').length,                       color: '#A07B30' },
  ];

  document.getElementById('relFunil').innerHTML = etapas.map(e => {
    const pct = Math.round((e.n / total) * 100);
    return `<div class="funnel-row">
      <span class="funnel-label">${e.label}</span>
      <div class="funnel-track"><div class="funnel-fill" style="width:${pct}%;background:${e.color};"></div></div>
      <span class="funnel-n">${e.n}</span>
      <span class="funnel-pct">${pct}%</span>
    </div>`;
  }).join('');
}

// ── VELOCIDADE DO FUNIL ───────────────────────────────────────
function calcVelocidade(leads) {
  const agendados = leads.filter(l => ['agendado','compareceu','fechado'].includes(l.status));

  const tempos = agendados.map(l => {
    const criado = new Date(l.created_at);
    const hoje = new Date();
    return Math.round((hoje - criado) / (1000 * 60 * 60 * 24));
  }).filter(t => t >= 0);

  const mediaGeral = tempos.length
    ? Math.round(tempos.reduce((a,b) => a+b, 0) / tempos.length)
    : null;

  const totalLeads = leads.length;
  const totalAgendados = agendados.length;
  const taxaAgend = totalLeads ? Math.round((totalAgendados / totalLeads) * 100) : 0;

  const itens = [
    { label: 'Tempo médio até agendamento', valor: mediaGeral !== null ? `${mediaGeral} dias` : '—', icon: 'ti-clock', color: mediaGeral > 3 ? 'var(--coral)' : 'var(--gold)' },
    { label: 'Taxa lead → agendamento',      valor: `${taxaAgend}%`,                                   icon: 'ti-trending-up', color: taxaAgend > 50 ? 'var(--gold)' : 'var(--coral)' },
    { label: 'Leads sem contato (novo)',      valor: leads.filter(l => l.status === 'novo').length,     icon: 'ti-alert-circle', color: 'var(--coral)' },
    { label: 'Leads sem resposta',            valor: leads.filter(l => l.status === 'sem_resposta').length, icon: 'ti-message-off', color: 'var(--coral)' },
  ];

  document.getElementById('relVelocidade').innerHTML = itens.map(i => `
    <div class="stat-row">
      <span class="stat-label"><i class="ti ${i.icon}" style="margin-right:6px;font-size:13px;color:${i.color};"></i>${i.label}</span>
      <span class="stat-val" style="color:${i.color};">${i.valor}</span>
    </div>`).join('');
}

// ── NO-SHOW POR ORIGEM ────────────────────────────────────────
function calcNoShow(leads, consultas) {
  const origens = {};

  leads.forEach(lead => {
    const origem = lead.origem || 'Outros';
    if (!origens[origem]) origens[origem] = { agendados: 0, faltaram: 0 };

    const consultasDoLead = consultas.filter(c => c.lead_id === lead.id);
    consultasDoLead.forEach(c => {
      origens[origem].agendados++;
      if (c.status === 'faltou') origens[origem].faltaram++;
    });
  });

  const dados = Object.entries(origens)
    .filter(([, v]) => v.agendados > 0)
    .sort((a, b) => (b[1].faltaram / b[1].agendados) - (a[1].faltaram / a[1].agendados));

  if (!dados.length) {
    document.getElementById('relNoShow').innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">Sem dados de agendamento no período</div>';
    return;
  }

  document.getElementById('relNoShow').innerHTML = dados.map(([origem, v]) => {
    const taxa = Math.round((v.faltaram / v.agendados) * 100);
    const cor = taxa > 30 ? 'var(--coral)' : taxa > 15 ? 'var(--gold-bright)' : 'var(--gold)';
    return `<div class="stat-row">
      <span class="stat-label"><i class="ti ${SOURCE_ICON[origem]||'ti-dots'}" style="margin-right:6px;font-size:13px;"></i>${origem}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:80px;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
          <div style="width:${taxa}%;height:100%;background:${cor};border-radius:3px;"></div>
        </div>
        <span class="stat-val" style="color:${cor};">${taxa}% faltam</span>
      </div>
    </div>`;
  }).join('');
}

// ── MELHOR DIA DA SEMANA ──────────────────────────────────────
function calcDiaSemana(consultas) {
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const contagem = Array(7).fill(0).map(() => ({ total: 0, compareceu: 0 }));

  consultas.forEach(c => {
    const d = new Date(c.data + 'T12:00').getDay();
    contagem[d].total++;
    if (c.status === 'compareceu') contagem[d].compareceu++;
  });

  const maxTotal = Math.max(...contagem.map(d => d.total)) || 1;

  document.getElementById('relDiaSemana').innerHTML = dias.map((dia, i) => {
    const { total, compareceu } = contagem[i];
    const taxa = total ? Math.round((compareceu / total) * 100) : 0;
    const pct = Math.round((total / maxTotal) * 100);
    const cor = taxa >= 80 ? 'var(--gold)' : taxa >= 60 ? 'var(--gold-bright)' : 'var(--text-muted)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border-subtle);">
      <span style="font-size:12px;font-weight:600;color:var(--text-secondary);min-width:28px;">${dia}</span>
      <div style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${cor};border-radius:3px;"></div>
      </div>
      <span style="font-size:11px;color:${cor};min-width:60px;text-align:right;">${total} cons. · ${taxa}%</span>
    </div>`;
  }).join('');
}

// ── LEADS POR ORIGEM ──────────────────────────────────────────
function calcOrigem(leads) {
  const origens = {};
  leads.forEach(l => { const o = l.origem||'Outros'; origens[o]=(origens[o]||0)+1; });
  const total = leads.length || 1;

  const dados = Object.entries(origens).sort((a,b) => b[1]-a[1]);

  if (!dados.length) {
    document.getElementById('relOrigem').innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">Nenhum dado no período</div>';
    return;
  }

  document.getElementById('relOrigem').innerHTML = dados.map(([origem, n]) => {
    const pct = Math.round((n / total) * 100);
    return `<div class="stat-row">
      <span class="stat-label"><i class="ti ${SOURCE_ICON[origem]||'ti-dots'}" style="margin-right:6px;font-size:13px;"></i>${origem}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:80px;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:var(--gold);border-radius:3px;"></div>
        </div>
        <span class="stat-val">${n} (${pct}%)</span>
      </div>
    </div>`;
  }).join('');
}

// ── PROCEDIMENTOS ─────────────────────────────────────────────
function calcProcedimentos(leads) {
  const procs = {};
  leads.forEach(l => { const p = l.procedimento||'Outros'; procs[p]=(procs[p]||0)+1; });
  const total = leads.length || 1;

  const dados = Object.entries(procs).sort((a,b) => b[1]-a[1]);

  if (!dados.length) {
    document.getElementById('relProcedimentos').innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">Nenhum dado no período</div>';
    return;
  }

  document.getElementById('relProcedimentos').innerHTML = dados.map(([proc, n]) => {
    const pct = Math.round((n / total) * 100);
    return `<div class="stat-row">
      <span class="stat-label"><i class="ti ti-tooth" style="margin-right:6px;font-size:13px;color:var(--gold);"></i>${proc}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:80px;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:var(--blue);border-radius:3px;"></div>
        </div>
        <span class="stat-val">${n} (${pct}%)</span>
      </div>
    </div>`;
  }).join('');
}

// ── TABELA DE AGENDA ──────────────────────────────────────────
let _filtroAgendaRel = 'todos';

function filtrarAgendaRel(filtro) {
  _filtroAgendaRel = filtro;
  ['Todos','Compareceu','Faltou','Agendado'].forEach(f => {
    const btn = document.getElementById('btnRel' + f);
    if (btn) {
      const ativo = f.toLowerCase() === filtro;
      btn.style.background = ativo ? 'var(--gold-pale)' : '';
      btn.style.borderColor = ativo ? 'var(--gold-border)' : '';
      btn.style.color = ativo ? 'var(--gold)' : '';
    }
  });
  renderAgendaRel(filtro);
}

function renderAgendaRel(filtro) {
  let consultas = REL.consultas;
  if (filtro !== 'todos') consultas = consultas.filter(c => c.status === filtro);
  consultas = [...consultas].sort((a,b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora));

  const statusCores = {
    agendado: 'badge-amber', confirmado: 'badge-blue',
    compareceu: 'badge-gold', faltou: 'badge-coral', cancelado: 'badge-gray'
  };
  const statusLabels = {
    agendado: 'Agendado', confirmado: 'Confirmado',
    compareceu: 'Compareceu', faltou: 'Faltou', cancelado: 'Cancelado'
  };

  const tbody = document.getElementById('relAgendaTabela');
  if (!tbody) return;

  if (!consultas.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary);">Nenhuma consulta encontrada no período</td></tr>`;
    return;
  }

  tbody.innerHTML = consultas.map(c => {
    const lead = STATE.leads.find(l => l.id === c.lead_id);
    const dataFormatada = new Date(c.data + 'T12:00').toLocaleDateString('pt-BR', {weekday:'short', day:'numeric', month:'short'});
    const badge = `<span class="badge ${statusCores[c.status]||'badge-gray'}">${statusLabels[c.status]||c.status}</span>`;
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:10px;">
        <div class="avatar" style="width:30px;height:30px;font-size:11px;${avatarStyle(lead?.nome||'?')}">${initials(lead?.nome||'?')}</div>
        <span style="font-weight:500;font-size:13px;">${lead?.nome||'—'}</span>
      </div></td>
      <td style="font-size:13px;color:var(--text-secondary);">${dataFormatada}</td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--gold);">${c.hora}</td>
      <td style="font-size:12px;color:var(--text-secondary);">${lead?.procedimento||'—'}</td>
      <td>${badge}</td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--gold);">${lead?.valor ? 'R$ '+Number(lead.valor).toLocaleString('pt-BR') : '—'}</td>
    </tr>`;
  }).join('');
}

console.log('✅ relatorios-fix.js v2 carregado — evolução diária + PDF + comparação de períodos');
