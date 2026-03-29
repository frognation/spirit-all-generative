/* ═══════════════════════════════════════════════════════════════════════════
   Effect: Cellular Automata
   2D Life-like cellular automata with text seeding + interactive brush painting.
   Source reference: code-base/cellular-automata-
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

  /* ── Well-known Life-like rule presets ─────────────────────────────────── */
  const PRESETS = [
    { name: "Conway's Game of Life",  birth: [3],             survival: [2, 3] },
    { name: "HighLife",               birth: [3, 6],          survival: [2, 3] },
    { name: "Day & Night",            birth: [3, 6, 7, 8],    survival: [3, 4, 6, 7, 8] },
    { name: "Seeds",                  birth: [2],             survival: [] },
    { name: "Replicator",             birth: [1, 3, 5, 7],    survival: [1, 3, 5, 7] },
    { name: "Diamoeba",               birth: [3, 5, 6, 7, 8], survival: [5, 6, 7, 8] },
    { name: "2x2",                    birth: [3, 6],          survival: [1, 2, 5] },
    { name: "34 Life",                birth: [3, 4],          survival: [3, 4] },
    { name: "Amoeba",                 birth: [3, 5, 7],       survival: [1, 3, 5, 8] },
    { name: "Assimilation",           birth: [3, 4, 5],       survival: [4, 5, 6, 7] },
    { name: "Coral",                  birth: [3],             survival: [4, 5, 6, 7, 8] },
    { name: "Coagulations",           birth: [3, 7, 8],       survival: [2, 3, 5, 6, 7, 8] },
    { name: "Flakes",                 birth: [3],             survival: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
    { name: "Gnarl",                  birth: [1],             survival: [1] },
    { name: "Long Life",              birth: [3, 4, 5],       survival: [] },
    { name: "Maze",                   birth: [3],             survival: [] },
    { name: "Mazectric",              birth: [3],             survival: [1, 2, 3, 4] },
    { name: "Move",                   birth: [3, 6, 8],       survival: [] },
    { name: "Pseudo Life",            birth: [3, 5, 7],       survival: [2, 3, 8] },
    { name: "Stains",                 birth: [3, 6, 7, 8],    survival: [2, 3, 5, 6, 7, 8] },
    { name: "Walled Cities",          birth: [4, 5, 6, 7, 8], survival: [2, 3, 4, 5] },
    { name: "Serviettes",             birth: [2, 3, 4],       survival: [] },
    { name: "Vote",                   birth: [5, 6, 7, 8],    survival: [4, 5, 6, 7, 8] },
    { name: "Anneal",                 birth: [4, 6, 7, 8],    survival: [3, 5, 6, 7, 8] },
    { name: "Morley",                 birth: [3, 6, 8],       survival: [2, 4, 5] },
  ];


  /* ── Helpers ───────────────────────────────────────────────────────────── */

  function hexToRGB01(hex) {
    hex = hex || "#ffffff";
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
  }


  /* ── Class ─────────────────────────────────────────────────────────────── */

  class CellularAutomata extends EffectBase {

    constructor() {
      super("cellular-automata", "Cellular Automata");
      // Simulation grids
      this.grid     = null;   // Uint8Array — 0 = dead, 1 = alive
      this.nextGrid = null;
      this.trail    = null;   // Float32Array — trail intensity 0..1 (for fade modes)
      this.cols     = 0;
      this.rows     = 0;
      this.cellSize = 4;
      this.generation = 0;

      // Active rule
      this.birthSet    = new Set([3]);
      this.survivalSet = new Set([2, 3]);
      this.neighborhood = "moore";   // "moore" | "vonneumann"

      // Colors
      this.aliveColor = [1, 1, 1];
      this.deadColor  = [0, 0, 0];
      this.fadeMode   = "hard";      // "hard" | "trail" | "glow"

      // Interactive drawing
      this._mouseHandlersBound = false;
      this._mouseDown  = false;
      this._lastDrawX  = -1;
      this._lastDrawY  = -1;

      this._defaultsApplied = false;

      // Offscreen buffers for organic rendering
      this._simCanvas  = null;
      this._simCtx     = null;
      this._blurBuf1   = null;   // Float32Array for blur ping-pong
      this._blurBuf2   = null;
    }


    /* ══════════════════════════════════════════════════════════════════════
       Lifecycle
       ══════════════════════════════════════════════════════════════════════ */

    setup() {
      if (!this._defaultsApplied) {
        this._defaultsApplied = true;
        this._applyDefaults();
      }
      this.readParams();
      this._readColors();
      this._parseRule();
      this.generation = 0;

      const w = this.canvas.width;
      const h = this.canvas.height;
      this.cellSize = Math.max(1, Math.round(this.params.cell_size || 2));
      this.cols = Math.floor(w / this.cellSize);
      this.rows = Math.floor(h / this.cellSize);

      const len = this.cols * this.rows;
      this.grid     = new Uint8Array(len);
      this.nextGrid = new Uint8Array(len);
      this.trail    = new Float32Array(len);

      // Allocate organic rendering buffers
      this._blurBuf1 = new Float32Array(len);
      this._blurBuf2 = new Float32Array(len);
      if (!this._simCanvas || this._simCanvas.width !== this.cols) {
        this._simCanvas = document.createElement("canvas");
        this._simCanvas.width  = this.cols;
        this._simCanvas.height = this.rows;
        this._simCtx = this._simCanvas.getContext("2d");
      }

      // Seed from text / SVG input
      this._buildSeed(w, h);

      // Bind canvas mouse/pointer handlers (once)
      this._bindMouse();

      // Initial draw
      this._draw();
    }

    render() {
      if (!this.grid) return;

      // Re-read params live so slider changes take effect immediately
      this.readParams();
      this._readColors();
      this._parseRule();

      // Auto-stabilise: stop evolving after ~100 generations to preserve text outline.
      // Mouse painting still adds cells, and Reset restarts evolution.
      const maxGen = 100;
      if (this.generation < maxGen) {
        const gensPerFrame = Math.max(1, Math.round(
          (this.params["gen/frame"] || this.params.gen_frame || 1) * this.speed
        ));
        for (let g = 0; g < gensPerFrame; g++) {
          this._step();
          this.generation++;
          if (this.generation >= maxGen) break;
        }
      }

      this._draw();
    }

    destroy() {
      this._unbindMouse();
      this.grid = this.nextGrid = this.trail = null;
      this._blurBuf1 = this._blurBuf2 = null;
      this._simCanvas = this._simCtx = null;
      super.destroy();
    }


    /* ══════════════════════════════════════════════════════════════════════
       Defaults — set slider values on first init for optimal organic look
       ══════════════════════════════════════════════════════════════════════ */

    _applyDefaults() {
      const panel = document.getElementById("effect-cellular-automata");
      if (!panel) return;
      panel.querySelectorAll(".slider-row").forEach((row) => {
        const lbl = row.querySelector(".slider-label");
        const inp = row.querySelector("input[type='range']");
        const val = row.querySelector(".slider-value");
        if (!lbl || !inp) return;
        const name = lbl.textContent.trim();
        if (name === "Cell Size") {
          inp.value = 2; if (val) val.textContent = "2";
        } else if (name === "Density") {
          inp.value = 0.4; if (val) val.textContent = "40%";
        } else if (name === "Gen/Frame") {
          inp.value = 2; if (val) val.textContent = "2";
        }
      });
    }


    /* ══════════════════════════════════════════════════════════════════════
       Rule Parsing
       ══════════════════════════════════════════════════════════════════════ */

    _parseRule() {
      // Rule slider (0–255) → select from preset list
      const ruleIdx = Math.round(this.params.rule ?? 110);
      const preset  = PRESETS[ruleIdx % PRESETS.length];
      this.birthSet    = new Set(preset.birth);
      this.survivalSet = new Set(preset.survival);

      // Neighborhood from pill group
      const panel = document.getElementById("effect-cellular-automata");
      if (panel) {
        const activePill = panel.querySelector('.pill[data-group="ca-hood"].active');
        if (activePill) {
          this.neighborhood = activePill.textContent.trim().toLowerCase().includes("von")
            ? "vonneumann"
            : "moore";
        }
      }
    }


    /* ══════════════════════════════════════════════════════════════════════
       Color & Fade Params
       ══════════════════════════════════════════════════════════════════════ */

    _readColors() {
      const panel = document.getElementById("effect-cellular-automata");
      if (!panel) return;

      const sec = panel.querySelector("#section-ca-color");
      if (sec) {
        const rows = sec.querySelectorAll(".color-row");
        if (rows[0]) {
          const p = rows[0].querySelector("input[type='color']");
          if (p) this.aliveColor = hexToRGB01(p.value);
        }
        if (rows[1]) {
          const p = rows[1].querySelector("input[type='color']");
          if (p) this.deadColor = hexToRGB01(p.value);
        }
      }

      const fadePill = panel.querySelector('.pill[data-group="ca-fade"].active');
      if (fadePill) {
        const t = fadePill.textContent.trim().toLowerCase();
        this.fadeMode = (t === "trail" || t === "glow") ? t : "hard";
      }
    }


    /* ══════════════════════════════════════════════════════════════════════
       Seed Generation — render text / SVG, extract mask → initial grid
       ══════════════════════════════════════════════════════════════════════ */

    _buildSeed(w, h) {
      // Render text / SVG via the shared drawPlaceholder pipeline
      this.drawPlaceholder();

      // Read pixel data from the main canvas
      const px = this.ctx.getImageData(0, 0, w, h).data;

      // Background colour for comparison
      const bgHex = document.getElementById("bg-color")?.value || "#000000";
      const bgR   = parseInt(bgHex.slice(1, 3), 16);
      const bgG   = parseInt(bgHex.slice(3, 5), 16);
      const bgB   = parseInt(bgHex.slice(5, 7), 16);

      const density = this.params.density ?? 0.5;
      const rng     = EffectBase.prng(this.params.seed || 0);
      const skipY   = h - 30;   // ignore bottom status label

      let hasContent = false;

      for (let row = 0; row < this.rows; row++) {
        for (let col = 0; col < this.cols; col++) {
          // Sample the centre pixel of this cell
          const sx = Math.min(Math.floor(col * this.cellSize + this.cellSize / 2), w - 1);
          const sy = Math.min(Math.floor(row * this.cellSize + this.cellSize / 2), h - 1);
          const pi = (sy * w + sx) * 4;

          const dr = Math.abs(px[pi]     - bgR);
          const dg = Math.abs(px[pi + 1] - bgG);
          const db = Math.abs(px[pi + 2] - bgB);
          const diff = dr + dg + db;

          const isContent = diff > 60 && sy < skipY;
          const gi = row * this.cols + col;

          if (isContent) {
            // Inside text/SVG region — seed with random density
            this.grid[gi] = rng() < density ? 1 : 0;
            hasContent = true;
          } else {
            this.grid[gi] = 0;
          }

          // Initialise trail to match grid
          this.trail[gi] = this.grid[gi];
        }
      }

      // Fallback: if no text/SVG content, seed a rectangular region at centre
      if (!hasContent) {
        const cx = Math.floor(this.cols / 2);
        const cy = Math.floor(this.rows / 2);
        const rx = Math.floor(this.cols * 0.15);
        const ry = Math.floor(this.rows * 0.15);
        for (let row = cy - ry; row <= cy + ry; row++) {
          for (let col = cx - rx; col <= cx + rx; col++) {
            if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
              const gi = row * this.cols + col;
              this.grid[gi] = rng() < density ? 1 : 0;
              this.trail[gi] = this.grid[gi];
            }
          }
        }
      }
    }


    /* ══════════════════════════════════════════════════════════════════════
       Simulation Step — apply birth/survival rules
       ══════════════════════════════════════════════════════════════════════ */

    _step() {
      const { cols, rows, grid, nextGrid, birthSet, survivalSet, trail } = this;
      const isMoore = this.neighborhood === "moore";

      // Trail decay rate per step
      const trailDecay = this.fadeMode === "hard" ? 1.0 : 0.04;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx  = row * cols + col;
          const alive = grid[idx] === 1;
          let neighbors = 0;

          if (isMoore) {
            // Moore neighborhood — 8 surrounding cells (with wrapping)
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = (row + dr + rows) % rows;
                const nc = (col + dc + cols) % cols;
                neighbors += grid[nr * cols + nc];
              }
            }
          } else {
            // Von Neumann neighborhood — 4 cardinal directions
            neighbors += grid[((row - 1 + rows) % rows) * cols + col];
            neighbors += grid[((row + 1) % rows) * cols + col];
            neighbors += grid[row * cols + ((col - 1 + cols) % cols)];
            neighbors += grid[row * cols + ((col + 1) % cols)];
          }

          if (alive) {
            nextGrid[idx] = survivalSet.has(neighbors) ? 1 : 0;
          } else {
            nextGrid[idx] = birthSet.has(neighbors) ? 1 : 0;
          }

          // Update trail
          if (nextGrid[idx] === 1) {
            trail[idx] = 1.0;
          } else {
            trail[idx] = Math.max(0, trail[idx] - trailDecay);
          }
        }
      }

      // Swap grids
      const temp   = this.grid;
      this.grid     = this.nextGrid;
      this.nextGrid = temp;
    }


    /* ══════════════════════════════════════════════════════════════════════
       Drawing
       ══════════════════════════════════════════════════════════════════════ */

    /* ══════════════════════════════════════════════════════════════════════
       Organic Rendering — blur → edge detect → 3D lit outlines
       Processes at simulation resolution (cols×rows) then scales up.
       ══════════════════════════════════════════════════════════════════════ */

    _draw() {
      const { ctx, canvas, cols, rows, grid, trail } = this;
      const w = canvas.width, h = canvas.height;
      const fade = this.fadeMode;

      // ── 1. Build intensity field from grid + trail ──
      const field = this._blurBuf1;
      for (let i = 0; i < grid.length; i++) {
        field[i] = fade === "hard"
          ? (grid[i] ? 1.0 : 0.0)
          : trail[i];
      }

      // ── 2. Separable box blur (4 passes ≈ Gaussian) ──
      const blurred = this._blur(field, cols, rows, 4);

      // ── 3. Hard threshold → binary edge detection → flat outlines ──
      const simImg = this._simCtx.createImageData(cols, rows);
      const sd     = simImg.data;

      const aR = this.aliveColor[0], aG = this.aliveColor[1], aB = this.aliveColor[2];
      const dR = this.deadColor[0],  dG = this.deadColor[1],  dB = this.deadColor[2];

      // Hard threshold: create binary mask from blurred field
      const thresh = 0.18;
      const mask = this._blurBuf2;   // reuse buffer
      for (let i = 0; i < blurred.length; i++) {
        mask[i] = blurred[i] > thresh ? 1 : 0;
      }

      const aR8 = (aR * 255) | 0, aG8 = (aG * 255) | 0, aB8 = (aB * 255) | 0;
      const dR8 = (dR * 255) | 0, dG8 = (dG * 255) | 0, dB8 = (dB * 255) | 0;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i  = y * cols + x;
          const pi = i * 4;

          // Edge = any cell within 1px of a boundary (check all 8 neighbours)
          let isEdge = false;
          if (mask[i] === 1) {
            for (let dy = -1; dy <= 1 && !isEdge; dy++) {
              for (let dx = -1; dx <= 1 && !isEdge; dx++) {
                if (dy === 0 && dx === 0) continue;
                const ny = (y + dy + rows) % rows;
                const nx = (x + dx + cols) % cols;
                if (mask[ny * cols + nx] === 0) isEdge = true;
              }
            }
          }

          if (isEdge) {
            sd[pi] = aR8; sd[pi+1] = aG8; sd[pi+2] = aB8;
          } else {
            sd[pi] = dR8; sd[pi+1] = dG8; sd[pi+2] = dB8;
          }
          sd[pi + 3] = 255;
        }
      }

      this._simCtx.putImageData(simImg, 0, 0);

      // ── 4. Scale up to main canvas (crisp nearest-neighbour) ──
      ctx.imageSmoothingEnabled  = false;
      ctx.drawImage(this._simCanvas, 0, 0, w, h);
    }

    /** Separable box blur (horizontal then vertical), repeated `passes` times. */
    _blur(src, w, h, passes) {
      let a = new Float32Array(src);
      let b = this._blurBuf2;

      for (let p = 0; p < passes; p++) {
        // Horizontal pass
        for (let y = 0; y < h; y++) {
          const yo = y * w;
          for (let x = 0; x < w; x++) {
            b[yo + x] = (
              a[yo + ((x - 1 + w) % w)] +
              a[yo + x] +
              a[yo + ((x + 1) % w)]
            ) / 3;
          }
        }
        // Vertical pass
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            a[y * w + x] = (
              b[((y - 1 + h) % h) * w + x] +
              b[y * w + x] +
              b[((y + 1) % h) * w + x]
            ) / 3;
          }
        }
      }

      return a;
    }


    /* ══════════════════════════════════════════════════════════════════════
       Interactive Brush — mouse / pointer drawing on canvas
       ══════════════════════════════════════════════════════════════════════ */

    _bindMouse() {
      if (this._mouseHandlersBound) return;
      this._mouseHandlersBound = true;

      const c = this.canvas;

      this._onPointerDown = (e) => {
        if (e.button !== 0) return;
        this._mouseDown = true;
        this._paintAt(e);
      };

      this._onPointerMove = (e) => {
        if (!this._mouseDown) return;
        this._paintAt(e);
      };

      this._onPointerUp = () => {
        this._mouseDown  = false;
        this._lastDrawX  = -1;
        this._lastDrawY  = -1;
      };

      c.addEventListener("pointerdown", this._onPointerDown);
      c.addEventListener("pointermove", this._onPointerMove);
      window.addEventListener("pointerup", this._onPointerUp);
    }

    _unbindMouse() {
      if (!this._mouseHandlersBound) return;
      this._mouseHandlersBound = false;

      const c = this.canvas;
      if (c) {
        c.removeEventListener("pointerdown", this._onPointerDown);
        c.removeEventListener("pointermove", this._onPointerMove);
      }
      window.removeEventListener("pointerup", this._onPointerUp);
      this._mouseDown = false;
    }

    /** Paint alive cells at the pointer position (with Bresenham interpolation) */
    _paintAt(e) {
      if (!this.grid) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width  / rect.width;
      const scaleY = this.canvas.height / rect.height;

      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top)  * scaleY;

      const col = Math.floor(px / this.cellSize);
      const row = Math.floor(py / this.cellSize);

      // Brush radius in cells (from shared toolbar, scaled by cell size)
      const brushRadius = Math.max(1, Math.round(this.brushSize / this.cellSize / 2));

      // Bresenham line from last position to fill gaps during fast dragging
      if (this._lastDrawX >= 0 && this._lastDrawY >= 0) {
        this._drawLine(this._lastDrawX, this._lastDrawY, col, row, brushRadius);
      } else {
        this._drawCircle(col, row, brushRadius);
      }

      this._lastDrawX = col;
      this._lastDrawY = row;
    }

    /** Draw a filled circle of alive cells */
    _drawCircle(cx, cy, r) {
      const { cols, rows, grid, trail } = this;
      const r2 = r * r;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nr = (cy + dy + rows) % rows;
          const nc = (cx + dx + cols) % cols;
          const gi = nr * cols + nc;
          grid[gi]  = 1;
          trail[gi] = 1.0;
        }
      }
    }

    /** Draw a line of circles (Bresenham) */
    _drawLine(x0, y0, x1, y1, r) {
      let dx = Math.abs(x1 - x0);
      let dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;

      const maxSteps = dx + dy + 1;
      for (let s = 0; s < maxSteps; s++) {
        this._drawCircle(x0, y0, r);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 <  dx) { err += dx; y0 += sy; }
      }
    }
  }


  // ── Register ──────────────────────────────────────────────────────────
  window.SpiritEffects["cellular-automata"] = CellularAutomata;

})();
