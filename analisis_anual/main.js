(async function initDataOnStart() {
  // ── Auth: exigir login y mostrar badge de usuario ────────────
  if ((typeof EmcalaAuth !== 'undefined')) {
    if (!EmcalaAuth.requireLogin()) return;
    EmcalaAuth.renderUserBadge('emcala-user-badge');
  }

  await fetchConfigData();
  [1,2,3,6].forEach(pg => mkUN(pg));
  [1,2,3,4,5,6].forEach(pg => mkSDV(pg));

  // Cargar datos persistentes desde Supabase (si existen).
  renderLU('loading');
  const sup = await loadDatosDesdeSupabase();
  if (sup.ok && sup.rows > 0) {
    renderAll();
  }

  // Actualizar el badge de "última actualización" con los metadatos.
  await refreshLastUpdate();

  // Autocarga CSV locales (si se configuró AUTO_CSV_SOURCES) como fallback.
  const autoCount = await loadAutoCsvSources();
  if (autoCount > 0) {
    renderAll();
    await refreshLastUpdate();
  }
})();

// ── BADGE "última actualización" ───────────────────────────────
function renderLU(state) {
  const dot = document.getElementById('lu-dot');
  const txt = document.getElementById('lu-text');
  if (!dot) return;
  dot.className = 'lu-dot ' + (state || '');
}

async function refreshLastUpdate() {
  const txt = document.getElementById('lu-text');
  const dot = document.getElementById('lu-dot');
  if (!txt) return;

  const meta = await loadMetaSupabase();
  const years = Object.keys(meta);
  if (!years.length) {
    txt.textContent = 'Última actualización: sin datos cargados';
    if (dot) dot.className = 'lu-dot err';
    return;
  }

  // Ordenar por fecha más reciente
  const latest = years
    .map(y => meta[y])
    .sort((a, b) => new Date(b.actualizado_en) - new Date(a.actualizado_en))[0];

  const d = new Date(latest.actualizado_en);
  const fecha = d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const quien = latest.actualizado_por ? ` · ${latest.actualizado_por}` : '';
  txt.textContent = `Última actualización: ${fecha}${quien}`;
  if (dot) dot.className = 'lu-dot ok';
}
