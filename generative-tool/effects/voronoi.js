/* ═══════════════════════════════════════════════════════════════════════════
   Effect: Voronoi
   Voronoi tessellation that FORMS the text shape — cells whose seed point
   is inside the text are drawn; their jagged edges naturally create an
   organic letterform. Chaos blends in the outside cells.
   Supports mouse drawing to expand the voronoi region interactively.
   Uses d3-delaunay (loaded dynamically).
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

  class Voronoi extends EffectBase {
    constructor() {
      super("voronoi", "Voronoi");
      this.points = [];
      this.basePoints = [];
      this.velocities = [];
      this._pointInside = [];
      this.frameCount = 0;
      this._maskCanvas = null;
      this._maskCtx = null;
      this._maskData = null;
      this._drawCanvas = null;
      this._drawCtx = null;
      this._drawing = false;
      this._lastDrawPos = null;
      this._libReady = false;
      this._controlsInjected = false;
      this._mouseHandlers = null;
    }

    /* ── d3-delaunay ──────────────────────────────────────────────────────── */

    async _loadLib() {
      if (window.d3?.Delaunay) { this._libReady = true; return; }
      return new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/d3-delaunay@6";
        s.onload = () => { this._libReady = true; res(); };
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    /* ── Adjust existing HTML slider defaults & ranges ─────────────────── */

    _setSliderDefaults() {
      const panel = document.getElementById("effect-voronoi");
      if (!panel || panel.dataset.voronoiDefaults) return;
      panel.dataset.voronoiDefaults = "1";

      const set = (label, props) => {
        for (const row of panel.querySelectorAll(".slider-row")) {
          const lbl = row.querySelector(".slider-label");
          const inp = row.querySelector("input[type='range']");
          const val = row.querySelector(".slider-value");
          if (!lbl || !inp || lbl.textContent.trim() !== label) continue;
          if (props.min != null) inp.min = props.min;
          if (props.max != null) inp.max = props.max;
          if (props.step != null) inp.step = props.step;
          if (props.value != null) {
            inp.value = props.value;
            if (val) {
              const fmt = inp.dataset.format;
              if (fmt === "fixed0") val.textContent = Math.round(props.value);
              else if (fmt === "fixed1") val.textContent = (+props.value).toFixed(1);
              else if (fmt === "fixed2") val.textContent = (+props.value).toFixed(2);
              else val.textContent = props.value;
            }
          }
        }
      };

      set("Points",      { min: 50, max: 3000, step: 10, value: 800 });
      set("Relaxation",  { max: 50, value: 8 });
      set("Line Weight", { min: 0, max: 3, step: 0.1, value: 0.8 });
      set("Point Size",  { value: 0 });
    }

    /* ── Inject extra controls ────────────────────────────────────────────── */

    _injectControls() {
      if (this._controlsInjected) return;
      const section = document.getElementById("section-v-params");
      if (!section) return;

      const defs = [
        { label: "Anim Speed", min: 0,  max: 5,   step: 0.1, value: 0.5, fmt: "fixed1" },
        { label: "Chaos",      min: 0,  max: 100, step: 1,   value: 0,   fmt: "fixed0" },
        { label: "Trail",      min: 0,  max: 100, step: 5,   value: 0,   fmt: "fixed0" },
        // Brush moved to canvas toolbar
      ];

      for (const c of defs) {
        const row = document.createElement("div");
        row.className = "slider-row";
        row.setAttribute("data-injected", "voronoi");
        row.innerHTML =
          `<span class="slider-label">${c.label}</span>` +
          `<input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}" data-format="${c.fmt}" />` +
          `<span class="slider-value">${c.fmt === "fixed1" ? (+c.value).toFixed(1) : Math.round(c.value)}</span>`;

        const input = row.querySelector("input");
        const valEl = row.querySelector(".slider-value");
        input.addEventListener("input", () => {
          valEl.textContent = c.fmt === "fixed1"
            ? (+input.value).toFixed(1)
            : Math.round(+input.value) + "";
        });
        section.appendChild(row);
      }
      this._controlsInjected = true;
    }

    /* ── Mouse drawing ────────────────────────────────────────────────────── */

    _setupMouseDraw() {
      if (this._mouseHandlers) return;

      const toCanvas = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        return [
          (e.clientX - rect.left) * (this.canvas.width / rect.width),
          (e.clientY - rect.top) * (this.canvas.height / rect.height),
        ];
      };

      const onDown = (e) => {
        // Only draw with left button
        if (e.button !== 0) return;
        this._drawing = true;
        this._lastDrawPos = toCanvas(e);
        this._paintDot(this._lastDrawPos[0], this._lastDrawPos[1]);
        e.preventDefault();
      };

      const onMove = (e) => {
        if (!this._drawing || !this._drawCtx) return;
        const [x, y] = toCanvas(e);
        const [lx, ly] = this._lastDrawPos;

        // Paint line on draw canvas
        const dCtx = this._drawCtx;
        const brush = this.brushSize || 25;
        dCtx.beginPath();
        dCtx.moveTo(lx, ly);
        dCtx.lineTo(x, y);
        dCtx.strokeStyle = "#fff";
        dCtx.lineWidth = brush;
        dCtx.lineCap = "round";
        dCtx.lineJoin = "round";
        dCtx.stroke();

        // Scatter voronoi points along stroke
        this._addDrawPoints(lx, ly, x, y, brush);

        this._lastDrawPos = [x, y];
        if (!this.running) this.render();
      };

      const onUp = () => { this._drawing = false; };

      this.canvas.addEventListener("mousedown", onDown);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);

      this._mouseHandlers = { onDown, onMove, onUp };
    }

    _removeMouseDraw() {
      if (!this._mouseHandlers) return;
      const { onDown, onMove, onUp } = this._mouseHandlers;
      this.canvas?.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      this._mouseHandlers = null;
    }

    _paintDot(x, y) {
      if (!this._drawCtx) return;
      const r = (this.brushSize || 25) / 2;
      this._drawCtx.beginPath();
      this._drawCtx.arc(x, y, r, 0, Math.PI * 2);
      this._drawCtx.fillStyle = "#fff";
      this._drawCtx.fill();
      this._addDrawPoints(x, y, x, y, r * 2);
    }

    _addDrawPoints(x0, y0, x1, y1, brush) {
      // Cap total points to avoid performance issues
      if (this.points.length > 5000) return;

      const dist = Math.max(1, Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2));
      const r = brush / 2;
      const rand = EffectBase.prng(~~(x0 * 997 + y0 * 7 + this.points.length));
      const n = Math.max(2, ~~(dist * 0.2));
      const w = this.canvas.width, h = this.canvas.height;

      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const px = x0 + (x1 - x0) * t + (rand() - 0.5) * r * 1.6;
        const py = y0 + (y1 - y0) * t + (rand() - 0.5) * r * 1.6;
        const cp = [Math.max(1, Math.min(w - 1, px)), Math.max(1, Math.min(h - 1, py))];
        this.points.push(cp);
        this.basePoints.push([...cp]);
        this._pointInside.push(true);
        this.velocities.push({
          speed: rand() * 0.8 + 0.2,
          radius: rand() * 4 + 1,
          phaseX: rand() * Math.PI * 2,
          phaseY: rand() * Math.PI * 2,
        });
      }
    }

    /* ── Text mask ────────────────────────────────────────────────────────── */

    _buildTextMask() {
      const w = this.canvas.width, h = this.canvas.height;

      if (this._inputMask) {
        this._maskData = this._inputMask.data;
        return;
      }

      if (!this._maskCanvas) this._maskCanvas = document.createElement("canvas");
      this._maskCanvas.width = w;
      this._maskCanvas.height = h;
      this._maskCtx = this._maskCanvas.getContext("2d");
      const ctx = this._maskCtx;
      ctx.clearRect(0, 0, w, h);

      const text = (document.getElementById("text-input")?.value || "").trimEnd();
      if (!text && !this._drawCanvas) { this._maskData = null; return; }

      if (text) {
        const font   = document.getElementById("font-select")?.value || "sans-serif";
        const weight = document.querySelector(".pill[data-weight].active")?.dataset.weight || "400";
        const lines  = text.split("\n");
        const nLines = Math.max(1, lines.length);
        const tf     = this._readTransform();

        ctx.save();
        ctx.translate(w / 2 + tf.offsetX * w, h / 2 + tf.offsetY * h);
        if (tf.rotate)      ctx.rotate(tf.rotate * Math.PI / 180);
        if (tf.scale !== 1) ctx.scale(tf.scale, tf.scale);
        if (tf.blur > 0)    ctx.filter = `blur(${tf.blur}px)`;

        let fs = Math.floor(h * 0.65 / nLines);
        ctx.font = `${weight} ${fs}px ${font}`;

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
          ctx.font = `${weight} ${fs}px ${font}`;
          widest = Math.max(...lines.map(measure));
        }

        ctx.fillStyle    = "#fff";
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
        ctx.restore();
      }

      // Overlay user drawings onto the mask
      if (this._drawCanvas) {
        ctx.drawImage(this._drawCanvas, 0, 0);
      }

      this._maskData = ctx.getImageData(0, 0, w, h).data;
    }

    _readTransform() {
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

    _isInMask(x, y) {
      if (!this._maskData) return true;
      const w = this.canvas.width;
      const ix = ~~x, iy = ~~y;
      if (ix < 0 || ix >= w || iy < 0 || iy >= this.canvas.height) return false;
      return this._maskData[(iy * w + ix) * 4 + 3] > 30;
    }

    /* ── Point generation ─────────────────────────────────────────────────── */

    _generatePoints() {
      const w = this.canvas.width, h = this.canvas.height;
      const rand  = EffectBase.prng(this.params.seed || 0);
      const count = this.params.points || 500;

      this.points = [];
      this._pointInside = [];

      if (this._maskData) {
        const insidePixels = [];
        const step = Math.max(1, Math.floor(Math.sqrt(w * h / 60000)));
        for (let y = 0; y < h; y += step)
          for (let x = 0; x < w; x += step)
            if (this._isInMask(x, y)) insidePixels.push([x, y]);

        if (insidePixels.length > 0) {
          // ① Inside-text points
          for (let i = 0; i < count; i++) {
            const [px, py] = insidePixels[~~(rand() * insidePixels.length)];
            this.points.push([
              px + (rand() - 0.5) * step * 2,
              py + (rand() - 0.5) * step * 2,
            ]);
            this._pointInside.push(true);
          }

          // ② Padding points outside for boundary cells
          const nPad = Math.max(30, Math.round(count * 0.3));
          let placed = 0, tries = 0;
          while (placed < nPad && tries < nPad * 50) {
            const x = rand() * w, y = rand() * h;
            if (!this._isInMask(x, y)) {
              this.points.push([x, y]);
              this._pointInside.push(false);
              placed++;
            }
            tries++;
          }
          while (placed < nPad) {
            this.points.push([rand() * w, rand() * h]);
            this._pointInside.push(false);
            placed++;
          }

          // ③ Corner anchors
          for (const c of [[1,1],[w-1,1],[1,h-1],[w-1,h-1],[w/2,1],[w/2,h-1],[1,h/2],[w-1,h/2]]) {
            this.points.push(c);
            this._pointInside.push(false);
          }
        } else {
          for (let i = 0; i < count; i++) {
            this.points.push([rand() * w, rand() * h]);
            this._pointInside.push(true);
          }
        }
      } else {
        for (let i = 0; i < count; i++) {
          this.points.push([rand() * w, rand() * h]);
          this._pointInside.push(true);
        }
      }

      for (const p of this.points) {
        p[0] = Math.max(1, Math.min(w - 1, p[0]));
        p[1] = Math.max(1, Math.min(h - 1, p[1]));
      }

      this.basePoints = this.points.map((p) => [...p]);
      this.velocities = this.points.map(() => ({
        speed:  rand() * 0.8 + 0.2,
        radius: rand() * 4 + 1,
        phaseX: rand() * Math.PI * 2,
        phaseY: rand() * Math.PI * 2,
      }));
    }

    /* ── Lloyd relaxation ─────────────────────────────────────────────────── */

    _relax(n) {
      if (!this._libReady || !this.points.length) return;
      const w = this.canvas.width, h = this.canvas.height;

      for (let iter = 0; iter < n; iter++) {
        const del = window.d3.Delaunay.from(this.points);
        const vor = del.voronoi([0, 0, w, h]);

        for (let i = 0; i < this.points.length; i++) {
          const cell = vor.cellPolygon(i);
          if (!cell || cell.length < 3) continue;

          let cx = 0, cy = 0, a = 0;
          for (let j = 0; j < cell.length - 1; j++) {
            const cross = cell[j][0] * cell[j + 1][1] - cell[j + 1][0] * cell[j][1];
            a  += cross;
            cx += (cell[j][0] + cell[j + 1][0]) * cross;
            cy += (cell[j][1] + cell[j + 1][1]) * cross;
          }
          a /= 2;
          if (Math.abs(a) < 1e-8) continue;
          cx /= 6 * a;
          cy /= 6 * a;

          if (this._pointInside[i]) {
            if (this._isInMask(cx, cy)) this.points[i] = [cx, cy];
          } else {
            this.points[i] = [cx, cy];
          }
        }
      }
      this.basePoints = this.points.map((p) => [...p]);
    }

    /* ── Visual helpers ───────────────────────────────────────────────────── */

    _fillMode() {
      for (const p of document.querySelectorAll('.pill[data-group="v-fill"]'))
        if (p.classList.contains("active")) return p.textContent.trim().toLowerCase();
      return "flat";
    }

    _colors() {
      const sec = document.getElementById("section-v-color");
      if (!sec) return { fill: "#1a1a2e", stroke: "#ffffff" };
      let fill = "#1a1a2e", stroke = "#ffffff";
      sec.querySelectorAll(".color-row").forEach((row) => {
        const lbl = row.querySelector(".sub-label-sm")?.textContent.trim().toLowerCase();
        const inp = row.querySelector('input[type="color"]');
        if (lbl === "fill"   && inp) fill   = inp.value;
        if (lbl === "stroke" && inp) stroke = inp.value;
      });
      return { fill, stroke };
    }

    _lerpColor(a, b, t) {
      t = Math.max(0, Math.min(1, t));
      const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
      const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
      return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
    }

    /* ── Lifecycle ─────────────────────────────────────────────────────────── */

    init(canvas) {
      this.canvas = canvas;
      this.ctx    = canvas.getContext("2d");
      this._injectControls();
      this._setSliderDefaults();
      this.readParams();
      this.drawPlaceholder();

      // Init draw canvas for mouse painting
      this._drawCanvas = document.createElement("canvas");
      this._drawCanvas.width = canvas.width;
      this._drawCanvas.height = canvas.height;
      this._drawCtx = this._drawCanvas.getContext("2d");

      this._setupMouseDraw();

      this._loadLib().then(() => {
        this.setup();
        this.render();
      });
    }

    setup() {
      if (!this._libReady) return;
      this.readParams();
      this.frameCount = 0;

      // Sync draw canvas size
      if (this._drawCanvas &&
          (this._drawCanvas.width !== this.canvas.width ||
           this._drawCanvas.height !== this.canvas.height)) {
        this._drawCanvas.width = this.canvas.width;
        this._drawCanvas.height = this.canvas.height;
        this._drawCtx = this._drawCanvas.getContext("2d");
      }

      this._buildTextMask();
      this._generatePoints();
      this._relax(this.params.relaxation || 8);
    }

    render() {
      if (!this._libReady || !this.points.length) {
        this.drawPlaceholder();
        return;
      }

      const w   = this.canvas.width;
      const h   = this.canvas.height;
      const ctx = this.ctx;
      this.readParams();

      const animSpeed = (this.params.anim_speed ?? 0.5) * this.speed;
      const chaos     = (this.params.chaos || 0) / 100;
      const trail     = (this.params.trail || 0) / 100;
      const lineW     = this.params.line_weight ?? 0.8;
      const ptSize    = this.params.point_size  ?? 0;
      const fillMode  = this._fillMode();
      const colors    = this._colors();
      const bg        = document.getElementById("bg-color")?.value
                        || (this.isLight ? "#e8e8e8" : "#000");

      /* ── Animate ── */
      if (this.running && animSpeed > 0) {
        this.frameCount++;
        const t = this.frameCount * 0.015 * animSpeed;
        for (let i = 0; i < this.points.length; i++) {
          const v     = this.velocities[i];
          const drift = v.radius * (1 + chaos * 8);
          this.points[i][0] = this.basePoints[i][0] + Math.cos(t * v.speed + v.phaseX) * drift;
          this.points[i][1] = this.basePoints[i][1] + Math.sin(t * v.speed * 0.7 + v.phaseY) * drift;
          this.points[i][0] = Math.max(1, Math.min(w - 1, this.points[i][0]));
          this.points[i][1] = Math.max(1, Math.min(h - 1, this.points[i][1]));
        }
      }

      /* ── Voronoi ── */
      const del = window.d3.Delaunay.from(this.points);
      const vor = del.voronoi([0, 0, w, h]);

      /* ── Background ── */
      if (this.running && trail > 0) {
        ctx.globalAlpha = 1 - trail * 0.97;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      }

      /* ── Cells ── */
      const cRand = EffectBase.prng((this.params.seed || 0) + 7777);

      for (let i = 0; i < this.points.length; i++) {
        const inside = this._pointInside[i];
        if (!inside && chaos <= 0) {
          if (fillMode === "random") { cRand(); cRand(); }
          continue;
        }

        const cell = vor.cellPolygon(i);
        if (!cell || cell.length < 3) {
          if (fillMode === "random") { cRand(); cRand(); }
          continue;
        }

        if (!inside) ctx.globalAlpha = chaos;

        ctx.beginPath();
        ctx.moveTo(cell[0][0], cell[0][1]);
        for (let j = 1; j < cell.length; j++) ctx.lineTo(cell[j][0], cell[j][1]);
        ctx.closePath();

        if (fillMode !== "none") {
          switch (fillMode) {
            case "gradient": {
              const dx = this.points[i][0] - w / 2;
              const dy = this.points[i][1] - h / 2;
              const d  = Math.sqrt(dx * dx + dy * dy) / (Math.sqrt(w * w + h * h) / 2);
              ctx.fillStyle = this._lerpColor(colors.fill, colors.stroke, d);
              break;
            }
            case "random":
              ctx.fillStyle = `hsl(${cRand() * 360},${50 + cRand() * 30}%,${25 + cRand() * 45}%)`;
              break;
            default:
              ctx.fillStyle = colors.fill;
          }
          ctx.fill();
        }

        if (lineW > 0) {
          ctx.strokeStyle = colors.stroke;
          ctx.lineWidth   = lineW;
          ctx.stroke();
        }

        if (!inside) ctx.globalAlpha = 1;
      }

      /* ── Points ── */
      if (ptSize > 0) {
        ctx.fillStyle = colors.stroke;
        for (let i = 0; i < this.points.length; i++) {
          if (!this._pointInside[i] && chaos <= 0) continue;
          if (!this._pointInside[i]) ctx.globalAlpha = chaos;
          ctx.beginPath();
          ctx.arc(this.points[i][0], this.points[i][1], ptSize, 0, Math.PI * 2);
          ctx.fill();
          if (!this._pointInside[i]) ctx.globalAlpha = 1;
        }
      }
    }

    /** Export current voronoi state as true vector SVG */
    exportSVG() {
      if (!this._libReady || !this.points.length) return null;
      const w = this.canvas.width, h = this.canvas.height;
      const del = window.d3.Delaunay.from(this.points);
      const vor = del.voronoi([0, 0, w, h]);
      const lineW    = this.params.line_weight ?? 0.8;
      const ptSize   = this.params.point_size  ?? 0;
      const fillMode = this._fillMode();
      const colors   = this._colors();
      const bg       = document.getElementById("bg-color")?.value || "#000";
      const chaos    = (this.params.chaos || 0) / 100;
      const cRand    = EffectBase.prng((this.params.seed || 0) + 7777);

      let paths = "";
      let pts   = "";

      for (let i = 0; i < this.points.length; i++) {
        const inside = this._pointInside[i];
        if (!inside && chaos <= 0) {
          if (fillMode === "random") { cRand(); cRand(); }
          continue;
        }
        const cell = vor.cellPolygon(i);
        if (!cell || cell.length < 3) {
          if (fillMode === "random") { cRand(); cRand(); }
          continue;
        }
        const d = cell.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" L");
        const pathD = `M${d}Z`;
        const opacity = inside ? 1 : chaos;
        let fill = "none";
        if (fillMode !== "none") {
          switch (fillMode) {
            case "gradient": {
              const dx = this.points[i][0] - w / 2;
              const dy = this.points[i][1] - h / 2;
              const t  = Math.sqrt(dx * dx + dy * dy) / (Math.sqrt(w * w + h * h) / 2);
              fill = this._lerpColor(colors.fill, colors.stroke, t);
              break;
            }
            case "random":
              fill = `hsl(${Math.round(cRand() * 360)},${Math.round(50 + cRand() * 30)}%,${Math.round(25 + cRand() * 45)}%)`;
              break;
            default:
              fill = colors.fill;
          }
        }
        const stroke = lineW > 0 ? ` stroke="${colors.stroke}" stroke-width="${lineW}"` : "";
        const op = opacity < 1 ? ` opacity="${opacity.toFixed(2)}"` : "";
        paths += `  <path d="${pathD}" fill="${fill}"${stroke}${op}/>\n`;

        if (ptSize > 0) {
          pts += `  <circle cx="${this.points[i][0].toFixed(2)}" cy="${this.points[i][1].toFixed(2)}" r="${ptSize}" fill="${colors.stroke}"${op}/>\n`;
        }
      }

      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
${paths}${pts}</svg>`;
    }

    reset() {
      this.stop();
      if (this._drawCtx) {
        this._drawCtx.clearRect(0, 0, this._drawCanvas.width, this._drawCanvas.height);
      }
      this.setup();
      this.render();
    }

    destroy() {
      this.stop();
      this._removeMouseDraw();
      document.querySelectorAll('[data-injected="voronoi"]').forEach((el) => el.remove());
      this._controlsInjected = false;
      this.canvas = null;
      this.ctx    = null;
    }
  }

  window.SpiritEffects["voronoi"] = Voronoi;

})();
