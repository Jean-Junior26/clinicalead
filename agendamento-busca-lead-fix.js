// ============================================================
// CLINICALEAD — BUSCA DE PACIENTE NO AGENDAMENTO
// Troca o <select> de paciente por um campo que filtra enquanto
// digita (por NOME ou TELEFONE). Funciona com milhares de leads.
// Mantém o <select id="naLead"> original (escondido) alimentado,
// então o salvamento (naLead.value) continua funcionando igual.
// ============================================================

(function () {
  'use strict';

  function norm(s) { return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function soDigitos(s) { return (s || '').toString().replace(/\D/g, ''); }

  function montar() {
    const sel = document.getElementById('naLead');
    if (!sel) return;
    if (document.getElementById('naLeadBuscaWrap')) { sincronizar(); return; }

    // esconde o select original (continua sendo a "fonte da verdade")
    sel.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.id = 'naLeadBuscaWrap';
    wrap.style.cssText = 'position:relative;';
    wrap.innerHTML = `
      <input type="text" id="naLeadBusca" class="form-input" autocomplete="off"
        placeholder="Buscar paciente por nome ou telefone..." style="width:100%;" />
      <div id="naLeadResultados" style="display:none;position:absolute;z-index:50;left:0;right:0;top:100%;margin-top:4px;
        background:var(--bg-elevated,#18181B);border:1px solid var(--border,rgba(201,168,76,0.15));
        border-radius:var(--r-sm,8px);max-height:240px;overflow-y:auto;box-shadow:0 12px 30px rgba(0,0,0,0.35);"></div>`;
    sel.insertAdjacentElement('afterend', wrap);

    const inp = wrap.querySelector('#naLeadBusca');
    const box = wrap.querySelector('#naLeadResultados');

    function fecha() { box.style.display = 'none'; }
    function leadsDoSelect() {
      // fonte = opções do próprio select (já vêm certas), enriquecidas com telefone
      // E filtradas pela CLÍNICA ATIVA (admin enxerga várias; aqui só a atual)
      const cClinic = (typeof currentClinic === 'function' && currentClinic()) ? currentClinic().id : null;
      const stateLeads = (typeof STATE !== 'undefined' && STATE.leads) ? STATE.leads : [];
      const byId = {};
      stateLeads.forEach(l => { byId[l.id] = l; });
      return Array.from(sel.options).filter(o => o.value).map(o => {
        const l = byId[o.value] || {};
        return {
          id: o.value,
          nome: (o.textContent.split(' — ')[0] || o.textContent || '').trim(),
          telefone: l.telefone || '',
          procedimento: l.procedimento || (o.textContent.includes(' — ') ? o.textContent.split(' — ')[1] : ''),
          clinic_id: l.clinic_id
        };
      }).filter(l => !cClinic || l.clinic_id === cClinic);
    }

    function render(termo) {
      const t = norm(termo); const td = soDigitos(termo);
      let leads = leadsDoSelect();
      if (t || td) {
        leads = leads.filter(l => {
          const nome = norm(l.nome);
          const tel = soDigitos(l.telefone);
          const okNome = t && nome.includes(t);
          const okTel = td && tel.includes(td);
          return okNome || okTel;
        });
      }
      leads = leads.slice(0, 30); // não despeja 1000 de uma vez
      if (!leads.length) {
        box.innerHTML = `<div style="padding:12px;color:var(--text-muted);font-size:13px;">Nenhum paciente encontrado.</div>`;
        box.style.display = 'block'; return;
      }
      box.innerHTML = leads.map(l => {
        const tel = l.telefone ? ` · ${l.telefone}` : '';
        const proc = l.procedimento ? ` — ${l.procedimento}` : '';
        return `<div class="naLeadItem" data-id="${l.id}" data-nome="${(l.nome || '').replace(/"/g, '&quot;')}"
          style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border-subtle,rgba(255,255,255,0.05));font-size:13px;">
          <div style="color:var(--text-primary,#F0EAD6);font-weight:500;">${l.nome || 'Sem nome'}${proc}</div>
          <div style="color:var(--text-secondary,#8A8570);font-size:11px;">${tel ? tel.replace(' · ', '') : 'sem telefone'}</div>
        </div>`;
      }).join('');
      box.style.display = 'block';
      box.querySelectorAll('.naLeadItem').forEach(it => {
        it.addEventListener('mouseenter', () => it.style.background = 'var(--gold-pale,rgba(201,168,76,0.12))');
        it.addEventListener('mouseleave', () => it.style.background = 'transparent');
        it.addEventListener('click', () => {
          const id = it.dataset.id;
          sel.value = id;                       // alimenta o select original
          sel.dispatchEvent(new Event('change')); // dispara lógicas (ex.: sugerir procedimento)
          inp.value = it.dataset.nome;
          fecha();
        });
      });
    }

    inp.addEventListener('focus', () => render(inp.value));
    inp.addEventListener('input', () => render(inp.value));
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) fecha(); });

    sincronizar();
  }

  // reflete o valor atual do select no campo de busca (ao reabrir o modal)
  function sincronizar() {
    const sel = document.getElementById('naLead');
    const inp = document.getElementById('naLeadBusca');
    if (!sel || !inp) return;
    if (sel.value) {
      const opt = sel.querySelector(`option[value="${sel.value}"]`);
      inp.value = opt ? opt.textContent.split(' — ')[0] : '';
    } else {
      inp.value = '';
    }
  }

  // engata na abertura dos modais de agendamento
  ['openNovoAgendamento', 'openNovoAgendamentoHora'].forEach(fn => {
    if (typeof window[fn] === 'function') {
      const _orig = window[fn];
      window[fn] = function (...args) { const r = _orig.apply(this, args); setTimeout(montar, 160); return r; };
    }
  });

  console.log('✅ agendamento-busca-lead-fix.js carregado — busca de paciente por nome/telefone');
})();
