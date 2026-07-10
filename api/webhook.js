module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const EVO_URL = process.env.EVOLUTION_API_URL || 'https://evolution-api-production-62cb.up.railway.app';
  const EVO_KEY = process.env.EVOLUTION_API_KEY;

  if (!SUPABASE_KEY || !EVO_KEY) return res.status(500).json({ error: 'Configuração ausente (SUPABASE_SERVICE_KEY / EVOLUTION_API_KEY nas env vars da Vercel)' });

  const sbHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  // ════════════════════════════════════════════════════════════
  // BRIAN 2.3.a — CÉREBRO DA DECISÃO (NÃO ENVIA NADA AINDA)
  // Checa as 7 travas e retorna se o Brian DEVERIA responder.
  // Nesta etapa só LOGAMOS a decisão (pra você validar sem risco).
  // ════════════════════════════════════════════════════════════
  async function brianDecide(clinic_id, phone, content, instanceName, fromMe, isGroup) {
    const motivo = (ok, razao) => ({ responder: ok, razao });
    try {
      // ── Anti-loop: nunca responde a própria mensagem ──
      if (fromMe) return motivo(false, 'mensagem da própria clínica (from_me)');

      // ── Trava 3a: não responde grupos ──
      if (isGroup) return motivo(false, 'é grupo de WhatsApp');

      // só texto faz sentido pro Brian responder
      if (!content || !String(content).trim()) return motivo(false, 'sem conteúdo de texto');

      const digitos = String(phone).replace(/\D/g, '');
      const sufixo = digitos.slice(-8);
      if (sufixo.length < 8) return motivo(false, 'telefone inválido');

      // ── CONTATO PROTEGIDO (família/amigo) — Brian NUNCA responde ──
      try {
        const protR = await fetch(
          `${SUPABASE_URL}/rest/v1/contatos_protegidos?clinic_id=eq.${clinic_id}&select=phone`,
          { headers: sbHeaders }
        );
        if (protR.ok) {
          const prot = await protR.json();
          const protegido = (prot || []).some(p => String(p.phone).replace(/\D/g, '').slice(-8) === sufixo);
          if (protegido) return motivo(false, 'contato protegido (pessoal) — Brian não responde');
        }
      } catch (e) { /* se falhar, segue o fluxo normal */ }

      // ── Anti-loop EXTRA: não responde números que são instâncias conectadas ──
      // (se o número que mandou for outra instância da própria clínica/sistema, ignora —
      //  senão dois números conectados ficariam se respondendo em loop infinito).
      try {
        // checa se o sufixo bate com alguma instância registrada (nome costuma conter o número)
        const instAllResp = await fetch(
          `${SUPABASE_URL}/rest/v1/instancias?select=instance_name`,
          { headers: sbHeaders }
        );
        if (instAllResp.ok) {
          const instAll = await instAllResp.json();
          const ehInstancia = (instAll || []).some(i => String(i.instance_name || '').replace(/\D/g, '').includes(sufixo));
          if (ehInstancia) return motivo(false, 'número é uma instância conectada (anti-loop)');
        }
      } catch (e) { /* se falhar, segue (outras travas protegem) */ }
      const cfgResp = await fetch(
        `${SUPABASE_URL}/rest/v1/brian_config?clinic_id=eq.${clinic_id}&select=auto_ativo,auto_so_fora_horario,auto_modo,horario_funcionamento,palavras_anuncio,brian_liberado&limit=1`,
        { headers: sbHeaders }
      );
      const cfgArr = cfgResp.ok ? await cfgResp.json() : [];
      const cfg = cfgArr[0];

      // ── Trava 7: liberado pelo admin? ──
      if (!cfg || cfg.brian_liberado !== true) return motivo(false, 'clínica não liberada pelo admin');

      // ── Trava 1: chave geral do automático ligada? ──
      if (cfg.auto_ativo !== true) return motivo(false, 'atendimento automático desligado (chave geral)');

      // ── Trava 4: conversa com Brian desligado? (vence a geral) ──
      const convResp = await fetch(
        `${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&select=auto_desligado,humano_respondeu_em,msgs_contador,contador_data,escalado&limit=1`,
        { headers: sbHeaders }
      );
      const convArr = convResp.ok ? await convResp.json() : [];
      const conv = convArr[0];
      if (conv && conv.auto_desligado === true) return motivo(false, 'Brian desligado nesta conversa (chave por conversa)');

      // ── Trava 8: limite de mensagens por conversa (anti-abuso / protege saldo) ──
      // Brian responde no máximo LIMITE_MSGS por conversa por dia. Reseta a cada 24h.
      const LIMITE_MSGS = 12;
      const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
      if (conv) {
        // se o contador é de hoje e já bateu o limite → não responde (escala)
        const contadorHoje = (conv.contador_data === hojeBRT) ? (conv.msgs_contador || 0) : 0;
        if (contadorHoje >= LIMITE_MSGS) {
          return motivo(false, `limite de ${LIMITE_MSGS} mensagens atingido na conversa (escalado pra equipe)`);
        }
      }

      // ── Trava 2 (horário): depende do MODO de atendimento ──
      //   'sempre' (Ágil)   = responde a qualquer hora (recuo do humano cuida do resto)
      //   'fora'  (Cauteloso) = só responde fora do horário de funcionamento
      // Compatibilidade: se auto_modo não existir, cai no comportamento antigo (auto_so_fora_horario).
      const modo = cfg.auto_modo || (cfg.auto_so_fora_horario === false ? 'sempre' : 'fora');
      if (modo !== 'sempre') {
        const dentro = dentroDoHorario(cfg.horario_funcionamento);
        if (dentro) {
          // ── EXCEÇÃO: CONVERSA ASSUMIDA PELO BRIAN (resgate do vácuo) ──
          // Se a última mensagem da CLÍNICA nesta conversa foi do próprio Brian
          // (BRIAN_AUTO) nas últimas 6h, ele já assumiu este atendimento (a
          // equipe não respondeu a tempo) e CONTINUA respondendo dentro do
          // horário — até um humano entrar (a Trava 5 abaixo devolve pra equipe
          // assim que alguém da clínica responder manualmente).
          let brianAssumiu = false;
          try {
            const seisHoras = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
            const ultR = await fetch(
              `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&from_me=eq.true&created_at=gte.${seisHoras}&select=contact_name&order=created_at.desc&limit=1`,
              { headers: sbHeaders }
            );
            const uArrR = ultR.ok ? await ultR.json() : [];
            brianAssumiu = !!(uArrR[0] && uArrR[0].contact_name === 'BRIAN_AUTO');
          } catch (e) { /* na dúvida, comportamento padrão (recua) */ }
          if (!brianAssumiu) return motivo(false, 'dentro do horário de atendimento (modo Cauteloso: humano assume)');
          console.log(`[BRIAN-RESGATE] conversa assumida pelo Brian — continua respondendo dentro do horário | ...${sufixo}`);
        }
      }

      // ── Trava 5: humano respondeu recentemente? (recua) ──
      // Janela de recuo: se um humano da equipe respondeu nos últimos X minutos,
      // o Brian recua (não atropela o atendimento humano). Ajuste MIN_RECUO_HUMANO
      // conforme necessário: menor = Brian volta mais rápido (lead não fica no vácuo),
      // maior = mais respeito ao atendimento humano em andamento.
      const MIN_RECUO_HUMANO = 30; // minutos
      const janelaRecuo = new Date(Date.now() - MIN_RECUO_HUMANO * 60 * 1000).toISOString();
      const humResp = await fetch(
        `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&from_me=eq.true&created_at=gte.${janelaRecuo}&select=content,contact_name,created_at&order=created_at.desc&limit=5`,
        { headers: sbHeaders }
      );
      const humArr = humResp.ok ? await humResp.json() : [];
      // mensagens automáticas conhecidas (não contam como "humano")
      const marcadoresAuto = ['confirma sua presença', 'lembrar que', 'sua consulta', 'parabéns', 'follow', 'avaliação gratuita'];
      const normMsg = (x) => String(x || '').trim().toLowerCase();
      const conteudoAtual = normMsg(content);
      const humanoAtivo = humArr.some(m => {
        // IMPORTANTE: ignora as RESPOSTAS DO PRÓPRIO BRIAN (marcadas como BRIAN_AUTO),
        // senão o Brian acha que "o humano respondeu" sendo que foi ele mesmo.
        if (m.contact_name === 'BRIAN_AUTO') return false;
        const c = normMsg(m.content);
        // ignora a PRÓPRIA mensagem recém-chegada (alguns sistemas/testes a salvam como from_me)
        if (c === conteudoAtual) return false;
        // ignora mensagens automáticas (lembrete, follow-up, etc.)
        if (marcadoresAuto.some(mk => c.includes(mk))) return false;
        return true; // sobrou uma mensagem real da clínica = humano ativo
      });
      if (humanoAtivo) return motivo(false, 'humano respondeu recentemente (Brian recua)');

      // ── Trava 6: saldo disponível? ──
      const saldoResp = await fetch(
        `${SUPABASE_URL}/rest/v1/brian_saldo?clinic_id=eq.${clinic_id}&select=incluso_mes,usado_mes,extra_comprado,extra_usado&limit=1`,
        { headers: sbHeaders }
      );
      const saldoArr = saldoResp.ok ? await saldoResp.json() : [];
      const s = saldoArr[0];
      const disp = s ? ((s.incluso_mes || 0) - (s.usado_mes || 0)) + ((s.extra_comprado || 0) - (s.extra_usado || 0)) : 0;
      if (disp <= 0) return motivo(false, 'sem saldo de mensagens');

      // ── Trava 3b: número novo só responde se mencionar palavra-chave ──
      // "novo" = sem consulta e sem histórico longo. Checa se já é lead conhecido.
      const leadResp = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${clinic_id}&telefone=ilike.*${sufixo}&select=id,status&limit=1`,
        { headers: sbHeaders }
      );
      const leadArr = leadResp.ok ? await leadResp.json() : [];
      const jaEhLead = leadArr.length > 0;

      if (!jaEhLead) {
        // número novo: precisa mencionar palavra-chave (da clínica OU padrão de intenção)
        const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const txt = norm(content);
        const padrao = ['preco', 'preço', 'valor', 'valores', 'quanto custa', 'quanto fica', 'quanto', 'custa',
          'agendar', 'agenda', 'marcar', 'marca', 'horario', 'horário', 'horarios', 'horários', 'vaga', 'disponivel', 'disponível',
          'consulta', 'consultar', 'avaliacao', 'avaliação', 'atendimento', 'atende', 'atendem', 'atender',
          'implante', 'faceta', 'facetas', 'lente', 'lentes', 'clareamento', 'clarear', 'aparelho', 'alinhador', 'invisalign',
          'ortodontia', 'protese', 'prótese', 'dentadura', 'canal', 'dente', 'dentes', 'sorriso', 'orcamento', 'orçamento',
          'harmonizacao', 'harmonização', 'botox', 'preenchimento', 'limpeza', 'extracao', 'extração', 'siso',
          'informacao', 'informação', 'informacoes', 'informações', 'gostaria', 'interesse', 'interessei', 'queria', 'quero',
          'gostaria de', 'poderia', 'pode me', 'fazem', 'faz', 'trabalham', 'tratamento', 'procedimento', 'dor', 'doendo',
          'segunda', 'terca', 'terça', 'quarta', 'quinta', 'sexta', 'sabado', 'sábado', 'amanha', 'amanhã', 'hoje', 'manha', 'manhã', 'tarde'];
        const daClinica = cfg.palavras_anuncio
          ? String(cfg.palavras_anuncio).split(',').map(p => norm(p.trim())).filter(Boolean)
          : [];
        const todasPalavras = [...padrao, ...daClinica];
        let bateu = todasPalavras.some(p => p && txt.includes(p));

        // FILOSOFIA: na dúvida, RESPONDE. Um lead real que manda "oi" e é ignorado
        // some pra sempre. O custo de responder "Olá, como posso ajudar?" é mínimo;
        // perder um lead é muito pior. Então saudações e mensagens normais são atendidas.
        // A trava só vale pra RUÍDO óbvio (mensagem sem nada útil), não pra "oi".
        if (!bateu) {
          const limpo = txt.trim();
          // ruído real: vazio, só pontuação/emoji/números soltos, ou link cru sem texto
          const soPontuacaoOuEmoji = !/[a-z0-9á-ú]/i.test(limpo);
          const soNumeros = /^\d+$/.test(limpo.replace(/\s/g, ''));
          const soLink = /^https?:\/\/\S+$/i.test(limpo);
          const ehRuido = soPontuacaoOuEmoji || soNumeros || soLink || limpo.length < 2;
          // se NÃO é ruído (ou seja, é uma mensagem humana de verdade, inclusive "oi"), responde
          if (!ehRuido) bateu = true;
        }

        if (!bateu) return motivo(false, 'número novo enviou apenas ruído (sem texto útil)');
      }

      // ── Passou em todas as travas! ──
      return motivo(true, jaEhLead ? 'lead conhecido, fora do horário, com saldo' : 'número novo com palavra-chave de interesse');
    } catch (e) {
      return motivo(false, 'erro na decisão: ' + (e.message || ''));
    }
  }

  // helper: está dentro do horário de funcionamento agora? (BRT)
  function dentroDoHorario(horario) {
    try {
      if (!horario || typeof horario !== 'object') return false; // sem horário cadastrado = sempre "fora" (Brian pode assumir)
      const agora = new Date(Date.now() - 3 * 3600 * 1000); // BRT
      const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
      const diaKey = dias[agora.getUTCDay()];
      const faixa = horario[diaKey];
      if (!faixa || !faixa.abre || !faixa.fecha) return false; // dia fechado = fora do horário
      const hhmm = `${String(agora.getUTCHours()).padStart(2, '0')}:${String(agora.getUTCMinutes()).padStart(2, '0')}`;
      return hhmm >= faixa.abre && hhmm <= faixa.fecha;
    } catch (e) { return false; }
  }

  // ════════════════════════════════════════════════════════════
  // BRIAN FASE 3 PARTE 3 — CRIAR LEAD E AGENDAR DE VERDADE
  // ════════════════════════════════════════════════════════════

  // Acha o lead pelo telefone; se não existe, cria. Retorna o lead {id, nome} ou null.
  // Extrai o procedimento de interesse da mensagem padrão de ANÚNCIO.
  // Leads de tráfego chegam com "Olá! Quero saber mais sobre X!" — o X é
  // exatamente o procedimento da campanha. Capturamos na criação do lead
  // (senão essa informação valiosa se perde e o lead fica só "Avaliação").
  function extrairProcedimentoDaMsg(texto) {
    const t = String(texto || '').trim();
    const m = t.match(/quero saber mais sobre\s+(.{2,60}?)[!.?\s]*$/i)
          || t.match(/tenho interesse em\s+(.{2,60}?)[!.?\s]*$/i)
          || t.match(/gostaria de saber (?:mais )?sobre\s+(.{2,60}?)[!.?\s]*$/i);
    if (!m) return null;
    const proc = m[1].trim().replace(/\s+/g, ' ');
    if (proc.length < 3 || proc.length > 60) return null;
    return proc;
  }

  async function brianAcharOuCriarLead(clinic_id, phone, nome, origem, procInteresse) {
    try {
      const digitos = String(phone).replace(/\D/g, '');
      const sufixo = digitos.slice(-8);
      const nomeLimpo = (nome || '').trim();
      // 1) já existe?
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${clinic_id}&telefone=ilike.*${sufixo}&select=id,nome,procedimento&limit=1`,
        { headers: sbHeaders }
      );
      const arr = r.ok ? await r.json() : [];
      if (arr[0] && arr[0].id) {
        const patch = {};
        // se chegou um nome REAL (2+ palavras) e o atual é provisório, atualiza
        const atual = (arr[0].nome || '').trim();
        const ehProvisorio = !atual || atual === 'Lead WhatsApp' || atual.split(/\s+/).length < 2;
        const nomeNovoEhReal = nomeLimpo && nomeLimpo !== 'Lead WhatsApp' && nomeLimpo.split(/\s+/).length >= 1;
        if (ehProvisorio && nomeNovoEhReal && nomeLimpo !== atual) patch.nome = nomeLimpo;
        // se chegou um procedimento de interesse e o atual é o placeholder "Avaliação"
        // (ou vazio), atualiza — assim o lead ganha o interesse real (lentes, implante...)
        const procAtual = (arr[0].procedimento || '').trim().toLowerCase();
        if (procInteresse && (!procAtual || procAtual === 'avaliação' || procAtual === 'avaliacao')) {
          patch.procedimento = procInteresse;
        }
        if (Object.keys(patch).length) {
          await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${arr[0].id}`, {
            method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify(patch),
          });
          if (patch.nome) console.log(`[BRIAN-LEAD] ✏️ nome atualizado: "${atual}" → "${patch.nome}"`);
          if (patch.procedimento) console.log(`[BRIAN-LEAD] 🎯 procedimento atualizado: "${arr[0].procedimento || ''}" → "${patch.procedimento}"`);
          return { id: arr[0].id, nome: patch.nome || atual };
        }
        return arr[0];
      }

      // 2) não existe → cria (com o procedimento de interesse, se veio do anúncio)
      const novo = {
        clinic_id,
        nome: nomeLimpo || 'Lead WhatsApp',
        telefone: digitos,
        origem: origem || 'Brian IA',
        status: 'novo',
        procedimento: procInteresse || 'Avaliação',
        created_at: new Date().toISOString(),
      };
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify(novo),
      });
      if (!ins.ok) { console.log('[BRIAN-LEAD] falha ao criar lead:', await ins.text()); return null; }
      const criado = await ins.json();
      console.log(`[BRIAN-LEAD] ✅ lead criado: ${novo.nome} (${digitos})`);
      return Array.isArray(criado) ? criado[0] : criado;
    } catch (e) { console.log('[BRIAN-LEAD] erro:', e.message); return null; }
  }

  // Move o lead pra status 'contato' (em atendimento) quando a clínica responde —
  // seja o Brian, um humano pelo WhatsApp, ou pelo Inbox do sistema.
  // Só muda se o lead ainda está 'novo' — não rebaixa quem já avançou (agendado/etc).
  async function marcarLeadEmAtendimento(clinic_id, phone) {
    try {
      const sufixo = String(phone).replace(/\D/g, '').slice(-8);
      if (sufixo.length < 8) return;
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${clinic_id}&telefone=ilike.*${sufixo}&select=id,status&limit=1`,
        { headers: sbHeaders }
      );
      const arr = r.ok ? await r.json() : [];
      const lead = arr[0];
      if (!lead || !lead.id) return;
      // só promove de 'novo' pra 'contato' (não mexe em agendado/confirmado/fechado/etc)
      if (lead.status === 'novo') {
        await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${lead.id}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'contato' }),
        });
        console.log(`[BRIAN-LEAD] 📞 lead movido pra 'contato' (em atendimento): ${lead.id}`);
      }
    } catch (e) { console.log('[BRIAN-LEAD] erro ao marcar em atendimento:', e.message); }
  }

  // Resolve o dentista_id a partir de um NOME (vindo do direcionamento do Brian).
  // O Brian decide o nome do dentista (lendo o direcionamento no template) e manda
  // no marcador [[AGENDAR|...|dentista=Nome]]. Aqui casamos esse nome com a tabela
  // dentistas da clínica. Se a clínica não tem dentistas, retorna null (sem dentista).
  async function brianResolverDentista(clinic_id, nomeDentista) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/dentistas?clinic_id=eq.${clinic_id}&ativo=eq.true&select=id,nome`,
        { headers: sbHeaders }
      );
      const lista = r.ok ? await r.json() : [];
      if (!lista.length) return null; // clínica sem dentistas → consulta sem dentista (compatível)

      const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const alvo = norm(nomeDentista);

      if (alvo) {
        // 1) match exato; 2) match por "contém" (ex.: "Ana" casa "Dra. Ana Paula")
        let achou = lista.find(d => norm(d.nome) === alvo);
        if (!achou) achou = lista.find(d => norm(d.nome).includes(alvo) || alvo.includes(norm(d.nome)));
        if (achou) return achou.id;
      }
      // se não casou nome (ou Brian não mandou nome): usa o PRIMEIRO dentista como padrão
      // (evita consulta sem dentista numa clínica que tem dentistas cadastrados)
      return lista[0].id;
    } catch (e) { console.log('[BRIAN-DENTISTA] erro ao resolver:', e.message); return null; }
  }

  // Cria a consulta ocupando o horário. Travas: data/hora válidas, não no passado,
  // horário existe na grade e está LIVRE (anti-duplo-agendamento). Retorna true se criou.
  async function brianCriarConsulta(clinic_id, lead_id, data, hora, dentista_id) {
    try {
      if (!lead_id || !data || !hora) return { ok: false, motivo: 'dados incompletos' };
      // formato data AAAA-MM-DD e hora HH:MM
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) {
        return { ok: false, motivo: 'formato inválido' };
      }
      // trava: não agendar no passado (BRT)
      const agoraBRT = new Date(Date.now() - 3 * 3600 * 1000);
      const hojeISO = agoraBRT.toISOString().split('T')[0];
      const horaAgora = `${String(agoraBRT.getUTCHours()).padStart(2, '0')}:${String(agoraBRT.getUTCMinutes()).padStart(2, '0')}`;
      if (data < hojeISO || (data === hojeISO && hora <= horaAgora)) {
        return { ok: false, motivo: 'horário no passado' };
      }
      // trava: o horário está na grade DAQUELE DIA DA SEMANA (agenda_padrao)?
      // calcula o dia da semana da data (0=domingo ... 6=sábado)
      const diaSemana = new Date(`${data}T12:00:00`).getDay();

      // 0) EXCEÇÃO pra essa data específica (feriado/fechado)?
      const exR = await fetch(`${SUPABASE_URL}/rest/v1/agenda_excecoes?clinic_id=eq.${clinic_id}&data=eq.${data}&select=fechado,horarios&limit=1`, { headers: sbHeaders });
      const exA = exR.ok ? await exR.json() : [];
      if (exA.length) {
        const ex = exA[0];
        if (ex.fechado !== false) {
          return { ok: false, motivo: 'clínica fechada nesse dia (feriado/exceção)' };
        }
        // dia com horário especial: valida contra ele
        const gradeEx = Array.isArray(ex.horarios) ? ex.horarios : [];
        if (gradeEx.length && !gradeEx.includes(hora)) {
          return { ok: false, motivo: 'horário fora da grade especial do dia' };
        }
        // se passou na exceção, pula a checagem de padrão
      } else {
        // tenta a agenda-padrão
        const padR = await fetch(`${SUPABASE_URL}/rest/v1/agenda_padrao?clinic_id=eq.${clinic_id}&dia_semana=eq.${diaSemana}&select=horarios,ativo&limit=1`, { headers: sbHeaders });
        const padA = padR.ok ? await padR.json() : [];
        if (padA.length) {
          const row = padA[0];
          if (row.ativo === false) {
            return { ok: false, motivo: 'clínica fechada nesse dia' };
          }
          const gradeDia = Array.isArray(row.horarios) ? row.horarios : [];
          if (gradeDia.length && !gradeDia.includes(hora)) {
            return { ok: false, motivo: 'horário fora da grade do dia' };
          }
        } else {
          // fallback: agenda-padrão não configurada → usa a grade antiga (agenda_config)
          const cfgR = await fetch(`${SUPABASE_URL}/rest/v1/agenda_config?clinic_id=eq.${clinic_id}&select=horarios&limit=1`, { headers: sbHeaders });
          const cfgA = cfgR.ok ? await cfgR.json() : [];
          const grade = (cfgA[0] && Array.isArray(cfgA[0].horarios)) ? cfgA[0].horarios : [];
          if (grade.length && !grade.includes(hora)) {
            return { ok: false, motivo: 'horário fora da grade' };
          }
        }
      }
      // trava ANTI-DUPLO-AGENDAMENTO: já tem consulta nesse dia+hora (não cancelada)?
      // Se há dentista, a trava é POR DENTISTA (mesmo horário livre pra dentistas diferentes).
      let ocupUrl = `${SUPABASE_URL}/rest/v1/consultas?clinic_id=eq.${clinic_id}&data=eq.${data}&hora=eq.${hora}&status=neq.cancelado&select=id,dentista_id,lead_id`;
      if (dentista_id) {
        // só conflita se for o MESMO dentista nesse horário
        ocupUrl += `&dentista_id=eq.${dentista_id}`;
      }
      const ocupR = await fetch(ocupUrl, { headers: sbHeaders });
      const ocupA = ocupR.ok ? await ocupR.json() : [];
      // Se o horário está ocupado, checa DE QUEM é. Se for a consulta do
      // PRÓPRIO lead (o Brian processou 2x a mesma intenção — mensagens
      // coladas), NÃO é conflito: ele já agendou pra esse paciente. Trata
      // como sucesso (idempotente) em vez de dizer "ocupado" (bug do fantasma).
      if (ocupA.length) {
        const consultaDoProprioLead = ocupA.find(c => c.lead_id === lead_id);
        if (consultaDoProprioLead) {
          return { ok: true, jaAgendado: true, motivo: 'já agendado para este paciente' };
        }
        return { ok: false, motivo: dentista_id ? 'dentista já ocupado nesse horário' : 'horário já ocupado' };
      }

      // REMARCAÇÃO INTELIGENTE: se o paciente JÁ tem consulta ativa futura
      // (agendado/confirmado), isso é uma REMARCAÇÃO — cancela a(s) anterior(es)
      // antes de criar a nova, pra não ficar com 2 horários na agenda.
      // (o Brian às vezes oferece um horário, o paciente troca, e sem isso
      //  ele criava uma 2ª consulta em vez de remarcar.)
      try {
        const hojeRemarca = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
        const antigasR = await fetch(
          `${SUPABASE_URL}/rest/v1/consultas?clinic_id=eq.${clinic_id}&lead_id=eq.${lead_id}&status=in.(agendado,confirmado)&data=gte.${hojeRemarca}&select=id,data,hora`,
          { headers: sbHeaders }
        );
        const antigas = antigasR.ok ? await antigasR.json() : [];
        // cancela todas as consultas futuras ativas que NÃO são exatamente a que
        // está sendo criada agora (mesma data+hora seria duplicata, já barrada acima)
        for (const ant of antigas) {
          if (ant.data === data && ant.hora === hora) continue; // é a mesma, ignora
          await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=eq.${ant.id}`, {
            method: 'PATCH',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              status: 'cancelado',
              observacoes: `Remarcado pelo Brian IA (era ${ant.data} ${ant.hora})`,
            }),
          });
          console.log(`[BRIAN-REMARCAR] cancelou consulta antiga ${ant.id} (${ant.data} ${ant.hora}) → nova ${data} ${hora}`);
        }
      } catch (eRemarca) {
        console.error('[BRIAN-REMARCAR] erro ao cancelar antiga (segue criando a nova):', eRemarca.message);
      }

      // cria a consulta (ocupa o slot na hora)
      const nova = {
        clinic_id, lead_id, data, hora,
        status: 'agendado',
        procedimento: 'Avaliação',
        observacoes: 'Agendado automaticamente pelo Brian IA',
        created_at: new Date().toISOString(),
      };
      if (dentista_id) nova.dentista_id = dentista_id; // atribui o dentista direcionado
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/consultas`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(nova),
      });
      if (!ins.ok) return { ok: false, motivo: 'falha ao inserir: ' + (await ins.text()) };
      // atualiza o lead pra 'agendado'
      await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${lead_id}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'agendado' }),
      });
      return { ok: true };
    } catch (e) { return { ok: false, motivo: e.message }; }
  }

  // Incrementa o contador de mensagens da conversa (reseta por dia).
  // Retorna o novo total do dia.
  async function brianIncrementarContador(clinic_id, phone) {
    try {
      const sufixo = String(phone).replace(/\D/g, '').slice(-8);
      const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
      // lê o atual
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&select=phone,msgs_contador,contador_data&limit=1`,
        { headers: sbHeaders }
      );
      const arr = r.ok ? await r.json() : [];
      const atual = arr[0];
      let novoTotal = 1;
      if (atual && atual.contador_data === hojeBRT) novoTotal = (atual.msgs_contador || 0) + 1;

      if (atual) {
        // atualiza (usa o phone exato que está no banco)
        await fetch(`${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${clinic_id}&phone=eq.${encodeURIComponent(atual.phone)}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ msgs_contador: novoTotal, contador_data: hojeBRT }),
        });
      } else {
        // cria o registro da conversa com o contador
        await fetch(`${SUPABASE_URL}/rest/v1/brian_conversa`, {
          method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ clinic_id, phone: String(phone).replace(/\D/g, ''), msgs_contador: 1, contador_data: hojeBRT }),
        });
      }
      return novoTotal;
    } catch (e) { console.log('[BRIAN-CONTADOR] erro:', e.message); return 0; }
  }

  // Escala a conversa pra equipe: marca escalado=true na brian_conversa.
  // A tarefa pro dashboard é GERADA dinamicamente pelo tarefas-fix.js a partir
  // desse flag (não escrevemos em tarefas_resolvidas, que é só controle de resolvidas).
  async function brianEscalar(clinic_id, phone, nomeLead) {
    try {
      const sufixo = String(phone).replace(/\D/g, '').slice(-8);
      // marca a conversa como escalada (+ registra quando, pra ordenar a tarefa)
      const r = await fetch(`${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&select=phone&limit=1`, { headers: sbHeaders });
      const arr = r.ok ? await r.json() : [];
      if (arr[0]) {
        await fetch(`${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${clinic_id}&phone=eq.${encodeURIComponent(arr[0].phone)}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ escalado: true, escalado_em: new Date().toISOString() }),
        });
      }
      console.log(`[BRIAN-ESCALOU] 🆘 conversa ${phone} escalada pra equipe (tarefa gerada no dashboard)`);
    } catch (e) { console.log('[BRIAN-ESCALAR] erro:', e.message); }
  }

  // Envia 1-2 imagens de casos do procedimento via Evolution (sendMedia)
  async function brianEnviarCasos(instanceName, clinic_id, phone, procedimento) {
    try {
      if (!instanceName || !procedimento) return false;
      const proc = String(procedimento).trim();
      // busca casos ativos desse procedimento (limita a 2)
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/brian_casos?clinic_id=eq.${clinic_id}&ativo=eq.true&procedimento=ilike.*${encodeURIComponent(proc)}*&select=imagem_url,legenda&order=ordem.asc&limit=2`,
        { headers: sbHeaders }
      );
      const casos = r.ok ? await r.json() : [];
      if (!casos.length) { console.log(`[BRIAN-CASOS] nenhum caso de "${proc}" pra enviar`); return false; }

      const cleanPhone = String(phone).replace(/\D/g, '');
      const number = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;

      let enviou = false;
      for (const caso of casos) {
        try {
          // legenda: usa a da clínica, ou um texto padrão que explica que é caso real
          const legenda = caso.legenda || `✨ Olha esse resultado real de ${proc} que fizemos! 😍`;
          await fetch(`${EVO_URL}/message/sendMedia/${instanceName}`, {
            method: 'POST',
            headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              number,
              mediatype: 'image',
              mimetype: 'image/jpeg',
              media: caso.imagem_url,
              caption: legenda,
              fileName: 'caso.jpg',
            }),
          });
          // registra no inbox (como mensagem do Brian)
          await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
            method: 'POST',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              clinic_id, phone: number, contact_name: 'BRIAN_AUTO',
              content: legenda, type: 'image', from_me: true,
              media_url: caso.imagem_url, created_at: new Date().toISOString(),
            }),
          });
          enviou = true;
          console.log(`[BRIAN-CASOS] ✅ enviou caso de "${proc}"`);
        } catch (e) { console.log('[BRIAN-CASOS] erro ao enviar 1 caso:', e.message); }
      }
      return enviou;
    } catch (e) { console.log('[BRIAN-CASOS] erro:', e.message); return false; }
  }

  // Monta e envia a confirmação de agendamento (com endereço/mapa da clínica)
  async function brianEnviarConfirmacao(instanceName, clinic_id, phone, nome, data, hora) {
    try {
      let endereco = '', linkMapa = '', nomeClinica = '';
      const r = await fetch(`${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinic_id}&select=nome,endereco,link_mapa&limit=1`, { headers: sbHeaders });
      if (r.ok) {
        const cls = await r.json();
        if (cls[0]) {
          nomeClinica = cls[0].nome || '';
          endereco = cls[0].endereco || '';
          linkMapa = cls[0].link_mapa || (endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}` : '');
        }
      }
      const [ano, mes, dia] = String(data).split('-');
      const dataFmt = `${dia}/${mes}`;
      const primeiroNome = (nome || '').split(' ')[0] || '';
      let msg = `Prontinho, ${primeiroNome}! 🎉\n\nSua avaliação está *agendada* para o dia *${dataFmt}* às *${hora}*.`;
      if (endereco) msg += `\n\n📍 *Endereço:* ${endereco}`;
      if (linkMapa) msg += `\n🗺️ *Como chegar:* ${linkMapa}`;
      msg += `\n\nQualquer coisa que precisar, é só me chamar por aqui. Até breve! 🦷💛`;
      if (instanceName) await responderPaciente(instanceName, clinic_id, phone, msg, 'BRIAN_AUTO');
    } catch (e) { console.log('[BRIAN-CONFIRMA] erro:', e.message); }
  }

  // ── Só vale a pena transcrever dentro da JANELA DE ATENDIMENTO DO BRIAN ──
  // Evita gastar com transcrição em: mensagens enviadas PELA clínica,
  // clínicas sem Brian liberado/ativo, e — o mais importante — qualquer
  // conversa que não seja o Brian quem está conduzindo agora.
  // Critério: ou NINGUÉM respondeu ainda (1º contato puro), ou a ÚLTIMA
  // resposta da clínica foi do próprio Brian (conversa em andamento com
  // ele). Assim que um HUMANO manda qualquer mensagem, some — mesmo que
  // seja a 5ª mensagem da conversa, não só a 1ª (não depende do status do
  // Kanban, que já muda de 'novo' pra 'contato' assim que o Brian responde
  // a primeira vez — usar só o status cortava a transcrição no meio do
  // próprio atendimento do Brian).
  // Também exclui sempre quem já é paciente conquistado (compareceu/
  // fechado) — esses nunca são transcritos, seja lá quem respondeu.
  async function deveTentarTranscrever(clinicId, phone, fromMe) {
    if (fromMe) return false;
    try {
      const cfgResp = await fetch(
        `${SUPABASE_URL}/rest/v1/brian_config?clinic_id=eq.${clinicId}&select=brian_liberado,auto_ativo&limit=1`,
        { headers: sbHeaders }
      );
      const cfgArr = cfgResp.ok ? await cfgResp.json() : [];
      const cfg = cfgArr[0];
      if (!cfg || cfg.brian_liberado !== true || cfg.auto_ativo !== true) return false;

      const sufixo = String(phone).replace(/\D/g, '').slice(-8);

      // paciente já conquistado (compareceu/fechado) — nunca transcreve
      const leadResp = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${clinicId}&phone=ilike.*${sufixo}&select=status&limit=1`,
        { headers: sbHeaders }
      );
      const leadArr = leadResp.ok ? await leadResp.json() : [];
      const lead = leadArr[0];
      if (lead && ['compareceu', 'fechado'].includes(lead.status)) return false;

      // quem respondeu por último nesta conversa? (se ninguém respondeu
      // ainda, arr fica vazio — trata como "janela do Brian" também, é o
      // caso do 1º contato puro)
      const ultimaRespResp = await fetch(
        `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinicId}&phone=ilike.*${sufixo}&from_me=eq.true&select=contact_name&order=created_at.desc&limit=1`,
        { headers: sbHeaders }
      );
      const ultimaRespArr = ultimaRespResp.ok ? await ultimaRespResp.json() : [];
      const ultimaResp = ultimaRespArr[0];
      if (ultimaResp && ultimaResp.contact_name !== 'BRIAN_AUTO') return false; // humano já assumiu essa conversa

      return true;
    } catch (e) { return false; } // na dúvida, NÃO transcreve (evita gasto indevido)
  }

  // ── Baixa mídia descriptografada do Evolution e salva no Storage
  async function baixarEsalvarMidia(msgCompleta, instanceName, phone, tipo, nomeOriginal) {
    try {
      // v2.3.7: precisa do objeto message COMPLETO (não só a key), senão "Message not found"
      const r = await fetch(`${EVO_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
        method: 'POST',
        headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgCompleta, convertToMp4: false }),
      });
      if (!r.ok) {
        const errTxt = await r.text();
        return null;
      }
      const data = await r.json();
      const base64 = data.base64;
      if (!base64) {
        return null;
      }

      const config = {
        audio:    { bucket: 'audios', ext: 'ogg',  mime: 'audio/ogg' },
        image:    { bucket: 'midias', ext: 'jpg',  mime: 'image/jpeg' },
        video:    { bucket: 'midias', ext: 'mp4',  mime: 'video/mp4' },
        sticker:  { bucket: 'midias', ext: 'webp', mime: 'image/webp' },
        document: { bucket: 'midias', ext: 'bin',  mime: 'application/octet-stream' },
      };
      const cfg = config[tipo] || config.document;
      const binary = Buffer.from(base64, 'base64');

      let fileName;
      if (tipo === 'document' && nomeOriginal) {
        const limpo = String(nomeOriginal).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
        fileName = `doc_${phone}_${Date.now()}_${limpo}`;
      } else {
        fileName = `${tipo}_${phone}_${Date.now()}.${cfg.ext}`;
      }

      const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${cfg.bucket}/${fileName}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': cfg.mime,
        },
        body: binary,
      });
      if (!upload.ok) {
        const upErr = await upload.text();
        return null;
      }
      const finalUrl = `${SUPABASE_URL}/storage/v1/object/public/${cfg.bucket}/${fileName}`;
      return finalUrl;
    } catch (e) {
      return null;
    }
  }

  // ── Transcreve áudio via Whisper (OpenAI) — assim o Brian consegue
  // "entender" o que o paciente falou, em vez de só saber "mandou um
  // áudio". Custo baixíssimo (~R$0,01-0,02 por áudio). Se a chave não
  // estiver configurada ou a transcrição falhar, retorna null — quem
  // chama trata o fallback (mantém o texto genérico "🎵 Áudio").
  async function transcreverAudioWhisper(msgCompleta, instanceName) {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) return null;
    try {
      const r = await fetch(`${EVO_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
        method: 'POST',
        headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgCompleta, convertToMp4: false }),
      });
      if (!r.ok) return null;
      const data = await r.json();
      const base64 = data.base64;
      if (!base64) return null;

      const binary = Buffer.from(base64, 'base64');
      const blob = new Blob([binary], { type: 'audio/ogg' });
      const form = new FormData();
      form.append('file', blob, 'audio.ogg');
      form.append('model', 'whisper-1');
      form.append('language', 'pt'); // acelera e melhora precisão (já sabemos que é português)

      const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
        body: form,
      });
      if (!whisperResp.ok) {
        console.log('[TRANSCRICAO] Whisper retornou erro:', whisperResp.status);
        return null;
      }
      const whisperData = await whisperResp.json();
      const texto = (whisperData.text || '').trim();
      return texto || null;
    } catch (e) {
      console.log('[TRANSCRICAO] falhou:', e.message);
      return null;
    }
  }

  async function responderPaciente(instanceName, clinicId, phone, message, marcador) {
    try {
      const cleanPhone = String(phone).replace(/\D/g, '');
      const number = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;
      const r = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, text: message }),
      });
      const data = await r.json().catch(() => null);
      const sentId = data?.key?.id || null;
      await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          clinic_id: clinicId, phone: number, contact_name: marcador || null,
          content: message, type: 'text', from_me: true, media_url: null,
          message_id: sentId, created_at: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.error('[webhook] Erro ao responder paciente:', e.message);
    }
  }

  async function processarConfirmacao(clinic_id, phone, content, instanceName) {
    try {
      if (!clinic_id || !phone || !content) return;
      const resp = String(content).trim().toLowerCase();
      // Normaliza: tira acentos pra "não"/"nao" e variações caírem na mesma regra
      const semAcento = resp.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      // versão sem pontuação no fim (pra "claro!", "sim.", "ok!" também baterem)
      const semPont = semAcento.replace(/[!.,;:)\s]+$/g, '').replace(/^[\s(]+/g, '');

      // ── CONFIRMAÇÃO: detecção robusta a erros de português (sim, siim, sin, simm, ss, claro...) ──
      const listaConfirmar = ['1', '1️⃣', 'sim', 'confirmar', 'confirmo', 'confirmado', 'confirmada', 'ok', 'okay', 'okk', 'pode ser', 'vou', 'vou sim', 'estarei', 'estarei la', 'isso', 'isso mesmo', 'claro', 'com certeza', 'certo', 'positivo', 'beleza', 'blz', 'show', 'ss', 'sss'].includes(semPont);
      // variações digitadas/erradas: "sim", "siim", "siiim", "simm", "sin", "ssim", "s" sozinho
      const confirmaRegex = /^(s+i+m+|si+n|s+i+|ss+i+m+|s)$/.test(semPont.replace(/\s+/g, ''));
      const ehConfirmar = listaConfirmar || confirmaRegex;

      // ── CANCELAMENTO: detecção por PALAVRA-CHAVE (robusto a erros de português) ──
      // 1) Raízes que indicam cancelamento direto (contém em qualquer lugar da frase)
      const raizesCancelar = ['cancel', 'desmarc', 'desist'];
      let ehCancelar = raizesCancelar.some(r => semAcento.includes(r));
      // 2) Negação + intenção de não ir (ex: "nao vou mais", "nao vai dar", "nao tenho como ir", "nao quero mais")
      if (!ehCancelar) {
        const temNegacao = /\bn[ao]o?\b|\bnaum\b|\bnem\b/.test(semAcento); // nao, não, naum, nem
        const temIntencaoIr = /(vou|vai|quero|posso|consigo|da|dar|tenho como|poderei|poder)\b.*\b(mais|ir|comparecer)|(\bmais\b)|(\bir\b)|(comparecer)/.test(semAcento)
          || /(vou|vai|quero|posso|consigo|tenho|poderei)/.test(semAcento);
        // só marca cancelamento por negação se a frase for curta (resposta ao lembrete), evitando falso positivo em conversa longa
        if (temNegacao && temIntencaoIr && semAcento.length <= 40) ehCancelar = true;
      }
      // confirmação NÃO vale se a frase também bate cancelamento (cancelamento vence, é mais seguro)
      const ehConfirmarFinal = ehConfirmar && !ehCancelar;

      const ehRemarcar = ['2', '2️⃣', 'nao', 'não', 'remarcar', 'reagendar', 'nao posso', 'não posso', 'nao vou', 'não vou'].includes(resp)
        || /remarc|reagend|outro dia|outro horario|outra data|mudar.*dia|mudar.*horario/.test(semAcento);
      const digitos = String(phone).replace(/\D/g, '');
      const sufixo = digitos.slice(-8);
      if (sufixo.length < 8) return;
      // Busca TODOS os leads com esse telefone (pode haver DUPLICADOS com o
      // telefone escrito em formatos diferentes — ex: "(17) 99217-1699" e
      // "5517992171699"). Procurar em todos evita a confirmação falhar quando
      // a consulta está vinculada a um lead duplicado.
      const leadResp = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${clinic_id}&telefone=ilike.*${sufixo}&select=id,nome`,
        { headers: sbHeaders }
      );
      if (!leadResp.ok) return;
      const leadsEnc = await leadResp.json();
      if (!leadsEnc.length) return; // número não é lead conhecido
      const leadIds = leadsEnc.map(l => l.id);
      // usa o primeiro como "lead principal" pro nome na mensagem
      const lead = leadsEnc[0];
      const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
      const amanhaBRT = new Date(Date.now() - 3 * 3600 * 1000 + 24 * 3600 * 1000).toISOString().split('T')[0];
      // Busca as consultas próximas (hoje/amanhã) de TODOS os leads com esse
      // telefone (cobre o caso de lead duplicado). Traz várias pra escolher a
      // MAIS RELEVANTE (a que a pessoa está respondendo).
      const leadIdsFiltro = leadIds.map(id => `"${id}"`).join(',');
      const consResp = await fetch(
        `${SUPABASE_URL}/rest/v1/consultas?lead_id=in.(${leadIdsFiltro})&clinic_id=eq.${clinic_id}&status=in.(agendado,confirmado)&data=in.(${hojeBRT},${amanhaBRT})&select=id,data,hora,lembrete_24h,status,lead_id&limit=10`,
        { headers: sbHeaders }
      );
      if (!consResp.ok) return;
      const consultasEnc = await consResp.json();
      if (!consultasEnc.length) return; // sem consulta próxima: só salva a mensagem

      // Escolhe a consulta mais relevante:
      // 1º) a que tem lembrete_24h mais RECENTE (foi a última lembrada)
      // 2º) se nenhuma tem lembrete, a mais próxima no tempo (data+hora asc)
      const comLembrete = consultasEnc.filter(c => c.lembrete_24h);
      let consulta;
      if (comLembrete.length) {
        comLembrete.sort((a, b) => new Date(b.lembrete_24h) - new Date(a.lembrete_24h));
        consulta = comLembrete[0];
      } else {
        consultasEnc.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
        consulta = consultasEnc[0];
      }

      // ── TRAVA ANTI-CONSULTA-VENCIDA (o bug da Elaide) ──
      // Não trata como confirmação/cancelamento se a consulta escolhida JÁ PASSOU.
      // Ex: consulta hoje 09:30; a paciente responde "ok" de tarde numa conversa
      // qualquer → antes, o CRM confirmava uma consulta vencida (constrangedor).
      // Só confirma consulta cujo horário ainda está no FUTURO (com folga de 15min
      // pra cobrir quem confirma em cima da hora). Se já passou, pula a consulta
      // vencida e tenta achar uma FUTURA na lista; se não houver, ignora.
      function dataHoraNoFuturo(c) {
        if (!c || !c.data) return false;
        const horaC = (c.hora || '00:00').slice(0, 5);
        // monta o Date da consulta em horário de Brasília (UTC-3)
        const dtConsulta = new Date(`${c.data}T${horaC}:00-03:00`);
        if (isNaN(dtConsulta)) return false;
        // válida se falta pra consulta (ou passou no máx. 15 min — tolerância)
        return dtConsulta.getTime() > (Date.now() - 15 * 60 * 1000);
      }
      if (!dataHoraNoFuturo(consulta)) {
        // a mais relevante já venceu — procura alguma FUTURA na lista
        const futuras = consultasEnc
          .filter(dataHoraNoFuturo)
          .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
        if (futuras.length) {
          consulta = futuras[0];
        } else {
          // nenhuma consulta futura pra confirmar → é só um "ok" de conversa, ignora
          console.log('[webhook] confirmação ignorada: nenhuma consulta futura (evita confirmar vencida)');
          return;
        }
      }

      // ── JANELA DE CONTEXTO (anti-conversa-aleatória) ──
      // Só trata como resposta a lembrete se:
      //  (1) a mensagem é CURTA (resposta objetiva, não conversa), E
      //  (2) a clínica enviou um lembrete/confirmação pra esse número
      //      nas últimas 18h (fonte: tabela mensagens, from_me=true).
      // Isso evita disparar gatilho em conversa aleatória.

      // (1) mensagem curta
      const respCurta = resp.length <= 25;
      if (!respCurta) return; // mensagem longa = conversa, não resposta

      // (2) houve lembrete/confirmação recente pra esse número?
      const dezoitoHorasAtras = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const numeroDigitos = String(phone).replace(/\D/g, '');
      const sufixoNum = numeroDigitos.slice(-8);
      let houveLembreteRecente = false;
      try {
        const msgResp = await fetch(
          `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixoNum}&from_me=eq.true&created_at=gte.${dezoitoHorasAtras}&order=created_at.desc&select=content&limit=10`,
          { headers: sbHeaders }
        );
        if (msgResp.ok) {
          const msgs = await msgResp.json();
          // frases que marcam um lembrete/confirmação enviado pela clínica
          const marcadores = ['confirma sua presença', 'confirma sua presenca', 'sua consulta',
            'lembrar que', 'consulta está', 'consulta esta', 'confirmar', 'remarcar',
            'te esperamos', 'sua presença', 'sua presenca', 'sua avaliação', 'sua avaliacao',
            'tem consulta', 'tem horário', 'tem horario', 'seu horário', 'seu horario',
            'agendamento', 'agendada', 'agendado', 'responda', 'amanhã', 'amanha',
            'hoje às', 'hoje as', 'confirme', 'confirma pra', 'confirma para', 'presença está',
            'presenca esta', 'lembrete', 'sua sessão', 'sua sessao', 'compareça', 'comparecer'];
          houveLembreteRecente = msgs.some(m => {
            const c = String(m.content || '').toLowerCase();
            return marcadores.some(mk => c.includes(mk));
          });
        }
      } catch (e) { /* em erro, não processa (mais seguro) */ }

      if (!houveLembreteRecente) return; // sem lembrete recente = conversa aleatória, ignora

      if (!consulta || !consulta.data) return; // sem data válida, não processa (evita crash)
      const [ano, mes, dia] = String(consulta.data).split('-');
      const dataFmt = `${dia}/${mes}`;
      const horaFmt = (consulta.hora || '').slice(0, 5);
      const primeiroNome = ((lead && lead.nome) || '').split(' ')[0] || '';
      if (ehConfirmarFinal) {
        // ── REGRA ANTI-RECONFIRMAÇÃO ──
        // Se a consulta JÁ está com status 'confirmado', não confirma de novo
        // nem reenvia a mensagem. Ex: paciente confirmou ontem; hoje manda "ok"
        // numa conversa qualquer → não deve receber "consulta confirmada!" de novo.
        // Só processa a confirmação se a consulta ainda está 'agendado' (aguardando).
        if (consulta.status === 'confirmado') {
          console.log('[webhook] confirmação ignorada: consulta já estava confirmada (não reenvia)');
          return;
        }
        await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=eq.${consulta.id}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'confirmado' }),
        });
        // Busca endereco/mapa da clinica para a mensagem de boas-vindas
        let endereco = '', linkMapa = '';
        try {
          const clinicaResp = await fetch(
            `${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinic_id}&select=nome,endereco,link_mapa&limit=1`,
            { headers: sbHeaders }
          );
          if (clinicaResp.ok) {
            const cls = await clinicaResp.json();
            if (cls?.length) {
              endereco = cls[0].endereco || '';
              linkMapa = cls[0].link_mapa || (endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}` : '');
            }
          }
        } catch (e) {}
        let boasVindas = `Que ótimo, ${primeiroNome}! 🎉\n\nSua presença está *confirmada* para dia ${dataFmt} às *${horaFmt}*.\nEstamos ansiosos para te atender! 💛`;
        if (endereco) boasVindas += `\n\n📍 *Endereço:* ${endereco}`;
        if (linkMapa) boasVindas += `\n🗺️ *Como chegar:* ${linkMapa}`;
        boasVindas += `\n\nAté breve! 🦷`;
        if (instanceName) await responderPaciente(instanceName, clinic_id, phone, boasVindas);
      } else if (ehCancelar) {
        // NÃO cancela a consulta — só marca o pedido pra equipe reverter (tarefa urgente no CRC)
        await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=eq.${consulta.id}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ cancelar_solicitado: true }),
        });
        if (instanceName) await responderPaciente(instanceName, clinic_id, phone, `Recebi sua mensagem, ${primeiroNome}! 😊\n\nJá vou repassar para nossa equipe. Em breve alguém entra em contato com você!`);
      } else if (ehRemarcar) {
        await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=eq.${consulta.id}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ remarcar_solicitado: true }),
        });
        if (instanceName) await responderPaciente(instanceName, clinic_id, phone, `Sem problema, ${primeiroNome}! 😊\n\nNossa equipe vai entrar em contato em breve para encontrarmos um novo horário para você.`);
      }
    } catch (e) {
      console.error('[webhook] Erro em processarConfirmacao:', e.message);
    }
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Body inválido' }); }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body vazio' });

  try {
    const rawEvento = body?.event || body?.type || '';
    const evento = rawEvento.toLowerCase().replace('.', '_');
    if (evento !== 'messages_upsert') return res.status(200).json({ ok: true, ignorado: rawEvento });

    const instanceName = body?.instance || body?.instanceName || null;
    let clinic_id = null;
    if (instanceName) {
      // 1) Procura o número PRINCIPAL (clinicas.whatsapp_instance)
      const clinicResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${encodeURIComponent(instanceName)}&select=id&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (clinicResp.ok) {
        const clinics = await clinicResp.json();
        if (clinics?.length > 0) clinic_id = clinics[0].id;
      }
      // 2) Se não achou, procura nos números EXTRAS (tabela instancias)
      if (!clinic_id) {
        const instResp = await fetch(
          `${SUPABASE_URL}/rest/v1/instancias?instance_name=eq.${encodeURIComponent(instanceName)}&select=clinic_id&limit=1`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
        );
        if (instResp.ok) {
          const insts = await instResp.json();
          if (insts?.length > 0) clinic_id = insts[0].clinic_id;
        }
      }
    }

    const rawMessages = body?.data || body?.messages || [];
    const list = Array.isArray(rawMessages) ? rawMessages : [rawMessages];
    const insertados = [];
    const erros = [];

    for (const msg of list) {
      try {
        const key = msg?.key || {};
        const jid = key?.remoteJid || '';
        const fromMe = key?.fromMe ?? false;
        if (!jid || jid.includes('status@broadcast') || jid.includes('@g.us')) continue;
        const phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const contact_name = fromMe ? null : (msg?.pushName || null);
        const message_id = key?.id || null;
        const created_at = msg?.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString();

        if (message_id) {
          const dupResp = await fetch(
            `${SUPABASE_URL}/rest/v1/mensagens?message_id=eq.${encodeURIComponent(message_id)}&select=id&limit=1`,
            { headers: sbHeaders }
          );
          if (dupResp.ok) {
            const dup = await dupResp.json();
            if (dup.length) { insertados.push(phone); continue; }
          }
        }

        let content = '';
        let type = 'text';
        let media_url = null;
        const m = msg?.message || {};

        if (m.conversation) {
          content = m.conversation; type = 'text';
        } else if (m.extendedTextMessage) {
          content = m.extendedTextMessage?.text || ''; type = 'text';
        } else if (m.imageMessage) {
          content = m.imageMessage?.caption || '📷 Imagem'; type = 'image';
          if (message_id && instanceName) media_url = await baixarEsalvarMidia(msg, instanceName, phone, 'image');
        } else if (m.audioMessage) {
          content = '🎵 Áudio'; type = 'audio';
          if (message_id && instanceName) media_url = await baixarEsalvarMidia(msg, instanceName, phone, 'audio');
          // transcreve via Whisper SÓ se valer a pena (Brian ativo nesta
          // clínica e nenhum humano respondendo ativamente agora) — evita
          // gastar transcrevendo áudio de conversa que já é 100% humana
          if (await deveTentarTranscrever(clinic_id, phone, fromMe)) {
            const transcricao = await transcreverAudioWhisper(msg, instanceName);
            if (transcricao) content = transcricao;
          }
        } else if (m.videoMessage) {
          content = m.videoMessage?.caption || '🎥 Vídeo'; type = 'video';
          if (message_id && instanceName) media_url = await baixarEsalvarMidia(msg, instanceName, phone, 'video');
        } else if (m.documentMessage) {
          content = m.documentMessage?.fileName || '📄 Documento'; type = 'document';
          if (message_id && instanceName) media_url = await baixarEsalvarMidia(msg, instanceName, phone, 'document', m.documentMessage?.fileName);
        } else if (m.stickerMessage) {
          content = '🖼️ Sticker'; type = 'sticker';
          if (message_id && instanceName) media_url = await baixarEsalvarMidia(msg, instanceName, phone, 'sticker');
        } else if (m.locationMessage) {
          content = `📍 ${m.locationMessage?.degreesLatitude}, ${m.locationMessage?.degreesLongitude}`; type = 'location';
        } else if (m.contactMessage) {
          content = `👤 ${m.contactMessage?.displayName || ''}`; type = 'contact';
        } else {
          content = '[mídia]'; type = 'unknown';
        }

        const payload = { clinic_id, phone, contact_name, content, type, from_me: fromMe, media_url, message_id, created_at, instance_name: instanceName };
        const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(payload),
        });
        if (!insertResp.ok) {
          const errText = await insertResp.text();
          erros.push({ phone, erro: errText });
        } else {
          insertados.push(phone);
        }
        if (!fromMe && type === 'text') await processarConfirmacao(clinic_id, phone, content, instanceName);

        // ── RESPOSTA DA CLÍNICA (humano OU Brian) → move lead pra "em atendimento" ──
        // Qualquer mensagem que SAI da clínica (from_me) significa que alguém respondeu
        // o lead — seja o Brian, o WhatsApp do celular, ou o Inbox do sistema. Então o
        // lead deixa de ser "novo/sem contato" e vai pra "contato" (em atendimento).
        // Só promove de 'novo' (não rebaixa quem já avançou). Cobre os 3 jeitos de responder.
        if (fromMe) {
          try {
            await marcarLeadEmAtendimento(clinic_id, phone);
          } catch (e) { console.log('[LEAD-STATUS] erro ao mover pra contato:', e.message); }
        }

        // ── GARANTE LEAD PRA TODA MENSAGEM RECEBIDA (nenhum contato fica invisível) ──
        // Se chega mensagem de um cliente e ainda não existe lead, cria agora — mesmo
        // que o Brian esteja desligado. Assim toda conversa aparece no funil e gera
        // tarefa de "aguardando resposta" se ninguém responder. Não duplica (a função
        // procura antes de criar). Usa o pushName como nome provisório.
        if (!fromMe) {
          try {
            // extrai o procedimento da mensagem de anúncio ("Quero saber mais sobre X")
            const procDaMsg = (type === 'text') ? extrairProcedimentoDaMsg(content) : null;
            await brianAcharOuCriarLead(clinic_id, phone, contact_name || null, 'WhatsApp', procDaMsg);
          } catch (e) { console.log('[LEAD-AUTO] erro ao garantir lead:', e.message); }
        }

        // ── BRIAN 2.3.b — decide e, se aprovado + número de teste, RESPONDE ──
        if (!fromMe && type === 'text') {
          try {
            const decisao = await brianDecide(clinic_id, phone, content, instanceName, fromMe, false);
            console.log(`[BRIAN-DECISAO] ${decisao.responder ? '✅ RESPONDERIA' : '⛔ não responde'} | ${phone} | motivo: ${decisao.razao} | msg: "${String(content).slice(0, 40)}"`);

            if (decisao.responder) {
              // ── TRAVA DE TESTE: só envia pra números autorizados (modo rollout controlado) ──
              // Coloque aqui os ÚLTIMOS 8 DÍGITOS dos números liberados pra teste.
              // Enquanto essa lista existir, o Brian SÓ responde esses números.
              // Deixe a lista VAZIA ([]) para liberar geral (produção).
              const NUMEROS_TESTE = []; // VAZIO = produção (responde todos os leads das clínicas LIBERADAS). A liberação é controlada por clínica (brian_liberado) no painel admin.
              const sufixoMsg = String(phone).replace(/\D/g, '').slice(-8);
              const modoTeste = NUMEROS_TESTE.length > 0;
              const liberadoTeste = !modoTeste || NUMEROS_TESTE.includes(sufixoMsg);

              if (!liberadoTeste) {
                console.log(`[BRIAN-ENVIO] ⏸️ modo teste: ${phone} não está na lista de teste — não envia`);
              } else {
                // ── DEBOUNCE: espera o lead terminar de digitar ──
                // O lead costuma mandar várias mensagens seguidas (linha por linha).
                // Esperamos DEBOUNCE_MS; se durante a espera chegar uma mensagem MAIS NOVA
                // desse mesmo lead, ABORTAMOS esta resposta (a execução da msg mais nova
                // vai responder, já considerando o contexto completo). Assim o Brian
                // responde UMA vez só, lendo tudo junto, e não queima mensagens à toa.
                const DEBOUNCE_MS = 10000; // 10 segundos
                const meuCreatedAt = created_at; // timestamp desta mensagem
                await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
                // chegou mensagem mais nova desse lead depois desta?
                try {
                  const sufixoDeb = String(phone).replace(/\D/g, '').slice(-8);
                  const chkResp = await fetch(
                    `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixoDeb}&from_me=eq.false&created_at=gt.${encodeURIComponent(meuCreatedAt)}&select=id&limit=1`,
                    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
                  );
                  const maisNovas = chkResp.ok ? await chkResp.json() : [];
                  if (maisNovas.length) {
                    console.log(`[BRIAN-DEBOUNCE] ⏭️ ${phone} mandou msg mais nova — esta execução aborta (a mais nova responde)`);
                    continue; // pula pro próximo; a mensagem mais nova cuida da resposta
                  }
                } catch (e) { /* se a checagem falhar, segue e responde normal */ }

                console.log(`[BRIAN-ENVIO] 🤖 gerando resposta para ${phone}...`);
                let respBrian = await fetch(`${SUPABASE_URL}/functions/v1/brian`, {
                  method: 'POST',
                  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'responder_auto', clinic_id, phone, ultima_msg: content }),
                });
                let dataBrian = respBrian.ok ? await respBrian.json() : null;

                // ── RETRY (1x) — antes, se a IA falhasse (ex: limite de taxa
                // excedido no free tier, erro momentâneo de rede), o sistema
                // simplesmente NÃO respondia nada, silenciosamente, sem log
                // nem aviso. Agora tenta de novo 1 vez após 2s, e se falhar
                // de novo, registra um log de erro bem visível pra investigar.
                if (!dataBrian || !dataBrian.ok) {
                  const motivoFalha1 = dataBrian?.erro || `HTTP ${respBrian.status}`;
                  console.log(`[BRIAN-ERRO] ⚠️ falhou na 1ª tentativa pra ${phone} (clínica ${clinic_id}): ${motivoFalha1} — tentando de novo em 2s...`);
                  await new Promise(r => setTimeout(r, 2000));
                  try {
                    respBrian = await fetch(`${SUPABASE_URL}/functions/v1/brian`, {
                      method: 'POST',
                      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'responder_auto', clinic_id, phone, ultima_msg: content }),
                    });
                    dataBrian = respBrian.ok ? await respBrian.json() : null;
                  } catch (e) { console.log(`[BRIAN-ERRO] retry também falhou (exceção): ${e.message}`); }

                  if (!dataBrian || !dataBrian.ok) {
                    const motivoFalha2 = dataBrian?.erro || `HTTP ${respBrian.status}`;
                    console.log(`[BRIAN-ERRO] 🔴 falhou DE NOVO pra ${phone} (clínica ${clinic_id}): ${motivoFalha2} — paciente ficará sem resposta automática nesta mensagem. Verificar manualmente.`);
                  }
                }

                let textoResposta = dataBrian && dataBrian.ok ? dataBrian.sugestao : null;

                if (textoResposta && instanceName) {
                  // ── FASE 3 — detecta marcadores [[LEAD|...]] e [[AGENDAR|...]] ──
                  let campoLead = null;   // {nome}
                  let campoAgendar = null; // {data, hora, nome}

                  // marcador LEAD (captura do nome → criar lead se novo)
                  const mLead = String(textoResposta).match(/\[\[LEAD\|([^\]]+)\]\]/i);
                  if (mLead) {
                    try {
                      const campos = {};
                      mLead[1].split('|').forEach(par => {
                        const idx = par.indexOf('=');
                        if (idx > 0) campos[par.slice(0, idx).trim().toLowerCase()] = par.slice(idx + 1).trim();
                      });
                      campoLead = campos;
                      console.log(`[BRIAN-LEAD] 👤 detectado | phone: ${phone} | nome: ${campos.nome}`);
                    } catch (e) { console.log('[BRIAN-LEAD] erro ao ler marcador:', e.message); }
                    textoResposta = String(textoResposta).replace(/\s*\[\[LEAD\|[^\]]+\]\]\s*/i, ' ').trim();
                  }

                  // marcador AGENDAR (fechar horário → criar consulta)
                  const mAgendar = String(textoResposta).match(/\[\[AGENDAR\|([^\]]+)\]\]/i);
                  if (mAgendar) {
                    try {
                      const campos = {};
                      mAgendar[1].split('|').forEach(par => {
                        const idx = par.indexOf('=');
                        if (idx > 0) campos[par.slice(0, idx).trim().toLowerCase()] = par.slice(idx + 1).trim();
                      });
                      campoAgendar = campos;
                      console.log(`[BRIAN-AGENDAR] 📅 detectado | phone: ${phone} | data: ${campos.data} | hora: ${campos.hora} | nome: ${campos.nome}`);
                    } catch (e) { console.log('[BRIAN-AGENDAR] erro ao ler marcador:', e.message); }
                    textoResposta = String(textoResposta).replace(/\s*\[\[AGENDAR\|[^\]]+\]\]\s*/i, ' ').trim();
                  }

                  // marcador CASOS (enviar fotos de antes/depois de um procedimento)
                  let procCasos = null;
                  const mCasos = String(textoResposta).match(/\[\[CASOS\|([^\]]+)\]\]/i);
                  if (mCasos) {
                    try {
                      const campos = {};
                      mCasos[1].split('|').forEach(par => {
                        const idx = par.indexOf('=');
                        if (idx > 0) campos[par.slice(0, idx).trim().toLowerCase()] = par.slice(idx + 1).trim();
                      });
                      procCasos = campos.procedimento || null;
                      console.log(`[BRIAN-CASOS] 📸 detectado | phone: ${phone} | procedimento: ${procCasos}`);
                    } catch (e) { console.log('[BRIAN-CASOS] erro ao ler marcador:', e.message); }
                    textoResposta = String(textoResposta).replace(/\s*\[\[CASOS\|[^\]]+\]\]\s*/i, ' ').trim();
                  }

                  // marcador PROC (interesse revelado na conversa → grava no lead)
                  let procInteresseConversa = null;
                  const mProc = String(textoResposta).match(/\[\[PROC\|([^\]]+)\]\]/i);
                  if (mProc) {
                    try {
                      const campos = {};
                      mProc[1].split('|').forEach(par => {
                        const idx = par.indexOf('=');
                        if (idx > 0) campos[par.slice(0, idx).trim().toLowerCase()] = par.slice(idx + 1).trim();
                      });
                      procInteresseConversa = campos.procedimento || null;
                      console.log(`[BRIAN-PROC] 🎯 detectado | phone: ${phone} | procedimento: ${procInteresseConversa}`);
                    } catch (e) { console.log('[BRIAN-PROC] erro ao ler marcador:', e.message); }
                    textoResposta = String(textoResposta).replace(/\s*\[\[PROC\|[^\]]+\]\]\s*/i, ' ').trim();
                  }

                  // 1) envia a resposta limpa do Brian (sem marcadores)
                  if (textoResposta) {
                    await responderPaciente(instanceName, clinic_id, phone, textoResposta, 'BRIAN_AUTO');
                    console.log(`[BRIAN-ENVIO] ✅ respondeu ${phone}: "${String(textoResposta).slice(0, 60)}"`);

                    // ── GARANTE O LEAD CEDO (pra follow-up reaquecer quem some sem dar o nome) ──
                    // Se a pessoa demonstrou interesse (o Brian respondeu), ela já vira lead,
                    // mesmo sem ter dito o nome. Usa o pushName do WhatsApp como nome provisório.
                    // Quando ela disser o nome depois, o [[LEAD]] atualiza (brianAcharOuCriarLead não duplica).
                    if (!campoAgendar) {
                      const nomeProvisorio = (campoLead && campoLead.nome) || contact_name || null;
                      await brianAcharOuCriarLead(clinic_id, phone, nomeProvisorio);
                      // (o status 'contato' já é cuidado pelo handler de from_me, que cobre
                      //  Brian + humano + inbox — não precisa duplicar aqui)
                    }

                    // incrementa o contador de mensagens da conversa
                    const totalDia = await brianIncrementarContador(clinic_id, phone);
                    // se ESTA resposta atingiu o limite, escala pra equipe (avisa + cria tarefa)
                    const LIMITE = 12;
                    if (totalDia >= LIMITE) {
                      const nomeLead = (campoLead && campoLead.nome) || (campoAgendar && campoAgendar.nome) || '';
                      const primeiro = String(nomeLead).split(' ')[0] || '';
                      const aviso = `${primeiro ? primeiro + ', ' : ''}vou pedir pra um especialista da nossa equipe te dar uma atenção mais completa, tá? 😊 Em breve alguém continua seu atendimento por aqui!`;
                      await responderPaciente(instanceName, clinic_id, phone, aviso, 'BRIAN_AUTO');
                      await brianEscalar(clinic_id, phone, nomeLead);
                    }
                  }

                  // 1.5) envia os casos (antes/depois) se o Brian sinalizou
                  if (procCasos) {
                    await brianEnviarCasos(instanceName, clinic_id, phone, procCasos);
                  }

                  // 1.6) grava o procedimento de interesse revelado na conversa
                  // (a própria brianAcharOuCriarLead atualiza se o atual for "Avaliação")
                  if (procInteresseConversa) {
                    try {
                      await brianAcharOuCriarLead(clinic_id, phone, (campoLead && campoLead.nome) || null, 'WhatsApp', procInteresseConversa);
                    } catch (e) { console.log('[BRIAN-PROC] erro ao gravar procedimento:', e.message); }
                  }

                  // 2) executa o agendamento (se houver) — cria lead + consulta + confirma
                  if (campoAgendar && campoAgendar.data && campoAgendar.hora) {
                    // ── TRAVA ANTI-DATA-ERRADA ──
                    // O modelo às vezes escreve a data errada no marcador AGENDAR
                    // (ex: paciente pede "amanhã" e o Brian grava uma quinta-feira
                    // de outra semana). Aqui o SERVIDOR recalcula "hoje"/"amanhã"
                    // de verdade (não confia no modelo) e confere contra as ÚLTIMAS
                    // mensagens da conversa (não só a que disparou esta resposta,
                    // já que a palavra "amanhã" pode ter sido dita 1-2 mensagens
                    // antes, ex: paciente só respondeu "9:30" depois). Se detectar
                    // menção a "hoje"/"amanhã" e a data do marcador não bater,
                    // corrige automaticamente ANTES de gravar no banco.
                    try {
                      const fmtBRcheck = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
                      const hojeISOcheck = fmtBRcheck.format(new Date());
                      const baseBRTcheck = new Date(`${hojeISOcheck}T12:00:00-03:00`);
                      const amanhaISOcheck = new Date(baseBRTcheck.getTime() + 24 * 3600 * 1000).toISOString().split('T')[0];

                      const sufixoCheck = String(phone).replace(/\D/g, '').slice(-8);
                      const janelaCheck = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // últimos 30min
                      const histR = await fetch(
                        `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixoCheck}&created_at=gte.${encodeURIComponent(janelaCheck)}&select=content&order=created_at.desc&limit=6`,
                        { headers: sbHeaders }
                      );
                      const histA = histR.ok ? await histR.json() : [];
                      const textoRecente = (histA || []).map(m => String(m.content || '')).join(' ').toLowerCase();

                      const mencionaAmanha = /\bamanh[ãa]\b/.test(textoRecente);
                      const mencionaHoje = /\bhoje\b/.test(textoRecente);

                      if (mencionaAmanha && campoAgendar.data !== amanhaISOcheck) {
                        console.log(`[BRIAN-AGENDAR] ⚠️ CORREÇÃO ANTI-DATA-ERRADA: conversa menciona "amanhã" mas marcador gravou ${campoAgendar.data} — corrigindo pra ${amanhaISOcheck}`);
                        campoAgendar.data = amanhaISOcheck;
                      } else if (mencionaHoje && !mencionaAmanha && campoAgendar.data !== hojeISOcheck) {
                        console.log(`[BRIAN-AGENDAR] ⚠️ CORREÇÃO ANTI-DATA-ERRADA: conversa menciona "hoje" mas marcador gravou ${campoAgendar.data} — corrigindo pra ${hojeISOcheck}`);
                        campoAgendar.data = hojeISOcheck;
                      }
                    } catch (e) { console.log('[BRIAN-AGENDAR] erro na checagem anti-data-errada (segue sem corrigir):', e.message); }

                    const lead = await brianAcharOuCriarLead(clinic_id, phone, campoAgendar.nome || (campoLead && campoLead.nome));
                    if (lead && lead.id) {
                      // resolve o dentista pelo direcionamento (nome vindo no marcador) ou padrão da clínica
                      const dentistaId = await brianResolverDentista(clinic_id, campoAgendar.dentista || '');
                      const r = await brianCriarConsulta(clinic_id, lead.id, campoAgendar.data, campoAgendar.hora, dentistaId);
                      if (r.ok && r.jaAgendado) {
                        // o Brian processou a mesma intenção 2x (mensagens coladas).
                        // Já estava agendado pra esse paciente nesse horário — não
                        // cria de novo nem reenvia confirmação (evita o "fantasma").
                        console.log(`[BRIAN-AGENDAR] ↩️ já estava agendado (${campoAgendar.data} ${campoAgendar.hora}) — ignora duplicata`);
                      } else if (r.ok) {
                        console.log(`[BRIAN-AGENDAR] ✅ CONSULTA CRIADA | ${campoAgendar.data} ${campoAgendar.hora} | lead ${lead.id}${dentistaId ? ' | dentista ' + dentistaId : ''}`);
                        await brianEnviarConfirmacao(instanceName, clinic_id, phone, lead.nome || campoAgendar.nome, campoAgendar.data, campoAgendar.hora);
                      } else {
                        console.log(`[BRIAN-AGENDAR] ⚠️ NÃO agendou (${r.motivo}) — avisa o paciente`);
                        // se o horário deu problema (ocupado/passado), avisa gentilmente
                        if (r.motivo === 'horário já ocupado' || r.motivo === 'dentista já ocupado nesse horário' || r.motivo === 'horário no passado') {
                          await responderPaciente(instanceName, clinic_id, phone, 'Ihh, esse horário já está ocupado 😅 Mas me diz: qual outro dia ou período fica bom pra você? Aí já confirmo um horário certinho! 😊', 'BRIAN_AUTO');
                        }
                      }
                    }
                  } else if (campoLead && campoLead.nome) {
                    // 3) só captura de nome (sem agendar) → cria/garante o lead
                    await brianAcharOuCriarLead(clinic_id, phone, campoLead.nome);
                  }
                } else {
                  console.log(`[BRIAN-ENVIO] ⚠️ não gerou resposta (${dataBrian ? (dataBrian.erro || 'sem texto') : 'sem retorno'})`);
                }
              }
            }
          } catch (e) { console.log('[BRIAN-ENVIO] erro:', e.message); }
        }
      } catch (msgErr) {
        erros.push({ erro: msgErr.message });
      }
    }
    return res.status(200).json({ ok: true, processadas: insertados.length, erros: erros.length });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
