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
        if (!s.vence_em) return;
        const dias = diasAte(s.vence_em);
        // mostra os que vencem em até 5 dias ou já venceram (e não estão pagos)
        if (s.pagamento_status !== 'pago' && dias !== null && dias <= 5) {
          linhas.push({ nome: mapa[s.clinic_id] || s.clinic_id, clinic_id: s.clinic_id, dias, vence_em: s.vence_em });
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
          const venc = l.dias < 0;
          const txt = venc ? `Venceu há ${Math.abs(l.dias)} dia(s)` : (l.dias === 0 ? 'Vence hoje' : `Vence em ${l.dias} dia(s)`);
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:9px;background:var(--bg-base,#0A0A0B);margin-bottom:8px;border-left:3px solid ${venc ? '#C0624A' : '#C9A84C'};">
            <div><b>${l.nome}</b><div style="font-size:12px;color:var(--text-muted,#888);">${txt} · vence ${fmtData(l.vence_em)}</div></div>
            <button onclick="marcarComoPago('${l.clinic_id}')" style="padding:7px 14px;border-radius:8px;border:none;background:#6FBF8E;color:#0A0A0B;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap;">✓ Marcar pago</button>
          </div>`;
        }).join('')
      : '<p style="text-align:center;color:var(--text-muted,#888);padding:20px;">✅ Nenhuma clínica vencendo. Tudo em dia!</p>';
    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:16px;padding:26px;max-width:520px;width:100%;max-height:90vh;overflow:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
          <h2 style="margin:0;font-size:19px;">🗓️ Vencimentos de planos</h2>
          <button onclick="document.getElementById('modalVencimentos').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:24px;cursor:pointer;">×</button>
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
    if (!confirm('Confirmar pagamento desta clínica?\n\nIsso registra o pagamento e renova o vencimento. Os créditos do plano renovam normalmente na virada do ciclo (não agora).')) return;
    const database = getDb();
    try {
      const { data: s } = await database.from('brian_saldo')
        .select('vence_em, dia_renovacao').eq('clinic_id', clinicId).maybeSingle();
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
