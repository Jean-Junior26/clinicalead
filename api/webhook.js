module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zcwntpkiispbhjjgidih.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const EVO_URL = 'https://evolution-api-production-62cb.up.railway.app';
const EVO_KEY = '185aff001ce6bb5b9cadec59294ead845c35217a1688d5d77f58a668d98ae000';

  if (!SUPABASE_KEY) return res.status(500).json({ error: 'Configuração ausente' });

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
        `${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&select=auto_desligado,humano_respondeu_em&limit=1`,
        { headers: sbHeaders }
      );
      const convArr = convResp.ok ? await convResp.json() : [];
      const conv = convArr[0];
      if (conv && conv.auto_desligado === true) return motivo(false, 'Brian desligado nesta conversa (chave por conversa)');

      // ── Trava 2 (horário): depende do MODO de atendimento ──
      //   'sempre' (Ágil)   = responde a qualquer hora (recuo do humano cuida do resto)
      //   'fora'  (Cauteloso) = só responde fora do horário de funcionamento
      // Compatibilidade: se auto_modo não existir, cai no comportamento antigo (auto_so_fora_horario).
      const modo = cfg.auto_modo || (cfg.auto_so_fora_horario === false ? 'sempre' : 'fora');
      if (modo !== 'sempre') {
        const dentro = dentroDoHorario(cfg.horario_funcionamento);
        if (dentro) return motivo(false, 'dentro do horário de atendimento (modo Cauteloso: humano assume)');
      }

      // ── Trava 5: humano respondeu recentemente? (recua) ──
      // olha as últimas mensagens from_me=true nas últimas 2h
      const duasHorasAtras = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const humResp = await fetch(
        `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&from_me=eq.true&created_at=gte.${duasHorasAtras}&select=content,contact_name,created_at&order=created_at.desc&limit=5`,
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
        const padrao = ['preco', 'preço', 'valor', 'valores', 'quanto custa', 'quanto fica', 'agendar', 'marcar',
          'consulta', 'avaliacao', 'avaliação', 'implante', 'faceta', 'lente', 'clareamento', 'aparelho',
          'ortodontia', 'protese', 'prótese', 'canal', 'dente', 'sorriso', 'orcamento', 'orçamento',
          'harmonizacao', 'harmonização', 'informacao', 'informação', 'informacoes', 'gostaria', 'interesse'];
        const daClinica = cfg.palavras_anuncio
          ? String(cfg.palavras_anuncio).split(',').map(p => norm(p.trim())).filter(Boolean)
          : [];
        const todasPalavras = [...padrao, ...daClinica];
        const bateu = todasPalavras.some(p => p && txt.includes(p));
        if (!bateu) return motivo(false, 'número novo sem palavra-chave de interesse (camada 1+2)');
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
  async function brianAcharOuCriarLead(clinic_id, phone, nome) {
    try {
      const digitos = String(phone).replace(/\D/g, '');
      const sufixo = digitos.slice(-8);
      // 1) já existe?
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${clinic_id}&telefone=ilike.*${sufixo}&select=id,nome&limit=1`,
        { headers: sbHeaders }
      );
      const arr = r.ok ? await r.json() : [];
      if (arr[0] && arr[0].id) return arr[0];

      // 2) não existe → cria
      const novo = {
        clinic_id,
        nome: (nome || 'Lead WhatsApp').trim(),
        telefone: digitos,
        origem: 'Brian IA',
        status: 'novo',
        procedimento: 'Avaliação',
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

  // Cria a consulta ocupando o horário. Travas: data/hora válidas, não no passado,
  // horário existe na grade e está LIVRE (anti-duplo-agendamento). Retorna true se criou.
  async function brianCriarConsulta(clinic_id, lead_id, data, hora) {
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
      // trava: o horário está na grade da clínica?
      const cfgR = await fetch(`${SUPABASE_URL}/rest/v1/agenda_config?clinic_id=eq.${clinic_id}&select=horarios&limit=1`, { headers: sbHeaders });
      const cfgA = cfgR.ok ? await cfgR.json() : [];
      const grade = (cfgA[0] && Array.isArray(cfgA[0].horarios)) ? cfgA[0].horarios : [];
      if (grade.length && !grade.includes(hora)) {
        return { ok: false, motivo: 'horário fora da grade' };
      }
      // trava ANTI-DUPLO-AGENDAMENTO: já tem consulta nesse dia+hora (não cancelada)?
      const ocupR = await fetch(
        `${SUPABASE_URL}/rest/v1/consultas?clinic_id=eq.${clinic_id}&data=eq.${data}&hora=eq.${hora}&status=neq.cancelado&select=id&limit=1`,
        { headers: sbHeaders }
      );
      const ocupA = ocupR.ok ? await ocupR.json() : [];
      if (ocupA.length) return { ok: false, motivo: 'horário já ocupado' };

      // cria a consulta (ocupa o slot na hora)
      const nova = {
        clinic_id, lead_id, data, hora,
        status: 'agendado',
        procedimento: 'Avaliação',
        observacoes: 'Agendado automaticamente pelo Brian IA',
        created_at: new Date().toISOString(),
      };
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
      const leadResp = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${clinic_id}&telefone=ilike.*${sufixo}&select=id,nome&limit=1`,
        { headers: sbHeaders }
      );
      if (!leadResp.ok) return;
      const leadsEnc = await leadResp.json();
      const lead = leadsEnc[0];
      if (!lead || !lead.id) return; // número não é lead conhecido: não há consulta pra confirmar
      const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
      const amanhaBRT = new Date(Date.now() - 3 * 3600 * 1000 + 24 * 3600 * 1000).toISOString().split('T')[0];
      // Busca as consultas próximas (hoje/amanhã) do lead. Traz várias
      // pra escolher a MAIS RELEVANTE (a que a pessoa está respondendo),
      // não simplesmente a mais antiga.
      const consResp = await fetch(
        `${SUPABASE_URL}/rest/v1/consultas?lead_id=eq.${lead.id}&clinic_id=eq.${clinic_id}&status=in.(agendado,confirmado)&data=in.(${hojeBRT},${amanhaBRT})&select=id,data,hora,lembrete_24h,status&limit=10`,
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
              const NUMEROS_TESTE = ['99418861']; // <- número de teste do Jean (34 99941-8861). Deixe [] para liberar geral.
              const sufixoMsg = String(phone).replace(/\D/g, '').slice(-8);
              const modoTeste = NUMEROS_TESTE.length > 0;
              const liberadoTeste = !modoTeste || NUMEROS_TESTE.includes(sufixoMsg);

              if (!liberadoTeste) {
                console.log(`[BRIAN-ENVIO] ⏸️ modo teste: ${phone} não está na lista de teste — não envia`);
              } else {
                // anti-loop final: já respondeu essa exata mensagem recentemente?
                // (evita responder 2x se o webhook for chamado em duplicidade)
                console.log(`[BRIAN-ENVIO] 🤖 gerando resposta para ${phone}...`);
                const respBrian = await fetch(`${SUPABASE_URL}/functions/v1/brian`, {
                  method: 'POST',
                  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'responder_auto', clinic_id, phone }),
                });
                const dataBrian = respBrian.ok ? await respBrian.json() : null;
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

                  // 1) envia a resposta limpa do Brian (sem marcadores)
                  if (textoResposta) {
                    await responderPaciente(instanceName, clinic_id, phone, textoResposta, 'BRIAN_AUTO');
                    console.log(`[BRIAN-ENVIO] ✅ respondeu ${phone}: "${String(textoResposta).slice(0, 60)}"`);
                  }

                  // 2) executa o agendamento (se houver) — cria lead + consulta + confirma
                  if (campoAgendar && campoAgendar.data && campoAgendar.hora) {
                    const lead = await brianAcharOuCriarLead(clinic_id, phone, campoAgendar.nome || (campoLead && campoLead.nome));
                    if (lead && lead.id) {
                      const r = await brianCriarConsulta(clinic_id, lead.id, campoAgendar.data, campoAgendar.hora);
                      if (r.ok) {
                        console.log(`[BRIAN-AGENDAR] ✅ CONSULTA CRIADA | ${campoAgendar.data} ${campoAgendar.hora} | lead ${lead.id}`);
                        await brianEnviarConfirmacao(instanceName, clinic_id, phone, lead.nome || campoAgendar.nome, campoAgendar.data, campoAgendar.hora);
                      } else {
                        console.log(`[BRIAN-AGENDAR] ⚠️ NÃO agendou (${r.motivo}) — avisa o paciente`);
                        // se o horário deu problema (ocupado/passado), avisa gentilmente
                        if (r.motivo === 'horário já ocupado' || r.motivo === 'horário no passado') {
                          await responderPaciente(instanceName, clinic_id, phone, 'Ihh, esse horário acabou de ser preenchido 😅 Me dá um instante que já te passo as próximas opções, tá?', 'BRIAN_AUTO');
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
