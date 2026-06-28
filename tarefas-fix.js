// ============================================================
// CLINICALEAD — CENTRAL DE TAREFAS DO DIA (CRC)
// Gera tarefas automaticamente a partir de leads + consultas:
//   🔴 Urgente:    remarcação pedida | lead novo sem contato | consulta não confirmada
//   🟡 Importante: recuperar falta | follow-up de lead parado
//   🟢 Relação:    pós-venda / pedir avaliação
// Card no Dashboard + badge no menu + pop-up de resumo diário
// ============================================================

let TAREFAS = {
  lista: [],
  consultas: [],
  resolvidas: {},   // chave -> { adiada_ate }
  popupMostrado: false,
};

// ── Helpers de data ──────────────────────────────────────────
function tIsoLocal(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}
function tHoje() { return tIsoLocal(new Date()); }
function tDiasAtras(n) { const d = new Date(); d.setDate(d.getDate() - n); return tIsoLocal(d); }
function tDiasFrente(n) { const d = new Date(); d.setDate(d.getDate() + n); return tIsoLocal(d); }
function tEsc(s) { return String(s || '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }
function tFmtData(iso) { const [a,m,d] = String(iso).split('-'); return `${d}/${m}`; }

// ── Carregar dados ───────────────────────────────────────────
async function tarefasCarregarDados() {
  const clinic = currentClinic();
  if (!clinic) return false;

  // Consultas: últimos 7 dias (faltas) até +2 dias (confirmações)
  const { data: cons } = await db.from('consultas')
    .select('*')
    .eq('clinic_id', clinic.id)
    .gte('data', tDiasAtras(7))
    .lte('data', tDiasFrente(2));
  TAREFAS.consultas = cons || [];

  // Tarefas já resolvidas/adiadas
  const { data: res } = await db.from('tarefas_resolvidas')
    .select('tarefa_chave, adiada_ate')
    .eq('clinic_id', clinic.id);
  TAREFAS.resolvidas = {};
  (res || []).forEach(r => { TAREFAS.resolvidas[r.tarefa_chave] = r; });

  // ── ÚLTIMA MENSAGEM por lead (pra saber se já houve resposta do Brian/humano) ──
  // Um lead só está "esfriando" se a última mensagem foi DELE (esperando resposta).
  // Se o Brian ou um humano já respondeu, NÃO está esfriando.
  TAREFAS.ultimaMsgPorTelefone = {};
  try {
    const { data: msgs } = await db.from('mensagens')
      .select('phone, from_me, contact_name, created_at')
      .eq('clinic_id', clinic.id)
      .order('created_at', { ascending: false })
      .limit(800); // últimas mensagens da clínica (suficiente pra leads recentes)
    // guarda só a PRIMEIRA (mais recente) de cada telefone
    (msgs || []).forEach(m => {
      if (!m.phone) return;
      const sufixo = String(m.phone).replace(/\D/g, '').slice(-8);
      if (sufixo.length < 8) return;
      if (!TAREFAS.ultimaMsgPorTelefone[sufixo]) {
        TAREFAS.ultimaMsgPorTelefone[sufixo] = m; // a mais recente (já vem ordenado desc)
      }
    });
  } catch (e) { console.error('[tarefas] carregar mensagens', e); TAREFAS.ultimaMsgPorTelefone = {}; }

  // Orçamentos parados: sem nenhuma aprovação há 3+ dias
  try {
    const { data: orcsParados } = await db.from('orcamentos')
      .select('id,lead_id,created_at,status')
      .eq('clinic_id', clinic.id)
      .in('status', ['rascunho', 'enviado'])
      .lte('created_at', tDiasAtras(3) + 'T23:59:59');
    TAREFAS.orcamentos = orcsParados || [];
    TAREFAS.orcItens = [];
    if (TAREFAS.orcamentos.length) {
      const { data: its } = await db.from('orcamento_itens')
        .select('orcamento_id,valor,qtd')
        .in('orcamento_id', TAREFAS.orcamentos.map(o => o.id));
      TAREFAS.orcItens = its || [];
    }
  } catch (e) {
    TAREFAS.orcamentos = [];
    TAREFAS.orcItens = [];
  }

  // Histórico p/ retorno semestral: últimas presenças + consultas futuras
  try {
    const { data: hist } = await db.from('consultas')
      .select('lead_id,data,status')
      .eq('clinic_id', clinic.id)
      .in('status', ['compareceu', 'agendado', 'confirmado']);
    TAREFAS.ultimaPresenca = {};
    TAREFAS.temConsultaFutura = {};
    const hoje = tHoje();
    (hist || []).forEach(c => {
      if (c.status === 'compareceu') {
        if (!TAREFAS.ultimaPresenca[c.lead_id] || c.data > TAREFAS.ultimaPresenca[c.lead_id]) {
          TAREFAS.ultimaPresenca[c.lead_id] = c.data;
        }
      } else if (c.data >= hoje) {
        TAREFAS.temConsultaFutura[c.lead_id] = true;
      }
    });
  } catch (e) {
    TAREFAS.ultimaPresenca = {};
    TAREFAS.temConsultaFutura = {};
  }

  return true;
}

function tarefaEstaOculta(chave) {
  const r = TAREFAS.resolvidas[chave];
  if (!r) return false;
  if (!r.adiada_ate) return true;            // concluída de vez
  return r.adiada_ate > tHoje();             // adiada e ainda não voltou
}

// ── Gerar tarefas a partir dos dados ─────────────────────────
function tarefasGerar() {
  const leads = currentLeads();
  const leadMap = {};
  (STATE.leads || []).forEach(l => { leadMap[l.id] = l; });

  const hoje = tHoje();
  const amanha = tDiasFrente(1);
  const agora = Date.now();
  const tarefas = [];

  // 🔴 1. Pedidos de remarcação
  TAREFAS.consultas
    .filter(c => c.remarcar_solicitado && c.status === 'agendado')
    .forEach(c => {
      const lead = leadMap[c.lead_id];
      tarefas.push({
        chave: `remarcar:${c.id}`,
        prio: 1,
        icon: 'ti-calendar-x',
        titulo: `${lead?.nome || 'Paciente'} pediu remarcação`,
        desc: `Consulta de ${tFmtData(c.data)} às ${(c.hora||'').slice(0,5)} — entrar em contato e oferecer novo horário`,
        telefone: lead?.telefone || null,
      });
    });

  // 🔴 2. Consultas de hoje/amanhã NÃO confirmadas (lembrete enviado, sem resposta)
  TAREFAS.consultas
    .filter(c => c.status === 'agendado' && c.lembrete_24h && !c.remarcar_solicitado && (c.data === hoje || c.data === amanha))
    .forEach(c => {
      const lead = leadMap[c.lead_id];
      const quando = c.data === hoje ? 'HOJE' : 'amanhã';
      tarefas.push({
        chave: `confirmar:${c.id}`,
        prio: 1,
        icon: 'ti-phone',
        titulo: `Confirmar consulta de ${lead?.nome || 'paciente'}`,
        desc: `Consulta ${quando} às ${(c.hora||'').slice(0,5)} — recebeu o lembrete mas não respondeu. Ligar para confirmar`,
        telefone: lead?.telefone || null,
      });
    });

  // 🔴 3. Leads novos REALMENTE esfriando: última mensagem foi do LEAD (ninguém respondeu)
  // Antes olhava só "lead criado há 1h" — mas isso gerava tarefa falsa quando o Brian
  // já tinha criado E respondido o lead. Agora checa a ÚLTIMA mensagem: só é "esfriando"
  // se o lead falou por último e nem o Brian nem um humano respondeu.
  leads
    .filter(l => l.status === 'novo' && l.created_at)
    .forEach(l => {
      const horas = (agora - new Date(l.created_at).getTime()) / 3600000;
      if (horas < 1) return;

      // checa a última mensagem dessa conversa
      const sufixo = String(l.telefone || '').replace(/\D/g, '').slice(-8);
      const ultimaMsg = (sufixo.length === 8) ? (TAREFAS.ultimaMsgPorTelefone || {})[sufixo] : null;

      if (ultimaMsg) {
        // se a última mensagem foi DO BRIAN ou de um HUMANO da clínica (from_me=true),
        // o lead JÁ FOI atendido → NÃO está esfriando, não gera tarefa.
        if (ultimaMsg.from_me === true) return;
        // se a última foi do lead, recalcula o "tempo esfriando" a partir dela
        // (é o tempo real sem resposta, não desde a criação do lead)
        const horasSemResposta = (agora - new Date(ultimaMsg.created_at).getTime()) / 3600000;
        if (horasSemResposta < 1) return; // respondeu/falou há pouco, dá um tempo
      }
      // se não há mensagem nenhuma registrada, mantém o comportamento antigo
      // (lead criado mas sem conversa = vale lembrar de fazer o primeiro contato)

      // tempo a exibir: desde a última msg do lead (se houver) ou desde a criação
      const refTempo = ultimaMsg ? new Date(ultimaMsg.created_at).getTime() : new Date(l.created_at).getTime();
      const horasRef = (agora - refTempo) / 3600000;
      const tempo = horasRef < 24 ? `${Math.floor(horasRef)}h` : `${Math.floor(horasRef/24)} dia(s)`;
      tarefas.push({
        chave: `novo_lead:${l.id}`,
        prio: 1,
        icon: 'ti-flame',
        titulo: `Lead aguardando resposta: ${l.nome}`,
        desc: `Sem resposta há ${tempo} — lead respondido rápido converte muito mais!`,
        telefone: l.telefone || null,
      });
    });

  // 🟡 4. Recuperar faltas (últimos 7 dias)
  TAREFAS.consultas
    .filter(c => c.status === 'faltou' && c.data <= hoje)
    .forEach(c => {
      const lead = leadMap[c.lead_id];
      tarefas.push({
        chave: `falta:${c.id}`,
        prio: 2,
        icon: 'ti-door-off',
        titulo: `Recuperar falta de ${lead?.nome || 'paciente'}`,
        desc: `Faltou dia ${tFmtData(c.data)} — entrar em contato e oferecer novo horário (dinheiro de volta pro caixa!)`,
        telefone: lead?.telefone || null,
      });
    });

  // 🟡 5. Follow-up de leads parados há 3+ dias (desde a última mudança de status)
  leads
    .filter(l => ['contato','sem_resposta'].includes(l.status) && (l.status_alterado_em || l.created_at))
    .forEach(l => {
      const ref = l.status_alterado_em || l.created_at;
      const diasParado = Math.floor((agora - new Date(ref).getTime()) / 86400000);
      if (diasParado < 3) return;
      tarefas.push({
        chave: `followup:${l.id}`,
        prio: 2,
        icon: 'ti-message-forward',
        titulo: `Follow-up: ${l.nome}`,
        desc: `Lead parado em "${l.status === 'contato' ? 'Em contato' : 'Sem resposta'}" há ${diasParado} dias — fazer nova tentativa`,
        telefone: l.telefone || null,
      });
    });

  // 🟢 6. Pós-venda: fechados entre 2 e 10 dias atrás (pela data do fechamento)
  leads
    .filter(l => l.status === 'fechado' && (l.status_alterado_em || l.created_at))
    .forEach(l => {
      const ref = l.status_alterado_em || l.created_at;
      const dias = Math.floor((agora - new Date(ref).getTime()) / 86400000);
      if (dias < 2 || dias > 10) return;
      tarefas.push({
        chave: `posvenda:${l.id}`,
        prio: 3,
        icon: 'ti-star',
        titulo: `Pós-venda: ${l.nome}`,
        desc: `Perguntar como foi a experiência e pedir avaliação no Google ⭐ (gera indicações!)`,
        telefone: l.telefone || null,
      });
    });

  // 🟡 7. Orçamentos sem resposta há 3+ dias (dinheiro na mesa!)
  (TAREFAS.orcamentos || []).forEach(o => {
    const lead = leadMap[o.lead_id];
    const dias = Math.floor((agora - new Date(o.created_at).getTime()) / 86400000);
    const valor = (TAREFAS.orcItens || [])
      .filter(i => i.orcamento_id === o.id)
      .reduce((s, i) => s + Number(i.valor) * Number(i.qtd || 1), 0);
    if (valor <= 0) return;
    tarefas.push({
      chave: `orcamento:${o.id}`,
      prio: 2,
      icon: 'ti-file-invoice',
      titulo: `Orçamento parado: ${lead?.nome || 'Lead'} (${fmtCurrency(valor)})`,
      desc: `Sem aprovação há ${dias} dias — fazer follow-up, tirar dúvidas e oferecer condições de pagamento`,
      telefone: lead?.telefone || null,
      leadId: o.lead_id,
    });
  });

  // 🟢 8. Retorno semestral: última atividade entre 6 e 8 meses atrás
  //    Regra: relógio conta da ÚLTIMA atividade (presença ou fechamento);
  //    novo tratamento reinicia; consulta futura marcada = não cobra.
  leads
    .filter(l => l.status === 'fechado')
    .forEach(l => {
      if (TAREFAS.temConsultaFutura[l.id]) return; // já está voltando
      const fechamento = (l.status_alterado_em || l.created_at || '').split('T')[0];
      const presenca = TAREFAS.ultimaPresenca[l.id] || '';
      const ref = presenca > fechamento ? presenca : fechamento;
      if (!ref) return;
      const dias = Math.floor((agora - new Date(ref + 'T12:00').getTime()) / 86400000);
      if (dias < 183 || dias > 244) return; // janela: 6 a 8 meses
      tarefas.push({
        chave: `retorno:${l.id}:${ref}`,
        prio: 3,
        icon: 'ti-calendar-repeat',
        titulo: `Retorno semestral: ${l.nome}`,
        desc: `Última visita há ${Math.floor(dias / 30)} meses — convidar para revisão e limpeza preventiva (use a automação "Retorno semestral")`,
        telefone: l.telefone || null,
        leadId: l.id,
      });
    });

  // 🟢 9. Aniversariantes de HOJE 🎂
  const hojeMesDia = tHoje().slice(5); // "MM-DD"
  leads
    .filter(l => l.data_nascimento && String(l.data_nascimento).slice(5) === hojeMesDia)
    .forEach(l => {
      tarefas.push({
        chave: `aniversario:${l.id}:${tHoje().slice(0, 4)}`,
        prio: 3,
        icon: 'ti-cake',
        titulo: `🎂 Aniversário de ${l.nome} HOJE!`,
        desc: `Enviar parabéns — clique no 🎂 para mandar a mensagem da automação em 1 clique`,
        telefone: l.telefone || null,
        leadId: l.id,
        aniversario: true,
      });
    });

  // Remove tarefas concluídas/adiadas e ordena por prioridade
  TAREFAS.lista = tarefas
    .filter(t => !tarefaEstaOculta(t.chave))
    .sort((a, b) => a.prio - b.prio);
}

// ── Renderizar o card no Dashboard ───────────────────────────
function tarefasRenderCard() {
  const page = document.getElementById('page-dashboard');
  if (!page) return;

  let card = document.getElementById('tarefasCard');
  if (!card) {
    const header = page.querySelector('.page-header');
    if (!header) return;
    card = document.createElement('div');
    card.className = 'card';
    card.id = 'tarefasCard';
    card.style.marginBottom = '20px';
    header.insertAdjacentElement('afterend', card);
  }

  const lista = TAREFAS.lista;
  const urgentes = lista.filter(t => t.prio === 1).length;

  const corPrio = { 1: 'var(--coral)', 2: 'var(--gold-bright)', 3: 'var(--gold)' };
  const labelPrio = { 1: 'URGENTE', 2: 'IMPORTANTE', 3: 'RELACIONAMENTO' };

  const headerHtml = `
    <div class="card-header">
      <h3><i class="ti ti-checklist" style="margin-right:6px;color:var(--gold);font-size:16px;"></i>Tarefas de hoje</h3>
      <span style="font-size:11px;color:var(--text-muted);">
        ${lista.length} pendente${lista.length === 1 ? '' : 's'}${urgentes ? ` · <span style="color:var(--coral);font-weight:600;">${urgentes} urgente${urgentes === 1 ? '' : 's'}</span>` : ''}
      </span>
    </div>`;

  if (!lista.length) {
    card.innerHTML = headerHtml + `
      <div class="card-body" style="text-align:center;padding:28px 16px;">
        <div style="font-size:28px;margin-bottom:8px;">🎉</div>
        <div style="font-size:14px;font-weight:600;">Tudo em dia!</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Nenhuma tarefa pendente para a equipe agora.</div>
      </div>`;
    return;
  }

  const linhas = lista.map(t => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-subtle);">
      <div style="width:8px;height:8px;border-radius:50%;background:${corPrio[t.prio]};flex-shrink:0;" title="${labelPrio[t.prio]}"></div>
      <i class="ti ${t.icon}" style="font-size:16px;color:${corPrio[t.prio]};flex-shrink:0;"></i>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;">${tEsc(t.titulo)}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;">${tEsc(t.desc)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        ${t.aniversario ? `<button class="btn btn-sm" onclick="tarefaEnviarAniversario('${t.leadId}','${t.chave}')" title="Enviar parabéns agora (mensagem da automação)">🎂</button>` : ''}
        ${t.leadId && !t.aniversario ? `<button class="btn btn-sm" onclick="openOrcamento('${t.leadId}')" title="Abrir orçamentos"><i class="ti ti-file-invoice" style="color:var(--gold);"></i></button>` : ''}
        ${t.telefone ? `<button class="btn btn-sm" onclick="tarefaWhats('${tEsc(t.telefone)}')" title="Abrir conversa no WhatsApp"><i class="ti ti-brand-whatsapp" style="color:#25D366;"></i></button>` : ''}
        <button class="btn btn-sm" onclick="tarefaAdiar('${t.chave}')" title="Adiar para amanhã"><i class="ti ti-clock-pause"></i></button>
        <button class="btn btn-sm" onclick="tarefaConcluir('${t.chave}')" title="Marcar como concluída" style="color:var(--gold);"><i class="ti ti-check"></i></button>
      </div>
    </div>`).join('');

  card.innerHTML = headerHtml + `<div class="card-body" style="padding-top:4px;">${linhas}</div>`;
}

// ── Badge no menu lateral ────────────────────────────────────
function tarefasAtualizarBadge() {
  const navItem = document.querySelector('[data-page="dashboard"]');
  if (!navItem) return;
  let b = document.getElementById('navTarefasBadge');
  if (!b) {
    b = document.createElement('span');
    b.id = 'navTarefasBadge';
    navItem.appendChild(b);
  }
  const total = TAREFAS.lista.length;
  const urgentes = TAREFAS.lista.filter(t => t.prio === 1).length;
  b.className = 'nav-badge' + (urgentes > 0 ? ' red' : '');
  b.textContent = total;
  b.style.display = total > 0 ? '' : 'none';
}

// ── Pop-up "Bom dia" (1x por dia, por clínica) ───────────────
function tarefasMostrarPopup() {
  const clinic = currentClinic();
  if (!clinic || !TAREFAS.lista.length) return;

  const chaveSession = `tarefasPopup_${clinic.id}_${tHoje()}`;
  try {
    if (sessionStorage.getItem(chaveSession)) return;
    sessionStorage.setItem(chaveSession, '1');
  } catch (e) { /* sessionStorage indisponível: mostra mesmo assim só 1x */ if (TAREFAS.popupMostrado) return; }
  TAREFAS.popupMostrado = true;

  const total = TAREFAS.lista.length;
  const urgentes = TAREFAS.lista.filter(t => t.prio === 1).length;
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  let overlay = document.getElementById('modalTarefasResumo');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalTarefasResumo';
    document.body.appendChild(overlay);
  }

  const top3 = TAREFAS.lista.slice(0, 3).map(t =>
    `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;">
      <i class="ti ${t.icon}" style="color:${t.prio === 1 ? 'var(--coral)' : 'var(--gold)'};font-size:14px;"></i>
      <span>${tEsc(t.titulo)}</span>
    </div>`).join('');

  overlay.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header">
        <h3><i class="ti ti-sunrise" style="margin-right:8px;color:var(--gold);"></i>${saudacao}!</h3>
        <button class="btn btn-ghost btn-icon" onclick="closeModal('modalTarefasResumo')"><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        <p style="font-size:14px;margin-bottom:12px;">
          Você tem <strong style="color:var(--gold);">${total} tarefa${total === 1 ? '' : 's'}</strong> hoje${urgentes ? `, sendo <strong style="color:var(--coral);">${urgentes} urgente${urgentes === 1 ? '' : 's'} 🔴</strong>` : ''}.
        </p>
        ${top3}
        ${total > 3 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;">+ ${total - 3} outra${total - 3 === 1 ? '' : 's'}...</div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="closeModal('modalTarefasResumo')" style="width:100%;"><i class="ti ti-checklist"></i> Ver tarefas no painel</button>
      </div>
    </div>`;

  overlay.classList.add('open');
}

// ── Ações dos botões ─────────────────────────────────────────
async function tarefaConcluir(chave) {
  const clinic = currentClinic();
  if (!clinic) return;
  await db.from('tarefas_resolvidas').upsert(
    { clinic_id: clinic.id, tarefa_chave: chave, adiada_ate: null, resolvida_em: new Date().toISOString() },
    { onConflict: 'clinic_id,tarefa_chave' }
  );
  TAREFAS.resolvidas[chave] = { adiada_ate: null };
  tarefasGerar();
  tarefasRenderCard();
  tarefasAtualizarBadge();
  toast('Tarefa concluída! ✓');
}

async function tarefaAdiar(chave) {
  const clinic = currentClinic();
  if (!clinic) return;
  const amanha = tDiasFrente(1);
  await db.from('tarefas_resolvidas').upsert(
    { clinic_id: clinic.id, tarefa_chave: chave, adiada_ate: amanha, resolvida_em: new Date().toISOString() },
    { onConflict: 'clinic_id,tarefa_chave' }
  );
  TAREFAS.resolvidas[chave] = { adiada_ate: amanha };
  tarefasGerar();
  tarefasRenderCard();
  tarefasAtualizarBadge();
  toast('Adiada para amanhã ⏰');
}

function tarefaWhats(telefone) {
  const d = String(telefone).replace(/\D/g, '');
  if (!d) return;
  const n = d.startsWith('55') ? d : '55' + d;
  window.open('https://wa.me/' + n, '_blank');
}

// ── Atualização principal ────────────────────────────────────
async function atualizarTarefasDashboard() {
  try {
    const ok = await tarefasCarregarDados();
    if (!ok) return;
    tarefasGerar();
    tarefasRenderCard();
    tarefasAtualizarBadge();
    tarefasMostrarPopup();
  } catch (e) {
    console.error('[tarefas] Erro:', e);
  }
}

// ── Hook no renderDashboard original ─────────────────────────
(function () {
  if (typeof renderDashboard !== 'function') {
    console.error('[tarefas] renderDashboard não encontrado — tarefas-fix.js precisa carregar depois do index.html');
    return;
  }
  const _renderDashboardOriginal = renderDashboard;
  renderDashboard = function () {
    _renderDashboardOriginal();
    atualizarTarefasDashboard();
  };
})();

// ── Enviar parabéns em 1 clique (usa a automação "aniversario") ──
async function tarefaEnviarAniversario(leadId, chave) {
  const clinic = currentClinic();
  const lead = (STATE.leads || []).find(l => l.id === leadId);
  if (!clinic || !lead) return;
  if (!clinic.whatsapp_instance || !lead.telefone) {
    toast('Clínica sem WhatsApp conectado ou lead sem telefone', 'error');
    return;
  }

  // Busca a mensagem editável da clínica (ou o padrão)
  let template = null;
  try {
    const { data: auto } = await db.from('automacoes')
      .select('mensagem,ativo')
      .eq('clinic_id', clinic.id)
      .eq('tipo', 'aniversario')
      .maybeSingle();
    if (auto) template = auto.ativo ? auto.mensagem : null;
  } catch (e) {}
  if (!template && typeof AUTOMACOES_DEFAULTS !== 'undefined') {
    template = AUTOMACOES_DEFAULTS.find(a => a.tipo === 'aniversario')?.msg || null;
  }
  if (!template) { toast('Automação de aniversário não encontrada/ativa', 'error'); return; }

  const msg = template
    .replaceAll('{nome}', lead.nome || '')
    .replaceAll('{clinica}', clinic.nome || clinic.name || '')
    .replaceAll('{procedimento}', lead.procedimento || '');

  try {
    await sendWhatsAppMessage(clinic.whatsapp_instance, lead.telefone, msg);
    toast(`🎂 Parabéns enviado para ${lead.nome}!`);
    tarefaConcluir(chave); // missão cumprida, tarefa some sozinha
  } catch (e) {
    toast('Erro ao enviar: ' + (e?.message || 'verifique a conexão do WhatsApp'), 'error');
  }
}

console.log('✅ tarefas-fix.js carregado — Central de Tarefas do CRC ativa');
