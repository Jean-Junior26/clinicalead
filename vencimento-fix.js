// ============================================================
// CLINICALEAD — CONTROLE DE VENCIMENTO DO PLANO
// - Banner no painel do cliente: avisa 3 dias antes, no dia, e quando vencido
// - Painel admin: clínicas vencendo/vencidas + botão "marcar como pago"
// - Cobrança automática suave (você não precisa cobrar na mão)
// Carregar como script novo no index.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }
  function ehAdminMaster() {
    const r = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return r === 'admin' || r === 'administrador';
  }

  // calcula dias até o vencimento (negativo = vencido)
  function diasAte(dataISO) {
    if (!dataISO) return null;
    const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(dataISO + 'T00:00:00');
    return Math.round((venc - hoje) / 86400000);
  }

  // ── BANNER NO PAINEL DO CLIENTE ──
  async function verificarVencimento() {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic) return;
    try {
      const { data: s } = await database.from('brian_saldo')
        .select('vence_em, pagamento_status').eq('clinic_id', clinic.id).maybeSingle();
      if (!s || !s.vence_em) { removerBanner(); return; }
      if (s.pagamento_status === 'pago') { removerBanner(); return; } // já pagou esse ciclo

      const dias = diasAte(s.vence_em);
      if (dias === null) return;
      // só mostra a partir de 3 dias antes
      if (dias > 3) { removerBanner(); return; }

      // clínica usa Brian IA? (evita citar o Brian pra quem só usa o CRM)
      let usaIA = false;
      try {
        const { data: cfg } = await database.from('brian_config')
          .select('brian_liberado').eq('clinic_id', clinic.id).maybeSingle();
        usaIA = !!(cfg && cfg.brian_liberado);
      } catch (e) { /* se falhar, assume sem IA (mensagem genérica) */ }

      mostrarBanner(dias, s.vence_em, usaIA);
    } catch (e) { console.error('[vencimento]', e); }
  }

  function removerBanner() {
    const b = document.getElementById('vencimentoBanner');
    if (b) b.remove();
  }

  function fmtData(iso) { const p = iso.split('-'); return `${p[2]}/${p[1]}`; }

  function mostrarBanner(dias, venceEm, usaIA) {
    removerBanner();
    let cor, titulo, texto;
    if (dias > 0) {
      // 3 a 1 dia antes — gentil
      cor = '#C9A84C';
      titulo = `🗓️ Seu plano vence em ${dias} dia${dias > 1 ? 's' : ''}`;
      texto = usaIA
        ? `Pra manter o Brian IA atendendo sem interrupção, é só renovar até ${fmtData(venceEm)}. 😊`
        : `Pra manter o sistema funcionando sem interrupção, é só renovar até ${fmtData(venceEm)}. 😊`;
    } else if (dias === 0) {
      // no dia
      cor = '#C9A84C';
      titulo = '🗓️ Seu plano vence hoje';
      texto = usaIA
        ? 'Renove hoje pra o Brian continuar atendendo seus pacientes sem pausa. 😊'
        : 'Renove hoje pra continuar com acesso completo ao sistema. 😊';
    } else {
      // vencido — firme mas educado
      cor = '#C0624A';
      titulo = `⚠️ Seu plano venceu há ${Math.abs(dias)} dia${Math.abs(dias) > 1 ? 's' : ''}`;
      texto = usaIA
        ? 'Regularize pra reativar o atendimento do Brian IA. Qualquer dúvida, fale com a gente!'
        : 'Regularize pra reativar seu acesso completo. Qualquer dúvida, fale com a gente!';
    }
    const banner = document.createElement('div');
    banner.id = 'vencimentoBanner';
    banner.style.cssText = `margin:0 0 16px;padding:14px 18px;border-radius:12px;border:1px solid ${cor};background:${cor}1a;display:flex;align-items:center;gap:14px;flex-wrap:wrap;`;
    banner.innerHTML = `
      <div style="flex:1;min-width:240px;">
        <div style="font-weight:700;color:${cor};font-size:15px;margin-bottom:3px;">${titulo}</div>
        <div style="font-size:13px;color:var(--text-secondary,#C8C2AE);">${texto}</div>
      </div>`;
    const pageAtiva = document.querySelector('.page.active') || document.querySelector('.content') || document.body;
    pageAtiva.insertBefore(banner, pageAtiva.firstChild);
  }

  // ── PAINEL ADMIN: clínicas vencendo/vencidas ──
  window.verVencimentosAdmin = async function () {
    if (!ehAdminMaster()) return;
    const database = getDb();
    let linhas = [];
    try {
      const { data: saldos } = await database.from('brian_saldo').select('*');
      const { data: clinicas } = await database.from('clinicas').select('id, nome');
      const mapa = {}; (clinicas || []).forEach(c => mapa[c.id] = c.nome);
      (saldos || []).forEach(s => {
        // ⚠️ NOVO 23/08: clínica SEM data de vencimento era simplesmente
        // ignorada aqui (`if (!s.vence_em) return;`) — ficava invisível
        // nos dois lados: nem o cliente via o aviso de vencimento, nem
        // você via ela nesta lista. Caso real: Camaquã e Elaíde ficaram
        // assim sem ninguém perceber. Agora ela aparece no topo, como
        // pendência de cadastro, em vez de sumir caladinha.
        if (!s.vence_em) {
          linhas.push({ nome: mapa[s.clinic_id] || s.clinic_id, clinic_id: s.clinic_id, dias: -99999, vence_em: null, semData: true });
          return;
        }
        const dias = diasAte(s.vence_em);
        // ⚠️ CORREÇÃO 12/09: antes só listava quem vencia em até 5 dias.
        // Quem pagava ADIANTADO (com 10, 20 dias de antecedência) não
        // aparecia aqui, e o Jean não tinha onde lançar o pagamento —
        // tinha que esperar chegar perto do vencimento pra conseguir dar
        // baixa. Agora lista TODAS as clínicas, ordenadas por urgência:
        // as vencidas/vencendo primeiro, as tranquilas no fim.
        if (dias !== null) {
          linhas.push({
            nome: mapa[s.clinic_id] || s.clinic_id,
            clinic_id: s.clinic_id,
            dias,
            vence_em: s.vence_em,
            tranquila: dias > 5, // só pra pintar diferente na tela
          });
        }
      });
      linhas.sort((a, b) => a.dias - b.dias); // mais urgentes primeiro
    } catch (e) { console.error('[vencimento-admin]', e); }

    let modal = document.getElementById('modalVencimentos');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalVencimentos';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    const corpo = linhas.length
      ? linhas.map(l => {
          // linha especial: clínica sem data de vencimento cadastrada
          if (l.semData) {
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:9px;background:var(--bg-base,#0A0A0B);margin-bottom:8px;border-left:3px solid #C0624A;">
              <div><b>${l.nome}</b><div style="font-size:12px;color:#C0624A;">⚠️ Sem data de vencimento cadastrada — esta clínica não recebe aviso nenhum</div></div>
            </div>`;
          }
          const venc = l.dias < 0;
          const txt = venc ? `Venceu há ${Math.abs(l.dias)} dia(s)` : (l.dias === 0 ? 'Vence hoje' : `Vence em ${l.dias} dia(s)`);
          // cor da borda: vermelho = vencida | dourado = vencendo em breve
          // | cinza = tranquila (aparece só pra permitir pagamento adiantado)
          const cor = venc ? '#C0624A' : (l.tranquila ? '#3A3A3A' : '#C9A84C');
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:9px;background:var(--bg-base,#0A0A0B);margin-bottom:8px;border-left:3px solid ${cor};${l.tranquila ? 'opacity:0.72;' : ''}">
            <div><b>${l.nome}</b><div style="font-size:12px;color:var(--text-muted,#888);">${txt} · vence ${fmtData(l.vence_em)}</div></div>
            <button onclick="marcarComoPago('${l.clinic_id}')" style="padding:7px 14px;border-radius:8px;border:none;background:${l.tranquila ? '#2E2E2E' : '#6FBF8E'};color:${l.tranquila ? '#B8B8B8' : '#0A0A0B'};font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap;" title="${l.tranquila ? 'Pagamento adiantado — registra e já empurra o vencimento' : 'Registrar pagamento'}">✓ ${l.tranquila ? 'Pagou adiantado' : 'Marcar pago'}</button>
          </div>`;
        }).join('')
      : '<p style="text-align:center;color:var(--text-muted,#888);padding:20px;">Nenhuma clínica com vencimento cadastrado.</p>';
    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:16px;padding:26px;max-width:520px;width:100%;max-height:90vh;overflow:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
          <h2 style="margin:0;font-size:19px;">🗓️ Vencimentos de planos</h2>
          <button onclick="document.getElementById('modalVencimentos').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:24px;cursor:pointer;">×</button>
        </div>
        <div style="font-size:11.5px;color:var(--text-muted,#888);margin-bottom:14px;line-height:1.55;">
          As clínicas em <b style="color:#C0624A;">vermelho</b> já venceram e as em <b style="color:#C9A84C;">dourado</b> vencem em breve.
          As esmaecidas estão tranquilas — aparecem aqui pra você conseguir lançar <b>pagamento adiantado</b> quando o cliente pagar antes da hora.
        </div>
        ${corpo}
      </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  };

  // marca como pago → registra o pagamento e empurra o vencimento pro próximo mês.
  // IMPORTANTE: NÃO zera os créditos agora. Os créditos do plano só renovam na virada
  // real do ciclo (dia de renovação), pelo cron/renovação lazy. Assim o cliente que
  // paga adiantado não ganha créditos extras antes da hora — é justo e correto.
  window.marcarComoPago = async function (clinicId) {
    if (!ehAdminMaster()) return;
    const database = getDb();
    try {
      const { data: s } = await database.from('brian_saldo')
        .select('vence_em, dia_renovacao').eq('clinic_id', clinicId).maybeSingle();

      // ⚠️ NOVO 12/09: aviso diferente pra PAGAMENTO ADIANTADO. Como
      // agora a lista mostra todas as clínicas (inclusive as que ainda
      // faltam semanas pra vencer), é bom deixar claro quando o
      // vencimento vai ser empurrado bem pra frente — evita alguém
      // clicar por engano na clínica errada e adiantar um mês sem querer.
      const diasFalta = s && s.vence_em ? diasAte(s.vence_em) : null;

      // ⚠️ NOVO 12/09: TRAVA CONTRA PAGAMENTO EM DOBRO.
      // Caso real (José Bonifácio): o botão foi apertado mais de uma vez
      // e o vencimento pulou de 18/10 pra 18/11 — um mês a mais sem o
      // cliente ter pago. Como nada avisava, só dava pra perceber olhando
      // a data depois. Agora, se JÁ existe pagamento registrado hoje, o
      // sistema alerta antes de empurrar de novo.
      const hojeCheck = new Date().toISOString().split('T')[0];
      if (s && s.ultimo_pagamento === hojeCheck) {
        const proximaData = s.vence_em ? fmtData(s.vence_em) : '—';
        if (!confirm(`⚠️ ATENÇÃO — JÁ TEM PAGAMENTO REGISTRADO HOJE\n\nEssa clínica já recebeu baixa hoje, e o vencimento dela está em ${proximaData}.\n\nSe você confirmar de novo, o vencimento vai ser empurrado MAIS UM MÊS (total de 2 meses).\n\nSó confirme se o cliente realmente pagou dois meses. Continuar?`)) return;
      }

      const msgConfirma = (diasFalta !== null && diasFalta > 5)
        ? `PAGAMENTO ADIANTADO\n\nEssa clínica só vence daqui a ${diasFalta} dia(s).\n\nConfirmar registra o pagamento agora e empurra o vencimento em mais 1 mês. Tem certeza?`
        : 'Confirmar pagamento desta clínica?\n\nIsso registra o pagamento e renova o vencimento. Os créditos do plano renovam normalmente na virada do ciclo (não agora).';
      if (!confirm(msgConfirma)) return;
      // próximo vencimento: +1 mês a partir do vencimento atual (ou de hoje)
      const base = (s && s.vence_em) ? new Date(s.vence_em + 'T00:00:00') : new Date();
      const proximo = new Date(base);
      proximo.setMonth(proximo.getMonth() + 1);
      const proximoISO = proximo.toISOString().split('T')[0];
      const hojeISO = new Date().toISOString().split('T')[0];

      // registra o pagamento e empurra o vencimento — SEM zerar usado_mes.
      // (a renovação dos créditos acontece sozinha quando chegar o dia do ciclo)
      await database.from('brian_saldo').update({
        pagamento_status: 'em_dia',
        ultimo_pagamento: hojeISO,
        vence_em: proximoISO,
      }).eq('clinic_id', clinicId);

      if (typeof toast === 'function') toast('Pagamento registrado! Vencimento renovado. ✓', 'success');
      verVencimentosAdmin(); // recarrega
    } catch (e) {
      console.error('[marcar-pago]', e);
      if (typeof toast === 'function') toast('Erro ao marcar pagamento', 'error');
    }
  };

  // injeta botão no menu admin
  function injetarBotao() {
    if (!ehAdminMaster()) return;
    if (document.getElementById('navVencimentos')) return;
    const ref = document.querySelector('.nav-item[data-page="clinicas"]')
             || document.querySelector('.nav-item[data-page="cobrancas"]');
    if (!ref) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navVencimentos';
    btn.innerHTML = '<i class="ti ti-calendar-dollar"></i> Vencimentos';
    btn.onclick = () => verVencimentosAdmin();
    ref.parentNode.insertBefore(btn, ref.nextSibling);
  }

  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    setTimeout(verificarVencimento, 3000);
    let ult = null;
    setInterval(() => {
      const c = clinicAtual();
      const id = c ? c.id : null;
      if (id !== ult) { ult = id; verificarVencimento(); }
    }, 2000);
    injetarBotao();
    setInterval(injetarBotao, 1500);
    console.log('✅ vencimento-fix.js carregado');
    return true;
  }
  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }
})();
