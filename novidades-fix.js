// ============================================================
// CLINICALEAD — NOVIDADES (changelog: modal + sininho)
// Mostra um modal ao abrir o CRM quando há novidade não vista.
// Um sininho 🔔 no topo guarda o histórico completo.
// Controle de "já viu" por localStorage (por dispositivo).
//
// COMO ADICIONAR UMA NOVIDADE:
//   Adicione um objeto no TOPO do array NOVIDADES, com um id ÚNICO
//   e crescente. Ex: { id: 7, data: "20/06/2026", titulo: "...", texto: "..." }
//   Quem ainda não viu o id novo recebe o modal automaticamente.
// ============================================================

(function () {
  'use strict';

  // ⭐ LISTA DE NOVIDADES (a mais nova no TOPO) ⭐
  const NOVIDADES = [
    {
      id: 8, data: "19/06/2026", icone: "ti-printer",
      titulo: "Orçamentos impressos",
      texto: "Imprima orçamentos personalizados com a logo da sua clínica e mensagem no rodapé!"
    },
    {
      id: 7, data: "19/06/2026", icone: "ti-prescription",
      titulo: "Receituário digital",
      texto: "Agora você cria e imprime receitas direto na ficha do paciente, com a logo da sua clínica!"
    },
    {
      id: 6, data: "18/06/2026", icone: "ti-confetti",
      titulo: "Recuperação de faltas automática",
      texto: "Quando um paciente falta, o sistema marca automaticamente e cria uma tarefa pra equipe entrar em contato e reagendar. Nenhum paciente fica esquecido!"
    },
    {
      id: 5, data: "18/06/2026", icone: "ti-clock-hour-4",
      titulo: "Follow-up de leads parados",
      texto: "Leads que não respondem em 48h recebem uma mensagem automática de reativação — e geram tarefa pra equipe continuar o contato."
    },
    {
      id: 4, data: "18/06/2026", icone: "ti-building-store",
      titulo: "Gerencie sua clínica sozinho",
      texto: "No menu 'Minha Clínica' você edita seus dados, conecta o WhatsApp e adiciona números extras — tudo sem depender de suporte."
    },
    {
      id: 3, data: "17/06/2026", icone: "ti-calendar-check",
      titulo: "Lembretes mais inteligentes",
      texto: "Os lembretes agora incluem o endereço e o mapa da clínica, respeitam horário noturno e não incomodam quem já avisou que vai remarcar."
    },
    {
      id: 2, data: "17/06/2026", icone: "ti-message-2",
      titulo: "Confirmação por WhatsApp",
      texto: "O paciente confirma a consulta respondendo a mensagem, e o status muda sozinho na sua agenda. Menos trabalho manual!"
    },
    {
      id: 1, data: "16/06/2026", icone: "ti-robot",
      titulo: "Automações personalizáveis",
      texto: "Agora você edita os textos das automações e liga/desliga cada uma do jeito que quiser, direto na tela de Automações."
    },
  ];

  const STORAGE_KEY = 'clinicalead_novidades_vistas';

  // ── localStorage helpers (à prova de erro) ───────────────
  function getVistas() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function marcarVista(id) {
    try {
      const vistas = getVistas();
      if (!vistas.includes(id)) {
        vistas.push(id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(vistas));
      }
    } catch (e) { /* ignora */ }
  }
  function marcarTodasVistas() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(NOVIDADES.map(n => n.id)));
    } catch (e) { /* ignora */ }
  }

  function novidadesNaoVistas() {
    const vistas = getVistas();
    return NOVIDADES.filter(n => !vistas.includes(n.id));
  }

  // ── Card de uma novidade (reutilizado no modal e histórico) ──
  function cardNovidade(n, destaque) {
    return `
      <div style="display:flex;gap:12px;padding:14px;background:var(--bg-elevated,#1a1a1a);border:1px solid ${destaque ? 'var(--gold-border,#3a3320)' : 'var(--border-subtle,#2a2a2a)'};border-radius:12px;margin-bottom:10px;">
        <div style="flex-shrink:0;width:40px;height:40px;border-radius:10px;background:var(--gold-pale,rgba(201,168,76,0.15));display:flex;align-items:center;justify-content:center;">
          <i class="ti ${n.icone || 'ti-sparkles'}" style="color:var(--gold,#C9A84C);font-size:20px;"></i>
        </div>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
            <div style="font-weight:600;font-size:14px;color:var(--text-primary,#fff);">${n.titulo}</div>
            <div style="font-size:11px;color:var(--text-muted,#888);white-space:nowrap;">${n.data}</div>
          </div>
          <div style="font-size:13px;color:var(--text-secondary,#bbb);margin-top:4px;line-height:1.5;">${n.texto}</div>
        </div>
      </div>`;
  }

  // ── MODAL de novidades novas ─────────────────────────────
  function mostrarModalNovidades(lista) {
    if (document.getElementById('modalNovidades')) return;
    const ov = document.createElement('div');
    ov.id = 'modalNovidades';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML = `
      <div style="max-width:480px;width:100%;max-height:85vh;overflow-y:auto;background:var(--bg-surface,#141414);border:1px solid var(--gold-border,#3a3320);border-radius:16px;padding:0;">
        <div style="padding:22px 22px 8px;text-align:center;">
          <div style="font-size:30px;margin-bottom:6px;">✨</div>
          <h2 style="margin:0;font-size:19px;color:var(--gold,#C9A84C);">Novidades no ClínicaLead!</h2>
          <p style="font-size:13px;color:var(--text-muted,#888);margin:6px 0 0;">Estamos sempre melhorando pra você 🚀</p>
        </div>
        <div style="padding:16px 22px;">
          ${lista.map(n => cardNovidade(n, true)).join('')}
        </div>
        <div style="padding:0 22px 22px;">
          <button onclick="fecharModalNovidades()" style="width:100%;padding:12px;background:var(--gold,#C9A84C);color:#1a1a1a;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;">
            Entendi! 👍
          </button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }

  window.fecharModalNovidades = function () {
    marcarTodasVistas();
    const m = document.getElementById('modalNovidades');
    if (m) m.remove();
    atualizarBadgeSino();
  };

  // ── SININHO + histórico ──────────────────────────────────
  function injetarSino() {
    if (document.getElementById('sinoNovidades')) return true;
    // tenta achar a topbar (onde fica o "Novo lead")
    const topbar = document.querySelector('.topbar') || document.querySelector('[class*="topbar"]');
    if (!topbar) return false;

    const sino = document.createElement('button');
    sino.id = 'sinoNovidades';
    sino.title = 'Novidades';
    sino.style.cssText = 'position:relative;background:transparent;border:1px solid var(--border-subtle,#2a2a2a);border-radius:10px;width:38px;height:38px;cursor:pointer;color:var(--text-secondary,#bbb);display:inline-flex;align-items:center;justify-content:center;margin-right:8px;';
    sino.innerHTML = `<i class="ti ti-bell" style="font-size:18px;"></i><span id="sinoBadge" style="display:none;position:absolute;top:-4px;right:-4px;background:var(--coral,#C0624A);color:#fff;font-size:10px;font-weight:700;min-width:16px;height:16px;border-radius:8px;align-items:center;justify-content:center;padding:0 4px;"></span>`;
    sino.onclick = abrirHistoricoNovidades;

    // insere no começo da topbar
    topbar.insertBefore(sino, topbar.firstChild);
    atualizarBadgeSino();
    return true;
  }

  function atualizarBadgeSino() {
    const badge = document.getElementById('sinoBadge');
    if (!badge) return;
    const n = novidadesNaoVistas().length;
    if (n > 0) {
      badge.textContent = n;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  window.abrirHistoricoNovidades = function () {
    if (document.getElementById('modalHistNovidades')) return;
    const ov = document.createElement('div');
    ov.id = 'modalHistNovidades';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML = `
      <div style="max-width:480px;width:100%;max-height:85vh;overflow-y:auto;background:var(--bg-surface,#141414);border:1px solid var(--border-subtle,#2a2a2a);border-radius:16px;">
        <div style="padding:20px 22px;border-bottom:1px solid var(--border-subtle,#2a2a2a);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--bg-surface,#141414);">
          <h2 style="margin:0;font-size:17px;"><i class="ti ti-bell" style="color:var(--gold,#C9A84C);margin-right:8px;"></i>Novidades</h2>
          <button onclick="document.getElementById('modalHistNovidades').remove()" style="background:transparent;border:none;color:var(--text-muted,#888);cursor:pointer;font-size:20px;"><i class="ti ti-x"></i></button>
        </div>
        <div style="padding:16px 22px;">
          ${NOVIDADES.map(n => cardNovidade(n, false)).join('')}
        </div>
      </div>`;
    document.body.appendChild(ov);
    // ao abrir o histórico, marca tudo como visto
    marcarTodasVistas();
    atualizarBadgeSino();
  };

  // ── inicialização ────────────────────────────────────────
  function iniciar() {
    if (typeof STATE === 'undefined' || !STATE.user) return false;
    injetarSino();
    // mostra o modal só se há novidade não vista
    const novas = novidadesNaoVistas();
    if (novas.length) {
      setTimeout(() => mostrarModalNovidades(novas), 1200); // espera o app montar
    }
    // martelo pra reinjetar o sino se a topbar renderizar depois
    let n = 0;
    const iv = setInterval(() => {
      injetarSino();
      if (++n > 30) clearInterval(iv);
    }, 600);
    console.log('✅ novidades-fix.js carregado');
    return true;
  }

  if (!iniciar()) {
    const iv = setInterval(() => { if (iniciar()) clearInterval(iv); }, 600);
    setTimeout(() => clearInterval(iv), 20000);
  }
})();
