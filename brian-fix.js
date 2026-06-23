// ============================================================
// CLINICALEAD — BRIAN IA (Fase 1) — Menu + Configuração
// Item "🤖 Brian IA" no menu lateral → tela onde a clínica define
// o NOME do atendente (que o paciente vê) e o CONTEXTO (serviços,
// horários, o que ele pode dizer). Salva em brian_config.
// O botão de "sugerir" no inbox vem no próximo passo.
// ============================================================

(function () {
  'use strict';

  const BRIAN = { cfg: null };

  async function carregar() {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return null;
    try {
      const { data } = await db.from('brian_config').select('*').eq('clinic_id', clinic.id).maybeSingle();
      BRIAN.cfg = data || null;
    } catch (e) { BRIAN.cfg = null; }
    return BRIAN.cfg;
  }

  window.abrirBrian = async function () {
    if (!document.getElementById('modalBrian')) {
      const ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.id = 'modalBrian';
      ov.innerHTML = `
        <div class="modal" style="max-width:560px;width:96vw;">
          <div class="modal-header">
            <h3><i class="ti ti-robot" style="margin-right:8px;color:var(--gold);"></i>Brian IA — Atendente</h3>
            <button class="btn btn-ghost btn-icon" onclick="closeModal('modalBrian')"><i class="ti ti-x"></i></button>
          </div>
          <div class="modal-body" id="brianBody" style="max-height:74vh;overflow-y:auto;"></div>
        </div>`;
      document.body.appendChild(ov);
    }
    openModal('modalBrian');
    document.getElementById('brianBody').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Carregando…</div>';
    await carregar();
    renderBrian();
  };

  function renderBrian() {
    const body = document.getElementById('brianBody');
    if (!body) return;
    const c = BRIAN.cfg || {};
    const exemplo = `Ex.:
- Atendemos de seg a sex, 8h às 18h, e sábado 8h às 12h.
- Serviços: avaliação gratuita, limpeza, clareamento, implante, ortodontia.
- Sempre incentivamos agendar uma AVALIAÇÃO gratuita.
- Não passamos preço por mensagem; convidamos para a avaliação.
- Formas de pagamento: cartão, pix, boleto e carnê próprio.`;
    body.innerHTML = `
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;line-height:1.5;">
        O Brian é seu atendente de IA. Nesta fase ele <b>sugere respostas</b> no inbox — você revisa e envia. Configure como ele se apresenta e o que pode falar.
      </div>

      <label class="form-label" style="font-size:12px;">Nome do atendente <span style="color:var(--text-muted);">(o que o paciente vê)</span></label>
      <input class="form-input" id="brianNome" placeholder="Brian" value="${(c.nome_atendente || '').replace(/"/g, '&quot;')}" style="width:100%;margin-bottom:14px;"/>

      <label class="form-label" style="font-size:12px;">O que o Brian pode dizer <span style="color:var(--text-muted);">(serviços, horários, regras, pagamento…)</span></label>
      <textarea class="form-input" id="brianContexto" rows="9" placeholder="${exemplo.replace(/"/g, '&quot;')}" style="width:100%;resize:vertical;line-height:1.5;">${c.contexto || ''}</textarea>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5;">Quanto mais detalhado, melhores as sugestões. O Brian nunca inventa preço, data ou orientação de saúde — quando faltar informação, ele encaminha pra você.</div>

      <button class="btn btn-primary" style="width:100%;margin-top:16px;" onclick="salvarBrian()"><i class="ti ti-device-floppy"></i> Salvar</button>
      <div id="brianMsg" style="font-size:12px;color:var(--coral);min-height:14px;margin-top:8px;"></div>`;
  }

  window.salvarBrian = async function () {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;
    const msg = document.getElementById('brianMsg');
    const set = (t) => { if (msg) msg.textContent = t || ''; };
    const nome = (document.getElementById('brianNome').value || '').trim();
    const contexto = (document.getElementById('brianContexto').value || '').trim();
    set('Salvando…');
    try {
      const { error } = await db.from('brian_config').upsert({
        clinic_id: clinic.id,
        nome_atendente: nome || null,
        contexto: contexto || null,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'clinic_id' });
      if (error) throw error;
      BRIAN.cfg = { ...(BRIAN.cfg || {}), nome_atendente: nome || null, contexto: contexto || null };
      if (typeof toast === 'function') toast('Brian configurado! 🤖');
      set('');
    } catch (e) { set('Erro: ' + (e.message || '')); console.error('[brian salvar]', e); }
  };

  // injeta o item no menu lateral (logo após Automações, ou após Responsáveis)
  function injetarMenu() {
    if (document.getElementById('navBrian')) return;
    const ancora = document.getElementById('navResponsaveis')
      || document.querySelector('.nav-item[data-page="automacoes"]')
      || document.querySelector('.nav-item');
    if (!ancora || !ancora.parentNode) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navBrian';
    btn.innerHTML = '<i class="ti ti-robot"></i> Brian IA';
    btn.onclick = function () { abrirBrian(); };
    ancora.parentNode.insertBefore(btn, ancora.nextSibling);
  }
  injetarMenu();
  setTimeout(injetarMenu, 1500);
  setTimeout(injetarMenu, 4000);

  console.log('✅ brian-fix.js carregado — menu Brian IA + configuração');
})();
