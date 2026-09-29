import { VERT, PRELUDE, COPY_FRAG, BRUSH_FRAG, PRESENT_FRAG } from './glsl.js';
import { BY_ID } from './effects.js';

const RING = 32;
const GLYPHS = ' .,:-~=+*oxO#%@█';

export class Engine {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;
    this.programs = new Map();
    this.hist = new Map();
    this.ringHead = 0;
    this.brushDown = 0;
    this.mouse = [0.5, 0.5];
    this.vel = [0, 0];
    this.brushSize = 0.08;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.copyProg = this.compile(COPY_FRAG, 'copy');
    this.brushProg = this.compile(BRUSH_FRAG, 'brush');
    this.presentProg = this.compile(PRESENT_FRAG, 'present');
    this.split = -1;
    this.rawTex = this.tex(2, 2);
    this.dummy = this.tex(2, 2);
    this.glyph = this.makeGlyphs();
    this.fbo = gl.createFramebuffer();
    this.setSize(1280, 720);
  }

  // ─── GL helpers
  compile(fragSrc, name) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`[${name}] ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fragSrc));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`[${name}] ${gl.getProgramInfoLog(p)}`);
    const loc = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const u = gl.getActiveUniform(p, i);
      loc[u.name] = gl.getUniformLocation(p, u.name);
    }
    gl.useProgram(p);
    const units = { u_tex: 0, u_src: 1, u_hist: 2, u_brush: 3, u_glyph: 4, u_ring: 5 };
    for (const [k, v] of Object.entries(units)) if (loc[k]) gl.uniform1i(loc[k], v);
    return { p, loc };
  }

  effectProgram(id) {
    if (!this.programs.has(id)) {
      const fx = BY_ID[id];
      const uniforms = fx.params.map((q) => `uniform float p_${q.k};`).join('\n');
      this.programs.set(id, this.compile(`${PRELUDE}\n${uniforms}\n${fx.body}`, id));
    }
    return this.programs.get(id);
  }

  tex(w, h) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  makeGlyphs() {
    const cw = 32, ch = 52;
    const c = document.createElement('canvas');
    c.width = cw * 16; c.height = ch;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `bold ${ch * 0.78}px "JetBrains Mono", ui-monospace, monospace`;
    [...GLYPHS].forEach((g, i) => x.fillText(g, i * cw + cw / 2, ch / 2 + 2));
    const gl = this.gl;
    const t = this.tex(1, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
    return t;
  }

  target(tex) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  }

  bind(unit, tex, kind) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(kind || gl.TEXTURE_2D, tex);
  }

  // ─── sizing
  setSize(w, h) {
    const gl = this.gl;
    w = Math.max(16, Math.round(w / 2) * 2);
    h = Math.max(16, Math.round(h / 2) * 2);
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    for (const t of [this.a, this.b, this.src, this.brushA, this.brushB]) if (t) gl.deleteTexture(t);
    if (this.ring) gl.deleteTexture(this.ring);
    this.a = this.tex(w, h);
    this.b = this.tex(w, h);
    this.src = this.tex(w, h);
    this.rw = Math.max(8, w >> 1); this.rh = Math.max(8, h >> 1);
    this.brushA = this.tex(this.rw, this.rh);
    this.brushB = this.tex(this.rw, this.rh);
    this.clear(this.brushA, [0.5, 0.5, 0, 1]);
    this.clear(this.brushB, [0.5, 0.5, 0, 1]);
    this.ring = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.ring);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, this.rw, this.rh, RING);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    for (const h2 of this.hist.values()) { gl.deleteTexture(h2.r); gl.deleteTexture(h2.w); }
    this.hist.clear();
    this.frame = 0;
  }

  clear(tex, rgba) {
    const gl = this.gl;
    this.target(tex);
    gl.clearColor(...rgba);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  histFor(uid) {
    if (!this.hist.has(uid)) this.hist.set(uid, { r: this.tex(this.w, this.h), w: this.tex(this.w, this.h), born: this.frame });
    return this.hist.get(uid);
  }

  prune(uids) {
    for (const [k, v] of this.hist) {
      if (!uids.has(k)) { this.gl.deleteTexture(v.r); this.gl.deleteTexture(v.w); this.hist.delete(k); }
    }
  }

  // ─── source
  upload(el) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.rawTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, el);
    } catch (e) { /* frame not ready */ }
  }

  draw(prog, out, w, h) {
    const gl = this.gl;
    if (out === null) gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    else this.target(out);
    gl.viewport(0, 0, w ?? this.w, h ?? this.h);
    gl.useProgram(prog.p);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ─── frame
  render(layers, { time, kick, sourceEl, uploadSource }) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    this.frame++;

    // 1. source → normalized, flipped texture
    if (uploadSource && sourceEl) this.upload(sourceEl);
    this.bind(0, this.rawTex);
    gl.useProgram(this.copyProg.p);
    gl.uniform1f(this.copyProg.loc.u_flipY, 1);
    this.draw(this.copyProg, this.src);

    // 2. push into the time ring
    this.ringHead = (this.ringHead + 1) % RING;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.ring, 0, this.ringHead);
    gl.viewport(0, 0, this.rw, this.rh);
    this.bind(0, this.src);
    gl.useProgram(this.copyProg.p);
    gl.uniform1f(this.copyProg.loc.u_flipY, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 3. mosh brush field
    const bp = this.brushProg;
    gl.useProgram(bp.p);
    this.bind(2, this.brushA);
    gl.uniform2f(bp.loc.u_mouse, ...this.mouse);
    gl.uniform2f(bp.loc.u_vel, ...this.vel);
    gl.uniform2f(bp.loc.u_res, this.w, this.h);
    gl.uniform1f(bp.loc.u_down, this.brushDown);
    gl.uniform1f(bp.loc.u_size, this.brushSize);
    gl.uniform1f(bp.loc.u_decay, 0.985);
    this.draw(bp, this.brushB, this.rw, this.rh);
    [this.brushA, this.brushB] = [this.brushB, this.brushA];
    this.vel = [this.vel[0] * 0.6, this.vel[1] * 0.6];

    // 4. effect chain
    let input = this.src;
    this.bind(1, this.src);
    this.bind(3, this.brushA);
    this.bind(4, this.glyph);
    this.bind(5, this.ring, gl.TEXTURE_2D_ARRAY);
    for (const L of layers) {
      const fx = BY_ID[L.type];
      const prog = this.effectProgram(L.type);
      gl.useProgram(prog.p);
      const loc = prog.loc;
      const set2 = (n, x, y) => loc[n] && gl.uniform2f(loc[n], x, y);
      const set1 = (n, x) => loc[n] && gl.uniform1f(loc[n], x);
      set2('u_res', this.w, this.h);
      set2('u_ringRes', this.rw, this.rh);
      set2('u_mouse', ...this.mouse);
      set1('u_time', time);
      set1('u_ringHead', this.ringHead);
      set1('u_ringSize', RING);
      set1('u_kick', kick ? 1 : 0);
      for (const q of fx.params) set1('p_' + q.k, L.live[q.k]);
      const n = fx.iter ? Math.max(1, Math.round(L.live[fx.iter])) : 1;
      if (fx.feedback) {
        const H = this.histFor(L.uid);
        set1('u_frame', this.frame - H.born);
        this.bind(0, input);
        for (let i = 0; i < n; i++) {
          loc.u_iter && gl.uniform1i(loc.u_iter, i);
          set1('u_step', (this.frame * n + i) % 2);
          this.bind(2, H.r);
          this.draw(prog, H.w);
          [H.r, H.w] = [H.w, H.r];
        }
        input = H.r;
      } else {
        set1('u_frame', this.frame);
        loc.u_iter && gl.uniform1i(loc.u_iter, 0);
        this.bind(0, input);
        this.bind(2, this.dummy);
        const out = input === this.a ? this.b : this.a;
        this.draw(prog, out);
        input = out;
      }
    }

    // 5. present
    const pp = this.presentProg;
    gl.useProgram(pp.p);
    this.bind(0, input);
    this.bind(1, this.src);
    gl.uniform1f(pp.loc.u_split, this.split);
    gl.uniform2f(pp.loc.u_res, this.w, this.h);
    this.draw(pp, null);
  }
}
