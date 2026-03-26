/* ═══════════════════════════════════════════════════════════════════════════
   Effect: Reaction Diffusion
   Gray-Scott model — WebGL2 GPU-accelerated ping-pong simulation
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {

  /* ── GLSL Shader Sources ─────────────────────────────────────────────── */

  const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  // Flip Y so row 0 of texture = top of canvas (matches Canvas2D convention)
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

  const SIM_FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_state;
uniform vec2  u_texel;   // 1/resolution
uniform float u_feed;
uniform float u_kill;
uniform float u_dA;
uniform float u_dB;
uniform float u_dt;

in  vec2 v_uv;
out vec4 outColor;

void main() {
  vec4  c = texture(u_state, v_uv);
  float A = c.r;
  float B = c.g;

  // 9-point Laplacian stencil (Karl Sims weights)
  //   0.05  0.2  0.05
  //   0.2  -1.0  0.2
  //   0.05  0.2  0.05
  vec2 lap = c.rg * -1.0;
  lap += texture(u_state, fract(v_uv + vec2(        0.0, -u_texel.y))).rg * 0.2;
  lap += texture(u_state, fract(v_uv + vec2( u_texel.x,         0.0))).rg * 0.2;
  lap += texture(u_state, fract(v_uv + vec2(        0.0,  u_texel.y))).rg * 0.2;
  lap += texture(u_state, fract(v_uv + vec2(-u_texel.x,         0.0))).rg * 0.2;
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
uniform vec3 u_colorA;
uniform vec3 u_colorB;

in  vec2 v_uv;
out vec4 outColor;

void main() {
  vec2 st = texture(u_state, v_uv).rg;
  float A = st.x;
  float B = st.y;

  // Use A-B difference for clear pattern visibility
  // Background (A≈1,B≈0) → high diff → Color A
  // Active pattern (A low, B high) → low diff → Color B
  float diff = clamp(A - B, 0.0, 1.0);
  vec3 color = mix(u_colorB, u_colorA, diff);
  outColor = vec4(color, 1.0);
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


  /* ── Class ───────────────────────────────────────────────────────────── */

  class ReactionDiffusion extends EffectBase {

    constructor() {
      super("reaction-diffusion", "Reaction Diffusion");
      this.gl       = null;
      this.glCanvas = null;
      this.simProg  = null;
      this.dispProg = null;
      this.fbs      = [null, null];   // framebuffers
      this.texs     = [null, null];   // float textures
      this.cur      = 0;              // current read-buffer index
      this.vao      = null;
      this._buf     = null;
      this._locs    = {};             // cached uniform locations
      this.frameCount = 0;
    }

    /* ══════════════════════════════════════════════════════════════════════
       Lifecycle
       ══════════════════════════════════════════════════════════════════════ */

    setup() {
      this.readParams();
      this._readColors();
      this.frameCount = 0;
      this.cur = 0;

      const w = this.canvas.width;
      const h = this.canvas.height;

      // Build seed from current text / SVG input
      const seed = this._buildSeed(w, h);

      // Initialise (or re-initialise) WebGL2
      if (!this._initGL(w, h)) {
        this.drawPlaceholder();
        return;
      }

      this._uploadSeed(seed, w, h);

      // Render first display frame so the canvas isn't blank
      this._renderDisplay();
      this._blit();
    }

    render() {
      if (!this.gl) return;

      // Re-read params every frame so slider changes apply live
      this.readParams();
      this._readColors();

      const gl   = this.gl;
      const w    = this.glCanvas.width;
      const h    = this.glCanvas.height;
      const L    = this._locs.sim;
      const iters = Math.max(1, Math.round((this.params.iter_frame || 10) * this.speed));

      // Set uniforms once per frame (they don't change between iterations)
      gl.useProgram(this.simProg);
      gl.uniform1i(L.state, 0);
      gl.uniform2f(L.texel, 1 / w, 1 / h);
      gl.uniform1f(L.feed, this.params.feed_rate  ?? 0.055);
      gl.uniform1f(L.kill, this.params.kill_rate   ?? 0.062);
      gl.uniform1f(L.dA,   this.params.diffuse_a   ?? 1.0);
      gl.uniform1f(L.dB,   this.params.diffuse_b   ?? 0.5);
      gl.uniform1f(L.dt,   1.0);
      gl.viewport(0, 0, w, h);
      gl.bindVertexArray(this.vao);

      // Ping-pong simulation iterations
      for (let i = 0; i < iters; i++) {
        const dst = 1 - this.cur;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbs[dst]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texs[this.cur]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        this.cur = dst;
      }

      // Display result on screen
      this._renderDisplay();
      this._blit();
      this.frameCount++;
    }

    destroy() {
      this._destroyGL();
      super.destroy();
    }


    /* ══════════════════════════════════════════════════════════════════════
       Color / Blend Params  (not covered by readParams)
       ══════════════════════════════════════════════════════════════════════ */

    _readColors() {
      const panel = document.getElementById(`effect-${this.id}`);
      if (!panel) return;

      const sec = panel.querySelector("#section-rd-color");
      if (sec) {
        const rows = sec.querySelectorAll(".color-row");
        if (rows[0]) {
          const p = rows[0].querySelector("input[type='color']");
          if (p) this.params.color_a = p.value;
        }
        if (rows[1]) {
          const p = rows[1].querySelector("input[type='color']");
          if (p) this.params.color_b = p.value;
        }
      }

      const bp = panel.querySelector('.pill[data-group="rd-blend"].active');
      this.params.blend = bp ? bp.textContent.trim().toLowerCase() : "normal";
    }


    /* ══════════════════════════════════════════════════════════════════════
       Seed Generation — render text/SVG to temp canvas, extract mask
       ══════════════════════════════════════════════════════════════════════ */

    _buildSeed(w, h) {
      // Use the monkey-patched drawPlaceholder to render text/SVG to main canvas
      this.drawPlaceholder();

      // Read pixel data
      const px = this.ctx.getImageData(0, 0, w, h).data;

      // Background colour
      const bgHex = document.getElementById("bg-color")?.value || "#000000";
      const bgR = parseInt(bgHex.slice(1, 3), 16);
      const bgG = parseInt(bgHex.slice(3, 5), 16);
      const bgB = parseInt(bgHex.slice(5, 7), 16);

      const data = new Float32Array(w * h * 4);
      const rng  = EffectBase.prng(this.params.seed || 0);
      const skipY = h - 30;   // ignore bottom label ("READY")

      let hasContent = false;

      for (let i = 0; i < w * h; i++) {
        const y  = Math.floor(i / w);
        const pr = px[i * 4];
        const pg = px[i * 4 + 1];
        const pb = px[i * 4 + 2];

        // Detect non-background pixels (threshold 60 to ignore faint artifacts)
        const diff = Math.abs(pr - bgR) + Math.abs(pg - bgG) + Math.abs(pb - bgB);
        const isContent = diff > 60 && y < skipY;

        data[i * 4]     = 1.0;                                    // chemical A
        data[i * 4 + 1] = isContent ? 0.5 + rng() * 0.05 : 0.0;  // chemical B
        data[i * 4 + 2] = 0.0;
        data[i * 4 + 3] = 1.0;

        if (isContent) hasContent = true;
      }

      // Fallback: if no content detected, seed a small circle at the centre
      if (!hasContent) {
        const cx = w / 2, cy = h / 2;
        const r  = Math.min(w, h) * 0.04;
        const r2 = r * r;
        for (let yy = 0; yy < h; yy++) {
          for (let xx = 0; xx < w; xx++) {
            const dx = xx - cx, dy = yy - cy;
            if (dx * dx + dy * dy < r2) {
              const idx = (yy * w + xx) * 4;
              data[idx + 1] = 0.5 + rng() * 0.05;
            }
          }
        }
      }

      return data;
    }


    /* ══════════════════════════════════════════════════════════════════════
       WebGL2 Initialisation
       ══════════════════════════════════════════════════════════════════════ */

    _initGL(w, h) {
      this._destroyGL();

      this.glCanvas = document.createElement("canvas");
      this.glCanvas.width  = w;
      this.glCanvas.height = h;

      const gl = this.glCanvas.getContext("webgl2", {
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) { console.error("RD: WebGL2 not available"); return false; }
      this.gl = gl;

      // Required for float render targets
      if (!gl.getExtension("EXT_color_buffer_float")) {
        console.warn("RD: EXT_color_buffer_float not available");
      }

      // Compile shader programs
      this.simProg  = this._mkProg(gl, VERT, SIM_FRAG);
      this.dispProg = this._mkProg(gl, VERT, DISP_FRAG);
      if (!this.simProg || !this.dispProg) return false;

      // Cache uniform locations
      this._locs.sim = {
        state: gl.getUniformLocation(this.simProg, "u_state"),
        texel: gl.getUniformLocation(this.simProg, "u_texel"),
        feed:  gl.getUniformLocation(this.simProg, "u_feed"),
        kill:  gl.getUniformLocation(this.simProg, "u_kill"),
        dA:    gl.getUniformLocation(this.simProg, "u_dA"),
        dB:    gl.getUniformLocation(this.simProg, "u_dB"),
        dt:    gl.getUniformLocation(this.simProg, "u_dt"),
      };
      this._locs.disp = {
        state:  gl.getUniformLocation(this.dispProg, "u_state"),
        colorA: gl.getUniformLocation(this.dispProg, "u_colorA"),
        colorB: gl.getUniformLocation(this.dispProg, "u_colorB"),
      };

      // Full-screen quad
      this.vao  = gl.createVertexArray();
      this._buf = gl.createBuffer();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buf);
      gl.bufferData(gl.ARRAY_BUFFER,
        new Float32Array([-1, -1,  1, -1,  -1, 1,  1, 1]),
        gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      // Ping-pong framebuffers with RGBA32F textures
      for (let i = 0; i < 2; i++) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0,
                      gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                                gl.TEXTURE_2D, tex, 0);

        this.texs[i] = tex;
        this.fbs[i]  = fb;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      return true;
    }

    /** Compile & link a shader program */
    _mkProg(gl, vSrc, fSrc) {
      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, vSrc);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        console.error("RD VS:", gl.getShaderInfoLog(vs));
        gl.deleteShader(vs);
        return null;
      }

      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, fSrc);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.error("RD FS:", gl.getShaderInfoLog(fs));
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return null;
      }

      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, "a_pos");
      gl.linkProgram(p);
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error("RD link:", gl.getProgramInfoLog(p));
        gl.deleteProgram(p);
        return null;
      }
      return p;
    }

    /** Upload seed data to both ping-pong textures */
    _uploadSeed(data, w, h) {
      const gl = this.gl;
      for (let i = 0; i < 2; i++) {
        gl.bindTexture(gl.TEXTURE_2D, this.texs[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0,
                      gl.RGBA, gl.FLOAT, data);
      }
      this.cur = 0;
    }


    /* ══════════════════════════════════════════════════════════════════════
       Display — map simulation state to Color A / Color B
       ══════════════════════════════════════════════════════════════════════ */

    _renderDisplay() {
      const gl = this.gl;
      const w  = this.glCanvas.width;
      const h  = this.glCanvas.height;
      const L  = this._locs.disp;

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

      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /** Copy the offscreen WebGL canvas onto the main 2D canvas */
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


    /* ══════════════════════════════════════════════════════════════════════
       Cleanup
       ══════════════════════════════════════════════════════════════════════ */

    _destroyGL() {
      if (!this.gl) return;
      const gl = this.gl;

      for (let i = 0; i < 2; i++) {
        if (this.fbs[i])  gl.deleteFramebuffer(this.fbs[i]);
        if (this.texs[i]) gl.deleteTexture(this.texs[i]);
        this.fbs[i]  = null;
        this.texs[i] = null;
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

  // Register
  window.SpiritEffects["reaction-diffusion"] = ReactionDiffusion;

})();
