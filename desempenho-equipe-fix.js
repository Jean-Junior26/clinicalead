// ============================================================
// CLINICALEAD — DESEMPENHO DA EQUIPE (Fatia 3)
// Seção dentro de Relatórios: por responsável, mostra quantos
// agendamentos fez e quanto fechou em R$ (com filtro de período).
// Base para comissionamento.
// ============================================================

let DESEMP = { inicio: null, fim: null, periodo: 'mes' };

// Taxa (%) do cartão para um pagamento, conforme forma + nº de parcelas.
// Sem config (taxas null) ou forma não-cartão => 0 (comissão sobre o valor cheio).
function taxaDoPagamento(taxas, forma, parcelas) {
  if (!taxas) return 0;
  const p = Number(parcelas) || 1;
  if (forma === 'cartao_debito') return Number(taxas.debito) || 0;
  if (forma === 'cartao_credito') {
    if (p <= 1) return Number(taxas.credito_vista) || 0;
    const faixa = (taxas.parcelado || []).find(f => p >= Number(f.de) && p <= Number(f.ate));
    return faixa ? (Number(faixa.taxa) || 0) : 0;
  }
  return 0; // pix, dinheiro, boleto, transferencia: sem taxa
}

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
    // taxas de cartão da clínica (opcional; vazio => comissão sobre valor cheio)
    let taxasCartao = null;
    try {
      const { data: cRow } = await db.from('clinicas').select('taxas_cartao').eq('id', clinic.id).maybeSingle();
      taxasCartao = (cRow && cRow.taxas_cartao) ? cRow.taxas_cartao : null;
    } catch (e) { taxasCartao = null; }

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
    let qPag = db.from('pagamentos').select('orcamento_id, valor, data, forma, parcelas').eq('clinic_id', clinic.id);
    if (DESEMP.inicio) qPag = qPag.gte('data', DESEMP.inicio).lte('data', DESEMP.fim);
    const { data: pagamentos } = await qPag;

    // Mapa: orcamento_id -> { fechado_por, lead_id }
    const orcInfo = {};
    (orcs || []).forEach(o => { orcInfo[o.id] = o; });

    // Acumuladores
    const fechadoPorResp = {};       // valor PAGO atribuído a quem fechou
    const comissaoResp = {};         // comissão total por pessoa
    const fixoJaContado = {};        // controla o fixo (1x por orçamento+pessoa+papel)
    const detalhesResp = {};         // breakdown: nome -> [{leadId, papel, valorPago, comissaoGerada, data, orcamentoId}]

    (pagamentos || []).forEach(pag => {
      const orc = orcInfo[pag.orcamento_id];
      if (!orc) return; // pagamento de orçamento sem fechado_por definido
      const valorPago = Number(pag.valor || 0);
      if (valorPago <= 0) return;

      // base da comissão percentual = valor líquido (desconta taxa do cartão, se houver)
      const taxaPct = taxaDoPagamento(taxasCartao, pag.forma, pag.parcelas);
      const baseComissao = valorPago * (1 - taxaPct / 100);

      // ── quem FECHOU ──
      const fechador = orc.fechado_por;
      if (fechador) {
        fechadoPorResp[fechador] = (fechadoPorResp[fechador] || 0) + valorPago;
        const rF = regras[fechador];
        if (rF) {
          let comissaoGerada = 0;
          if (rF.com_fechar_tipo === 'percentual') {
            comissaoGerada = baseComissao * Number(rF.com_fechar_valor || 0) / 100;
            comissaoResp[fechador] = (comissaoResp[fechador] || 0) + comissaoGerada;
          } else if (rF.com_fechar_tipo === 'fixo') {
            // fixo: conta 1x por orçamento (no primeiro pagamento dele)
            const chave = 'F_' + pag.orcamento_id + '_' + fechador;
            if (!fixoJaContado[chave]) {
              comissaoGerada = Number(rF.com_fechar_valor || 0);
              comissaoResp[fechador] = (comissaoResp[fechador] || 0) + comissaoGerada;
              fixoJaContado[chave] = true;
            }
          }
          if (comissaoGerada > 0 || rF.com_fechar_tipo === 'percentual') {
            (detalhesResp[fechador] = detalhesResp[fechador] || []).push({
              leadId: orc.lead_id, papel: 'Fechou', valorPago, comissaoGerada, data: pag.data, orcamentoId: pag.orcamento_id,
            });
          }
        }
      }

      // ── quem AGENDOU aquele paciente ──
      const ag = agendadorDoLead[orc.lead_id];
      if (ag && ag.nome) {
        const rA = regras[ag.nome];
        if (rA) {
          let comissaoGerada = 0;
          if (rA.com_agendar_tipo === 'percentual') {
            comissaoGerada = baseComissao * Number(rA.com_agendar_valor || 0) / 100;
            comissaoResp[ag.nome] = (comissaoResp[ag.nome] || 0) + comissaoGerada;
          } else if (rA.com_agendar_tipo === 'fixo') {
            const chave = 'A_' + pag.orcamento_id + '_' + ag.nome;
            if (!fixoJaContado[chave]) {
              comissaoGerada = Number(rA.com_agendar_valor || 0);
              comissaoResp[ag.nome] = (comissaoResp[ag.nome] || 0) + comissaoGerada;
              fixoJaContado[chave] = true;
            }
          }
          if (comissaoGerada > 0 || rA.com_agendar_tipo === 'percentual') {
            (detalhesResp[ag.nome] = detalhesResp[ag.nome] || []).push({
              leadId: orc.lead_id, papel: 'Agendou', valorPago, comissaoGerada, data: pag.data, orcamentoId: pag.orcamento_id,
            });
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
          const valor = Number(rC.com_comparecer_valor || 0);
          comissaoResp[nome] = (comissaoResp[nome] || 0) + valor;
          (detalhesResp[nome] = detalhesResp[nome] || []).push({
            leadId: null, leadNomeDireto: null, consultaId: c.id, papel: 'Compareceu (avaliação)',
            valorPago: null, comissaoGerada: valor, data: c.data, orcamentoId: null,
          });
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

    // busca nome dos pacientes envolvidos (pra mostrar no breakdown ao expandir)
    const todosLeadIds = [...new Set(Object.values(detalhesResp).flat().map(d => d.leadId).filter(Boolean))];
    const nomeLeadMap = {};
    if (todosLeadIds.length) {
      try {
        const { data: leadsInfo } = await db.from('leads').select('id, nome').in('id', todosLeadIds);
        (leadsInfo || []).forEach(l => { nomeLeadMap[l.id] = l.nome || 'Sem nome'; });
      } catch (e) { /* segue sem nome, mostra "—" */ }
    }
    // busca nome do paciente de comparecimentos (via consulta -> lead)
    const consultaIds = [...new Set(Object.values(detalhesResp).flat().filter(d => d.consultaId).map(d => d.consultaId))];
    if (consultaIds.length) {
      try {
        const { data: consultasInfo } = await db.from('consultas').select('id, lead_id').in('id', consultaIds);
        const consultaLeadMap = {};
        (consultasInfo || []).forEach(c => { consultaLeadMap[c.id] = c.lead_id; });
        const leadIdsComparec = [...new Set(Object.values(consultaLeadMap).filter(Boolean))];
        if (leadIdsComparec.length) {
          const { data: leadsComparec } = await db.from('leads').select('id, nome').in('id', leadIdsComparec);
          (leadsComparec || []).forEach(l => { nomeLeadMap[l.id] = l.nome || 'Sem nome'; });
        }
        Object.values(detalhesResp).flat().forEach(d => {
          if (d.consultaId && consultaLeadMap[d.consultaId]) d.leadId = consultaLeadMap[d.consultaId];
        });
      } catch (e) { /* segue sem nome */ }
    }

    // Ordena por comissão (maior primeiro)
    const ordenados = [...todos].sort((a, b) => (comissaoResp[b] || 0) - (comissaoResp[a] || 0));

    cont.querySelector('#desempCards').innerHTML = ordenados.map((nome, idx) => {
      const agend = agendPorResp[nome] || 0;
      const fechado = fechadoPorResp[nome] || 0;
      const comissao = comissaoResp[nome] || 0;
      const detalhes = (detalhesResp[nome] || []).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
      const cardId = 'desempCard' + idx;

      // ⚠️ ALERTA: comissão maior que o valor recebido é matematicamente
      // suspeito (comissão nunca deveria superar 100% do que a clínica
      // recebeu) — quase sempre sinal de erro de digitação na % cadastrada
      // em "Responsáveis" (ex: 2605 em vez de 26,05).
      const suspeito = fechado > 0 && comissao > fechado;
      const avisoSuspeito = suspeito
        ? `<div style="margin-top:10px;padding:8px 10px;background:rgba(192,98,74,0.12);border:1px solid var(--coral,#C0624A);border-radius:8px;font-size:11px;color:var(--coral,#C0624A);">⚠️ Comissão maior que o valor recebido — confira a % cadastrada pra ${nome} em Colaboradores/Responsáveis (provável erro de digitação, ex: 2605 em vez de 26,05).</div>`
        : '';

      const linhasDetalhe = detalhes.length ? detalhes.map(d => `
        <tr style="border-bottom:1px solid var(--border-subtle,rgba(255,255,255,0.05));">
          <td style="padding:7px 6px;font-size:12px;">${d.leadId ? (nomeLeadMap[d.leadId] || 'Paciente') : '—'}</td>
          <td style="padding:7px 6px;font-size:11px;color:var(--text-muted);">${d.papel}</td>
          <td style="padding:7px 6px;font-size:11px;color:var(--text-muted);">${d.data ? new Date(d.data + 'T12:00').toLocaleDateString('pt-BR') : '—'}</td>
          <td style="padding:7px 6px;font-size:12px;text-align:right;color:var(--text-secondary);">${d.valorPago != null ? fmt(d.valorPago) : '—'}</td>
          <td style="padding:7px 6px;font-size:12px;text-align:right;color:var(--gold);font-weight:600;">${fmt(d.comissaoGerada)}</td>
        </tr>`).join('')
        : '<tr><td colspan="5" style="padding:14px;text-align:center;color:var(--text-muted);font-size:12px;">Sem detalhamento disponível pra esse período.</td></tr>';

      return `
        <div class="card" style="padding:16px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;cursor:pointer;" onclick="document.getElementById('${cardId}').style.display = document.getElementById('${cardId}').style.display === 'none' ? 'block' : 'none'; document.getElementById('${cardId}icon').classList.toggle('ti-chevron-down'); document.getElementById('${cardId}icon').classList.toggle('ti-chevron-up');">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:38px;height:38px;border-radius:50%;background:var(--gold-pale);display:flex;align-items:center;justify-content:center;color:var(--gold);font-weight:700;">
                ${nome.charAt(0).toUpperCase()}
              </div>
              <strong style="font-size:15px;">${nome}</strong>
              <i id="${cardId}icon" class="ti ti-chevron-down" style="color:var(--text-muted);font-size:14px;"></i>
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
                <div style="font-size:11px;color:var(--gold);text-transform:uppercase;font-weight:600;">Comissão ${suspeito ? '⚠️' : ''}</div>
                <div style="font-size:19px;font-weight:700;color:${suspeito ? 'var(--coral,#C0624A)' : 'var(--gold)'};font-family:var(--mono);">${fmt(comissao)}</div>
              </div>
            </div>
          </div>
          ${avisoSuspeito}
          <div id="${cardId}" style="display:none;margin-top:14px;padding-top:14px;border-top:1px dashed var(--border-subtle,rgba(255,255,255,0.08));">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="text-align:left;border-bottom:1px solid var(--border,rgba(201,168,76,0.15));">
                  <th style="padding:6px;font-size:10px;color:var(--text-muted);text-transform:uppercase;">Paciente</th>
                  <th style="padding:6px;font-size:10px;color:var(--text-muted);text-transform:uppercase;">Papel</th>
                  <th style="padding:6px;font-size:10px;color:var(--text-muted);text-transform:uppercase;">Data</th>
                  <th style="padding:6px;font-size:10px;color:var(--text-muted);text-transform:uppercase;text-align:right;">Valor pago</th>
                  <th style="padding:6px;font-size:10px;color:var(--text-muted);text-transform:uppercase;text-align:right;">Comissão</th>
                </tr>
              </thead>
              <tbody>${linhasDetalhe}</tbody>
            </table>
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
