/* ═══════════════════════════════════════════════════════════════════════════
   Spirit Generative Tool — Effect Base
   공통 이펙트 인터페이스 및 유틸리티
   ═══════════════════════════════════════════════════════════════════════════ */

window.SpiritEffects = window.SpiritEffects || {};

/**
 * Base class for all generative effects.
 * 모든 이펙트가 상속받는 베이스 클래스.
 *
 * 각 이펙트 파일에서:
 *   class MyEffect extends EffectBase { ... }
 *   window.SpiritEffects['my-effect'] = MyEffect;
 */
class EffectBase {

  /**
   * @param {string} id    — effect identifier (e.g. "reaction-diffusion")
   * @param {string} name  — display name (e.g. "Reaction Diffusion")
   */
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.canvas = null;
    this.ctx = null;
    this.running = false;
    this.animFrameId = null;
    this.speed = 1.0;
    this.params = {};
    this._inputMask = null;   // input text/SVG rendered as ImageData for seeding
  }

  /* ── Lifecycle ─────────────────────────────────────────────────────────── */

  /** Called once when this effect becomes active */
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.readParams();
    this.setup();
  }

  /** Allocate buffers, build initial state — override in subclass */
  setup() {}

  /** Start the animation loop */
  start() {
    this.running = true;
    this._loop();
  }

  /** Pause the animation loop */
  stop() {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /** Reset state to initial, re-setup, re-render one frame */
  reset() {
    this.stop();
    this.setup();
    this.render();
  }

  /** Cleanup when switching away from this effect */
  destroy() {
    this.stop();
    this.canvas = null;
    this.ctx = null;
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  /** Render one frame — override in subclass */
  render() {}

  /** Internal loop */
  _loop() {
    if (!this.running) return;
    this.render();
    this.animFrameId = requestAnimationFrame(() => this._loop());
  }

  /* ── Parameters ────────────────────────────────────────────────────────── */

  /**
   * Read slider/input values from the DOM panel for this effect.
   * 현재 이펙트 패널의 슬라이더/입력값을 읽어서 this.params에 저장.
   */
  readParams() {
    const panel = document.getElementById(`effect-${this.id}`);
    if (!panel) return;
    panel.querySelectorAll(".slider-row input[type='range']").forEach((slider) => {
      const label = slider.parentElement.querySelector(".slider-label");
      if (!label) return;
      const key = label.textContent.trim().toLowerCase().replace(/[\s\/]+/g, "_");
      this.params[key] = parseFloat(slider.value);
    });
    // Seed
    const seedEl = panel.querySelector(".seed-value");
    if (seedEl) this.params.seed = parseInt(seedEl.textContent, 10) || 0;
  }

  /** Set playback speed (0.2 – 3.0) */
  setSpeed(v) { this.speed = v; }

  /** Receive rendered input (text/SVG) as ImageData for effect seeding */
  setInputMask(imageData) { this._inputMask = imageData; }

  /* ── Utility ───────────────────────────────────────────────────────────── */

  /** Simple seeded PRNG (mulberry32) */
  static prng(seed) {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Check if canvas is in light theme */
  get isLight() {
    return document.documentElement.getAttribute("data-theme") === "light";
  }

  /** Draw a placeholder frame (used before real implementation) */
  drawPlaceholder() {
    const { ctx, canvas } = this;
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    const light = this.isLight;

    ctx.fillStyle = light ? "#e8e8e8" : "#000";
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Crosshair
    ctx.strokeStyle = light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)";
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 13px ui-monospace, monospace";
    ctx.fillStyle = light ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.15)";
    ctx.fillText(this.name.toUpperCase(), w / 2, h / 2 - 12);

    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = light ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.08)";
    ctx.fillText("READY — AWAITING IMPLEMENTATION", w / 2, h / 2 + 10);
  }
}

// Export globally
window.EffectBase = EffectBase;
