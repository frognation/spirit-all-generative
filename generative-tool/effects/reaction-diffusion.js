/* ═══════════════════════════════════════════════════════════════════════════
   Effect: Reaction Diffusion
   Gray-Scott model — WebGL2 GPU-accelerated ping-pong simulation
   Features ported from github.com/jasonwebb/reaction-diffusion-playground
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

  /* ── Parameter Presets (Robert Munafo / mrob) ────────────────────────── */

  const PRESETS = [
    { name: "Custom",                    f: 0.055, k: 0.062  },
    { name: "Negative bubbles",          f: 0.098, k: 0.0555 },
    { name: "Positive bubbles",          f: 0.098, k: 0.057  },
    { name: "Precritical bubbles",       f: 0.082, k: 0.059  },
    { name: "Worms and loops",           f: 0.082, k: 0.06   },
    { name: "Stable solitons",           f: 0.074, k: 0.064  },
    { name: "The U-Skate World",         f: 0.062, k: 0.0609 },
    { name: "Worms",                     f: 0.058, k: 0.065  },
    { name: "Worms join into maze",      f: 0.046, k: 0.063  },
    { name: "Negatons",                  f: 0.046, k: 0.0594 },
    { name: "Turing patterns",           f: 0.042, k: 0.059  },
    { name: "Chaos to Turing negatons",  f: 0.039, k: 0.058  },
    { name: "Fingerprints",              f: 0.037, k: 0.06   },
    { name: "Chaos with negatons",       f: 0.0353, k: 0.0566 },
    { name: "Spots and worms",           f: 0.034, k: 0.0618 },
    { name: "Self-replicating spots",    f: 0.03,  k: 0.063  },
    { name: "Super-resonant mazes",      f: 0.03,  k: 0.0565 },
    { name: "Mazes",                     f: 0.029, k: 0.057  },
    { name: "Mazes with some chaos",     f: 0.026, k: 0.055  },
    { name: "Chaos",                     f: 0.026, k: 0.051  },
    { name: "Pulsating solitons",        f: 0.025, k: 0.06   },
    { name: "Warring microbes",          f: 0.022, k: 0.059  },
    { name: "Spots and loops",           f: 0.018, k: 0.051  },
    { name: "Moving spots",             f: 0.014, k: 0.054  },
    { name: "Waves",                     f: 0.014, k: 0.045  },
  ];


  /* ── GLSL Shader Sources ─────────────────────────────────────────────── */

  // Simulation: standard OpenGL UV — (0,0) at bottom-left
  // This ensures ping-pong read/write positions stay consistent.
  const SIM_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

  // Display: flip Y so texture top maps to screen top (Canvas2D convention)
  const DISP_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

  const SIM_FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_state;
uniform vec2  u_texel;
uniform float u_feed;
uniform float u_kill;
uniform float u_dA;
uniform float u_dB;
uniform float u_dt;
uniform vec2  u_bias;
uniform vec2  u_mouse;       // UV coords, (-1,-1) = inactive
uniform float u_brushRadius; // in pixels

in  vec2 v_uv;
out vec4 outColor;

