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

  // 🔴 3. Leads novos sem contato há mais de 1h
  leads
    .filter(l => l.status === 'novo' && l.created_at)
    .forEach(l => {
      const horas = (agora - new Date(l.created_at).getTime()) / 3600000;
      if (horas < 1) return;
      const tempo = horas < 24 ? `${Math.floor(horas)}h` : `${Math.floor(horas/24)} dia(s)`;
      tarefas.push({
        chave: `novo_lead:${l.id}`,
        prio: 1,
        icon: 'ti-flame',
        titulo: `Lead novo esfriando: ${l.nome}`,
        desc: `Sem primeiro contato há ${tempo} — lead respondido rápido converte muito mais!`,
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

  // 🟡 5. Follow-up de leads parados há 3+ dias (desde a última movimentação)
  leads
    .filter(l => ['contato','sem_resposta'].includes(l.status))
    .forEach(l => {
      const base = l.status_alterado_em || l.created_at;
      if (!base) return;
      const diasParado = Math.floor((agora - new Date(base).getTime()) / 86400000);
      if (diasParado < 3) return;
      tarefas.push({
        chave: `followup:${l.id}`,
        prio: 2,
        icon: 'ti-message-forward',
        titulo: `Follow-up: ${l.nome}`,
        desc: `Lead sem movimentação em "${l.status === 'contato' ? 'Em contato' : 'Sem resposta'}" há ${diasParado} dias — fazer nova tentativa`,
        telefone: l.telefone || null,
      });
    });

  // 🟢 6. Pós-venda: virou "fechado" há 2 a 10 dias (data real da mudança de status)
  leads
    .filter(l => l.status === 'fechado')
    .forEach(l => {
      const base = l.status_alterado_em || l.created_at;
      if (!base) return;
      const dias = Math.floor((agora - new Date(base).getTime()) / 86400000);
      if (dias < 2 || dias > 10) return;
      tarefas.push({
        chave: `posvenda:${l.id}`,
        prio: 3,
        icon: 'ti-star',
        titulo: `Pós-venda: ${l.nome}`,
        desc: `Fechou há ${dias} dias — perguntar como foi a experiência e pedir avaliação no Google ⭐`,
        telefone: l.telefone || null,
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

console.log('✅ tarefas-fix.js carregado — Central de Tarefas do CRC ativa');
