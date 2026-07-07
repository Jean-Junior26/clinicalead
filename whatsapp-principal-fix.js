// ============================================================
// CLINICALEAD — Gestão de WhatsApps (PRINCIPAL × EXTRAS) — ADMIN
// Resolve estruturalmente o caso "conectou número novo como extra
// e o principal ficou desatualizado" (caso José Bonifácio).
//
// UI: botão flutuante "📱 WhatsApps" (canto inferior esquerdo),
// visível SÓ pro admin. Abre um painel com todas as clínicas:
// principal, extras, estado na Evolution, webhook, e ações:
//   ⭐ Tornar principal (swap atômico e seguro)
//   🧹 Limpar registro morto
// Console: tornarPrincipal('instancia') e auditarWhatsApps()
// continuam disponíveis.
// ============================================================
(function () {
  'use strict';

  const EVO_URL = 'https://evolution-api-production-62cb.up.railway.app';
  const EVO_KEY = '185aff001ce6bb5b9cadec59294ead845c35217a1688d5d77f58a668d98ae000';
  const WEBHOOK_URL = 'https://clinicalead.vercel.app/api/webhook';
  const ADMIN_EMAIL = 'jeanjunior.digital@gmail.com';

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

  async function temWebhook(instanceName) {
    try {
      const w = await evoGet('/webhook/find/' + instanceName);
      return !!(w.ok && w.data && (w.data.url || (w.data.webhook && w.data.webhook.url)));
    } catch (e) { return false; }
  }

  async function garantirWebhook(instanceName) {
    if (await temWebhook(instanceName)) return { ok: true, ja: true };
    const cfg = { enabled: true, url: WEBHOOK_URL, webhookByEvents: false, events: ['MESSAGES_UPSERT'] };
    let r = await evoPost('/webhook/set/' + instanceName, { webhook: cfg });
    if (!r.ok) r = await evoPost('/webhook/set/' + instanceName, cfg);
    return { ok: r.ok, ja: false, resposta: String(r.data).slice(0, 120) };
  }

  // ── PROMOVE um número a PRINCIPAL (swap atômico e seguro) ──
  window.tornarPrincipal = async function (instanceName, clinicIdOpcional) {
    const _db = getDb();
    if (!_db) { alert('db indisponível'); return false; }
    const mapa = await mapaEvolution();
    const alvo = mapa[instanceName];
    if (!alvo) { alert('Instância não existe na Evolution. Nada foi alterado.'); return false; }
    if (alvo.estado !== 'open') { alert('Instância não está conectada (open). Conecte o número antes. Nada foi alterado.'); return false; }

    // clínica dona
    let clinicId = clinicIdOpcional || null;
    if (!clinicId) {
      const { data: ext } = await _db.from('instancias').select('clinic_id').eq('instance_name', instanceName).limit(1);
      if (ext && ext.length) clinicId = ext[0].clinic_id;
    }
    if (!clinicId) { alert('Não achei a clínica dona desta instância.'); return false; }
    const { data: clArr } = await _db.from('clinicas').select('id, nome, whatsapp_instance').eq('id', clinicId).limit(1);
    const clinica = (clArr || [])[0];
    if (!clinica) { alert('Clínica não encontrada.'); return false; }
    if (clinica.whatsapp_instance === instanceName) { alert('Já é a principal.'); return true; }

    if (!confirm(`Tornar "${instanceName}" (${alvo.numero}) o número PRINCIPAL de ${clinica.nome}?`)) return false;

    // webhook garantido
    const wh = await garantirWebhook(instanceName);
    if (!wh.ja && !wh.ok) { alert('Falhou ao registrar o webhook — sem ele as conversas não entram no CRM. Nada foi alterado.'); return false; }

    // rebaixa o principal antigo pra extra (se vivo)
    const antigo = clinica.whatsapp_instance;
    if (antigo && mapa[antigo]) {
      const { data: jaExtra } = await _db.from('instancias').select('id').eq('instance_name', antigo).limit(1);
      if (!jaExtra || !jaExtra.length) {
        const nomeEx = prompt(`Nome de exibição pro número antigo (${mapa[antigo].numero})? Ex: Lavínia`) || 'Secundário';
        await _db.from('instancias').insert({
          clinic_id: clinicId, instance_name: antigo, nome_exibicao: nomeEx, tipo: 'geral', conectado: mapa[antigo].estado === 'open',
        });
      }
    }

    // aponta o principal + limpa duplicata dos extras
    const { error: eUp } = await _db.from('clinicas').update({ whatsapp_instance: instanceName }).eq('id', clinicId);
    if (eUp) { alert('Erro ao atualizar principal: ' + eUp.message); return false; }
    await _db.from('instancias').delete().eq('clinic_id', clinicId).eq('instance_name', instanceName);
    return true;
  };

  // ── remove registro morto da tabela instancias ──
  async function limparRegistroMorto(instanceName, clinicId) {
    const _db = getDb();
    if (!confirm(`Remover o registro morto "${instanceName}" da tabela de extras?`)) return false;
    const { error } = await _db.from('instancias').delete().eq('clinic_id', clinicId).eq('instance_name', instanceName);
    if (error) { alert('Erro: ' + error.message); return false; }
    return true;
  }
  window.__wpLimparMorto = limparRegistroMorto;

  // ── coleta os dados da auditoria (usado pela UI e pelo console) ──
  async function coletarAuditoria() {
    const _db = getDb();
    const mapa = await mapaEvolution();
    const { data: clinicas } = await _db.from('clinicas').select('id, nome, whatsapp_instance').order('nome');
    const { data: extras } = await _db.from('instancias').select('clinic_id, instance_name, nome_exibicao');
    const usadas = new Set();
    const out = [];
    for (const c of clinicas || []) {
      const item = { id: c.id, nome: c.nome, principal: null, extras: [] };
      if (c.whatsapp_instance) {
        usadas.add(c.whatsapp_instance);
        const info = mapa[c.whatsapp_instance] || null;
        item.principal = {
          instancia: c.whatsapp_instance,
          existe: !!info,
          estado: info ? info.estado : 'morta',
          numero: info ? info.numero : '',
          webhook: info ? await temWebhook(c.whatsapp_instance) : false,
        };
      }
      const ex = (extras || []).filter(e => e.clinic_id === c.id);
      for (const e of ex) {
        usadas.add(e.instance_name);
        const info = mapa[e.instance_name] || null;
        item.extras.push({
          instancia: e.instance_name, nome: e.nome_exibicao,
          existe: !!info, estado: info ? info.estado : 'morta', numero: info ? info.numero : '',
        });
      }
      out.push(item);
    }
    const orfas = Object.keys(mapa).filter(n => !usadas.has(n))
      .map(n => ({ instancia: n, estado: mapa[n].estado, numero: mapa[n].numero }));
    return { clinicas: out, orfas };
  }

  // ── console: auditoria em texto ──
  window.auditarWhatsApps = async function () {
    const a = await coletarAuditoria();
    console.log('═══ AUDITORIA GERAL DOS WHATSAPPS ═══');
    a.clinicas.forEach(c => {
      console.log('\n📋 ' + c.nome);
      if (c.principal) {
        const p = c.principal;
        console.log(`  👑 principal: ${p.instancia}`);
        console.log(`     ${p.existe ? (p.estado === 'open' ? '🟢 open' : '🔴 ' + p.estado) + ' | ' + (p.numero || '(sem número)') : '👻 MORTA'} | ${p.webhook ? '✓ webhook' : '❌ sem webhook'}`);
      } else console.log('  👑 principal: (nenhum)');
      c.extras.forEach(e => {
        console.log(`  2️⃣ extra "${e.nome}": ${e.instancia}`);
        console.log(`     ${e.existe ? (e.estado === 'open' ? '🟢 open' : '🔴 ' + e.estado) + ' | ' + (e.numero || '') : '👻 REGISTRO MORTO'}`);
      });
    });
    console.log('\n👻 ÓRFÃS:', a.orfas.length ? '' : '(nenhuma) ✅');
    a.orfas.forEach(o => console.log(`  ⚠️ ${o.instancia} | ${o.estado} | ${o.numero || ''}`));
  };

  // ══════════════════ UI (só admin) ══════════════════
  function esc(s) { return String(s || '').replace(/</g, '&lt;'); }

  async function renderPainel() {
    const body = document.getElementById('wpPainelBody');
    if (!body) return;
    body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);">⏳ Carregando auditoria...</div>';
    const a = await coletarAuditoria();
    let h = '';
    for (const c of a.clinicas) {
      h += `<div style="border:1px solid var(--border,#333);border-radius:12px;padding:14px;margin-bottom:12px;">`;
      h += `<div style="font-weight:700;margin-bottom:8px;">📋 ${esc(c.nome)}</div>`;
      if (c.principal) {
        const p = c.principal;
        const st = !p.existe ? '👻 MORTA (não existe na Evolution!)' : (p.estado === 'open' ? '🟢 conectado' : '🔴 ' + esc(p.estado));
        h += `<div style="font-size:13px;padding:8px;background:rgba(201,168,76,0.08);border-radius:8px;margin-bottom:6px;">
          👑 <b>Principal:</b> ${esc(p.numero) || '—'} <span style="color:var(--text-muted);font-size:11px;">(${esc(p.instancia)})</span><br>
          <span style="font-size:12px;">${st} · ${p.webhook ? '✓ webhook' : '❌ sem webhook'}</span></div>`;
      } else {
        h += `<div style="font-size:13px;color:var(--text-muted);margin-bottom:6px;">👑 Principal: (nenhum configurado)</div>`;
      }
      for (const e of c.extras) {
        const st = !e.existe ? '👻 registro morto' : (e.estado === 'open' ? '🟢 conectado' : '🔴 ' + esc(e.estado));
        h += `<div style="font-size:13px;padding:8px;border:1px dashed var(--border,#333);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <span>2️⃣ <b>${esc(e.nome)}:</b> ${esc(e.numero) || '—'} <span style="color:var(--text-muted);font-size:11px;">(${esc(e.instancia)})</span><br><span style="font-size:12px;">${st}</span></span>
          <span>`;
        if (e.existe && e.estado === 'open') {
          h += `<button class="btn btn-sm" style="font-size:11px;background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);" onclick="__wpPromover('${e.instancia}','${c.id}')">⭐ Tornar principal</button>`;
        }
        if (!e.existe) {
          h += `<button class="btn btn-sm" style="font-size:11px;" onclick="__wpLimpar('${e.instancia}','${c.id}')">🧹 Limpar</button>`;
        }
        h += `</span></div>`;
      }
      h += `</div>`;
    }
    if (a.orfas.length) {
      h += `<div style="border:1px solid #a55;border-radius:12px;padding:14px;">
        <div style="font-weight:700;margin-bottom:8px;">👻 Instâncias órfãs (nenhuma clínica usa)</div>`;
      a.orfas.forEach(o => {
        h += `<div style="font-size:13px;margin-bottom:4px;">⚠️ ${esc(o.instancia)} · ${esc(o.estado)} · ${esc(o.numero) || ''}</div>`;
      });
      h += `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Órfã conectada de uma clínica? Use o console: tornarPrincipal('nome_da_instancia') — ele pergunta a clínica.</div></div>`;
    }
    body.innerHTML = h || '<div style="padding:20px;">Nenhuma clínica com WhatsApp.</div>';
  }

  window.__wpPromover = async function (inst, clinicId) {
    const ok = await window.tornarPrincipal(inst, clinicId);
    if (ok) { if (typeof toast === 'function') toast('Principal atualizado! ⭐'); renderPainel(); }
  };
  window.__wpLimpar = async function (inst, clinicId) {
    const ok = await limparRegistroMorto(inst, clinicId);
    if (ok) { if (typeof toast === 'function') toast('Registro morto removido 🧹'); renderPainel(); }
  };

  function abrirPainel() {
    let m = document.getElementById('wpPainel');
    if (m) m.remove();
    m = document.createElement('div');
    m.id = 'wpPainel';
    m.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;';
    m.innerHTML = `
      <div style="background:var(--bg-card,#1a1a1a);border:1px solid var(--border,#333);border-radius:16px;max-width:640px;width:94vw;max-height:86vh;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--border,#333);">
          <h3 style="margin:0;font-size:16px;">📱 Gestão de WhatsApps</h3>
          <span>
            <button class="btn btn-sm" onclick="document.getElementById('wpPainelBody') && (window.__wpRefresh())" style="font-size:12px;margin-right:6px;">🔄 Atualizar</button>
            <button class="btn btn-ghost btn-icon" onclick="document.getElementById('wpPainel').remove()">✕</button>
          </span>
        </div>
        <div id="wpPainelBody" style="overflow-y:auto;padding:14px 18px;"></div>
      </div>`;
    m.addEventListener('click', ev => { if (ev.target === m) m.remove(); });
    document.body.appendChild(m);
    window.__wpRefresh = renderPainel;
    renderPainel();
  }

  async function ehAdmin() {
    try {
      const _db = getDb();
      const { data } = await _db.auth.getUser();
      return !!(data && data.user && String(data.user.email).toLowerCase() === ADMIN_EMAIL);
    } catch (e) { return false; }
  }

  async function injetarBotaoAdmin() {
    if (document.getElementById('wpBtnAdmin')) return;
    if (!(await ehAdmin())) return; // só o admin vê
    const b = document.createElement('button');
    b.id = 'wpBtnAdmin';
    b.textContent = '📱 WhatsApps';
    b.title = 'Gestão de WhatsApps (admin)';
    b.style.cssText = 'position:fixed;bottom:18px;left:18px;z-index:99997;background:var(--bg-card,#1a1a1a);color:var(--text,#eee);border:1px solid var(--gold-border,#C9A84C);border-radius:999px;padding:9px 14px;font-size:13px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.35);';
    b.onclick = abrirPainel;
    document.body.appendChild(b);
  }

  // tenta injetar (aguarda o login/db ficarem prontos)
  let tent = 0;
  const iv = setInterval(async () => {
    tent++;
    await injetarBotaoAdmin();
    if (document.getElementById('wpBtnAdmin') || tent > 30) clearInterval(iv);
  }, 1000);

  console.log('✅ whatsapp-principal-fix.js v2 carregado — botão 📱 WhatsApps (admin) + tornarPrincipal() + auditarWhatsApps()');
})();
