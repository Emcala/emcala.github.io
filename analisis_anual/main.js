(async function initDataOnStart() {
  await fetchConfigData();
  [1,2,3,6].forEach(pg => mkUN(pg));
  [1,2,3,4,5,6].forEach(pg => mkSDV(pg));

  const el = document.getElementById('s25');
  const autoCount = await loadAutoCsvSources();

  if (autoCount > 0) {
    if (el) {
      const years = [...new Set(DATA.map(r => r.yr))].sort().join(' · ');
      el.textContent = '✓ Auto CSV · ' + years + ' · ' + DATA.length.toLocaleString() + ' filas';
      el.className = 'fst ok';
    }
    renderAll();
    saveDataCache();
    return;
  }

  const snap = await loadDataCache();
  if (!snap || !Array.isArray(snap.rows) || !snap.rows.length) return;
  DATA = snap.rows;
  if (el) {
    const years = (snap.years && snap.years.length) ? snap.years.join(' · ') : [...new Set(DATA.map(r=>r.yr))].sort().join(' · ');
    const when = snap.savedAt ? new Date(snap.savedAt).toLocaleDateString('es-AR') : '';
    el.textContent = '✓ Cache local · ' + years + ' · ' + DATA.length.toLocaleString() + ' filas' + (when ? ' · ' + when : '');
    el.className = 'fst ok';
  }
  renderAll();
})();
