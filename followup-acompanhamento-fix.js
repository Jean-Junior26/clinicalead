// ============================================================
// CLINICALEAD — FOLLOW-UP: Tela de Acompanhamento
// Aba nova "Follow-up" no menu. Mostra:
//  • Visão por etapa (quantos leads parados em cada faixa de dias)
//  • Lista de leads em follow-up (status, quantas msgs receberam)
//  • Ações: abrir conversa no inbox / parar (bloquear) follow-up do lead
// Lê leads em aberto + tarefas_resolvidas (registro dos envios) + followup_conversa.
// Carregar após followup-regua-fix.js.
// ============================================================

(function () {
  'use strict';

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  const FRASES_TRAVA = ['nao tem interesse', 'nao tenho interesse', 'sem interesse', 'vou retornar',
    'retorno depois', 'depois eu vejo', 'depois eu retorno', 'nao quero', 'ja resolvi',
    'fechei com outro', 'ja fechei', 'nao precisa mais', 'desisti'];

  // injeta o item no menu lateral (depois de Automações Pro)
  function injetarMenu() {
    if (document.getElementById('navFollowup')) return;
    const ancora = document.getElementById('navAutomacoesPro');
    if (!ancora || !ancora.parentNode) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navFollowup';
    btn.innerHTML = '<i class="ti ti-flame"></i> Follow-up';
    btn.onclick = function () { if (typeof showPage === 'function') showPage('followup', btn); abrirFollowup(); };
    ancora.parentNode.insertBefore(btn, ancora.nextSibling);
  }

  // cria a página (div.page) se ainda não existe, no mesmo padrão das outras
  function garantirPagina() {
    let page = document.getElementById('page-followup');
    if (page) return page;
    const ref = document.getElementById('page-automacoes-pro');
    if (!ref || !ref.parentNode) return null;
    page = document.createElement('div');
    page.className = 'page';
    page.id = 'page-followup';
    page.style.display = 'none';
    page.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:18px;">
        <div>
          <h1 style="margin:0;">Follow-up</h1>
          <p style="color:var(--text-muted);font-size:13px;margin:4px 0 0;">Acompanhe os leads em reativação — pra nenhum escapar 🔥</p>
        </div>
        <button class="btn" onclick="fuAcompRefresh()" style="border:1px solid var(--border,rgba(201,168,76,0.2));color:var(--text-secondary);"><i class="ti ti-refresh"></i> Atualizar</button>
      </div>
      <div id="fuAcompResumo" style="margin-bottom:18px;"></div>
      <div id="fuAcompLista"></div>`;
    ref.parentNode.insertBefore(page, ref.nextSibling);
    return page;
  }

  window.abrirFollowup = async function () {
    garantirPagina();
    // garante que a página fica visível mesmo se showPage não reconhecer o id
    setTimeout(() => {
      const p = document.getElementById('page-followup');
      if (p) {
        document.querySelectorAll('.page').forEach(pg => { if (pg.id !== 'page-followup') pg.style.display = 'none'; });
        p.style.display = 'block';
      }
      // marca o item de menu ativo
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      const nav = document.getElementById('navFollowup');
      if (nav) nav.classList.add('active');
    }, 80);
    await fuAcompRefresh();
  };

  window.fuAcompRefresh = async function () {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;
    const resumo = document.getElementById('fuAcompResumo');
    const lista = document.getElementById('fuAcompLista');
    if (lista) lista.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Carregando follow-ups…</div>';

    // 1) leads em aberto (mesma regra do motor: fora de fechado/compareceu)
    let leads = [];
    try {
      const { data } = await db.from('leads')
        .select('id, nome, telefone, procedimento, status, created_at')
        .eq('clinic_id', clinic.id)
        .not('status', 'in', '(fechado,compareceu)')
        .order('created_at', { ascending: false });
      leads = data || [];
    } catch (e) { if (lista) lista.innerHTML = '<div style="padding:20px;color:var(--coral);">Erro ao carregar leads.</div>'; return; }

    // 2) regras de follow-up ativas (pra saber as faixas de dias)
    let regras = [];
    try {
      const { data } = await db.from('automacoes_regras')
        .select('id, nome, espera_valor, espera_unidade, condicao, ativo, global, clinic_id')
        .eq('evento', 'dias_sem_resposta').eq('ativo', true)
        .or(`global.eq.true,clinic_id.eq.${clinic.id}`);
      regras = data || [];
    } catch (e) {}
    const faixasDias = [...new Set(regras.map(r => r.espera_unidade === 'horas' ? Math.round((r.espera_valor||0)/24) : (r.espera_valor||0)).filter(d => d > 0))].sort((a,b)=>a-b);

    // 3) envios já feitos (tarefas_resolvidas com chave regra:...)
    let feitos = {};
    try {
      const { data } = await db.from('tarefas_resolvidas')
        .select('tarefa_chave, resolvida_em').eq('clinic_id', clinic.id);
      (data || []).forEach(t => {
        const m = String(t.tarefa_chave || '').match(/^regra:[^:]+:(.+)$/);
        if (m) { const leadId = m[1]; feitos[leadId] = (feitos[leadId] || 0) + 1; }
      });
    } catch (e) {}

    // 4) conversas com follow-up bloqueado
    let bloqueados = new Set();
    try {
      const { data } = await db.from('followup_conversa').select('phone, bloqueado').eq('clinic_id', clinic.id).eq('bloqueado', true);
      (data || []).forEach(r => bloqueados.add(String(r.phone).replace(/\D/g, '').slice(-8)));
    } catch (e) {}

    // 5) últimas mensagens recebidas (pra detectar "sem interesse" e dias parado) — busca em lote
    // (simplificado: calcula dias parado pelo created_at do lead; refinamento real fica no motor)
    const agora = Date.now();
    const enriquecidos = leads.map(l => {
      const suf = String(l.telefone || '').replace(/\D/g, '').slice(-8);
      const diasParado = Math.floor((agora - new Date(l.created_at).getTime()) / 86400000);
      return {
        ...l,
        sufixo: suf,
        bloqueado: bloqueados.has(suf),
        msgsRecebidas: feitos[l.id] || 0,
        diasParado,
      };
    });

    // ── RESUMO POR ETAPA ──
    if (resumo) {
      const totalAtivos = enriquecidos.filter(l => !l.bloqueado).length;
      const totalBloq = enriquecidos.filter(l => l.bloqueado).length;
      const semFollow = enriquecidos.filter(l => l.msgsRecebidas === 0 && !l.bloqueado).length;
      const recebendo = enriquecidos.filter(l => l.msgsRecebidas > 0 && !l.bloqueado).length;

      // contagem por faixa de dias
      const porFaixa = faixasDias.map(d => {
        const qtd = enriquecidos.filter(l => !l.bloqueado && l.diasParado >= d).length;
        return { dias: d, qtd };
      });

      resumo.innerHTML = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
          ${cardResumo('Em follow-up', totalAtivos, 'var(--gold,#C9A84C)', 'ti-flame')}
          ${cardResumo('Já receberam', recebendo, 'var(--blue,#5B8DB8)', 'ti-send')}
          ${cardResumo('Aguardando 1º', semFollow, 'var(--text-secondary)', 'ti-clock')}
          ${cardResumo('Bloqueados', totalBloq, 'var(--coral,#C0624A)', 'ti-bell-off')}
        </div>
        ${faixasDias.length ? `
        <div style="background:var(--bg-card,#1C1C20);border:1px solid var(--border-subtle,rgba(255,255,255,0.05));border-radius:10px;padding:14px;">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;font-weight:600;">Leads parados por tempo (faixas da sua régua)</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${porFaixa.map(f => `
              <div style="flex:1;min-width:90px;text-align:center;padding:10px;background:var(--bg-elevated,#18181B);border-radius:8px;">
                <div style="font-size:20px;font-weight:700;color:var(--gold,#C9A84C);">${f.qtd}</div>
                <div style="font-size:11px;color:var(--text-muted);">+${f.dias} ${f.dias===1?'dia':'dias'} parado</div>
              </div>`).join('')}
          </div>
        </div>` : '<div style="font-size:12px;color:var(--text-muted);padding:10px;">Nenhuma régua de follow-up ativa. Crie uma em Automações → "Ativar Follow-up Inteligente".</div>'}`;
    }

    // ── LISTA DE LEADS ──
    if (lista) {
      if (!enriquecidos.length) {
        lista.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);">Nenhum lead em follow-up no momento. 🎉<br><span style="font-size:12px;">Leads que fecham ou comparecem saem daqui automaticamente.</span></div>';
        return;
      }
      // ordena: quem recebeu mais follow-up primeiro (mais "quente" pra agir)
      enriquecidos.sort((a, b) => b.msgsRecebidas - a.msgsRecebidas || b.diasParado - a.diasParado);

      lista.innerHTML = `
        <div style="font-size:13px;color:var(--text-secondary);margin:6px 0 10px;font-weight:600;">Leads em follow-up (${enriquecidos.length})</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${enriquecidos.map(l => {
            const statusCor = l.bloqueado ? 'var(--coral,#C0624A)' : (l.msgsRecebidas > 0 ? 'var(--blue,#5B8DB8)' : 'var(--text-muted)');
            const statusTxt = l.bloqueado ? 'Bloqueado' : (l.msgsRecebidas > 0 ? `${l.msgsRecebidas} follow-up${l.msgsRecebidas>1?'s':''} enviado${l.msgsRecebidas>1?'s':''}` : 'Aguardando 1º contato');
            return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg-card,#1C1C20);border:1px solid var(--border-subtle,rgba(255,255,255,0.05));border-radius:10px;${l.bloqueado?'opacity:0.6;':''}">
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${l.nome || 'Sem nome'}</div>
                <div style="font-size:11px;color:var(--text-muted);display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;">
                  <span>${l.procedimento ? '🦷 ' + l.procedimento : 'sem procedimento'}</span>
                  <span>·</span>
                  <span>${l.diasParado} ${l.diasParado===1?'dia':'dias'} parado</span>
                  <span>·</span>
                  <span style="color:var(--text-secondary);">${l.status}</span>
                </div>
              </div>
              <span style="font-size:11px;color:${statusCor};white-space:nowrap;">${statusTxt}</span>
              <div style="display:flex;gap:6px;">
                <button title="Abrir conversa" onclick="fuAbrirConversa('${l.sufixo}','${(l.nome||'').replace(/'/g,"\\'")}','${(l.telefone||'').replace(/'/g,"")}')" style="background:var(--gold-pale,rgba(201,168,76,0.12));border:1px solid var(--gold-border,rgba(201,168,76,0.3));color:var(--gold,#C9A84C);border-radius:7px;padding:6px 9px;cursor:pointer;font-size:12px;"><i class="ti ti-brand-whatsapp"></i></button>
                <button title="${l.bloqueado?'Reativar follow-up':'Parar follow-up deste lead'}" onclick="fuToggleLead('${clinic.id}','${(l.telefone||'').replace(/'/g,"")}',${l.bloqueado},this)" style="background:transparent;border:1px solid ${l.bloqueado?'var(--blue,#5B8DB8)':'var(--coral,#C0624A)'};color:${l.bloqueado?'var(--blue,#5B8DB8)':'var(--coral,#C0624A)'};border-radius:7px;padding:6px 9px;cursor:pointer;font-size:12px;"><i class="ti ti-${l.bloqueado?'bell-ringing':'bell-off'}"></i></button>
              </div>
            </div>`;
          }).join('')}
        </div>`;
    }
  };

  function cardResumo(label, valor, cor, icone) {
    return `
      <div style="flex:1;min-width:110px;background:var(--bg-card,#1C1C20);border:1px solid var(--border-subtle,rgba(255,255,255,0.05));border-radius:10px;padding:12px 14px;">
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);"><i class="ti ${icone}" style="color:${cor};"></i> ${label}</div>
        <div style="font-size:22px;font-weight:700;color:${cor};margin-top:4px;">${valor}</div>
      </div>`;
  }

  // ── AÇÕES ──
  window.fuAbrirConversa = async function (sufixo, nome, telefoneCompleto) {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;

    // openChat espera a chave no formato "telefone|instance_name".
    // 1) tenta achar a conversa já carregada no INBOX (jeito mais confiável)
    let chave = null;
    try {
      if (typeof INBOX !== 'undefined' && Array.isArray(INBOX.chats)) {
        const achou = INBOX.chats.find(c => String(c.phone || '').replace(/\D/g, '').slice(-8) === sufixo);
        if (achou && achou.id) chave = achou.id;
        else if (achou && achou.phone && achou.instance_name) chave = `${achou.phone}|${achou.instance_name}`;
      }
    } catch (e) {}

    // 2) se não achou no INBOX, monta com o telefone do lead + instância da clínica
    if (!chave) {
      const inst = clinic && (clinic.whatsapp_instance || clinic.instance_name);
      const tel = String(telefoneCompleto || '').replace(/\D/g, '');
      if (inst && tel) chave = `${tel}|${inst}`;
    }

    if (!chave) {
      if (typeof toast === 'function') toast('Não encontrei a conversa deste lead no WhatsApp ainda', 'error');
      return;
    }

    // navega pro inbox e abre a conversa
    if (typeof showPage === 'function') showPage('inbox');
    setTimeout(() => {
      try { if (typeof openChat === 'function') openChat(chave); } catch (e) { console.error('[fu openChat]', e); }
    }, 350);
  };

  window.fuToggleLead = async function (clinicId, phoneCompleto, estaBloqueado, btn) {
    const novo = !estaBloqueado;
    if (btn) btn.disabled = true;
    try {
      // guarda o telefone COMPLETO (igual a chavinha do inbox). O motor compara por sufixo de 8 dígitos.
      await db.from('followup_conversa').upsert({
        clinic_id: clinicId, phone: phoneCompleto, bloqueado: novo, atualizado_em: new Date().toISOString()
      }, { onConflict: 'clinic_id,phone' });
      if (typeof toast === 'function') toast(novo ? 'Follow-up parado para este lead 🔕' : 'Follow-up reativado ✓');
      await fuAcompRefresh();
    } catch (e) {
      if (typeof toast === 'function') toast('Erro: ' + (e.message || ''), 'error');
      if (btn) btn.disabled = false;
    }
  };

  setInterval(injetarMenu, 1000);

  console.log('✅ followup-acompanhamento-fix.js carregado — aba Follow-up (acompanhamento)');
})();
