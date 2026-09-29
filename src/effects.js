// Effect library. Each effect is one fragment shader pass (or several, for iterated ones).
// params: { k: uniform key (p_k), l: label, min, max, v: default, s: step, opts: labels for discrete choices }
// feedback: the pass can read its own previous output via u_hist.
// iter: param key holding how many times the pass runs per frame (ping-ponging through u_hist).

const P = (k, l, min, max, v, s = 0.001) => ({ k, l, min, max, v, s });
const O = (k, l, opts, v = 0) => ({ k, l, min: 0, max: opts.length - 1, v, s: 1, opts });

export const EFFECTS = [
  // ───────────────────────────── TIME / MOTION
  {
    id: 'datamosh', name: 'DATAMOSH', cat: 'time', feedback: true,
    tag: 'I-frames go missing. Motion drags the past forward.',
    params: [P('block', 'block', 4, 64, 16, 1), P('amount', 'motion', 0, 4, 1.4), P('drift', 'drift', 0, 1, 0.15),
      P('key', 'keyframe', 0, 0.2, 0.004), P('bleed', 'bleed', 0, 0.3, 0.01)],
    body: `
void main(){
  vec2 bs = vec2(p_block) / u_res;
  vec2 cell = (floor(v_uv / bs) + 0.5) * bs;
  vec2 e = 1.0 / u_ringRes;
  float sxx=0., syy=0., sxy=0., sxt=0., syt=0., dif=0.;
  for(int j=-2;j<=2;j++) for(int i=-2;i<=2;i++){
    vec2 p = cell + vec2(i,j) * bs * 0.22;
    float c = luma(ring(p,0.)), pr = luma(ring(p,1.));
    float ix = (luma(ring(p+vec2(e.x,0),0.)) - luma(ring(p-vec2(e.x,0),0.))) * 0.5;
    float iy = (luma(ring(p+vec2(0,e.y),0.)) - luma(ring(p-vec2(0,e.y),0.))) * 0.5;
    float it = c - pr;
    sxx += ix*ix; syy += iy*iy; sxy += ix*iy; sxt += ix*it; syt += iy*it; dif += abs(it);
  }
  float det = sxx*syy - sxy*sxy + 1e-6;
  vec2 flow = -vec2(syy*sxt - sxy*syt, sxx*syt - sxy*sxt) / det;
  flow = clamp(flow, -12.0, 12.0) * e;
  vec2 dn = vec2(fbm(cell*3.0 + u_time*0.1), fbm(cell*3.0 - u_time*0.1 + 9.0)) - 0.5;
  vec2 disp = flow * p_amount + dn * p_drift * 0.02;
  vec4 held = texture(u_hist, v_uv - disp);
  vec4 now = T(v_uv);
  float refresh = step(hash3(vec3(cell * 91.0, floor(u_time * 12.0))), p_key);
  refresh = max(refresh, u_kick);
  if (u_frame < 2.0) refresh = 1.0;
  o = mix(held, now, clamp(refresh + p_bleed, 0.0, 1.0));
}`,
  },
  {
    id: 'pixelsort', name: 'PIXEL SORT', cat: 'time', feedback: true, iter: 'speed',
    tag: 'Bright spans sink, darkness rises. Sorts a little every frame.',
    params: [P('lo', 'low', 0, 1, 0.25), P('hi', 'high', 0, 1, 0.9), O('dir', 'axis', ['vert', 'horz']),
      P('speed', 'speed', 1, 48, 12, 1), P('fresh', 'refresh', 0, 1, 0.08), O('order', 'order', ['asc', 'desc'])],
    body: `
vec4 base(vec2 uv){
  vec4 h = texture(u_hist, uv);
  if (u_iter > 0) return h;
  float f = u_frame < 2.0 ? 1.0 : max(p_fresh, u_kick);
  return mix(h, T(uv), f);
}
void main(){
  vec2 ax = p_dir < 0.5 ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
  float idx = dot(floor(v_uv * u_res), ax);
  float left = mod(idx - u_step, 2.0) < 0.5 ? 1.0 : -1.0;
  vec2 puv = v_uv + ax * left / u_res;
  vec4 a = base(v_uv);
  if (puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) { o = a; return; }
  vec4 b = base(puv);
  float la = luma(a.rgb), lb = luma(b.rgb);
  bool ok = la > p_lo && la < p_hi && lb > p_lo && lb < p_hi;
  float s = p_order < 0.5 ? 1.0 : -1.0;
  bool swap = ok && ((left > 0.0 && (la - lb) * s > 0.0) || (left < 0.0 && (la - lb) * s < 0.0));
  o = swap ? b : a;
}`,
  },
  {
    id: 'timeslice', name: 'TIME SLICE', cat: 'time',
    tag: 'Every region lives in a different moment. Slit-scan from the frame buffer.',
    params: [O('mode', 'map', ['rows', 'cols', 'radial', 'noise', 'luma']), P('depth', 'depth', 0, 31, 24, 1), P('mix', 'mix', 0, 1, 1)],
    body: `
void main(){
  float f;
  if (p_mode < 0.5) f = v_uv.y;
  else if (p_mode < 1.5) f = v_uv.x;
  else if (p_mode < 2.5) f = length((v_uv - 0.5) * vec2(u_res.x/u_res.y, 1.0)) * 1.4;
  else if (p_mode < 3.5) f = fbm(v_uv * 3.0 + u_time * 0.05);
  else f = luma(T(v_uv).rgb);
  vec3 c = ring(v_uv, clamp(f, 0.0, 1.0) * p_depth);
  o = vec4(mix(T(v_uv).rgb, c, p_mix), 1.0);
}`,
  },
  {
    id: 'echo', name: 'ECHO TUNNEL', cat: 'time', feedback: true,
    tag: 'Video feedback. Point a camera at its own monitor.',
    params: [P('decay', 'decay', 0, 0.99, 0.9), P('zoom', 'zoom', -0.1, 0.1, 0.02), P('spin', 'spin', -0.2, 0.2, 0.01),
      P('hue', 'hue drift', 0, 0.2, 0.02), O('blend', 'blend', ['max', 'add', 'screen', 'diff'])],
    body: `
void main(){
  vec2 c = (v_uv - 0.5) * vec2(u_res.x/u_res.y, 1.0);
  c = rot(c, p_spin) / (1.0 + p_zoom);
  vec2 uv = c / vec2(u_res.x/u_res.y, 1.0) + 0.5;
  vec3 h = hueShift(texture(u_hist, uv).rgb, p_hue) * p_decay;
  vec3 n = T(v_uv).rgb, r;
  if (p_blend < 0.5) r = max(n, h);
  else if (p_blend < 1.5) r = n * (1.0 - p_decay * 0.5) + h;
  else if (p_blend < 2.5) r = 1.0 - (1.0 - n) * (1.0 - h);
  else r = abs(n - h);
  if (u_kick > 0.5) r = n;
  o = vec4(clamp(r, 0.0, 1.0), 1.0);
}`,
  },
  {
    id: 'smear', name: 'MOSH BRUSH', cat: 'time', feedback: true,
    tag: 'Drag on the canvas to tear pixels along your stroke.',
    params: [P('amount', 'force', 0, 4, 2.2), P('hold', 'hold', 0, 1, 0.97), P('chroma', 'split', 0, 1, 0.3)],
    body: `
void main(){
  vec4 b = texture(u_brush, v_uv);
  vec2 v = (b.rg - 0.5) * 2.0;
  float s = b.b;
  vec2 d = v * s * p_amount * 0.012;
  vec3 h = vec3(texture(u_hist, v_uv - d * (1.0 + p_chroma)).r, texture(u_hist, v_uv - d).g, texture(u_hist, v_uv - d * (1.0 - p_chroma)).b);
  vec3 n = T(v_uv).rgb;
  float k = clamp(s * p_hold * 1.4, 0.0, p_hold);
  if (u_frame < 2.0 || u_kick > 0.5) k = 0.0;
  o = vec4(mix(n, h, k), 1.0);
}`,
  },

  // ───────────────────────────── GLITCH
  {
    id: 'rgbshift', name: 'RGB SPLIT', cat: 'glitch',
    tag: 'Channels drift apart.',
    params: [P('amount', 'amount', 0, 0.08, 0.012), P('angle', 'angle', 0, 6.283, 0), O('mode', 'mode', ['linear', 'radial', 'wobble'])],
    body: `
void main(){
  vec2 d = vec2(cos(p_angle), sin(p_angle)) * p_amount;
  if (p_mode > 0.5 && p_mode < 1.5) d = (v_uv - 0.5) * p_amount * 4.0;
  if (p_mode > 1.5) d *= vec2(sin(v_uv.y * 40.0 + u_time * 6.0), cos(v_uv.x * 30.0 - u_time * 5.0)) * 1.5;
  o = vec4(T(v_uv + d).r, T(v_uv).g, T(v_uv - d).b, 1.0);
}`,
  },
  {
    id: 'blocks', name: 'BLOCK CRASH', cat: 'glitch',
    tag: 'Corrupt macroblocks, some pulled from older frames.',
    params: [P('size', 'block', 4, 128, 32, 1), P('amount', 'amount', 0, 1, 0.3), P('rate', 'rate', 0, 30, 8, 0.1), P('shift', 'shift', 0, 0.5, 0.1)],
    body: `
void main(){
  float t = floor(u_time * p_rate);
  vec2 bs = vec2(p_size) / u_res * vec2(hash(vec2(t, 1.0)) * 3.0 + 0.5, 1.0);
  vec2 cell = floor(v_uv / bs);
  float r = hash3(vec3(cell, t));
  vec2 uv = v_uv;
  vec3 c = T(uv).rgb;
  if (r < p_amount) {
    float r2 = hash3(vec3(cell + 3.1, t));
    uv.x += (r2 - 0.5) * p_shift * 2.0;
    c = T(uv).rgb;
    if (r2 < 0.25) c = c.gbr;
    else if (r2 < 0.45) c = ring(uv, 3.0 + floor(r2 * 20.0));
    else if (r2 < 0.55) c = vec3(step(0.5, luma(c)));
    else if (r2 < 0.65) c = T(cell * bs + bs * 0.5).rgb;
  }
  o = vec4(c, 1.0);
}`,
  },
  {
    id: 'vhs', name: 'VHS', cat: 'analog',
    tag: 'Tape from a flea market, recorded over three times.',
    params: [P('jitter', 'jitter', 0, 1, 0.3), P('bleed', 'bleed', 0, 1, 0.5), P('noise', 'noise', 0, 1, 0.25), P('track', 'tracking', 0, 1, 0.3)],
    body: `
void main(){
  vec2 uv = v_uv;
  float line = floor(uv.y * u_res.y);
  uv.x += (hash(vec2(line, floor(u_time * 30.0))) - 0.5) * 0.004 * p_jitter;
  float band = fract(u_time * 0.13);
  float tb = smoothstep(0.04, 0.0, abs(uv.y - band)) * p_track;
  uv.x += tb * 0.06 * sin(uv.y * 300.0 + u_time * 20.0);
  vec3 c = T(uv).rgb;
  vec3 yiq = mat3(0.299,0.596,0.211, 0.587,-0.274,-0.523, 0.114,-0.322,0.312) * c;
  vec3 acc = vec3(0);
  for (int i = 0; i < 8; i++) acc += mat3(0.299,0.596,0.211, 0.587,-0.274,-0.523, 0.114,-0.322,0.312) * T(uv - vec2(float(i) * 0.003 * p_bleed, 0)).rgb;
  yiq.yz = acc.yz / 8.0;
  c = mat3(1.0,1.0,1.0, 0.956,-0.272,-1.106, 0.621,-0.647,1.703) * yiq;
  c += (hash(uv * u_res + u_time) - 0.5) * p_noise * 0.4;
  c += tb * hash(vec2(uv.x * 400.0, u_time)) * 0.8;
  o = vec4(c, 1.0);
}`,
  },
  {
    id: 'crt', name: 'CRT', cat: 'analog',
    tag: 'Curved glass, scanlines, a choice of phosphor masks, slight misconvergence.',
    params: [P('curve', 'curve', 0, 0.5, 0.15), P('lines', 'lines', 120, 1080, 480, 1), P('scan', 'scanlines', 0, 1, 0.5),
      O('mtype', 'mask', ['grille', 'shadow', 'slot', 'none']), P('mask', 'mask amt', 0, 1, 0.45), P('conv', 'converge', 0, 3, 0.6),
      P('glow', 'glow', 0, 1, 0.3), P('vig', 'vignette', 0, 1, 0.5)],
    body: `
void main(){
  vec2 c = v_uv * 2.0 - 1.0;
  c *= 1.0 + p_curve * dot(c.yx, c.yx) * 0.5;
  vec2 uv = c * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { o = vec4(0,0,0,1); return; }
  vec2 cv = vec2(p_conv / u_res.x, 0.0) * (1.0 + length(c));
  vec3 col = vec3(T(uv + cv).r, T(uv).g, T(uv - cv).b);
  vec3 g = (T(uv + vec2(0.003,0)).rgb + T(uv - vec2(0.003,0)).rgb + T(uv + vec2(0,0.003)).rgb + T(uv - vec2(0,0.003)).rgb) * 0.25;
  col += g * g * p_glow;
  float sl = 0.5 + 0.5 * cos(uv.y * p_lines * 2.0 * PI);
  col *= 1.0 - p_scan * (1.0 - sl) * (1.0 - luma(col) * 0.4);
  vec2 px = floor(v_uv * u_res);
  vec3 msk = vec3(1);
  if (p_mtype < 0.5) {
    float m = mod(px.x, 3.0);
    msk = m < 1.0 ? vec3(1, .25, .25) : m < 2.0 ? vec3(.25, 1, .25) : vec3(.25, .25, 1);
  } else if (p_mtype < 1.5) {
    float m = mod(px.x + mod(px.y, 2.0) * 1.5, 3.0);
    msk = m < 1.0 ? vec3(1, .25, .25) : m < 2.0 ? vec3(.25, 1, .25) : vec3(.25, .25, 1);
    msk *= 0.75 + 0.25 * mod(px.y, 2.0);
  } else if (p_mtype < 2.5) {
    float m = mod(px.x, 3.0);
    msk = m < 1.0 ? vec3(1, .25, .25) : m < 2.0 ? vec3(.25, 1, .25) : vec3(.25, .25, 1);
    float slot = mod(px.y + step(3.0, mod(px.x, 6.0)) * 2.0, 4.0) < 1.0 ? 0.5 : 1.0;
    msk *= slot;
  }
  col *= mix(vec3(1), msk * 1.5, p_mask);
  col *= 1.0 - p_vig * dot(c, c) * 0.4;
  o = vec4(col, 1.0);
}`,
  },
  {
    id: 'composite', name: 'COMPOSITE', cat: 'analog',
    tag: 'NTSC over a cheap RCA cable: smeared chroma, ringing edges, crawling dots.',
    params: [P('chroma', 'chroma blur', 0, 1, 0.6), P('ring', 'ringing', 0, 1, 0.35), P('crawl', 'dot crawl', 0, 1, 0.25),
      P('phase', 'phase error', -0.2, 0.2, 0.02), P('sat', 'saturation', 0, 2, 1.1)],
    body: `
const mat3 toY = mat3(0.299,0.596,0.211, 0.587,-0.274,-0.523, 0.114,-0.322,0.312);
const mat3 toR = mat3(1.0,1.0,1.0, 0.956,-0.272,-1.106, 0.621,-0.647,1.703);
void main(){
  vec2 e = vec2(1.0 / u_res.x, 0.0);
  vec3 yiq = toY * T(v_uv).rgb;
  vec2 acc = vec2(0); float wsum = 0.0;
  for (int i = -6; i <= 6; i++) {
    float w = exp(-float(i*i) / (1.0 + p_chroma * 18.0));
    acc += (toY * T(v_uv + e * float(i) * (1.0 + p_chroma * 2.0)).rgb).yz * w; wsum += w;
  }
  yiq.yz = acc / wsum;
  float yl = (toY * T(v_uv - e * 2.0).rgb).x, yr = (toY * T(v_uv + e * 2.0).rgb).x;
  yiq.x += (yiq.x - (yl + yr) * 0.5) * p_ring * 2.5;
  yiq.x += (toY * T(v_uv - e * 5.0).rgb).x * p_ring * 0.12 - p_ring * 0.06;
  vec2 px = floor(v_uv * u_res);
  float sub = sin((px.x + px.y * 2.0 + u_frame) * PI * 0.5);
  yiq.x += sub * length(yiq.yz) * p_crawl * 0.6;
  float a = p_phase * PI;
  yiq.yz = mat2(cos(a), -sin(a), sin(a), cos(a)) * yiq.yz * p_sat;
  o = vec4(toR * yiq, 1.0);
}`,
  },
  {
    id: 'tape', name: 'TAPE DECK', cat: 'analog',
    tag: 'Worn transport: wobble, head-switching tear, dropouts, late chroma.',
    params: [P('wobble', 'wobble', 0, 1, 0.3), P('head', 'head switch', 0, 1, 0.6), P('drop', 'dropouts', 0, 1, 0.2),
      P('delay', 'chroma delay', 0, 1, 0.4), P('soft', 'softness', 0, 1, 0.4), P('age', 'wear', 0, 1, 0.3)],
    body: `
void main(){
  vec2 uv = v_uv;
  uv.x += (sin(uv.y * 6.0 + u_time * 1.3) * 0.6 + sin(uv.y * 23.0 - u_time * 3.1) * 0.4) * 0.004 * p_wobble;
  float hs = smoothstep(0.035 * (0.5 + p_head), 0.0, uv.y);
  uv.x += hs * (0.05 + 0.03 * sin(u_time * 40.0 + uv.y * 200.0)) * p_head;
  vec2 e = vec2(1.0 / u_res.x, 0.0) * (1.0 + p_soft * 3.0);
  vec3 c = (T(uv - e).rgb + T(uv).rgb * 2.0 + T(uv + e).rgb) * 0.25;
  vec3 cd = T(uv + vec2(p_delay * 0.006, -p_delay * 0.004)).rgb;
  float y = luma(c);
  c = y + (cd - luma(cd));
  float line = floor(uv.y * u_res.y * 0.5);
  float dr = hash(vec2(line, floor(u_time * 24.0)));
  if (dr < p_drop * 0.02) {
    float x0 = hash(vec2(line, floor(u_time * 24.0) + 3.0));
    float len = 0.05 + 0.2 * hash(vec2(line, 9.0));
    if (uv.x > x0 && uv.x < x0 + len) c = mix(c, vec3(0.95), 0.85);
  }
  c += (hash(uv * u_res + u_time) - 0.5) * p_age * 0.18;
  c = mix(c, c * vec3(1.05, 0.97, 0.9) + 0.03, p_age);
  c *= 1.0 - hs * 0.4;
  o = vec4(c, 1.0);
}`,
  },
  {
    id: 'phosphor', name: 'PHOSPHOR', cat: 'analog', feedback: true,
    tag: 'Slow phosphor decay with halation: highlights leave glowing trails.',
    params: [P('persist', 'persistence', 0, 0.97, 0.7), P('green', 'P31 green', 0, 1, 0.3), P('halo', 'halation', 0, 2, 0.6), P('radius', 'radius', 1, 12, 5)],
    body: `
void main(){
  vec3 n = T(v_uv).rgb;
  vec3 h = texture(u_hist, v_uv).rgb;
  vec3 dec = vec3(p_persist) * mix(vec3(1), vec3(0.85, 1.0, 0.8), p_green);
  vec3 c = max(n, h * dec);
  vec3 b = vec3(0); float w = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.39996;
    float r = sqrt(float(i) + 0.5) / 3.5 * p_radius;
    vec2 d = vec2(cos(a), sin(a)) * r / u_res * 3.0;
    vec3 s = T(v_uv + d).rgb;
    b += s * smoothstep(0.55, 1.0, luma(s)); w += 1.0;
  }
  c += (b / w) * p_halo * vec3(1.0, 0.75, 0.6);
  if (u_frame < 2.0 || u_kick > 0.5) c = n;
  o = vec4(c, 1.0);
}`,
  },
  {
    id: 'interlace', name: 'INTERLACE', cat: 'analog', feedback: true,
    tag: 'Two fields, never quite in sync. Motion combs.',
    params: [P('rate', 'field rate', 0, 1, 1), P('shift', 'field shift', -4, 4, 0.5), P('dark', 'line dim', 0, 1, 0.1)],
    body: `
void main(){
  float line = floor(v_uv.y * u_res.y);
  float field = mod(floor(u_frame * p_rate), 2.0);
  bool mine = mod(line, 2.0) == field;
  vec3 n = T(v_uv + vec2(p_shift * (field - 0.5) / u_res.x, 0.0)).rgb;
  vec3 h = texture(u_hist, v_uv).rgb;
  vec3 c = mine || u_frame < 2.0 ? n : h * (1.0 - p_dark);
  o = vec4(c, 1.0);
}`,
  },
  // ───────────────────────────── STYLIZE
  {
    id: 'dither', name: 'DITHER', cat: 'stylize',
    tag: 'Bayer matrices and tiny palettes.',
    params: [P('scale', 'pixel', 1, 12, 2, 1), O('pal', 'palette', ['1-bit', 'gameboy', 'cga', 'acid', 'levels']), P('levels', 'levels', 2, 8, 3, 1), P('spread', 'spread', 0, 1, 0.6)],
    body: `
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }
vec3 pick(vec3 c, vec3 a, vec3 b, vec3 d, vec3 e){
  vec3 r = a; float m = distance(c, a);
  float k = distance(c, b); if (k < m) { m = k; r = b; }
  k = distance(c, d); if (k < m) { m = k; r = d; }
  k = distance(c, e); if (k < m) { r = e; }
  return r;
}
void main(){
  vec2 px = floor(v_uv * u_res / p_scale);
  vec2 uv = (px + 0.5) * p_scale / u_res;
  vec3 c = T(uv).rgb;
  float th = (bayer(px) - 0.5) * p_spread;
  c += th * 0.5;
  vec3 r;
  if (p_pal < 0.5) r = vec3(step(0.5, luma(c)));
  else if (p_pal < 1.5) r = pick(vec3(luma(c)), vec3(0.0), vec3(0.33), vec3(0.66), vec3(1.0)).x * vec3(.55,.74,.06) + vec3(.06,.13,.06);
  else if (p_pal < 2.5) r = pick(c, vec3(0), vec3(.33,1,1), vec3(1,.33,1), vec3(1));
  else if (p_pal < 3.5) r = pick(c, vec3(.02,.02,.04), vec3(.78,1,0), vec3(1,.17,.84), vec3(.95));
  else r = floor(c * (p_levels - 1.0) + 0.5) / (p_levels - 1.0);
  o = vec4(r, 1.0);
}`,
  },
  {
    id: 'ascii', name: 'ASCII', cat: 'stylize',
    tag: 'Every cell becomes a character.',
    params: [P('cell', 'cell', 4, 32, 10, 1), O('color', 'ink', ['source', 'phosphor', 'acid', 'mono']), P('gamma', 'gamma', 0.3, 2.5, 1), P('bg', 'backdrop', 0, 1, 0.05)],
    body: `
void main(){
  vec2 cs = vec2(p_cell, p_cell * 1.6);
  vec2 cell = floor(v_uv * u_res / cs);
  vec2 cuv = (cell + 0.5) * cs / u_res;
  vec2 f = fract(v_uv * u_res / cs);
  vec3 c = T(cuv).rgb;
  float l = pow(clamp(luma(c), 0.0, 1.0), p_gamma);
  float g = floor(l * 15.99);
  float m = texture(u_glyph, vec2((g + f.x) / 16.0, 1.0 - f.y)).r;
  vec3 ink = p_color < 0.5 ? c * 1.4 : p_color < 1.5 ? vec3(0.2, 1.0, 0.45) : p_color < 2.5 ? mix(vec3(1,.17,.84), vec3(.78,1,0), l) : vec3(1);
  o = vec4(mix(c * p_bg, ink, m), 1.0);
}`,
  },
  {
    id: 'halftone', name: 'HALFTONE', cat: 'stylize',
    tag: 'Newsprint dots, per-channel screens.',
    params: [P('size', 'dot', 3, 40, 10, 1), P('angle', 'angle', 0, 1.57, 0.4), O('mode', 'mode', ['mono', 'cmy', 'rgb'])],
    body: `
float dotAt(vec2 px, float ang, int ch){
  vec2 p = rot(px, ang) / p_size;
  vec2 cc = (floor(p) + 0.5);
  vec2 suv = rot(cc * p_size, -ang) / u_res;
  vec3 c = T(suv).rgb;
  float v = ch == 0 ? 1.0 - c.r : ch == 1 ? 1.0 - c.g : ch == 2 ? 1.0 - c.b : 1.0 - luma(c);
  float r = sqrt(clamp(v, 0.0, 1.0)) * 0.7;
  return smoothstep(r + 0.06, r - 0.06, length(p - cc));
}
void main(){
  vec2 px = v_uv * u_res;
  if (p_mode < 0.5) { o = vec4(vec3(1.0 - dotAt(px, p_angle, 3)), 1.0); return; }
  float c = dotAt(px, p_angle, 0), m = dotAt(px, p_angle + 0.5, 1), y = dotAt(px, p_angle + 1.0, 2);
  vec3 r = p_mode < 1.5 ? vec3(1.0 - c, 1.0 - m, 1.0 - y) : vec3(c, m, y);
  o = vec4(r, 1.0);
}`,
  },
  {
    id: 'pixelate', name: 'PIXELATE', cat: 'stylize',
    tag: 'Chunky pixels or LED matrix.',
    params: [P('size', 'size', 2, 64, 12, 1), O('shape', 'shape', ['square', 'led', 'diamond']), P('gap', 'gap', 0, 0.6, 0.15)],
    body: `
void main(){
  vec2 px = v_uv * u_res / p_size;
  vec2 cell = floor(px), f = fract(px) - 0.5;
  vec3 c = T((cell + 0.5) * p_size / u_res).rgb;
  float m = 1.0;
  if (p_shape > 0.5 && p_shape < 1.5) m = smoothstep(0.5 - p_gap * 0.5, 0.45 - p_gap * 0.5, length(f));
  else if (p_shape > 1.5) m = step(abs(f.x) + abs(f.y), 0.5 - p_gap * 0.3);
  else m = step(max(abs(f.x), abs(f.y)), 0.5 - p_gap * 0.25);
  o = vec4(c * m, 1.0);
}`,
  },
  {
    id: 'edge', name: 'EDGE GLOW', cat: 'stylize',
    tag: 'Sobel contours, colored by direction.',
    params: [P('gain', 'gain', 0, 8, 2.5), P('mix', 'mix', 0, 1, 0.85), O('color', 'color', ['angle', 'white', 'source'])],
    body: `
void main(){
  vec2 e = 1.0 / u_res;
  float tl = luma(T(v_uv + e*vec2(-1,1)).rgb), t = luma(T(v_uv + e*vec2(0,1)).rgb), tr = luma(T(v_uv + e*vec2(1,1)).rgb);
  float l = luma(T(v_uv + e*vec2(-1,0)).rgb), r = luma(T(v_uv + e*vec2(1,0)).rgb);
  float bl = luma(T(v_uv + e*vec2(-1,-1)).rgb), b = luma(T(v_uv + e*vec2(0,-1)).rgb), br = luma(T(v_uv + e*vec2(1,-1)).rgb);
  vec2 g = vec2(tr + 2.0*r + br - tl - 2.0*l - bl, tl + 2.0*t + tr - bl - 2.0*b - br);
  float m = clamp(length(g) * p_gain, 0.0, 1.0);
  vec3 col = p_color < 0.5 ? hsv2rgb(vec3(atan(g.y, g.x) / 6.283 + 0.5, 0.8, 1.0)) : p_color < 1.5 ? vec3(1) : T(v_uv).rgb * 1.5;
  o = vec4(mix(T(v_uv).rgb, col * m, p_mix), 1.0);
}`,
  },

  // ───────────────────────────── SPACE
  {
    id: 'liquid', name: 'LIQUID', cat: 'space',
    tag: 'Domain-warped noise melts the frame.',
    params: [P('amp', 'amount', 0, 0.2, 0.03), P('freq', 'scale', 0.5, 12, 3), P('speed', 'speed', 0, 2, 0.3)],
    body: `
void main(){
  vec2 p = v_uv * p_freq;
  float t = u_time * p_speed;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 w = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2)), fbm(p + 4.0 * q + vec2(8.3, 2.8))) - 0.5;
  o = vec4(T(v_uv + w * p_amp * 2.0).rgb, 1.0);
}`,
  },
  {
    id: 'kaleido', name: 'KALEIDO', cat: 'space',
    tag: 'Fold the image into a mandala.',
    params: [P('seg', 'segments', 2, 24, 6, 1), P('spin', 'spin', -1, 1, 0.1), P('zoom', 'zoom', 0.3, 3, 1), P('mix', 'mix', 0, 1, 1)],
    body: `
void main(){
  vec2 c = (v_uv - 0.5) * vec2(u_res.x/u_res.y, 1.0);
  float a = atan(c.y, c.x) + u_time * p_spin, r = length(c) / p_zoom;
  float s = 6.283 / p_seg;
  a = mod(a, s); a = abs(a - s * 0.5);
  vec2 uv = vec2(cos(a), sin(a)) * r / vec2(u_res.x/u_res.y, 1.0) + 0.5;
  uv = abs(mod(uv + 1.0, 2.0) - 1.0);
  o = vec4(mix(T(v_uv).rgb, T(uv).rgb, p_mix), 1.0);
}`,
  },
  {
    id: 'mirror', name: 'MIRROR TILE', cat: 'space',
    tag: 'Repeat and reflect.',
    params: [P('nx', 'tiles x', 1, 8, 2, 1), P('ny', 'tiles y', 1, 8, 1, 1), P('scroll', 'scroll', -1, 1, 0)],
    body: `
void main(){
  vec2 uv = v_uv * vec2(p_nx, p_ny) + vec2(u_time * p_scroll * 0.1, 0.0);
  uv = abs(mod(uv + 1.0, 2.0) - 1.0);
  o = vec4(T(uv).rgb, 1.0);
}`,
  },

  // ───────────────────────────── COLOR
  {
    id: 'gradmap', name: 'THERMAL MAP', cat: 'color',
    tag: 'Luminance remapped through a heat palette.',
    params: [O('pal', 'palette', ['thermal', 'acid', 'ice', 'x-ray', 'infra']), P('shift', 'shift', 0, 1, 0), P('cycle', 'cycle', 0, 1, 0), P('mix', 'mix', 0, 1, 1)],
    body: `
void main(){
  vec3 c = T(v_uv).rgb;
  float l = fract(luma(c) + p_shift + u_time * p_cycle * 0.2);
  vec3 r;
  if (p_pal < 0.5) r = clamp(vec3(smoothstep(0.3, 0.7, l) + smoothstep(0.85, 1.0, l), smoothstep(0.55, 0.9, l), smoothstep(0.0, 0.3, l) - smoothstep(0.35, 0.6, l) + smoothstep(0.9, 1.0, l)), 0.0, 1.0);
  else if (p_pal < 1.5) r = cosPal(l, vec3(.5), vec3(.5), vec3(1.0, 1.0, 0.5), vec3(0.8, 0.9, 0.3));
  else if (p_pal < 2.5) r = cosPal(l, vec3(.5,.6,.7), vec3(.4), vec3(1.0), vec3(0.0, 0.1, 0.2)) * l * 1.4;
  else if (p_pal < 3.5) r = vec3(1.0 - l) * vec3(0.75, 0.9, 1.0);
  else r = mix(vec3(0.05, 0.0, 0.1), vec3(1.0, 0.05, 0.3), l) + vec3(0, smoothstep(0.8, 1.0, l), 0);
  o = vec4(mix(c, r, p_mix), 1.0);
}`,
  },
  {
    id: 'tone', name: 'COLOR CRUSH', cat: 'color',
    tag: 'Hue, saturation, posterize, solarize.',
    params: [P('hue', 'hue', 0, 1, 0), P('sat', 'saturation', 0, 3, 1.2), P('contrast', 'contrast', 0, 3, 1.1), P('post', 'posterize', 0, 16, 0, 1), P('solar', 'solarize', 0, 1, 0), P('invert', 'invert', 0, 1, 0)],
    body: `
void main(){
  vec3 c = T(v_uv).rgb;
  c = hueShift(c, p_hue);
  c = mix(vec3(luma(c)), c, p_sat);
  c = (c - 0.5) * p_contrast + 0.5;
  if (p_post > 1.0) c = floor(c * p_post) / (p_post - 1.0);
  c = mix(c, abs(c - 0.5) * 2.0, p_solar);
  c = mix(c, 1.0 - c, p_invert);
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,
  },
];

export const BY_ID = Object.fromEntries(EFFECTS.map((e) => [e.id, e]));

export const CATS = [
  ['time', 'TIME / MOTION'],
  ['glitch', 'GLITCH'],
  ['analog', 'ANALOG'],
  ['stylize', 'STYLIZE'],
  ['space', 'SPACE'],
  ['color', 'COLOR'],
];

export function defaults(id) {
  const p = {};
  for (const q of BY_ID[id].params) p[q.k] = q.v;
  return p;
}