void main() {
  vec2 res = 1.0 / u_texel;

  // Mouse painting — override with chemical B
  if (u_mouse.x > 0.0 && u_mouse.y > 0.0) {
    float dist = distance(u_mouse * res, v_uv * res);
    if (dist < u_brushRadius) {
      float t = dist / u_brushRadius;
      outColor = vec4(mix(0.0, 0.3, t), 0.5, 0.0, 1.0);
      return;
    }
  }

  vec4  c = texture(u_state, v_uv);
  float A = c.r;
  float B = c.g;

  // 9-point Laplacian (Karl Sims weights) with directional bias
  vec2 lap = c.rg * -1.0;
  lap += texture(u_state, fract(v_uv + vec2(        0.0, -u_texel.y))).rg * (0.2 + u_bias.y);
  lap += texture(u_state, fract(v_uv + vec2( u_texel.x,         0.0))).rg * (0.2 + u_bias.x);
  lap += texture(u_state, fract(v_uv + vec2(        0.0,  u_texel.y))).rg * (0.2 - u_bias.y);
  lap += texture(u_state, fract(v_uv + vec2(-u_texel.x,         0.0))).rg * (0.2 - u_bias.x);
  lap += texture(u_state, fract(v_uv + vec2( u_texel.x, -u_texel.y))).rg * 0.05;
  lap += texture(u_state, fract(v_uv + vec2( u_texel.x,  u_texel.y))).rg * 0.05;
  lap += texture(u_state, fract(v_uv + vec2(-u_texel.x,  u_texel.y))).rg * 0.05;
  lap += texture(u_state, fract(v_uv + vec2(-u_texel.x, -u_texel.y))).rg * 0.05;

  float ABB = A * B * B;
  float nA  = A + (u_dA * lap.x - ABB + u_feed * (1.0 - A)) * u_dt;
  float nB  = B + (u_dB * lap.y + ABB - (u_kill + u_feed) * B) * u_dt;

  outColor = vec4(clamp(nA, 0.0, 1.0), clamp(nB, 0.0, 1.0), 0.0, 1.0);
}`;

  const DISP_FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_state;
uniform vec3  u_colorA;
uniform vec3  u_colorB;
uniform int   u_mode;      // 0-5
uniform float u_time;

in  vec2 v_uv;
out vec4 outColor;

// HSL → RGB helper (Iñigo Quiles)
vec3 hsb2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  rgb = rgb * rgb * (3.0 - 2.0 * rgb);
  return c.z * mix(vec3(1.0), rgb, c.y);
}

void main() {
  vec2  st = texture(u_state, v_uv).rg;
  float A  = st.x;
  float B  = st.y;

  vec4 col;

  // 0 — Custom 2-color (A-B based)
  if (u_mode == 0) {
    float diff = clamp(A - B, 0.0, 1.0);
    col = vec4(mix(u_colorB, u_colorA, diff), 1.0);

  // 1 — B&W Soft
  } else if (u_mode == 1) {
    float g = clamp(A - B, 0.0, 1.0);
    col = vec4(g, g, g, 1.0);

  // 2 — B&W Sharp
  } else if (u_mode == 2) {
    float g = clamp(A - B, 0.0, 1.0);
    g = g > 0.3 ? 1.0 : 0.0;
    col = vec4(g, g, g, 1.0);

  // 3 — HSL mapping
  } else if (u_mode == 3) {
    float h = clamp((B - A) * 0.5 + 0.5, 0.0, 1.0);
    h = mix(0.0, 0.8, h);
    col = vec4(hsb2rgb(vec3(h, 0.75, 0.7)), 1.0);

  // 4 — Rainbow
  } else if (u_mode == 4) {
    float base = A - B;
    float PI = 3.14159265;
    float freq = 1.5;
    vec2 uv2 = v_uv + u_time * 0.5;
    float r1 = sin(freq * uv2.x) * 0.5 + 0.5;
    float g1 = sin(freq * uv2.x + 2.0 * PI / 3.0) * 0.5 + 0.5;
    float b1 = sin(freq * uv2.x + 4.0 * PI / 3.0) * 0.5 + 0.5;
    float r2 = sin(freq * uv2.y) * 0.5 + 0.5;
    float g2 = sin(freq * uv2.y + 2.0 * PI / 3.0) * 0.5 + 0.5;
    float b2 = sin(freq * uv2.y + 4.0 * PI / 3.0) * 0.5 + 0.5;
    vec3 rainbow = vec3(r1, g1, b1) * vec3(r2, g2, b2);
    vec3 bw = vec3(base);
    float mask = step(0.01, B);
    col = vec4(mix(bw, bw - rainbow, mask), 1.0);

  // 5 — Raw (A=red, B=green)
  } else {
    col = vec4(A, B, 0.0, 1.0);
  }

  outColor = col;
}`;


  /* ── Helpers ─────────────────────────────────────────────────────────── */

  function hexToRGB(hex) {
    hex = hex || "#000000";
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
  }

  /** Create a slider row DOM element and wire up value display */
  function mkSlider(label, min, max, step, val, fmt) {
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML =
      `<span class="slider-label">${label}</span>` +
      `<input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-format="${fmt}" />` +
      `<span class="slider-value">${fmtVal(val, fmt)}</span>`;
    const inp = row.querySelector("input");
    const valEl = row.querySelector(".slider-value");
    inp.addEventListener("input", () => { valEl.textContent = fmtVal(inp.value, fmt); });
    return row;
  }

  function fmtVal(v, fmt) {
    v = parseFloat(v);
    switch (fmt) {
      case "fixed0": return Math.round(v).toString();
      case "fixed1": return v.toFixed(1);
      case "fixed2": return v.toFixed(2);
      case "fixed3": return v.toFixed(3);
      default:       return v.toFixed(2);
    }
  }


  /* ── Class ───────────────────────────────────────────────────────────── */

  class ReactionDiffusion extends EffectBase {

    constructor() {
      super("reaction-diffusion", "Reaction Diffusion");
      this.gl        = null;
      this.glCanvas  = null;
      this.simProg   = null;
      this.dispProg  = null;
      this.fbs       = [null, null];
      this.texs      = [null, null];
      this.cur       = 0;
      this.vao       = null;
      this._buf      = null;
      this._locs     = {};
      this.frameCount = 0;
      this._uiReady  = false;

      // Mouse painting state
      this._mouseDown = false;
      this._mouseUV   = [-1, -1];
      this._onMD = this._onMU = this._onMM = this._onML = null;
    }

    /* ══════════════════════════════════════════════════════════════════════
       Lifecycle
       ══════════════════════════════════════════════════════════════════════ */

    init(canvas) {
      this.canvas = canvas;
      this.ctx    = canvas.getContext("2d");
      if (!this._uiReady) this._injectUI();
      this.readParams();
      this.setup();
      this._setupMouse();
    }

    setup() {
      this.readParams();
      this._readExtra();
      this.frameCount = 0;
      this.cur = 0;
      this._mouseUV = [-1, -1];

      const w = this.canvas.width, h = this.canvas.height;
      const seed = this._buildSeed(w, h);

      if (!this._initGL(w, h)) { this.drawPlaceholder(); return; }

      this._uploadSeed(seed, w, h);
      this._renderDisplay();
      this._blit();
    }

    render() {
      if (!this.gl) return;
      this.readParams();
      this._readExtra();

      const gl = this.gl;
      const w  = this.glCanvas.width, h = this.glCanvas.height;
      const L  = this._locs.sim;
      const iters = Math.max(1, Math.round((this.params.iter_frame || 10) * this.speed));

      gl.useProgram(this.simProg);
      gl.uniform1i(L.state, 0);
      gl.uniform2f(L.texel, 1 / w, 1 / h);
      gl.uniform1f(L.feed, this.params.feed_rate  ?? 0.055);
      gl.uniform1f(L.kill, this.params.kill_rate   ?? 0.062);
      gl.uniform1f(L.dA,   this.params.diffuse_a   ?? 1.0);
      gl.uniform1f(L.dB,   this.params.diffuse_b   ?? 0.5);
      gl.uniform1f(L.dt,   this.params.timestep     ?? 1.0);
      gl.uniform2f(L.bias, this.params.bias_x ?? 0, this.params.bias_y ?? 0);
      gl.uniform2f(L.mouse, this._mouseUV[0], this._mouseUV[1]);
      gl.uniform1f(L.brushR, this.brushSize ?? 15);
      gl.viewport(0, 0, w, h);
      gl.bindVertexArray(this.vao);

      for (let i = 0; i < iters; i++) {
        const dst = 1 - this.cur;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbs[dst]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texs[this.cur]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        this.cur = dst;
      }

      // Clear mouse after painting one batch
      if (!this._mouseDown) this._mouseUV = [-1, -1];

      this._renderDisplay();
      this._blit();
      this.frameCount++;
    }

    destroy() {
      this._removeMouse();
      this._destroyGL();
      super.destroy();
    }


    /* ══════════════════════════════════════════════════════════════════════
       Dynamic UI — inject preset dropdown, display mode, bias, timestep
       ══════════════════════════════════════════════════════════════════════ */

    _injectUI() {
      const panel = document.getElementById("effect-reaction-diffusion");
      if (!panel || document.getElementById("rd-preset")) return; // already injected

      /* ── Preset dropdown at top of params section ── */
      const paramsBody = panel.querySelector("#section-rd-params");
      if (paramsBody) {
        // Preset select
        const presetWrap = document.createElement("div");
        presetWrap.style.cssText = "margin-bottom:6px";
        presetWrap.innerHTML =
          `<div class="sub-label" style="margin-bottom:6px">Preset</div>` +
          `<select class="input-select" id="rd-preset"></select>`;
        const sel = presetWrap.querySelector("select");
        PRESETS.forEach((p, i) => {
          const opt = document.createElement("option");
          opt.value = i;
          opt.textContent = p.name;
          sel.appendChild(opt);
        });
        sel.addEventListener("change", () => this._applyPreset(parseInt(sel.value)));
        paramsBody.insertBefore(presetWrap, paramsBody.firstChild);

        // Timestep slider
        paramsBody.appendChild(mkSlider("Timestep", "0.1", "2.0", "0.1", "1.0", "fixed1"));

        // Bias X
        paramsBody.appendChild(mkSlider("Bias X", "-0.5", "0.5", "0.01", "0", "fixed2"));

        // Bias Y
        paramsBody.appendChild(mkSlider("Bias Y", "-0.5", "0.5", "0.01", "0", "fixed2"));
      }

      /* ── Display mode pills at top of color section ── */
      const colorBody = panel.querySelector("#section-rd-color");
      if (colorBody) {
        const modeWrap = document.createElement("div");
        modeWrap.style.cssText = "margin-bottom:4px";
        modeWrap.innerHTML =
          `<div class="sub-label" style="margin-bottom:6px">Display</div>` +
          `<div class="pill-group">` +
            `<button class="pill active" data-group="rd-display" data-val="0">Custom</button>` +
            `<button class="pill" data-group="rd-display" data-val="1">B&W</button>` +
            `<button class="pill" data-group="rd-display" data-val="2">Sharp</button>` +
            `<button class="pill" data-group="rd-display" data-val="3">HSL</button>` +
            `<button class="pill" data-group="rd-display" data-val="4">Rainbow</button>` +
            `<button class="pill" data-group="rd-display" data-val="5">Raw</button>` +
          `</div>`;
        // Wire up pill clicks
        modeWrap.querySelectorAll(".pill[data-group='rd-display']").forEach((pill) => {
          pill.addEventListener("click", () => {
            modeWrap.querySelectorAll(".pill[data-group='rd-display']").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
          });
        });
        colorBody.insertBefore(modeWrap, colorBody.firstChild);
      }
    }

    _applyPreset(idx) {
      const p = PRESETS[idx];
      if (!p) return;
      const panel = document.getElementById("effect-reaction-diffusion");
      if (!panel) return;
      // Find feed & kill sliders and update values
      panel.querySelectorAll(".slider-row").forEach((row) => {
        const lbl = row.querySelector(".slider-label");
        const inp = row.querySelector("input[type='range']");
        const val = row.querySelector(".slider-value");
        if (!lbl || !inp) return;
        const t = lbl.textContent.trim();
        if (t === "Feed Rate") {
          inp.value = p.f;
          if (val) val.textContent = p.f.toFixed(3);
        } else if (t === "Kill Rate") {
          inp.value = p.k;
          if (val) val.textContent = p.k.toFixed(3);
        }
      });
    }


    /* ══════════════════════════════════════════════════════════════════════
       Mouse Painting — click/drag on canvas to add chemical B
       ══════════════════════════════════════════════════════════════════════ */

    _setupMouse() {
      this._removeMouse();
      const c = this.canvas;
      if (!c) return;

      const toUV = (e) => {
        const r = c.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top)  / r.height;
        return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
      };

      this._onMD = (e) => {
        if (e.button !== 0) return;
        this._mouseDown = true;
        this._mouseUV = toUV(e);
      };
      this._onMM = (e) => {
        if (this._mouseDown) this._mouseUV = toUV(e);
      };
      this._onMU = () => { this._mouseDown = false; };
      this._onML = () => { this._mouseDown = false; this._mouseUV = [-1, -1]; };

      c.addEventListener("mousedown", this._onMD);
      window.addEventListener("mousemove", this._onMM);
      window.addEventListener("mouseup", this._onMU);
      c.addEventListener("mouseleave", this._onML);
    }

    _removeMouse() {
      const c = this.canvas;
      if (this._onMD && c) c.removeEventListener("mousedown", this._onMD);
      if (this._onMM) window.removeEventListener("mousemove", this._onMM);
      if (this._onMU) window.removeEventListener("mouseup", this._onMU);
      if (this._onML && c) c.removeEventListener("mouseleave", this._onML);
      this._onMD = this._onMU = this._onMM = this._onML = null;
    }


    /* ══════════════════════════════════════════════════════════════════════
       Read Extended Parameters
       ══════════════════════════════════════════════════════════════════════ */

    _readExtra() {
      const panel = document.getElementById(`effect-${this.id}`);
      if (!panel) return;

      // Colors
      const sec = panel.querySelector("#section-rd-color");
      if (sec) {
        const rows = sec.querySelectorAll(".color-row");
        if (rows[0]) { const p = rows[0].querySelector("input[type='color']"); if (p) this.params.color_a = p.value; }
        if (rows[1]) { const p = rows[1].querySelector("input[type='color']"); if (p) this.params.color_b = p.value; }
      }

      // Blend mode
      const bp = panel.querySelector('.pill[data-group="rd-blend"].active');
      this.params.blend = bp ? bp.textContent.trim().toLowerCase() : "normal";

      // Display mode
      const dp = panel.querySelector('.pill[data-group="rd-display"].active');
      this.params.displayMode = dp ? parseInt(dp.getAttribute("data-val") || "0") : 0;
    }


    /* ══════════════════════════════════════════════════════════════════════
       Seed Generation
       ══════════════════════════════════════════════════════════════════════ */

    _buildSeed(w, h) {
      this.drawPlaceholder();
      const px = this.ctx.getImageData(0, 0, w, h).data;
      const bgHex = document.getElementById("bg-color")?.value || "#000000";
      const bgR = parseInt(bgHex.slice(1, 3), 16);
      const bgG = parseInt(bgHex.slice(3, 5), 16);
      const bgB = parseInt(bgHex.slice(5, 7), 16);

      const data = new Float32Array(w * h * 4);
      const rng  = EffectBase.prng(this.params.seed || 0);
      const skipY = h - 30;
      let hasContent = false;

      for (let i = 0; i < w * h; i++) {
        const y = Math.floor(i / w);
        const diff = Math.abs(px[i*4] - bgR) + Math.abs(px[i*4+1] - bgG) + Math.abs(px[i*4+2] - bgB);
        const isC  = diff > 60 && y < skipY;
        data[i*4]     = 1.0;
        data[i*4 + 1] = isC ? 0.5 + rng() * 0.05 : 0.0;
        data[i*4 + 2] = 0.0;
        data[i*4 + 3] = 1.0;
        if (isC) hasContent = true;
      }

      if (!hasContent) {
        const cx = w / 2, cy = h / 2, r2 = (Math.min(w, h) * 0.04) ** 2;
        for (let yy = 0; yy < h; yy++)
          for (let xx = 0; xx < w; xx++)
            if ((xx - cx) ** 2 + (yy - cy) ** 2 < r2)
              data[(yy * w + xx) * 4 + 1] = 0.5 + rng() * 0.05;
      }

      return data;
    }


    /* ══════════════════════════════════════════════════════════════════════
       WebGL2
       ══════════════════════════════════════════════════════════════════════ */

    _initGL(w, h) {
      this._destroyGL();

      this.glCanvas = document.createElement("canvas");
      this.glCanvas.width = w; this.glCanvas.height = h;

      const gl = this.glCanvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true });
      if (!gl) return false;
      this.gl = gl;
      gl.getExtension("EXT_color_buffer_float");

      this.simProg  = this._mkProg(gl, SIM_VERT, SIM_FRAG);
      this.dispProg = this._mkProg(gl, DISP_VERT, DISP_FRAG);
      if (!this.simProg || !this.dispProg) return false;

      this._locs.sim = {
        state:  gl.getUniformLocation(this.simProg, "u_state"),
        texel:  gl.getUniformLocation(this.simProg, "u_texel"),
        feed:   gl.getUniformLocation(this.simProg, "u_feed"),
        kill:   gl.getUniformLocation(this.simProg, "u_kill"),
        dA:     gl.getUniformLocation(this.simProg, "u_dA"),
        dB:     gl.getUniformLocation(this.simProg, "u_dB"),
        dt:     gl.getUniformLocation(this.simProg, "u_dt"),
        bias:   gl.getUniformLocation(this.simProg, "u_bias"),
        mouse:  gl.getUniformLocation(this.simProg, "u_mouse"),
        brushR: gl.getUniformLocation(this.simProg, "u_brushRadius"),
      };
      this._locs.disp = {
        state:  gl.getUniformLocation(this.dispProg, "u_state"),
        colorA: gl.getUniformLocation(this.dispProg, "u_colorA"),
        colorB: gl.getUniformLocation(this.dispProg, "u_colorB"),
        mode:   gl.getUniformLocation(this.dispProg, "u_mode"),
        time:   gl.getUniformLocation(this.dispProg, "u_time"),
      };

      // Quad VAO
      this.vao  = gl.createVertexArray();
      this._buf = gl.createBuffer();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      // Ping-pong FBOs
      for (let i = 0; i < 2; i++) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        this.texs[i] = tex;
        this.fbs[i]  = fb;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return true;
    }

    _mkProg(gl, vSrc, fSrc) {
      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, vSrc); gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) { console.error("RD VS:", gl.getShaderInfoLog(vs)); gl.deleteShader(vs); return null; }
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, fSrc); gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { console.error("RD FS:", gl.getShaderInfoLog(fs)); gl.deleteShader(vs); gl.deleteShader(fs); return null; }
      const p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, "a_pos");
      gl.linkProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error("RD link:", gl.getProgramInfoLog(p)); gl.deleteProgram(p); return null; }
      return p;
    }

    _uploadSeed(data, w, h) {
      const gl = this.gl;
      for (let i = 0; i < 2; i++) {
        gl.bindTexture(gl.TEXTURE_2D, this.texs[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
      }
      this.cur = 0;
    }

    _renderDisplay() {
      const gl = this.gl;
      const w = this.glCanvas.width, h = this.glCanvas.height;
      const L = this._locs.disp;

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(this.dispProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texs[this.cur]);
      gl.uniform1i(L.state, 0);

      const cA = hexToRGB(this.params.color_a);
      const cB = hexToRGB(this.params.color_b);
      gl.uniform3f(L.colorA, cA[0], cA[1], cA[2]);
      gl.uniform3f(L.colorB, cB[0], cB[1], cB[2]);
      gl.uniform1i(L.mode, this.params.displayMode || 0);
      gl.uniform1f(L.time, this.frameCount * 0.016);

      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    _blit() {
      const blend = this.params.blend || "normal";
      this.ctx.save();
      switch (blend) {
        case "overlay": this.ctx.globalCompositeOperation = "overlay"; break;
        case "screen":  this.ctx.globalCompositeOperation = "screen";  break;
        default:        this.ctx.globalCompositeOperation = "source-over";
      }
      this.ctx.drawImage(this.glCanvas, 0, 0);
      this.ctx.restore();
    }

    _destroyGL() {
      if (!this.gl) return;
      const gl = this.gl;
      for (let i = 0; i < 2; i++) {
        if (this.fbs[i])  gl.deleteFramebuffer(this.fbs[i]);
        if (this.texs[i]) gl.deleteTexture(this.texs[i]);
        this.fbs[i] = null; this.texs[i] = null;
      }
      if (this.simProg)  gl.deleteProgram(this.simProg);
      if (this.dispProg) gl.deleteProgram(this.dispProg);
      if (this.vao)      gl.deleteVertexArray(this.vao);
      if (this._buf)     gl.deleteBuffer(this._buf);
      this.simProg = this.dispProg = this.vao = this._buf = null;
      this._locs = {};
      this.gl = null;
      this.glCanvas = null;
    }
  }

  window.SpiritEffects["reaction-diffusion"] = ReactionDiffusion;

})();
