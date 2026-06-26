// ════════════════════════════════════════════════════════════
// BRIAN — BANCO DE CASOS (antes/depois) — tela de upload
// Adiciona um item "📸 Casos do Brian" no menu lateral.
// A clínica sobe fotos de casos por procedimento; o Brian envia no momento certo.
// Carregar DEPOIS de brian-fix.js
// ════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const db = () => (typeof supabaseClient !== 'undefined' ? supabaseClient : (typeof supabase !== 'undefined' ? supabase : null));
  const getClinic = () => (typeof currentClinic === 'function' ? currentClinic() : (typeof clinic !== 'undefined' ? clinic : null));

  // procedimentos sugeridos (a clínica pode digitar outros)
  const PROCEDIMENTOS = [
    'Lentes em Resina', 'Lentes de Porcelana', 'Clareamento', 'Facetas',
    'Implante', 'Aparelho', 'Harmonização Orofacial', 'Prótese',
    'Limpeza', 'Tratamento de Canal', 'Design do Sorriso', 'Outro',
  ];

  function injetarMenu() {
    if (document.getElementById('navBrianCasos')) return;
    // tenta achar o item do Brian IA pra colocar logo depois
    const ancora = document.getElementById('navBrian') ||
      [...document.querySelectorAll('.nav-item')].find(n => /brian/i.test(n.textContent));
    const menu = ancora ? ancora.parentNode : document.querySelector('.sidebar, .nav, nav');
    if (!menu) return;
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = 'navBrianCasos';
    btn.innerHTML = '<i class="ti ti-photo"></i> Casos Brian IA';
    btn.onclick = abrirCasos;
    if (ancora && ancora.nextSibling) menu.insertBefore(btn, ancora.nextSibling);
    else menu.appendChild(btn);
  }

  async function abrirCasos() {
    const clinic = getClinic();
    if (!clinic || !clinic.id) { if (typeof toast === 'function') toast('Selecione uma clínica', 'error'); return; }
    montarModal();
    await carregarCasos();
  }

  function montarModal() {
    let modal = document.getElementById('brianCasosModal');
    if (modal) { modal.style.display = 'flex'; return; }
    modal = document.createElement('div');
    modal.id = 'brianCasosModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,rgba(201,168,76,0.25));border-radius:14px;max-width:760px;width:100%;max-height:88vh;overflow-y:auto;padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <h2 style="margin:0;color:var(--gold,#C9A84C);font-size:20px;">📸 Casos Brian IA</h2>
          <button onclick="document.getElementById('brianCasosModal').style.display='none'" style="background:none;border:none;color:var(--text-secondary);font-size:22px;cursor:pointer;">×</button>
        </div>
        <p style="color:var(--text-muted);font-size:13px;margin:0 0 18px;">Suba fotos de casos (antes/depois) por procedimento. No momento certo da conversa, o Brian envia 1–2 casos pra mostrar o resultado. 🦷✨</p>

        <div style="background:var(--bg-input,#16161A);border:1px solid var(--border,rgba(201,168,76,0.15));border-radius:10px;padding:16px;margin-bottom:20px;">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:10px;">➕ Adicionar caso</div>
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Procedimento</label>
          <select id="brianCasoProc" style="width:100%;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--border,rgba(201,168,76,0.2));color:var(--text-primary);margin-bottom:10px;font-size:13px;">
            ${PROCEDIMENTOS.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
          <input id="brianCasoProcOutro" placeholder="Se escolheu 'Outro', digite o procedimento" style="width:100%;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--border,rgba(201,168,76,0.2));color:var(--text-primary);margin-bottom:10px;font-size:13px;display:none;">
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Legenda (opcional)</label>
          <input id="brianCasoLegenda" placeholder="Ex: Caso real de lentes em resina ✨" style="width:100%;padding:9px;border-radius:8px;background:var(--bg-base,#0A0A0B);border:1px solid var(--border,rgba(201,168,76,0.2));color:var(--text-primary);margin-bottom:10px;font-size:13px;">
          <label style="font-size:12px;color:var(--text-secondary);display:block;margin-bottom:4px;">Foto do caso</label>
          <input type="file" id="brianCasoFile" accept="image/*" style="width:100%;color:var(--text-secondary);font-size:12px;margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <button id="brianCasoBtnSalvar" style="background:var(--gold,#C9A84C);color:#0A0A0B;border:none;border-radius:8px;padding:9px 18px;font-weight:600;cursor:pointer;font-size:13px;">Salvar caso</button>
            <span id="brianCasoStatus" style="font-size:12px;color:var(--text-muted);"></span>
          </div>
          <p style="color:var(--text-muted);font-size:11px;margin:10px 0 0;line-height:1.4;">⚠️ Use apenas imagens com autorização de uso do paciente (conforme as normas do CFO). Você é responsável pelo conteúdo enviado.</p>
        </div>

        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:10px;">Casos cadastrados</div>
        <div id="brianCasosLista" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;">
          <div style="color:var(--text-muted);font-size:13px;">Carregando…</div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // mostra campo "outro" quando seleciona Outro
    document.getElementById('brianCasoProc').onchange = function () {
      document.getElementById('brianCasoProcOutro').style.display = this.value === 'Outro' ? 'block' : 'none';
    };
    document.getElementById('brianCasoBtnSalvar').onclick = salvarCaso;
  }

  function setStatus(t) { const e = document.getElementById('brianCasoStatus'); if (e) e.textContent = t || ''; }

  async function salvarCaso() {
    const clinic = getClinic();
    const sb = db();
    if (!clinic || !sb) return;
    const sel = document.getElementById('brianCasoProc').value;
    const proc = sel === 'Outro' ? (document.getElementById('brianCasoProcOutro').value || '').trim() : sel;
    const legenda = (document.getElementById('brianCasoLegenda').value || '').trim();
    const fileInput = document.getElementById('brianCasoFile');
    const file = fileInput.files && fileInput.files[0];
    if (!proc) { setStatus('Escolha o procedimento'); return; }
    if (!file) { setStatus('Selecione uma foto'); return; }

    setStatus('Enviando imagem…');
    try {
      // sobe a imagem pro bucket 'midias' (mesmo do inbox)
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const fileName = `casos/${clinic.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await sb.storage.from('midias').upload(fileName, file, {
        contentType: file.type || 'image/jpeg', upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = sb.storage.from('midias').getPublicUrl(fileName);
      const imagem_url = pub.publicUrl;

      // salva o registro na tabela
      const { error: insErr } = await sb.from('brian_casos').insert({
        clinic_id: clinic.id, procedimento: proc, imagem_url, legenda: legenda || null, ativo: true,
      });
      if (insErr) throw insErr;

      setStatus('Salvo! ✓');
      fileInput.value = '';
      document.getElementById('brianCasoLegenda').value = '';
      await carregarCasos();
      if (typeof toast === 'function') toast('Caso adicionado! 📸');
    } catch (e) {
      setStatus('Erro: ' + (e.message || 'falhou'));
      console.error('[brian casos salvar]', e);
    }
  }

  async function carregarCasos() {
    const clinic = getClinic();
    const sb = db();
    const lista = document.getElementById('brianCasosLista');
    if (!clinic || !sb || !lista) return;
    try {
      const { data } = await sb.from('brian_casos').select('*').eq('clinic_id', clinic.id).order('procedimento', { ascending: true }).order('created_at', { ascending: false });
      const casos = data || [];
      if (!casos.length) {
        lista.innerHTML = '<div style="color:var(--text-muted);font-size:13px;grid-column:1/-1;">Nenhum caso cadastrado ainda. Adicione o primeiro acima! ☝️</div>';
        return;
      }
      lista.innerHTML = casos.map(c => `
        <div style="border:1px solid var(--border,rgba(201,168,76,0.15));border-radius:10px;overflow:hidden;background:var(--bg-input,#16161A);">
          <img src="${c.imagem_url}" style="width:100%;height:120px;object-fit:cover;display:block;" onerror="this.style.opacity=0.3;">
          <div style="padding:8px;">
            <div style="font-size:11px;font-weight:600;color:var(--gold,#C9A84C);margin-bottom:2px;">${c.procedimento}</div>
            ${c.legenda ? `<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;line-height:1.3;">${c.legenda}</div>` : ''}
            <button onclick="brianCasoExcluir('${c.id}')" style="background:var(--coral,#C0624A);color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;width:100%;">Excluir</button>
          </div>
        </div>`).join('');
    } catch (e) {
      lista.innerHTML = '<div style="color:var(--coral,#C0624A);font-size:13px;">Erro ao carregar casos</div>';
      console.error('[brian casos carregar]', e);
    }
  }

  window.brianCasoExcluir = async function (id) {
    const sb = db();
    if (!sb) return;
    if (!confirm('Excluir este caso?')) return;
    try {
      await sb.from('brian_casos').delete().eq('id', id);
      await carregarCasos();
      if (typeof toast === 'function') toast('Caso excluído');
    } catch (e) { console.error('[brian caso excluir]', e); }
  };

  // injeta o menu quando a página carrega
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(injetarMenu, 600));
  } else {
    setTimeout(injetarMenu, 600);
  }
  // reforço: tenta de novo após 2s (caso o menu carregue depois)
  setTimeout(injetarMenu, 2000);
})();
