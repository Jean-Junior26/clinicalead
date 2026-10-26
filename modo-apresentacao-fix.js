/* ============================================================
   MODO APRESENTAÇÃO — ClinicaLead
   ------------------------------------------------------------
   Para quando o Jean vai APRESENTAR o CRM pra um prospect e não
   quer que ele veja as clínicas dos outros clientes.

   Enquanto ligado, QUALQUER consulta à tabela 'clinicas' passa a
   devolver só as clínicas liberadas abaixo. Isso vale pro seletor
   de clínica e pra TODAS as outras telas (gestão de planos,
   vencimentos, dashboard do Brian, saldo, indicações etc.) —
   porque o filtro é aplicado na camada do banco, não na tela.

   COMO LIGAR:    abra o CRM com  ?demo=1   na URL
                  ex: https://clinicalead.vercel.app/?demo=1
   COMO DESLIGAR: abra o CRM com  ?demo=0   na URL
                  (ou espere: ele se desliga sozinho em 6 horas)

   ⚠️ IMPORTANTE: isso é só visual, pra apresentação. NÃO é
   segurança. Não apaga nada, não altera nada no banco, e um
   login admin de verdade continuaria vendo tudo. Para esconder
   de verdade, o caminho é um usuário não-admin com acesso só
   às clínicas permitidas.

   Este arquivo só LÊ e FILTRA. Nenhuma escrita (insert/update/
   delete) é tocada.
   ============================================================ */
(function () {
  'use strict';

  // ── clínicas que PODEM aparecer durante a apresentação ──
  const CLINICAS_LIBERADAS = [
    '4e2ced30-87f1-452e-9d06-33511dad84ab', // Gou Odonto Uberlândia
    '8558528d-fc00-46a7-9059-1a911f4ab862', // Gou Odonto Camaquã
  ];

  const CHAVE = 'cl_modo_apresentacao';
  const VALIDADE_MS = 6 * 60 * 60 * 1000; // 6 horas

  // ── liga/desliga pela URL ──────────────────────────────────
  try {
    const p = new URLSearchParams(location.search).get('demo');
    if (p === '1') {
      localStorage.setItem(CHAVE, String(Date.now()));
      console.warn('[modo-apresentacao] LIGADO. Só Uberlândia e Camaquã vão aparecer. Desliga com ?demo=0');
    } else if (p === '0') {
      localStorage.removeItem(CHAVE);
      console.warn('[modo-apresentacao] DESLIGADO. Todas as clínicas voltaram.');
    }
  } catch (e) {}

  // ── está ativo? (com expiração automática) ─────────────────
  function ativo() {
    try {
      const t = Number(localStorage.getItem(CHAVE) || 0);
      if (!t) return false;
      if (Date.now() - t > VALIDADE_MS) {
        localStorage.removeItem(CHAVE);
        console.warn('[modo-apresentacao] expirou sozinho (6h) — todas as clínicas voltaram.');
        return false;
      }
      return true;
    } catch (e) { return false; }
  }

  // deixa acessível pra outros fixes, se algum dia precisar
  window.modoApresentacaoAtivo = ativo;

  if (!ativo()) {
    console.log('[modo-apresentacao] inativo (normal).');
    return;
  }

  // ── intercepta as leituras da tabela 'clinicas' ────────────
  // Envolve db.from('clinicas') e, SÓ no .select(), acrescenta
  // um .in('id', [...]) com as clínicas liberadas. Os filtros do
  // Supabase se combinam com AND, então qualquer .eq()/.order()/
  // .single() que venha depois continua funcionando igual.
  function instalar(cliente, nome) {
    if (!cliente || typeof cliente.from !== 'function') return false;
    if (cliente.__demoInstalado) return true;

    const fromOriginal = cliente.from.bind(cliente);

    cliente.from = function (tabela) {
      const builder = fromOriginal(tabela);

      if (tabela !== 'clinicas' || !builder || typeof builder.select !== 'function') {
        return builder;
      }

      const selectOriginal = builder.select.bind(builder);
      builder.select = function (...args) {
        const q = selectOriginal(...args);
        try {
          if (q && typeof q.in === 'function') return q.in('id', CLINICAS_LIBERADAS);
        } catch (e) {
          console.warn('[modo-apresentacao] não consegui filtrar:', e.message);
        }
        return q;
      };

      return builder;
    };

    cliente.__demoInstalado = true;
    console.warn('[modo-apresentacao] filtro instalado em ' + nome + '.');
    return true;
  }

  // o app usa `db` (e em alguns fixes `window.supabaseClient`);
  // tenta nos dois, e insiste um pouco caso ainda não exista.
  let tentativas = 0;
  (function tentar() {
    const okDb = instalar(window.db, 'db');
    const okSb = instalar(window.supabaseClient, 'supabaseClient');
    if (okDb || okSb) return;
    if (++tentativas < 40) return setTimeout(tentar, 150);
    console.warn('[modo-apresentacao] não achei o cliente do Supabase. Filtro NÃO está ativo.');
  })();

  // ── rede de segurança ─────────────────────────────────────
  // Se alguma tela tiver guardado a lista completa antes do
  // filtro entrar, limpa STATE.clinics também.
  function limparState() {
    try {
      if (window.STATE && Array.isArray(STATE.clinics)) {
        const antes = STATE.clinics.length;
        STATE.clinics = STATE.clinics.filter(c => c && CLINICAS_LIBERADAS.includes(c.id));
        if (STATE.clinics.length !== antes) {
          if (STATE.currentClinicIdx >= STATE.clinics.length) STATE.currentClinicIdx = 0;
          const b = document.getElementById('navClinicasBadge');
          if (b) b.textContent = STATE.clinics.length;
          if (typeof renderClinicSwitcher === 'function') renderClinicSwitcher();
        }
      }
    } catch (e) {}
  }
  for (let i = 1; i <= 8; i++) setTimeout(limparState, i * 1000);

})();
