(async function initDataOnStart() {
  await fetchConfigData();
  [1,2,3,6].forEach(pg => mkUN(pg));
  [1,2,3,4,5,6].forEach(pg => mkSDV(pg));

  const el = document.getElementById('s25');
  const autoCount = await loadAutoCsvSources();

  if (autoCount > 0) {
    if (el) {
      const years = [...new Set(DATA.map(r => r.yr))].sort().join(' · ');
      el.textContent = '✓ Origen CSV · ' + years + ' · ' + DATA.length.toLocaleString() + ' filas';
      el.className = 'fst ok';
    }
    renderAll();
  } else {
    if (el) {
      el.textContent = '❌ Error: No se encontraron archivos CSV';
      el.className = 'fst err';
    }
  }
})();
