(() => {
  const fineTuneToggle = document.getElementById("cb-filter-finetune");
  const underOneToggle = document.getElementById("cb-filter-under-one");
  const resetBtn = document.getElementById("cb-pricing-filter-reset");
  const countEl = document.getElementById("cb-pricing-filter-count");
  const emptyEl = document.getElementById("cb-pricing-empty");

  const rows = Array.from(
    document.querySelectorAll('.cb-pricing-row[data-row-type="model"]')
  );
  const providers = Array.from(
    document.querySelectorAll(".cb-pricing-provider")
  );

  if (!rows.length) return;

  const parseCost = (row) => {
    const raw = row?.dataset?.inputCost ?? "";
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : null;
  };

  const applyFilters = () => {
    const requireFineTune = !!fineTuneToggle?.checked;
    const requireUnderOne = !!underOneToggle?.checked;
    let visibleCount = 0;

    rows.forEach((row) => {
      const finetune = row.dataset.finetune || "no";
      const inputCost = parseCost(row);
      let isVisible = true;

      if (requireFineTune && finetune !== "yes") {
        isVisible = false;
      }

      if (isVisible && requireUnderOne) {
        isVisible = inputCost !== null && inputCost <= 1;
      }

      row.classList.toggle("is-hidden", !isVisible);
      if (isVisible) {
        visibleCount += 1;
      }
    });

    providers.forEach((provider) => {
      const visibleRows = provider.querySelectorAll(
        '.cb-pricing-row[data-row-type="model"]:not(.is-hidden)'
      );
      provider.classList.toggle("is-hidden", visibleRows.length === 0);
    });

    if (countEl) {
      countEl.textContent = `Showing ${visibleCount} of ${rows.length} models`;
    }
    if (emptyEl) {
      emptyEl.hidden = visibleCount !== 0;
    }
  };

  const resetFilters = () => {
    if (fineTuneToggle) fineTuneToggle.checked = false;
    if (underOneToggle) underOneToggle.checked = false;
    applyFilters();
  };

  fineTuneToggle?.addEventListener("change", applyFilters);
  underOneToggle?.addEventListener("change", applyFilters);
  resetBtn?.addEventListener("click", resetFilters);

  applyFilters();
})();
