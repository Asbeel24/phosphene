// Shared GLSL chunks. Every effect pass is compiled as PRELUDE + param uniforms + body.

export const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

export const PRELUDE = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;    // chain input
uniform sampler2D u_src;    // untouched source frame
uniform sampler2D u_hist;   // this layer's own previous output (feedback layers)
uniform sampler2D u_brush;  // mosh brush field: rg = velocity, b = strength
uniform sampler2D u_glyph;  // ascii atlas, 16 glyphs in a row
uniform sampler2DArray u_ring; // recent source frames (time machine)
uniform vec2 u_res;
uniform vec2 u_ringRes;
uniform float u_time;
uniform float u_frame;
uniform float u_step;
uniform int u_iter;
uniform float u_kick;
uniform float u_ringHead;
uniform float u_ringSize;
uniform vec2 u_mouse;
uniform float u_seed;

#define PI 3.14159265
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash3(vec3 p){ return hash(p.xy + p.z * 17.17); }
vec2 hash2(vec2 p){ return vec2(hash(p), hash(p + 19.19)); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*noise(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return mat2(c,-s,s,c) * p; }
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y), e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y)/(6.0*d + e)), d/(q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(0,2,1)/3.0)*6.0 - 3.0); return c.z * mix(vec3(1), clamp(p-1.0,0.0,1.0), c.y); }
vec3 hueShift(vec3 c, float h){ vec3 v = rgb2hsv(c); v.x = fract(v.x + h); return hsv2rgb(v); }
vec3 cosPal(float t, vec3 a, vec3 b, vec3 c, vec3 d){ return a + b*cos(6.28318*(c*t + d)); }
vec3 ring(vec2 uv, float back){
  float l = mod(u_ringHead - floor(back) + u_ringSize * 4.0, u_ringSize);
  return texture(u_ring, vec3(uv, l)).rgb;
}
vec4 T(vec2 uv){ return texture(u_tex, uv); }
`;

export const COPY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_tex;
uniform float u_flipY;
void main(){ vec2 uv = v_uv; if(u_flipY > 0.5) uv.y = 1.0 - uv.y; o = vec4(texture(u_tex, uv).rgb, 1.0); }`;

// Mosh brush field update: decays toward neutral, stamps mouse velocity where painting.
export const BRUSH_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_hist;
uniform vec2 u_mouse, u_vel, u_res;
uniform float u_down, u_size, u_decay;
void main(){
  vec4 h = texture(u_hist, v_uv);
  vec2 v = (h.rg - 0.5) * 2.0;
  float s = h.b * u_decay;
  v *= mix(1.0, u_decay, 0.5);
  vec2 d = (v_uv - u_mouse) * vec2(u_res.x / u_res.y, 1.0);
  float k = u_down * smoothstep(u_size, 0.0, length(d));
  vec2 nv = clamp(u_vel * 18.0, -1.0, 1.0);
  v = mix(v, nv, k * 0.7);
  s = max(s, k);
  o = vec4(v * 0.5 + 0.5, s, 1.0);
}`;
