(async function initDataOnStart() {
  // ── Auth: exigir login y mostrar badge de usuario ────────────
  if ((typeof EmcalaAuth !== 'undefined')) {
    if (!EmcalaAuth.requireLogin()) return;
    EmcalaAuth.renderUserBadge('emcala-user-badge');
  }

  // ── Carga de base: solo el auditor ve el botón ───────────────
  const esAuditor = (typeof puedeEscribir === 'function') && puedeEscribir();
  const btnCargar = document.getElementById('btn-cargar-base');
  if (btnCargar && esAuditor) {
    btnCargar.style.display = '';
    btnCargar.addEventListener('click', () => {
      const inp = document.getElementById('folder-input');
      inp.value = '';   // permite volver a elegir la misma carpeta
      inp.click();
    });
  }
  const up1 = document.getElementById('up1');
  if (up1 && !esAuditor) {
    up1.removeAttribute('for');
    up1.style.cursor = 'default';
    up1.innerHTML = '<div class="ico">📊</div><p>Todavía no hay datos cargados</p>' +
      '<small style="font-size:11px;opacity:.7">Pedile al auditor que cargue la base.</small>';
  }

  await fetchConfigData();
  [1,2,3,6].forEach(pg => mkUN(pg));
  [1,2,3,4,5,6].forEach(pg => mkSDV(pg));

  // Cargar datos persistentes desde Supabase (si existen).
  renderLU('loading');
  mostrarCarga('Cargando datos', 'Conectando con Supabase…', 2);
  let sup;
  try {
    sup = await loadDatosDesdeSupabase();
  } finally {
    ocultarCarga();
  }
  if (sup.ok && sup.rows > 0) {
    renderAll();
    if (sup.desdeCache) {
      const t = document.getElementById('lu-text');
      if (t) t.title = 'Datos cargados desde la caché local del navegador (0 KB egress).';
    }
  }

  // Actualizar el badge de "última actualización" con los metadatos.
  await refreshLastUpdate();
  if (!sup.ok) {
    console.error('Error leyendo datos de Supabase:', sup.error);
    const t = document.getElementById('lu-text'), d = document.getElementById('lu-dot');
    if (t) t.textContent += ' · ⚠ no se pudieron leer los datos (ver consola)';
    if (d) d.className = 'lu-dot err';
  }

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
