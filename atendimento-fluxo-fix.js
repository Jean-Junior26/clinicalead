// ============================================================
// CLINICALEAD — Fluxo de atendimento em 3 etapas + tempos
// Compareceu → Iniciar atendimento → Finalizar atendimento
//
// Grava os tempos:
//   - compareceu_em      (ao marcar "Compareceu")
//   - atendimento_inicio (ao "Iniciar atendimento")
//   - atendido_em        (ao "Finalizar" — via salvarRegistroAtendimento)
//
// Assim dá pra saber: tempo de ESPERA (início - compareceu) e
// tempo de ATENDIMENTO (fim - início).
//
// Carregar por último no index (depois dos outros fixes de agenda).
// ============================================================
(function () {
  'use strict';

  function getDb() { return (typeof db !== 'undefined') ? db : (window.supabaseClient || null); }

  // ── 1) toggleCompareceu: grava compareceu_em ao marcar ────────
  if (typeof window.toggleCompareceu === 'function' && !window.toggleCompareceu.__tempoFix) {
    const _origToggle = window.toggleCompareceu;
    window.toggleCompareceu = async function (consultaId) {
      const c = (typeof CAL !== 'undefined' && CAL.consultas) ? CAL.consultas.find(x => x.id === consultaId) : null;
      // chama o original (marca compareceu / desfaz)
      const r = await _origToggle.apply(this, arguments);
      // se acabou de marcar como compareceu, grava a hora de chegada
      if (c && c.status === 'compareceu' && !c.compareceu_em) {
        const agora = new Date().toISOString();
        c.compareceu_em = agora;
        try { await getDb().from('consultas').update({ compareceu_em: agora }).eq('id', consultaId); } catch (e) {}
      }
      return r;
    };
    window.toggleCompareceu.__tempoFix = true;
  }

  // ── 2) Iniciar atendimento: grava atendimento_inicio ──────────
  window.iniciarAtendimento = async function (consultaId) {
    const c = (CAL && CAL.consultas) ? CAL.consultas.find(x => x.id === consultaId) : null;
    if (!c) return;
    const agora = new Date().toISOString();
    const dados = { status: 'em_atendimento', atendimento_inicio: agora };
    try {
      const { error } = await getDb().from('consultas').update(dados).eq('id', consultaId);
      if (error) { if (typeof toast === 'function') toast('Erro: ' + error.message, 'error'); return; }
    } catch (e) { return; }
    Object.assign(c, dados);
    if (typeof toast === 'function') toast('Atendimento iniciado! ⏱️');
    if (typeof renderDaySchedule === 'function' && CAL.selectedDate) renderDaySchedule(CAL.selectedDate);
  };

  // ── 3) Finalizar atendimento: abre o registro (que grava atendido_em) ──
  window.finalizarAtendimento = function (consultaId) {
    // reaproveita o modal de registro existente; ao salvar, marca atendido_em
    if (typeof abrirRegistroAtendimento === 'function') abrirRegistroAtendimento(consultaId);
  };

  // ── 3b) Envolve salvarRegistroAtendimento pra garantir status 'atendido' ──
  // (o registro já grava atendido=true e atendido_em; aqui garantimos que o
  //  status também vá pra atendido e que o tempo de atendimento seja coerente)
  if (typeof window.salvarRegistroAtendimento === 'function' && !window.salvarRegistroAtendimento.__tempoFix) {
    const _origSalvar = window.salvarRegistroAtendimento;
    window.salvarRegistroAtendimento = async function () {
      const consultaId = document.getElementById('regConsultaId') ? document.getElementById('regConsultaId').value : null;
      const r = await _origSalvar.apply(this, arguments);
      // depois de salvar, garante o status 'atendido' (fim do fluxo)
      if (consultaId) {
        const c = (CAL && CAL.consultas) ? CAL.consultas.find(x => x.id === consultaId) : null;
        try {
          await getDb().from('consultas').update({ status: 'atendido' }).eq('id', consultaId);
          if (c) c.status = 'atendido';
        } catch (e) {}
      }
      return r;
    };
    window.salvarRegistroAtendimento.__tempoFix = true;
  }

  // ── 4) Injeta os botões certos conforme o estado ──────────────
  function calcularTempo(ini, fim) {
    if (!ini || !fim) return null;
    const min = Math.round((new Date(fim) - new Date(ini)) / 60000);
    if (min < 0) return null;
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60), m = min % 60;
    return h + 'h' + (m ? ' ' + m + 'min' : '');
  }

  function injetarBotoesAtendimento() {
    const container = document.getElementById('agendaList');
    if (!container) return;
    container.querySelectorAll('.sched-item').forEach(item => {
      const onclick = item.getAttribute('onclick') || '';
      const m = onclick.match(/openEditConsulta\('([^']+)'\)/);
      if (!m) return;
      const consultaId = m[1];
      const c = (CAL && CAL.consultas) ? CAL.consultas.find(x => x.id === consultaId) : null;
      if (!c) return;
      const acts = item.querySelector('.sched-acts');
      if (!acts) return;

      // remove os botões de tempo já injetados (evita duplicar)
      acts.querySelectorAll('.btn-iniciar-atend, .btn-finalizar-atend').forEach(b => b.remove());

      // SEMPRE remove o botão "Atendido" antigo do semáforo quando a consulta
      // está no fluxo novo (compareceu/em_atendimento e ainda não finalizada).
      // Isso corrige as consultas que já estavam "compareceu" antes do fix.
      if ((c.status === 'compareceu' || c.status === 'em_atendimento') && !c.atendido) {
        acts.querySelectorAll('.btn-atendido').forEach(b => b.remove());
      }

      // COMPARECEU (e não iniciou) → botão "Iniciar atendimento"
      if (c.status === 'compareceu' && !c.atendido && !c.atendimento_inicio) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-iniciar-atend';
        btn.style.cssText = 'background:var(--gold-pale);border-color:var(--gold-border);color:var(--gold);';
        btn.innerHTML = '<i class="ti ti-player-play"></i> Iniciar atendimento';
        btn.setAttribute('onclick', `event.stopPropagation();iniciarAtendimento('${consultaId}')`);
        acts.appendChild(btn);
      }

      // EM ATENDIMENTO (iniciou, não finalizou) → botão "Finalizar"
      if (c.status === 'em_atendimento' && !c.atendido) {
        const espera = calcularTempo(c.compareceu_em, c.atendimento_inicio);
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-finalizar-atend';
        btn.style.cssText = 'background:var(--gold);border-color:var(--gold);color:#1a1a1a;font-weight:600;';
        btn.innerHTML = '<i class="ti ti-player-stop"></i> Finalizar atendimento';
        btn.setAttribute('onclick', `event.stopPropagation();finalizarAtendimento('${consultaId}')`);
        acts.appendChild(btn);
        // mostra "em atendimento" + espera
        const nomeEl = item.querySelector('.sched-name');
        if (nomeEl && espera) nomeEl.title = 'Esperou ' + espera + ' até ser atendido';
      }
    });
  }

  // roda após o semáforo (que roda com setTimeout ~160ms). Usa intervalo leve.
  setInterval(injetarBotoesAtendimento, 500);

  console.log('✅ atendimento-fluxo-fix.js carregado — Compareceu → Iniciar → Finalizar (com tempos)');
})();
