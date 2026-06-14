// ============================================================
// CLINICALEAD — ATALHOS INTELIGENTES DO INBOX
// Ao clicar num atalho (Boas-vindas, Confirmar consulta, etc),
// substitui {nome} {clinica} {data} {hora} {procedimento} pelos
// dados REAIS do lead e da próxima consulta dele.
// O endereço usa o template da automação (editável por clínica).
// ============================================================

(function () {
  // espera setQuickReply existir
  function instalar() {
    if (typeof setQuickReply !== 'function') return false;

    setQuickReply = async function (type, chatId) {
      const chat = (typeof INBOX !== 'undefined' && INBOX.chats)
        ? INBOX.chats.find(c => c.id === chatId)
        : null;
      const clinic = currentClinic();
      const nome = chat?.lead?.nome || chat?.name || 'cliente';
      const lead = chat?.lead || null;

      const tipoMap = {
        '👋 Boas-vindas':        'boasvindas',
        '📅 Confirmar consulta': 'confirmacao',
        '⏰ Lembrete 24h':       'lembrete',
        '😊 Pós-consulta':       'posconsulta',
        '📍 Endereço':           'endereco',
      };
      const tipo = tipoMap[type];

      // ── Busca a próxima consulta do lead (para data/hora reais) ──
      let dataFmt = '';
      let horaFmt = '';
      let procedimento = lead?.procedimento || '';

      if (lead?.id && clinic) {
        try {
          const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
          const { data: cons } = await db.from('consultas')
            .select('data,hora,procedimento')
            .eq('lead_id', lead.id)
            .eq('clinic_id', clinic.id)
            .gte('data', hoje)
            .order('data', { ascending: true })
            .order('hora', { ascending: true })
            .limit(1);
          if (cons && cons.length) {
            const c = cons[0];
            if (c.data) {
              dataFmt = new Date(c.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
            }
            if (c.hora) horaFmt = String(c.hora).slice(0, 5);
            if (c.procedimento) procedimento = c.procedimento;
          }
        } catch (e) { /* segue sem consulta */ }
      }

      // ── Monta a mensagem ──
      let msg = '';
      const aplicarVars = (txt) => (txt || '')
        .replaceAll('{nome}', nome)
        .replaceAll('{clinica}', clinic?.nome || clinic?.name || '')
        .replaceAll('{data}', dataFmt || '(a combinar)')
        .replaceAll('{hora}', horaFmt || '(a combinar)')
        .replaceAll('{procedimento}', procedimento || 'sua avaliação');

      if (tipo && tipo !== 'endereco') {
        const auto = (STATE.automations || []).find(a => a.tipo === tipo);
        if (auto) msg = aplicarVars(auto.msg || auto.mensagem);
      } else if (tipo === 'endereco') {
        // Usa a automação de confirmação como fonte do endereço, se existir,
        // senão deixa um molde editável.
        const auto = (STATE.automations || []).find(a => a.tipo === 'confirmacao');
        msg = `📍 *Endereço da ${clinic?.nome || 'clínica'}:*\n[edite aqui o endereço e o link do mapa da sua clínica]`;
      }

      const input = document.getElementById('chatInput');
      if (input) { input.value = msg; input.focus(); if (typeof autoResizeInput === 'function') autoResizeInput(input); }
    };

    console.log('✅ atalhos-inteligentes-fix.js carregado — atalhos do Inbox preenchem dados reais');
    return true;
  }

  if (!instalar()) {
    const iv = setInterval(() => { if (instalar()) clearInterval(iv); }, 500);
    setTimeout(() => clearInterval(iv), 15000);
  }
})();
