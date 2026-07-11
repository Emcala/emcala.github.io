(async function initDataOnStart() {
  await fetchConfigData();
  [1,2,3,6].forEach(pg => mkUN(pg));
  [1,2,3,4,5,6].forEach(pg => mkSDV(pg));

  const autoCount = await loadAutoCsvSources();
  if (autoCount > 0) {
    renderAll();
  }
})();
