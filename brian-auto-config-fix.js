// ============================================================
// CLINICALEAD — BRIAN FASE 2: Tela de Atendimento Automático
// Adiciona, na tela do Brian IA, a seção de modo automático:
// chave geral, horário de funcionamento (por dia) e palavras-chave
// dos anúncios (Camada 1). Autossuficiente: carrega a própria config.
// NÃO ativa nada sozinho — só salva. O motor vem na Etapa 2.3.
// Carregar APÓS brian-fix.js.
// ============================================================

(function () {
  'use strict';

  const DIAS = [
    { k: 'seg', nome: 'Segunda' }, { k: 'ter', nome: 'Terça' }, { k: 'qua', nome: 'Quarta' },
    { k: 'qui', nome: 'Quinta' }, { k: 'sex', nome: 'Sexta' }, { k: 'sab', nome: 'Sábado' }, { k: 'dom', nome: 'Domingo' }
  ];

  let carregando = false;

  async function injetarSecao() {
    const body = document.getElementById('brianBody');
    if (!body || document.getElementById('brianAutoSecao') || carregando) return;
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;

    carregando = true;
    let cfg = {};
    try {
      const { data } = await db.from('brian_config').select('auto_ativo, horario_funcionamento, palavras_anuncio').eq('clinic_id', clinic.id).maybeSingle();
      cfg = data || {};
    } catch (e) { cfg = {}; }

    // pode ter sido injetado por outra chamada enquanto carregava
    if (document.getElementById('brianAutoSecao')) { carregando = false; return; }

    const horario = cfg.horario_funcionamento || {};
    const sec = document.createElement('div');
    sec.id = 'brianAutoSecao';
    sec.style.cssText = 'margin-top:22px;padding-top:18px;border-top:1px solid var(--border,rgba(201,168,76,0.15));';
    sec.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <i class="ti ti-bolt" style="color:var(--gold);"></i>
        <h4 style="margin:0;font-size:14px;color:var(--text-primary);">Atendimento automático (Fase 2)</h4>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px;">
        Quando ligado, o Brian responde sozinho <b>fora do horário</b> de funcionamento.
        Durante o expediente, segue como sugestão (você revisa e envia).
      </div>

      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:16px;font-size:13px;color:var(--text-primary);">
        <input type="checkbox" id="brianAutoAtivo" ${cfg.auto_ativo ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;">
        <span><b>Ligar atendimento automático</b> (responde sozinho fora do horário)</span>
      </label>

      <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">Horário de funcionamento</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;">Marque os dias e horários de atendimento. Fora disso, o Brian assume (se ligado acima).</div>
      <div id="brianHorarios" style="display:flex;flex-direction:column;gap:6px;margin-bottom:18px;">
        ${DIAS.map(d => {
          const h = horario[d.k];
          const aberto = h && h.abre;
          return `
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:6px;width:104px;cursor:pointer;">
              <input type="checkbox" class="brian-dia-on" data-dia="${d.k}" ${aberto ? 'checked' : ''} style="cursor:pointer;">
              <span style="color:var(--text-primary);">${d.nome}</span>
            </label>
            <input type="time" class="brian-dia-abre form-input" data-dia="${d.k}" value="${aberto ? h.abre : '08:00'}" style="width:114px;padding:4px 8px;" ${aberto ? '' : 'disabled'}>
            <span style="color:var(--text-muted);">até</span>
            <input type="time" class="brian-dia-fecha form-input" data-dia="${d.k}" value="${aberto ? h.fecha : '18:00'}" style="width:114px;padding:4px 8px;" ${aberto ? '' : 'disabled'}>
          </div>`;
        }).join('')}
      </div>

      <label class="form-label" style="font-size:12px;">Palavras-chave dos seus anúncios <span style="color:var(--text-muted);font-weight:400;">(identifica leads de anúncio)</span></label>
      <textarea class="form-input" id="brianPalavrasAnuncio" rows="3" placeholder="Ex.: tenho interesse em, vi no instagram, quanto custa, gostaria de informações, vi o anúncio" style="width:100%;resize:vertical;">${cfg.palavras_anuncio || ''}</textarea>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.5;">Separe por vírgula. O Brian também reconhece sozinho palavras comuns de interesse (preço, valor, agendar, implante, etc.).</div>

      <button class="btn btn-primary" style="width:100%;margin-top:16px;" onclick="salvarBrianAuto()"><i class="ti ti-device-floppy"></i> Salvar configuração automática</button>
      <div id="brianAutoMsg" style="font-size:12px;color:var(--coral);min-height:14px;margin-top:8px;"></div>`;

    body.appendChild(sec);

    sec.querySelectorAll('.brian-dia-on').forEach(chk => {
      chk.addEventListener('change', function () {
        const dia = this.dataset.dia;
        const abre = sec.querySelector(`.brian-dia-abre[data-dia="${dia}"]`);
        const fecha = sec.querySelector(`.brian-dia-fecha[data-dia="${dia}"]`);
        if (abre) abre.disabled = !this.checked;
        if (fecha) fecha.disabled = !this.checked;
      });
    });

    carregando = false;
  }

  window.salvarBrianAuto = async function () {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return;
    const msg = document.getElementById('brianAutoMsg');
    const set = (t) => { if (msg) msg.textContent = t || ''; };

    const auto_ativo = document.getElementById('brianAutoAtivo').checked;
    const palavras = (document.getElementById('brianPalavrasAnuncio').value || '').trim();

    const horario = {};
    DIAS.forEach(d => {
      const on = document.querySelector(`.brian-dia-on[data-dia="${d.k}"]`);
      if (on && on.checked) {
        const abre = document.querySelector(`.brian-dia-abre[data-dia="${d.k}"]`).value || '08:00';
        const fecha = document.querySelector(`.brian-dia-fecha[data-dia="${d.k}"]`).value || '18:00';
        horario[d.k] = { abre, fecha };
      } else {
        horario[d.k] = null;
      }
    });

    set('Salvando…');
    try {
      const { error } = await db.from('brian_config').upsert({
        clinic_id: clinic.id,
        auto_ativo,
        auto_so_fora_horario: true,
        horario_funcionamento: horario,
        palavras_anuncio: palavras || null,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'clinic_id' });
      if (error) throw error;
      if (typeof toast === 'function') toast(auto_ativo ? 'Atendimento automático configurado! 🤖' : 'Configuração salva (automático desligado)');
      set('');
    } catch (e) { set('Erro: ' + (e.message || '')); console.error('[brian auto salvar]', e); }
  };

  // injeta a seção quando a tela do Brian estiver aberta
  setInterval(injetarSecao, 900);

  console.log('✅ brian-auto-config-fix.js carregado — config de atendimento automático (Fase 2)');
})();
