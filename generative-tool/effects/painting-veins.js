/* ═══════════════════════════════════════════════════════════════════════════
   Painting Veins — Interactive vein painting + text/image seeding
   Ported from code-base/vein-obstacle/experiments/painting
   Left-click+drag = paint attractors, Right-click = add seed node
   If text or image input is present, attractors + roots are auto-generated.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const { Vec2, Attractor, VeinNode, Network, Defaults, random } = window.VeinCore;

  class PaintingVeins extends EffectBase {
    constructor() {
      super("painting-veins", "Painting Veins");
      this.network = null;
      this._leftDown = false;
      this._controlsInjected = false;
      this._boundMouseDown = null;
      this._boundMouseUp = null;
      this._boundMouseMove = null;
      this._boundContextMenu = null;
    }

    /* ── Controls ────────────────────────────────────────────────────────── */

    _injectControls() {
      const panel = document.getElementById("effect-painting-veins");
      if (!panel || this._controlsInjected) return;
      this._controlsInjected = true;

      // Wire display toggle checkboxes
      panel.querySelectorAll(".pv-toggle").forEach((cb) => {
        cb.addEventListener("change", () => {
          if (!this.network) return;
          const key = cb.getAttribute("data-toggle");
          this.network.settings[key] = cb.checked;
          if (key === "ShowAttractors" || key === "ShowAttractionZones" || key === "ShowKillZones") {
            for (const a of this.network.attractors) a.settings[key] = cb.checked;
          }
          if (key === "ShowTips" || key === "EnableOpacityBlending") {
            for (const n of this.network.nodes) n.settings[key] = cb.checked;
          }
          if (key === "EnableCanalization" && !cb.checked) {
            for (const n of this.network.nodes) n.thickness = 0;
          }
        });
      });

      // Wire venation pills
      panel.querySelectorAll('.pill[data-group="pv-venation"]').forEach((pill, idx) => {
        pill.addEventListener("click", () => {
          const slider = panel.querySelector('input[type="range"][min="0"][max="1"]');
          if (slider) slider.value = idx;
        });
      });
    }

    /* ── Lifecycle ──────────────────────────────────────────────────────── */

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this._injectControls();
      this.readParams();
      this.setup();
      this._attachMouseHandlers();
    }

    setup() {
      this.readParams();
      const p = this.params;
      const settings = {
        VenationType:          p.venation_type === 1 ? "Closed" : "Open",
        SegmentLength:         p.seg_length     ?? 5,
        AttractionDistance:    p.attract_dist   ?? 30,
        KillDistance:          p.kill_dist      ?? 5,
        IsPaused:             false,
        EnableCanalization:    true,
        EnableOpacityBlending: false,
        ShowAttractors:       true,
        ShowNodes:            true,
        ShowTips:             false,
        ShowAttractionZones:  false,
        ShowKillZones:        false,
        ShowInfluenceLines:   false,
        ShowBounds:           false,
        ShowObstacles:        false,
        RenderMode:           "Lines",
        Colors:               this.isLight ? window.VeinCore.LightColors : window.VeinCore.DarkColors,
        BranchThickness:      p.branch_width ?? 1,
        TipThickness:         p.tip_width    ?? 2,
        BoundsBorderThickness: 1,
      };

      this.network = new Network(this.ctx, settings);

      // Auto-seed from text/image input if present
      const w = this.canvas.width, h = this.canvas.height;
      const attractorPositions = this._getAttractorPositions(w, h);
      if (attractorPositions.length > 0) {
        for (const pos of attractorPositions) {
          const att = new Attractor(new Vec2(pos[0], pos[1]), this.ctx, this.network.settings);
          att.settings = this.network.settings;
          this.network.attractors.push(att);
        }
        const roots = this._getRootPositions(attractorPositions, w, h);
        for (const pos of roots) {
          this.network.addNode(
            new VeinNode(null, new Vec2(pos[0], pos[1]), true, this.ctx, this.network.settings)
          );
        }
      }

      this._drawFrame();
    }

    render() {
      if (!this.network) return;
      this.network.update();
      this._drawFrame();
    }

    _drawFrame() {
      const w = this.canvas.width, h = this.canvas.height;
      const bg = document.getElementById("bg-color")?.value || "#000";
      this.ctx.fillStyle = bg;
      this.ctx.fillRect(0, 0, w, h);
      if (this.network) this.network.draw();
    }

    reset() {
      this.stop();
      this.setup();
    }

    destroy() {
      this.stop();
      this._detachMouseHandlers();
      this.network = null;
      this.canvas = null;
      this.ctx = null;
    }

    /* ── Mouse Interaction ──────────────────────────────────────────────── */

    _getCanvasPos(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
        y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
      };
    }

    _paintAttractors(cx, cy) {
      const radius = this.brushSize;
      const quantity = Math.max(1, Math.round(radius / 3));
      for (let i = 0; i < quantity; i++) {
        const r = random(-radius, radius);
        const a = random(0, Math.PI * 2);
        const att = new Attractor(
          new Vec2(cx + r * Math.cos(a), cy + r * Math.sin(a)),
          this.ctx,
          this.network.settings
        );
        att.settings = this.network.settings;
        this.network.attractors.push(att);
      }
    }

    _attachMouseHandlers() {
      const canvas = this.canvas;
      if (!canvas) return;

      this._boundMouseDown = (e) => {
        if (!this.network) return;
        const pos = this._getCanvasPos(e);

        if (e.button === 0) {
          // Left click: paint attractors
          this._leftDown = true;
          this._paintAttractors(pos.x, pos.y);
        } else if (e.button === 2) {
          // Right click: place seed node
          this.network.addNode(
            new VeinNode(null, new Vec2(pos.x, pos.y), true, this.ctx, this.network.settings)
          );
        }
      };

      this._boundMouseMove = (e) => {
        if (this._leftDown && this.network) {
          const pos = this._getCanvasPos(e);
          this._paintAttractors(pos.x, pos.y);
        }
      };

      this._boundMouseUp = (e) => {
        if (e.button === 0) this._leftDown = false;
      };

      this._boundContextMenu = (e) => {
        // Prevent context menu on right-click over canvas
        const rect = canvas.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          e.preventDefault();
        }
      };

      canvas.addEventListener("mousedown", this._boundMouseDown);
      canvas.addEventListener("mousemove", this._boundMouseMove);
      document.addEventListener("mouseup", this._boundMouseUp);
      document.addEventListener("contextmenu", this._boundContextMenu);
    }

    _detachMouseHandlers() {
      if (this.canvas && this._boundMouseDown) {
        this.canvas.removeEventListener("mousedown", this._boundMouseDown);
        this.canvas.removeEventListener("mousemove", this._boundMouseMove);
      }
      if (this._boundMouseUp) document.removeEventListener("mouseup", this._boundMouseUp);
      if (this._boundContextMenu) document.removeEventListener("contextmenu", this._boundContextMenu);
    }

    /* ── Text / Image → Attractor Seeding ─────────────────────────────── */

    _getAttractorPositions(w, h) {
      const offCanvas = document.createElement("canvas");
      offCanvas.width = w; offCanvas.height = h;
      const offCtx = offCanvas.getContext("2d");

      const inputMode = document.querySelector(".input-tab.active")?.getAttribute("data-input-tab") || "type";

      offCtx.fillStyle = "#000";
      offCtx.fillRect(0, 0, w, h);

      if (inputMode === "type") {
        const text = (document.getElementById("text-input")?.value || "").trim();
        if (!text) return [];
        const fontFamily = document.getElementById("font-select")?.value || "sans-serif";
        const wPill = document.querySelector(".pill[data-weight].active");
        const fontWeight = wPill?.getAttribute("data-weight") || "400";

        const lines = text.split("\n");
        let fs = Math.floor(h * 0.6 / Math.max(1, lines.length));
        offCtx.font = `${fontWeight} ${fs}px ${fontFamily}`;
        offCtx.fillStyle = "#fff";
        offCtx.textAlign = "center";
        offCtx.textBaseline = "middle";

        const maxW = w * 0.85;
        let widest = Math.max(...lines.map((l) => offCtx.measureText(l).width));
        while (widest > maxW && fs > 14) { fs -= 2; offCtx.font = `${fontWeight} ${fs}px ${fontFamily}`; widest = Math.max(...lines.map((l) => offCtx.measureText(l).width)); }

        // Stroke to thicken thin letter features (i, r, l, etc.)
        offCtx.strokeStyle = "#fff";
        offCtx.lineWidth = Math.max(3, Math.round(fs * 0.04));
        offCtx.lineJoin = "round";

        const lineH = fs * 1.2;
        const totalH = lines.length * lineH;
        const startY = h / 2 - totalH / 2 + lineH / 2;
        for (let i = 0; i < lines.length; i++) {
          offCtx.strokeText(lines[i], w / 2, startY + i * lineH);
          offCtx.fillText(lines[i], w / 2, startY + i * lineH);
        }
      } else {
        const img = window._spiritLoadedImage;
        if (!img) return [];
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const fit = Math.min((w * 0.7) / iw, (h * 0.7) / ih);
        const dw = iw * fit, dh = ih * fit;
        offCtx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }

      const imgData = offCtx.getImageData(0, 0, w, h).data;
      const positions = [];
      const segLen = this.params.seg_length ?? 5;
      const step = Math.max(1, Math.round(segLen));

      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const idx = (y * w + x) * 4;
          if (imgData[idx] > 128) {
            positions.push([
              x + random(-step / 2, step / 2),
              y + random(-step / 2, step / 2),
            ]);
          }
        }
      }

      return positions;
    }

    _getRootPositions(attractorPositions, w, h) {
      if (attractorPositions.length === 0) return [[w / 2, h / 2]];

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of attractorPositions) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
      }

      const roots = [];

      // Bottom edge roots
      const numBottom = Math.max(3, Math.round((maxX - minX) / 40));
      for (let i = 0; i < numBottom; i++) {
        const x = minX + (maxX - minX) * (i / (numBottom - 1));
        roots.push([x, maxY + 10]);
      }

      // Left & right edge roots
      const edgeRoots = Math.max(2, Math.round((maxY - minY) / 60));
      for (let i = 0; i < edgeRoots; i++) {
        const y = minY + (maxY - minY) * (i / (edgeRoots - 1));
        roots.push([minX - 10, y]);
        roots.push([maxX + 10, y]);
      }

      // Interior roots — sample attractor positions on a grid so every
      // letter cluster has at least one nearby root node
      const cellSize = Math.max(40, (maxX - minX) / 12);
      const grid = new Map();
      for (const p of attractorPositions) {
        const gx = Math.floor(p[0] / cellSize);
        const gy = Math.floor(p[1] / cellSize);
        const key = `${gx},${gy}`;
        if (!grid.has(key)) grid.set(key, p);
      }
      for (const pos of grid.values()) {
        roots.push([pos[0], pos[1]]);
      }

      return roots;
    }

    /* ── SVG Export ─────────────────────────────────────────────────────── */

    exportSVG() {
      if (!this.network || this.network.nodes.length === 0) return null;
      const w = this.canvas.width, h = this.canvas.height;
      const bg = document.getElementById("bg-color")?.value || "#000";
      const net = this.network;
      const branchColor = net.settings.Colors.BranchColor;

      let lines = "";
      for (const node of net.nodes) {
        if (!node.parent) continue;
        const lw = (net.settings.BranchThickness + node.thickness).toFixed(2);
        lines += `  <line x1="${node.parent.position.x.toFixed(1)}" y1="${node.parent.position.y.toFixed(1)}" x2="${node.position.x.toFixed(1)}" y2="${node.position.y.toFixed(1)}" stroke="${branchColor}" stroke-width="${lw}" stroke-linecap="round"/>\n`;
      }

      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
${lines}</svg>`;
    }
  }

  window.SpiritEffects["painting-veins"] = PaintingVeins;
})();
