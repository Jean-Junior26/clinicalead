// ============================================================
// CLINICALEAD — DESCONECTAR/RECONECTAR números de WhatsApp
// Adiciona o botão "Desconectar" em cada número (Principal + extras).
// Ao desconectar, o botão vira "Conectar" pra gerar novo QR code.
// Carregar como script novo no index (DEPOIS dos scripts de WhatsApp).
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }

  // espera as funções originais existirem antes de sobrescrever
  function instalar() {
    if (typeof window.linhaNumero !== 'function' || typeof window.carregarNumeros !== 'function') return false;

    // ── sobrescreve linhaNumero pra incluir o botão Desconectar ──
    window.linhaNumero = function (nome, instanceName, conectado, instId) {
      const cor = conectado ? '#3FB950' : 'var(--text-muted)';
      const status = conectado ? 'Conectado' : 'Não conectado';
      let acoes;

      if (instId) {
        // NÚMERO EXTRA
        if (conectado) {
          acoes = `
            <button class="btn btn-sm" onclick="conectarNumero('${instId}')"><i class="ti ti-qrcode"></i> Reconectar</button>
            <button class="btn btn-sm" onclick="desconectarNumeroExtra('${instId}')"><i class="ti ti-plug-off"></i> Desconectar</button>
            <button class="btn btn-sm btn-danger" onclick="removerNumero('${instId}')"><i class="ti ti-trash"></i></button>`;
        } else {
          acoes = `
            <button class="btn btn-sm" onclick="conectarNumero('${instId}')"><i class="ti ti-qrcode"></i> Conectar</button>
            <button class="btn btn-sm btn-danger" onclick="removerNumero('${instId}')"><i class="ti ti-trash"></i></button>`;
        }
      } else {
        // NÚMERO PRINCIPAL (antes não tinha botão nenhum)
        const clinicId = (typeof currentClinic === 'function' && currentClinic()) ? currentClinic().id : '';
        if (conectado) {
          acoes = `
            <button class="btn btn-sm" onclick="reconectarPrincipal()"><i class="ti ti-qrcode"></i> Reconectar</button>
            <button class="btn btn-sm" onclick="desconectarPrincipal('${clinicId}')"><i class="ti ti-plug-off"></i> Desconectar</button>
            <span style="font-size:11px;color:var(--text-muted);align-self:center;">principal</span>`;
        } else {
          acoes = `
            <button class="btn btn-sm" onclick="reconectarPrincipal()"><i class="ti ti-qrcode"></i> Conectar</button>
            <span style="font-size:11px;color:var(--text-muted);align-self:center;">principal</span>`;
        }
      }

      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;background:var(--bg-elevated);border-radius:10px;margin-bottom:8px;">
          <div>
            <div style="font-weight:600;">${nome}</div>
            <div style="font-size:12px;color:${cor};">● ${status}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:end;">${acoes}</div>
        </div>`;
    };

    // ── desconectar o número PRINCIPAL ──
    window.desconectarPrincipal = async function (clinicId) {
      const clinic = (STATE.clinics || []).find(c => c.id === clinicId) || (typeof currentClinic === 'function' ? currentClinic() : null);
      if (!clinic || !clinic.whatsapp_instance) { if (typeof toast === 'function') toast('Número principal não está conectado', 'error'); return; }
      if (!confirm(`Desconectar o número PRINCIPAL da clínica "${clinic.nome}"?\n\n⚠️ O Brian, lembretes, automações e o Inbox deste número param até reconectar.`)) return;
      if (typeof toast === 'function') toast('Desconectando…');
      try {
        // encerra a sessão no Evolution (mas NÃO apaga a instância — pra poder reconectar)
        if (typeof evoRequest === 'function') {
          await evoRequest('DELETE', `/instance/logout/${clinic.whatsapp_instance}`).catch(() => {});
        }
        if (typeof toast === 'function') toast('Número principal desconectado. Clique em Conectar pra gerar novo QR.', 'success');
        // recarrega o painel pra atualizar os botões
        if (typeof carregarNumeros === 'function') carregarNumeros();
      } catch (e) {
        console.error('[desconectar-principal]', e);
        if (typeof toast === 'function') toast('Erro ao desconectar', 'error');
      }
    };

    // ── reconectar/conectar o PRINCIPAL (gera QR sem apagar a instância) ──
    window.reconectarPrincipal = async function () {
      const clinic = (typeof currentClinic === 'function') ? currentClinic() : null;
      if (!clinic || !clinic.whatsapp_instance) { if (typeof toast === 'function') toast('Instância principal não encontrada', 'error'); return; }
      if (typeof reconectarWhatsApp === 'function') {
        reconectarWhatsApp(clinic.whatsapp_instance); // já gera e mostra o QR
      } else if (typeof toast === 'function') {
        toast('Função de reconexão indisponível', 'error');
      }
    };

    // ── desconectar um número EXTRA (encerra sessão, mantém o cadastro pra reconectar) ──
    window.desconectarNumeroExtra = async function (instId) {
      const database = getDb();
      // busca o número direto na tabela 'instancias' (fonte real), não só no cache MWA
      let inst = (window.MWA && MWA.instancias) ? MWA.instancias.find(i => String(i.id) === String(instId)) : null;
      if (!inst) {
        try {
          const { data } = await database.from('instancias').select('*').eq('id', instId).maybeSingle();
          inst = data;
        } catch (e) {}
      }
      if (!inst) { if (typeof toast === 'function') toast('Número não encontrado', 'error'); return; }
      if (!confirm(`Desconectar o número "${inst.nome_exibicao}"?\n\n⚠️ O Inbox e o atendimento deste número param até reconectar. (O cadastro é mantido — você reconecta quando quiser.)`)) return;
      if (typeof toast === 'function') toast('Desconectando…');
      try {
        // encerra a sessão no Evolution (mantém a instância pra reconectar)
        if (typeof evoRequest === 'function') {
          await evoRequest('DELETE', `/instance/logout/${inst.instance_name}`).catch(() => {});
        }
        // marca como não conectado no banco (pra o painel mostrar "Conectar")
        await database.from('instancias').update({ conectado: false }).eq('id', instId);
        if (typeof toast === 'function') toast('Número desconectado. Clique em Conectar pra gerar novo QR.', 'success');
        if (typeof carregarNumeros === 'function') await carregarNumeros();
      } catch (e) {
        console.error('[desconectar-extra]', e);
        if (typeof toast === 'function') toast('Erro ao desconectar', 'error');
      }
    };

    // re-renderiza o painel se ele estiver aberto agora
    if (typeof carregarNumeros === 'function' && document.getElementById('listaNumeros')) {
      try { carregarNumeros(); } catch (e) {}
    }

    console.log('✅ numeros-desconectar-fix.js carregado');
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 25000);
  }
})();
