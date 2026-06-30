// ============================================================
// CLINICALEAD — ANTI-DUPLICADO no cadastro de lead
// PROBLEMA: o sistema cria lead automático quando o paciente manda
// mensagem no WhatsApp. Aí a secretária cadastra DE NOVO na mão →
// duplica (mesma pessoa, telefone em formato diferente). Isso quebra
// a confirmação de presença (busca acha o lead errado).
// SOLUÇÃO: ao salvar um lead NOVO, checa pelo TELEFONE (só dígitos)
// se já existe. Se existir → avisa e ABRE o cadastro existente pra
// editar, em vez de criar duplicado.
// Carregar DEPOIS do script que define saveNewLead (por último).
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || window.sb || null); }
  function clinicAtual() { return (typeof currentClinic === 'function') ? currentClinic() : null; }

  // normaliza telefone: só dígitos, pega os últimos 8 (ignora DDI/DDD e formato)
  function sufixoTel(tel) {
    const dig = String(tel || '').replace(/\D/g, '');
    return dig.length >= 8 ? dig.slice(-8) : dig;
  }

  // procura lead existente pelo telefone (mesmos últimos 8 dígitos)
  async function acharLeadPorTelefone(sufixo) {
    const database = getDb(); const clinic = clinicAtual();
    if (!database || !clinic || !sufixo || sufixo.length < 8) return null;
    try {
      const { data } = await database.from('leads')
        .select('id, nome, telefone')
        .eq('clinic_id', clinic.id)
        .ilike('telefone', '%' + sufixo);
      // confirma pelo sufixo exato (o ilike pode pegar parecidos)
      const match = (data || []).find(l => sufixoTel(l.telefone) === sufixo);
      return match || null;
    } catch (e) { console.error('[anti-duplicado]', e); return null; }
  }

  function instalar() {
    if (typeof window.saveNewLead !== 'function') return false;
    if (window.__antiDupInstalado) return true;

    const _saveOriginal = window.saveNewLead;

    window.saveNewLead = async function (...args) {
      // pega o telefone digitado no form
      const phoneEl = document.getElementById('nlPhone');
      const telDigitado = phoneEl ? phoneEl.value : '';
      const sufixo = sufixoTel(telDigitado);

      // se tem telefone válido, checa duplicado ANTES de salvar
      if (sufixo && sufixo.length >= 8) {
        const existente = await acharLeadPorTelefone(sufixo);
        if (existente) {
          // achou duplicado: avisa e abre o cadastro existente
          const msg = `📋 Esse telefone já está cadastrado para:\n\n` +
                      `👤 ${existente.nome || 'Sem nome'}\n📞 ${existente.telefone || ''}\n\n` +
                      `Vou abrir o cadastro existente pra você editar (em vez de criar um duplicado).`;
          alert(msg);

          // fecha o modal de novo lead (se houver função/botão)
          const modalNovo = document.getElementById('modalNewLead') || document.getElementById('newLeadModal');
          if (modalNovo) modalNovo.remove();
          // tenta fechar via função de fechar genérica
          if (typeof window.closeModal === 'function') { try { window.closeModal(); } catch (e) {} }

          // abre o cadastro existente pra editar
          if (typeof window.openEditLead === 'function') {
            setTimeout(() => window.openEditLead(existente.id), 150);
          } else if (typeof window.openLeadDetail === 'function') {
            setTimeout(() => window.openLeadDetail(existente.id), 150);
          }
          return; // NÃO cria duplicado
        }
      }

      // não é duplicado: salva normalmente
      return _saveOriginal.apply(this, args);
    };

    window.__antiDupInstalado = true;
    console.log('✅ lead-anti-duplicado-fix.js carregado — não cria mais lead duplicado');
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }
})();
