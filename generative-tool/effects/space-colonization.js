/* ═══════════════════════════════════════════════════════════════════════════
   Effect: Space Colonization
   Branch-growing toward attractor points sampled from text input.
   Growth is pre-computed during setup(); render() only draws + handles mouse.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

  /* ── Lightweight spatial index (flat grid) with incremental insert ──── */
  class SpatialGrid {
    constructor(cellSize) {
      this.cellSize = Math.max(1, cellSize);
      this.grid = new Map();
      this.xs = [];
      this.ys = [];
      this.count = 0;
    }
    _key(cx, cy) { return (cx << 16) ^ cy; }
    addOne(x, y) {
      const id = this.count++;
      this.xs.push(x);
      this.ys.push(y);
      const cx = Math.floor(x / this.cellSize);
      const cy = Math.floor(y / this.cellSize);
      const k = this._key(cx, cy);
      let bucket = this.grid.get(k);
      if (!bucket) { bucket = []; this.grid.set(k, bucket); }
      bucket.push(id);
      return id;
    }
    within(x, y, r) {
      const results = [];
      const r2 = r * r;
      const cs = this.cellSize;
      const minCx = Math.floor((x - r) / cs);
      const maxCx = Math.floor((x + r) / cs);
      const minCy = Math.floor((y - r) / cs);
      const maxCy = Math.floor((y + r) / cs);
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
          const ids = this.grid.get(this._key(cx, cy));
          if (!ids) continue;
          for (const i of ids) {
            const dx = this.xs[i] - x, dy = this.ys[i] - y;
            if (dx * dx + dy * dy <= r2) results.push(i);
          }
        }
      }
      return results;
    }
    // Find closest node within r. Returns: -2 = killed, -1 = none found, >=0 = closest node id
    findClosest(x, y, r2, killR2) {
      const cs = this.cellSize;
      const r = Math.sqrt(r2);
      const minCx = Math.floor((x - r) / cs);
      const maxCx = Math.floor((x + r) / cs);
      const minCy = Math.floor((y - r) / cs);
      const maxCy = Math.floor((y + r) / cs);
      let bestId = -1, bestD2 = r2;
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
          const ids = this.grid.get(this._key(cx, cy));
          if (!ids) continue;
          for (const i of ids) {
            const dx = this.xs[i] - x, dy = this.ys[i] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < killR2) return -2; // killed
            if (d2 < bestD2) { bestId = i; bestD2 = d2; }
          }
        }
      }
      return bestId;
    }
  }

  /* ── Vec2 helpers ──────────────────────────────────────────────────── */
  const v2norm = (x, y) => {
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };

  /* ── Flat-array node storage for cache performance ─────────────────── */
  // Each node: x, y, parentIdx, isTip, thickness
  // Stored as parallel typed arrays for speed
  class NodeStore {
    constructor(capacity) {
      this.x = new Float32Array(capacity);
      this.y = new Float32Array(capacity);
      this.parent = new Int32Array(capacity);
      this.isTip = new Uint8Array(capacity);
      this.thickness = new Float32Array(capacity);
      this.count = 0;
    }
    add(px, py, parentIdx) {
      const i = this.count++;
      if (i >= this.x.length) this._grow();
      this.x[i] = px;
      this.y[i] = py;
      this.parent[i] = parentIdx;
      this.isTip[i] = 1;
      this.thickness[i] = 0;
      return i;
    }
    _grow() {
      const newCap = this.x.length * 2;
      const copyF = (old) => { const a = new Float32Array(newCap); a.set(old); return a; };
      const copyI = (old) => { const a = new Int32Array(newCap); a.set(old); return a; };
      const copyU = (old) => { const a = new Uint8Array(newCap); a.set(old); return a; };
      this.x = copyF(this.x);
      this.y = copyF(this.y);
      this.parent = copyI(this.parent);
      this.isTip = copyU(this.isTip);
      this.thickness = copyF(this.thickness);
    }
  }

  /* ── Main effect class ─────────────────────────────────────────────── */
  class SpaceColonization extends EffectBase {
    constructor() {
      super("space-colonization", "Space Colonization");
      this.store = null;
      this._done = false;
      this._frameCount = 0;
      this._boundInputChange = null;
      this._inputListeners = [];
      this._drawStrokes = [];
      this._isDrawing = false;
      this._currentStroke = [];
      this._mouseHandlers = {};
    }

    /* ── Lifecycle ────────────────────────────────────────────────── */
    init(canvas) {
      super.init(canvas);
      this._bindInputListeners();
      this._bindMouseDrawing();
    }

    destroy() {
      this._unbindInputListeners();
      this._unbindMouseDrawing();
      super.destroy();
    }

    _bindInputListeners() {
      this._unbindInputListeners();
      let timer = null;
      this._boundInputChange = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!this.canvas) return;
          const wasRunning = this.running;
          this.stop();
          this.setup();
          if (wasRunning) this.start();
        }, 300);
      };
      const textEl = document.getElementById("text-input");
      if (textEl) { textEl.addEventListener("input", this._boundInputChange); this._inputListeners.push([textEl, "input", this._boundInputChange]); }
      const fontEl = document.getElementById("font-select");
      if (fontEl) { fontEl.addEventListener("change", this._boundInputChange); this._inputListeners.push([fontEl, "change", this._boundInputChange]); }
      document.querySelectorAll('.pill-group .pill').forEach(pill => {
        pill.addEventListener("click", this._boundInputChange);
        this._inputListeners.push([pill, "click", this._boundInputChange]);
      });
      const panel = document.getElementById("effect-space-colonization");
      if (panel) {
        panel.querySelectorAll("input[type='range']").forEach(s => { s.addEventListener("change", this._boundInputChange); this._inputListeners.push([s, "change", this._boundInputChange]); });
        panel.querySelectorAll("input[type='color']").forEach(p => { p.addEventListener("input", this._boundInputChange); this._inputListeners.push([p, "input", this._boundInputChange]); });
        panel.querySelectorAll('.pill[data-group="sc-shape"]').forEach(p => { p.addEventListener("click", this._boundInputChange); this._inputListeners.push([p, "click", this._boundInputChange]); });
        const leafCb = document.getElementById("sc-show-leaf");
        if (leafCb) { leafCb.addEventListener("change", this._boundInputChange); this._inputListeners.push([leafCb, "change", this._boundInputChange]); }
      }
    }

    _unbindInputListeners() {
      for (const [el, evt, fn] of this._inputListeners) el.removeEventListener(evt, fn);
      this._inputListeners = [];
      this._boundInputChange = null;
    }

    /* ── Mouse drawing on canvas ─────────────────────────────────── */
    _bindMouseDrawing() {
      this._unbindMouseDrawing();
      if (!this.canvas) return;
      const c = this.canvas;
      const getPos = (e) => {
        const rect = c.getBoundingClientRect();
        return { x: (e.clientX - rect.left) * (c.width / rect.width), y: (e.clientY - rect.top) * (c.height / rect.height) };
      };
      this._mouseHandlers.down = (e) => { if (e.button !== 0) return; this._isDrawing = true; this._currentStroke = [getPos(e)]; e.preventDefault(); };
      this._mouseHandlers.move = (e) => {
        if (!this._isDrawing) return;
        const p = getPos(e);
        const last = this._currentStroke[this._currentStroke.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) > 4) this._currentStroke.push(p);
      };
      this._mouseHandlers.up = (e) => {
        if (!this._isDrawing) return;
        this._isDrawing = false;
        if (this._currentStroke.length > 1) {
          this._drawStrokes.push(this._currentStroke);
          this._injectStroke(this._currentStroke);
        }
        this._currentStroke = [];
      };
      c.addEventListener("mousedown", this._mouseHandlers.down);
      c.addEventListener("mousemove", this._mouseHandlers.move);
      window.addEventListener("mouseup", this._mouseHandlers.up);
    }

    _unbindMouseDrawing() {
      if (!this.canvas) return;
      const c = this.canvas;
      if (this._mouseHandlers.down) c.removeEventListener("mousedown", this._mouseHandlers.down);
      if (this._mouseHandlers.move) c.removeEventListener("mousemove", this._mouseHandlers.move);
      if (this._mouseHandlers.up) window.removeEventListener("mouseup", this._mouseHandlers.up);
      this._mouseHandlers = {};
    }

    /* ── Inject a drawn stroke → run local growth → redraw ────── */
    _injectStroke(stroke) {
      if (stroke.length < 2 || !this.store) return;
      const rand = Math.random;
      const inflR = this._inflR;
      const brushRadius = 15;

      // Build attractors along stroke
      const attrs = [];
      for (let i = 0; i < stroke.length - 1; i++) {
        const a = stroke[i], b = stroke[i + 1];
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t;
          for (let k = 0; k < 4; k++) {
            const angle = rand() * Math.PI * 2, r = rand() * brushRadius;
            attrs.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, reached: false });
          }
        }
      }
      // Overflow
      const oc = Math.ceil(attrs.length * 0.2);
      for (let i = 0; i < oc; i++) {
        const src = stroke[Math.floor(rand() * stroke.length)];
        const angle = rand() * Math.PI * 2, dist = brushRadius + rand() * brushRadius * 4;
        attrs.push({ x: src.x + Math.cos(angle) * dist, y: src.y + Math.sin(angle) * dist, reached: false });
      }

      // Place roots along stroke
      const placed = [];
      for (const p of stroke) {
        let ok = true;
        for (const q of placed) { if (Math.hypot(p.x - q.x, p.y - q.y) < inflR) { ok = false; break; } }
        if (ok) { placed.push(p); this._nodeGrid.addOne(p.x, p.y); this.store.add(p.x, p.y, -1); }
      }

      // Run growth on these attractors
      this._runGrowth(attrs, 300);
      this._draw();
    }

    /* ── Setup: pre-compute entire growth ─────────────────────────── */
    setup() {
      this.readParams();
      this._done = false;
      this._frameCount = 0;
      this._drawStrokes = [];

      const w = this.canvas.width;
      const h = this.canvas.height;
      const rand = EffectBase.prng(this.params.seed || 0);

      const attractorCount = this.params.attractors || 30000;
      const segLen   = this.params.seg_length  || 1.5;
      const inflR    = this.params.infl_radius || 12;
      const killR    = this.params.kill_radius || 2;
      const maxThick = this.params.max_thick   || 5;
      const minThick = this.params.min_thick   || 1.0;
      const overflow = this.params.overflow     ?? 15;
      const rootDensity = this.params.root_density ?? 5;

      this._segLen = segLen;
      this._inflR = inflR;
      this._killR = killR;
      this._maxThick = maxThick;
      this._minThick = minThick;
      this._overflow = overflow;
      this._rootDensity = rootDensity;
      this._readStyle();

      // Prepare flat node storage + spatial grid
      this.store = new NodeStore(attractorCount * 2);
      this._nodeGrid = new SpatialGrid(inflR);

      const textPixels = this._getTextPixels(w, h);

      let attractors;
      if (textPixels.length === 0) {
        attractors = [];
        for (let i = 0; i < attractorCount; i++) {
          attractors.push({ x: rand() * w, y: rand() * h, reached: false });
        }
        const id = this.store.add(w / 2, h - 20, -1);
        this._nodeGrid.addOne(w / 2, h - 20);
      } else {
        // Shuffle + pick attractors
        for (let i = textPixels.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [textPixels[i], textPixels[j]] = [textPixels[j], textPixels[i]];
        }
        const count = Math.min(attractorCount, textPixels.length);
        attractors = [];
        for (let i = 0; i < count; i++) {
          attractors.push({ x: textPixels[i].x, y: textPixels[i].y, reached: false });
        }

        this._addOverflowAttractors(rand, attractors, w, h);
        this._placeRootNodes(rand, textPixels);
      }

      this._runGrowth(attractors, 5000);
      this._draw();
    }

    /* ── Core growth loop (runs to completion or maxIter or time limit) ── */
    _runGrowth(attractors, maxIter) {
      const store = this.store;
      const grid = this._nodeGrid;
      const inflR = this._inflR;
      const killR = this._killR;
      const segLen = this._segLen;
      let staleCount = 0;
      const timeLimit = 5000; // max 5 seconds
      const t0 = performance.now();

      const nodeInfluence = new Map();

      for (let iter = 0; iter < maxIter; iter++) {
        if (attractors.length === 0) break;
        if ((performance.now() - t0) > timeLimit) break;

        const prevCount = store.count;
        nodeInfluence.clear();

        // 1. Associate attractors → nearest node
        const inflR2 = inflR * inflR;
        const killR2 = killR * killR;
        for (let ai = attractors.length - 1; ai >= 0; ai--) {
          const a = attractors[ai];
          const closestId = grid.findClosest(a.x, a.y, inflR2, killR2);
          if (closestId === -1) continue;  // no node in range
          if (closestId === -2) { a.reached = true; continue; } // killed

          const dx = a.x - store.x[closestId], dy = a.y - store.y[closestId];
          const l = Math.hypot(dx, dy) || 1;
          let inf = nodeInfluence.get(closestId);
          if (!inf) { inf = { dx: 0, dy: 0, count: 0 }; nodeInfluence.set(closestId, inf); }
          inf.dx += dx / l;
          inf.dy += dy / l;
          inf.count++;
        }

        // 2. Grow new nodes
        const newNodeIds = [];
        for (const [nodeIdx, inf] of nodeInfluence) {
          let dx = inf.dx + (Math.random() - 0.5) * 0.15;
          let dy = inf.dy + (Math.random() - 0.5) * 0.15;
          const l = Math.hypot(dx, dy) || 1;
          dx /= l; dy /= l;

          store.isTip[nodeIdx] = 0;
          const nx = store.x[nodeIdx] + dx * segLen;
          const ny = store.y[nodeIdx] + dy * segLen;
          const newId = store.add(nx, ny, nodeIdx);
          grid.addOne(nx, ny);
          newNodeIds.push(newId);
        }

        // 3. Canalization (walk up parent chain)
        for (const nid of newNodeIds) {
          let cur = nid;
          while (true) {
            const p = store.parent[cur];
            if (p < 0) break;
            if (store.thickness[p] < store.thickness[cur] + 0.1) {
              store.thickness[p] = store.thickness[cur] + 0.05;
            } else break; // already thick enough, stop propagating
            cur = p;
          }
        }

        // 4. Remove reached attractors (swap-remove, no allocation)
        for (let i = attractors.length - 1; i >= 0; i--) {
          if (attractors[i].reached) {
            attractors[i] = attractors[attractors.length - 1];
            attractors.pop();
          }
        }

        // 5. Stale detection
        if (store.count === prevCount) {
          staleCount++;
          if (staleCount > 80) break;
        } else {
          staleCount = 0;
        }
      }
    }

    /* ── Place root nodes on the medial axis (skeleton) of the text ── */
    _placeRootNodes(rand, textPixels) {
      if (textPixels.length === 0) return;

      // Take the top deepest pixels as root candidates
      const topN = Math.min(20000, textPixels.length);
      const threshold = textPixels.length > topN
        ? textPixels.slice().sort((a, b) => b.dist - a.dist)[topN].dist
        : 0;
      const candidates = textPixels.filter(p => p.dist > threshold);
      // Shuffle to avoid spatial bias
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }

      const densityFactor = 1.0 - (((this._rootDensity ?? 3) - 1) / 9) * 0.8;
      const spacing = this._inflR * densityFactor;
      const spacing2 = spacing * spacing;

      // Use a simple grid for fast proximity checking of placed roots
      const cs = spacing;
      const placedGrid = new Map();
      const pgKey = (x, y) => (Math.floor(x / cs) << 16) ^ Math.floor(y / cs);
      const pgCheck = (x, y) => {
        const cx0 = Math.floor(x / cs), cy0 = Math.floor(y / cs);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const bucket = placedGrid.get(((cx0 + dx) << 16) ^ (cy0 + dy));
            if (!bucket) continue;
            for (const q of bucket) {
              if ((q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) < spacing2) return true;
            }
          }
        }
        return false;
      };

      for (const p of candidates) {
        if (pgCheck(p.x, p.y)) continue;
        const k = pgKey(p.x, p.y);
        if (!placedGrid.has(k)) placedGrid.set(k, []);
        placedGrid.get(k).push(p);
        this.store.add(p.x, p.y, -1);
        this._nodeGrid.addOne(p.x, p.y);
      }

      if (this.store.count === 0) {
        for (let i = 0; i < Math.min(10, textPixels.length); i++) {
          this.store.add(textPixels[i].x, textPixels[i].y, -1);
          this._nodeGrid.addOne(textPixels[i].x, textPixels[i].y);
        }
      }
    }

    /* ── Add overflow attractors outside text ─────────────────────── */
    _addOverflowAttractors(rand, attractors, w, h) {
      const edges = this._edgePixels;
      if (!edges || edges.length === 0) return;

      const overflowPct = (this._overflow ?? 15) / 100;
      const overflowCount = Math.ceil(attractors.length * overflowPct);
      const fs = this._fontSize || 100;

      for (let i = 0; i < overflowCount; i++) {
        const ep = edges[Math.floor(rand() * edges.length)];
        const angle = rand() * Math.PI * 2;
        const maxDist = fs * 0.6;
        const r = rand();
        const dist = (r < 0.7) ? rand() * maxDist * 0.3 : maxDist * 0.3 + Math.pow(rand(), 0.4) * maxDist * 0.7;
        const ox = ep.x + Math.cos(angle) * dist;
        const oy = ep.y + Math.sin(angle) * dist;
        if (ox >= 0 && ox < w && oy >= 0 && oy < h) {
          attractors.push({ x: ox, y: oy, reached: false });
        }
      }
    }

    /* ── Read style ───────────────────────────────────────────────── */
    _readStyle() {
      const panel = document.getElementById("effect-space-colonization");
      if (!panel) return;
      const colorRows = panel.querySelectorAll(".color-row");
      this._branchColor = "#ffffff";
      this._leafColor = "#4ade80";
      if (colorRows[0]) { const p = colorRows[0].querySelector("input[type='color']"); if (p) this._branchColor = p.value; }
      if (colorRows[1]) { const p = colorRows[1].querySelector("input[type='color']"); if (p) this._leafColor = p.value; }
      const leafCb = document.getElementById("sc-show-leaf");
      this._showLeaf = leafCb ? leafCb.checked : true;
      this._shapeMode = "Open";
      const activePill = panel.querySelector('.pill-group .pill.active[data-group="sc-shape"]');
      if (activePill) this._shapeMode = activePill.textContent.trim();
    }

    /* ── Extract text pixels with distance-to-edge ───────────────── */
    _getTextPixels(w, h) {
      const textEl = document.getElementById("text-input");
      const text = textEl ? textEl.value.trim() : "";
      if (!text) return [];

      const fontSelect = document.querySelector("#font-select, .font-select");
      const fontFamily = fontSelect ? fontSelect.value : "Arial";

      let fontWeight = "400";
      const weightPills = document.querySelectorAll('.pill-group .pill.active');
      for (const p of weightPills) {
        const t = p.textContent.trim().toUpperCase();
        if (t === "LIGHT") fontWeight = "300";
        else if (t === "REGULAR") fontWeight = "400";
        else if (t === "BOLD") fontWeight = "700";
        else if (t === "BLACK") fontWeight = "900";
      }

      const off = document.createElement("canvas");
      off.width = w; off.height = h;
      const oc = off.getContext("2d");
      const lines = text.split("\n");

      let fontSize = 200;
      oc.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      const maxLineW = Math.max(...lines.map(l => oc.measureText(l).width));
      if (maxLineW > 0) {
        fontSize = Math.floor(fontSize * (w * 0.8) / maxLineW);
        fontSize = Math.max(40, Math.min(fontSize, h * 0.7));
      }

      oc.fillStyle = "#000"; oc.fillRect(0, 0, w, h);
      oc.fillStyle = "#fff"; oc.textAlign = "center"; oc.textBaseline = "middle";
      oc.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      const lineH = fontSize * 1.15;
      const totalH = lines.length * lineH;
      const startY = (h - totalH) / 2 + lineH / 2;
      for (let i = 0; i < lines.length; i++) oc.fillText(lines[i], w / 2, startY + i * lineH);

      const data = oc.getImageData(0, 0, w, h).data;

      // Downsampled mask
      const step = Math.max(1, Math.floor(Math.min(w, h) / 800));
      const sw = Math.ceil(w / step), sh = Math.ceil(h / step);
      const mask = new Uint8Array(sw * sh);
      for (let sy = 0; sy < sh; sy++) {
        for (let sx = 0; sx < sw; sx++) {
          const px = sx * step, py = sy * step;
          if (px < w && py < h) mask[sy * sw + sx] = data[(py * w + px) * 4] > 128 ? 1 : 0;
        }
      }

      // BFS distance to edge
      const dist = new Float32Array(sw * sh);
      const queue = [];
      for (let sy = 0; sy < sh; sy++) {
        for (let sx = 0; sx < sw; sx++) {
          const idx = sy * sw + sx;
          if (mask[idx] !== 1) continue;
          let isEdge = false;
          for (let dy = -1; dy <= 1 && !isEdge; dy++) {
            for (let dx = -1; dx <= 1 && !isEdge; dx++) {
              const nx = sx + dx, ny = sy + dy;
              if (nx < 0 || ny < 0 || nx >= sw || ny >= sh || mask[ny * sw + nx] === 0) isEdge = true;
            }
          }
          if (isEdge) { dist[idx] = 1; queue.push(idx); }
        }
      }
      let qi = 0;
      while (qi < queue.length) {
        const idx = queue[qi++];
        const sx = idx % sw, sy = (idx - sx) / sw;
        const d = dist[idx];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = sx + dx, ny = sy + dy;
            if (nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue;
            const ni = ny * sw + nx;
            if (mask[ni] === 1 && dist[ni] === 0) { dist[ni] = d + 1; queue.push(ni); }
          }
        }
      }

      const pixels = [];
      const edgePixels = [];
      for (let sy = 0; sy < sh; sy++) {
        for (let sx = 0; sx < sw; sx++) {
          const idx = sy * sw + sx;
          if (mask[idx] === 1) {
            const px = sx * step, py = sy * step, d = dist[idx];
            pixels.push({ x: px, y: py, dist: d });
            if (d <= 2) edgePixels.push({ x: px, y: py });
          }
        }
      }

      this._edgePixels = edgePixels;
      this._fontSize = fontSize;
      return pixels;
    }

    /* ── Drawing (batched for performance) ────────────────────────── */
    _draw() {
      const { ctx, canvas } = this;
      if (!ctx || !canvas) return;
      const w = canvas.width, h = canvas.height;
      const light = this.isLight;

      ctx.fillStyle = light ? "#e8e8e8" : "#000000";
      ctx.fillRect(0, 0, w, h);

      const store = this.store;
      if (!store || store.count === 0) return;

      const branchColor = this._branchColor || (light ? "#222" : "#fff");
      const leafColor = this._leafColor || "#4ade80";
      const minThick = this._minThick;
      const maxThick = this._maxThick;
      const showLeaf = this._showLeaf;

      ctx.lineCap = "round";

      // Batch draw: separate branches (4 thickness bins) and leaf tips
      const bins = [[], [], [], []];
      const leafs = [];
      const thickRange = maxThick + 0.01;

      for (let i = 0; i < store.count; i++) {
        if (store.parent[i] < 0) continue;
        if (store.isTip[i] && showLeaf) {
          leafs.push(i);
        } else {
          const t = Math.min(store.thickness[i], maxThick);
          const binIdx = Math.min(3, Math.floor(t / (thickRange / 4)));
          bins[binIdx].push(i);
        }
      }

      ctx.strokeStyle = branchColor;
      for (let b = 0; b < 4; b++) {
        if (bins[b].length === 0) continue;
        // Compute average thickness for this bin
        let avg = 0;
        for (const i of bins[b]) avg += Math.min(store.thickness[i], maxThick);
        avg /= bins[b].length;
        ctx.lineWidth = Math.max(minThick, minThick + avg);
        ctx.beginPath();
        for (const i of bins[b]) {
          const p = store.parent[i];
          ctx.moveTo(store.x[i], store.y[i]);
          ctx.lineTo(store.x[p], store.y[p]);
        }
        ctx.stroke();
      }

      if (leafs.length > 0) {
        ctx.strokeStyle = leafColor;
        ctx.lineWidth = Math.max(minThick * 0.5, minThick);
        ctx.beginPath();
        for (const i of leafs) {
          const p = store.parent[i];
          ctx.moveTo(store.x[i], store.y[i]);
          ctx.lineTo(store.x[p], store.y[p]);
        }
        ctx.stroke();
      }

      // Mouse stroke preview
      if (this._isDrawing && this._currentStroke.length > 1) {
        ctx.beginPath();
        ctx.moveTo(this._currentStroke[0].x, this._currentStroke[0].y);
        for (let i = 1; i < this._currentStroke.length; i++) ctx.lineTo(this._currentStroke[i].x, this._currentStroke[i].y);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    /* ── Render: just draw (growth is pre-computed) ──────────────── */
    render() {
      this._frameCount++;
      this._draw();
    }
  }

  window.SpiritEffects["space-colonization"] = SpaceColonization;

})();
