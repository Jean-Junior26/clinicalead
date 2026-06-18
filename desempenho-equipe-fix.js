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

// Período personalizado (datas escolhidas no calendário)
function desempSetPersonalizado() {
  const ini = document.getElementById('desempDataIni')?.value;
  const fim = document.getElementById('desempDataFim')?.value;
  if (!ini || !fim) { if (typeof toast === 'function') toast('Escolha as duas datas', 'error'); return; }
  if (ini > fim) { if (typeof toast === 'function') toast('A data inicial não pode ser maior que a final', 'error'); return; }
  DESEMP.inicio = ini;
  DESEMP.fim = fim;
  DESEMP.periodo = 'personalizado';
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

    // 2) ORÇAMENTOS FECHADOS (com lead_id pra cruzar com quem agendou)
    let qOrc = db.from('orcamentos').select('id, fechado_por, lead_id, created_at').eq('clinic_id', clinic.id).not('fechado_por', 'is', null);
    const { data: orcs } = await qOrc;

    const orcsFiltrados = (orcs || []).filter(o => {
      if (!DESEMP.inicio) return true;
      const d = (o.created_at || '').split('T')[0];
      return d >= DESEMP.inicio && d <= DESEMP.fim;
    });

    // Mapa: lead_id -> quem agendou (pega o agendamento mais recente daquele lead)
    const agendadorDoLead = {};
    let consultasComLead = [];
    {
      const { data: cl } = await db.from('consultas').select('lead_id, agendado_por, data').eq('clinic_id', clinic.id).not('agendado_por', 'is', null);
      consultasComLead = cl || [];
      consultasComLead.forEach(c => {
        if (!c.lead_id || !c.agendado_por) return;
        // mantém o agendamento mais recente
        if (!agendadorDoLead[c.lead_id] || c.data > agendadorDoLead[c.lead_id].data) {
          agendadorDoLead[c.lead_id] = { nome: c.agendado_por, data: c.data };
        }
      });
    }

    // Regras de comissão por nome (da tabela responsaveis)
    const regras = {};
    {
      const { data: resps } = await db.from('responsaveis').select('*').eq('clinic_id', clinic.id);
      (resps || []).forEach(r => { regras[r.nome] = r; });
    }

    // Busca os PAGAMENTOS do período (a comissão sai sobre o que foi pago)
    let qPag = db.from('pagamentos').select('orcamento_id, valor, data').eq('clinic_id', clinic.id);
    if (DESEMP.inicio) qPag = qPag.gte('data', DESEMP.inicio).lte('data', DESEMP.fim);
    const { data: pagamentos } = await qPag;

    // Mapa: orcamento_id -> { fechado_por, lead_id }
    const orcInfo = {};
    (orcs || []).forEach(o => { orcInfo[o.id] = o; });

    // Acumuladores
    const fechadoPorResp = {};       // valor PAGO atribuído a quem fechou
    const comissaoResp = {};         // comissão total por pessoa
    const fixoJaContado = {};        // controla o fixo (1x por orçamento+pessoa+papel)

    (pagamentos || []).forEach(pag => {
      const orc = orcInfo[pag.orcamento_id];
      if (!orc) return; // pagamento de orçamento sem fechado_por definido
      const valorPago = Number(pag.valor || 0);
      if (valorPago <= 0) return;

      // ── quem FECHOU ──
      const fechador = orc.fechado_por;
      if (fechador) {
        fechadoPorResp[fechador] = (fechadoPorResp[fechador] || 0) + valorPago;
        const rF = regras[fechador];
        if (rF) {
          if (rF.com_fechar_tipo === 'percentual') {
            comissaoResp[fechador] = (comissaoResp[fechador] || 0) + valorPago * Number(rF.com_fechar_valor || 0) / 100;
          } else if (rF.com_fechar_tipo === 'fixo') {
            // fixo: conta 1x por orçamento (no primeiro pagamento dele)
            const chave = 'F_' + pag.orcamento_id + '_' + fechador;
            if (!fixoJaContado[chave]) {
              comissaoResp[fechador] = (comissaoResp[fechador] || 0) + Number(rF.com_fechar_valor || 0);
              fixoJaContado[chave] = true;
            }
          }
        }
      }

      // ── quem AGENDOU aquele paciente ──
      const ag = agendadorDoLead[orc.lead_id];
      if (ag && ag.nome) {
        const rA = regras[ag.nome];
        if (rA) {
          if (rA.com_agendar_tipo === 'percentual') {
            comissaoResp[ag.nome] = (comissaoResp[ag.nome] || 0) + valorPago * Number(rA.com_agendar_valor || 0) / 100;
          } else if (rA.com_agendar_tipo === 'fixo') {
            const chave = 'A_' + pag.orcamento_id + '_' + ag.nome;
            if (!fixoJaContado[chave]) {
              comissaoResp[ag.nome] = (comissaoResp[ag.nome] || 0) + Number(rA.com_agendar_valor || 0);
              fixoJaContado[chave] = true;
            }
          }
        }
      }
    });

    // ── COMISSÃO POR COMPARECIMENTO (só avaliação) ──
    // Quem AGENDOU ganha quando o paciente COMPARECE a uma AVALIAÇÃO.
    // Busca consultas 'compareceu' cujo procedimento seja avaliação, no período.
    try {
      let qComp = db.from('consultas')
        .select('id, agendado_por, procedimento, status, data')
        .eq('clinic_id', clinic.id)
        .eq('status', 'compareceu')
        .not('agendado_por', 'is', null);
      if (DESEMP.inicio) qComp = qComp.gte('data', DESEMP.inicio).lte('data', DESEMP.fim);
      const { data: comparecimentos } = await qComp;

      (comparecimentos || []).forEach(c => {
        // só conta se o procedimento for avaliação
        const proc = (c.procedimento || '').toLowerCase();
        if (!proc.includes('avalia')) return;
        const nome = c.agendado_por;
        const rC = regras[nome];
        if (!rC) return;
        if (rC.com_comparecer_tipo === 'fixo') {
          comissaoResp[nome] = (comissaoResp[nome] || 0) + Number(rC.com_comparecer_valor || 0);
        } else if (rC.com_comparecer_tipo === 'percentual') {
          // percentual de comparecimento não tem "valor pago" — usa 0 como base
          // (mantido por consistência da UI; o uso esperado é 'fixo')
        }
      });
    } catch (e) { console.error('[comissao comparecer]', e); }

    // 3) Junta todos os responsáveis (agendamentos + fechamentos + comissões)
    const todos = new Set([...Object.keys(agendPorResp), ...Object.keys(fechadoPorResp), ...Object.keys(comissaoResp)]);

    const fmt = (typeof fmtCurrency === 'function') ? fmtCurrency : (v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));

    if (!todos.size) {
      cont.querySelector('#desempCards').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">Nenhum dado de desempenho no período.<br>Registre "agendado por" nos agendamentos e "fechado por" nos orçamentos.</div>';
      return;
    }

    // Ordena por comissão (maior primeiro)
    const ordenados = [...todos].sort((a, b) => (comissaoResp[b] || 0) - (comissaoResp[a] || 0));

    cont.querySelector('#desempCards').innerHTML = ordenados.map(nome => {
      const agend = agendPorResp[nome] || 0;
      const fechado = fechadoPorResp[nome] || 0;
      const comissao = comissaoResp[nome] || 0;
      return `
        <div class="card" style="padding:16px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:38px;height:38px;border-radius:50%;background:var(--gold-pale);display:flex;align-items:center;justify-content:center;color:var(--gold);font-weight:700;">
                ${nome.charAt(0).toUpperCase()}
              </div>
              <strong style="font-size:15px;">${nome}</strong>
            </div>
            <div style="display:flex;gap:20px;flex-wrap:wrap;">
              <div style="text-align:center;">
                <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">Agendamentos</div>
                <div style="font-size:19px;font-weight:700;color:var(--blue, #5B8DB8);">${agend}</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">Recebido</div>
                <div style="font-size:19px;font-weight:700;color:var(--text-secondary);font-family:var(--mono);">${fmt(fechado)}</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:11px;color:var(--gold);text-transform:uppercase;font-weight:600;">Comissão</div>
                <div style="font-size:19px;font-weight:700;color:var(--gold);font-family:var(--mono);">${fmt(comissao)}</div>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

  } catch (e) {
    cont.querySelector('#desempCards').innerHTML = '<div style="padding:20px;color:var(--coral);font-size:13px;">Erro ao carregar: ' + e.message + '</div>';
  }
}

// Mostra/esconde os campos de data personalizada
function desempTogglePersonalizado() {
  const div = document.getElementById('desempPersonalizado');
  if (!div) return;
  div.style.display = div.style.display === 'none' ? 'flex' : 'none';
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
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-sm desemp-per-btn" data-per="mes" onclick="desempSetPeriodo('mes')">Este mês</button>
          <button class="btn btn-sm desemp-per-btn" data-per="mes_passado" onclick="desempSetPeriodo('mes_passado')">Mês passado</button>
          <button class="btn btn-sm desemp-per-btn" data-per="tudo" onclick="desempSetPeriodo('tudo')">Tudo</button>
          <button class="btn btn-sm desemp-per-btn" data-per="personalizado" onclick="desempTogglePersonalizado()"><i class="ti ti-calendar"></i> Personalizado</button>
        </div>
      </div>
      <div id="desempPersonalizado" style="display:none;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap;background:var(--bg-elevated);padding:10px 12px;border-radius:10px;">
        <span style="font-size:12px;color:var(--text-secondary);">De</span>
        <input type="date" id="desempDataIni" class="form-input" style="font-size:12px;padding:5px 8px;width:auto;"/>
        <span style="font-size:12px;color:var(--text-secondary);">até</span>
        <input type="date" id="desempDataFim" class="form-input" style="font-size:12px;padding:5px 8px;width:auto;"/>
        <button class="btn btn-sm btn-primary" onclick="desempSetPersonalizado()"><i class="ti ti-search"></i> Aplicar</button>
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
