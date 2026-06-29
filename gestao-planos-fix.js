// ============================================================
// CLINICALEAD — GESTÃO DE PLANOS ATIVOS (ADMIN)
// Mostra TODAS as clínicas com plano: status, vencimento, valor, uso.
// Permite EDITAR (plano, valor, vencimento, dia de renovação).
// É o painel de controle das assinaturas.
// Carregar como script novo no index.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function ehAdminMaster() {
    const r = (typeof STATE !== 'undefined' && STATE.profile) ? STATE.profile.role : null;
    return r === 'admin' || r === 'administrador';
  }

  function diasAte(dataISO) {
    if (!dataISO) return null;
    const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(dataISO + 'T00:00:00');
    return Math.round((venc - hoje) / 86400000);
  }
  function fmtData(iso) { if (!iso) return '—'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }
  function fmtR$(v) { return v != null ? 'R$ ' + Number(v).toFixed(2).replace('.', ',') : '—'; }

  window.abrirGestaoPlanos = async function () {
    if (!ehAdminMaster()) return;
    const database = getDb();
    let linhas = [];
    try {
      const { data: saldos } = await database.from('brian_saldo').select('*');
      const { data: clinicas } = await database.from('clinicas').select('id, nome');
      const mapa = {}; (clinicas || []).forEach(c => mapa[c.id] = c.nome);
      linhas = (saldos || []).map(s => ({ ...s, nome: mapa[s.clinic_id] || s.clinic_id.slice(0, 8) }));
      // ordena: com vencimento primeiro (mais próximos), depois sem
      linhas.sort((a, b) => {
        if (!a.vence_em) return 1; if (!b.vence_em) return -1;
        return a.vence_em < b.vence_em ? -1 : 1;
      });
    } catch (e) { console.error('[gestao-planos]', e); }

    let modal = document.getElementById('modalGestaoPlanos');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalGestaoPlanos';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';

    const linhasHtml = linhas.length ? linhas.map(l => {
      const dias = diasAte(l.vence_em);
      const disp = ((l.incluso_mes || 0) - (l.usado_mes || 0)) + ((l.extra_comprado || 0) - (l.extra_usado || 0));
      let statusCor = '#6FBF8E', statusTxt = 'Em dia';
      if (!l.vence_em) { statusCor = '#888'; statusTxt = 'Sem vencimento'; }
      else if (dias < 0) { statusCor = '#C0624A'; statusTxt = `Vencido (${Math.abs(dias)}d)`; }
      else if (dias <= 3) { statusCor = '#C9A84C'; statusTxt = `Vence em ${dias}d`; }
      const plano = l.plano_nome || '—';
      const whats = 1 + (l.whatsapp_extra || 0);
      return `<div style="border:1px solid var(--gold-border,#333);border-radius:10px;padding:14px;margin-bottom:10px;background:var(--bg-base,#0A0A0B);">
        <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-weight:700;font-size:15px;color:var(--text-primary,#F0EAD6);">${l.nome}</div>
            <div style="font-size:12px;color:var(--text-muted,#888);margin-top:3px;">
              ${plano} · ${(l.incluso_mes||0).toLocaleString('pt-BR')} msgs · ${whats} WhatsApp · ${fmtR$(l.valor_cobrado)}
            </div>
            <div style="font-size:12px;color:var(--text-muted,#888);margin-top:2px;">
              Vence: ${fmtData(l.vence_em)} · Disponível: ${disp} msgs (usou ${l.usado_mes||0})
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:end;gap:6px;">
            <span style="font-size:11px;font-weight:700;color:${statusCor};padding:3px 8px;border-radius:6px;background:${statusCor}22;">${statusTxt}</span>
            <button onclick="editarPlano('${l.clinic_id}')" style="padding:5px 12px;border-radius:7px;border:1px solid var(--gold-border,#333);background:transparent;color:var(--gold,#C9A84C);font-size:12px;cursor:pointer;">✏️ Editar</button>
          </div>
        </div>
      </div>`;
    }).join('') : '<p style="text-align:center;color:var(--text-muted,#888);padding:20px;">Nenhuma clínica com plano configurado ainda.</p>';

    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:16px;padding:26px;max-width:600px;width:100%;max-height:90vh;overflow:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
          <h2 style="margin:0;font-size:19px;">📋 Planos ativos</h2>
          <button onclick="document.getElementById('modalGestaoPlanos').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:24px;cursor:pointer;">×</button>
        </div>
        ${linhasHtml}
      </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  };

  // editar um plano específico
  window.editarPlano = async function (clinicId) {
    if (!ehAdminMaster()) return;
    const database = getDb();
    let s = {};
    try {
      const { data } = await database.from('brian_saldo').select('*').eq('clinic_id', clinicId).maybeSingle();
      s = data || {};
    } catch (e) {}

    let modal = document.getElementById('modalEditarPlano');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalEditarPlano';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;';
    const inp = 'width:100%;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--gold-border,#333);color:var(--text-primary,#F0EAD6);margin-bottom:12px;';
    const lbl = 'display:block;font-size:13px;color:var(--text-secondary,#8A8570);margin-bottom:5px;';

    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#333);border-radius:16px;padding:26px;max-width:440px;width:100%;max-height:90vh;overflow:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
          <h2 style="margin:0;font-size:18px;">✏️ Editar plano</h2>
          <button onclick="document.getElementById('modalEditarPlano').remove()" style="background:none;border:none;color:var(--text-muted,#888);font-size:24px;cursor:pointer;">×</button>
        </div>
        <label style="${lbl}">Nome do plano</label>
        <input id="epPlano" type="text" value="${s.plano_nome || ''}" style="${inp}">
        <label style="${lbl}">Mensagens inclusas/mês</label>
        <input id="epMsgs" type="number" value="${s.incluso_mes || 0}" style="${inp}">
        <label style="${lbl}">WhatsApp adicional</label>
        <input id="epWhats" type="number" value="${s.whatsapp_extra || 0}" style="${inp}">
        <label style="${lbl}">Valor cobrado (R$)</label>
        <input id="epValor" type="number" step="0.01" value="${s.valor_cobrado || ''}" style="${inp}">
        <div style="display:flex;gap:10px;">
          <div style="flex:1;"><label style="${lbl}">Dia renovação</label><input id="epDia" type="number" min="1" max="31" value="${s.dia_renovacao || ''}" style="${inp}"></div>
          <div style="flex:1;"><label style="${lbl}">Vence em</label><input id="epVence" type="date" value="${s.vence_em || ''}" style="${inp}"></div>
        </div>
        <div style="background:rgba(201,168,76,0.08);border-radius:8px;padding:10px;font-size:11px;color:var(--text-muted,#888);margin-bottom:14px;">
          ⚠️ Editar aqui NÃO mexe nos créditos já usados (${s.usado_mes || 0} usados). Só ajusta a configuração do plano.
        </div>
        <button onclick="salvarEdicaoPlano('${clinicId}')" style="width:100%;padding:11px;border-radius:9px;border:none;background:var(--gold,#C9A84C);color:#0A0A0B;font-weight:700;cursor:pointer;">Salvar alterações</button>
      </div>`;
    document.body.appendChild(modal);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  };

  window.salvarEdicaoPlano = async function (clinicId) {
    if (!ehAdminMaster()) return;
    const database = getDb();
    const dados = {
      plano_nome: document.getElementById('epPlano').value.trim() || null,
      incluso_mes: parseInt(document.getElementById('epMsgs').value) || 0,
      whatsapp_extra: parseInt(document.getElementById('epWhats').value) || 0,
      valor_cobrado: parseFloat(document.getElementById('epValor').value) || null,
      dia_renovacao: parseInt(document.getElementById('epDia').value) || null,
      vence_em: document.getElementById('epVence').value || null,
    };
    try {
      await database.from('brian_saldo').update(dados).eq('clinic_id', clinicId);
      if (typeof toast === 'function') toast('Plano atualizado! ✓', 'success');
      document.getElementById('modalEditarPlano').remove();
      abrirGestaoPlanos(); // recarrega a lista
    } catch (e) {
      console.error('[salvar-edicao]', e);
      if (typeof toast === 'function') toast('Erro ao salvar', 'error');
    }
  };

  function injetarBotao() {
    if (!ehAdminMaster()) return;
    if (document.getElementById('navGestaoPlanos')) return;
    const ref = document.querySelector('.nav-item[data-page="clinicas"]');
    if (!ref) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navGestaoPlanos';
    btn.innerHTML = '<i class="ti ti-clipboard-list"></i> Planos ativos';
    btn.onclick = () => abrirGestaoPlanos();
    ref.parentNode.insertBefore(btn, ref.nextSibling);
  }

  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    injetarBotao();
    setInterval(injetarBotao, 1500);
    console.log('✅ gestao-planos-fix.js carregado');
    return true;
  }
  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }
})();
