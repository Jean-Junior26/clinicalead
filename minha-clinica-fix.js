// ============================================================
// CLINICALEAD — MENU "MINHA CLÍNICA" (para o DONO da clínica)
// Área onde o dono gerencia a PRÓPRIA clínica:
//  - Editar dados (nome, responsável, email, telefone, endereço, mapa)
//  - Conectar/reconectar WhatsApp + números extras (reaproveita
//    abrirGerenciarNumeros do multi-whatsapp-fix.js)
//  - Ver status do WhatsApp
// NÃO aparece pro admin master (você já tem o painel "Clínicas").
// ============================================================

(function () {
  'use strict';

  const MC = { clinic: null };

  function ehAdminMaster() {
    const role = STATE?.profile?.role;
    return role === 'admin' || role === 'administrador';
  }

  // Link do mapa: usa o manual; se vazio, gera do endereço
  function montarLinkMapa(endereco, linkManual) {
    const lm = (linkManual || '').trim();
    if (lm) return lm;
    const e = (endereco || '').trim();
    if (!e) return '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e)}`;
  }

  // ── injeta o item no menu lateral (seção GESTÃO) ──────────
  function injetarMenu() {
    if (typeof STATE === 'undefined' || !STATE.profile) return false;
    if (document.getElementById('navMinhaClinica')) return true; // já existe

    // acha a lista de navegação
    const navRef = document.querySelector('.nav-item[data-page]');
    if (!navRef) return false;
    const navContainer = navRef.parentElement;
    if (!navContainer) return false;

    const item = document.createElement('a');
    item.id = 'navMinhaClinica';
    item.className = navRef.className; // copia o estilo dos outros itens
    item.setAttribute('data-page', 'minha-clinica');
    item.style.cursor = 'pointer';
    item.innerHTML = '<i class="ti ti-building-store"></i><span>Minha Clínica</span>';
    item.onclick = function (e) {
      e.preventDefault();
      abrirMinhaClinica();
    };
    navContainer.appendChild(item);
    return true;
  }

  // ── garante a página (casca) ─────────────────────────────
  function garantirPagina() {
    if (document.getElementById('page-minha-clinica')) return;
    // acha onde as páginas ficam (irmã de outra .page)
    const algumaPagina = document.querySelector('.page');
    const container = algumaPagina ? algumaPagina.parentElement : document.querySelector('main') || document.body;
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'page-minha-clinica';
    page.innerHTML = `
      <div class="page-header" style="margin-bottom:18px;">
        <div>
          <h1 style="margin:0;">Minha Clínica</h1>
          <p style="color:var(--text-muted);font-size:13px;margin:4px 0 0;">Gerencie os dados e o WhatsApp da sua clínica</p>
        </div>
      </div>
      <div id="mcConteudo"></div>`;
    container.appendChild(page);
  }

  // ── abre a página "Minha Clínica" ────────────────────────
  window.abrirMinhaClinica = function () {
    garantirPagina();
    // usa o sistema de classe 'active' do app (igual showPage faz)
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const page = document.getElementById('page-minha-clinica');
    if (page) page.classList.add('active');
    const item = document.getElementById('navMinhaClinica');
    if (item) item.classList.add('active');
    // renderiza o conteúdo (não depende do renderPage do sistema)
    renderMinhaClinica();
  };

  // ── renderiza o conteúdo (dados + whatsapp) ──────────────
  function renderMinhaClinica() {
    // pega a clínica ativa do dono
    MC.clinic = (typeof currentClinic === 'function' ? currentClinic() : null)
      || (STATE.clinics || [])[0];
    const c = MC.clinic;
    const box = document.getElementById('mcConteudo');
    if (!c) {
      box.innerHTML = '<div class="card" style="padding:20px;">Nenhuma clínica encontrada.</div>';
      return;
    }

    const waConectado = !!c.whatsapp_instance;
    const waLabel = waConectado ? 'Conectado' : 'Não conectado';
    const waCor = waConectado ? '#3FB950' : 'var(--text-muted)';

    box.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;">

        <!-- CARD: Dados da clínica -->
        <div class="card" style="padding:20px;">
          <h3 style="margin:0 0 16px;font-size:15px;"><i class="ti ti-edit" style="color:var(--gold);margin-right:8px;"></i>Dados da clínica</h3>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div>
              <label class="form-label" style="font-size:12px;color:var(--text-muted);">Nome da clínica</label>
              <input class="form-input" id="mcNome" value="${(c.nome || '').replace(/"/g, '&quot;')}" style="width:100%;"/>
            </div>
            <div>
              <label class="form-label" style="font-size:12px;color:var(--text-muted);">Responsável</label>
              <input class="form-input" id="mcResponsavel" value="${(c.responsavel || '').replace(/"/g, '&quot;')}" style="width:100%;"/>
            </div>
            <div>
              <label class="form-label" style="font-size:12px;color:var(--text-muted);">E-mail</label>
              <input class="form-input" id="mcEmail" value="${(c.email || '').replace(/"/g, '&quot;')}" style="width:100%;"/>
            </div>
            <div>
              <label class="form-label" style="font-size:12px;color:var(--text-muted);">Telefone</label>
              <input class="form-input" id="mcTelefone" value="${(c.telefone || '').replace(/"/g, '&quot;')}" style="width:100%;"/>
            </div>
            <div>
              <label class="form-label" style="font-size:12px;color:var(--text-muted);">Endereço completo</label>
              <input class="form-input" id="mcEndereco" value="${(c.endereco || '').replace(/"/g, '&quot;')}" placeholder="Rua, número - Bairro, Cidade - UF, CEP" style="width:100%;"/>
            </div>
            <div>
              <label class="form-label" style="font-size:12px;color:var(--text-muted);">Link do mapa (opcional)</label>
              <input class="form-input" id="mcLinkMapa" value="${(c.link_mapa || '').replace(/"/g, '&quot;')}" placeholder="Cole o link do Google Maps, ou deixe vazio pra gerar automático" style="width:100%;"/>
              <span style="font-size:11px;color:var(--text-muted);">Se deixar vazio, geramos o link a partir do endereço.</span>
            </div>
            <div>
              <label class="form-label" style="font-size:12px;color:var(--text-muted);">Logo da clínica (aparece nos orçamentos e receitas)</label>
              <div style="display:flex;align-items:center;gap:12px;margin-top:4px;">
                <div id="mcLogoPreview" style="width:64px;height:64px;border-radius:10px;border:1px solid var(--border-subtle,#2a2a2a);background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
                  ${c.logo_url ? `<img src="${c.logo_url}" style="width:100%;height:100%;object-fit:contain;">` : '<i class="ti ti-photo" style="color:var(--text-muted);font-size:24px;"></i>'}
                </div>
                <div style="flex:1;">
                  <input type="file" id="mcLogoInput" accept="image/*" style="display:none;" onchange="uploadLogoClinica(this)">
                  <button type="button" class="btn btn-sm" onclick="document.getElementById('mcLogoInput').click()" style="background:var(--bg-elevated);border:1px solid var(--border-subtle,#2a2a2a);">
                    <i class="ti ti-upload"></i> ${c.logo_url ? 'Trocar logo' : 'Enviar logo'}
                  </button>
                  <div id="mcLogoMsg" style="font-size:11px;color:var(--text-muted);margin-top:4px;">PNG ou JPG, de preferência fundo transparente.</div>
                </div>
              </div>
            </div>
            <div>
              <label class="form-label" style="font-size:12px;color:var(--text-muted);">Mensagem do rodapé do orçamento (opcional)</label>
              <textarea class="form-input" id="mcOrcRodape" rows="2" placeholder="Ex: Este orçamento é válido por 7 dias. Agradecemos a confiança!" style="width:100%;resize:vertical;">${(c.orcamento_rodape || '').replace(/</g, '&lt;')}</textarea>
              <span style="font-size:11px;color:var(--text-muted);">Aparece no fim dos orçamentos impressos. Se vazio, usamos um texto padrão.</span>
            </div>
            <button class="btn btn-primary" id="mcBtnSalvar" onclick="salvarMinhaClinica()" style="margin-top:4px;">
              <i class="ti ti-device-floppy"></i> Salvar dados
            </button>
            <div id="mcMsg" style="font-size:12px;min-height:16px;"></div>
          </div>
        </div>

        <!-- CARD: WhatsApp -->
        <div class="card" style="padding:20px;">
          <h3 style="margin:0 0 16px;font-size:15px;"><i class="ti ti-brand-whatsapp" style="color:#25D366;margin-right:8px;"></i>WhatsApp</h3>
          <div style="padding:14px;background:var(--bg-elevated);border-radius:10px;margin-bottom:14px;">
            <div style="font-size:13px;color:var(--text-muted);">Status do número principal</div>
            <div style="font-size:15px;font-weight:600;color:${waCor};margin-top:4px;">● ${waLabel}</div>
          </div>
          ${!waConectado ? `
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">
            Seu WhatsApp principal ainda não está conectado. Conecte agora escaneando o QR Code:
          </p>
          <button class="btn btn-primary" onclick="mcConectarPrincipal('${c.id}')" style="width:100%;margin-bottom:12px;">
            <i class="ti ti-qrcode"></i> Conectar WhatsApp principal
          </button>
          ` : ''}
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
            ${waConectado ? 'Reconecte o WhatsApp ou gerencie números extras (recepção, comercial, etc).' : 'Você também pode adicionar e gerenciar números extras:'}
          </p>
          <button class="btn ${waConectado ? 'btn-primary' : ''}" onclick="abrirGerenciarNumeros('${c.id}')" style="width:100%;${waConectado ? '' : 'background:var(--bg-elevated);'}">
            <i class="ti ti-${waConectado ? 'qrcode' : 'plus'}"></i> ${waConectado ? 'Gerenciar / Reconectar WhatsApp' : 'Gerenciar números extras'}
          </button>
        </div>

      </div>`;
  }

  // ── salva os dados editados ──────────────────────────────
  // ── Upload da logo da clínica pro Storage ────────────────
  window.uploadLogoClinica = async function (input) {
    const c = MC.clinic;
    if (!c || !input.files || !input.files[0]) return;
    const file = input.files[0];
    const msg = document.getElementById('mcLogoMsg');
    const setMsg = (t, cor) => { if (msg) { msg.textContent = t; msg.style.color = cor || 'var(--text-muted)'; } };

    // valida tamanho (máx 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setMsg('Imagem muito grande (máx 2MB).', 'var(--coral)');
      return;
    }

    setMsg('Enviando logo…');
    try {
      // nome único: logo da clínica + timestamp (evita cache velho)
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const caminho = `${c.id}/logo_${Date.now()}.${ext}`;

      const { error: upErr } = await db.storage.from('logos').upload(caminho, file, {
        upsert: true, contentType: file.type,
      });
      if (upErr) throw upErr;

      // pega a URL pública
      const { data: pub } = db.storage.from('logos').getPublicUrl(caminho);
      const logo_url = pub.publicUrl;

      // salva na clínica
      const { error: dbErr } = await db.from('clinicas').update({ logo_url }).eq('id', c.id);
      if (dbErr) throw dbErr;

      // atualiza estado + preview
      c.logo_url = logo_url;
      const idx = (STATE.clinics || []).findIndex(x => x.id === c.id);
      if (idx >= 0) STATE.clinics[idx].logo_url = logo_url;
      const prev = document.getElementById('mcLogoPreview');
      if (prev) prev.innerHTML = `<img src="${logo_url}" style="width:100%;height:100%;object-fit:contain;">`;

      setMsg('Logo enviada! ✓', 'var(--gold)');
      if (typeof toast === 'function') toast('Logo atualizada! ✓');
    } catch (e) {
      console.error('[logo] erro:', e);
      setMsg('Erro ao enviar: ' + (e.message || 'tente de novo'), 'var(--coral)');
    }
  };

  window.salvarMinhaClinica = async function () {
    const c = MC.clinic;
    if (!c) return;
    const msg = document.getElementById('mcMsg');
    const btn = document.getElementById('mcBtnSalvar');
    const setMsg = (t, cor) => { if (msg) { msg.textContent = t; msg.style.color = cor || 'var(--text-muted)'; } };

    const nome = (document.getElementById('mcNome').value || '').trim();
    if (!nome) { setMsg('O nome da clínica é obrigatório.', 'var(--coral)'); return; }
    const responsavel = (document.getElementById('mcResponsavel').value || '').trim();
    const email = (document.getElementById('mcEmail').value || '').trim();
    const telefone = (document.getElementById('mcTelefone').value || '').trim();
    const endereco = (document.getElementById('mcEndereco').value || '').trim();
    const linkManual = (document.getElementById('mcLinkMapa').value || '').trim();
    const link_mapa = montarLinkMapa(endereco, linkManual);
    const orcamento_rodape = (document.getElementById('mcOrcRodape')?.value || '').trim();

    btn.disabled = true; btn.style.opacity = '0.6';
    setMsg('Salvando…');
    try {
      const { error } = await db.from('clinicas')
        .update({ nome, responsavel, email, telefone, endereco, link_mapa, orcamento_rodape })
        .eq('id', c.id);
      if (error) throw error;

      // atualiza o estado local pra refletir na hora
      Object.assign(c, { nome, responsavel, email, telefone, endereco, link_mapa, orcamento_rodape });
      const idx = (STATE.clinics || []).findIndex(x => x.id === c.id);
      if (idx >= 0) Object.assign(STATE.clinics[idx], { nome, responsavel, email, telefone, endereco, link_mapa, orcamento_rodape });

      setMsg('Dados salvos com sucesso! ✓', 'var(--gold)');
      if (typeof toast === 'function') toast('Clínica atualizada! ✓');
      // re-render pra refletir o link gerado, se foi o caso
      setTimeout(renderMinhaClinica, 400);
    } catch (e) {
      console.error('[minha-clinica] erro ao salvar:', e);
      setMsg('Erro ao salvar: ' + (e.message || 'tente de novo'), 'var(--coral)');
      btn.disabled = false; btn.style.opacity = '1';
    }
  };

  // ── conectar o WhatsApp principal (reaproveita a função do sistema) ──
  window.mcConectarPrincipal = function (clinicId) {
    if (typeof conectarWhatsAppClinica === 'function') {
      conectarWhatsAppClinica(clinicId);
    } else if (typeof abrirGerenciarNumeros === 'function') {
      // fallback: abre o gerenciador de números
      abrirGerenciarNumeros(clinicId);
    } else {
      if (typeof toast === 'function') toast('Função de conexão não disponível', 'error');
    }
  };

  // ── inicialização ────────────────────────────────────────
  function iniciar() {
    if (typeof STATE === 'undefined') return false;
    garantirPagina();
    injetarMenu();
    // MARTELO: tenta injetar repetidamente nos primeiros segundos.
    // Necessário porque o role do usuário pode ser corrigido DEPOIS
    // do primeiro carregamento (corrige-role-admin-fix). A cada tentativa
    // reavalia ehAdminMaster(), então quando o dono deixa de ser "admin
    // falso", o menu é finalmente injetado.
    let n = 0;
    const iv = setInterval(() => {
      garantirPagina();
      injetarMenu();
      if (++n > 40) clearInterval(iv); // ~20s
    }, 500);
    // observa re-render do menu pra reinjetar
    const obs = new MutationObserver(() => {
      if (!ehAdminMaster() && !document.getElementById('navMinhaClinica')) {
        clearTimeout(window.__minhaClinicaTimer);
        window.__minhaClinicaTimer = setTimeout(injetarMenu, 300);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    console.log('✅ minha-clinica-fix.js carregado');
    return true;
  }

  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
