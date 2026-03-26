/* ═══════════════════════════════════════════════════════════════════════════
   Spirit Generative Tool — Main UI Script
   공통 UI 로직 + 입력 렌더링 + 익스포트. 이펙트는 effects/*.js 에서 독립 관리.
   ═══════════════════════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {

  /* ══════════════════════════════════════════════════════════════════════════
     State
     ══════════════════════════════════════════════════════════════════════════ */
  const canvas  = document.getElementById("main-canvas");
  const mainCtx = canvas.getContext("2d");

  let activeEffect    = null;
  let currentEffectId = "reaction-diffusion";
  let playing         = true;
  let inputMode       = "type";            // "type" | "image"
  let loadedImage     = null;              // Image element for loaded SVG/PNG/JPG
  let _inputDebounce  = null;

  // Recording state (MP4/WebM export)
  let mediaRecorder   = null;
  let recordedChunks  = [];
  let isRecording     = false;


  /* ══════════════════════════════════════════════════════════════════════════
     Input Rendering — 텍스트/SVG를 캔버스에 그리는 핵심 파이프라인
     ══════════════════════════════════════════════════════════════════════════ */

  /** Read all transform slider values from DOM */
  function readTransforms() {
    const r = { scale: 1, rotate: 0, blur: 0, tracking: 0, offsetX: 0, offsetY: 0 };
    const sec = document.getElementById("section-transform");
    if (!sec) return r;
    sec.querySelectorAll(".slider-row").forEach((row) => {
      const lbl = row.querySelector(".slider-label");
      const inp = row.querySelector("input[type='range']");
      if (!lbl || !inp) return;
      const v = parseFloat(inp.value);
      switch (lbl.textContent.trim()) {
        case "Scale":    r.scale    = v; break;
        case "Rotate":   r.rotate   = v; break;
        case "Blur":     r.blur     = v; break;
        case "Tracking": r.tracking = v; break;
        case "Offset X": r.offsetX  = v; break;
        case "Offset Y": r.offsetY  = v; break;
      }
    });
    return r;
  }

  /** Render text to a given 2D context (origin = center of canvas) */
  function renderTextToCtx(ctx, w, h, tf, fillColor) {
    const text = (document.getElementById("text-input")?.value || "").trimEnd();
    if (!text) return;

    const fontFamily = document.getElementById("font-select")?.value || "sans-serif";
    const wPill      = document.querySelector(".pill[data-weight].active");
    const fontWeight = wPill?.getAttribute("data-weight") || "400";
    const lines      = text.split("\n");
    const nLines     = Math.max(1, lines.length);

    // Auto-size font to ~70 % of canvas
    let fs = Math.floor(h * 0.65 / nLines);
    ctx.font = `${fontWeight} ${fs}px ${fontFamily}`;

    const measure = (line) => {
      if (tf.tracking <= 0) return ctx.measureText(line).width;
      let tw = 0;
      for (let i = 0; i < line.length; i++)
        tw += ctx.measureText(line[i]).width + (i < line.length - 1 ? tf.tracking : 0);
      return tw;
    };

    const maxW = w * 0.85;
    let widest = Math.max(...lines.map(measure));
    while (widest > maxW && fs > 14) {
      fs -= 2;
      ctx.font = `${fontWeight} ${fs}px ${fontFamily}`;
      widest = Math.max(...lines.map(measure));
    }

    ctx.fillStyle    = fillColor || "#fff";
    ctx.textBaseline = "middle";

    const lineH  = fs * 1.2;
    const totalH = nLines * lineH;
    const startY = -totalH / 2 + lineH / 2;

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const y    = startY + li * lineH;

      if (tf.tracking > 0) {
        ctx.textAlign = "left";
        const tw = measure(line);
        let x = -tw / 2;
        for (let c = 0; c < line.length; c++) {
          ctx.fillText(line[c], x, y);
          x += ctx.measureText(line[c]).width + tf.tracking;
        }
      } else {
        ctx.textAlign = "center";
        ctx.fillText(line, 0, y);
      }
    }
  }

  /** Render full input preview (BG + transforms + text/SVG) to any canvas/ctx */
  function renderInputPreview(tCanvas, tCtx) {
    const w = tCanvas.width, h = tCanvas.height;
    // BG
    const bg = document.getElementById("bg-color")?.value || "#000000";
    tCtx.fillStyle = bg;
    tCtx.fillRect(0, 0, w, h);

    const tf = readTransforms();

    tCtx.save();
    tCtx.translate(w / 2 + tf.offsetX * w, h / 2 + tf.offsetY * h);
    if (tf.rotate)      tCtx.rotate(tf.rotate * Math.PI / 180);
    if (tf.scale !== 1) tCtx.scale(tf.scale, tf.scale);
    if (tf.blur > 0)    tCtx.filter = `blur(${tf.blur}px)`;

    if (inputMode === "type") {
      const fill = document.getElementById("text-color")?.value || "#ffffff";
      renderTextToCtx(tCtx, w, h, tf, fill);
    } else if (inputMode === "image" && loadedImage) {
      const iw = loadedImage.naturalWidth  || loadedImage.width;
      const ih = loadedImage.naturalHeight || loadedImage.height;
      const fit = Math.min((w * 0.7) / iw, (h * 0.7) / ih);
      tCtx.drawImage(loadedImage, -(iw * fit) / 2, -(ih * fit) / 2, iw * fit, ih * fit);
    }

    tCtx.restore();
  }

  /**
   * Central input-change handler.
   * - Renders immediate text preview on canvas
   * - Debounces effect reset (300ms) so slider dragging feels smooth
   */
  function onInputChange() {
    // Immediate visual feedback
    renderInputPreview(canvas, mainCtx);
    // Debounced effect reset
    clearTimeout(_inputDebounce);
    _inputDebounce = setTimeout(() => {
      if (activeEffect) {
        activeEffect.reset();
        if (playing) activeEffect.start();
      }
    }, 300);
  }


  /* ══════════════════════════════════════════════════════════════════════════
     Monkey-patch drawPlaceholder → 플레이스홀더에 입력 텍스트 표시
     ══════════════════════════════════════════════════════════════════════════ */
  if (window.EffectBase) {
    EffectBase.prototype.drawPlaceholder = function () {
      renderInputPreview(this.canvas, this.ctx);
      // Subtle status label
      const w = this.canvas.width, h = this.canvas.height;
      const light = this.isLight;
      this.ctx.save();
      this.ctx.textAlign    = "center";
      this.ctx.textBaseline = "bottom";
      this.ctx.font         = "10px ui-monospace, monospace";
      this.ctx.fillStyle    = light ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.13)";
      this.ctx.fillText(this.name.toUpperCase() + "  \u2014  READY", w / 2, h - 14);
      this.ctx.restore();
    };
  }


  /* ══════════════════════════════════════════════════════════════════════════
     Effect Engine
     ══════════════════════════════════════════════════════════════════════════ */
  function switchEffect(effectId) {
    if (activeEffect) activeEffect.destroy();
    currentEffectId = effectId;
    const Cls = window.SpiritEffects?.[effectId];
    if (Cls && canvas) {
      activeEffect = new Cls();
      activeEffect.init(canvas);
      if (playing) activeEffect.start();
    } else {
      activeEffect = null;
      renderInputPreview(canvas, mainCtx);
    }
  }


  /* ══════════════════════════════════════════════════════════════════════════
     Canvas Resize
     ══════════════════════════════════════════════════════════════════════════ */
  function resizeCanvas(w, h) {
    canvas.width  = w;
    canvas.height = h;
    // Re-init effect at new size
    if (activeEffect) {
      activeEffect.destroy();
      const Cls = window.SpiritEffects?.[currentEffectId];
      if (Cls) {
        activeEffect = new Cls();
        activeEffect.init(canvas);
        if (playing) activeEffect.start();
      }
    } else {
      renderInputPreview(canvas, mainCtx);
    }
  }


  /* ══════════════════════════════════════════════════════════════════════════
     Export — PNG / SVG / MP4(WebM)
     ══════════════════════════════════════════════════════════════════════════ */

  function downloadBlob(blob, filename) {
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  function exportPNG() {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `spirit-gen-${Date.now()}.png`);
    }, "image/png");
  }

  function exportSVG() {
    const w = canvas.width, h = canvas.height;
    const tf = readTransforms();

    // If the active effect provides its own SVG export, use it
    if (activeEffect && typeof activeEffect.exportSVG === "function") {
      const effectSvg = activeEffect.exportSVG();
      if (effectSvg) {
        const blob = new Blob([effectSvg], { type: "image/svg+xml" });
        downloadBlob(blob, `spirit-gen-${Date.now()}.svg`);
        return;
      }
    }

    // Build true vector SVG
    const bgColor = document.getElementById("bg-color")?.value || "#000000";
    const cx = w / 2 + tf.offsetX * w;
    const cy = h / 2 + tf.offsetY * h;

    // Transform group attributes
    const transforms = [];
    transforms.push(`translate(${cx}, ${cy})`);
    if (tf.rotate) transforms.push(`rotate(${tf.rotate})`);
    if (tf.scale !== 1) transforms.push(`scale(${tf.scale})`);
    const transformAttr = transforms.join(" ");

    // Filter defs for blur
    let filterDef = "";
    let filterRef = "";
    if (tf.blur > 0) {
      filterDef = `\n  <defs><filter id="blur"><feGaussianBlur stdDeviation="${tf.blur}" /></filter></defs>`;
      filterRef = ` filter="url(#blur)"`;
    }

    let contentSvg = "";

    if (inputMode === "type") {
      // Vector text
      const text = (document.getElementById("text-input")?.value || "").trimEnd();
      if (text) {
        const fontFamily = document.getElementById("font-select")?.value || "sans-serif";
        const wPill = document.querySelector(".pill[data-weight].active");
        const fontWeight = wPill?.getAttribute("data-weight") || "400";
        const fillColor = document.getElementById("text-color")?.value || "#ffffff";
        const lines = text.split("\n");
        const nLines = Math.max(1, lines.length);

        // Auto-size font (same logic as canvas renderer)
        let fs = Math.floor(h * 0.65 / nLines);
        // Use a measurement canvas to find optimal size
        const mCtx = document.createElement("canvas").getContext("2d");
        mCtx.font = `${fontWeight} ${fs}px ${fontFamily}`;
        const measure = (line) => {
          if (tf.tracking <= 0) return mCtx.measureText(line).width;
          let tw = 0;
          for (let i = 0; i < line.length; i++)
            tw += mCtx.measureText(line[i]).width + (i < line.length - 1 ? tf.tracking : 0);
          return tw;
        };
        const maxW = w * 0.85;
        let widest = Math.max(...lines.map(measure));
        while (widest > maxW && fs > 14) {
          fs -= 2;
          mCtx.font = `${fontWeight} ${fs}px ${fontFamily}`;
          widest = Math.max(...lines.map(measure));
        }

        const lineH = fs * 1.2;
        const totalH = nLines * lineH;
        const startY = -totalH / 2 + lineH / 2;

        // Clean font-family for SVG (strip quotes around single families)
        const svgFont = fontFamily.replace(/^["']|["']$/g, "");

        let textEls = "";
        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];
          const y = startY + li * lineH;

          if (tf.tracking > 0) {
            // Individual character positioning for letter-spacing
            const tw = measure(line);
            let x = -tw / 2;
            for (let c = 0; c < line.length; c++) {
              const ch = line[c].replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              textEls += `      <text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${svgFont}" font-size="${fs}" font-weight="${fontWeight}" fill="${fillColor}" dominant-baseline="central">${ch}</text>\n`;
              x += mCtx.measureText(line[c]).width + tf.tracking;
            }
          } else {
            const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            textEls += `      <text x="0" y="${y.toFixed(1)}" font-family="${svgFont}" font-size="${fs}" font-weight="${fontWeight}" fill="${fillColor}" text-anchor="middle" dominant-baseline="central">${escaped}</text>\n`;
          }
        }
        contentSvg = textEls;
      }
    } else if (inputMode === "image" && loadedImage) {
      // Embed loaded image (raster fallback for imported images)
      const iw = loadedImage.naturalWidth || loadedImage.width;
      const ih = loadedImage.naturalHeight || loadedImage.height;
      const fit = Math.min((w * 0.7) / iw, (h * 0.7) / ih);
      const dw = iw * fit, dh = ih * fit;
      // Convert image to data URL for embedding
      const tmpC = document.createElement("canvas");
      tmpC.width = iw; tmpC.height = ih;
      tmpC.getContext("2d").drawImage(loadedImage, 0, 0);
      const imgData = tmpC.toDataURL("image/png");
      contentSvg = `      <image x="${(-dw / 2).toFixed(1)}" y="${(-dh / 2).toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" href="${imgData}" />\n`;
    }

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${filterDef}
  <rect width="${w}" height="${h}" fill="${bgColor}" />
  <g transform="${transformAttr}"${filterRef}>
${contentSvg}  </g>
</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    downloadBlob(blob, `spirit-gen-${Date.now()}.svg`);
  }

  function exportMP4() {
    const btn = document.getElementById("hud-export-mp4");

    if (isRecording) {
      // Stop recording
      mediaRecorder.stop();
      return;
    }

    // Start recording
    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      isRecording = false;
      if (btn) { btn.textContent = "MP4"; btn.classList.remove("active"); }
      const blob = new Blob(recordedChunks, { type: mimeType });
      downloadBlob(blob, `spirit-gen-${Date.now()}.webm`);
      recordedChunks = [];
    };

    mediaRecorder.start(1000);   // collect chunks every 1s — no time limit
    isRecording = true;
    if (btn) { btn.textContent = "REC \u25CF"; btn.classList.add("active"); }
  }


  /* ══════════════════════════════════════════════════════════════════════════
     Theme Toggle
     ══════════════════════════════════════════════════════════════════════════ */
  const themeBtn = document.getElementById("theme-toggle");
  const sunIcon  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const moonIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  let isDark = true;
  themeBtn.innerHTML = sunIcon;
  themeBtn.addEventListener("click", () => {
    isDark = !isDark;
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    themeBtn.innerHTML = isDark ? sunIcon : moonIcon;
    onInputChange();
  });


  /* ══════════════════════════════════════════════════════════════════════════
     Input Tab Switching (Type / SVG)
     ══════════════════════════════════════════════════════════════════════════ */
  document.querySelectorAll(".input-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".input-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      inputMode = tab.getAttribute("data-input-tab");
      document.getElementById("panel-type").classList.toggle("hidden", inputMode !== "type");
      document.getElementById("panel-image").classList.toggle("hidden", inputMode !== "image");
      const trackingRow = document.getElementById("tracking-row");
      if (trackingRow) trackingRow.classList.toggle("hidden", inputMode !== "type");
      onInputChange();
    });
  });


  /* ══════════════════════════════════════════════════════════════════════════
     Effect Tab Switching
     ══════════════════════════════════════════════════════════════════════════ */
  const effectTitleEl = document.getElementById("effect-title");
  document.querySelectorAll(".effect-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".effect-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const id = tab.getAttribute("data-effect");
      document.querySelectorAll(".effect-panel").forEach((p) => p.classList.add("hidden"));
      const panel = document.getElementById(`effect-${id}`);
      if (panel) panel.classList.remove("hidden");
      if (effectTitleEl) effectTitleEl.textContent = tab.textContent.trim();
      switchEffect(id);
    });
  });


  /* ══════════════════════════════════════════════════════════════════════════
     Section Accordion
     ══════════════════════════════════════════════════════════════════════════ */
  document.querySelectorAll("[data-section-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const body    = document.getElementById(`section-${btn.getAttribute("data-section-toggle")}`);
      const chevron = btn.querySelector(".section-chevron");
      if (!body) return;
      const open = !body.classList.contains("hidden");
      body.classList.toggle("hidden", open);
      if (chevron) chevron.textContent = open ? "\u25B8" : "\u25BE";
    });
  });


  /* ══════════════════════════════════════════════════════════════════════════
     Pill Groups
     ══════════════════════════════════════════════════════════════════════════ */
  // Generic groups (right sidebar effect options)
  document.querySelectorAll(".pill[data-group]").forEach((pill) => {
    pill.addEventListener("click", () => {
      const g = pill.getAttribute("data-group");
      document.querySelectorAll(`.pill[data-group="${g}"]`).forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
    });
  });

  // Font weight pills → re-render text
  document.querySelectorAll(".pill[data-weight]").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".pill[data-weight]").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      onInputChange();
    });
  });

  // Canvas size pills → actually resize canvas
  document.querySelectorAll("[data-canvas-size]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-canvas-size]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const key = btn.getAttribute("data-canvas-size");
      const sizeMap = {
        "1080x1080": [1080, 1080, "1080 \u00d7 1080"],
        "1920x1080": [1920, 1080, "1920 \u00d7 1080"],
        "1080x1920": [1080, 1920, "1080 \u00d7 1920"],
        "3840x2160": [3840, 2160, "3840 \u00d7 2160"],
      };
      const s  = sizeMap[key];
      const el = document.getElementById("canvas-res");
      if (el && s) el.textContent = s[2];
      if (s) resizeCanvas(s[0], s[1]);
    });
  });


  /* ══════════════════════════════════════════════════════════════════════════
     Seed Randomize → also reset effect
     ══════════════════════════════════════════════════════════════════════════ */
  document.querySelectorAll("[data-seed-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const el = document.getElementById(btn.getAttribute("data-seed-target"));
      if (el) el.textContent = Math.floor(Math.random() * 99999).toString().padStart(4, "0");
      // Reset effect with new seed
      if (activeEffect) { activeEffect.reset(); if (playing) activeEffect.start(); }
    });
  });


  /* ══════════════════════════════════════════════════════════════════════════
     HUD — Play / Pause
     ══════════════════════════════════════════════════════════════════════════ */
  const playBtn = document.getElementById("hud-play");
  if (playBtn) {
    playBtn.classList.add("active");
    playBtn.addEventListener("click", () => {
      playing = !playing;
      playBtn.textContent = playing ? "\u23F8" : "\u25B6";
      playBtn.classList.toggle("active", playing);
      if (activeEffect) { playing ? activeEffect.start() : activeEffect.stop(); }
    });
  }


  /* ══════════════════════════════════════════════════════════════════════════
     HUD — Speed
     ══════════════════════════════════════════════════════════════════════════ */
  const speedSlider = document.getElementById("speed-slider");
  const speedLabel  = document.getElementById("speed-label");
  if (speedSlider && speedLabel) {
    speedSlider.addEventListener("input", () => {
      const v = parseFloat(speedSlider.value);
      speedLabel.textContent = v.toFixed(1) + "\u00d7";
      if (activeEffect) activeEffect.setSpeed(v);
    });
  }


  /* ══════════════════════════════════════════════════════════════════════════
     HUD — Reset
     ══════════════════════════════════════════════════════════════════════════ */
  const resetBtn = document.getElementById("hud-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (activeEffect) { activeEffect.reset(); if (playing) activeEffect.start(); }
      else renderInputPreview(canvas, mainCtx);
    });
  }


  /* ══════════════════════════════════════════════════════════════════════════
     HUD — Export buttons
     ══════════════════════════════════════════════════════════════════════════ */
  document.getElementById("hud-export-png")?.addEventListener("click", exportPNG);
  document.getElementById("hud-export-svg")?.addEventListener("click", exportSVG);
  document.getElementById("hud-export-mp4")?.addEventListener("click", exportMP4);


  /* ══════════════════════════════════════════════════════════════════════════
     HUD — Undo / Redo (keyboard shortcut visual hint)
     ══════════════════════════════════════════════════════════════════════════ */
  const undoBtn = document.getElementById("hud-undo");
  const redoBtn = document.getElementById("hud-redo");
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z")
      undoBtn?.classList.remove("disabled");
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z")
      redoBtn?.classList.remove("disabled");
  });


  /* ══════════════════════════════════════════════════════════════════════════
     Slider Row Value Sync + reactive input change
     ══════════════════════════════════════════════════════════════════════════ */
  document.querySelectorAll(".slider-row input[type='range']").forEach((slider) => {
    const valueEl = slider.parentElement.querySelector(".slider-value");
    if (!valueEl) return;
    const fmt = slider.getAttribute("data-format") || "fixed2";
    // Is this a left-sidebar (transform) slider?
    const isTransform = !!slider.closest("#section-transform, #section-canvas-cfg");
    const update = () => {
      const v = parseFloat(slider.value);
      switch (fmt) {
        case "percent": valueEl.textContent = Math.round(v * 100) + "%"; break;
        case "degree":  valueEl.textContent = Math.round(v) + "\u00b0"; break;
        case "fixed0":  valueEl.textContent = Math.round(v).toString(); break;
        case "fixed1":  valueEl.textContent = v.toFixed(1); break;
        case "fixed2":  valueEl.textContent = v.toFixed(2); break;
        case "fixed3":  valueEl.textContent = v.toFixed(3); break;
        default:        valueEl.textContent = v.toFixed(2);
      }
      if (isTransform) onInputChange();
    };
    slider.addEventListener("input", update);
  });


  /* ══════════════════════════════════════════════════════════════════════════
     Color Input Bidirectional Sync + reactive change
     ══════════════════════════════════════════════════════════════════════════ */
  document.querySelectorAll(".color-row").forEach((row) => {
    const picker = row.querySelector("input[type='color']");
    const hex    = row.querySelector(".input-text");
    if (!picker || !hex) return;
    const isInput = !!row.closest(".sidebar--left");
    picker.addEventListener("input", () => {
      hex.value = picker.value;
      if (isInput) onInputChange();
    });
    hex.addEventListener("change", () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) { picker.value = hex.value; if (isInput) onInputChange(); }
    });
  });


  /* ══════════════════════════════════════════════════════════════════════════
     Text Input — 실시간 텍스트 렌더링
     ══════════════════════════════════════════════════════════════════════════ */
  const textInput = document.getElementById("text-input");
  if (textInput) {
    textInput.addEventListener("input", onInputChange);
  }


  /* ══════════════════════════════════════════════════════════════════════════
     Font Select — 변경 시 리렌더
     ══════════════════════════════════════════════════════════════════════════ */
  const fontSelect = document.getElementById("font-select");
  if (fontSelect) {
    fontSelect.addEventListener("change", onInputChange);
  }


  /* ══════════════════════════════════════════════════════════════════════════
     Image Drop Zone — SVG / PNG / JPG / WebP 로드
     ══════════════════════════════════════════════════════════════════════════ */
  const imageDrop    = document.getElementById("image-drop");
  const imageTitle   = document.getElementById("image-drop-title");
  const clearImage   = document.getElementById("clear-image");
  const previewWrap  = document.getElementById("image-preview-wrap");
  const previewImg   = document.getElementById("image-preview");

  const ACCEPTED_IMAGE_TYPES = [
    "image/svg+xml", "image/png", "image/jpeg", "image/webp",
    "image/gif", "image/bmp", "image/tiff",
  ];

  function loadImageFile(file) {
    if (!file) return;
    // Accept by MIME or by extension fallback
    const ext = file.name.split(".").pop().toLowerCase();
    const validExt = ["svg", "png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"];
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type) && !validExt.includes(ext)) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      if (imageTitle) imageTitle.textContent = file.name;
      if (imageDrop)  imageDrop.classList.add("has-image");
      if (previewWrap) { previewWrap.classList.remove("hidden"); previewImg.src = url; }
      onInputChange();
    };
    img.onerror = () => {
      // SVG may need explicit dimensions — try via FileReader as data URL
      const reader = new FileReader();
      reader.onload = () => {
        const img2 = new Image();
        img2.onload = () => {
          loadedImage = img2;
          if (imageTitle) imageTitle.textContent = file.name;
          if (imageDrop)  imageDrop.classList.add("has-image");
          if (previewWrap) { previewWrap.classList.remove("hidden"); previewImg.src = img2.src; }
          onInputChange();
        };
        img2.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
    img.src = url;
  }

  if (imageDrop) {
    imageDrop.addEventListener("dragover", (e) => {
      e.preventDefault();
      imageDrop.classList.add("drag-over");
    });
    imageDrop.addEventListener("dragleave", () => imageDrop.classList.remove("drag-over"));
    imageDrop.addEventListener("drop", (e) => {
      e.preventDefault();
      imageDrop.classList.remove("drag-over");
      if (e.dataTransfer.files[0]) loadImageFile(e.dataTransfer.files[0]);
    });
    // Click to browse
    const imgFileInput = document.createElement("input");
    imgFileInput.type = "file";
    imgFileInput.accept = ".svg,.png,.jpg,.jpeg,.webp,.gif,.bmp";
    imgFileInput.hidden = true;
    document.body.appendChild(imgFileInput);
    imageDrop.addEventListener("click", () => imgFileInput.click());
    imgFileInput.addEventListener("change", () => {
      if (imgFileInput.files[0]) loadImageFile(imgFileInput.files[0]);
      imgFileInput.value = "";
    });
  }

  if (clearImage) {
    clearImage.addEventListener("click", () => {
      loadedImage = null;
      if (imageTitle)  imageTitle.textContent = "Drop image file";
      if (imageDrop)   imageDrop.classList.remove("has-image");
      if (previewWrap) previewWrap.classList.add("hidden");
      onInputChange();
    });
  }


  /* ══════════════════════════════════════════════════════════════════════════
     Font Manager — 폰트 로딩 / 업로드
     ══════════════════════════════════════════════════════════════════════════ */
  const fontFileInput = document.getElementById("font-file-input");
  const btnFontUpload = document.getElementById("btn-font-upload");
  const groupCustom   = document.getElementById("font-group-custom");
  const groupUploaded = document.getElementById("font-group-uploaded");
  let uploadedFontCounter = 0;

  function registerFont(familyName, src, group) {
    const style = document.createElement("style");
    style.textContent = `@font-face { font-family: "${familyName}"; src: ${src}; font-display: swap; }`;
    document.head.appendChild(style);
    const opt = document.createElement("option");
    opt.value = `"${familyName}"`;
    opt.textContent = familyName;
    group.appendChild(opt);
    group.classList.remove("hidden");
    return opt;
  }

  function fontFormat(fn) {
    const e = fn.split(".").pop().toLowerCase();
    return e === "woff2" ? "woff2" : e === "woff" ? "woff" : e === "otf" ? "opentype" : "truetype";
  }

  function fontDisplayName(fn) {
    return fn.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  async function loadCustomFonts() {
    try {
      const res = await fetch("fonts/fonts.json");
      if (!res.ok) return;
      const fonts = await res.json();
      if (!Array.isArray(fonts) || !fonts.length) return;
      let firstOpt = null;
      for (const entry of fonts) {
        const name = entry.name || fontDisplayName(entry.file);
        const opt = registerFont(name, `url("fonts/${entry.file}") format("${fontFormat(entry.file)}")`, groupCustom);
        if (!firstOpt) firstOpt = opt;
      }
      // Default-select the first custom font and re-render
      if (firstOpt && fontSelect) {
        fontSelect.value = firstOpt.value;
        document.fonts.ready.then(() => onInputChange());
      }
    } catch (_) { /* no custom fonts */ }
  }

  if (btnFontUpload && fontFileInput) {
    btnFontUpload.addEventListener("click", () => fontFileInput.click());
    fontFileInput.addEventListener("change", () => {
      if (!fontFileInput.files?.length) return;
      for (const file of fontFileInput.files) {
        const reader = new FileReader();
        reader.onload = () => {
          const blob = new Blob([reader.result], { type: file.type || "font/opentype" });
          const url  = URL.createObjectURL(blob);
          const displayName = fontDisplayName(file.name);
          uploadedFontCounter++;
          const family = `Upload_${uploadedFontCounter}_${displayName.replace(/\s+/g, "")}`;
          const opt = registerFont(displayName, `url("${url}") format("${fontFormat(file.name)}")`, groupUploaded);
          opt.value = `"${family}"`;
          document.fonts.load(`16px "${family}"`).then(() => {
            fontSelect.value = opt.value;
            onInputChange();
          }).catch(() => { fontSelect.value = opt.value; onInputChange(); });
        };
        reader.readAsArrayBuffer(file);
      }
      fontFileInput.value = "";
    });
  }


  /* ══════════════════════════════════════════════════════════════════════════
     Boot
     ══════════════════════════════════════════════════════════════════════════ */
  loadCustomFonts();

  // Apply initial canvas size from the active pill
  const initPill = document.querySelector("[data-canvas-size].active");
  if (initPill) {
    const key = initPill.getAttribute("data-canvas-size");
    const [w, h] = key.split("x").map(Number);
    if (w && h) { canvas.width = w; canvas.height = h; }
  }

  switchEffect(currentEffectId);

});
