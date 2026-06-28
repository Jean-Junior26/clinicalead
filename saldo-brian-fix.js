// ============================================================
// CLINICALEAD — SALDO DO BRIAN IA (alerta + pacotes de recarga)
// - Banner de alerta no painel do cliente quando saldo chega a 80% (amarelo) e 90% (vermelho)
// - Card de saldo com barra de progresso
// - Pacotes de recarga avulsos (Pequeno/Médio/Grande)
// - Aviso no admin master: quais clínicas estão com saldo baixo
// Carregar como script novo no index.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }
  function ehAdminMaster() {
    const role = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return role === 'admin' || role === 'administrador';
  }

  // pacotes de recarga (definidos com o Jean)
  const PACOTES = [
    { id: 'pequeno', nome: 'Pequeno', msgs: 1000, preco: 49.90 },
    { id: 'medio',   nome: 'Médio',   msgs: 2500, preco: 99.90 },
    { id: 'grande',  nome: 'Grande',  msgs: 4000, preco: 149.90 },
  ];

  // thresholds de alerta
  const ALERTA_AMARELO = 80; // %
  const ALERTA_VERMELHO = 90; // %

  // calcula o saldo de uma linha brian_saldo
  function calcSaldo(s) {
    if (!s) return null;
    const totalIncluso = s.incluso_mes || 0;
    const totalExtra = s.extra_comprado || 0;
    const total = totalIncluso + totalExtra;
    const usado = (s.usado_mes || 0) + (s.extra_usado || 0);
    const disponivel = total - usado;
    const pctUsado = total > 0 ? Math.round((usado / total) * 100) : 0;
    return { total, usado, disponivel, pctUsado };
  }

  // ── BANNER DE ALERTA no topo do dashboard do cliente ──
  async function verificarAlerta() {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic) return;
    try {
      const { data: s } = await database.from('brian_saldo')
        .select('incluso_mes, usado_mes, extra_comprado, extra_usado')
        .eq('clinic_id', clinic.id).maybeSingle();
      const calc = calcSaldo(s);
      if (!calc || calc.total === 0) return; // sem saldo configurado (clínica sem Brian) → não mostra
      if (calc.pctUsado < ALERTA_AMARELO) { removerBanner(); return; } // ainda confortável

      const vermelho = calc.pctUsado >= ALERTA_VERMELHO;
      mostrarBanner(calc, vermelho);
    } catch (e) { console.error('[saldo-brian] alerta', e); }
  }

  function removerBanner() {
    const b = document.getElementById('saldoBrianBanner');
    if (b) b.remove();
  }

  function mostrarBanner(calc, vermelho) {
    removerBanner();
    const host = document.querySelector('.content') || document.body;
    const banner = document.createElement('div');
    banner.id = 'saldoBrianBanner';
    const cor = vermelho ? '#C0624A' : '#C9A84C';
    const bg = vermelho ? 'rgba(192,98,74,0.12)' : 'rgba(201,168,76,0.10)';
    const titulo = vermelho
      ? '🔴 Saldo do Brian IA quase no fim!'
      : '🟡 Saldo do Brian IA está acabando';
    const texto = vermelho
      ? `Restam apenas <b>${calc.disponivel} mensagens</b>. Recarregue agora pra o Brian não parar de atender seus leads!`
      : `Você já usou ${calc.pctUsado}% do seu saldo (<b>${calc.disponivel} mensagens</b> restantes). Que tal recarregar pra ficar tranquilo?`;
    banner.style.cssText = `margin:0 0 16px;padding:14px 18px;border-radius:12px;border:1px solid ${cor};background:${bg};display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;`;
    banner.innerHTML = `
      <div style="flex:1;min-width:240px;">
        <div style="font-weight:700;color:${cor};font-size:15px;margin-bottom:3px;">${titulo}</div>
        <div style="font-size:13px;color:var(--text-secondary,#C8C2AE);">${texto}</div>
      </div>
      <button onclick="abrirRecargaBrian()" style="padding:9px 18px;border-radius:9px;border:none;background:${cor};color:#0A0A0B;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;">⚡ Recarregar saldo</button>`;
    // insere no topo do conteúdo ativo
    const pageAtiva = document.querySelector('.page.active') || host;
    pageAtiva.insertBefore(banner, pageAtiva.firstChild);
  }

  // ── MODAL DE RECARGA (pacotes) ──
  window.abrirRecargaBrian = async function () {
    const database = getDb(); const clinic = clinicAtual();
    let calc = null;
    try {
      const { data: s } = await database.from('brian_saldo')
        .select('incluso_mes, usado_mes, extra_comprado, extra_usado')
        .eq('clinic_id', clinic.id).maybeSingle();
      calc = calcSaldo(s);
    } catch (e) {}

    let modal = document.getElementById('modalRecargaBrian');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalRecargaBrian';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';

    const saldoInfo = calc && calc.total > 0
      ? `<div style="text-align:center;margin-bottom:18px;padding:12px;border-radius:10px;background:var(--bg-base,#0A0A0B);">
           <div style="font-size:13px;color:var(--text-muted,#888);">Saldo atual</div>
           <div style="font-size:24px;font-weight:800;color:var(--gold,#C9A84C);">${calc.disponivel} <span style="font-size:14px;color:var(--text-muted,#888);">de ${calc.total} mensagens</span></div>
         </div>` : '';

    const cards = PACOTES.map(p => `
      <div style="border:1px solid var(--gold-border,#333);border-radius:12px;padding:18px;text-align:center;background:var(--bg-card,#1C1C20);">
        <div style="font-size:14px;color:var(--text-secondary,#8A8570);font-weight:600;">${p.nome}</div>
        <div style="font-size:28px;font-weight:800;color:var(--gold,#C9A84C);margin:6px 0;">${p.msgs.toLocaleString('pt-BR')}</div>
        <div style="font-size:12px;color:var(--text-muted,#888);margin-bottom:12px;">mensagens</div>
        <div style="font-size:20px;font-weight:700;color:var(--text-primary,#F0EAD6);margin-bottom:12px;">R$ ${p.preco.toFixed(2).replace('.', ',')}</div>
        <button onclick="solicitarRecarga('${p.id}')" style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--gold,#C9A84C);color:#0A0A0B;font-weight:700;cursor:pointer;">Comprar</button>
      </div>`).join('');

    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:16px;padding:26px;max-width:680px;width:100%;max-height:90vh;overflow:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
          <h2 style="margin:0;font-size:20px;">⚡ Recarregar saldo do Brian IA</h2>
          <button onclick="document.getElementById('modalRecargaBrian').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:24px;cursor:pointer;">×</button>
        </div>
        ${saldoInfo}
        <p style="font-size:13px;color:var(--text-secondary,#8A8570);margin-bottom:18px;">Escolha um pacote de mensagens avulsas. As mensagens são adicionadas ao seu saldo e não expiram no mês.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;">${cards}</div>
        <p style="font-size:12px;color:var(--text-muted,#888);margin-top:18px;text-align:center;">Após a compra, nossa equipe libera o saldo rapidinho. 😊</p>
      </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  };

  // cliente solicita recarga → registra pedido (liberação manual pela sua equipe)
  window.solicitarRecarga = async function (pacoteId) {
    const pacote = PACOTES.find(p => p.id === pacoteId);
    const clinic = clinicAtual();
    if (!pacote || !clinic) return;
    const database = getDb();
    try {
      // registra o pedido de recarga (best-effort: tabela recargas_pedidos)
      await database.from('recargas_pedidos').insert({
        clinic_id: clinic.id,
        pacote: pacote.nome,
        msgs: pacote.msgs,
        valor: pacote.preco,
        status: 'pendente',
        created_at: new Date().toISOString(),
      });
    } catch (e) { console.log('[recarga] registro pedido (tabela pode não existir ainda):', e.message); }
    // mensagem de orientação (a venda/liberação é manual por enquanto)
    if (typeof toast === 'function') toast('Pedido registrado! Entraremos em contato pra liberar.', 'success');
    const modal = document.getElementById('modalRecargaBrian');
    if (modal) {
      modal.querySelector('div').innerHTML = `
        <div style="text-align:center;padding:20px;">
          <div style="font-size:40px;margin-bottom:12px;">✅</div>
          <h2 style="margin:0 0 10px;">Pedido registrado!</h2>
          <p style="color:var(--text-secondary,#8A8570);font-size:14px;">Você escolheu o pacote <b>${pacote.nome}</b> (${pacote.msgs.toLocaleString('pt-BR')} mensagens) por <b>R$ ${pacote.preco.toFixed(2).replace('.', ',')}</b>.<br><br>Nossa equipe vai entrar em contato pra concluir a recarga. Obrigado! 😊</p>
          <button onclick="document.getElementById('modalRecargaBrian').remove()" style="margin-top:16px;padding:10px 24px;border-radius:8px;border:none;background:var(--gold,#C9A84C);color:#0A0A0B;font-weight:700;cursor:pointer;">Fechar</button>
        </div>`;
    }
  };

  // ── PAINEL ADMIN: pedidos de recarga + clínicas com saldo baixo ──
  window.verSaldosAdmin = async function () {
    if (!ehAdminMaster()) return;
    const database = getDb();
    let linhas = [], pedidos = [], mapaClinica = {};
    try {
      const { data: clinicas } = await database.from('clinicas').select('id, nome');
      (clinicas || []).forEach(c => mapaClinica[c.id] = c.nome);

      // pedidos de recarga PENDENTES
      const { data: peds } = await database.from('recargas_pedidos')
        .select('*').eq('status', 'pendente').order('created_at', { ascending: false });
      pedidos = (peds || []).map(p => ({ ...p, clinicaNome: mapaClinica[p.clinic_id] || p.clinic_id }));

      // clínicas com saldo baixo
      const { data: saldos } = await database.from('brian_saldo').select('*');
      (saldos || []).forEach(s => {
        const calc = calcSaldo(s);
        if (calc && calc.total > 0 && calc.pctUsado >= ALERTA_AMARELO) {
          linhas.push({ nome: mapaClinica[s.clinic_id] || s.clinic_id, ...calc });
        }
      });
      linhas.sort((a, b) => b.pctUsado - a.pctUsado);
    } catch (e) { console.error('[saldo-admin]', e); }

    let modal = document.getElementById('modalSaldosAdmin');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalSaldosAdmin';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';

    // SEÇÃO 1: pedidos de recarga pendentes (com botão Liberar)
    const corpoPedidos = pedidos.length
      ? pedidos.map(p => {
          const data = new Date(p.created_at).toLocaleDateString('pt-BR');
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:9px;background:var(--bg-base,#0A0A0B);margin-bottom:8px;border-left:3px solid #6FBF8E;">
            <div>
              <b>${p.clinicaNome}</b>
              <div style="font-size:12px;color:var(--text-muted,#888);">Pacote ${p.pacote} · ${(p.msgs||0).toLocaleString('pt-BR')} msgs · R$ ${Number(p.valor).toFixed(2).replace('.', ',')} · ${data}</div>
            </div>
            <button onclick="liberarRecarga('${p.id}','${p.clinic_id}',${p.msgs})" style="padding:7px 14px;border-radius:8px;border:none;background:#6FBF8E;color:#0A0A0B;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap;">✓ Liberar</button>
          </div>`;
        }).join('')
      : '<p style="text-align:center;color:var(--text-muted,#888);padding:14px;font-size:13px;">Nenhum pedido de recarga pendente.</p>';

    // SEÇÃO 2: clínicas com saldo baixo
    const corpoSaldos = linhas.length
      ? linhas.map(l => {
          const verm = l.pctUsado >= ALERTA_VERMELHO;
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:9px;background:var(--bg-base,#0A0A0B);margin-bottom:8px;border-left:3px solid ${verm ? '#C0624A' : '#C9A84C'};">
            <div><b>${l.nome}</b><div style="font-size:12px;color:var(--text-muted,#888);">${l.disponivel} de ${l.total} restantes</div></div>
            <div style="font-weight:800;color:${verm ? '#C0624A' : '#C9A84C'};">${l.pctUsado}%</div>
          </div>`;
        }).join('')
      : '<p style="text-align:center;color:var(--text-muted,#888);padding:14px;font-size:13px;">✅ Nenhuma clínica com saldo baixo.</p>';

    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:16px;padding:26px;max-width:560px;width:100%;max-height:90vh;overflow:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
          <h2 style="margin:0;font-size:19px;">💰 Saldos & Recargas do Brian</h2>
          <button onclick="document.getElementById('modalSaldosAdmin').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:24px;cursor:pointer;">×</button>
        </div>
        <div style="font-size:14px;font-weight:700;color:#6FBF8E;margin-bottom:10px;">⚡ Pedidos de recarga pendentes${pedidos.length ? ` (${pedidos.length})` : ''}</div>
        ${corpoPedidos}
        <div style="font-size:14px;font-weight:700;color:var(--gold,#C9A84C);margin:20px 0 10px;">⚠️ Clínicas com saldo baixo</div>
        ${corpoSaldos}
      </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  };

  // libera a recarga: soma as msgs no extra_comprado da clínica + marca pedido como liberado
  window.liberarRecarga = async function (pedidoId, clinicId, msgs) {
    if (!ehAdminMaster()) return;
    if (!confirm(`Confirmar liberação de ${Number(msgs).toLocaleString('pt-BR')} mensagens para esta clínica?`)) return;
    const database = getDb();
    try {
      // 1) pega o saldo atual da clínica
      const { data: s } = await database.from('brian_saldo')
        .select('extra_comprado').eq('clinic_id', clinicId).maybeSingle();
      const extraAtual = (s && s.extra_comprado) ? s.extra_comprado : 0;
      const novoExtra = extraAtual + Number(msgs);

      // 2) atualiza o extra_comprado (cria a linha se não existir)
      if (s) {
        await database.from('brian_saldo').update({ extra_comprado: novoExtra }).eq('clinic_id', clinicId);
      } else {
        await database.from('brian_saldo').insert({ clinic_id: clinicId, extra_comprado: novoExtra });
      }

      // 3) marca o pedido como liberado
      await database.from('recargas_pedidos')
        .update({ status: 'liberado', liberado_em: new Date().toISOString() })
        .eq('id', pedidoId);

      if (typeof toast === 'function') toast('Recarga liberada! Saldo adicionado. ✓', 'success');
      verSaldosAdmin(); // recarrega o painel
    } catch (e) {
      console.error('[liberar-recarga]', e);
      if (typeof toast === 'function') toast('Erro ao liberar recarga', 'error');
    }
  };

  // injeta botão de "saldos" no menu (só admin)
  function injetarBotaoAdmin() {
    if (!ehAdminMaster()) return;
    if (document.getElementById('navSaldosAdmin')) return;
    const ref = document.querySelector('.nav-item[data-page="clinicas"]')
             || document.querySelector('.nav-item[data-page="cobrancas"]');
    if (!ref) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navSaldosAdmin';
    btn.innerHTML = '<i class="ti ti-bell-dollar"></i> Saldos Brian';
    btn.onclick = () => verSaldosAdmin();
    ref.parentNode.insertBefore(btn, ref.nextSibling);
  }

  // injeta botão FIXO "Recarregar Brian" no menu — visível pra TODOS, sempre acessível
  // (resolve: cliente quer antecipar recarga mesmo com saldo alto)
  function injetarBotaoRecarga() {
    if (document.getElementById('navRecarregarBrian')) return;
    // coloca perto do menu "Cobranças" ou "Brian IA" ou "Meu Plano"
    const ref = document.querySelector('.nav-item[data-page="cobrancas"]')
             || document.querySelector('.nav-item[data-page="brian"]')
             || document.querySelector('.nav-item[data-page="meu-plano"]')
             || document.querySelector('.nav-item[data-page="planos"]');
    if (!ref) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navRecarregarBrian';
    btn.innerHTML = '<i class="ti ti-bolt"></i> Recarregar Brian';
    btn.onclick = () => abrirRecargaBrian();
    ref.parentNode.insertBefore(btn, ref.nextSibling);
  }

  // ── inicialização ──
  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    // verifica alerta ao carregar e quando troca de clínica
    setTimeout(verificarAlerta, 2500);
    let ultClinic = null;
    setInterval(() => {
      const c = clinicAtual();
      const id = c ? c.id : null;
      if (id !== ultClinic) { ultClinic = id; verificarAlerta(); }
    }, 2000);
    injetarBotaoAdmin();
    setInterval(injetarBotaoAdmin, 1500);
    injetarBotaoRecarga();
    setInterval(injetarBotaoRecarga, 1500);
    console.log('✅ saldo-brian-fix.js carregado');
    return true;
  }
  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }
})();
