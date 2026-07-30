// ============================================================
// CLINICALEAD — TELA DE DISPAROS (campanhas manuais em massa)
// Cria campanha (copy + imagem/vídeo + lista de contatos + limite
// por hora), o ENVIO em si roda de forma espaçada no backend
// (disparar-automacoes.ts), nunca tudo de uma vez — proteção
// contra banimento de número novo.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }

  const DISP = { campanhas: [], mostrandoForm: false, contatosSelecionados: new Set(), buscaContato: '', mediaFile: null, mediaPreviewUrl: null };

  // ── injeta o item de menu + a casca da página ────────────────
  function injetar() {
    if (!document.getElementById('page-disparos')) {
      const ref = document.getElementById('page-orcamentos') || document.getElementById('page-pacientes') || document.querySelector('.page');
      if (ref && ref.parentNode) {
        const div = document.createElement('div');
        div.className = 'page';
        div.id = 'page-disparos';
        ref.parentNode.insertBefore(div, ref.nextSibling);
      }
    }
    const navOrc = document.getElementById('navOrcamentos') || document.querySelector('.nav-item[data-page="pacientes"]');
    if (navOrc && !document.getElementById('navDisparos')) {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.id = 'navDisparos';
      btn.setAttribute('data-page', 'disparos');
      btn.innerHTML = '<i class="ti ti-send"></i> Disparos';
      btn.onclick = function () { showPage('disparos', this); };
      navOrc.parentNode.insertBefore(btn, navOrc.nextSibling);
    }
  }
  injetar();
  setTimeout(injetar, 1500);
  setTimeout(injetar, 4000);

  if (typeof showPage === 'function') {
    const _orig = showPage;
    showPage = function (id, el) {
      _orig(id, el);
      if (id === 'disparos') renderDisparosPage();
    };
  }

  // ── carrega campanhas da clínica atual ──
  async function carregarCampanhas() {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    if (!clinic) return [];
    const sb = getDb();
    const { data: campanhas } = await sb.from('disparos_campanhas')
      .select('*').eq('clinic_id', clinic.id).order('created_at', { ascending: false });
    if (!campanhas || !campanhas.length) return [];
    // conta progresso de cada campanha
    for (const c of campanhas) {
      const { data: contagem } = await sb.from('disparos_fila')
        .select('status').eq('campanha_id', c.id);
      c._total = (contagem || []).length;
      c._enviados = (contagem || []).filter(x => x.status === 'enviado').length;
      c._erros = (contagem || []).filter(x => x.status === 'erro').length;
    }
    return campanhas;
  }

  window.renderDisparosPage = async function renderDisparosPage() {
    const page = document.getElementById('page-disparos');
    if (!page) return;
    page.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-secondary);">Carregando...</div>`;
    DISP.campanhas = await carregarCampanhas();
    render();
  };

  function render() {
    const page = document.getElementById('page-disparos');
    if (!page) return;

    if (DISP.mostrandoForm) { renderForm(page); return; }

    const linhas = DISP.campanhas.map(c => {
      const pct = c._total ? Math.round((c._enviados / c._total) * 100) : 0;
      const statusBadge = {
        rascunho: '<span class="badge" style="background:#eee;color:#555;">Rascunho</span>',
        rodando: '<span class="badge" style="background:#d1f5d3;color:#1a7a1e;">🟢 Rodando</span>',
        pausada: '<span class="badge" style="background:#fff3cd;color:#8a6d00;">⏸ Pausada</span>',
        concluida: '<span class="badge" style="background:#dbe4ff;color:#2b4dc7;">✓ Concluída</span>',
      }[c.status] || c.status;

      let botoes = '';
      if (c.status === 'rascunho' || c.status === 'pausada') {
        botoes += `<button class="btn btn-sm btn-primary" onclick="dispIniciar('${c.id}')"><i class="ti ti-player-play"></i> ${c.status === 'pausada' ? 'Retomar' : 'Iniciar'}</button>`;
      }
      if (c.status === 'rodando') {
        botoes += `<button class="btn btn-sm" onclick="dispPausar('${c.id}')"><i class="ti ti-player-pause"></i> Pausar</button>`;
      }
      botoes += `<button class="btn btn-sm btn-danger" onclick="dispExcluir('${c.id}')"><i class="ti ti-trash"></i></button>`;

      return `
        <div class="card" style="padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                <h4 style="margin:0;">${c.nome}</h4>${statusBadge}
              </div>
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${c.copy.slice(0, 90)}${c.copy.length > 90 ? '…' : ''}</div>
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="flex:1;max-width:240px;height:6px;background:#eee;border-radius:4px;overflow:hidden;">
                  <div style="width:${pct}%;height:100%;background:var(--gold,#C9A84C);"></div>
                </div>
                <span style="font-size:12px;color:var(--text-muted);">${c._enviados}/${c._total} enviados${c._erros ? ` · ${c._erros} erro(s)` : ''}</span>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex:none;">${botoes}</div>
          </div>
        </div>`;
    }).join('');

    page.innerHTML = `
      <div class="page-header" style="margin-bottom:16px;">
        <div class="page-header-left">
          <h2>Disparos</h2>
          <p>Campanhas manuais em massa — envio espaçado automaticamente pra proteger o número</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" onclick="dispNovaCampanha()"><i class="ti ti-plus"></i> Nova Campanha</button>
        </div>
      </div>
      ${linhas || '<div style="text-align:center;padding:50px;color:var(--text-muted);">Nenhuma campanha ainda. Clica em "Nova Campanha" pra criar a primeira.</div>'}
    `;
  }

  function renderForm(page) {
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
    const leads = (typeof STATE !== 'undefined' && Array.isArray(STATE.leads)) ? STATE.leads : [];
    const buscaNorm = (DISP.buscaContato || '').toLowerCase();
    const filtrados = buscaNorm
      ? leads.filter(l => (l.nome || '').toLowerCase().includes(buscaNorm) || (l.telefone || '').includes(buscaNorm))
      : leads;
    const listaVisivel = filtrados.slice(0, 200); // não trava a tela

    const previewMedia = DISP.mediaPreviewUrl
      ? (DISP.mediaFile && DISP.mediaFile.type.startsWith('video')
          ? `<video src="${DISP.mediaPreviewUrl}" controls style="max-width:220px;border-radius:8px;margin-top:8px;"></video>`
          : `<img src="${DISP.mediaPreviewUrl}" style="max-width:220px;border-radius:8px;margin-top:8px;"/>`)
      : '';

    page.innerHTML = `
      <div class="page-header" style="margin-bottom:16px;">
        <div class="page-header-left">
          <h2><button class="btn btn-ghost btn-icon" onclick="dispVoltar()"><i class="ti ti-arrow-left"></i></button> Nova Campanha</h2>
        </div>
      </div>

      <div class="card" style="padding:20px;max-width:720px;">
        <div class="form-group">
          <label class="form-label">Nome da campanha (só pra você identificar)</label>
          <input type="text" id="dispNome" class="form-input" placeholder="Ex: Prospecção GO/MT — leva 1" style="width:100%;"/>
        </div>

        <div class="form-group">
          <label class="form-label">Texto da mensagem</label>
          <textarea id="dispCopy" class="form-input" rows="6" style="width:100%;" placeholder="Oi {nome}! ...">Oi {nome}! 😊 Aqui é da ClinicaLead...</textarea>
          <p style="font-size:11px;color:var(--text-muted);margin-top:4px;">Use <code>{nome}</code> no texto — é trocado automaticamente pelo nome de cada contato.</p>
        </div>

        <div class="form-group">
          <label class="form-label">Imagem ou vídeo (opcional)</label>
          <input type="file" id="dispMediaInput" accept="image/*,video/*" onchange="dispSelecionarMedia(this)"/>
          <div id="dispMediaPreview">${previewMedia}</div>
        </div>

        <div class="form-group">
          <label class="form-label">Limite de envio por hora</label>
          <input type="number" id="dispLimite" class="form-input" value="15" min="1" max="60" style="width:120px;"/>
          <p style="font-size:11px;color:var(--text-muted);margin-top:4px;">O envio roda sozinho, aos poucos, respeitando esse limite — não sai tudo de uma vez.</p>
        </div>

        <div class="form-group">
          <label class="form-label">Contatos (<span id="dispContagemSelecionados">${DISP.contatosSelecionados.size}</span> selecionado${DISP.contatosSelecionados.size !== 1 ? 's' : ''})</label>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <input type="text" id="dispBuscaContato" class="form-input" placeholder="Buscar por nome ou telefone..." value="${DISP.buscaContato}" oninput="dispBuscarContato(this.value)" style="flex:1;"/>
            <button class="btn btn-sm" id="dispBtnSelecionarTodos" onclick="dispSelecionarTodosVisiveis()">Selecionar todos (${listaVisivel.length})</button>
            <button class="btn btn-sm" onclick="dispLimparSelecao()">Limpar</button>
          </div>
          <div id="dispContatosLista" style="max-height:280px;overflow-y:auto;border:1px solid var(--border-subtle);border-radius:8px;">
            ${htmlListaContatos(listaVisivel)}
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:16px;">
          <button class="btn btn-primary" onclick="dispCriarCampanha()"><i class="ti ti-check"></i> Criar Campanha</button>
          <button class="btn" onclick="dispVoltar()">Cancelar</button>
        </div>
      </div>
    `;
  }

  // ⚠️ AJUSTE 28/07: extraído da renderForm pra poder atualizar SÓ a lista
  // (não o formulário inteiro) a cada letra digitada na busca — evitava
  // reconstruir o campo de texto enquanto a pessoa digita nele.
  function htmlListaContatos(lista) {
    return lista.map(l => `
              <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border-subtle);cursor:pointer;">
                <input type="checkbox" ${DISP.contatosSelecionados.has(l.id) ? 'checked' : ''} onchange="dispToggleContato('${l.id}')"/>
                <span style="flex:1;font-size:13px;">${l.nome || 'Sem nome'}</span>
                <span style="font-size:11px;color:var(--text-muted);">${l.telefone || ''}</span>
              </label>`).join('') || '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">Nenhum contato encontrado.</div>';
  }

  function listaFiltrada() {
    const leads = (typeof STATE !== 'undefined' && Array.isArray(STATE.leads)) ? STATE.leads : [];
    const buscaNorm = (DISP.buscaContato || '').toLowerCase();
    const filtrados = buscaNorm
      ? leads.filter(l => (l.nome || '').toLowerCase().includes(buscaNorm) || (l.telefone || '').includes(buscaNorm))
      : leads;
    return filtrados.slice(0, 200);
  }

  // ── ações ──
  window.dispNovaCampanha = function () {
    DISP.mostrandoForm = true;
    DISP.contatosSelecionados = new Set();
    DISP.buscaContato = '';
    DISP.mediaFile = null;
    DISP.mediaPreviewUrl = null;
    render();
  };
  window.dispVoltar = function () { DISP.mostrandoForm = false; render(); };
  window.dispBuscarContato = function (v) {
    DISP.buscaContato = v; // NÃO chama render() aqui — reconstruiria o campo de
    // texto no meio da digitação e resetava o cursor pro início (era exatamente
    // isso que causava "Jean" virar "naeJ": cada letra nova entrava na posição 0).
    const lista = listaFiltrada();
    const listaEl = document.getElementById('dispContatosLista');
    if (listaEl) listaEl.innerHTML = htmlListaContatos(lista);
    const btnTodos = document.getElementById('dispBtnSelecionarTodos');
    if (btnTodos) btnTodos.textContent = `Selecionar todos (${lista.length})`;
  };
  window.dispToggleContato = function (id) {
    if (DISP.contatosSelecionados.has(id)) DISP.contatosSelecionados.delete(id); else DISP.contatosSelecionados.add(id);
  };
  window.dispSelecionarTodosVisiveis = function () {
    const leads = (typeof STATE !== 'undefined' && Array.isArray(STATE.leads)) ? STATE.leads : [];
    const buscaNorm = (DISP.buscaContato || '').toLowerCase();
    const filtrados = buscaNorm ? leads.filter(l => (l.nome || '').toLowerCase().includes(buscaNorm) || (l.telefone || '').includes(buscaNorm)) : leads;
    filtrados.slice(0, 200).forEach(l => DISP.contatosSelecionados.add(l.id));
    render();
  };
  window.dispLimparSelecao = function () { DISP.contatosSelecionados = new Set(); render(); };

  window.dispSelecionarMedia = function (input) {
    const file = input.files[0];
    if (!file) return;
    DISP.mediaFile = file;
    DISP.mediaPreviewUrl = URL.createObjectURL(file);
    render();
    setTimeout(() => document.getElementById('dispMediaInput') && (document.getElementById('dispMediaInput').value = ''), 0);
  };

  window.dispCriarCampanha = async function () {
    const nome = document.getElementById('dispNome')?.value.trim();
    const copy = document.getElementById('dispCopy')?.value.trim();
    const limite = parseInt(document.getElementById('dispLimite')?.value, 10) || 15;
    const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;

    if (!nome) { toast && toast('Dá um nome pra campanha', 'error'); return; }
    if (!copy) { toast && toast('Escreve o texto da mensagem', 'error'); return; }
    if (!DISP.contatosSelecionados.size) { toast && toast('Seleciona pelo menos 1 contato', 'error'); return; }
    if (!clinic) return;

    const sb = getDb();
    let media_url = null, media_tipo = null;

    try {
      if (DISP.mediaFile) {
        toast && toast('Enviando mídia...', 'info');
        const file = DISP.mediaFile;
        const ext = (file.name.split('.').pop() || (file.type.startsWith('video') ? 'mp4' : 'jpg')).toLowerCase();
        const fileName = `disparos/${clinic.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await sb.storage.from('midias').upload(fileName, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = sb.storage.from('midias').getPublicUrl(fileName);
        media_url = pub.publicUrl;
        media_tipo = file.type.startsWith('video') ? 'video' : 'image';
      }

      const { data: campanha, error: errCamp } = await sb.from('disparos_campanhas').insert({
        clinic_id: clinic.id, nome, copy, media_url, media_tipo, limite_por_hora: limite, status: 'rascunho',
      }).select().single();
      if (errCamp) throw errCamp;

      const leads = (typeof STATE !== 'undefined' && Array.isArray(STATE.leads)) ? STATE.leads : [];
      const selecionados = leads.filter(l => DISP.contatosSelecionados.has(l.id));
      const linhas = selecionados.map(l => ({ campanha_id: campanha.id, nome: l.nome || null, telefone: l.telefone, status: 'pendente' }));
      const { error: errFila } = await sb.from('disparos_fila').insert(linhas);
      if (errFila) throw errFila;

      toast && toast('Campanha criada! Clica em "Iniciar" quando quiser começar a mandar.', 'success');
      DISP.mostrandoForm = false;
      renderDisparosPage();
    } catch (e) {
      console.error('[disparos] erro ao criar campanha', e);
      toast && toast('Erro ao criar campanha: ' + (e.message || e), 'error');
    }
  };

  window.dispIniciar = async function (id) {
    await getDb().from('disparos_campanhas').update({ status: 'rodando' }).eq('id', id);
    toast && toast('Campanha iniciada — o envio vai rodar sozinho, aos poucos.', 'success');
    renderDisparosPage();
  };
  window.dispPausar = async function (id) {
    await getDb().from('disparos_campanhas').update({ status: 'pausada' }).eq('id', id);
    toast && toast('Campanha pausada.', 'info');
    renderDisparosPage();
  };
  window.dispExcluir = async function (id) {
    if (!confirm('Excluir essa campanha? Isso apaga a fila de contatos dela também.')) return;
    await getDb().from('disparos_campanhas').delete().eq('id', id);
    renderDisparosPage();
  };

  console.log('✅ disparos-fix.js carregado');
})();
