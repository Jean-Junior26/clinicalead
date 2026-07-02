// ============================================================
// CLINICALEAD — FIX DEFINITIVO do fluxo de conexão do WhatsApp
// Resolve os bugs que faziam a troca de número dar "fantasma":
//   1. Nome de instância era FIXO (nome_id) → reaproveitava a
//      mesma instância suja → PENDING (mensagem não entrega)
//   2. "WhatsApp já conectado!" falso (checava instância velha)
//   3. "Erro ao gerar QR" (conflito de nome com instância travada)
//   4. Não deletava a instância velha antes de criar a nova
//
// SOLUÇÃO: toda vez que gera QR, cria uma instância NOVA e ÚNICA
// (com timestamp), deletando a(s) velha(s) antes. Sessão sempre
// limpa → conecta e ENTREGA de verdade, de qualquer lugar.
// Carregar DEPOIS do whatsapp-fix.js no index.
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }

  // gera um nome de instância ÚNICO pra clínica (nunca conflita)
  function nomeInstanciaNovo(clinic) {
    const base = clinic.nome.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
    const idCurto = clinic.id.slice(0, 8);
    const stamp = Date.now().toString().slice(-6);
    return `${base}_${idCurto}_${stamp}`;
  }

  // deleta TODAS as instâncias antigas dessa clínica na Evolution
  // (limpa o lixo/zumbi antes de criar a nova — evita PENDING)
  async function limparInstanciasAntigas(clinic) {
    try {
      const todas = await evoRequest('GET', '/instance/fetchInstances');
      const idCurto = clinic.id.slice(0, 8);
      const baseNome = clinic.nome.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
      const alvos = (Array.isArray(todas) ? todas : []).filter(i => {
        const nome = (i.instance || i).instanceName || i.name || '';
        // pega instâncias dessa clínica (pelo id curto ou pelo nome base)
        return nome.includes(idCurto) || nome.startsWith(baseNome);
      });
      for (const i of alvos) {
        const nome = (i.instance || i).instanceName || i.name;
        try { await evoRequest('DELETE', `/instance/logout/${nome}`); } catch (e) {}
        await new Promise(r => setTimeout(r, 400));
        try { await evoRequest('DELETE', `/instance/delete/${nome}`); } catch (e) {}
        console.log('[wa-conexao] limpou instância antiga:', nome);
      }
    } catch (e) {
      console.warn('[wa-conexao] erro ao limpar antigas (segue):', e.message);
    }
  }

  // ── SOBRESCREVE openWhatsAppConnect ──────────────────────────
  // Não checa mais "já conectado" por instância velha. Sempre
  // prepara pra gerar um QR novo e limpo.
  window.openWhatsAppConnect = function (clinicIdx) {
    const clinic = STATE.clinics[clinicIdx];
    if (!clinic) return;
    // guarda a clínica alvo pra usar no gerarQRCode
    window.__waClinicAlvo = clinic;
    // não define currentWAInstance ainda — será criado ao gerar o QR
    const st = document.getElementById('waStatus');
    if (st) st.textContent = '';
    const area = document.getElementById('qrCodeArea');
    if (area) area.style.display = 'none';
    const btn = document.getElementById('btnGerarQR');
    if (btn) {
      btn.style.display = '';
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-qrcode"></i> Gerar QR Code';
    }
    openModal('modalWhatsApp');
  };

  // ── SOBRESCREVE gerarQRCode ──────────────────────────────────
  // Cria uma instância NOVA e ÚNICA toda vez (limpa as velhas antes).
  window.gerarQRCode = async function () {
    const btn = document.getElementById('btnGerarQR');
    const st = document.getElementById('waStatus');
    const clinic = window.__waClinicAlvo || (typeof currentClinic === 'function' ? currentClinic() : null);
    if (!clinic) { if (st) st.textContent = 'Erro: clínica não identificada'; return; }

    if (btn) { btn.innerHTML = '<i class="ti ti-loader"></i> Preparando...'; btn.disabled = true; }

    try {
      // 1) limpa instâncias antigas/sujas dessa clínica
      if (st) st.textContent = 'Limpando conexões antigas...';
      await limparInstanciasAntigas(clinic);

      // 2) cria uma instância NOVA e única
      const novaInst = nomeInstanciaNovo(clinic);
      window.currentWAInstance = novaInst;
      if (st) st.textContent = 'Gerando QR Code...';
      await createWhatsAppInstance(novaInst);
      await new Promise(r => setTimeout(r, 2000));

      // 3) pega o QR
      const data = await getQRCode(novaInst);
      if (data?.base64) {
        document.getElementById('qrCodeImg').src = data.base64;
        document.getElementById('qrCodeArea').style.display = 'block';
        if (st) st.textContent = 'Aguardando leitura do QR Code...';
        if (btn) { btn.innerHTML = '<i class="ti ti-refresh"></i> Atualizar QR Code'; btn.disabled = false; }

        // 4) fica checando se conectou
        if (window.qrInterval) clearInterval(window.qrInterval);
        window.qrInterval = setInterval(async () => {
          try {
            const s = await getInstanceStatus(novaInst);
            if (s?.instance?.state === 'open') {
              clearInterval(window.qrInterval);
              // registra o webhook da instância nova
              try {
                await fetch('/api/setup-webhook', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ instance: novaInst }),
                });
              } catch (e) { console.warn('[wa-conexao] setup-webhook:', e.message); }
              // grava a instância nova no banco (pela clínica alvo — id certo)
              await getDb().from('clinicas').update({ whatsapp_instance: novaInst }).eq('id', clinic.id);
              const cLocal = STATE.clinics.find(c => c.id === clinic.id);
              if (cLocal) cLocal.whatsapp_instance = novaInst;
              if (st) st.innerHTML = '<span style="color:var(--gold);font-weight:600;">✅ WhatsApp conectado com sucesso!</span>';
              document.getElementById('qrCodeArea').style.display = 'none';
              if (btn) btn.style.display = 'none';
              if (typeof renderClinicas === 'function') renderClinicas();
              console.log('[wa-conexao] ✅ conectado e gravado:', novaInst);
            }
          } catch (e) { /* ainda não conectou, segue tentando */ }
        }, 3000);
      } else {
        if (st) st.textContent = 'Erro ao gerar QR Code. Tente novamente.';
        if (btn) { btn.innerHTML = '<i class="ti ti-qrcode"></i> Gerar QR Code'; btn.disabled = false; }
      }
    } catch (e) {
      console.error('[wa-conexao] erro:', e.message);
      if (st) st.textContent = 'Erro ao gerar QR Code. Tente novamente.';
      if (btn) { btn.innerHTML = '<i class="ti ti-qrcode"></i> Gerar QR Code'; btn.disabled = false; }
    }
  };

  console.log('✅ whatsapp-conexao-fix.js carregado — conexão limpa (instância nova a cada QR)');
})();
