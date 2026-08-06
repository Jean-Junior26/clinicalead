module.exports = async function handler(req, res) {
  // Log de diagnóstico para capturar o payload exato enviado pela Meta ou Evolution
  console.log('[DEBUG-PAYLOAD]', JSON.stringify(req.body));

  // ════════════════════════════════════════════════════════════
  // ⚠️ VERIFICAÇÃO DE WEBHOOK DA META (Cloud API)
  // ════════════════════════════════════════════════════════════
  const META_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'clinicalead-verify-2026';
  if (req.method === 'GET' && req.query && req.query['hub.mode'] === 'subscribe') {
    if (req.query['hub.verify_token'] === META_VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Token de verificação não bate');
  }

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
  // ⚠️ MENSAGEM CHEGANDO PELA API OFICIAL (Meta Cloud API)
  // ════════════════════════════════════════════════════════════
  if (req.body && req.body.object === 'whatsapp_business_account') {
    try {
      const entry = req.body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      const msg = value?.messages?.[0];

      // sem mensagem de verdade (pode ser só um status de "entregue/lido") — ignora
      if (!msg || !phoneNumberId) return res.status(200).json({ ok: true, ignorado: 'sem mensagem de texto' });

      // acha a clínica pelo phone_number_id (já traz o token, precisamos
      // dele agora pra baixar mídia e pra eventualmente responder)
      const clinicaResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?meta_phone_number_id=eq.${phoneNumberId}&select=id,nome,meta_access_token&limit=1`,
        { headers: sbHeaders }
      );
      const clinicaArr = await clinicaResp.json();
      const clinica = clinicaArr[0];
      if (!clinica) return res.status(200).json({ ok: true, ignorado: 'phone_number_id não corresponde a nenhuma clínica' });

      const telefoneLead = msg.from; // já vem só com dígitos
      const nomeContato = value?.contacts?.[0]?.profile?.name || null;
      let conteudo = '';
      let tipo = 'text';
      let mediaUrl = null;
      let binarioBaixado = null; // reaproveitado pra transcrição de áudio, evita baixar 2x

      // ⚠️ NOVO 06/08: baixa e salva a mídia de verdade (antes só gravava
      // um texto genérico tipo "🎵 Áudio", sem o arquivo real).
      if (msg.type === 'text') {
        conteudo = msg.text?.body || ''; tipo = 'text';
      } else if (msg.type === 'image') {
        tipo = 'image';
        const r = await baixarEsalvarMidiaMeta(msg.image?.id, clinica.meta_access_token, telefoneLead, 'image', null);
        mediaUrl = r?.url || null;
        conteudo = msg.image?.caption || '🖼️ Imagem';
      } else if (msg.type === 'audio') {
        tipo = 'audio';
        const r = await baixarEsalvarMidiaMeta(msg.audio?.id, clinica.meta_access_token, telefoneLead, 'audio', null);
        mediaUrl = r?.url || null;
        binarioBaixado = r?.binary || null;
        conteudo = '🎵 Áudio';
        // transcreve — se der certo, o Brian já "ouve" o áudio de verdade
        // ⚠️ AJUSTE: salva só o texto PURO da transcrição (sem prefixo) —
        // é o próprio Brian (função textoDe, no lado dele) quem adiciona o
        // "[Mensagem de voz transcrita]:" sozinho ao montar o histórico.
        // Adicionar aqui TAMBÉM duplicava o prefixo (um dentro do outro),
        // deixando o texto estranho pro Brian, que reagia como se o áudio
        // estivesse confuso/ilegível — mesmo bug já resolvido no Evolution
        // há tempo, reaproveitando o padrão de lá agora.
        if (binarioBaixado) {
          const transcrito = await transcreverAudioMetaWhisper(binarioBaixado);
          if (transcrito) conteudo = transcrito;
        }
      } else if (msg.type === 'video') {
        tipo = 'video';
        const r = await baixarEsalvarMidiaMeta(msg.video?.id, clinica.meta_access_token, telefoneLead, 'video', null);
        mediaUrl = r?.url || null;
        conteudo = msg.video?.caption || '🎬 Vídeo';
      } else if (msg.type === 'sticker') {
        tipo = 'sticker';
        const r = await baixarEsalvarMidiaMeta(msg.sticker?.id, clinica.meta_access_token, telefoneLead, 'sticker', null);
        mediaUrl = r?.url || null;
        conteudo = '😊 Figurinha';
      } else if (msg.type === 'document') {
        tipo = 'document';
        const r = await baixarEsalvarMidiaMeta(msg.document?.id, clinica.meta_access_token, telefoneLead, 'document', msg.document?.filename);
        mediaUrl = r?.url || null;
        conteudo = msg.document?.filename ? `📄 ${msg.document.filename}` : '📄 Documento';
      } else {
        conteudo = `[${msg.type}]`; tipo = msg.type;
      }

      // 1. Grava a mensagem no histórico de mensagens (agora com media_url de verdade)
      await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal,resolution=ignore-duplicates' },
        body: JSON.stringify({
          clinic_id: clinica.id,
          phone: telefoneLead,
          contact_name: nomeContato,
          content: conteudo,
          type: tipo,
          from_me: false,
          media_url: mediaUrl,
          message_id: msg.id,
          instance_name: phoneNumberId,
          created_at: new Date().toISOString(),
        }),
      });

      // 2. Garante a criação/atualização do Lead para aparecer no Inbox do CRM
      const procDaMsg = (tipo === 'text') ? extrairProcedimentoDaMsg(conteudo) : null;
      await brianAcharOuCriarLead(clinica.id, telefoneLead, nomeContato, 'WhatsApp Meta', procDaMsg, false);

      // ⚠️ NOVO 06/08: chama o Brian pra responder de verdade, agora usando
      // a MESMA função de processamento de marcadores que o Evolution já
      // usa (processarMarcadoresBrian) — ou seja, [[AGENDAR]] (agenda de
      // verdade), [[LEAD]] (captura nome), [[CASOS]] (manda foto de caso),
      // [[PROC]] (marca interesse) e [[VOZ]] (responde em áudio) agora
      // funcionam igual nos dois caminhos. [[SIMULAR]] foi removido de
      // vez do sistema (decisão do Jean), não existe mais em lugar nenhum.
      try {
        const respBrian = await fetch(`${SUPABASE_URL}/functions/v1/brian`, {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'responder_auto', clinic_id: clinica.id, phone: telefoneLead, ultima_msg: conteudo }),
        });
        const dataBrian = respBrian.ok ? await respBrian.json() : null;
        if (dataBrian?.ok && dataBrian.sugestao) {
          await processarMarcadoresBrian(clinica.id, telefoneLead, nomeContato, conteudo, tipo, dataBrian.sugestao, null);
        }
      } catch (eBrian) { console.error('[META-BRIAN] erro:', eBrian.message); }

      return res.status(200).json({ ok: true, clinica: clinica.nome, gravado: true });
    } catch (e) {
      console.error('[META-WEBHOOK] erro:', e.message);
      return res.status(200).json({ ok: false, erro: e.message });
    }
  }

  // ⚠️ REMOVIDO 06/08 (decisão do Jean): recurso de simulação visual
  // desativado por completo — rotas 'gerar_simulacao', 'enviar_imagem_pronta'
  // e 'detectar_regiao' removidas (eram usadas só pela página "Simulações",
  // que também deixa de funcionar).

  // ════════════════════════════════════════════════════════════
  // BRIAN 2.3.a — CÉREBRO DA DECISÃO (NÃO ENVIA NADA AINDA)
  // ════════════════════════════════════════════════════════════
  async function brianDecide(clinic_id, phone, content, instanceName, fromMe, isGroup) {
    const motivo = (ok, razao) => ({ responder: ok, razao });
    try {
      if (fromMe) return motivo(false, 'mensagem da própria clínica (from_me)');
      if (isGroup) return motivo(false, 'é grupo de WhatsApp');
      if (!content || !String(content).trim()) return motivo(false, 'sem conteúdo de texto');

      const digitos = String(phone).replace(/\D/g, '');
      const sufixo = digitos.slice(-8);
      if (sufixo.length < 8) return motivo(false, 'telefone inválido');

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
      } catch (e) { }

      try {
        const instAllResp = await fetch(
          `${SUPABASE_URL}/rest/v1/instancias?select=instance_name`,
          { headers: sbHeaders }
        );
        if (instAllResp.ok) {
          const instAll = await instAllResp.json();
          const ehInstancia = (instAll || []).some(i => String(i.instance_name || '').replace(/\D/g, '').includes(sufixo));
          if (ehInstancia) return motivo(false, 'número é uma instância conectada (anti-loop)');
        }
      } catch (e) { }
      const cfgResp = await fetch(
        `${SUPABASE_URL}/rest/v1/brian_config?clinic_id=eq.${clinic_id}&select=auto_ativo,auto_so_fora_horario,auto_modo,horario_funcionamento,palavras_anuncio,brian_liberado,escopo&limit=1`,
        { headers: sbHeaders }
      );
      const cfgArr = cfgResp.ok ? await cfgResp.json() : [];
      const cfg = cfgArr[0];

      if (!cfg || cfg.brian_liberado !== true) return motivo(false, 'clínica não liberada pelo admin');
      if (cfg.auto_ativo !== true) return motivo(false, 'atendimento automático desligado (chave geral)');

      const convResp = await fetch(
        `${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&select=auto_desligado,humano_respondeu_em,msgs_contador,contador_data,escalado&limit=1`,
        { headers: sbHeaders }
      );
      const convArr = convResp.ok ? await convResp.json() : [];
      const conv = convArr[0];
      if (conv && conv.auto_desligado === true) return motivo(false, 'Brian desligado nesta conversa (chave por conversa)');

      const LIMITE_MSGS = 12;
      const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
      if (conv) {
        const contadorHoje = (conv.contador_data === hojeBRT) ? (conv.msgs_contador || 0) : 0;
        if (contadorHoje >= LIMITE_MSGS) {
          return motivo(false, `limite de ${LIMITE_MSGS} mensagens atingido na conversa (escalado pra equipe)`);
        }
      }

      const modo = cfg.auto_modo || (cfg.auto_so_fora_horario === false ? 'sempre' : 'fora');
      if (modo !== 'sempre') {
        const dentro = dentroDoHorario(cfg.horario_funcionamento);
        if (dentro) {
          let brianAssumiu = false;
          try {
            const seisHoras = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
            const ultR = await fetch(
              `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&from_me=eq.true&created_at=gte.${seisHoras}&select=contact_name&order=created_at.desc&limit=1`,
              { headers: sbHeaders }
            );
            const uArrR = ultR.ok ? await ultR.json() : [];
            brianAssumiu = !!(uArrR[0] && uArrR[0].contact_name === 'BRIAN_AUTO');
          } catch (e) { }
          if (!brianAssumiu) return motivo(false, 'dentro do horário de atendimento (modo Cauteloso: humano assume)');
        }
      }

      const MIN_RECUO_HUMANO = 30;
      const janelaRecuo = new Date(Date.now() - MIN_RECUO_HUMANO * 60 * 1000).toISOString();
      const humResp = await fetch(
        `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&from_me=eq.true&created_at=gte.${janelaRecuo}&select=content,contact_name,created_at&order=created_at.desc&limit=5`,
        { headers: sbHeaders }
      );
      const humArr = humResp.ok ? await humResp.json() : [];
      const marcadoresAuto = [
        'confirma sua presença', 'lembrar que', 'sua consulta está', 'está *confirmada*',
        'parabéns', 'avaliação gratuita', 'passei aqui', 'ficou alguma dúvida',
        'à disposição pra te ajudar', 'separei um horário', 'condição especial',
        'oportunidade', 'sentimos sua falta', 'recebi sua mensagem', 'já vou repassar',
        'em breve alguém entra em contato', 'esse horário já está ocupado',
        'foi um prazer receber você', 'ficamos felizes', 'foi confirmado', 'reservado',
        'fico no aguardo', 'te dou um toque', 'aniversário', 'indicação', 'indicou',
      ];
      const normMsg = (x) => String(x || '').trim().toLowerCase();
      const conteudoAtual = normMsg(content);
      const humanoAtivo = humArr.some(m => {
        if (m.contact_name === 'BRIAN_AUTO') return false;
        const c = normMsg(m.content);
        if (c === conteudoAtual) return false;
        if (marcadoresAuto.some(mk => c.includes(mk))) return false;
        return true;
      });
      if (humanoAtivo) return motivo(false, 'humano respondeu recentemente (Brian recua)');

      const saldoResp = await fetch(
        `${SUPABASE_URL}/rest/v1/brian_saldo?clinic_id=eq.${clinic_id}&select=incluso_mes,usado_mes,extra_comprado,extra_usado&limit=1`,
        { headers: sbHeaders }
      );
      const saldoArr = saldoResp.ok ? await saldoResp.json() : [];
      const s = saldoArr[0];
      const disp = s ? ((s.incluso_mes || 0) - (s.usado_mes || 0)) + ((s.extra_comprado || 0) - (s.extra_usado || 0)) : 0;
      if (disp <= 0) return motivo(false, 'sem saldo de mensagens');

      const leadResp = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${clinic_id}&telefone=ilike.*${sufixo}&select=id,status&limit=1`,
        { headers: sbHeaders }
      );
      const leadArr = leadResp.ok ? await leadResp.json() : [];
      const jaEhLead = leadArr.length > 0;

      if (cfg.escopo === 'somente_leads' && jaEhLead) {
        const statusPaciente = ['compareceu', 'fechado'];
        if (statusPaciente.includes(leadArr[0].status)) {
          return motivo(false, 'modo "somente leads": contato já é paciente conhecido');
        }
      }

      if (!jaEhLead) {
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

        if (!bateu) {
          const limpo = txt.trim();
          const soPontuacaoOuEmoji = !/[a-z0-9á-ú]/i.test(limpo);
          const soNumeros = /^\d+$/.test(limpo.replace(/\s/g, ''));
          const soLink = /^https?:\/\/\S+$/i.test(limpo);
          const ehRuido = soPontuacaoOuEmoji || soNumeros || soLink || limpo.length < 2;
          if (!ehRuido) bateu = true;
        }

        if (!bateu) return motivo(false, 'número novo enviou apenas ruído (sem texto útil)');
      }

      return motivo(true, jaEhLead ? 'lead conhecido, fora do horário, com saldo' : 'número novo com palavra-chave de interesse');
    } catch (e) {
      return motivo(false, 'erro na decisão: ' + (e.message || ''));
    }
  }

  function dentroDoHorario(horario) {
    try {
      if (!horario || typeof horario !== 'object') return false;
      const agora = new Date(Date.now() - 3 * 3600 * 1000);
      const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
      const diaKey = dias[agora.getUTCDay()];
      const faixa = horario[diaKey];
      if (!faixa || !faixa.abre || !faixa.fecha) return false;
      const hhmm = `${String(agora.getUTCHours()).padStart(2, '0')}:${String(agora.getUTCMinutes()).padStart(2, '0')}`;
      return hhmm >= faixa.abre && hhmm <= faixa.fecha;
    } catch (e) { return false; }
  }

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

  async function buscarEAtualizarFotoPerfil(clinic_id, leadId, phone) {
    try {
      const leadResp = await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${leadId}&select=foto_perfil_url`, { headers: sbHeaders });
      const leadArr = leadResp.ok ? await leadResp.json() : [];
      if (leadArr[0]?.foto_perfil_url) return;

      const clinicaResp = await fetch(`${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinic_id}&select=whatsapp_instance,tipo_conexao_whatsapp`, { headers: sbHeaders });
      const clinicaArr = clinicaResp.ok ? await clinicaResp.json() : [];
      const clinica = clinicaArr[0];
      if (!clinica?.whatsapp_instance || clinica.tipo_conexao_whatsapp === 'oficial') return;

      const fotoResp = await fetch(`${EVO_URL}/chat/fetchProfilePictureUrl/${clinica.whatsapp_instance}`, {
        method: 'POST',
        headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone }),
      });
      if (!fotoResp.ok) return;
      const fotoData = await fotoResp.json();
      if (!fotoData.profilePictureUrl) return;

      await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${leadId}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ foto_perfil_url: fotoData.profilePictureUrl }),
      });
    } catch (e) { }
  }

  async function brianAcharOuCriarLead(clinic_id, phone, nome, origem, procInteresse, nomeConfirmado = false) {
    try {
      const digitos = String(phone).replace(/\D/g, '');
      const sufixo = digitos.slice(-8);
      const nomeLimpo = (nome || '').trim();

      const sufixoCurto = digitos.slice(-4);
      const rCand = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${clinic_id}&telefone=ilike.*${sufixoCurto}&select=id,nome,procedimento,telefone,nome_confirmado&limit=100`,
        { headers: sbHeaders }
      );
      const candidatos = rCand.ok ? await rCand.json() : [];
      const achado = candidatos.find(l => String(l.telefone || '').replace(/\D/g, '').slice(-8) === sufixo);
      const arr = achado ? [achado] : [];
      if (arr[0] && arr[0].id) {
        const patch = {};
        const atual = (arr[0].nome || '').trim();
        const ehProvisorio = !atual || atual === 'Lead WhatsApp' || !arr[0].nome_confirmado;
        const nomeNovoEhReal = nomeLimpo && nomeLimpo !== 'Lead WhatsApp' && nomeLimpo.split(/\s+/).length >= 1;
        if (ehProvisorio && nomeNovoEhReal && nomeLimpo !== atual) patch.nome = nomeLimpo;
        if (nomeConfirmado && nomeLimpo && !arr[0].nome_confirmado) patch.nome_confirmado = true;

        const procAtual = (arr[0].procedimento || '').trim().toLowerCase();
        if (procInteresse && (!procAtual || procAtual === 'avaliação' || procAtual === 'avaliacao')) {
          patch.procedimento = procInteresse;
        }
        if (Object.keys(patch).length) {
          await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${arr[0].id}`, {
            method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify(patch),
          });
          buscarEAtualizarFotoPerfil(clinic_id, arr[0].id, digitos).catch(() => {});
          return { id: arr[0].id, nome: patch.nome || atual };
        }
        buscarEAtualizarFotoPerfil(clinic_id, arr[0].id, digitos).catch(() => {});
        return arr[0];
      }

      const novo = {
        clinic_id,
        nome: nomeLimpo || 'Lead WhatsApp',
        nome_confirmado: !!(nomeConfirmado && nomeLimpo),
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
      if (!ins.ok) return null;
      const criado = await ins.json();
      const leadCriado = Array.isArray(criado) ? criado[0] : criado;
      if (leadCriado?.id) buscarEAtualizarFotoPerfil(clinic_id, leadCriado.id, digitos).catch(() => {});
      return leadCriado;
    } catch (e) { return null; }
  }

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
      if (lead.status === 'novo') {
        await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${lead.id}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'contato' }),
        });
      }
    } catch (e) { }
  }

  async function brianResolverDentista(clinic_id, nomeDentista) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/dentistas?clinic_id=eq.${clinic_id}&ativo=eq.true&select=id,nome`,
        { headers: sbHeaders }
      );
      const lista = r.ok ? await r.json() : [];
      if (!lista.length) return null;

      const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const alvo = norm(nomeDentista);

      if (alvo) {
        let achou = lista.find(d => norm(d.nome) === alvo);
        if (!achou) achou = lista.find(d => norm(d.nome).includes(alvo) || alvo.includes(norm(d.nome)));
        if (achou) return achou.id;
      }
      return lista[0].id;
    } catch (e) { return null; }
  }

  async function brianCriarConsulta(clinic_id, lead_id, data, hora, dentista_id, telefonePaciente) {
    try {
      if (!lead_id || !data || !hora) return { ok: false, motivo: 'dados incompletos' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) {
        return { ok: false, motivo: 'formato inválido' };
      }
      const agoraBRT = new Date(Date.now() - 3 * 3600 * 1000);
      const hojeISO = agoraBRT.toISOString().split('T')[0];
      const horaAgora = `${String(agoraBRT.getUTCHours()).padStart(2, '0')}:${String(agoraBRT.getUTCMinutes()).padStart(2, '0')}`;
      if (data < hojeISO || (data === hojeISO && hora <= horaAgora)) {
        return { ok: false, motivo: 'horário no passado' };
      }
      const diaSemana = new Date(`${data}T12:00:00`).getDay();

      const exR = await fetch(`${SUPABASE_URL}/rest/v1/agenda_excecoes?clinic_id=eq.${clinic_id}&data=eq.${data}&select=fechado,horarios&limit=1`, { headers: sbHeaders });
      const exA = exR.ok ? await exR.json() : [];
      if (exA.length) {
        const ex = exA[0];
        if (ex.fechado !== false) return { ok: false, motivo: 'clínica fechada nesse dia (feriado/exceção)' };
        const gradeEx = Array.isArray(ex.horarios) ? ex.horarios : [];
        if (gradeEx.length && !gradeEx.includes(hora)) return { ok: false, motivo: 'horário fora da grade especial do dia' };
      } else {
        const padR = await fetch(`${SUPABASE_URL}/rest/v1/agenda_padrao?clinic_id=eq.${clinic_id}&dia_semana=eq.${diaSemana}&select=horarios,ativo&limit=1`, { headers: sbHeaders });
        const padA = padR.ok ? await padR.json() : [];
        if (padA.length) {
          const row = padA[0];
          if (row.ativo === false) return { ok: false, motivo: 'clínica fechada nesse dia' };
          const gradeDia = Array.isArray(row.horarios) ? row.horarios : [];
          if (gradeDia.length && !gradeDia.includes(hora)) return { ok: false, motivo: 'horário fora da grade do dia' };
        } else {
          const cfgR = await fetch(`${SUPABASE_URL}/rest/v1/agenda_config?clinic_id=eq.${clinic_id}&select=horarios&limit=1`, { headers: sbHeaders });
          const cfgA = cfgR.ok ? await cfgR.json() : [];
          const grade = (cfgA[0] && Array.isArray(cfgA[0].horarios)) ? cfgA[0].horarios : [];
          if (grade.length && !grade.includes(hora)) return { ok: false, motivo: 'horário fora da grade' };
        }
      }

      let ocupUrl = `${SUPABASE_URL}/rest/v1/consultas?clinic_id=eq.${clinic_id}&data=eq.${data}&hora=eq.${hora}&status=neq.cancelado&select=id,dentista_id,lead_id`;
      if (dentista_id) ocupUrl += `&dentista_id=eq.${dentista_id}`;
      const ocupR = await fetch(ocupUrl, { headers: sbHeaders });
      const ocupA = ocupR.ok ? await ocupR.json() : [];

      if (ocupA.length) {
        let consultaDoProprioLead = ocupA.find(c => c.lead_id === lead_id);
        if (!consultaDoProprioLead && telefonePaciente && ocupA.length) {
          const sufixoPac = String(telefonePaciente).replace(/\D/g, '').slice(-8);
          const idsLeadsOcupados = [...new Set(ocupA.map(c => c.lead_id).filter(Boolean))];
          if (sufixoPac && idsLeadsOcupados.length) {
            const leadsR = await fetch(
              `${SUPABASE_URL}/rest/v1/leads?id=in.(${idsLeadsOcupados.join(',')})&select=id,telefone`,
              { headers: sbHeaders }
            );
            const leadsA = leadsR.ok ? await leadsR.json() : [];
            const leadMesmoTelefone = leadsA.find(l => String(l.telefone || '').replace(/\D/g, '').slice(-8) === sufixoPac);
            if (leadMesmoTelefone) {
              const idOcupado = leadMesmoTelefone.id;
              consultaDoProprioLead = ocupA.find(c => c.lead_id === idOcupado);
            }
          }
        }

        if (consultaDoProprioLead) return { ok: true, jaAgendado: true, motivo: 'já agendado para este paciente' };
        return { ok: false, motivo: dentista_id ? 'dentista já ocupado nesse horário' : 'horário já ocupado' };
      }

      try {
        const hojeRemarca = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
        const antigasR = await fetch(
          `${SUPABASE_URL}/rest/v1/consultas?clinic_id=eq.${clinic_id}&lead_id=eq.${lead_id}&status=in.(agendado,confirmado)&data=gte.${hojeRemarca}&select=id,data,hora`,
          { headers: sbHeaders }
        );
        const antigas = antigasR.ok ? await antigasR.json() : [];
        for (const ant of antigas) {
          if (ant.data === data && ant.hora === hora) continue;
          await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=eq.${ant.id}`, {
            method: 'PATCH',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              status: 'cancelado',
              observacoes: `Remarcado pelo Brian IA (era ${ant.data} ${ant.hora})`,
            }),
          });
        }
      } catch (eRemarca) { }

      const nova = {
        clinic_id, lead_id, data, hora,
        status: 'agendado',
        procedimento: 'Avaliação',
        observacoes: 'Agendado automaticamente pelo Brian IA',
        created_at: new Date().toISOString(),
      };
      if (dentista_id) nova.dentista_id = dentista_id;
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/consultas`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(nova),
      });
      if (!ins.ok) return { ok: false, motivo: 'falha ao inserir: ' + (await ins.text()) };
      await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${lead_id}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'agendado' }),
      });
      return { ok: true };
    } catch (e) { return { ok: false, motivo: e.message }; }
  }

  async function brianIncrementarContador(clinic_id, phone) {
    try {
      const sufixo = String(phone).replace(/\D/g, '').slice(-8);
      const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&select=phone,msgs_contador,contador_data&limit=1`,
        { headers: sbHeaders }
      );
      const arr = r.ok ? await r.json() : [];
      const atual = arr[0];
      let novoTotal = 1;
      if (atual && atual.contador_data === hojeBRT) novoTotal = (atual.msgs_contador || 0) + 1;

      if (atual) {
        await fetch(`${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${clinic_id}&phone=eq.${encodeURIComponent(atual.phone)}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ msgs_contador: novoTotal, contador_data: hojeBRT }),
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/brian_conversa`, {
          method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ clinic_id, phone: String(phone).replace(/\D/g, ''), msgs_contador: 1, contador_data: hojeBRT }),
        });
      }
      return novoTotal;
    } catch (e) { return 0; }
  }

  async function brianEscalar(clinic_id, phone, nomeLead) {
    try {
      const sufixo = String(phone).replace(/\D/g, '').slice(-8);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixo}&select=phone&limit=1`, { headers: sbHeaders });
      const arr = r.ok ? await r.json() : [];
      if (arr[0]) {
        await fetch(`${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${clinic_id}&phone=eq.${encodeURIComponent(arr[0].phone)}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ escalado: true, escalado_em: new Date().toISOString() }),
        });
      }
    } catch (e) { }
  }

  async function brianEnviarCasos(instanceName, clinic_id, phone, procedimento) {
    try {
      if (!procedimento) return false;
      const proc = String(procedimento).trim();
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/brian_casos?clinic_id=eq.${clinic_id}&ativo=eq.true&procedimento=ilike.*${encodeURIComponent(proc)}*&select=imagem_url,legenda&order=ordem.asc&limit=2`,
        { headers: sbHeaders }
      );
      const casos = r.ok ? await r.json() : [];
      if (!casos.length) return false;

      const cleanPhone = String(phone).replace(/\D/g, '');
      const number = cleanPhone.length >= 12 ? cleanPhone : '55' + cleanPhone;

      // ⚠️ NOVO 06/08: roteamento Evolution vs API Oficial, mesmo padrão
      // já usado em responderPaciente — checa 1x só, reaproveita nos 2 envios.
      const clinicaInfo = await buscarCredenciaisOficial(clinic_id);
      const ehOficial = clinicaInfo?.tipo_conexao_whatsapp === 'oficial' && clinicaInfo.meta_phone_number_id && clinicaInfo.meta_access_token;

      let enviou = false;
      for (const caso of casos) {
        try {
          const legenda = caso.legenda || `✨ Olha esse resultado real de ${proc} que fizemos! 😍`;
          if (ehOficial) {
            await fetch(`https://graph.facebook.com/v21.0/${clinicaInfo.meta_phone_number_id}/messages`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${clinicaInfo.meta_access_token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ messaging_product: 'whatsapp', to: number, type: 'image', image: { link: caso.imagem_url, caption: legenda } }),
            });
          } else if (instanceName) {
            await fetch(`${EVO_URL}/message/sendMedia/${instanceName}`, {
              method: 'POST',
              headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                number, mediatype: 'image', mimetype: 'image/jpeg', media: caso.imagem_url, caption: legenda, fileName: 'caso.jpg',
              }),
            });
          } else {
            continue; // nem oficial nem instância Evolution — não tem como mandar
          }
          await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
            method: 'POST',
            headers: { ...sbHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({
              clinic_id, phone: number, contact_name: 'BRIAN_AUTO',
              content: legenda, type: 'image', from_me: true, media_url: caso.imagem_url, created_at: new Date().toISOString(),
            }),
          });
          enviou = true;
        } catch (e) { }
      }
      return enviou;
    } catch (e) { return false; }
  }

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
    } catch (e) { }
  }

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
      const convResp = await fetch(
        `${SUPABASE_URL}/rest/v1/brian_conversa?clinic_id=eq.${clinicId}&phone=ilike.*${sufixo}&select=escalado,auto_desligado&limit=1`,
        { headers: sbHeaders }
      );
      const convArr = convResp.ok ? await convResp.json() : [];
      const conv = convArr[0];
      if (conv && (conv.escalado === true || conv.auto_desligado === true)) return false;

      return true;
    } catch (e) { return false; }
  }

  // ⚠️ NOVO 06/08: equivalente da função acima, mas pra mídia que chega
  // pela API Oficial da Meta — o jeito de BAIXAR é diferente (Meta exige
  // 2 passos: pega uma URL temporária primeiro, depois baixa o arquivo
  // dessa URL), mas o jeito de SALVAR no Supabase Storage é o mesmo de
  // sempre, reaproveitado igual.
  async function baixarEsalvarMidiaMeta(mediaId, accessTokenMeta, phone, tipo, nomeOriginal) {
    try {
      // 1) pega a URL temporária + tipo real do arquivo
      const infoResp = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessTokenMeta}` },
      });
      if (!infoResp.ok) return null;
      const info = await infoResp.json();
      if (!info.url) return null;

      // 2) baixa o arquivo de verdade dessa URL (mesmo token de acesso)
      const fileResp = await fetch(info.url, { headers: { Authorization: `Bearer ${accessTokenMeta}` } });
      if (!fileResp.ok) return null;
      const arrayBuffer = await fileResp.arrayBuffer();
      const binary = Buffer.from(arrayBuffer);

      const config = {
        audio:    { bucket: 'audios', ext: 'ogg',  mime: 'audio/ogg' },
        image:    { bucket: 'midias', ext: 'jpg',  mime: 'image/jpeg' },
        video:    { bucket: 'midias', ext: 'mp4',  mime: 'video/mp4' },
        sticker:  { bucket: 'midias', ext: 'webp', mime: 'image/webp' },
        document: { bucket: 'midias', ext: 'bin',  mime: 'application/octet-stream' },
      };
      const cfg = config[tipo] || config.document;
      const mimeReal = info.mime_type || cfg.mime;

      let fileName;
      if (tipo === 'document' && nomeOriginal) {
        const limpo = String(nomeOriginal).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
        fileName = `doc_${phone}_${Date.now()}_${limpo}`;
      } else {
        fileName = `${tipo}_${phone}_${Date.now()}.${cfg.ext}`;
      }

      const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${cfg.bucket}/${fileName}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': mimeReal },
        body: binary,
      });
      if (!upload.ok) return null;
      return { url: `${SUPABASE_URL}/storage/v1/object/public/${cfg.bucket}/${fileName}`, binary };
    } catch (e) { return null; }
  }

  // ⚠️ NOVO 06/08: transcrição de áudio pra mídia vinda da Meta — mesma
  // lógica do Whisper já usada pro Evolution, só que reaproveita o binário
  // que a função de download acima já baixou (evita baixar 2x o mesmo
  // arquivo).
  async function transcreverAudioMetaWhisper(binary) {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY || !binary) return null;
    try {
      const blob = new Blob([binary], { type: 'audio/ogg' });
      const form = new FormData();
      form.append('file', blob, 'audio.ogg');
      form.append('model', 'whisper-1');
      form.append('response_format', 'verbose_json');
      form.append('language', 'pt');

      const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
        body: form,
      });
      if (!whisperResp.ok) return null;
      const whisperData = await whisperResp.json();
      const texto = (whisperData.text || '').trim();
      const segmentos = whisperData.segments || [];
      if (segmentos.length > 0) {
        const mediaNoSpeech = segmentos.reduce((s, seg) => s + (seg.no_speech_prob || 0), 0) / segmentos.length;
        if (mediaNoSpeech > 0.5) return null;
      }
      return texto || null;
    } catch (e) { return null; }
  }

  async function baixarEsalvarMidia(msgCompleta, instanceName, phone, tipo, nomeOriginal) {
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
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': cfg.mime },
        body: binary,
      });
      if (!upload.ok) return null;
      return `${SUPABASE_URL}/storage/v1/object/public/${cfg.bucket}/${fileName}`;
    } catch (e) { return null; }
  }

  async function gerarAudioTTS(texto, voz) {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY || !texto || !voz) return null;
    try {
      const resp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          voice: voz,
          input: texto,
          instructions: 'Fale em português do Brasil, de forma calorosa, gentil e natural — como uma pessoa brasileira simpática conversando por WhatsApp, nunca como um robô ou locutor formal. Ritmo tranquilo, tom acolhedor, com leve entonação emotiva quando o texto pedir (acolhimento, alegria).',
          response_format: 'mp3',
        }),
      });
      if (!resp.ok) return null;
      const buffer = await resp.arrayBuffer();
      return Buffer.from(buffer).toString('base64');
    } catch (e) { return null; }
  }

  // ⚠️ AJUSTE 06/08: agora recebe clinic_id e roteia Evolution vs API
  // Oficial. Também recebe a mediaUrl (já devia estar disponível, já que
  // o áudio é salvo no Storage de qualquer forma) — pra API Oficial,
  // enviar por LINK é o jeito padrão da Meta (mais simples que subir
  // base64 direto).
  async function enviarAudioWhatsApp(instanceName, clinic_id, phone, audioBase64, mediaUrl) {
    try {
      const cleanPhone = String(phone).replace(/\D/g, '');
      const number = cleanPhone.length >= 12 ? cleanPhone : '55' + cleanPhone;

      const clinicaInfo = await buscarCredenciaisOficial(clinic_id);
      if (clinicaInfo?.tipo_conexao_whatsapp === 'oficial' && clinicaInfo.meta_phone_number_id && clinicaInfo.meta_access_token) {
        if (!mediaUrl) return null; // API Oficial precisa de link, não manda base64 direto
        const resp = await fetch(`https://graph.facebook.com/v21.0/${clinicaInfo.meta_phone_number_id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${clinicaInfo.meta_access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: number, type: 'audio', audio: { link: mediaUrl } }),
        });
        return resp.ok ? await resp.json() : null;
      }

      if (!instanceName) return null;
      const resp = await fetch(`${EVO_URL}/message/sendWhatsAppAudio/${instanceName}`, {
        method: 'POST',
        headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, audio: audioBase64, encoding: true }),
      });
      return resp.ok ? await resp.json() : null;
    } catch (e) { return null; }
  }

  async function logDebug(clinicId, phone, evento, status, detalhes) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/brian_debug_log`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ clinic_id: clinicId, phone, evento, status, detalhes, created_at: new Date().toISOString() }),
      });
    } catch (e) { }
  }

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
      form.append('response_format', 'verbose_json');
      form.append('language', 'pt');

      const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
        body: form,
      });
      if (!whisperResp.ok) return null;
      const whisperData = await whisperResp.json();
      const texto = (whisperData.text || '').trim();

      const segmentos = whisperData.segments || [];
      if (segmentos.length > 0) {
        const mediaNoSpeech = segmentos.reduce((s, seg) => s + (seg.no_speech_prob || 0), 0) / segmentos.length;
        if (mediaNoSpeech > 0.5) return null;
      }
      return texto || null;
    } catch (e) { return null; }
  }

  // ⚠️ NOVO 06/08: essa função agora decide sozinha qual caminho usar —
  // Evolution (como sempre) ou API Oficial da Meta, olhando o
  // tipo_conexao_whatsapp da clínica. Isso conserta de uma vez o Brian E
  // qualquer resposta automática que passe por aqui (confirmação,
  // remarcação, etc.) pras clínicas já migradas — sem mexer em nada do
  // fluxo Evolution que já funciona pras outras.
  async function buscarCredenciaisOficial(clinicId) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?id=eq.${clinicId}&select=tipo_conexao_whatsapp,meta_phone_number_id,meta_access_token`,
        { headers: sbHeaders }
      );
      const arr = r.ok ? await r.json() : [];
      return arr[0] || null;
    } catch (e) { return null; }
  }

  async function responderPaciente(instanceName, clinicId, phone, message, marcador) {
    try {
      const cleanPhone = String(phone).replace(/\D/g, '');
      const number = cleanPhone.length >= 12 ? cleanPhone : '55' + cleanPhone;

      const clinicaInfo = await buscarCredenciaisOficial(clinicId);
      let sentId = null;

      if (clinicaInfo?.tipo_conexao_whatsapp === 'oficial' && clinicaInfo.meta_phone_number_id && clinicaInfo.meta_access_token) {
        // ── API OFICIAL DA META ──
        const r = await fetch(`https://graph.facebook.com/v21.0/${clinicaInfo.meta_phone_number_id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${clinicaInfo.meta_access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: number, type: 'text', text: { body: message } }),
        });
        const data = await r.json().catch(() => null);
        sentId = data?.messages?.[0]?.id || null;
        if (!r.ok) console.error('[META-SEND] falhou:', JSON.stringify(data));
      } else {
        // ── EVOLUTION (como sempre) ──
        const r = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number, text: message }),
        });
        const data = await r.json().catch(() => null);
        sentId = data?.key?.id || null;
      }

      await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          clinic_id: clinicId, phone: number, contact_name: marcador || null,
          content: message, type: 'text', from_me: true, media_url: null,
          message_id: sentId, created_at: new Date().toISOString(),
        }),
      });
    } catch (e) { }
  }

  // ⚠️ NOVO 06/08: extraído do fluxo Evolution pra função própria, reusável
  // pelos dois caminhos (Evolution E API Oficial da Meta) — antes só rodava
  // se tivesse "instanceName" (só Evolution), agora funciona pros dois
  // (pra API Oficial, instanceName vem null, e as funções de envio usadas
  // aqui dentro — responderPaciente, brianEnviarConfirmacao, brianEnviarCasos,
  // enviarAudioWhatsApp — já sabem decidir sozinhas o caminho certo, olhando
  // o clinic_id). Processa TODOS os marcadores do Brian: [[LEAD]], [[AGENDAR]],
  // [[CASOS]], [[PROC]], [[VOZ]] — não inclui mais [[SIMULAR]] (removido).
  async function processarMarcadoresBrian(clinic_id, phone, contact_name, content, type, textoResposta, instanceName) {
                  let campoLead = null;
                  let campoAgendar = null;

                  const mLead = String(textoResposta).match(/\[\[LEAD\|([^\]]+)\]\]/i);
                  if (mLead) {
                    try {
                      const campos = {};
                      mLead[1].split('|').forEach(par => {
                        const idx = par.indexOf('=');
                        if (idx > 0) campos[par.slice(0, idx).trim().toLowerCase()] = par.slice(idx + 1).trim();
                      });
                      campoLead = campos;
                    } catch (e) { }
                    textoResposta = String(textoResposta).replace(/\s*\[\[LEAD\|[^\]]+\]\]\s*/i, ' ').trim();
                  }

                  const mAgendar = String(textoResposta).match(/\[\[AGENDAR\|([^\]]+)\]\]/i);
                  if (mAgendar) {
                    try {
                      const campos = {};
                      mAgendar[1].split('|').forEach(par => {
                        const idx = par.indexOf('=');
                        if (idx > 0) campos[par.slice(0, idx).trim().toLowerCase()] = par.slice(idx + 1).trim();
                      });
                      campoAgendar = campos;
                    } catch (e) { }
                    textoResposta = String(textoResposta).replace(/\s*\[\[AGENDAR\|[^\]]+\]\]\s*/i, ' ').trim();
                  }

                  const _normNome = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                  if (contact_name && campoLead && campoLead.nome && _normNome(campoLead.nome) === _normNome(contact_name)) {
                    campoLead.nome = null;
                  }
                  if (contact_name && campoAgendar && campoAgendar.nome && _normNome(campoAgendar.nome) === _normNome(contact_name)) {
                    campoAgendar.nome = null;
                  }

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
                    } catch (e) { }
                    textoResposta = String(textoResposta).replace(/\s*\[\[CASOS\|[^\]]+\]\]\s*/i, ' ').trim();
                  }

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
                    } catch (e) { }
                    textoResposta = String(textoResposta).replace(/\s*\[\[PROC\|[^\]]+\]\]\s*/i, ' ').trim();
                  }

                  let temVoz = false;
                  if (/\[\[VOZ\]\]/i.test(String(textoResposta))) {
                    temVoz = true;
                    textoResposta = String(textoResposta).replace(/\s*\[\[VOZ\]\]\s*/i, ' ').trim();
                  }

                  if (!temVoz) {
                    const contentNorm = String(content || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    const palavrasMedo = ['medo', 'trauma', 'pavor', 'apavorad', 'traumatizad', 'com muito nervos'];
                    if (palavrasMedo.some(p => contentNorm.includes(p))) temVoz = true;
                  }

                  if (!temVoz && type === 'audio' && content && content.trim() !== '🎵 Áudio') {
                    temVoz = true;
                  }

                  await logDebug(clinic_id, phone, 'voz', temVoz ? 'sucesso' : 'pulado', temVoz ? 'Voz será usada nesta resposta' : 'Resposta em texto');
                  // ⚠️ REMOVIDO 06/08: recurso de simulação visual desativado
                  // por decisão do Jean — não executa mais a geração de
                  // imagem (o quadro que fazia isso foi removido por
                  // completo, mais abaixo). Continua só REMOVENDO o texto
                  // do marcador da mensagem, como rede de segurança — caso
                  // o Brian ainda mande [[SIMULAR|...]] por engano (o prompt
                  // dele, no painel do Supabase, também precisa ser
                  // atualizado à parte pra parar de instruir isso), o
                  // paciente nunca vê a sintaxe técnica crua na mensagem.
                  textoResposta = String(textoResposta).replace(/\s*\[\[SIMULAR\|tipo=[a-z_]+\]\]\s*/i, ' ').trim();

                  if (temVoz) {
                    try {
                      const sufixoOptOut = String(phone).replace(/\D/g, '').slice(-8);
                      const optOutResp = await fetch(
                        `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixoOptOut}&from_me=eq.false&select=content&order=created_at.desc&limit=20`,
                        { headers: sbHeaders }
                      );
                      const optOutArr = optOutResp.ok ? await optOutResp.json() : [];
                      const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                      const frasesOptOut = ['nao posso ouvir', 'nao consigo ouvir', 'prefiro texto', 'sem audio',
                        'nao gosto de audio', 'nao curto audio', 'manda por texto', 'so texto', 'sem voz', 'nao manda audio'];
                      const jaPediuTexto = optOutArr.some(m => frasesOptOut.some(f => normalizar(m.content).includes(f)));
                      if (jaPediuTexto) temVoz = false;
                    } catch (e) { }
                  }

                  let agendamentoConflito = false;
                  if (campoAgendar && campoAgendar.data && campoAgendar.hora) {
                    try {
                      const fmtBRcheck = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
                      const hojeISOcheck = fmtBRcheck.format(new Date());
                      const baseBRTcheck = new Date(`${hojeISOcheck}T12:00:00-03:00`);
                      const amanhaISOcheck = new Date(baseBRTcheck.getTime() + 24 * 3600 * 1000).toISOString().split('T')[0];

                      const sufixoCheck = String(phone).replace(/\D/g, '').slice(-8);
                      const janelaCheck = new Date(Date.now() - 30 * 60 * 1000).toISOString();
                      const histR = await fetch(
                        `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixoCheck}&created_at=gte.${encodeURIComponent(janelaCheck)}&select=content&order=created_at.desc&limit=6`,
                        { headers: sbHeaders }
                      );
                      const histA = histR.ok ? await histR.json() : [];
                      const textoRecente = (histA || []).map(m => String(m.content || '')).join(' ').toLowerCase();

                      const mencionaAmanha = /\bam[a-z]{1,4}h[ãa]/i.test(textoRecente);
                      const mencionaHoje = /\bhoje\b/.test(textoRecente);

                      if (mencionaAmanha && campoAgendar.data !== amanhaISOcheck) {
                        campoAgendar.data = amanhaISOcheck;
                      } else if (mencionaHoje && !mencionaAmanha && campoAgendar.data !== hojeISOcheck) {
                        campoAgendar.data = hojeISOcheck;
                      } else {
                        const semAcentoRecente = textoRecente.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        const DIAS_SEMANA_NOMES = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
                        const diasMencionados = [];
                        DIAS_SEMANA_NOMES.forEach((nome, idx) => {
                          if (new RegExp(`\\b${nome}\\b`, 'i').test(semAcentoRecente)) diasMencionados.push(idx);
                        });
                        if (diasMencionados.length === 1) {
                          const diaAlvo = diasMencionados[0];
                          const [ay, am, ad] = campoAgendar.data.split('-').map(Number);
                          const diaSemanaMarcador = new Date(ay, am - 1, ad).getDay();
                          if (diaSemanaMarcador !== diaAlvo) {
                            for (let i = 0; i <= 7; i++) {
                              const cand = new Date(baseBRTcheck.getTime() + i * 24 * 3600 * 1000);
                              const candISO = cand.toISOString().split('T')[0];
                              const [cy, cm, cd] = candISO.split('-').map(Number);
                              if (new Date(cy, cm - 1, cd).getDay() === diaAlvo) {
                                campoAgendar.data = candISO;
                                break;
                              }
                            }
                          }
                        }
                      }
                    } catch (e) { }

                    const lead = await brianAcharOuCriarLead(clinic_id, phone, campoAgendar.nome || (campoLead && campoLead.nome), undefined, undefined, true);
                    if (lead && lead.id) {
                      const dentistaId = await brianResolverDentista(clinic_id, campoAgendar.dentista || '');
                      const r = await brianCriarConsulta(clinic_id, lead.id, campoAgendar.data, campoAgendar.hora, dentistaId, phone);
                      if (r.ok && !r.jaAgendado) {
                        await brianEnviarConfirmacao(instanceName, clinic_id, phone, campoAgendar.nome || lead.nome, campoAgendar.data, campoAgendar.hora);
                      } else if (!r.ok) {
                        if (r.motivo === 'horário já ocupado' || r.motivo === 'dentista já ocupado nesse horário' || r.motivo === 'horário no passado') {
                          agendamentoConflito = true;
                        }
                      }
                    }
                  }

                  if (agendamentoConflito) {
                    await responderPaciente(instanceName, clinic_id, phone, 'Ihh, esse horário já está ocupado 😅 Mas me diz: qual outro dia ou período fica bom pra você? Aí já confirmo um horário certinho! 😊', 'BRIAN_AUTO');
                  } else if (textoResposta) {
                    let audioEnviadoComSucesso = false;

                    if (temVoz) {
                      try {
                        const vozCfgResp = await fetch(
                          `${SUPABASE_URL}/rest/v1/brian_config?clinic_id=eq.${clinic_id}&select=voz_tts&limit=1`,
                          { headers: sbHeaders }
                        );
                        const vozCfgArr = vozCfgResp.ok ? await vozCfgResp.json() : [];
                        const vozEscolhida = vozCfgArr[0]?.voz_tts;
                        if (vozEscolhida) {
                          const audioBase64 = await gerarAudioTTS(textoResposta, vozEscolhida);
                          if (audioBase64) {
                            // ⚠️ AJUSTE 06/08: sobe pro Storage ANTES de mandar (não depois) —
                            // a API Oficial da Meta precisa de um LINK público pra mandar
                            // áudio, não aceita base64 direto como o Evolution aceita.
                            let mediaUrlTts = null;
                            try {
                              const cleanPhoneVoz = String(phone).replace(/\D/g, '');
                              const numberVoz = cleanPhoneVoz.length >= 12 ? cleanPhoneVoz : '55' + cleanPhoneVoz;
                              const nomeArquivo = `tts_${numberVoz}_${Date.now()}.mp3`;
                              const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/audios/${nomeArquivo}`, {
                                method: 'POST',
                                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'audio/mpeg' },
                                body: Buffer.from(audioBase64, 'base64'),
                              });
                              mediaUrlTts = upload.ok ? `${SUPABASE_URL}/storage/v1/object/public/audios/${nomeArquivo}` : null;
                            } catch (e) { }

                            const envioOk = await enviarAudioWhatsApp(instanceName, clinic_id, phone, audioBase64, mediaUrlTts);
                            if (envioOk) {
                              audioEnviadoComSucesso = true;
                              try {
                                const cleanPhoneVoz = String(phone).replace(/\D/g, '');
                                const numberVoz = cleanPhoneVoz.length >= 12 ? cleanPhoneVoz : '55' + cleanPhoneVoz;
                                await fetch(`${SUPABASE_URL}/rest/v1/mensagens`, {
                                  method: 'POST',
                                  headers: { ...sbHeaders, Prefer: 'return=minimal' },
                                  body: JSON.stringify({
                                    clinic_id, phone: numberVoz, contact_name: 'BRIAN_AUTO',
                                    content: textoResposta, type: 'audio', from_me: true, media_url: mediaUrlTts,
                                    created_at: new Date().toISOString(),
                                  }),
                                });
                              } catch (e) { }
                            }
                          }
                        }
                      } catch (e) { }
                    }

                    if (!audioEnviadoComSucesso) {
                      await responderPaciente(instanceName, clinic_id, phone, textoResposta, 'BRIAN_AUTO');
                    }
                  }

                  // ⚠️ REMOVIDO 06/08 (decisão do Jean): bloco inteiro de
                  // execução da simulação visual (gerava imagem via IA e
                  // mandava pro paciente) — removido por completo daqui.

                  if (!campoAgendar) {
                    const nomeProvisorio = (campoLead && campoLead.nome) || contact_name || null;
                    await brianAcharOuCriarLead(clinic_id, phone, nomeProvisorio, undefined, undefined, !!(campoLead && campoLead.nome));
                  }

                  const totalDia = await brianIncrementarContador(clinic_id, phone);
                  const LIMITE = 12;
                  if (totalDia >= LIMITE) {
                    const nomeLead = (campoLead && campoLead.nome) || (campoAgendar && campoAgendar.nome) || '';
                    const primeiro = String(nomeLead).split(' ')[0] || '';
                    const aviso = `${primeiro ? primeiro + ', ' : ''}vou pedir pra um especialista da nossa equipe te dar uma atenção mais completa, tá? 😊 Em breve alguém continua seu atendimento por aqui!`;
                    await responderPaciente(instanceName, clinic_id, phone, aviso, 'BRIAN_AUTO');
                    await brianEscalar(clinic_id, phone, nomeLead);
                  }

                  if (procCasos) {
                    await brianEnviarCasos(instanceName, clinic_id, phone, procCasos);
                  }

                  if (procInteresseConversa) {
                    try {
                      await brianAcharOuCriarLead(clinic_id, phone, (campoLead && campoLead.nome) || null, 'WhatsApp', procInteresseConversa, true);
                    } catch (e) { }
                  }

                  if (!campoAgendar && campoLead && campoLead.nome) {
                    await brianAcharOuCriarLead(clinic_id, phone, campoLead.nome, undefined, undefined, true);
                  }
  }

  async function processarConfirmacao(clinic_id, phone, content, instanceName) {
    try {
      if (!clinic_id || !phone || !content) return;
      const resp = String(content).trim().toLowerCase();
      const semAcento = resp.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const semPont = semAcento.replace(/[!.,;:)\s]+$/g, '').replace(/^[\s(]+/g, '');

      const listaConfirmar = ['1', '1️⃣', 'sim', 'confirmar', 'confirmo', 'confirmado', 'confirmada', 'ok', 'okay', 'okk', 'pode ser', 'vou', 'vou sim', 'estarei', 'estarei la', 'isso', 'isso mesmo', 'claro', 'com certeza', 'certo', 'positivo', 'beleza', 'blz', 'show', 'ss', 'sss'].includes(semPont);
      const confirmaRegex = /^(s+i+m+|si+n|s+i+|ss+i+m+|s)$/.test(semPont.replace(/\s+/g, ''));
      const ehConfirmar = listaConfirmar || confirmaRegex;

      const raizesCancelar = ['cancel', 'desmarc', 'desist'];
      let ehCancelar = raizesCancelar.some(r => semAcento.includes(r));
      if (!ehCancelar) {
        const temNegacao = /\bn[ao]o?\b|\bnaum\b|\bnem\b/.test(semAcento);
        const temIntencaoIr = /(vou|vai|quero|posso|consigo|da|dar|tenho como|poderei|poder)\b.*\b(mais|ir|comparecer)|(\bmais\b)|(\bir\b)|(comparecer)/.test(semAcento)
          || /(vou|vai|quero|posso|consigo|tenho|poderei)/.test(semAcento);
        if (temNegacao && temIntencaoIr && semAcento.length <= 90) ehCancelar = true;
      }
      const ehConfirmarFinal = ehConfirmar && !ehCancelar;

      const ehRemarcar = ['2', '2️⃣', 'nao', 'não', 'remarcar', 'reagendar', 'nao posso', 'não posso', 'nao vou', 'não vou'].includes(resp)
        || /remarc|reagend|outro dia|outro horario|outra data|mudar.*dia|mudar.*horario/.test(semAcento);
      const digitos = String(phone).replace(/\D/g, '');
      const sufixo = digitos.slice(-8);
      if (sufixo.length < 8) return;

      const leadResp = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?clinic_id=eq.${clinic_id}&telefone=ilike.*${sufixo}&select=id,nome`,
        { headers: sbHeaders }
      );
      if (!leadResp.ok) return;
      const leadsEnc = await leadResp.json();
      if (!leadsEnc.length) return;
      const leadIds = leadsEnc.map(l => l.id);
      const lead = leadsEnc[0];
      const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
      const amanhaBRT = new Date(Date.now() - 3 * 3600 * 1000 + 24 * 3600 * 1000).toISOString().split('T')[0];

      const leadIdsFiltro = leadIds.map(id => `"${id}"`).join(',');
      const consResp = await fetch(
        `${SUPABASE_URL}/rest/v1/consultas?lead_id=in.(${leadIdsFiltro})&clinic_id=eq.${clinic_id}&status=in.(agendado,confirmado)&data=in.(${hojeBRT},${amanhaBRT})&select=id,data,hora,lembrete_24h,status,lead_id&limit=10`,
        { headers: sbHeaders }
      );
      if (!consResp.ok) return;
      const consultasEnc = await consResp.json();
      if (!consultasEnc.length) return;

      const comLembrete = consultasEnc.filter(c => c.lembrete_24h);
      let consulta;
      if (comLembrete.length) {
        comLembrete.sort((a, b) => new Date(b.lembrete_24h) - new Date(a.lembrete_24h));
        consulta = comLembrete[0];
      } else {
        consultasEnc.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
        consulta = consultasEnc[0];
      }

      function dataHoraNoFuturo(c) {
        if (!c || !c.data) return false;
        const horaC = (c.hora || '00:00').slice(0, 5);
        const dtConsulta = new Date(`${c.data}T${horaC}:00-03:00`);
        if (isNaN(dtConsulta)) return false;
        return dtConsulta.getTime() > (Date.now() - 15 * 60 * 1000);
      }
      if (!dataHoraNoFuturo(consulta)) {
        const futuras = consultasEnc
          .filter(dataHoraNoFuturo)
          .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
        if (futuras.length) {
          consulta = futuras[0];
        } else {
          return;
        }
      }

      const respCurta = resp.length <= 25;
      if (!respCurta) return;

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
      } catch (e) { }

      if (!houveLembreteRecente) return;

      if (!consulta || !consulta.data) return;
      const [ano, mes, dia] = String(consulta.data).split('-');
      const dataFmt = `${dia}/${mes}`;
      const horaFmt = (consulta.hora || '').slice(0, 5);
      const primeiroNome = ((lead && lead.nome) || '').split(' ')[0] || '';
      if (ehConfirmarFinal) {
        if (consulta.status === 'confirmado') return;
        await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=eq.${consulta.id}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'confirmado' }),
        });
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
    } catch (e) { }
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Body inválido' }); }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body vazio' });

  try {
    if (body?.object !== 'whatsapp_business_account') {
      const rawEvento = body?.event || body?.type || '';
      const evento = rawEvento.toLowerCase().replace('.', '_');
      if (evento !== 'messages_upsert') return res.status(200).json({ ok: true, ignorado: rawEvento });
    }

    const instanceName = body?.instance || body?.instanceName || null;
    let clinic_id = null;
    if (instanceName) {
      const clinicResp = await fetch(
        `${SUPABASE_URL}/rest/v1/clinicas?whatsapp_instance=eq.${encodeURIComponent(instanceName)}&select=id&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (clinicResp.ok) {
        const clinics = await clinicResp.json();
        if (clinics?.length > 0) clinic_id = clinics[0].id;
      }
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

    if (instanceName && !clinic_id) {
      return res.status(200).json({ ok: true, ignorado: 'instancia_nao_cadastrada', instance: instanceName });
    }

    for (const msg of list) {
      try {
        const key = msg?.key || {};
        const jid = key?.remoteJid || '';
        const fromMe = key?.fromMe ?? false;
        if (!jid || jid.includes('status@broadcast') || jid.includes('@g.us')) continue;
        const phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');

        if (!fromMe && clinic_id) {
          let deveBloquear = false;
          try {
            const cfgPermResp = await fetch(
              `${SUPABASE_URL}/rest/v1/brian_config?clinic_id=eq.${clinic_id}&select=telefones_permitidos&limit=1`,
              { headers: sbHeaders }
            );
            const cfgPermArr = cfgPermResp.ok ? await cfgPermResp.json() : [];
            const listaPermitida = cfgPermArr[0]?.telefones_permitidos;
            if (Array.isArray(listaPermitida) && listaPermitida.length > 0) {
              const sufixoMsg = phone.replace(/\D/g, '').slice(-8);
              const permitido = listaPermitida.some(p => String(p).replace(/\D/g, '').slice(-8) === sufixoMsg);
              if (!permitido) deveBloquear = true;
            }
          } catch (e) { }
          if (deveBloquear) continue;
        }

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
        let transcricaoFalhou = false;
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
          const valiaAPenaTranscrever = await deveTentarTranscrever(clinic_id, phone, fromMe);
          if (valiaAPenaTranscrever) {
            const transcricao = await transcreverAudioWhisper(msg, instanceName);
            if (transcricao) {
              content = transcricao;
              await logDebug(clinic_id, phone, 'transcricao', 'sucesso', transcricao.slice(0, 200));
            } else {
              transcricaoFalhou = true;
              await logDebug(clinic_id, phone, 'transcricao', 'falhou', 'Whisper não retornou texto');
            }
          } else {
            await logDebug(clinic_id, phone, 'transcricao', 'pulado', 'Fora do escopo do Brian');
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

        if (fromMe && content && content.trim()) {
          try {
            const sufEco = phone.replace(/\D/g, '').slice(-8);
            const desdeEco = new Date(Date.now() - 60 * 1000).toISOString();
            const ecoResp = await fetch(
              `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufEco}&from_me=eq.true&created_at=gte.${desdeEco}&select=id,content&limit=10`,
              { headers: sbHeaders }
            );
            if (ecoResp.ok) {
              const jaTem = await ecoResp.json();
              const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
              if ((jaTem || []).some(x => norm(x.content) === norm(content))) {
                insertados.push(phone);
                continue;
              }
            }
          } catch (e) { }
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

        if (fromMe) {
          try {
            await marcarLeadEmAtendimento(clinic_id, phone);
          } catch (e) { }
        }

        if (!fromMe) {
          try {
            const procDaMsg = (type === 'text' || (type === 'audio' && content && content.trim() !== '🎵 Áudio')) ? extrairProcedimentoDaMsg(content) : null;
            await brianAcharOuCriarLead(clinic_id, phone, contact_name || null, 'WhatsApp', procDaMsg, false);
          } catch (e) { }
        }

        const ehTextoUtilizavel = type === 'text' || (type === 'audio' && content && content.trim() !== '🎵 Áudio');

        if (!fromMe && transcricaoFalhou && instanceName) {
          try {
            await responderPaciente(instanceName, clinic_id, phone,
              'Oii! Não consegui entender esse áudio direito 😅 pode tentar gravar de novo, ou me escrever? Assim eu te ajudo certinho!',
              'BRIAN_AUTO');
          } catch (e) { }
        }

        if (!fromMe && ehTextoUtilizavel) {
          try {
            const decisao = await brianDecide(clinic_id, phone, content, instanceName, fromMe, false);
            await logDebug(clinic_id, phone, 'decisao_resposta', decisao.responder ? 'sucesso' : 'pulado', decisao.razao);

            if (decisao.responder) {
              const NUMEROS_TESTE = [];
              const sufixoMsg = String(phone).replace(/\D/g, '').slice(-8);
              const modoTeste = NUMEROS_TESTE.length > 0;
              const liberadoTeste = !modoTeste || NUMEROS_TESTE.includes(sufixoMsg);

              if (liberadoTeste) {
                const DEBOUNCE_MS = 10000;
                const meuCreatedAt = created_at;
                await new Promise((r) => setTimeout(r, DEBOUNCE_MS));

                try {
                  const sufixoDeb = String(phone).replace(/\D/g, '').slice(-8);
                  const chkResp = await fetch(
                    `${SUPABASE_URL}/rest/v1/mensagens?clinic_id=eq.${clinic_id}&phone=ilike.*${sufixoDeb}&from_me=eq.false&created_at=gt.${encodeURIComponent(meuCreatedAt)}&select=id&limit=1`,
                    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
                  );
                  const maisNovas = chkResp.ok ? await chkResp.json() : [];
                  if (maisNovas.length) continue;
                } catch (e) { }

                let respBrian = await fetch(`${SUPABASE_URL}/functions/v1/brian`, {
                  method: 'POST',
                  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'responder_auto', clinic_id, phone, ultima_msg: content }),
                });
                let dataBrian = respBrian.ok ? await respBrian.json() : null;

                if (!dataBrian || !dataBrian.ok) {
                  await new Promise(r => setTimeout(r, 2000));
                  try {
                    respBrian = await fetch(`${SUPABASE_URL}/functions/v1/brian`, {
                      method: 'POST',
                      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'responder_auto', clinic_id, phone, ultima_msg: content }),
                    });
                    dataBrian = respBrian.ok ? await respBrian.json() : null;
                  } catch (e) { }
                }

                let textoResposta = dataBrian && dataBrian.ok ? dataBrian.sugestao : null;

                if (textoResposta) {
                  await processarMarcadoresBrian(clinic_id, phone, contact_name, content, type, textoResposta, instanceName);
                }
              }
            }
          } catch (e) { }
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
