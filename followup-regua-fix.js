// ============================================================
// CLINICALEAD — FOLLOW-UP INTELIGENTE (régua pronta)
// Adiciona na tela "Automações Pro" um botão que cria, de uma vez,
// uma régua de reativação de leads parados (1, 3, 7, 15, 30 dias).
// Cria regras evento 'dias_sem_resposta' / ação 'mensagem', no MESMO
// formato da tela (automacoes_regras). A clínica depois edita/desliga
// cada passo normalmente. Também permite régua específica por procedimento.
// Carregar APÓS automacoes-pro-fix.js.
// ============================================================

(function () {
  'use strict';

  // ── régua geral (mensagens aprovadas) ──
  const REGUA_GERAL = [
    { dias: 1,  nome: 'Follow-up · Dia 1 (tira-dúvida)',
      msg: 'Oi {nome}! 😊 Passei aqui pra saber se ficou alguma dúvida sobre o que conversamos. Tô à disposição pra te ajudar! Quer que eu veja um horário pra sua avaliação?' },
    { dias: 3,  nome: 'Follow-up · Dia 3 (valor)',
      msg: 'Olá {nome}! 🦷 Cuidar do seu sorriso é um dos melhores investimentos que existem — na autoestima e na saúde. Que tal darmos o primeiro passo com uma avaliação? Tenho horários essa semana 😉' },
    { dias: 7,  nome: 'Follow-up · Dia 7 (oportunidade)',
      msg: 'Oi {nome}! Essa semana abrimos alguns horários para avaliação e lembrei de você. 😍 Posso reservar um pra você? É sem compromisso e você sai sabendo exatamente o que precisa!' },
    { dias: 15, nome: 'Follow-up · Dia 15 (condição especial)',
      msg: '{nome}, tudo bem? 💙 Preparei uma condição especial pra você dar início ao seu tratamento. Vamos conversar? Garanto que vale a pena conhecer!' },
    { dias: 30, nome: 'Follow-up · Dia 30 (reativação)',
      msg: 'Oi {nome}! 😊 Faz um tempinho que não conversamos. Seu sorriso continua sendo nossa prioridade! Se ainda quiser cuidar dele, é só me chamar — será um prazer te atender. 🦷✨' },
  ];

  // ── modelos por procedimento (a clínica escolhe o procedimento do catálogo dela) ──
  // mensagens de exemplo pra alguns procedimentos comuns; servem de base e podem ser editadas.
  const MODELOS_PROC = {
    'lentes': [
      { dias: 1,  msg: 'Oi {nome}! 😊 Ficou alguma dúvida sobre as lentes? Posso te explicar como ficaria no seu sorriso numa avaliação. Quer ver um horário?' },
      { dias: 3,  msg: 'Olá {nome}! 😍 Imagina seu sorriso renovado com lentes — natural e do seu jeito. Que tal uma avaliação pra ver como ficaria no seu caso? Tenho horários essa semana!' },
      { dias: 7,  msg: 'Oi {nome}! Lembrei de você 😊 Essa semana temos horários pra avaliação de lentes. Posso reservar um? Você sai sabendo exatamente como ficaria seu sorriso!' },
      { dias: 15, msg: '{nome}, tudo bem? 💙 Preparei uma condição especial pra você começar suas lentes. Vamos conversar? Vale muito a pena conhecer!' },
      { dias: 30, msg: 'Oi {nome}! 😊 Seu sorriso novo com lentes ainda te espera! Se quiser dar esse passo, é só me chamar. Será um prazer te atender 🦷✨' },
    ],
    'implante': [
      { dias: 1,  msg: 'Oi {nome}! 😊 Ficou alguma dúvida sobre o implante? Posso te explicar certinho numa avaliação. Quer que eu veja um horário?' },
      { dias: 3,  msg: 'Olá {nome}! 🦷 Recuperar um dente com implante devolve sua mordida, sua fala e sua confiança pra sorrir. Vamos avaliar seu caso? A avaliação é sem compromisso!' },
      { dias: 7,  msg: 'Oi {nome}! Essa semana temos horários pra avaliação de implante 😊 Posso reservar um pra você? Você sai sabendo exatamente o que precisa!' },
      { dias: 15, msg: '{nome}, tudo bem? 💙 Preparei uma condição especial pra você começar seu implante. Vamos conversar? Garanto que vale a pena!' },
      { dias: 30, msg: 'Oi {nome}! 😊 Cuidar do seu sorriso com implante continua sendo nossa prioridade. Se ainda quiser, é só me chamar — será um prazer te atender! 🦷' },
    ],
    'aparelho': [
      { dias: 1,  msg: 'Oi {nome}! 😊 Ficou alguma dúvida sobre o aparelho/ortodontia? Posso te explicar numa avaliação. Quer ver um horário?' },
      { dias: 3,  msg: 'Olá {nome}! 😁 Um sorriso alinhado muda tudo — estética e saúde. Vamos avaliar qual o melhor aparelho pro seu caso? Tenho horários essa semana!' },
      { dias: 7,  msg: 'Oi {nome}! Essa semana temos horários pra avaliação de ortodontia 😊 Posso reservar um? Você sai sabendo certinho como alinhar seu sorriso!' },
      { dias: 15, msg: '{nome}, tudo bem? 💙 Preparei uma condição especial pra você começar seu tratamento ortodôntico. Vamos conversar?' },
      { dias: 30, msg: 'Oi {nome}! 😊 Seu sorriso alinhado ainda te espera! Se quiser dar esse passo, é só me chamar. Será um prazer 🦷✨' },
    ],
    'clareamento': [
      { dias: 1,  msg: 'Oi {nome}! 😊 Ficou alguma dúvida sobre o clareamento? Posso te explicar numa avaliação rapidinha. Quer ver um horário?' },
      { dias: 3,  msg: 'Olá {nome}! ✨ Um sorriso mais branco levanta a autoestima na hora. Que tal avaliar o clareamento ideal pra você? Tenho horários essa semana!' },
      { dias: 7,  msg: 'Oi {nome}! Essa semana temos horários pra avaliação de clareamento 😊 Posso reservar um pra você?' },
      { dias: 15, msg: '{nome}, tudo bem? 💙 Preparei uma condição especial pro seu clareamento. Vamos conversar?' },
      { dias: 30, msg: 'Oi {nome}! 😊 Seu sorriso mais branco ainda te espera! Se quiser, é só me chamar — será um prazer te atender ✨' },
    ],
    'harmonizacao': [
      { dias: 1,  msg: 'Oi {nome}! 😊 Ficou alguma dúvida sobre harmonização? Posso te explicar numa avaliação. Quer ver um horário?' },
      { dias: 3,  msg: 'Oi {nome}! ✨ A harmonização realça sua beleza natural com leveza e equilíbrio. Que tal conversarmos sobre o que combina com você numa avaliação?' },
      { dias: 7,  msg: 'Olá {nome}! Essa semana temos horários pra avaliação de harmonização 😊 Posso reservar um pra você?' },
      { dias: 15, msg: '{nome}, tudo bem? 💙 Preparei uma condição especial pra você. Vamos conversar sobre sua harmonização?' },
      { dias: 30, msg: 'Oi {nome}! 😊 Se ainda quiser cuidar da sua harmonização, é só me chamar. Será um prazer te atender ✨' },
    ],
  };

  function ehAdminMaster() {
    const role = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return role === 'admin' || role === 'administrador';
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

  // injeta o botão "Ativar Follow-up" no topo da página de automações
  function injetarBotao() {
    const page = document.getElementById('page-automacoes-pro');
    if (!page || document.getElementById('btnFollowupRegua')) return;
    const header = page.querySelector('.page-header');
    if (!header) return;
    // acha o container dos botões (onde está o "Criar automação")
    const btnCriar = header.querySelector('.btn-primary');
    const b = document.createElement('button');
    b.id = 'btnFollowupRegua';
    b.className = 'btn';
    b.style.cssText = 'border:1px solid var(--gold-border,rgba(201,168,76,0.35));color:var(--gold,#C9A84C);margin-right:8px;';
    b.innerHTML = '<i class="ti ti-rocket"></i> Ativar Follow-up Inteligente';
    b.onclick = abrirFollowupModal;
    if (btnCriar && btnCriar.parentNode) btnCriar.parentNode.insertBefore(b, btnCriar);
    else header.appendChild(b);
  }

  function abrirFollowupModal() {
    if (document.getElementById('fuModal')) document.getElementById('fuModal').remove();
    const admin = ehAdminMaster();
    const ov = document.createElement('div');
    ov.id = 'fuModal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML = `
      <div style="max-width:540px;width:100%;max-height:88vh;overflow-y:auto;background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#3a3320);border-radius:16px;">
        <div style="padding:20px 22px;border-bottom:1px solid var(--border-subtle,#2a2a2a);display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:17px;"><i class="ti ti-rocket" style="color:var(--gold);margin-right:6px;"></i>Follow-up Inteligente</h3>
          <button onclick="document.getElementById('fuModal').remove()" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:20px;"><i class="ti ti-x"></i></button>
        </div>
        <div style="padding:20px 22px;display:flex;flex-direction:column;gap:16px;">
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">
            Cria uma <b>régua de reativação</b> que cutuca o lead parado em <b>1, 3, 7, 15 e 30 dias</b> sem resposta — pra nenhum lead esfriar esquecido. 🔥
            Se o lead <b>responder, agendar ou fechar</b>, o follow-up para sozinho.
          </div>

          <div style="background:var(--bg-elevated);border-radius:10px;padding:14px;">
            <label class="form-label" style="font-size:12px;color:var(--text-muted);">Tipo de régua</label>
            <select class="form-input" id="fuTipo" onchange="fuTipoMudou()" style="width:100%;">
              <option value="geral">Geral (serve para todos os leads)</option>
              <option value="proc">Específica por procedimento</option>
            </select>

            <div id="fuProcBloco" style="display:none;margin-top:12px;">
              <label class="form-label" style="font-size:12px;color:var(--text-muted);">Procedimento</label>
              <input class="form-input" id="fuProc" list="fuProcLista" placeholder="Ex.: lentes, implante, harmonização…" style="width:100%;"/>
              <datalist id="fuProcLista">
                <option value="lentes"><option value="implante"><option value="aparelho"><option value="clareamento"><option value="harmonização">
              </datalist>
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5;">
                Use o mesmo nome que aparece no procedimento do lead. As mensagens vão falar desse tratamento. Se houver um modelo pronto (lentes, implante, aparelho, clareamento, harmonização), ele já vem preenchido; senão, criamos com a mensagem geral adaptada.
              </div>
            </div>
          </div>

          <div style="background:var(--gold-pale,rgba(201,168,76,0.12));border-radius:10px;padding:12px 14px;font-size:12px;color:var(--text-secondary);line-height:1.6;">
            <b style="color:var(--gold);">5 mensagens</b> serão criadas (dias 1, 3, 7, 15, 30). Você pode editar ou desligar cada uma depois, normalmente, nos cards.
          </div>

          ${admin ? `
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="fuGlobal">
            <span>Criar para <b>todas as clínicas</b> (régua do sistema)</span>
          </label>` : ''}

          <button class="btn btn-primary" onclick="fuCriarRegua()" style="width:100%;">
            <i class="ti ti-rocket"></i> Criar régua de follow-up
          </button>
          <div id="fuErro" style="font-size:12px;color:var(--coral);min-height:14px;"></div>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }

  window.fuTipoMudou = function () {
    const t = document.getElementById('fuTipo')?.value;
    const bloco = document.getElementById('fuProcBloco');
    if (bloco) bloco.style.display = (t === 'proc') ? 'block' : 'none';
  };

  window.fuCriarRegua = async function () {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;
    const erro = document.getElementById('fuErro');
    const setErro = (t) => { if (erro) erro.textContent = t || ''; };

    const tipo = document.getElementById('fuTipo').value;
    const globalChk = document.getElementById('fuGlobal');
    const global = globalChk ? globalChk.checked : false;

    let passos, condicao = {}, sufixoNome = '';
    if (tipo === 'proc') {
      const proc = (document.getElementById('fuProc').value || '').trim();
      if (!proc) { setErro('Informe o procedimento.'); return; }
      condicao = { procedimento: proc };
      sufixoNome = ` (${proc})`;
      // usa modelo pronto se existir; senão, adapta a régua geral citando o procedimento
      const chaveModelo = Object.keys(MODELOS_PROC).find(k => norm(proc).includes(k) || k.includes(norm(proc)));
      if (chaveModelo) {
        passos = MODELOS_PROC[chaveModelo].map(p => ({ dias: p.dias, msg: p.msg, nome: `Follow-up ${proc} · Dia ${p.dias}` }));
      } else {
        passos = REGUA_GERAL.map(p => ({ dias: p.dias, nome: `Follow-up ${proc} · Dia ${p.dias}`,
          msg: p.msg.replace('o seu sorriso', `o seu ${proc}`) }));
      }
    } else {
      passos = REGUA_GERAL.map(p => ({ dias: p.dias, nome: p.nome, msg: p.msg }));
    }

    setErro('Criando…');
    try {
      const linhas = passos.map(p => ({
        nome: p.nome + (global ? '' : ''),
        evento: 'dias_sem_resposta',
        espera_valor: p.dias,
        espera_unidade: 'dias',
        acao: 'mensagem',
        mensagem: p.msg,
        nova_status: null,
        condicao,
        ativo: true,
        global,
        clinic_id: global ? null : clinic.id,
      }));
      const { error } = await db.from('automacoes_regras').insert(linhas);
      if (error) throw error;

      document.getElementById('fuModal').remove();
      if (typeof toast === 'function') toast('Régua de follow-up criada! 🚀 5 mensagens ativas');
      // recarrega a lista da tela (reabre a página)
      if (typeof abrirAutomacoesPro === 'function') abrirAutomacoesPro();
    } catch (e) {
      setErro('Erro ao criar: ' + (e.message || 'tente de novo'));
      console.error('[followup criar]', e);
    }
  };

  setInterval(injetarBotao, 800);

  console.log('✅ followup-regua-fix.js carregado — botão Ativar Follow-up Inteligente');
})();
