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

  // Undo / Redo history
  const _history      = [];       // array of snapshots
  let   _historyIdx   = -1;       // current position
  const _MAX_HISTORY  = 80;
  let   _skipSnapshot = false;    // flag to prevent snapshot during restore
  let   _historyDebounce = null;


  /* ══════════════════════════════════════════════════════════════════════════
     Undo / Redo — 파라미터 스냅샷 기반 히스토리
     ══════════════════════════════════════════════════════════════════════════ */

  /** Capture all UI control values into a plain object */
  function captureSnapshot() {
    const snap = {
      // Text input
      text:       document.getElementById("text-input")?.value ?? "",
      font:       document.getElementById("font-select")?.value ?? "",
      weight:     document.querySelector(".pill[data-weight].active")?.getAttribute("data-weight") ?? "400",
      textColor:  document.getElementById("text-color")?.value ?? "#ffffff",
      bgColor:    document.getElementById("bg-color")?.value ?? "#000000",
      inputMode,
      // Canvas size
      canvasSize: document.querySelector("[data-canvas-size].active")?.getAttribute("data-canvas-size") ?? "1920x1080",
      // Effect
      effectId:   currentEffectId,
      // All sliders (left + right sidebars)
      sliders:    {},
      // All pills with data-group
      pills:      {},
    };
    document.querySelectorAll(".slider-row input[type='range']").forEach((sl) => {
      const id = sl.closest(".slider-row")?.querySelector(".slider-label")?.textContent?.trim();
      const section = sl.closest(".section-body")?.id || sl.closest(".effect-panel")?.id || "global";
      if (id) snap.sliders[`${section}::${id}`] = sl.value;
    });
    document.querySelectorAll(".pill[data-group].active").forEach((p) => {
      snap.pills[p.getAttribute("data-group")] = p.textContent.trim();
    });
    // Color pickers in right sidebar
    snap.colorPickers = {};
    document.querySelectorAll(".sidebar--right .color-row").forEach((row, i) => {
      const picker = row.querySelector("input[type='color']");
      if (picker) snap.colorPickers[`right-color-${i}`] = picker.value;
    });
    return snap;
  }

  /** Restore UI state from a snapshot */
  function restoreSnapshot(snap) {
    _skipSnapshot = true;

    // Text
    const textEl = document.getElementById("text-input");
    if (textEl && textEl.value !== snap.text) textEl.value = snap.text;

    // Font
    const fontEl = document.getElementById("font-select");
    if (fontEl && snap.font) fontEl.value = snap.font;

    // Weight
    document.querySelectorAll(".pill[data-weight]").forEach((p) => {
      p.classList.toggle("active", p.getAttribute("data-weight") === snap.weight);
    });

    // Colors
    const tc = document.getElementById("text-color");
    const tch = document.getElementById("text-color-hex");
    if (tc) { tc.value = snap.textColor; if (tch) tch.value = snap.textColor; }
    const bc = document.getElementById("bg-color");
    const bch = document.getElementById("bg-color-hex");
    if (bc) { bc.value = snap.bgColor; if (bch) bch.value = snap.bgColor; }

    // Canvas size
    if (snap.canvasSize) {
      document.querySelectorAll("[data-canvas-size]").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-canvas-size") === snap.canvasSize);
      });
      const s = snap.canvasSize.split("x").map(Number);
      if (s.length === 2 && (canvas.width !== s[0] || canvas.height !== s[1])) {
        canvas.width = s[0]; canvas.height = s[1];
      }
      const wIn = document.getElementById("canvas-w");
      const hIn = document.getElementById("canvas-h");
      if (wIn) wIn.value = s[0];
      if (hIn) hIn.value = s[1];
    }

    // Sliders
    for (const [key, val] of Object.entries(snap.sliders)) {
      const [section, label] = key.split("::");
      const sectionEl = document.getElementById(section) || document.getElementById(`effect-${snap.effectId}`);
      if (!sectionEl) continue;
      sectionEl.querySelectorAll(".slider-row").forEach((row) => {
        const lbl = row.querySelector(".slider-label")?.textContent?.trim();
        if (lbl === label) {
          const input = row.querySelector("input[type='range']");
          const disp = row.querySelector(".slider-value");
          if (input) {
            input.value = val;
            // Update display
            if (disp) {
              const v = parseFloat(val);
              const fmt = input.getAttribute("data-format") || "fixed2";
              switch (fmt) {
                case "percent": disp.textContent = Math.round(v * 100) + "%"; break;
                case "degree":  disp.textContent = Math.round(v) + "\u00b0"; break;
                case "fixed0":  disp.textContent = Math.round(v).toString(); break;
                case "fixed1":  disp.textContent = v.toFixed(1); break;
                case "fixed3":  disp.textContent = v.toFixed(3); break;
                default:        disp.textContent = v.toFixed(2);
              }
            }
          }
        }
      });
    }

    // Pills with data-group
    for (const [group, label] of Object.entries(snap.pills)) {
      document.querySelectorAll(`.pill[data-group="${group}"]`).forEach((p) => {
        p.classList.toggle("active", p.textContent.trim() === label);
      });
    }

    // Right sidebar color pickers
    if (snap.colorPickers) {
      const rows = document.querySelectorAll(".sidebar--right .color-row");
      rows.forEach((row, i) => {
        const key = `right-color-${i}`;
        if (snap.colorPickers[key]) {
          const picker = row.querySelector("input[type='color']");
          const hex = row.querySelector(".input-text");
          if (picker) { picker.value = snap.colorPickers[key]; }
          if (hex) { hex.value = snap.colorPickers[key]; }
        }
      });
    }

    // Effect switch if different
    if (snap.effectId !== currentEffectId) {
      document.querySelectorAll(".effect-tab").forEach((t) => {
        t.classList.toggle("active", t.getAttribute("data-effect") === snap.effectId);
      });
      const effectTitleEl = document.getElementById("effect-title");
      const activeTab = document.querySelector(`.effect-tab[data-effect="${snap.effectId}"]`);
      if (effectTitleEl && activeTab) effectTitleEl.textContent = activeTab.textContent.trim();
      document.querySelectorAll(".effect-panel").forEach((p) => p.classList.add("hidden"));
      document.getElementById(`effect-${snap.effectId}`)?.classList.remove("hidden");
      switchEffect(snap.effectId);
    } else {
      // Same effect — re-render WITHOUT pushing history
      renderInputPreview(canvas, mainCtx);
      if (activeEffect) {
        activeEffect.reset();
        if (playing) activeEffect.start();
      }
    }

    _skipSnapshot = false;
    updateUndoRedoButtons();
  }

  /** Push current state onto history stack */
  function pushHistory() {
    if (_skipSnapshot) return;
    const snap = captureSnapshot();
    // Truncate any redo states ahead of current position
    _history.length = _historyIdx + 1;
    _history.push(snap);
    if (_history.length > _MAX_HISTORY) _history.shift();
    _historyIdx = _history.length - 1;
    updateUndoRedoButtons();
  }

  function undo() {
    if (_historyIdx <= 0) return;
    _historyIdx--;
    restoreSnapshot(_history[_historyIdx]);
  }

  function redo() {
    if (_historyIdx >= _history.length - 1) return;
    _historyIdx++;
    restoreSnapshot(_history[_historyIdx]);
  }

  function updateUndoRedoButtons() {
    const undoBtn = document.getElementById("hud-undo");
    const redoBtn = document.getElementById("hud-redo");
    if (undoBtn) undoBtn.classList.toggle("disabled", _historyIdx <= 0);
    if (redoBtn) redoBtn.classList.toggle("disabled", _historyIdx >= _history.length - 1);
  }


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
    // Build combined CSS filter
    const filters = [];
    if (tf.blur > 0) filters.push(`blur(${tf.blur}px)`);
    if (inputMode === "image" && imageInverted) filters.push("invert(1)");
    if (filters.length) tCtx.filter = filters.join(" ");

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
    // Push to undo history (debounced to avoid flood from sliders)
    if (!_skipSnapshot) {
      clearTimeout(_historyDebounce);
      _historyDebounce = setTimeout(() => { if (!_skipSnapshot) pushHistory(); }, 400);
    }
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
    if (!_skipSnapshot) pushHistory();
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
      // Convert image to data URL for embedding (with invert if active)
      const tmpC = document.createElement("canvas");
      tmpC.width = iw; tmpC.height = ih;
      const tmpCtx = tmpC.getContext("2d");
      if (imageInverted) tmpCtx.filter = "invert(1)";
      tmpCtx.drawImage(loadedImage, 0, 0);
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

  /* ── MP4 Export with WebCodecs + mp4-muxer ─────────────────────────────
     Phase 1: Record — capture every canvas frame as VideoFrame
     Phase 2: Encode & Mux — encode all frames to H.264, mux into MP4
     Progress overlay shown during Phase 2
     ──────────────────────────────────────────────────────────────────── */

  // Frame buffer for recording
  let capturedFrames = [];
  let exportCancelled = false;

  // Overlay elements
  const exportOverlay  = document.getElementById("export-overlay");
  const exportTitle    = document.getElementById("export-title");
  const exportFill     = document.getElementById("export-progress-fill");
  const exportStatus   = document.getElementById("export-status");
  const exportCancel   = document.getElementById("export-cancel");

  function showExportProgress(title, status, pct) {
    if (exportOverlay) exportOverlay.classList.remove("hidden");
    if (exportTitle)   exportTitle.textContent = title || "Exporting MP4...";
    if (exportStatus)  exportStatus.textContent = status || "";
    if (exportFill)    exportFill.style.width = (pct || 0) + "%";
  }
  function hideExportProgress() {
    if (exportOverlay) exportOverlay.classList.add("hidden");
  }
  if (exportCancel) {
    exportCancel.addEventListener("click", () => { exportCancelled = true; });
  }

  function exportMP4() {
    const btn = document.getElementById("hud-export-mp4");

    // ─── Toggle: Stop recording ───
    if (isRecording) {
      isRecording = false;
      if (btn) { btn.textContent = "MP4"; btn.classList.remove("active"); }
      encodeFramesToMP4();
      return;
    }

    // ─── Check WebCodecs support ───
    if (typeof VideoEncoder === "undefined" || typeof Mp4Muxer === "undefined") {
      // Fallback: MediaRecorder WebM
      fallbackWebM(btn);
      return;
    }

    // ─── Start recording: capture frames ───
    capturedFrames = [];
    isRecording = true;
    exportCancelled = false;
    if (btn) { btn.textContent = "REC \u25CF"; btn.classList.add("active"); }

    // Hook into the animation loop to capture frames
    captureLoop();
  }

  function captureLoop() {
    if (!isRecording) return;
    try {
      // Capture current canvas as ImageBitmap (fast, no copy)
      createImageBitmap(canvas).then(bmp => {
        capturedFrames.push(bmp);
        requestAnimationFrame(captureLoop);
      });
    } catch (e) {
      // Fallback: store as ImageData
      const ctx2 = canvas.getContext("2d");
      capturedFrames.push(ctx2.getImageData(0, 0, canvas.width, canvas.height));
      requestAnimationFrame(captureLoop);
    }
  }

  async function encodeFramesToMP4() {
    const totalFrames = capturedFrames.length;
    if (totalFrames === 0) { alert("No frames recorded."); return; }

    const fps = 30;
    const w = canvas.width;
    const h = canvas.height;

    // Ensure even dimensions (H.264 requirement)
    const encW = w % 2 === 0 ? w : w + 1;
    const encH = h % 2 === 0 ? h : h + 1;

    showExportProgress("Exporting MP4...", `0 / ${totalFrames} frames`, 0);

    try {
      const { Muxer, ArrayBufferTarget } = Mp4Muxer;

      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: {
          codec: "avc",
          width: encW,
          height: encH,
        },
        fastStart: "in-memory",
        firstTimestampBehavior: "offset",
      });

      let encodedCount = 0;
      const frameDuration = 1_000_000 / fps; // microseconds

      // Find a supported H.264 codec profile
      const codecCandidates = [
        "avc1.4D0032",  // Main Level 5.0
        "avc1.4D401F",  // Main Level 3.1
        "avc1.42001E",  // Baseline Level 3.0
        "avc1.42E01E",  // Baseline Level 3.0 alt
        "avc1.640032",  // High Level 5.0
      ];

      let selectedCodec = null;
      for (const c of codecCandidates) {
        try {
          const support = await VideoEncoder.isConfigSupported({
            codec: c, width: encW, height: encH, bitrate: 8_000_000, framerate: fps,
          });
          if (support.supported) { selectedCodec = c; break; }
        } catch (_) { /* skip */ }
      }

      if (!selectedCodec) {
        throw new Error("No supported H.264 codec found on this browser.");
      }

      let encoderError = null;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxer.addVideoChunk(chunk, meta);
          encodedCount++;
          const pct = Math.round((encodedCount / totalFrames) * 100);
          showExportProgress("Exporting MP4...", `${encodedCount} / ${totalFrames} frames`, pct);
        },
        error: (e) => {
          console.error("VideoEncoder error:", e);
          encoderError = e;
        },
      });

      encoder.configure({
        codec: selectedCodec,
        width: encW,
        height: encH,
        bitrate: 8_000_000,
        framerate: fps,
        hardwareAcceleration: "prefer-software",
      });

      // Wait a tick to let configure errors propagate
      await new Promise(r => setTimeout(r, 50));
      if (encoderError || encoder.state === "closed") {
        throw new Error(encoderError?.message || "Encoder closed during configure");
      }

      // Feed frames one by one
      for (let i = 0; i < totalFrames; i++) {
        if (exportCancelled) break;
        if (encoder.state === "closed") {
          throw new Error("Encoder closed unexpectedly at frame " + i);
        }

        const frameSrc = capturedFrames[i];
        let vf;

        if (frameSrc instanceof ImageBitmap) {
          vf = new VideoFrame(frameSrc, {
            timestamp: i * frameDuration,
            duration: frameDuration,
          });
        } else {
          const offC = new OffscreenCanvas(w, h);
          const offCtx = offC.getContext("2d");
          offCtx.putImageData(frameSrc, 0, 0);
          vf = new VideoFrame(offC, {
            timestamp: i * frameDuration,
            duration: frameDuration,
          });
        }

        encoder.encode(vf, { keyFrame: i % (fps * 2) === 0 });
        vf.close();

        // Yield to UI periodically + back-pressure: wait if queue is full
        if (encoder.encodeQueueSize > 10) {
          await new Promise(r => setTimeout(r, 10));
        }
        if (i % 10 === 0) {
          showExportProgress("Encoding...", `${i + 1} / ${totalFrames} frames`, Math.round(((i + 1) / totalFrames) * 90));
          await new Promise(r => setTimeout(r, 0));
        }
      }

      if (!exportCancelled && encoder.state !== "closed") {
        showExportProgress("Finalizing...", "Flushing encoder...", 92);
        await encoder.flush();
        muxer.finalize();

        showExportProgress("Saving...", "Preparing download...", 100);
        await new Promise(r => setTimeout(r, 100));

        const mp4Blob = new Blob([target.buffer], { type: "video/mp4" });
        downloadBlob(mp4Blob, `spirit-gen-${Date.now()}.mp4`);
      }

      if (encoder.state !== "closed") encoder.close();
    } catch (e) {
      console.error("MP4 export failed:", e);
      alert("MP4 export failed: " + e.message + "\nFalling back to WebM.");
      fallbackWebMFromFrames();
    }

    // Cleanup
    capturedFrames.forEach(f => { if (f.close) f.close(); });
    capturedFrames = [];
    hideExportProgress();
  }

  // ── Fallback: MediaRecorder WebM (for browsers without WebCodecs) ──
  function fallbackWebM(btn) {
    if (isRecording) {
      mediaRecorder.stop();
      return;
    }
    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9" : "video/webm";
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      isRecording = false;
      if (btn) { btn.textContent = "MP4"; btn.classList.remove("active"); }
      const blob = new Blob(recordedChunks, { type: mimeType });
      downloadBlob(blob, `spirit-gen-${Date.now()}.webm`);
      recordedChunks = [];
    };
    mediaRecorder.start(1000);
    isRecording = true;
    if (btn) { btn.textContent = "REC \u25CF"; btn.classList.add("active"); }
  }

  function fallbackWebMFromFrames() {
    // If WebCodecs failed, just clean up — no easy webm from raw frames
    capturedFrames.forEach(f => { if (f.close) f.close(); });
    capturedFrames = [];
    hideExportProgress();
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

  // ── Resolution inputs ──
  const canvasWInput = document.getElementById("canvas-w");
  const canvasHInput = document.getElementById("canvas-h");
  const canvasScaleSlider = document.getElementById("canvas-scale");
  const canvasScaleVal = document.getElementById("canvas-scale-val");

  function syncResInputs(w, h) {
    if (canvasWInput) canvasWInput.value = w;
    if (canvasHInput) canvasHInput.value = h;
  }

  function applyResolution() {
    const w = Math.max(64, Math.min(7680, parseInt(canvasWInput?.value) || 1920));
    const h = Math.max(64, Math.min(4320, parseInt(canvasHInput?.value) || 1080));
    if (canvasWInput) canvasWInput.value = w;
    if (canvasHInput) canvasHInput.value = h;
    resizeCanvas(w, h);
  }

  // Direct number input → resize on Enter or blur
  if (canvasWInput) {
    canvasWInput.addEventListener("change", applyResolution);
    canvasWInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.target.blur(); applyResolution(); }});
  }
  if (canvasHInput) {
    canvasHInput.addEventListener("change", applyResolution);
    canvasHInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.target.blur(); applyResolution(); }});
  }

  // Scale slider → multiply base resolution
  let _baseW = 1920, _baseH = 1080;
  if (canvasScaleSlider) {
    canvasScaleSlider.addEventListener("input", () => {
      const s = parseFloat(canvasScaleSlider.value);
      if (canvasScaleVal) canvasScaleVal.textContent = s.toFixed(2);
      const w = Math.round(_baseW * s);
      const h = Math.round(_baseH * s);
      syncResInputs(w, h);
      resizeCanvas(w, h);
    });
  }

  // Canvas size pills → set preset and sync inputs
  document.querySelectorAll("[data-canvas-size]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-canvas-size]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const key = btn.getAttribute("data-canvas-size");
      const sizeMap = {
        "1080x1080": [1080, 1080],
        "1920x1080": [1920, 1080],
        "1080x1920": [1080, 1920],
        "3840x2160": [3840, 2160],
      };
      const s = sizeMap[key];
      if (s) {
        _baseW = s[0]; _baseH = s[1];
        // Reset scale to 1
        if (canvasScaleSlider) { canvasScaleSlider.value = 1; if (canvasScaleVal) canvasScaleVal.textContent = "1.00"; }
        syncResInputs(s[0], s[1]);
        resizeCanvas(s[0], s[1]);
      }
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
      pushHistory();
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
     HUD — Undo / Redo
     ══════════════════════════════════════════════════════════════════════════ */
  document.getElementById("hud-undo")?.addEventListener("click", undo);
  document.getElementById("hud-redo")?.addEventListener("click", redo);
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z") {
      e.preventDefault();
      undo();
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      redo();
    }
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
      window._spiritLoadedImage = img;
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
          window._spiritLoadedImage = img2;
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
      window._spiritLoadedImage = null;
      if (imageTitle)  imageTitle.textContent = "Drop image file";
      if (imageDrop)   imageDrop.classList.remove("has-image");
      if (previewWrap) previewWrap.classList.add("hidden");
      onInputChange();
    });
  }

  // ── Cmd+V / Ctrl+V Paste image from clipboard ──
  function loadImageFromBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      window._spiritLoadedImage = img;
      if (imageTitle) imageTitle.textContent = name || "Pasted image";
      if (imageDrop)  imageDrop.classList.add("has-image");
      if (previewWrap) { previewWrap.classList.remove("hidden"); previewImg.src = url; }
      // Auto-switch to Image tab
      if (inputMode !== "image") {
        document.querySelector('.input-tab[data-input-tab="image"]')?.click();
      }
      onInputChange();
    };
    img.src = url;
  }

  document.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) loadImageFromBlob(blob, "Clipboard");
        return;
      }
    }
  });

  // ── Invert Colors checkbox ──
  let imageInverted = false;
  const invertCheckbox = document.getElementById("image-invert");
  if (invertCheckbox) {
    invertCheckbox.addEventListener("change", () => {
      imageInverted = invertCheckbox.checked;
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
     Canvas Tools — Brush / Smudge + Brush Cursor + Zoom
     ══════════════════════════════════════════════════════════════════════════ */

  let currentTool  = "brush";   // "brush" | "smudge"
  let brushSize    = 20;
  let zoomLevel    = 1;
  const MIN_ZOOM   = 0.2;
  const MAX_ZOOM   = 5;

  const viewport   = document.getElementById("canvas-viewport");
  const brushCursor = document.getElementById("brush-cursor");
  const brushSlider = document.getElementById("brush-size");
  const brushVal    = document.getElementById("brush-size-val");
  const zoomLabel   = document.getElementById("zoom-label");

  // ── Tool Switching ──
  document.querySelectorAll(".canvas-tool[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".canvas-tool[data-tool]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTool = btn.getAttribute("data-tool");
    });
  });
  // Keyboard shortcuts: B = brush, S = smudge
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    if (e.key === "b" || e.key === "B") {
      document.querySelector('.canvas-tool[data-tool="brush"]')?.click();
    } else if (e.key === "s" || e.key === "S") {
      document.querySelector('.canvas-tool[data-tool="smudge"]')?.click();
    }
  });

  // ── Brush Size Slider ──
  if (brushSlider) {
    brushSlider.addEventListener("input", () => {
      brushSize = parseInt(brushSlider.value);
      if (brushVal) brushVal.textContent = brushSize;
      updateBrushCursor();
    });
  }

  function updateBrushCursor(x, y) {
    if (!brushCursor) return;
    const displaySize = brushSize * zoomLevel;
    brushCursor.style.width  = displaySize + "px";
    brushCursor.style.height = displaySize + "px";
    if (x !== undefined && y !== undefined) {
      brushCursor.style.left = x + "px";
      brushCursor.style.top  = y + "px";
    }
  }

  // ── Brush Cursor Tracking ──
  if (viewport) {
    viewport.addEventListener("mousemove", (e) => {
      const rect = viewport.getBoundingClientRect();
      updateBrushCursor(e.clientX - rect.left, e.clientY - rect.top);
    });
    viewport.addEventListener("mouseleave", () => {
      if (brushCursor) brushCursor.style.display = "none";
    });
    viewport.addEventListener("mouseenter", () => {
      if (brushCursor) brushCursor.style.display = "block";
      updateBrushCursor();
    });
  }

  // ── Smudge Tool (Photoshop-style finger drag) ──
  let _smudgeActive = false;
  let _smudgeLastX  = 0;
  let _smudgeLastY  = 0;
  let _smudgeBuffer = null;  // Float32Array holding "picked up" colour

  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  /** Pick up a circular patch of pixels into _smudgeBuffer */
  function smudgePickup(cx, cy) {
    const r  = Math.round(brushSize / 2);
    const d  = r * 2 + 1;
    _smudgeBuffer = new Float32Array(d * d * 4);
    const ix = Math.round(cx) - r, iy = Math.round(cy) - r;
    const clamped = mainCtx.getImageData(
      Math.max(0, ix), Math.max(0, iy),
      Math.min(d, canvas.width - Math.max(0, ix)),
      Math.min(d, canvas.height - Math.max(0, iy))
    );
    const sd = clamped.data;
    const offX = Math.max(0, -ix), offY = Math.max(0, -iy);
    for (let y = 0; y < clamped.height; y++) {
      for (let x = 0; x < clamped.width; x++) {
        const si = (y * clamped.width + x) * 4;
        const di = ((y + offY) * d + (x + offX)) * 4;
        _smudgeBuffer[di]     = sd[si];
        _smudgeBuffer[di + 1] = sd[si + 1];
        _smudgeBuffer[di + 2] = sd[si + 2];
        _smudgeBuffer[di + 3] = sd[si + 3];
      }
    }
  }

  /** Smudge: blend _smudgeBuffer onto canvas at (cx,cy), then re-sample */
  function smudgeStroke(cx, cy) {
    const r  = Math.round(brushSize / 2);
    const d  = r * 2 + 1;
    if (!_smudgeBuffer || _smudgeBuffer.length !== d * d * 4) return;

    const strength = 0.45;  // how much of the "finger" colour to deposit
    const ix = Math.round(cx) - r, iy = Math.round(cy) - r;
    const sx = Math.max(0, ix), sy = Math.max(0, iy);
    const sw = Math.min(d, canvas.width - sx), sh = Math.min(d, canvas.height - sy);
    if (sw <= 0 || sh <= 0) return;

    const imgData = mainCtx.getImageData(sx, sy, sw, sh);
    const data = imgData.data;
    const offX = sx - ix, offY = sy - iy;
    const r2 = r * r;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const bx = x + offX - r, by = y + offY - r;
        const dist2 = bx * bx + by * by;
        if (dist2 > r2) continue;

        // Smooth circular falloff
        const falloff = 1 - Math.sqrt(dist2) / r;
        const t = falloff * falloff * strength;

        const bi = ((y + offY) * d + (x + offX)) * 4;
        const pi = (y * sw + x) * 4;

        // Blend finger buffer onto canvas
        data[pi]     = data[pi]     * (1 - t) + _smudgeBuffer[bi]     * t;
        data[pi + 1] = data[pi + 1] * (1 - t) + _smudgeBuffer[bi + 1] * t;
        data[pi + 2] = data[pi + 2] * (1 - t) + _smudgeBuffer[bi + 2] * t;

        // Update finger buffer: pick up some of the new canvas colour
        const pickup = t * 0.7;
        _smudgeBuffer[bi]     = _smudgeBuffer[bi]     * (1 - pickup) + data[pi]     * pickup;
        _smudgeBuffer[bi + 1] = _smudgeBuffer[bi + 1] * (1 - pickup) + data[pi + 1] * pickup;
        _smudgeBuffer[bi + 2] = _smudgeBuffer[bi + 2] * (1 - pickup) + data[pi + 2] * pickup;
      }
    }
    mainCtx.putImageData(imgData, sx, sy);
  }

  if (canvas) {
    canvas.addEventListener("mousedown", (e) => {
      if (currentTool === "smudge" && e.button === 0) {
        _smudgeActive = true;
        const c = getCanvasCoords(e);
        _smudgeLastX = c.x;
        _smudgeLastY = c.y;
        smudgePickup(c.x, c.y);  // pick up initial colours
        e.preventDefault();
      }
    });
    canvas.addEventListener("mousemove", (e) => {
      if (_smudgeActive && currentTool === "smudge") {
        const c = getCanvasCoords(e);
        // Interpolate for smooth strokes
        const dx = c.x - _smudgeLastX, dy = c.y - _smudgeLastY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const step = Math.max(2, brushSize / 6);
        if (dist > 0.5) {
          const steps = Math.ceil(dist / step);
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            smudgeStroke(_smudgeLastX + dx * t, _smudgeLastY + dy * t);
          }
        }
        _smudgeLastX = c.x;
        _smudgeLastY = c.y;
      }
    });
    document.addEventListener("mouseup", () => {
      _smudgeActive = false;
      _smudgeBuffer = null;
    });
  }

  // ── Zoom (Cmd+Wheel / Ctrl+Wheel) ──
  function setZoom(newZoom) {
    zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    if (canvas) canvas.style.transform = `scale(${zoomLevel})`;
    if (zoomLabel) zoomLabel.textContent = Math.round(zoomLevel * 100) + "%";
    updateBrushCursor();
  }

  if (viewport) {
    viewport.addEventListener("wheel", (e) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(zoomLevel + delta * zoomLevel);
      }
    }, { passive: false });
  }

  // Keyboard zoom: Cmd+= / Cmd+- / Cmd+0
  document.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === "=" || e.key === "+") { e.preventDefault(); setZoom(zoomLevel * 1.15); }
    if (e.key === "-")                  { e.preventDefault(); setZoom(zoomLevel / 1.15); }
    if (e.key === "0")                  { e.preventDefault(); setZoom(1); }
  });

  // ── Bracket keys to change brush size ──
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "[") { brushSize = Math.max(2, brushSize - 5); }
    if (e.key === "]") { brushSize = Math.min(100, brushSize + 5); }
    if (e.key === "[" || e.key === "]") {
      if (brushSlider) brushSlider.value = brushSize;
      if (brushVal) brushVal.textContent = brushSize;
      updateBrushCursor();
    }
  });


  /* ══════════════════════════════════════════════════════════════════════════
     Boot
     ══════════════════════════════════════════════════════════════════════════ */
  loadCustomFonts();

  // Apply initial canvas size from the active pill + sync inputs
  const initPill = document.querySelector("[data-canvas-size].active");
  if (initPill) {
    const key = initPill.getAttribute("data-canvas-size");
    const [w, h] = key.split("x").map(Number);
    if (w && h) {
      canvas.width = w; canvas.height = h;
      _baseW = w; _baseH = h;
      syncResInputs(w, h);
    }
  }

  switchEffect(currentEffectId);

  // Push initial snapshot so first undo has a baseline
  setTimeout(pushHistory, 500);

});
