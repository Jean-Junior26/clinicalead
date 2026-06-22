// ============================================================
// CLINICALEAD — TAREFA DE MENSALIDADE ATRASADA NO CRC
// Injeta na Central de Tarefas (tarefas-fix.js) uma tarefa URGENTE 🔴
// "Mensalidade atrasada: <paciente>" para cada paciente com parcela
// vencida e não paga. Segue o mesmo padrão das tarefas de falta/follow-up:
//   - aparece no card "Tarefas de hoje" do Dashboard + badge no menu
//   - botões de WhatsApp / adiar / concluir já funcionam (chave própria)
// 1 tarefa por paciente (agrupa as parcelas atrasadas dele).
// Carrega depois de tarefas-fix.js. Sem SQL.
// ============================================================

(function () {
  'use strict';

  const MENSTAR = { lista: [] };

  function fmtBRL(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }

  // carrega as parcelas atrasadas (vencidas e em aberto) agrupadas por paciente
  async function menstarCarregar() {
    try {
      const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
      if (!clinic) { MENSTAR.lista = []; return; }
      const hoje = (typeof tHoje === 'function') ? tHoje() : new Date().toISOString().slice(0, 10);
      const { data } = await db.from('mensalidade_parcelas')
        .select('id, lead_id, valor, valor_pago, vencimento, status')
        .eq('clinic_id', clinic.id)
        .in('status', ['pendente', 'parcial'])
        .lt('vencimento', hoje);
      const map = {};
      (data || []).forEach(p => {
        if (!p.lead_id) return;
        const rest = Math.max(0, Number(p.valor || 0) - Number(p.valor_pago || 0));
        if (rest <= 0) return;
        const m = map[p.lead_id] || (map[p.lead_id] = { leadId: p.lead_id, total: 0, qtd: 0, prox: null });
        m.total += rest; m.qtd += 1;
        if (!m.prox || p.vencimento < m.prox) m.prox = p.vencimento;
      });
      MENSTAR.lista = Object.values(map);
    } catch (e) {
      console.error('[tarefas-mensalidade] carregar', e);
      MENSTAR.lista = [];
    }
  }

  function instalar() {
    if (typeof tarefasCarregarDados !== 'function' || typeof tarefasGerar !== 'function') return false;

    // 1) também busca as parcelas atrasadas sempre que o dashboard recarrega
    const _carregar = tarefasCarregarDados;
    tarefasCarregarDados = async function () {
      const ok = await _carregar.apply(this, arguments);
      await menstarCarregar();
      return ok;
    };

    // 2) injeta as tarefas de mensalidade atrasada na geração (e reordena)
    const _gerar = tarefasGerar;
    tarefasGerar = function () {
      _gerar.apply(this, arguments);
      try {
        const leadMap = {};
        (STATE.leads || []).forEach(l => { leadMap[l.id] = l; });
        const novos = [];
        MENSTAR.lista.forEach(m => {
          const lead = leadMap[m.leadId];
          const nome = lead ? lead.nome : 'Paciente';
          const desde = (typeof tFmtData === 'function') ? tFmtData(m.prox) : m.prox;
          novos.push({
            chave: `mens_atraso:${m.leadId}:${m.prox}`,
            prio: 1,
            icon: 'ti-cash',
            titulo: `Mensalidade atrasada: ${nome}`,
            desc: `${m.qtd} parcela${m.qtd === 1 ? '' : 's'} em aberto · ${fmtBRL(m.total)} · vencida desde ${desde} — cobrar antes de liberar atendimento`,
            telefone: lead ? lead.telefone : null,
          });
        });
        if (novos.length && Array.isArray(TAREFAS.lista)) {
          TAREFAS.lista = TAREFAS.lista
            .concat(novos)
            .filter(t => !(typeof tarefaEstaOculta === 'function' && tarefaEstaOculta(t.chave)))
            .sort((a, b) => a.prio - b.prio);
        }
      } catch (e) {
        console.error('[tarefas-mensalidade] gerar', e);
      }
    };

    console.log('✅ tarefas-mensalidade-fix.js carregado — tarefa de mensalidade atrasada no CRC');
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
