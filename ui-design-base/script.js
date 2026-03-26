/* ═══════════════════════════════════════════════════════════════════════════
   Spirit Can Editor — UI Design Base
   Lightweight JS for interactive UI reference (no frameworks)
   ═══════════════════════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {

  // ── Dark / Light Theme Toggle ──────────────────────────────────────────
  const themeBtn = document.getElementById("theme-toggle");
  const sunIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const moonIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

  let isDark = true;
  themeBtn.innerHTML = sunIcon;

  themeBtn.addEventListener("click", () => {
    isDark = !isDark;
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    themeBtn.innerHTML = isDark ? sunIcon : moonIcon;
  });

  // ── Section Accordion Toggle ───────────────────────────────────────────
  document.querySelectorAll("[data-section-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-section-toggle");
      const body = document.getElementById(`section-${target}`);
      const chevron = btn.querySelector(".section-chevron");
      if (!body) return;

      const isOpen = !body.classList.contains("hidden");
      body.classList.toggle("hidden", isOpen);
      if (chevron) chevron.textContent = isOpen ? "\u25B8" : "\u25BE";
    });
  });

  // ── Can Size Selector ──────────────────────────────────────────────────
  document.querySelectorAll("[data-can-size]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-can-size]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      // Update optimal size display
      const size = btn.getAttribute("data-can-size");
      const sizeText = size === "355ml" ? "414 \u00d7 220 mm" : "414 \u00d7 280 mm";
      const sizeDisplay = document.getElementById("optimal-size");
      if (sizeDisplay) sizeDisplay.textContent = sizeText;
    });
  });

  // ── Material Preset Selector ───────────────────────────────────────────
  document.querySelectorAll("[data-material]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-material]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      // Show/hide custom controls
      const preset = btn.getAttribute("data-material");
      const customPanel = document.getElementById("material-custom");
      const presetInfo = document.getElementById("material-preset-info");
      if (customPanel) customPanel.classList.toggle("hidden", preset !== "custom");
      if (presetInfo) presetInfo.classList.toggle("hidden", preset === "custom");
    });
  });

  // ── Lighting Mode Toggle ───────────────────────────────────────────────
  document.querySelectorAll("[data-light-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-light-mode]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.getAttribute("data-light-mode");
      const barControls = document.getElementById("bar-controls");
      if (barControls) barControls.classList.toggle("hidden", mode !== "bar");
    });
  });

  // ── Advanced Lighting Toggle ───────────────────────────────────────────
  const advancedBtn = document.getElementById("advanced-toggle");
  const advancedBody = document.getElementById("advanced-body");
  if (advancedBtn && advancedBody) {
    advancedBtn.addEventListener("click", () => {
      const isOpen = !advancedBody.classList.contains("hidden");
      advancedBody.classList.toggle("hidden", isOpen);
      advancedBtn.querySelector("span").textContent = (isOpen ? "\u25B8" : "\u25BE") + " Advanced";
    });
  }

  // ── HUD Play/Pause Toggle ─────────────────────────────────────────────
  const playBtn = document.getElementById("hud-play");
  if (playBtn) {
    let playing = true;
    playBtn.classList.add("active");
    playBtn.addEventListener("click", () => {
      playing = !playing;
      playBtn.textContent = playing ? "\u23F8" : "\u25B6";
      playBtn.classList.toggle("active", playing);
    });
  }

  // ── HUD Level Toggle ──────────────────────────────────────────────────
  const levelBtn = document.getElementById("hud-level");
  if (levelBtn) {
    levelBtn.classList.add("active-green");
    levelBtn.addEventListener("click", () => {
      levelBtn.classList.toggle("active-green");
    });
  }

  // ── HUD Relight Toggle ────────────────────────────────────────────────
  const relightBtn = document.getElementById("hud-relight");
  if (relightBtn) {
    relightBtn.addEventListener("click", () => {
      relightBtn.classList.toggle("active-amber");
    });
  }

  // ── Speed Slider Display ──────────────────────────────────────────────
  const speedSlider = document.getElementById("speed-slider");
  const speedLabel = document.getElementById("speed-label");
  if (speedSlider && speedLabel) {
    speedSlider.addEventListener("input", () => {
      speedLabel.textContent = parseFloat(speedSlider.value).toFixed(1) + "\u00d7";
    });
  }

  // ── Drop Zone Interaction Demo ────────────────────────────────────────
  const dropZone = document.getElementById("label-drop");
  if (dropZone) {
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (e) => { e.preventDefault(); dropZone.classList.remove("drag-over"); });
  }

  // ── Unload Label / Show Label Toggle ──────────────────────────────────
  const unloadBtn = document.getElementById("unload-label");
  const dropTitle = document.getElementById("drop-title");
  if (unloadBtn && dropTitle) {
    let labelVisible = true;
    unloadBtn.addEventListener("click", () => {
      labelVisible = !labelVisible;
      unloadBtn.textContent = labelVisible ? "Unload Label" : "Show Label";
      unloadBtn.classList.toggle("show-label", !labelVisible);
      dropTitle.textContent = labelVisible ? "Drop or click to upload" : "Label unloaded";
    });
  }

  // ── Slider Row: Sync value display ────────────────────────────────────
  document.querySelectorAll(".slider-row input[type='range']").forEach((slider) => {
    const valueEl = slider.parentElement.querySelector(".slider-value");
    if (!valueEl) return;
    const fmt = slider.getAttribute("data-format") || "fixed2";
    const update = () => {
      const v = parseFloat(slider.value);
      switch (fmt) {
        case "percent": valueEl.textContent = Math.round(v * 100) + "%"; break;
        case "degree": valueEl.textContent = Math.round(v) + "\u00b0"; break;
        case "fixed1": valueEl.textContent = v.toFixed(1); break;
        case "fixed2": valueEl.textContent = v.toFixed(2); break;
        default: valueEl.textContent = v.toFixed(2);
      }
    };
    slider.addEventListener("input", update);
  });

});
