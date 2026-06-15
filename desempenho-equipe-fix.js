// ============================================================
// CLINICALEAD — DESEMPENHO DA EQUIPE (Fatia 3)
// Seção dentro de Relatórios: por responsável, mostra quantos
// agendamentos fez e quanto fechou em R$ (com filtro de período).
// Base para comissionamento.
// ============================================================

let DESEMP = { inicio: null, fim: null, periodo: 'mes' };

// Define o período (atalhos)
function desempSetPeriodo(p) {
  const hoje = new Date();
  const y = hoje.getFullYear(), m = hoje.getMonth();
  if (p === 'mes') {
    DESEMP.inicio = new Date(y, m, 1).toISOString().split('T')[0];
    DESEMP.fim = new Date(y, m + 1, 0).toISOString().split('T')[0];
  } else if (p === 'mes_passado') {
    DESEMP.inicio = new Date(y, m - 1, 1).toISOString().split('T')[0];
    DESEMP.fim = new Date(y, m, 0).toISOString().split('T')[0];
  } else if (p === 'tudo') {
    DESEMP.inicio = null; DESEMP.fim = null;
  }
  DESEMP.periodo = p;
  renderDesempenhoEquipe();
}

// Renderiza a seção de desempenho
async function renderDesempenhoEquipe() {
  const cont = document.getElementById('desempenhoEquipe');
  if (!cont) return;
  const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
  if (!clinic) return;

  cont.querySelector('#desempCards').innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Carregando...</div>';

  // Atualiza botões de período
  cont.querySelectorAll('.desemp-per-btn').forEach(b => {
    b.style.cssText = b.dataset.per === DESEMP.periodo
      ? 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);font-weight:600;'
      : '';
  });

  try {
    // 1) AGENDAMENTOS por responsável (consultas.agendado_por)
    let qCons = db.from('consultas').select('agendado_por, data').eq('clinic_id', clinic.id).not('agendado_por', 'is', null);
    if (DESEMP.inicio) qCons = qCons.gte('data', DESEMP.inicio).lte('data', DESEMP.fim);
    const { data: consultas } = await qCons;

    const agendPorResp = {};
    (consultas || []).forEach(c => {
      if (!c.agendado_por) return;
      agendPorResp[c.agendado_por] = (agendPorResp[c.agendado_por] || 0) + 1;
    });

    // 2) VALOR FECHADO por responsável (orcamentos.fechado_por + itens aprovados)
    let qOrc = db.from('orcamentos').select('id, fechado_por, created_at').eq('clinic_id', clinic.id).not('fechado_por', 'is', null);
    const { data: orcs } = await qOrc;

    // Filtra por período (created_at do orçamento)
    const orcsFiltrados = (orcs || []).filter(o => {
      if (!DESEMP.inicio) return true;
      const d = (o.created_at || '').split('T')[0];
      return d >= DESEMP.inicio && d <= DESEMP.fim;
    });

    // Soma os itens aprovados de cada orçamento
    const fechadoPorResp = {};
    if (orcsFiltrados.length) {
      const ids = orcsFiltrados.map(o => o.id);
      const { data: itens } = await db.from('orcamento_itens').select('orcamento_id, valor, qtd, aprovado').in('orcamento_id', ids);
      const valorPorOrc = {};
      (itens || []).forEach(i => {
        if (!i.aprovado) return;
        valorPorOrc[i.orcamento_id] = (valorPorOrc[i.orcamento_id] || 0) + Number(i.valor || 0) * Number(i.qtd || 1);
      });
      orcsFiltrados.forEach(o => {
        const v = valorPorOrc[o.id] || 0;
        if (v > 0) fechadoPorResp[o.fechado_por] = (fechadoPorResp[o.fechado_por] || 0) + v;
      });
    }

    // 3) Junta todos os responsáveis (de agendamentos + fechamentos)
    const todos = new Set([...Object.keys(agendPorResp), ...Object.keys(fechadoPorResp)]);

    const fmt = (typeof fmtCurrency === 'function') ? fmtCurrency : (v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));

    if (!todos.size) {
      cont.querySelector('#desempCards').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">Nenhum dado de desempenho no período.<br>Registre "agendado por" nos agendamentos e "fechado por" nos orçamentos.</div>';
      return;
    }

    // Ordena por valor fechado (maior primeiro)
    const ordenados = [...todos].sort((a, b) => (fechadoPorResp[b] || 0) - (fechadoPorResp[a] || 0));

    cont.querySelector('#desempCards').innerHTML = ordenados.map(nome => {
      const agend = agendPorResp[nome] || 0;
      const fechado = fechadoPorResp[nome] || 0;
      return `
        <div class="card" style="padding:16px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:38px;height:38px;border-radius:50%;background:var(--gold-pale);display:flex;align-items:center;justify-content:center;color:var(--gold);font-weight:700;">
                ${nome.charAt(0).toUpperCase()}
              </div>
              <strong style="font-size:15px;">${nome}</strong>
            </div>
            <div style="display:flex;gap:24px;flex-wrap:wrap;">
              <div style="text-align:center;">
                <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">Agendamentos</div>
                <div style="font-size:20px;font-weight:700;color:var(--blue, #5B8DB8);">${agend}</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">Fechou</div>
                <div style="font-size:20px;font-weight:700;color:var(--gold);font-family:var(--mono);">${fmt(fechado)}</div>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

  } catch (e) {
    cont.querySelector('#desempCards').innerHTML = '<div style="padding:20px;color:var(--coral);font-size:13px;">Erro ao carregar: ' + e.message + '</div>';
  }
}

// ── Injeta a seção na página de Relatórios ───────────────────
(function () {
  function injetar() {
    const page = document.getElementById('page-relatorios');
    if (!page || document.getElementById('desempenhoEquipe')) return;

    const sec = document.createElement('div');
    sec.id = 'desempenhoEquipe';
    sec.style.cssText = 'margin-top:28px;';
    sec.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
        <h3 style="font-size:16px;display:flex;align-items:center;gap:8px;"><i class="ti ti-trophy" style="color:var(--gold);"></i> Desempenho da Equipe</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm desemp-per-btn" data-per="mes" onclick="desempSetPeriodo('mes')">Este mês</button>
          <button class="btn btn-sm desemp-per-btn" data-per="mes_passado" onclick="desempSetPeriodo('mes_passado')">Mês passado</button>
          <button class="btn btn-sm desemp-per-btn" data-per="tudo" onclick="desempSetPeriodo('tudo')">Tudo</button>
        </div>
      </div>
      <div id="desempCards"></div>`;
    page.appendChild(sec);
  }

  // injeta quando entra em relatórios
  if (typeof showPage === 'function') {
    const _orig = showPage;
    showPage = function (id, el) {
      _orig(id, el);
      if (id === 'relatorios') {
        setTimeout(() => { injetar(); desempSetPeriodo(DESEMP.periodo || 'mes'); }, 150);
      }
    };
  }
  console.log('✅ desempenho-equipe-fix.js carregado (Fatia 3)');
})();
