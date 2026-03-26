/* ═══════════════════════════════════════════════════════════════════════════
   Effect: Limited Aggregation (DLA)
   Diffusion-limited aggregation — text-filling crystalline growth.
   Uses distance-field analysis to find text stroke centerlines (skeleton).
   Seeds densely along the center axis creating a solid trunk,
   then DLA branches radiate outward filling letter shapes
   with frost-like crystalline growth extending beyond boundaries.
   Source: code-base/limited-aggregation
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

  const DX8 = [-1, 0, 1, -1, 1, -1, 0, 1];
  const DY8 = [-1, -1, -1, 0, 0, 1, 1, 1];

  class LimitedAggregation extends EffectBase {
    constructor() {
      super("limited-aggregation", "Limited Aggregation");
    }

    /* ── Lifecycle ─────────────────────────────────────────────────────────── */

    setup() {
      this.readParams();
      const W = this.canvas.width;
      const H = this.canvas.height;

      this._buildMask();
      this._computeDistField();

      this.grid = new Uint8Array(W * H);
      this.gen = 0;
      this.imgData = this.ctx.createImageData(W, H);
      this._rng = EffectBase.prng(this.params.seed || 0);
      this._prevParticles = this.params.particles || 3000;

      // Exterior tip tracking for overgrowth (circular buffer)
      this._tips = [];
      this._tipMax = 300;

      this._ensureCustomControls();
      this._computeSpawnBox();
      this._fillBg();
      this._placeSeeds();
      this._initWalkers();

      this._cacheColor();
      this._drawAllStuck();
      this.ctx.putImageData(this.imgData, 0, 0);

      this._setupMouseDraw();
    }

    reset() {
      this.stop();
      this._removeMouseDraw();
      this.setup();
    }

    destroy() {
      this._removeMouseDraw();
      super.destroy();
    }

    /* ── Mouse Drawing (interactive seeding) ───────────────────────────────── */

    _setupMouseDraw() {
      if (this._mouseActive) return;
      this._mouseActive = true;
      this._drawing = false;
      this._lastPt = null;

      this._onDown = (e) => {
        if (e.button !== 0) return; // left click only
        this._drawing = true;
        const p = this._toCanvas(e);
        this._lastPt = p;
        this._paintSeed(p.x, p.y, p.x, p.y);
      };
      this._onMove = (e) => {
        if (!this._drawing || !this._lastPt) return;
        const p = this._toCanvas(e);
        this._paintSeed(this._lastPt.x, this._lastPt.y, p.x, p.y);
        this._lastPt = p;
      };
      this._onUp = () => {
        this._drawing = false;
        this._lastPt = null;
      };

      this.canvas.addEventListener("mousedown", this._onDown);
      this.canvas.addEventListener("mousemove", this._onMove);
      this.canvas.addEventListener("mouseup", this._onUp);
      this.canvas.addEventListener("mouseleave", this._onUp);
    }

    _removeMouseDraw() {
      if (!this._mouseActive || !this.canvas) return;
      this.canvas.removeEventListener("mousedown", this._onDown);
      this.canvas.removeEventListener("mousemove", this._onMove);
      this.canvas.removeEventListener("mouseup", this._onUp);
      this.canvas.removeEventListener("mouseleave", this._onUp);
      this._mouseActive = false;
    }

    _toCanvas(e) {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) * this.canvas.width / r.width) | 0,
        y: ((e.clientY - r.top) * this.canvas.height / r.height) | 0,
      };
    }

    _paintSeed(x0, y0, x1, y1) {
      const W = this.canvas.width, H = this.canvas.height;
      const brushR = Math.max(2, ((this.params.radius || 2) + 1) | 0);
      this._cacheColor();
      const [cr, cg, cb] = this._cc;
      const d = this.imgData.data;
      const grid = this.grid;
      const mask = this.mask;
      const r2 = brushR * brushR;

      // Bresenham line with thick brush
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx - dy, cx = x0, cy = y0;

      const stamp = (px, py) => {
        for (let by = -brushR; by <= brushR; by++) {
          const ry = py + by;
          if (ry < 0 || ry >= H) continue;
          for (let bx = -brushR; bx <= brushR; bx++) {
            if (bx * bx + by * by > r2) continue;
            const rx = px + bx;
            if (rx < 0 || rx >= W) continue;
            const idx = ry * W + rx;
            if (!grid[idx]) {
              grid[idx] = 1;
              mask[idx] = 1;
              this.interior.push(idx);
              const o = idx * 4;
              d[o] = cr; d[o + 1] = cg; d[o + 2] = cb;
            }
          }
        }
      };

      while (true) {
        stamp(cx, cy);
        if (cx === x1 && cy === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 < dx) { err += dx; cy += sy; }
      }

      // Expand spawn box if drawn outside
      const margin = 40;
      const sb = this.sBox;
      sb.x0 = Math.max(0, Math.min(sb.x0, x0 - margin, x1 - margin));
      sb.y0 = Math.max(0, Math.min(sb.y0, y0 - margin, y1 - margin));
      sb.x1 = Math.min(W, Math.max(sb.x1, x0 + margin, x1 + margin));
      sb.y1 = Math.min(H, Math.max(sb.y1, y0 + margin, y1 + margin));

      this.ctx.putImageData(this.imgData, 0, 0);
    }

    /* ── Text Mask ─────────────────────────────────────────────────────────── */

    _buildMask() {
      const W = this.canvas.width;
      const H = this.canvas.height;
      const src = this._inputMask || this._renderText();

      this.mask = new Uint8Array(W * H);
      this.interior = [];
      this.boundary = [];

      if (!src) return;

      const px = src.data;
      for (let i = 0; i < W * H; i++) {
        const off = i * 4;
        if (px[off] > 128 || px[off + 1] > 128 || px[off + 2] > 128) {
          this.mask[i] = 1;
          this.interior.push(i);
        }
      }

      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (this.mask[i] &&
            (!this.mask[i - 1] || !this.mask[i + 1] ||
             !this.mask[i - W] || !this.mask[i + W])) {
            this.boundary.push(i);
          }
        }
      }
    }

    _renderText() {
      const W = this.canvas.width;
      const H = this.canvas.height;
      const text = (document.getElementById("text-input")?.value || "Spirit").trim();
      if (!text) return null;

      const font = document.getElementById("font-select")?.value || "sans-serif";
      const wPill = document.querySelector(".pill[data-weight].active");
      const weight = wPill?.dataset.weight || "700";

      let scale = 1, tracking = 0, offX = 0, offY = 0, blur = 0, rotate = 0;
      document.querySelectorAll("#section-transform .slider-row").forEach((row) => {
        const lbl = row.querySelector(".slider-label")?.textContent.trim();
        const v = parseFloat(row.querySelector("input[type='range']")?.value ?? 0);
        switch (lbl) {
          case "Scale":    scale = v; break;
          case "Tracking": tracking = v; break;
          case "Offset X": offX = v; break;
          case "Offset Y": offY = v; break;
          case "Blur":     blur = v; break;
          case "Rotate":   rotate = v; break;
        }
      });

      const oc = document.createElement("canvas");
      oc.width = W; oc.height = H;
      const c = oc.getContext("2d");
      c.fillStyle = "#000";
      c.fillRect(0, 0, W, H);

      const lines = text.split("\n").filter(Boolean);
      const nLines = Math.max(1, lines.length);
      let fs = Math.floor(H * 0.55 / nLines);
      const maxW = W * 0.9;

      const measureLine = (line, fSize) => {
        c.font = `${weight} ${fSize}px ${font}`;
        if (tracking <= 0) return c.measureText(line).width;
        let w = 0;
        for (let i = 0; i < line.length; i++)
          w += c.measureText(line[i]).width + (i < line.length - 1 ? tracking : 0);
        return w;
      };

      let widest = 0;
      for (const l of lines) widest = Math.max(widest, measureLine(l, fs));
      while (widest > maxW && fs > 12) {
        fs -= 2; widest = 0;
        for (const l of lines) widest = Math.max(widest, measureLine(l, fs));
      }

      fs = Math.max(10, Math.round(fs * scale));
      c.font = `${weight} ${fs}px ${font}`;
      const lh = fs * 1.2;
      const totalH = lh * nLines;
      const baseY = -totalH / 2 + lh / 2;

      c.save();
      c.translate(W / 2 + offX * W, H / 2 + offY * H);
      if (rotate) c.rotate(rotate * Math.PI / 180);
      if (blur > 0) c.filter = `blur(${blur}px)`;
      c.fillStyle = "#fff";
      c.textBaseline = "middle";

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const y = baseY + li * lh;
        if (tracking > 0) {
          c.textAlign = "left";
          const tw = measureLine(line, fs);
          let x = -tw / 2;
          for (let ch = 0; ch < line.length; ch++) {
            c.fillText(line[ch], x, y);
            x += c.measureText(line[ch]).width + tracking;
          }
        } else {
          c.textAlign = "center";
          c.fillText(line, 0, y);
        }
      }
      c.restore();
      return c.getImageData(0, 0, W, H);
    }

    /* ── Distance Field (BFS from outside → inside) ────────────────────────── */

    _computeDistField() {
      const W = this.canvas.width;
      const H = this.canvas.height;
      this.distField = new Uint16Array(W * H);
      this.maxDist = 0;

      if (!this.interior.length) return;

      const visited = new Uint8Array(W * H);
      const queue = [];

      // BFS sources: non-text pixels adjacent to text (the "shore")
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (this.mask[i]) continue;  // skip text pixels
          let adjText = false;
          if (x > 0     && this.mask[i - 1]) adjText = true;
          if (x < W - 1 && this.mask[i + 1]) adjText = true;
          if (y > 0     && this.mask[i - W]) adjText = true;
          if (y < H - 1 && this.mask[i + W]) adjText = true;
          if (adjText) {
            visited[i] = 1;
            queue.push(i);
          }
        }
      }

      // BFS into text pixels
      let head = 0;
      while (head < queue.length) {
        const idx = queue[head++];
        const x = idx % W, y = (idx / W) | 0;
        const nd = this.distField[idx] + 1;
        const tryN = (ni) => {
          if (!visited[ni] && this.mask[ni]) {
            visited[ni] = 1;
            this.distField[ni] = nd;
            if (nd > this.maxDist) this.maxDist = nd;
            queue.push(ni);
          }
        };
        if (x > 0)     tryN(idx - 1);
        if (x < W - 1) tryN(idx + 1);
        if (y > 0)     tryN(idx - W);
        if (y < H - 1) tryN(idx + W);
      }
    }

    /* ── Spawn box ─────────────────────────────────────────────────────────── */

    _computeSpawnBox() {
      const W = this.canvas.width;
      const H = this.canvas.height;
      if (!this.interior.length) {
        this.sBox = { x0: 0, y0: 0, x1: W, y1: H };
        return;
      }
      let minX = W, maxX = 0, minY = H, maxY = 0;
      for (const idx of this.interior) {
        const x = idx % W, y = (idx / W) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const mx = Math.max(80, ((maxX - minX) * 0.6) | 0);
      const my = Math.max(80, ((maxY - minY) * 0.6) | 0);
      this.sBox = {
        x0: Math.max(0, minX - mx),
        y0: Math.max(0, minY - my),
        x1: Math.min(W, maxX + mx),
        y1: Math.min(H, maxY + my),
      };
    }

    /* ── Seeding (distance-field guided) ───────────────────────────────────── */

    _placeSeeds() {
      const W = this.canvas.width;
      const rng = this._rng;

      if (!this.interior.length) {
        this.grid[((this.canvas.height >> 1) * W) + (W >> 1)] = 1;
        return;
      }

      const maxD = Math.max(1, this.maxDist);

      // Seed density zones based on distance from boundary
      // Core (center axis): dense but not 100% — leaves texture gaps
      // Mid: sparse nucleation points
      // Near boundary: empty — DLA branches fill this zone
      const coreT = maxD * 0.55;
      const midT  = maxD * 0.2;

      for (const idx of this.interior) {
        const d = this.distField[idx];
        if (d >= coreT) {
          // Core axis: ~65% filled → dense trunk with micro-texture
          if (rng() < 0.65) this.grid[idx] = 1;
        } else if (d >= midT) {
          // Mid zone: sparse nucleation
          if (rng() < 0.10) this.grid[idx] = 1;
        }
      }

      // Sparse boundary outline guide (every ~4px)
      const bStep = Math.max(1, Math.min(4, (this.boundary.length / 400) | 0));
      for (let i = 0; i < this.boundary.length; i += bStep) {
        this.grid[this.boundary[i]] = 1;
      }
    }

    /* ── Walkers ───────────────────────────────────────────────────────────── */

    _initWalkers() {
      const n = Math.min(this.params.particles || 3000, 15000);
      const rng = this._rng;
      this.wx = new Int16Array(n);
      this.wy = new Int16Array(n);
      this.nw = n;
      for (let i = 0; i < n; i++) this._respawn(i, rng);
    }

    _resizeWalkers(newCount) {
      newCount = Math.min(newCount, 15000);
      if (newCount === this.nw) return;
      const rng = this._rng;
      const oldWx = this.wx, oldWy = this.wy, oldN = this.nw;
      this.wx = new Int16Array(newCount);
      this.wy = new Int16Array(newCount);
      this.nw = newCount;
      const copyN = Math.min(oldN, newCount);
      for (let i = 0; i < copyN; i++) { this.wx[i] = oldWx[i]; this.wy[i] = oldWy[i]; }
      for (let i = copyN; i < newCount; i++) this._respawn(i, rng);
    }

    _respawn(i, rng) {
      const W = this.canvas.width;
      const H = this.canvas.height;
      const overgrowth = this.params.overgrowth || 0;

      // Overgrowth: spawn walkers near exterior branch tips → feeds long tendrils
      if (overgrowth > 0 && this._tips.length > 5 && rng() < overgrowth * 0.6) {
        const tip = this._tips[(rng() * this._tips.length) | 0];
        const spread = 8 + ((1 - overgrowth) * 20) | 0; // tighter spread at high overgrowth
        const tx = tip.x + (((rng() * spread * 2) | 0) - spread);
        const ty = tip.y + (((rng() * spread * 2) | 0) - spread);
        this.wx[i] = Math.max(0, Math.min(W - 1, tx));
        this.wy[i] = Math.max(0, Math.min(H - 1, ty));
        return;
      }

      const r = rng();
      if (this.interior.length && r < 0.55) {
        const idx = this.interior[(rng() * this.interior.length) | 0];
        this.wx[i] = idx % W;
        this.wy[i] = (idx / W) | 0;
      } else if (this.boundary.length && r < 0.75) {
        const bidx = this.boundary[(rng() * this.boundary.length) | 0];
        const bx = bidx % W, by = (bidx / W) | 0;
        const off = ((rng() * 40) | 0) - 20;
        const ofy = ((rng() * 40) | 0) - 20;
        this.wx[i] = Math.max(this.sBox.x0, Math.min(this.sBox.x1 - 1, bx + off));
        this.wy[i] = Math.max(this.sBox.y0, Math.min(this.sBox.y1 - 1, by + ofy));
      } else {
        const b = this.sBox;
        this.wx[i] = b.x0 + ((rng() * (b.x1 - b.x0)) | 0);
        this.wy[i] = b.y0 + ((rng() * (b.y1 - b.y0)) | 0);
      }
    }

    /* ── Dynamic Overgrowth slider ─────────────────────────────────────────── */

    _ensureCustomControls() {
      const section = document.getElementById("section-la-params");
      if (!section || section.querySelector("#la-overgrowth")) return;
      const row = document.createElement("div");
      row.className = "slider-row";
      row.innerHTML =
        '<span class="slider-label">Overgrowth</span>' +
        '<input type="range" min="0" max="1" step="0.01" value="0.30" data-format="fixed2" id="la-overgrowth" />' +
        '<span class="slider-value">0.30</span>';
      section.appendChild(row);
      const slider = row.querySelector("input");
      const valEl = row.querySelector(".slider-value");
      slider.addEventListener("input", () => { valEl.textContent = parseFloat(slider.value).toFixed(2); });
    }

    /* ── Simulation + Rendering ────────────────────────────────────────────── */

    render() {
      // Re-read params every frame for real-time slider reactivity
      this.readParams();
      this._cacheColor();

      // Dynamic particle count
      const newP = Math.min(this.params.particles || 3000, 15000);
      if (newP !== this._prevParticles) {
        this._resizeWalkers(newP);
        this._prevParticles = newP;
      }

      const batch = Math.max(1, Math.floor((this.params.batch_size || 10) * this.speed));
      const steps = this.params.walk_speed || 5;
      const W = this.canvas.width;
      const H = this.canvas.height;
      const grid = this.grid;
      const stickiness = this.params.stickiness ?? 1.0;
      const rng = this._rng;
      const wx = this.wx, wy = this.wy;
      const n = this.nw;
      const radius = this.params.radius || 2;
      const d = this.imgData.data;
      const mode = this._colorMode;
      const [cr, cg, cb] = this._cc;
      const sb = this.sBox;
      const overgrowth = this.params.overgrowth || 0;
      let drew = false;

      for (let b = 0; b < batch; b++) {
        for (let s = 0; s < steps; s++) {
          for (let i = 0; i < n; i++) {
            const dir = (rng() * 8) | 0;
            const nx = wx[i] + DX8[dir];
            const ny = wy[i] + DY8[dir];

            if (nx < 0 || nx >= W || ny < 0 || ny >= H) {
              this._respawn(i, rng);
              continue;
            }
            // Respawn if outside spawn box AND no overgrowth tips nearby
            if ((nx < sb.x0 || nx >= sb.x1 || ny < sb.y0 || ny >= sb.y1) && !overgrowth) {
              this._respawn(i, rng);
              continue;
            }

            const nidx = ny * W + nx;
            if (grid[nidx]) continue;

            wx[i] = nx;
            wy[i] = ny;

            // 8-neighbor adjacency
            let adj = false;
            for (let d8 = 0; d8 < 8; d8++) {
              const ax = nx + DX8[d8], ay = ny + DY8[d8];
              if (ax >= 0 && ax < W && ay >= 0 && ay < H && grid[ay * W + ax]) {
                adj = true;
                break;
              }
            }

            if (adj && rng() < stickiness) {
              grid[nidx] = 1;
              this.gen++;

              // Track exterior tips for overgrowth tendril feeding
              if (!this.mask[nidx]) {
                this._tips.push({ x: nx, y: ny });
                if (this._tips.length > this._tipMax) this._tips.shift();
              }

              let pr = cr, pg = cg, pb = cb;
              if (mode === "gradient") {
                const ddx = nx - (W >> 1), ddy = ny - (H >> 1);
                const t = Math.min(1, Math.sqrt(ddx * ddx + ddy * ddy) / (Math.min(W, H) * 0.45));
                pr = (cr * (1 - t * 0.7)) | 0;
                pg = (cg * (1 - t * 0.5)) | 0;
                pb = (cb * (1 - t * 0.3)) | 0;
              } else if (mode === "heat") {
                const total = Math.max(1, this.interior.length || 10000);
                const t = Math.min(1, this.gen / total);
                if (t < 0.5) {
                  const s2 = t * 2;
                  pr = (80 + 175 * s2) | 0;
                  pg = (120 + 135 * s2) | 0;
                  pb = (255 * (1 - s2 * 0.3)) | 0;
                } else {
                  const s2 = (t - 0.5) * 2;
                  pr = 255;
                  pg = (255 * (1 - s2 * 0.6)) | 0;
                  pb = (178 * (1 - s2)) | 0;
                }
              }

              if (radius <= 1) {
                const pi = nidx * 4;
                d[pi] = pr; d[pi + 1] = pg; d[pi + 2] = pb;
              } else {
                this._stamp(nx, ny, radius, pr, pg, pb, W, H, d);
              }
              drew = true;
              this._respawn(i, rng);
            }
          }
        }
      }

      if (drew) this.ctx.putImageData(this.imgData, 0, 0);
    }

    /* ── Drawing Helpers ───────────────────────────────────────────────────── */

    _fillBg() {
      const hex = document.getElementById("bg-color")?.value || "#000000";
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const d = this.imgData.data;
      const len = this.canvas.width * this.canvas.height;
      for (let i = 0; i < len; i++) {
        const o = i * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }

    _cacheColor() {
      const sec = document.getElementById("section-la-color");
      const hex = sec?.querySelector("input[type='color']")?.value || "#ffffff";
      this._cc = [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ];
      const pill = document.querySelector('.pill[data-group="la-color-mode"].active');
      this._colorMode = pill ? pill.textContent.trim().toLowerCase() : "mono";
    }

    _stamp(x, y, radius, r, g, b, W, H, d) {
      const ir = Math.ceil(radius);
      const r2 = radius * radius;
      for (let dy = -ir; dy <= ir; dy++) {
        const py = y + dy;
        if (py < 0 || py >= H) continue;
        for (let dx = -ir; dx <= ir; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const px = x + dx;
          if (px < 0 || px >= W) continue;
          const o = (py * W + px) * 4;
          d[o] = r; d[o + 1] = g; d[o + 2] = b;
        }
      }
    }

    _drawAllStuck() {
      const W = this.canvas.width;
      const H = this.canvas.height;
      const [r, g, b] = this._cc;
      const d = this.imgData.data;
      const radius = this.params.radius || 2;
      for (let i = 0; i < W * H; i++) {
        if (!this.grid[i]) continue;
        const x = i % W, y = (i / W) | 0;
        if (radius <= 1) {
          const o = i * 4;
          d[o] = r; d[o + 1] = g; d[o + 2] = b;
        } else {
          this._stamp(x, y, radius, r, g, b, W, H, d);
        }
      }
    }
  }

  window.SpiritEffects["limited-aggregation"] = LimitedAggregation;

})();
