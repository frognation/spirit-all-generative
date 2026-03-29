/* ═══════════════════════════════════════════════════════════════════════════
   Effect: Neuron Growth (v4)
   Neuron/dendrite-like branching patterns growing outward from text contour.

   ── Architecture ──
   1. Render text/image to mask, detect contour (edge pixels)
   2. Cluster contour into letter groups, pick 1–2 random edge points per letter
   3. Text outline rendered as subtle stroke on canvas
   4. From each soma, dendrites spread in a semicircle AWAY from the text
   5. Growth avoids the text interior (mask collision check)
   6. Branches use cubic bezier curves, taper with depth
   7. Axon: one long branch per soma with collateral side-branches

   ── Parameters (read from right panel) ──
   - seed, dendrite_count, max_branches, branch_prob, segment_length,
     curvature, taper_rate, base_thickness, soma_size, soma_spacing,
     axon_length, growth_speed, opacity

   ── Brush interaction ──
   - Brush tool: paint new neurons (full 360° spread)
   - Smudge tool: push/pull existing branches
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

  // ── Data structures ──────────────────────────────────────────────────

  class Segment {
    constructor(x, y, parentIdx, depth, thickness, angle, type, somaIdx, birthFrame) {
      this.x = x;
      this.y = y;
      this.parentIdx = parentIdx;
      this.depth = depth;
      this.thickness = thickness;
      this.angle = angle;
      this.type = type;              // "dendrite" | "axon"
      this.somaIdx = somaIdx;
      this.birthFrame = birthFrame;
      this.children = [];
      this.grown = false;
      this.cp1x = 0; this.cp1y = 0;
      this.cp2x = 0; this.cp2y = 0;
    }
  }

  class Soma {
    constructor(x, y, vertices) {
      this.x = x;
      this.y = y;
      this.vertices = vertices;
      this.segmentIndices = [];
    }
  }

  // ── Effect class ─────────────────────────────────────────────────────

  class NeuronGrowthEffect extends EffectBase {
    constructor() {
      super("neuron-growth", "Neuron Growth");
      this.segments = [];
      this.somas = [];
      this.growQueue = [];
      this.rand = null;
      this._frameCount = 0;
      this._mouseDown = false;
      this._lastMx = 0;
      this._lastMy = 0;
      // Text mask state
      this._textBinary = null;        // Uint8Array for collision
      this._textRenderState = null;   // for drawing text outline
    }

    /* ── Setup ──────────────────────────────────────────────────────────── */

    setup() {
      this.readParams();
      const p = this.params;
      this.rand = EffectBase.prng(p.seed || 42);
      this.segments = [];
      this.somas = [];
      this.growQueue = [];
      this._frameCount = 0;
      this._textBinary = null;
      this._textRenderState = null;

      const w = this.canvas.width;
      const h = this.canvas.height;

      const somaPositions = this._extractSomaPositions(w, h);
      if (somaPositions.length === 0) {
        somaPositions.push({ x: w / 2, y: h / 2, outwardAngle: null });
      }
      for (const pos of somaPositions) {
        this._createNeuron(pos.x, pos.y, pos.outwardAngle);
      }

      // Mouse events
      this._removeMouseListeners();
      this._onMouseDown = (e) => this._handleMouseDown(e);
      this._onMouseMove = (e) => this._handleMouseMove(e);
      this._onMouseUp = () => { this._mouseDown = false; };
      this.canvas.addEventListener("mousedown", this._onMouseDown);
      this.canvas.addEventListener("mousemove", this._onMouseMove);
      this.canvas.addEventListener("mouseup", this._onMouseUp);
      this.canvas.addEventListener("mouseleave", this._onMouseUp);

      this._draw();
    }

    /* ── Extract soma positions — contour-based, 1–2 per letter ──────── */

    _extractSomaPositions(w, h) {
      const mask = this._getInputMask(w, h);
      if (!mask) return [];

      const data = mask.data;

      // Build binary mask (1 = text, 0 = background)
      const binary = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const idx = i * 4;
        binary[i] = ((data[idx] + data[idx + 1] + data[idx + 2]) / 3 > 80) ? 1 : 0;
      }
      this._textBinary = binary;

      // Find contour pixels (text pixels with at least one non-text neighbor)
      const contour = [];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!binary[y * w + x]) continue;
          const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          for (const [dx, dy] of offsets) {
            if (!binary[(y + dy) * w + (x + dx)]) {
              contour.push({ x, y });
              break;
            }
          }
        }
      }

      if (contour.length === 0) return [];

      // Grid-based clustering to identify letter groups
      const cellSize = 20;
      const gW = Math.ceil(w / cellSize);
      const gH = Math.ceil(h / cellSize);
      const grid = new Uint8Array(gW * gH);
      const cellPoints = new Map(); // gridIndex -> [points]

      for (const p of contour) {
        const gx = Math.floor(p.x / cellSize);
        const gy = Math.floor(p.y / cellSize);
        const gi = gy * gW + gx;
        grid[gi] = 1;
        if (!cellPoints.has(gi)) cellPoints.set(gi, []);
        cellPoints.get(gi).push(p);
      }

      // BFS on grid cells to find connected letter clusters
      const visited = new Uint8Array(gW * gH);
      const clusters = []; // array of contour point arrays

      for (let gy = 0; gy < gH; gy++) {
        for (let gx = 0; gx < gW; gx++) {
          const gi = gy * gW + gx;
          if (!grid[gi] || visited[gi]) continue;

          const queue = [gi];
          visited[gi] = 1;
          const clusterPts = [];

          while (queue.length > 0) {
            const ci = queue.shift();
            const pts = cellPoints.get(ci);
            if (pts) clusterPts.push(...pts);

            const cx = ci % gW, cy = Math.floor(ci / gW);
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= gW || ny < 0 || ny >= gH) continue;
                const ni = ny * gW + nx;
                if (grid[ni] && !visited[ni]) {
                  visited[ni] = 1;
                  queue.push(ni);
                }
              }
            }
          }

          // Filter noise — keep clusters with enough contour pixels
          if (clusterPts.length >= 10) {
            clusters.push(clusterPts);
          }
        }
      }

      // Pick 1–2 random contour points per letter cluster
      const positions = [];
      for (const pts of clusters) {
        // Compute letter centroid (for outward direction)
        const centX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const centY = pts.reduce((s, p) => s + p.y, 0) / pts.length;

        const count = 1 + Math.floor(this.rand() * 2); // 1 or 2
        const usedIdx = new Set();
        for (let i = 0; i < count && i < pts.length; i++) {
          let idx;
          let tries = 0;
          do {
            idx = Math.floor(this.rand() * pts.length);
            tries++;
          } while (usedIdx.has(idx) && tries < 30);
          usedIdx.add(idx);

          const p = pts[idx];
          const outAngle = Math.atan2(p.y - centY, p.x - centX);
          positions.push({ x: p.x, y: p.y, outwardAngle: outAngle });
        }
      }

      return positions;
    }

    /* ── Input mask + store text render state ────────────────────────── */

    _getInputMask(w, h) {
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const ctx = off.getContext("2d");

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      const loadedImg = window._spiritLoadedImage;
      const inputMode = document.querySelector('.input-tab.active')?.getAttribute("data-input-tab") || "type";

      if (inputMode === "image" && loadedImg) {
        const iw = loadedImg.naturalWidth || loadedImg.width;
        const ih = loadedImg.naturalHeight || loadedImg.height;
        const fit = Math.min((w * 0.7) / iw, (h * 0.7) / ih);
        const dx = (w - iw * fit) / 2, dy = (h - ih * fit) / 2;
        const dw = iw * fit, dh = ih * fit;
        ctx.drawImage(loadedImg, dx, dy, dw, dh);
        this._textRenderState = { mode: "image", img: loadedImg, dx, dy, dw, dh };
      } else {
        const text = document.getElementById("text-input")?.value || "";
        if (!text.trim()) return null;

        const fontFamily = document.getElementById("font-select")?.value || "sans-serif";
        const wPill = document.querySelector(".pill[data-weight].active");
        const fontWeight = wPill?.getAttribute("data-weight") || "400";

        const lines = text.split("\n");
        const nLines = Math.max(1, lines.length);
        let fs = Math.floor(h * 0.6 / nLines);
        ctx.font = `${fontWeight} ${fs}px ${fontFamily}`;

        const maxW = w * 0.8;
        let widest = Math.max(...lines.map(l => ctx.measureText(l).width));
        while (widest > maxW && fs > 10) {
          fs -= 2;
          ctx.font = `${fontWeight} ${fs}px ${fontFamily}`;
          widest = Math.max(...lines.map(l => ctx.measureText(l).width));
        }

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const lineH = fs * 1.2;
        const totalH = nLines * lineH;
        const startY = h / 2 - totalH / 2 + lineH / 2;
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], w / 2, startY + i * lineH);
        }

        // Store for outline drawing
        this._textRenderState = {
          mode: "text", lines, fontFamily, fontWeight,
          fontSize: fs, startY, lineH, cx: w / 2
        };
      }
      return ctx.getImageData(0, 0, w, h);
    }

    /* ── Draw text outline on canvas ─────────────────────────────────── */

    _drawTextOutline(ctx, w, h, color, opacity) {
      const s = this._textRenderState;
      if (!s) return;

      ctx.save();
      if (s.mode === "image") {
        ctx.globalAlpha = opacity * 0.15;
        ctx.drawImage(s.img, s.dx, s.dy, s.dw, s.dh);
      } else if (s.lines) {
        ctx.font = `${s.fontWeight} ${s.fontSize}px ${s.fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // ── Fill (visible solid text behind branches) ──
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity * 0.22;
        for (let i = 0; i < s.lines.length; i++) {
          ctx.fillText(s.lines[i], s.cx, s.startY + i * s.lineH);
        }

        // ── Stroke outline (sharper contour on top) ──
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = opacity * 0.40;
        for (let i = 0; i < s.lines.length; i++) {
          ctx.strokeText(s.lines[i], s.cx, s.startY + i * s.lineH);
        }
      }
      ctx.restore();
    }

    /* ── Irregular soma polygon ─────────────────────────────────────── */

    _generateSomaVertices(cx, cy, baseRadius) {
      const N = 8 + Math.floor(this.rand() * 5);
      const vertices = [];
      for (let i = 0; i < N; i++) {
        const baseAngle = (Math.PI * 2 / N) * i;
        const jitter = (this.rand() - 0.5) * (Math.PI * 2 / N) * 0.35;
        const angle = baseAngle + jitter;
        const r = baseRadius * (0.75 + this.rand() * 0.5);
        vertices.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r
        });
      }
      return vertices;
    }

    /* ── Bezier control points ──────────────────────────────────────── */

    _computeControlPoints(px, py, parentAngle, sx, sy, segAngle, segLen) {
      const cpDist = segLen * 0.38;
      return {
        cp1x: px + Math.cos(parentAngle) * cpDist,
        cp1y: py + Math.sin(parentAngle) * cpDist,
        cp2x: sx - Math.cos(segAngle) * cpDist,
        cp2y: sy - Math.sin(segAngle) * cpDist
      };
    }

    /* ── Check if position is inside text mask ──────────────────────── */

    _isInsideText(x, y) {
      if (!this._textBinary) return false;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const ix = Math.floor(x), iy = Math.floor(y);
      if (ix < 0 || ix >= w || iy < 0 || iy >= h) return false;
      return this._textBinary[iy * w + ix] === 1;
    }

    /* ── Neuron creation ────────────────────────────────────────────── */

    _createNeuron(sx, sy, outwardAngle) {
      const p = this.params;
      const somaR = p.soma_size || 5;
      const vertices = this._generateSomaVertices(sx, sy, somaR);
      const soma = new Soma(sx, sy, vertices);
      const somaIdx = this.somas.length;
      this.somas.push(soma);

      const numDendrites = Math.round(p.dendrite_count || 6);
      const segLen = p.segment_length || 8;

      if (outwardAngle != null) {
        // ── Contour-seeded: spread in ~200° arc facing OUTWARD from text ──
        const spread = Math.PI * 1.1;
        const startAngle = outwardAngle - spread / 2;

        for (let i = 0; i < numDendrites; i++) {
          const t = numDendrites > 1 ? i / (numDendrites - 1) : 0.5;
          const angle = startAngle + spread * t + (this.rand() - 0.5) * 0.4;
          const lenVar = segLen * (0.85 + this.rand() * 0.3);
          const nx = sx + Math.cos(angle) * lenVar;
          const ny = sy + Math.sin(angle) * lenVar;
          const thickness = (p.base_thickness || 3.0) * (0.7 + this.rand() * 0.3);

          const seg = new Segment(nx, ny, -1, 0, thickness, angle, "dendrite", somaIdx, this._frameCount);
          const cp = this._computeControlPoints(sx, sy, angle, nx, ny, angle, lenVar);
          seg.cp1x = cp.cp1x; seg.cp1y = cp.cp1y;
          seg.cp2x = cp.cp2x; seg.cp2y = cp.cp2y;

          const idx = this.segments.length;
          this.segments.push(seg);
          soma.segmentIndices.push(idx);
          this.growQueue.push(idx);
        }

        // Axon — points roughly outward
        const axonAngle = outwardAngle + (this.rand() - 0.5) * 0.6;
        const axonThick = (p.base_thickness || 3.0) * 1.3;
        const aLen = segLen * (0.9 + this.rand() * 0.2);
        const ax = sx + Math.cos(axonAngle) * aLen;
        const ay = sy + Math.sin(axonAngle) * aLen;

        const axonSeg = new Segment(ax, ay, -1, 0, axonThick, axonAngle, "axon", somaIdx, this._frameCount);
        const acp = this._computeControlPoints(sx, sy, axonAngle, ax, ay, axonAngle, aLen);
        axonSeg.cp1x = acp.cp1x; axonSeg.cp1y = acp.cp1y;
        axonSeg.cp2x = acp.cp2x; axonSeg.cp2y = acp.cp2y;

        const axonIdx = this.segments.length;
        this.segments.push(axonSeg);
        soma.segmentIndices.push(axonIdx);
        this.growQueue.push(axonIdx);
      } else {
        // ── Brush-created: full 360° spread ──
        const baseAngleStep = (Math.PI * 2) / numDendrites;

        for (let i = 0; i < numDendrites; i++) {
          const angle = baseAngleStep * i + (this.rand() - 0.5) * 0.6;
          const lenVar = segLen * (0.85 + this.rand() * 0.3);
          const nx = sx + Math.cos(angle) * lenVar;
          const ny = sy + Math.sin(angle) * lenVar;
          const thickness = (p.base_thickness || 3.0) * (0.7 + this.rand() * 0.3);

          const seg = new Segment(nx, ny, -1, 0, thickness, angle, "dendrite", somaIdx, this._frameCount);
          const cp = this._computeControlPoints(sx, sy, angle, nx, ny, angle, lenVar);
          seg.cp1x = cp.cp1x; seg.cp1y = cp.cp1y;
          seg.cp2x = cp.cp2x; seg.cp2y = cp.cp2y;

          const idx = this.segments.length;
          this.segments.push(seg);
          soma.segmentIndices.push(idx);
          this.growQueue.push(idx);
        }

        const axonAngle = this.rand() * Math.PI * 2;
        const axonThick = (p.base_thickness || 3.0) * 1.3;
        const aLen = segLen * (0.9 + this.rand() * 0.2);
        const ax = sx + Math.cos(axonAngle) * aLen;
        const ay = sy + Math.sin(axonAngle) * aLen;

        const axonSeg = new Segment(ax, ay, -1, 0, axonThick, axonAngle, "axon", somaIdx, this._frameCount);
        const acp = this._computeControlPoints(sx, sy, axonAngle, ax, ay, axonAngle, aLen);
        axonSeg.cp1x = acp.cp1x; axonSeg.cp1y = acp.cp1y;
        axonSeg.cp2x = acp.cp2x; axonSeg.cp2y = acp.cp2y;

        const axonIdx = this.segments.length;
        this.segments.push(axonSeg);
        soma.segmentIndices.push(axonIdx);
        this.growQueue.push(axonIdx);
      }
    }

    /* ── Growth step ────────────────────────────────────────────────── */

    _growStep() {
      if (this.growQueue.length === 0) return false;

      const p = this.params;
      const segLen = p.segment_length || 8;
      const curvature = p.curvature || 0.4;
      const baseBranchProb = p.branch_prob || 0.15;
      const minThickness = 0.3;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const axonLengthMult = p.axon_length || 3.0;

      // ── Dynamic depth: branches grow far enough to FILL the entire canvas ──
      const diagonal = Math.sqrt(w * w + h * h);
      const dynamicMax = Math.ceil(diagonal * 0.6 / segLen);
      const dendMaxDepth = Math.max(Math.round(p.max_branches || 6), dynamicMax);

      // Gentle taper — so distant branches stay visible, not paper-thin
      const userTaper = p.taper_rate || 0.82;
      const autoTaper = Math.pow(0.05, 1 / dendMaxDepth);
      const taperRate = Math.max(userTaper, autoTaper);

      // Branch at wide intervals — clean, sparse structure (not every step)
      const branchInterval = Math.max(12, Math.floor(dendMaxDepth / 8));

      // Performance cap
      const MAX_SEGMENTS = 8000;
      if (this.segments.length >= MAX_SEGMENTS) { this.growQueue = []; return false; }

      const newQueue = [];
      const batchSize = Math.round(p.growth_speed || 20);
      const toProcess = this.growQueue.splice(0, batchSize);

      for (const idx of toProcess) {
        const seg = this.segments[idx];
        if (seg.grown) continue;
        seg.grown = true;

        const isAxon = seg.type === "axon";
        const maxSteps = isAxon ? Math.round(dendMaxDepth * axonLengthMult) : dendMaxDepth;
        if (seg.depth >= maxSteps) continue;
        if (seg.thickness < minThickness) continue;

        const curvMult = isAxon ? 0.35 : 1.0;
        const angleDeviation = (this.rand() - 0.5) * curvature * 2 * curvMult;
        const newAngle = seg.angle + angleDeviation;

        const lenVar = segLen * (0.8 + this.rand() * 0.4);
        const nx = seg.x + Math.cos(newAngle) * lenVar;
        const ny = seg.y + Math.sin(newAngle) * lenVar;

        // Bounds check
        if (nx < 5 || nx > w - 5 || ny < 5 || ny > h - 5) continue;

        // ── Avoid growing INTO the text ──
        if (this._isInsideText(nx, ny)) continue;

        const newThickness = seg.thickness * taperRate;
        const child = new Segment(
          nx, ny, idx, seg.depth + 1, newThickness,
          newAngle, seg.type, seg.somaIdx, this._frameCount
        );
        const cp = this._computeControlPoints(seg.x, seg.y, seg.angle, nx, ny, newAngle, lenVar);
        child.cp1x = cp.cp1x; child.cp1y = cp.cp1y;
        child.cp2x = cp.cp2x; child.cp2y = cp.cp2y;

        const childIdx = this.segments.length;
        this.segments.push(child);
        seg.children.push(childIdx);
        newQueue.push(childIdx);

        // Dendrite branching — only at intervals, steep probability decay
        if (!isAxon && seg.depth > 0 && seg.depth % branchInterval === 0 && seg.depth < dendMaxDepth - branchInterval) {
          const depthRatio = seg.depth / maxSteps;
          const branchProb = baseBranchProb * Math.pow(1 - depthRatio, 3);
          if (this.rand() < branchProb) {
            const side = this.rand() > 0.5 ? 1 : -1;
            const branchAngle = newAngle + side * (0.35 + this.rand() * 0.9);
            const bLen = lenVar * (0.7 + this.rand() * 0.2);
            const bx = seg.x + Math.cos(branchAngle) * bLen;
            const by = seg.y + Math.sin(branchAngle) * bLen;
            if (bx > 5 && bx < w - 5 && by > 5 && by < h - 5 && !this._isInsideText(bx, by)) {
              const branchThick = newThickness * (0.45 + this.rand() * 0.3);
              const branch = new Segment(
                bx, by, idx, seg.depth + 1, branchThick,
                branchAngle, "dendrite", seg.somaIdx, this._frameCount
              );
              const bcp = this._computeControlPoints(seg.x, seg.y, seg.angle, bx, by, branchAngle, bLen);
              branch.cp1x = bcp.cp1x; branch.cp1y = bcp.cp1y;
              branch.cp2x = bcp.cp2x; branch.cp2y = bcp.cp2y;
              const branchIdx = this.segments.length;
              this.segments.push(branch);
              seg.children.push(branchIdx);
              newQueue.push(branchIdx);
            }
          }
        }

        // Axon collateral branches
        if (isAxon && seg.depth > 5 && seg.depth % 15 === 0 && this.rand() < 0.20) {
          const side = this.rand() > 0.5 ? 1 : -1;
          const collAngle = newAngle + side * (0.6 + this.rand() * 0.7);
          const cLen = lenVar * 0.65;
          const cx = seg.x + Math.cos(collAngle) * cLen;
          const cy = seg.y + Math.sin(collAngle) * cLen;
          if (cx > 5 && cx < w - 5 && cy > 5 && cy < h - 5 && !this._isInsideText(cx, cy)) {
            const collThick = newThickness * 0.4;
            const collDepth = Math.max(seg.depth, dendMaxDepth - 3);
            const coll = new Segment(
              cx, cy, idx, collDepth, collThick,
              collAngle, "dendrite", seg.somaIdx, this._frameCount
            );
            const ccp = this._computeControlPoints(seg.x, seg.y, seg.angle, cx, cy, collAngle, cLen);
            coll.cp1x = ccp.cp1x; coll.cp1y = ccp.cp1y;
            coll.cp2x = ccp.cp2x; coll.cp2y = ccp.cp2y;
            const collIdx = this.segments.length;
            this.segments.push(coll);
            seg.children.push(collIdx);
            newQueue.push(collIdx);
          }
        }
      }

      this.growQueue.push(...newQueue);
      return newQueue.length > 0;
    }

    /* ── Render ──────────────────────────────────────────────────────── */

    render() {
      const stepsPerFrame = Math.ceil(this.speed * 2);
      for (let i = 0; i < stepsPerFrame; i++) {
        this._growStep();
      }
      this._draw();
      this._frameCount++;
    }

    _draw() {
      const { ctx, canvas } = this;
      const w = canvas.width, h = canvas.height;
      const p = this.params;
      const light = this.isLight;

      // Background
      const bg = document.getElementById("bg-color")?.value || (light ? "#e8e8e8" : "#000000");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Read colors
      const panel = document.getElementById("effect-neuron-growth");
      const dendriteColor = panel?.querySelector("#ng-dendrite-color")?.value || (light ? "#222222" : "#ffffff");
      const axonColor = panel?.querySelector("#ng-axon-color")?.value || (light ? "#444444" : "#aaccff");
      const somaColor = panel?.querySelector("#ng-soma-color")?.value || (light ? "#000000" : "#ffffff");
      const showSoma = panel?.querySelector("#ng-show-soma")?.checked ?? true;
      const opacity = p.opacity || 1.0;

      // ── Draw text outline (subtle, behind everything) ──
      this._drawTextOutline(ctx, w, h, dendriteColor, opacity);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // ── Draw segments as cubic bezier curves ──
      for (let i = 0; i < this.segments.length; i++) {
        const seg = this.segments[i];
        const parent = seg.parentIdx >= 0 ? this.segments[seg.parentIdx] : null;

        let px, py;
        if (parent) {
          px = parent.x;
          py = parent.y;
        } else {
          const soma = this.somas[seg.somaIdx];
          if (!soma) continue;
          px = soma.x;
          py = soma.y;
        }

        const age = this._frameCount - seg.birthFrame;
        const fadeIn = Math.min(1, age / 10);
        ctx.globalAlpha = opacity * fadeIn;

        ctx.strokeStyle = seg.type === "axon" ? axonColor : dendriteColor;
        ctx.lineWidth = Math.max(0.2, seg.thickness);

        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y);
        ctx.stroke();
      }

      // ── Draw somas as smooth irregular polygons ──
      if (showSoma) {
        ctx.globalAlpha = opacity;
        ctx.fillStyle = somaColor;

        for (const soma of this.somas) {
          const v = soma.vertices;
          if (v.length < 3) {
            ctx.beginPath();
            ctx.arc(soma.x, soma.y, p.soma_size || 5, 0, Math.PI * 2);
            ctx.fill();
            continue;
          }

          const len = v.length;
          const mx0 = (v[len - 1].x + v[0].x) / 2;
          const my0 = (v[len - 1].y + v[0].y) / 2;
          ctx.beginPath();
          ctx.moveTo(mx0, my0);
          for (let j = 0; j < len; j++) {
            const curr = v[j];
            const next = v[(j + 1) % len];
            const mx = (curr.x + next.x) / 2;
            const my = (curr.y + next.y) / 2;
            ctx.quadraticCurveTo(curr.x, curr.y, mx, my);
          }
          ctx.closePath();
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1.0;
    }

    /* ── Mouse interaction ──────────────────────────────────────────── */

    _removeMouseListeners() {
      if (this._onMouseDown) this.canvas?.removeEventListener("mousedown", this._onMouseDown);
      if (this._onMouseMove) this.canvas?.removeEventListener("mousemove", this._onMouseMove);
      if (this._onMouseUp) {
        this.canvas?.removeEventListener("mouseup", this._onMouseUp);
        this.canvas?.removeEventListener("mouseleave", this._onMouseUp);
      }
    }

    _canvasXY(e) {
      const r = this.canvas.getBoundingClientRect();
      const sx = this.canvas.width / r.width;
      const sy = this.canvas.height / r.height;
      return {
        x: (e.clientX - r.left) * sx,
        y: (e.clientY - r.top) * sy,
      };
    }

    _handleMouseDown(e) {
      this._mouseDown = true;
      const { x, y } = this._canvasXY(e);
      this._lastMx = x;
      this._lastMy = y;

      if (this.currentTool === "brush") {
        // Brush-created neurons grow in all directions (no outward constraint)
        this._createNeuron(x, y, null);
      }
    }

    _handleMouseMove(e) {
      if (!this._mouseDown) return;
      const { x, y } = this._canvasXY(e);

      if (this.currentTool === "brush") {
        const dx = x - this._lastMx, dy = y - this._lastMy;
        if (dx * dx + dy * dy > 40 * 40) {
          this._createNeuron(x, y, null);
          this._lastMx = x;
          this._lastMy = y;
        }
      } else if (this.currentTool === "smudge") {
        const radius = this.brushSize;
        const pushStrength = 3;

        for (const seg of this.segments) {
          const dx = seg.x - x, dy = seg.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius && dist > 0) {
            const force = (1 - dist / radius) * pushStrength;
            const nx = (dx / dist) * force;
            const ny = (dy / dist) * force;
            seg.x += nx;
            seg.y += ny;
            seg.cp2x += nx;
            seg.cp2y += ny;
          }
        }

        for (const soma of this.somas) {
          const dx = soma.x - x, dy = soma.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius && dist > 0) {
            const force = (1 - dist / radius) * pushStrength;
            const nx = (dx / dist) * force;
            const ny = (dy / dist) * force;
            soma.x += nx;
            soma.y += ny;
            for (const v of soma.vertices) {
              v.x += nx;
              v.y += ny;
            }
          }
        }

        this._draw();
      }

      this._lastMx = x;
      this._lastMy = y;
    }

    /* ── SVG Export ──────────────────────────────────────────────────── */

    exportSVG() {
      const w = this.canvas.width, h = this.canvas.height;
      const light = this.isLight;
      const panel = document.getElementById("effect-neuron-growth");
      const dendriteColor = panel?.querySelector("#ng-dendrite-color")?.value || (light ? "#222" : "#fff");
      const axonColor = panel?.querySelector("#ng-axon-color")?.value || (light ? "#444" : "#aaccff");
      const somaColor = panel?.querySelector("#ng-soma-color")?.value || (light ? "#000" : "#fff");
      const showSoma = panel?.querySelector("#ng-show-soma")?.checked ?? true;
      const bg = document.getElementById("bg-color")?.value || (light ? "#e8e8e8" : "#000");

      // Text outline in SVG
      let textOutline = "";
      const s = this._textRenderState;
      if (s && s.mode === "text" && s.lines) {
        const tspans = s.lines.map((line, i) =>
          `<tspan x="${s.cx}" y="${(s.startY + i * s.lineH).toFixed(1)}">${line.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))}</tspan>`
        ).join("");
        textOutline = `  <text font-family="${s.fontFamily}" font-weight="${s.fontWeight}" font-size="${s.fontSize}" text-anchor="middle" dominant-baseline="middle" fill="${dendriteColor}" fill-opacity="0.22" stroke="${dendriteColor}" stroke-width="1.5" stroke-opacity="0.40">${tspans}</text>\n`;
      }

      let paths = "";

      for (let i = 0; i < this.segments.length; i++) {
        const seg = this.segments[i];
        const parent = seg.parentIdx >= 0 ? this.segments[seg.parentIdx] : null;

        let px, py;
        if (parent) {
          px = parent.x;
          py = parent.y;
        } else {
          const soma = this.somas[seg.somaIdx];
          if (!soma) continue;
          px = soma.x;
          py = soma.y;
        }

        const color = seg.type === "axon" ? axonColor : dendriteColor;
        const sw = Math.max(0.2, seg.thickness).toFixed(2);
        const d = `M${px.toFixed(1)},${py.toFixed(1)} C${seg.cp1x.toFixed(1)},${seg.cp1y.toFixed(1)} ${seg.cp2x.toFixed(1)},${seg.cp2y.toFixed(1)} ${seg.x.toFixed(1)},${seg.y.toFixed(1)}`;
        paths += `  <path d="${d}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" fill="none"/>\n`;
      }

      let somasSvg = "";
      if (showSoma) {
        for (const soma of this.somas) {
          const v = soma.vertices;
          if (v.length < 3) {
            somasSvg += `  <circle cx="${soma.x.toFixed(1)}" cy="${soma.y.toFixed(1)}" r="${(this.params.soma_size || 5)}" fill="${somaColor}"/>\n`;
            continue;
          }

          const len = v.length;
          const mx0x = ((v[len - 1].x + v[0].x) / 2).toFixed(1);
          const mx0y = ((v[len - 1].y + v[0].y) / 2).toFixed(1);
          let d = `M${mx0x},${mx0y}`;
          for (let j = 0; j < len; j++) {
            const curr = v[j];
            const next = v[(j + 1) % len];
            const mx = ((curr.x + next.x) / 2).toFixed(1);
            const my = ((curr.y + next.y) / 2).toFixed(1);
            d += ` Q${curr.x.toFixed(1)},${curr.y.toFixed(1)} ${mx},${my}`;
          }
          d += " Z";
          somasSvg += `  <path d="${d}" fill="${somaColor}"/>\n`;
        }
      }

      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
${textOutline}${paths}${somasSvg}</svg>`;
    }

    /* ── Cleanup ─────────────────────────────────────────────────────── */

    destroy() {
      this._removeMouseListeners();
      this._textBinary = null;
      this._textRenderState = null;
      super.destroy();
    }
  }

  // Register
  window.SpiritEffects["neuron-growth"] = NeuronGrowthEffect;

})();
