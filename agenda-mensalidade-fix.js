// ============================================================
// CLINICALEAD — SINAL DE MENSALIDADE NA AGENDA
// Coloca um selo em cada agendamento avisando a recepção:
//   🔴 Mensalidade atrasada  → segura e cobra antes de liberar
//   🟡 Vence este mês         → fica de olho / aproveita pra lembrar
//   (sem selo)                → em dia, ou sem mensalidade
// Passar o mouse mostra valor e vencimento.
//
// Segue o mesmo padrão do agenda-semaforo-fix.js: engancha em
// renderDaySchedule e enfeita os .sched-item de #agendaList.
// NÃO conflita com o semáforo de status (usa classe própria).
// Sem SQL: usa mensalidade_parcelas + leads (via RLS).
// ============================================================

(function () {
  'use strict';

  const SIG = { map: {}, clinicId: null, carregando: false, carregadoEm: 0 };

  const fmt = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  function brData(s) { if (!s) return ''; const d = new Date(s + 'T12:00'); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR'); }

  // datas no fuso BRT (igual o semáforo faz), pra "hoje"/"fim do mês" baterem certo
  function refDatas() {
    const d = new Date(Date.now() - 3 * 3600 * 1000);
    const y = d.getUTCFullYear(), mo = d.getUTCMonth(), dia = d.getUTCDate();
    const ult = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const p2 = (n) => String(n).padStart(2, '0');
    return {
      hoje: `${y}-${p2(mo + 1)}-${p2(dia)}`,
      fimMes: `${y}-${p2(mo + 1)}-${p2(ult)}`,
    };
  }

  // carrega (com cache de 60s) o status de mensalidade por paciente
  async function sigCarregar(force) {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;
    const agora = Date.now();
    if (!force && SIG.clinicId === clinic.id && (agora - SIG.carregadoEm) < 60000) return;
    if (SIG.carregando) return;
    SIG.carregando = true;
    try {
      const { hoje, fimMes } = refDatas();
      const { data } = await db.from('mensalidade_parcelas')
        .select('lead_id,valor,valor_pago,vencimento,status')
        .eq('clinic_id', clinic.id).in('status', ['pendente', 'parcial']);
      const map = {};
      (data || []).forEach(p => {
        if (!p.lead_id) return;
        const rest = Math.max(0, Number(p.valor || 0) - Number(p.valor_pago || 0));
        if (rest <= 0) return;
        const m = map[p.lead_id] || (map[p.lead_id] = { atrasado: false, mes: false, restAtraso: 0, restMes: 0, prox: null });
        if (p.vencimento < hoje) { m.atrasado = true; m.restAtraso += rest; }
        else if (p.vencimento <= fimMes) { m.mes = true; m.restMes += rest; }
        if (!m.prox || p.vencimento < m.prox) m.prox = p.vencimento;
      });
      SIG.map = map; SIG.clinicId = clinic.id; SIG.carregadoEm = agora;
    } catch (e) { console.error('[agenda-mensalidade]', e); }
    finally { SIG.carregando = false; }
  }

  // aplica os selos nos itens já renderizados da agenda
  function sigAplicar() {
    const container = document.getElementById('agendaList');
    if (!container) return;
    container.querySelectorAll('.mens-sinal').forEach(e => e.remove()); // reset (só os meus)

    container.querySelectorAll('.sched-item').forEach(item => {
      const m = (item.getAttribute('onclick') || '').match(/openEditConsulta\('([^']+)'\)/);
      if (!m) return;
      const consulta = (typeof CAL !== 'undefined' && CAL.consultas) ? CAL.consultas.find(c => c.id === m[1]) : null;
      if (!consulta || !consulta.lead_id) return;
      const sig = SIG.map[consulta.lead_id];
      if (!sig || (!sig.atrasado && !sig.mes)) return;

      const atras = sig.atrasado;
      const cor = atras ? '#E5534B' : '#C9A84C';
      const rotulo = atras ? 'Mensalidade atrasada' : 'Vence este mês';
      const valor = atras ? sig.restAtraso : sig.restMes;
      const venc = sig.prox ? ` · venc. ${brData(sig.prox)}` : '';

      const tag = document.createElement('div');
      tag.className = 'mens-sinal';
      tag.style.cssText = `display:inline-flex;align-items:center;gap:5px;margin-top:3px;font-size:11px;font-weight:600;color:${cor};border:1px solid ${cor}55;background:${cor}14;border-radius:6px;padding:1px 7px;`;
      tag.title = `${rotulo} — ${fmt(valor)}${venc}`;
      tag.innerHTML = `<i class="ti ti-cash" style="font-size:12px;"></i> ${rotulo}`;

      const proc = item.querySelector('.sched-proc');
      const nome = item.querySelector('.sched-name');
      if (proc) proc.parentNode.insertBefore(tag, proc.nextSibling);
      else if (nome) nome.parentNode.insertBefore(tag, nome.nextSibling);
      else item.appendChild(tag);
    });
  }

  function sigCarregarEAplicar(force) {
    Promise.resolve(sigCarregar(force)).then(sigAplicar);
  }

  // ── engancha em renderDaySchedule (coexiste com o semáforo) ──
  function instalar() {
    if (typeof renderDaySchedule !== 'function') return false;
    const _orig = renderDaySchedule;
    renderDaySchedule = function (...args) {
      const r = _orig.apply(this, args);
      setTimeout(() => sigCarregarEAplicar(false), 60); // depois do semáforo (~30ms)
      return r;
    };
    console.log('✅ agenda-mensalidade-fix.js carregado — sinal de mensalidade na agenda');
    return true;
  }
  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }

  // ao abrir a Agenda, recarrega o status fresquinho (ex.: pagou e voltou)
  if (typeof showPage === 'function') {
    const _show = showPage;
    showPage = function (id, el) {
      const r = _show(id, el);
      if (id === 'agenda') setTimeout(() => sigCarregarEAplicar(true), 280);
      return r;
    };
  }

  // reaplica de tempos em tempos (cache), caso a agenda re-renderize sozinha
  setInterval(() => {
    if (document.querySelector('#agendaList .sched-item')) sigAplicar();
  }, 60000);
})();
