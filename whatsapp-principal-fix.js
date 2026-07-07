// ============================================================
// CLINICALEAD — Ferramentas de admin: número PRINCIPAL × EXTRAS
// Resolve estruturalmente o problema "conectou número novo como
// extra e o principal ficou desatualizado" (caso José Bonifácio).
//
// Depois de carregado, no console (F12) o admin tem:
//   tornarPrincipal('nome_da_instancia')  → promove um extra a
//     principal com swap atômico: valida na Evolution, garante o
//     webhook, rebaixa o principal antigo pra extra e limpa duplicatas.
//   auditarWhatsApps() → raio-X de TODAS as clínicas: banco ×
//     Evolution × extras × webhook, apontando mortos/órfãos.
//
// Carregar no index.html como os demais fixes (por último).
// ============================================================
(function () {
  'use strict';

  const EVO_URL = 'https://evolution-api-production-62cb.up.railway.app';
  const EVO_KEY = '185aff001ce6bb5b9cadec59294ead845c35217a1688d5d77f58a668d98ae000';
  const WEBHOOK_URL = 'https://clinicalead.vercel.app/api/webhook';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || null); }

  async function evoGet(path) {
    const r = await fetch(EVO_URL + path, { headers: { apikey: EVO_KEY } });
    return { ok: r.ok, status: r.status, data: r.ok ? await r.json() : await r.text() };
  }
  async function evoPost(path, body) {
    const r = await fetch(EVO_URL + path, {
      method: 'POST', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, status: r.status, data: await r.text() };
  }

  // lista todas as instâncias da Evolution num mapa nome -> {estado, numero}
  async function mapaEvolution() {
    const { ok, data } = await evoGet('/instance/fetchInstances');
    const mapa = {};
    (ok && Array.isArray(data) ? data : []).forEach(i => {
      const n = i.name || (i.instance && i.instance.instanceName) || i.instanceName || '';
      if (!n) return;
      mapa[n] = {
        estado: i.connectionStatus || (i.instance && i.instance.state) || i.state || '?',
        numero: String(i.ownerJid || (i.instance && i.instance.owner) || '').replace('@s.whatsapp.net', ''),
      };
    });
    return mapa;
  }

  // garante que a instância tem webhook (replica a config de uma que funciona, ou usa padrão)
  async function garantirWebhook(instanceName) {
    const atual = await evoGet('/webhook/find/' + instanceName);
    const urlAtual = atual.ok && atual.data && (atual.data.url || (atual.data.webhook && atual.data.webhook.url));
    if (urlAtual) return { ok: true, ja: true, url: urlAtual };
    // registra o webhook padrão (tenta os 2 formatos da Evolution v2)
    const cfg = { enabled: true, url: WEBHOOK_URL, webhookByEvents: false, events: ['MESSAGES_UPSERT'] };
    let r = await evoPost('/webhook/set/' + instanceName, { webhook: cfg });
    if (!r.ok) r = await evoPost('/webhook/set/' + instanceName, cfg);
    return { ok: r.ok, ja: false, resposta: String(r.data).slice(0, 120) };
  }

  // ── PROMOVE um número extra a PRINCIPAL (swap atômico e seguro) ──
  window.tornarPrincipal = async function (instanceName) {
    const _db = getDb();
    if (!_db) { console.log('❌ db indisponível'); return; }
    if (!instanceName) { console.log('uso: tornarPrincipal("nome_da_instancia")'); return; }
    console.log('═══ PROMOVENDO A PRINCIPAL:', instanceName, '═══');

    // 1) a instância existe e está conectada na Evolution?
    const mapa = await mapaEvolution();
    const alvo = mapa[instanceName];
    if (!alvo) { console.log('❌ Instância NÃO existe na Evolution. Nada foi alterado.'); return; }
    console.log('1) Evolution:', alvo.estado, '| número:', alvo.numero || '(nenhum)');
    if (alvo.estado !== 'open') {
      console.log('⚠️ Instância não está "open" (conectada). Conecte o número antes de promover. Nada foi alterado.');
      return;
    }

    // 2) a qual clínica ela pertence? (procura nos extras; senão, pergunta)
    let clinicId = null;
    const { data: ext } = await _db.from('instancias').select('clinic_id').eq('instance_name', instanceName).limit(1);
    if (ext && ext.length) clinicId = ext[0].clinic_id;
    if (!clinicId) {
      const { data: cls } = await _db.from('clinicas').select('id, nome').order('nome');
      console.log('Instância não está nos extras. Clínicas:');
      (cls || []).forEach((c, i) => console.log(`  [${i}] ${c.nome}`));
      const idx = prompt('Digite o NÚMERO da clínica dona deste WhatsApp:');
      const c = (cls || [])[parseInt(idx, 10)];
      if (!c) { console.log('❌ clínica inválida. Nada foi alterado.'); return; }
      clinicId = c.id;
    }
    const { data: clArr } = await _db.from('clinicas').select('id, nome, whatsapp_instance').eq('id', clinicId).limit(1);
    const clinica = (clArr || [])[0];
    if (!clinica) { console.log('❌ clínica não encontrada. Nada foi alterado.'); return; }
    console.log('2) Clínica:', clinica.nome, '| principal atual:', clinica.whatsapp_instance || '(nenhum)');
    if (clinica.whatsapp_instance === instanceName) { console.log('✓ Já é a principal. Nada a fazer.'); return; }

    // 3) garante o webhook na nova principal
    const wh = await garantirWebhook(instanceName);
    console.log('3) Webhook:', wh.ja ? '✓ já tinha' : (wh.ok ? '✅ registrado agora' : '❌ falhou: ' + wh.resposta));
    if (!wh.ja && !wh.ok) { console.log('❌ Sem webhook as conversas não entram no CRM. Nada foi alterado.'); return; }

    // 4) rebaixa o principal antigo pra EXTRA (se existir e estiver vivo na Evolution)
    const antigo = clinica.whatsapp_instance;
    if (antigo) {
      if (mapa[antigo]) {
        const { data: jaExtra } = await _db.from('instancias').select('id').eq('instance_name', antigo).limit(1);
        if (!jaExtra || !jaExtra.length) {
          const nomeEx = prompt(`Nome de exibição pro número antigo (${antigo})? Ex: Lavínia`) || 'Secundário';
          const { error: eIns } = await _db.from('instancias').insert({
            clinic_id: clinicId, instance_name: antigo, nome_exibicao: nomeEx, tipo: 'geral', conectado: mapa[antigo].estado === 'open',
          });
          console.log('4) Antigo principal → extra:', eIns ? '❌ ' + eIns.message : `✅ "${nomeEx}" cadastrado como secundário`);
        } else {
          console.log('4) Antigo principal já estava nos extras ✓');
        }
      } else {
        console.log('4) Antigo principal não existe mais na Evolution → não vira extra (morto)');
      }
    }

    // 5) aponta o PRINCIPAL da clínica pra nova instância
    const { error: eUp } = await _db.from('clinicas').update({ whatsapp_instance: instanceName }).eq('id', clinicId);
    if (eUp) { console.log('❌ erro ao atualizar principal:', eUp.message); return; }
    console.log('5) ✅ PRINCIPAL atualizado!');

    // 6) remove a nova principal da tabela de extras (não pode estar nos dois)
    await _db.from('instancias').delete().eq('clinic_id', clinicId).eq('instance_name', instanceName);
    console.log('6) Limpeza de duplicata nos extras ✓');

    // resumo
    const { data: fim } = await _db.from('instancias').select('instance_name, nome_exibicao').eq('clinic_id', clinicId);
    console.log('\n═══ COMO FICOU (' + clinica.nome + ') ═══');
    console.log('👑 PRINCIPAL:', instanceName, '(' + (alvo.numero || '?') + ')');
    console.log('2️⃣ EXTRAS:', (fim || []).map(s => `${s.instance_name} (${s.nome_exibicao})`).join(', ') || '(nenhum)');
    console.log('\n→ Teste: envia pelo CRM (deve sair do número novo) e manda uma msg de fora (deve entrar no CRM).');
  };

  // ── AUDITORIA GERAL: banco × Evolution × extras × webhook ──
  window.auditarWhatsApps = async function () {
    const _db = getDb();
    if (!_db) { console.log('❌ db indisponível'); return; }
    console.log('═══ AUDITORIA GERAL DOS WHATSAPPS ═══');
    const mapa = await mapaEvolution();
    const { data: clinicas } = await _db.from('clinicas').select('id, nome, whatsapp_instance').order('nome');
    const { data: extras } = await _db.from('instancias').select('clinic_id, instance_name, nome_exibicao');
    const usadas = new Set();

    for (const c of clinicas || []) {
      console.log('\n📋 ' + c.nome);
      // principal
      if (c.whatsapp_instance) {
        usadas.add(c.whatsapp_instance);
        const info = mapa[c.whatsapp_instance];
        let wh = '❌ sem webhook';
        try {
          const w = await evoGet('/webhook/find/' + c.whatsapp_instance);
          if (w.ok && w.data && (w.data.url || (w.data.webhook && w.data.webhook.url))) wh = '✓ webhook';
        } catch (e) {}
        console.log(`  👑 principal: ${c.whatsapp_instance}`);
        console.log(`     ${info ? `${info.estado === 'open' ? '🟢 open' : '🔴 ' + info.estado} | ${info.numero || '(sem número)'}` : '👻 MORTA (não existe na Evolution!)'} | ${wh}`);
      } else {
        console.log('  👑 principal: (nenhum configurado)');
      }
      // extras da clínica
      const ex = (extras || []).filter(e => e.clinic_id === c.id);
      for (const e of ex) {
        usadas.add(e.instance_name);
        const info = mapa[e.instance_name];
        console.log(`  2️⃣ extra "${e.nome_exibicao}": ${e.instance_name}`);
        console.log(`     ${info ? `${info.estado === 'open' ? '🟢 open' : '🔴 ' + info.estado} | ${info.numero || '(sem número)'}` : '👻 REGISTRO MORTO (limpar da tabela instancias!)'}`);
      }
      if (!ex.length) console.log('  2️⃣ extras: (nenhum)');
    }

    // órfãs: existem na Evolution mas nem principal nem extra de ninguém
    const orfas = Object.keys(mapa).filter(n => !usadas.has(n));
    console.log('\n👻 ÓRFÃS na Evolution (nenhuma clínica usa):');
    orfas.forEach(n => console.log(`  ⚠️ ${n} | ${mapa[n].estado} | ${mapa[n].numero || '(sem número)'}`));
    if (!orfas.length) console.log('  (nenhuma) ✅');
    console.log('\nDica: pra promover um extra → tornarPrincipal("nome_da_instancia")');
  };

  console.log('✅ whatsapp-principal-fix.js carregado — comandos: tornarPrincipal("instancia") | auditarWhatsApps()');
})();
