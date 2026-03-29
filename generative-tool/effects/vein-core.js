/* ═══════════════════════════════════════════════════════════════════════════
   Vein Core — Space colonization simulation engine
   Ported from code-base/vein-obstacle/core/
   Bundled: Vec2, SpatialIndex, Attractor, Node, Path, Network, ColorPresets
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Vec2 ────────────────────────────────────────────────────────────── */
  class Vec2 {
    constructor(x, y) { this.x = x || 0; this.y = y || 0; }
    add(v, returnNew) {
      if (returnNew) return new Vec2(this.x + v.x, this.y + v.y);
      this.x += v.x; this.y += v.y; return this;
    }
    subtract(v, returnNew) {
      if (returnNew) return new Vec2(this.x - v.x, this.y - v.y);
      this.x -= v.x; this.y -= v.y; return this;
    }
    multiply(s, returnNew) {
      if (typeof s === "object") {
        if (returnNew) return new Vec2(this.x * s.x, this.y * s.y);
        this.x *= s.x; this.y *= s.y; return this;
      }
      if (returnNew) return new Vec2(this.x * s, this.y * s);
      this.x *= s; this.y *= s; return this;
    }
    divide(s, returnNew) {
      if (s === 0) return returnNew ? new Vec2(0, 0) : this;
      if (returnNew) return new Vec2(this.x / s, this.y / s);
      this.x /= s; this.y /= s; return this;
    }
    normalize() {
      const len = this.length();
      if (len > 0) { this.x /= len; this.y /= len; }
      return this;
    }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    distance(v) { const dx = this.x - v.x, dy = this.y - v.y; return Math.sqrt(dx * dx + dy * dy); }
    clone() { return new Vec2(this.x, this.y); }
    set(x, y) { this.x = x; this.y = y; return this; }
  }

  /* ── SpatialIndex (brute-force within-radius query) ──────────────────── */
  class SpatialIndex {
    constructor(items, getX, getY) {
      this._items = items;
      this._getX = getX;
      this._getY = getY;
    }
    within(x, y, r) {
      const r2 = r * r;
      const result = [];
      for (let i = 0; i < this._items.length; i++) {
        const dx = this._getX(this._items[i]) - x;
        const dy = this._getY(this._items[i]) - y;
        if (dx * dx + dy * dy <= r2) result.push(i);
      }
      return result;
    }
  }

  /* ── point-in-polygon (ray casting) ──────────────────────────────────── */
  function pointInPolygon(pt, poly) {
    let x = pt[0], y = pt[1], inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }

  /* ── random (Processing-style) ───────────────────────────────────────── */
  function random(min, max) {
    if (max === undefined) { max = min; min = 0; }
    return Math.random() * (max - min) + min;
  }
  function map(value, oL, oU, nL, nU) {
    return nL + (nU - nL) * ((value - oL) / (oU - oL));
  }

  /* ── Color Presets ───────────────────────────────────────────────────── */
  const DarkColors = {
    BackgroundColor:    "rgba(0,0,0,.9)",
    AttractorColor:     "rgba(255,255,255,.5)",
    BranchColor:        "rgba(255,255,255,1)",
    TipColor:           "rgba(0,255,255,1)",
    AttractionZoneColor:"rgba(255,255,255,.002)",
    KillZoneColor:      "rgba(255,0,0,.4)",
    InfluenceLinesColor:"rgba(255,255,255,.2)",
    BoundsFillColor:    "rgba(255,255,255,0)",
    BoundsBorderColor:  "rgba(255,255,255,.05)",
    ObstacleFillColor:  "rgba(255,255,255,.2)",
  };
  const LightColors = {
    BackgroundColor:    "rgba(255,255,255,1)",
    AttractorColor:     "rgba(0,0,0,.5)",
    BranchColor:        "rgba(0,0,0,1)",
    TipColor:           "rgba(255,0,0,1)",
    AttractionZoneColor:"rgba(0,255,0,.002)",
    KillZoneColor:      "rgba(255,0,0,.4)",
    InfluenceLinesColor:"rgba(0,0,255,1)",
    BoundsFillColor:    "rgba(0,0,0,.1)",
    BoundsBorderColor:  "rgba(0,0,0,.1)",
    ObstacleFillColor:  "rgba(0,0,0,.7)",
  };

  /* ── Default Settings ────────────────────────────────────────────────── */
  const Defaults = {
    VenationType:          "Open",
    SegmentLength:         5,
    AttractionDistance:     30,
    KillDistance:           5,
    IsPaused:              false,
    EnableCanalization:     true,
    EnableOpacityBlending: true,
    ShowAttractors:        false,
    ShowNodes:             true,
    ShowTips:              false,
    ShowAttractionZones:   false,
    ShowKillZones:         false,
    ShowInfluenceLines:    false,
    ShowBounds:            false,
    ShowObstacles:         false,
    RenderMode:            "Lines",
    Colors:                DarkColors,
    BranchThickness:       1.5,
    TipThickness:          2,
    BoundsBorderThickness: 1,
  };

  /* ── Attractor ───────────────────────────────────────────────────────── */
  class Attractor {
    constructor(position, ctx, settings) {
      this.position = position;
      this.ctx = ctx;
      this.settings = Object.assign({}, Defaults, settings);
      this.influencingNodes = [];
      this.fresh = true;
      this.reached = false;
    }
    draw() {
      if (this.settings.ShowAttractionZones) {
        this.ctx.beginPath();
        this.ctx.arc(this.position.x, this.position.y, this.settings.AttractionDistance, 0, Math.PI * 2);
        this.ctx.fillStyle = this.settings.Colors.AttractionZoneColor;
        this.ctx.fill();
      }
      if (this.settings.ShowKillZones) {
        this.ctx.beginPath();
        this.ctx.arc(this.position.x, this.position.y, this.settings.KillDistance, 0, Math.PI * 2);
        this.ctx.fillStyle = this.settings.Colors.KillZoneColor;
        this.ctx.fill();
      }
      if (this.settings.ShowAttractors) {
        this.ctx.beginPath();
        this.ctx.arc(this.position.x, this.position.y, 1, 0, Math.PI * 2);
        this.ctx.fillStyle = this.settings.Colors.AttractorColor;
        this.ctx.fill();
      }
    }
  }

  /* ── Node ─────────────────────────────────────────────────────────────── */
  class VeinNode {
    constructor(parent, position, isTip, ctx, settings, color) {
      this.parent = parent;
      this.position = position;
      this.isTip = isTip;
      this.ctx = ctx;
      this.settings = Object.assign({}, Defaults, settings);
      this.color = color;
      this.influencedBy = [];
      this.thickness = 0;
    }
    draw() {
      if (this.parent == null) return;
      if (this.settings.EnableOpacityBlending) {
        this.ctx.globalAlpha = this.thickness / 3 + 0.2;
      }
      if (this.settings.RenderMode === "Lines") {
        this.ctx.beginPath();
        this.ctx.moveTo(this.position.x, this.position.y);
        this.ctx.lineTo(this.parent.position.x, this.parent.position.y);
        if (this.isTip && this.settings.ShowTips) {
          this.ctx.strokeStyle = this.settings.Colors.TipColor;
          this.ctx.lineWidth = this.settings.TipThickness;
        } else {
          this.ctx.strokeStyle = this.color || this.settings.Colors.BranchColor;
          this.ctx.lineWidth = this.settings.BranchThickness + this.thickness;
        }
        this.ctx.stroke();
        this.ctx.lineWidth = 1;
      } else if (this.settings.RenderMode === "Dots") {
        this.ctx.beginPath();
        this.ctx.arc(this.position.x, this.position.y, 1 + this.thickness / 2, 0, Math.PI * 2);
        this.ctx.fillStyle = (this.isTip && this.settings.ShowTips)
          ? this.settings.Colors.TipColor
          : this.settings.Colors.BranchColor;
        this.ctx.fill();
      }
      if (this.settings.EnableOpacityBlending) {
        this.ctx.globalAlpha = 1;
      }
    }
    getNextNode(direction) {
      this.isTip = false;
      const nextPos = this.position.add(direction.multiply(this.settings.SegmentLength, true), true);
      return new VeinNode(this, nextPos, true, this.ctx, this.settings, this.color);
    }
  }

  /* ── Path (bounds / obstacles) ───────────────────────────────────────── */
  class Path {
    constructor(polygon, type, ctx, settings) {
      this.polygon = polygon;
      this.ctx = ctx;
      this.type = type;
      this.transformedPolygon = polygon.map((p) => [...p]);
      this.origin = { x: 0, y: 0 };
      this.scale = 1;
      this.width = 0;
      this.height = 0;
      this.isCentered = false;
      this.settings = Object.assign({}, Defaults, settings);
      this.calculateDimensions();
    }
    contains(x, y) { return pointInPolygon([x, y], this.transformedPolygon); }
    moveBy(x, y) { this.origin.x += x; this.origin.y += y; this._transform(); }
    moveTo(x, y) {
      if (this.isCentered) { this.origin.x = x - this.width / 2; this.origin.y = y - this.height / 2; }
      else { this.origin.x = x; this.origin.y = y; }
      this._transform();
    }
    setScale(f) { this.scale *= f; this._transform(); this.calculateDimensions(); }
    calculateDimensions() {
      let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
      for (const p of this.transformedPolygon) {
        if (p[0] < l) l = p[0]; if (p[0] > r) r = p[0];
        if (p[1] < t) t = p[1]; if (p[1] > b) b = p[1];
      }
      this.width = r - l; this.height = b - t;
    }
    _transform() {
      this.transformedPolygon = this.polygon.map((p) => [
        p[0] * this.scale + this.origin.x,
        p[1] * this.scale + this.origin.y,
      ]);
    }
    draw() {
      const show = (this.settings.ShowBounds && this.type === "Bounds") ||
                   (this.settings.ShowObstacles && this.type === "Obstacle");
      if (!show) return;
      this.ctx.beginPath();
      this.ctx.moveTo(this.transformedPolygon[0][0], this.transformedPolygon[0][1]);
      for (let i = 1; i < this.transformedPolygon.length; i++) {
        this.ctx.lineTo(this.transformedPolygon[i][0], this.transformedPolygon[i][1]);
      }
      this.ctx.closePath();
      if (this.type === "Bounds") {
        this.ctx.strokeStyle = this.settings.Colors.BoundsBorderColor;
        this.ctx.lineWidth = this.settings.BoundsBorderThickness;
        this.ctx.fillStyle = this.settings.Colors.BoundsFillColor;
        this.ctx.stroke(); this.ctx.lineWidth = 1;
      } else {
        this.ctx.fillStyle = this.settings.Colors.ObstacleFillColor;
      }
      this.ctx.fill();
    }
  }

  /* ── Network (main simulation engine) ────────────────────────────────── */
  class Network {
    constructor(ctx, settings) {
      this.ctx = ctx;
      this.settings = Object.assign({}, Defaults, settings);
      this.attractors = [];
      this.nodes = [];
      this.bounds = [];
      this.obstacles = [];
      this.buildSpatialIndices();
    }

    update() {
      if (this.settings.IsPaused) return;

      // Associate attractors with nearby nodes
      for (let aID = 0; aID < this.attractors.length; aID++) {
        const att = this.attractors[aID];
        if (this.settings.VenationType === "Open") {
          const closest = this._getClosestNode(att, this._nodesInRadius(att, this.settings.AttractionDistance));
          if (closest) {
            closest.influencedBy.push(aID);
            att.influencingNodes = [closest];
          }
        } else {
          // Closed venation — relative neighbor nodes
          const neighbors = this._getRelativeNeighbors(att);
          const inKill = this._nodesInRadius(att, this.settings.KillDistance);
          const toGrow = neighbors.filter((n) => !inKill.includes(n));
          att.influencingNodes = neighbors;
          if (toGrow.length > 0) {
            att.fresh = false;
            for (const n of toGrow) n.influencedBy.push(aID);
          }
        }
      }

      // Grow new nodes
      for (const node of this.nodes) {
        if (node.influencedBy.length > 0) {
          const dir = this._avgDirection(node, node.influencedBy.map((id) => this.attractors[id]));
          const next = node.getNextNode(dir);
          if (this._canPlace(next.position.x, next.position.y)) {
            this.nodes.push(next);
          }
        }
        node.influencedBy = [];

        // Canalization
        if (node.isTip && this.settings.EnableCanalization) {
          let cur = node;
          while (cur.parent) {
            if (cur.parent.thickness < cur.thickness + 0.07) {
              cur.parent.thickness = cur.thickness + 0.03;
            }
            cur = cur.parent;
          }
        }
      }

      // Remove reached attractors
      for (let i = this.attractors.length - 1; i >= 0; i--) {
        const att = this.attractors[i];
        if (this.settings.VenationType === "Open") {
          if (att.reached) this.attractors.splice(i, 1);
        } else {
          if (att.influencingNodes.length > 0 && !att.fresh) {
            let allReached = true;
            for (const n of att.influencingNodes) {
              if (n.position.distance(att.position) > this.settings.KillDistance) {
                allReached = false; break;
              }
            }
            if (allReached) this.attractors.splice(i, 1);
          }
        }
      }

      this.buildSpatialIndices();
    }

    draw() {
      // Bounds & Obstacles
      if (this.settings.ShowBounds) for (const b of this.bounds) b.draw();
      if (this.settings.ShowObstacles) for (const o of this.obstacles) o.draw();
      // Attractors
      for (const a of this.attractors) {
        a.draw();
        if (this.settings.ShowInfluenceLines && a.influencingNodes.length > 0) {
          for (const n of a.influencingNodes) {
            this.ctx.beginPath();
            this.ctx.moveTo(a.position.x, a.position.y);
            this.ctx.lineTo(n.position.x, n.position.y);
            this.ctx.strokeStyle = this.settings.Colors.InfluenceLinesColor;
            this.ctx.stroke();
          }
        }
      }
      // Nodes
      if (this.settings.ShowNodes) {
        for (const n of this.nodes) n.draw();
      }
    }

    addNode(node) {
      if (this._canPlace(node.position.x, node.position.y)) {
        this.nodes.push(node);
        this.buildSpatialIndices();
      }
    }

    reset() {
      this.nodes = [];
      this.attractors = [];
      this.buildSpatialIndices();
    }

    buildSpatialIndices() {
      this.nodesIndex = new SpatialIndex(this.nodes, (p) => p.position.x, (p) => p.position.y);
    }

    /* ── internal helpers ──────────────────────────────────── */

    _canPlace(x, y) {
      let inBounds = this.bounds.length === 0;
      for (const b of this.bounds) { if (b.contains(x, y)) { inBounds = true; break; } }
      let inObstacle = false;
      for (const o of this.obstacles) { if (o.contains(x, y)) { inObstacle = true; break; } }
      return inBounds && !inObstacle;
    }

    _nodesInRadius(att, radius) {
      return this.nodesIndex.within(att.position.x, att.position.y, radius).map((id) => this.nodes[id]);
    }

    _getClosestNode(att, nearby) {
      let closest = null, record = this.settings.AttractionDistance;
      for (const n of nearby) {
        const d = n.position.distance(att.position);
        if (d < this.settings.KillDistance) { att.reached = true; closest = null; }
        else if (d < record) { closest = n; record = d; }
      }
      return closest;
    }

    _getRelativeNeighbors(att) {
      const nearby = this._nodesInRadius(att, this.settings.AttractionDistance);
      const result = [];
      for (const p0 of nearby) {
        let fail = false;
        const aToP0 = p0.position.subtract(att.position, true);
        for (const p1 of nearby) {
          if (p0 === p1) continue;
          const aToP1 = p1.position.subtract(att.position, true);
          if (aToP1.length() > aToP0.length()) continue;
          const p0ToP1 = p1.position.subtract(p0.position, true);
          if (aToP0.length() > p0ToP1.length()) { fail = true; break; }
        }
        if (!fail) result.push(p0);
      }
      return result;
    }

    _avgDirection(node, attractors) {
      const dir = new Vec2(0, 0);
      for (const a of attractors) {
        dir.add(a.position.subtract(node.position, true).normalize());
      }
      dir.add(new Vec2(random(-0.1, 0.1), random(-0.1, 0.1)));
      dir.divide(node.influencedBy.length).normalize();
      return dir;
    }

    /* ── toggle helpers ─────────────────────────────────────── */
    togglePause()            { this.settings.IsPaused = !this.settings.IsPaused; }
    toggleNodes()            { this.settings.ShowNodes = !this.settings.ShowNodes; }
    toggleAttractors()       {
      this.settings.ShowAttractors = !this.settings.ShowAttractors;
      for (const a of this.attractors) a.settings.ShowAttractors = this.settings.ShowAttractors;
    }
    toggleTips()             {
      this.settings.ShowTips = !this.settings.ShowTips;
      for (const n of this.nodes) n.settings.ShowTips = this.settings.ShowTips;
    }
    toggleAttractionZones()  {
      this.settings.ShowAttractionZones = !this.settings.ShowAttractionZones;
      for (const a of this.attractors) a.settings.ShowAttractionZones = this.settings.ShowAttractionZones;
    }
    toggleKillZones()        {
      this.settings.ShowKillZones = !this.settings.ShowKillZones;
      for (const a of this.attractors) a.settings.ShowKillZones = this.settings.ShowKillZones;
    }
    toggleInfluenceLines()   { this.settings.ShowInfluenceLines = !this.settings.ShowInfluenceLines; }
    toggleBounds()           { this.settings.ShowBounds = !this.settings.ShowBounds; }
    toggleObstacles()        { this.settings.ShowObstacles = !this.settings.ShowObstacles; }
    toggleCanalization()     {
      this.settings.EnableCanalization = !this.settings.EnableCanalization;
      if (!this.settings.EnableCanalization) for (const n of this.nodes) n.thickness = 0;
    }
    toggleOpacityBlending()  {
      this.settings.EnableOpacityBlending = !this.settings.EnableOpacityBlending;
      for (const n of this.nodes) n.settings.EnableOpacityBlending = this.settings.EnableOpacityBlending;
    }
  }

  /* ── Export ───────────────────────────────────────────────────────────── */
  window.VeinCore = {
    Vec2, SpatialIndex, Attractor, VeinNode, Path, Network,
    DarkColors, LightColors, Defaults, random, map,
  };

})();
