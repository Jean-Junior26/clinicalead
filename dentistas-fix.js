// ============================================================
// CLINICALEAD — DENTISTAS (Fase 1: cadastro)
// Tela "Dentistas": cadastra os dentistas da clínica (nome + cor).
// Núcleo do multi-dentista. A Fase 2 usa esses dentistas no agendamento.
// Carregar como script novo no index.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }

  let DENT = { lista: [], clinicId: null };

  // carrega os dentistas da clínica ATUAL (sempre filtrando pela clínica certa)
  async function carregar() {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic) { DENT.lista = []; DENT.clinicId = null; return; }
    try {
      const { data } = await database.from('dentistas').select('*').eq('clinic_id', clinic.id).eq('ativo', true).order('nome');
      DENT.lista = data || [];
      DENT.clinicId = clinic.id; // marca de qual clínica é a lista
    } catch (e) { console.error('[dentistas] carregar', e); DENT.lista = []; DENT.clinicId = null; }
  }

  // expõe pra outros fixes usarem (Fase 2)
  // IMPORTANTE: só retorna a lista se for da clínica ATUAL (evita vazamento entre clínicas)
  window.DENT_carregar = carregar;
  window.DENT_lista = () => {
    const clinic = clinicAtual();
    // se a lista carregada não é da clínica atual, retorna vazio (e dispara recarga)
    if (!clinic || DENT.clinicId !== clinic.id) {
      carregar(); // recarrega pra clínica certa (assíncrono, próxima chamada já vem certa)
      return [];
    }
    return DENT.lista;
  };

  // ── abre o modal de gestão de dentistas ──
  window.openDentistas = async function () {
    await carregar();
    renderModal();
  };

  function renderModal() {
    let modal = document.getElementById('modalDentistas');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'modalDentistas';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="background:var(--bg-surface,#141414);border:1px solid var(--gold-border,rgba(201,168,76,0.25));border-radius:14px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;">
        <div style="padding:20px 24px;border-bottom:1px solid var(--gold-border,rgba(201,168,76,0.15));display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:17px;font-weight:600;color:var(--gold,#C9A84C);">🦷 Dentistas</div>
          <button id="dtFechar" style="background:none;border:none;color:var(--text-secondary,#8A8570);font-size:22px;cursor:pointer;">&times;</button>
        </div>
        <div style="padding:16px 24px;">
          <p style="font-size:12px;color:var(--text-secondary,#8A8570);margin:0 0 14px;line-height:1.5;">Cadastre os dentistas que atendem na clínica. Ao agendar, você escolhe o dentista — assim o mesmo horário pode ter um paciente para cada dentista.</p>
          <div style="display:flex;gap:8px;margin-bottom:16px;">
            <input type="text" id="dtNovoNome" placeholder="Nome do dentista" style="flex:1;padding:9px 12px;border-radius:8px;background:var(--bg-input,#16161A);border:1px solid var(--gold-border,rgba(201,168,76,0.25));color:var(--text-primary,#F0EAD6);font-size:14px;">
            <input type="color" id="dtNovaCor" value="#C9A84C" title="Cor na agenda" style="width:42px;height:40px;border:none;border-radius:8px;background:none;cursor:pointer;">
            <button id="dtAdicionar" style="background:var(--gold,#C9A84C);color:#0A0A0B;border:none;border-radius:8px;padding:0 16px;font-weight:600;cursor:pointer;">+ Add</button>
          </div>
          <div id="dtLista"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('dtFechar').onclick = () => modal.remove();
    document.getElementById('dtAdicionar').onclick = adicionar;
    document.getElementById('dtNovoNome').addEventListener('keydown', e => { if (e.key === 'Enter') adicionar(); });
    renderLista();
  }

  function renderLista() {
    const wrap = document.getElementById('dtLista');
    if (!wrap) return;
    if (!DENT.lista.length) {
      wrap.innerHTML = '<p style="font-size:13px;color:var(--text-muted,#4A4840);text-align:center;padding:16px;">Nenhum dentista cadastrado ainda.</p>';
      return;
    }
    wrap.innerHTML = DENT.lista.map(d => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--gold-border,rgba(201,168,76,0.15));border-radius:8px;margin-bottom:8px;background:var(--bg-card,#1C1C20);">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="width:14px;height:14px;border-radius:50%;background:${d.cor || '#C9A84C'};display:inline-block;"></span>
          <span style="font-size:14px;color:var(--text-primary,#F0EAD6);font-weight:500;">${d.nome}</span>
        </div>
        <button data-id="${d.id}" class="dt-remover" style="background:none;border:1px solid var(--coral,#C0624A);color:var(--coral,#C0624A);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;">Remover</button>
      </div>`).join('');
    wrap.querySelectorAll('.dt-remover').forEach(b => b.onclick = () => remover(b.dataset.id));
  }

  async function adicionar() {
    const database = getDb(); const clinic = clinicAtual();
    const nome = (document.getElementById('dtNovoNome').value || '').trim();
    const cor = document.getElementById('dtNovaCor').value || '#C9A84C';
    if (!nome) { if (typeof toast === 'function') toast('Digite o nome do dentista', 'error'); return; }
    try {
      const { error } = await database.from('dentistas').insert({ clinic_id: clinic.id, nome, cor });
      if (error) { if (typeof toast === 'function') toast('Erro: ' + error.message, 'error'); return; }
      if (typeof toast === 'function') toast('Dentista adicionado! ✓');
      document.getElementById('dtNovoNome').value = '';
      await carregar(); renderLista();
    } catch (e) { if (typeof toast === 'function') toast('Erro: ' + e.message, 'error'); }
  }

  async function remover(id) {
    if (!confirm('Remover este dentista? As consultas dele continuam, mas sem dentista vinculado.')) return;
    const database = getDb();
    try {
      // soft delete (ativo=false) pra não quebrar consultas existentes
      const { error } = await database.from('dentistas').update({ ativo: false }).eq('id', id);
      if (error) { if (typeof toast === 'function') toast('Erro: ' + error.message, 'error'); return; }
      if (typeof toast === 'function') toast('Dentista removido');
      await carregar(); renderLista();
    } catch (e) { if (typeof toast === 'function') toast('Erro: ' + e.message, 'error'); }
  }

  // ── injeta o botão "Dentistas" nas ações da agenda ──
  function injetarBotao() {
    if (document.getElementById('btnDentistas')) return;
    const candidatos = Array.from(document.querySelectorAll('button')).filter(b => /configurar hor|hor\u00e1rio-padr/i.test(b.textContent || ''));
    const ref = candidatos[0];
    if (!ref) return;
    const b = document.createElement('button');
    b.id = 'btnDentistas';
    b.className = ref.className;
    b.style.cssText = (ref.style.cssText || '') + ';margin-right:8px;';
    b.innerHTML = '<i class="ti ti-dental"></i> Dentistas';
    b.onclick = window.openDentistas;
    ref.parentElement.insertBefore(b, ref);
  }

  if (typeof renderAgenda === 'function') {
    const _orig = renderAgenda;
    window.renderAgenda = function (...args) { const r = _orig.apply(this, args); setTimeout(injetarBotao, 250); return r; };
  }
  setTimeout(injetarBotao, 1300);

  // pré-carrega
  setTimeout(carregar, 1500);

  // ── DETECTOR DE TROCA DE CLÍNICA (evita vazamento de dentistas entre clínicas) ──
  // se a clínica atual mudar, recarrega a lista de dentistas pra clínica certa.
  let ultimaClinicId = null;
  setInterval(() => {
    const clinic = clinicAtual();
    const id = clinic ? clinic.id : null;
    if (id !== ultimaClinicId) {
      ultimaClinicId = id;
      DENT.lista = [];      // limpa imediatamente (não mostra dentista da clínica anterior)
      DENT.clinicId = null;
      carregar();           // recarrega pra clínica nova
    }
  }, 1500);

  console.log('✅ dentistas-fix.js carregado (Fase 1)');
})();
