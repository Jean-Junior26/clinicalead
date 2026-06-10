// ============================================================
// CLINICALEAD — AGENDA FIX
// Salva horários personalizados no Supabase
// ============================================================

// ── CARREGAR HORÁRIOS DA CLÍNICA ─────────────────────────────
async function loadHorariosClinica() {
  const clinic = currentClinic();
  if (!clinic) return;

  const { data } = await db
    .from('agenda_config')
    .select('horarios')
    .eq('clinic_id', clinic.id)
    .single();

  if (data?.horarios && data.horarios.length > 0) {
    CAL.horariosDisponiveis = data.horarios;
  } else {
    // Horários padrão
    CAL.horariosDisponiveis = [
      '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
      '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30'
    ];
  }
}

// ── SALVAR HORÁRIOS DA CLÍNICA ───────────────────────────────
async function salvarHorariosClinica() {
  const clinic = currentClinic();
  if (!clinic) return;

  await db.from('agenda_config').upsert({
    clinic_id: clinic.id,
    horarios: CAL.horariosDisponiveis,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'clinic_id' });
}

// ── ADICIONAR NOVO HORÁRIO ───────────────────────────────────
async function adicionarNovoHorario() {
  const val = document.getElementById('novoHorarioInput').value;
  if (!val) { toast('Selecione um horário', 'error'); return; }
  const hora = val.slice(0, 5);
  if (CAL.horariosDisponiveis.includes(hora)) { toast('Horário já existe!', 'error'); return; }
  CAL.horariosDisponiveis.push(hora);
  CAL.horariosDisponiveis.sort();
  await salvarHorariosClinica();
  const dateStr = CAL.selectedDate || new Date().toISOString().split('T')[0];
  renderConfigSlotsGrid(dateStr);
  toast(hora + ' adicionado e salvo! ✓');
}

// ── CARREGAR CONSULTAS + HORÁRIOS ────────────────────────────
async function loadConsultas() {
  const clinic = currentClinic();
  if (!clinic) return;
  try {
    await loadHorariosClinica();
    const { data } = await db
      .from('consultas')
      .select('*')
      .eq('clinic_id', clinic.id)
      .order('data')
      .order('hora');
    CAL.consultas = data || [];
  } catch(e) {
    CAL.consultas = [];
  }
}

// ── SALVAR CONFIGURAÇÃO DA AGENDA ────────────────────────────
async function salvarConfigAgenda() {
  await salvarHorariosClinica();
  closeModal('modalConfigAgenda');
  if (CAL.selectedDate) renderDaySchedule(CAL.selectedDate);
  toast('Configuração salva! ✓');
}

console.log('✅ agenda-fix.js carregado com sucesso');
