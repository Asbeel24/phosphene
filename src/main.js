import { Engine } from './engine.js';
import { EFFECTS, BY_ID, CATS, defaults } from './effects.js';
import { Modulator, SOURCES } from './mod.js';
import { PRESETS } from './presets.js';
import { makeDemo } from './demo.js';
import { saveBlob, Recorder, captureGif } from './export.js';

const $ = (s) => document.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c);
  return el;
};

// ───────────────────────────── state
const canvas = $('#view');
let engine;
try {
  engine = new Engine(canvas);
} catch (e) {
  document.body.innerHTML = `<div class="fatal">DASCA needs WebGL2.<br><small>${e.message}</small></div>`;
  throw e;
}
const mod = new Modulator();
const demo = makeDemo();
const state = {
  layers: [],
  src: 'demo',
  el: demo.canvas,
  staticDirty: false,
  paused: false,
  kick: false,
  res: 720,
  t: 0,
};
let uidSeq = 1;

function log(msg) {
  $('#log').textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
}

// ───────────────────────────── layers
function makeLayer(type, params = {}, mods = {}) {
  const p = { ...defaults(type), ...params };
  const m = {};
  for (const [k, v] of Object.entries(mods)) m[k] = { src: v[0], rate: v[1], depth: v[2] };
  return { uid: uidSeq++, type, on: true, open: true, params: p, mods: m, live: { ...p }, phase: Math.random() };
}

function addLayer(type, params, mods, at) {
  try {
    engine.effectProgram(type);
  } catch (e) {
    console.error(e);
    log(`shader error in ${type}: ${e.message.slice(0, 120)}`);
    return;
  }
  const L = makeLayer(type, params, mods);
  if (at === undefined) state.layers.push(L);
  else state.layers.splice(at, 0, L);
  renderStack();
  return L;
}

function loadChain(chain, name) {
  state.layers = [];
  for (const [t, p, m] of chain) addLayer(t, p, m);
  state.kick = true;
  renderStack();
  if (name) log(`preset · ${name}`);
}

// ───────────────────────────── library + presets UI
function renderLibrary() {
  const lib = $('#library');
  for (const [cat, label] of CATS) {
    lib.append(h('div', { class: 'cat' }, label));
    for (const fx of EFFECTS.filter((e) => e.cat === cat)) {
      lib.append(h('button', { class: `fx c-${cat}`, title: fx.tag, onclick: () => { addLayer(fx.id); log(`+ ${fx.name}`); } },
        h('span', {}, fx.name), fx.feedback ? h('i', { title: 'feedback' }, '↺') : null));
    }
  }
  const pr = $('#presets');
  for (const P of PRESETS) pr.append(h('button', { class: 'preset', onclick: () => loadChain(P.chain, P.name) }, P.name));
}

// ───────────────────────────── chain UI
const liveBars = [];
let dragFrom = -1;

function renderStack() {
  const root = $('#stack');
  root.innerHTML = '';
  liveBars.length = 0;
  $('#empty').style.display = state.layers.length ? 'none' : '';
  $('#count').textContent = state.layers.length ? `${state.layers.length} layer${state.layers.length > 1 ? 's' : ''}` : '';
  state.layers.forEach((L, i) => root.append(card(L, i)));
  engine.prune(new Set(state.layers.map((l) => l.uid)));
}

function card(L, i) {
  const fx = BY_ID[L.type];
  const move = (d) => {
    const j = i + d;
    if (j < 0 || j >= state.layers.length) return;
    const [x] = state.layers.splice(i, 1);
    state.layers.splice(j, 0, x);
    renderStack();
  };
  const head = h('div', { class: 'card-h', draggable: 'true',
    ondragstart: (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } },
    h('span', { class: 'idx' }, String(i + 1).padStart(2, '0')),
    h('button', { class: `tog ${L.on ? 'on' : ''}`, title: 'bypass', onclick: () => { L.on = !L.on; renderStack(); } }, L.on ? 'ON' : 'OFF'),
    h('span', { class: `name c-${fx.cat}`, onclick: () => { L.open = !L.open; renderStack(); } }, fx.name, fx.feedback ? ' ↺' : ''),
    h('button', { class: 'mini', title: 'up', onclick: () => move(-1) }, '↑'),
    h('button', { class: 'mini', title: 'down', onclick: () => move(1) }, '↓'),
    h('button', { class: 'mini', title: 'randomize this layer', onclick: () => { randomizeLayer(L, 0.8); renderStack(); } }, '⚄'),
    h('button', { class: 'mini', title: 'duplicate', onclick: () => { addLayer(L.type, { ...L.params }, Object.fromEntries(Object.entries(L.mods).map(([k, m]) => [k, [m.src, m.rate, m.depth]])), i + 1); } }, '⧉'),
    h('button', { class: 'mini x', title: 'remove', onclick: () => { state.layers.splice(i, 1); renderStack(); } }, '×'),
  );
  const el = h('div', { class: `card ${L.on ? '' : 'off'}`,
    ondragover: (e) => { e.preventDefault(); el.classList.add('over'); },
    ondragleave: () => el.classList.remove('over'),
    ondrop: (e) => {
      e.preventDefault();
      if (dragFrom < 0 || dragFrom === i) return;
      const [x] = state.layers.splice(dragFrom, 1);
      state.layers.splice(i, 0, x);
      dragFrom = -1;
      renderStack();
    } }, head);
  if (L.open) {
    el.append(h('div', { class: 'tag' }, fx.tag));
    for (const q of fx.params) el.append(paramRow(L, q));
  }
  return el;
}

const fmt = (q, v) => (q.opts ? q.opts[Math.round(v)] : q.s >= 1 ? String(Math.round(v)) : Math.abs(v) < 10 ? v.toFixed(3) : v.toFixed(1));

function paramRow(L, q) {
  const m = L.mods[q.k];
  const modded = m && m.src !== 'off' && m.depth > 0;
  const val = h('span', { class: 'val' }, fmt(q, L.params[q.k]));
  let control;
  if (q.opts) {
    control = h('div', { class: 'seg' }, q.opts.map((o, idx) =>
      h('button', { class: Math.round(L.params[q.k]) === idx ? 'on' : '', onclick: () => { L.params[q.k] = idx; renderStack(); } }, o)));
  } else {
    control = h('input', { type: 'range', min: q.min, max: q.max, step: q.s, value: L.params[q.k],
      oninput: (e) => { L.params[q.k] = parseFloat(e.target.value); val.textContent = fmt(q, L.params[q.k]); },
      ondblclick: () => { L.params[q.k] = q.v; renderStack(); } });
  }
  const bar = h('i', { class: 'live' });
  if (modded && !q.opts) liveBars.push({ L, q, bar, val });
  const modBtn = h('button', { class: `modb ${modded ? 'on' : ''}`, title: 'modulate', onclick: () => {
    L.mods[q.k] = L.mods[q.k] || { src: 'off', rate: 0.5, depth: 0.25 };
    L.mods[q.k].ui = !L.mods[q.k].ui;
    renderStack();
  } }, '∿');
  const row = h('div', { class: `prm ${modded ? 'modded' : ''} ${q.opts ? 'opt' : ''}` },
    h('label', {}, q.l), h('div', { class: 'ctl' }, control, modded ? bar : null), q.opts ? null : val, modBtn);
  if (!m || !m.ui) return row;
  const modRow = h('div', { class: 'modrow' },
    h('select', { onchange: (e) => { m.src = e.target.value; if (m.src === 'audio' || m.src === 'bass' || m.src === 'treble') ensureAudioHint(); renderStack(); } },
      SOURCES.map((s) => h('option', { value: s, selected: s === m.src ? 'selected' : null }, s))),
    h('label', {}, 'rate'),
    h('input', { type: 'range', min: 0.01, max: 8, step: 0.01, value: m.rate, oninput: (e) => { m.rate = parseFloat(e.target.value); } }),
    h('label', {}, 'depth'),
    h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: m.depth, oninput: (e) => { m.depth = parseFloat(e.target.value); } }),
  );
  return h('div', {}, row, modRow);
}

function ensureAudioHint() {
  if (!mod.analyser) log('audio source picked: turn on MIC (or CLIP AUDIO) to feed it');
}

function updateLive() {
  for (const { L, q, bar, val } of liveBars) {
    const v = L.live[q.k];
    bar.style.left = `${((v - q.min) / (q.max - q.min)) * 100}%`;
    val.textContent = fmt(q, v);
  }
}

// ───────────────────────────── chaos
const rand = (a, b) => a + Math.random() * (b - a);
function randomizeLayer(L, amt) {
  for (const q of BY_ID[L.type].params) {
    let v = q.v + (rand(q.min, q.max) - q.v) * amt;
    if (q.s >= 1) v = Math.round(v);
    L.params[q.k] = v;
    if (Math.random() < 0.18) {
      const srcs = ['sine', 'tri', 'saw', 'random', 'drift', ...(mod.analyser ? ['audio', 'bass', 'treble'] : [])];
      L.mods[q.k] = { src: srcs[Math.floor(Math.random() * srcs.length)], rate: rand(0.05, 1.5), depth: rand(0.05, 0.35) };
    } else delete L.mods[q.k];
  }
}

function chaos() {
  state.layers = [];
  const pool = [...EFFECTS];
  const n = 2 + Math.floor(Math.random() * 4);
  // tend to open with something temporal, it's where the good accidents happen
  if (Math.random() < 0.6) {
    const t = pool.filter((e) => e.cat === 'time' && e.id !== 'smear');
    const L = addLayer(t[Math.floor(Math.random() * t.length)].id);
    randomizeLayer(L, 0.6);
  }
  while (state.layers.length < n) {
    const fx = pool[Math.floor(Math.random() * pool.length)];
    if (fx.id === 'smear' || state.layers.some((l) => l.type === fx.id)) continue;
    const L = addLayer(fx.id);
    randomizeLayer(L, 0.55);
  }
  state.kick = true;
  renderStack();
  log(`chaos · ${state.layers.map((l) => BY_ID[l.type].name).join(' → ')}`);
}

// ───────────────────────────── sources
let camStream = null;
let clipAudioNode = null;

function stopCam() {
  if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; }
}

function fitSize(w, h) {
  const scale = Math.min(1, state.res / Math.min(w, h));
  return [Math.round(w * scale), Math.round(h * scale)];
}

function setSourceEl(el, kind, w, h) {
  state.el = el;
  state.src = kind;
  state.staticDirty = kind === 'image';
  const [cw, ch] = fitSize(w, h);
  engine.setSize(cw, ch);
  $('#dims').textContent = `${cw}×${ch}`;
  document.querySelectorAll('#sources [data-src]').forEach((b) => b.classList.toggle('on', b.dataset.src === kind));
  $('#btnRender').hidden = kind !== 'video';
  $('#btnClipAudio').hidden = kind !== 'video';
  layout();
}

function useDemo() {
  stopCam();
  setSourceEl(demo.canvas, 'demo', demo.canvas.width, demo.canvas.height);
}

async function useCam() {
  try {
    stopCam();
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    const v = h('video', { playsinline: '', muted: '' });
    v.muted = true;
    v.srcObject = camStream;
    await v.play();
    setSourceEl(v, 'cam', v.videoWidth, v.videoHeight);
    log('camera live');
  } catch (e) {
    log(`camera unavailable: ${e.message}`);
  }
}

let videoEl = null;
function loadFile(file) {
  if (!file) return;
  stopCam();
  const url = URL.createObjectURL(file);
  if (file.type.startsWith('video')) {
    videoEl = h('video', { playsinline: '', loop: '' });
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.src = url;
    videoEl.onloadedmetadata = () => {
      videoEl.play();
      setSourceEl(videoEl, 'video', videoEl.videoWidth, videoEl.videoHeight);
      clipAudioNode = null;
      log(`video · ${file.name} · ${videoEl.duration.toFixed(1)}s`);
    };
  } else {
    const img = new Image();
    img.onload = () => { setSourceEl(img, 'image', img.naturalWidth, img.naturalHeight); log(`image · ${file.name}`); };
    img.src = url;
  }
  state.kick = true;
}

// ───────────────────────────── stage layout + brush
function layout() {
  const st = $('#stage').getBoundingClientRect();
  const pad = 24;
  const k = Math.min((st.width - pad * 2) / engine.w, (st.height - pad * 2 - 28) / engine.h);
  canvas.style.width = `${Math.max(50, engine.w * k)}px`;
  canvas.style.height = `${Math.max(50, engine.h * k)}px`;
}
window.addEventListener('resize', layout);

let last = null;
function pointer(e) {
  const r = canvas.getBoundingClientRect();
  const u = (e.clientX - r.left) / r.width, v = 1 - (e.clientY - r.top) / r.height;
  if (last && engine.brushDown) engine.vel = [u - last[0], v - last[1]];
  last = [u, v];
  engine.mouse = [u, v];
  mod.mouse = [Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))];
}
canvas.addEventListener('pointermove', pointer);
let comparing = false, splitting = false;
function toggleCompare() {
  comparing = !comparing;
  engine.split = comparing ? 0.5 : -1;
  $('#btnCompare').classList.toggle('on', comparing);
  $('.hud .tip').textContent = comparing ? 'drag to move the before / after split' : 'drag on the image to mosh it';
}
canvas.addEventListener('pointermove', (e) => {
  if (!splitting) return;
  const r = canvas.getBoundingClientRect();
  engine.split = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
});
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (comparing) {
    splitting = true;
    const r = canvas.getBoundingClientRect();
    engine.split = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    return;
  }
  if (!state.layers.some((l) => l.type === 'smear' && l.on)) { addLayer('smear'); log('+ MOSH BRUSH (auto)'); }
  engine.brushDown = 1;
  last = null;
  pointer(e);
});
const up = () => { engine.brushDown = 0; splitting = false; };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
$('#brush').addEventListener('input', (e) => { engine.brushSize = parseFloat(e.target.value); });

// drag & drop files
const stage = $('#stage');
stage.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); stage.classList.add('dropping'); } });
stage.addEventListener('dragleave', () => stage.classList.remove('dropping'));
stage.addEventListener('drop', (e) => {
  stage.classList.remove('dropping');
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  loadFile(e.dataTransfer.files[0]);
});

// ───────────────────────────── export
const recorder = new Recorder(canvas);
function toggleRec() {
  if (recorder.active) {
    recorder.stop();
    $('#btnRec').classList.remove('live');
    $('#btnRec').textContent = '● REC';
  } else {
    const kind = recorder.start((blob, ext) => { if (!blob.size) { log('recording came back empty: this browser could not encode the canvas'); return; } saveBlob(blob, `dasca-${Date.now()}.${ext}`); log(`saved ${ext.toUpperCase()} · ${(blob.size / 1e6).toFixed(1)} MB`); });
    $('#btnRec').classList.add('live');
    $('#btnRec').textContent = '■ STOP';
    log(`recording ${kind}…`);
  }
}

function renderClip() {
  if (state.src !== 'video' || !videoEl || recorder.active) return;
  videoEl.pause();
  videoEl.loop = false;
  videoEl.currentTime = 0;
  state.kick = true;
  videoEl.onseeked = () => {
    videoEl.onseeked = null;
    toggleRec();
    videoEl.play();
    log(`rendering clip · ${videoEl.duration.toFixed(1)}s`);
  };
  videoEl.onended = () => {
    videoEl.onended = null;
    if (recorder.active) toggleRec();
    videoEl.loop = true;
    videoEl.play();
  };
}

function snap() {
  canvas.toBlob((b) => { saveBlob(b, `dasca-${Date.now()}.png`); log('saved PNG'); }, 'image/png');
}

let gifBusy = false;
async function gif() {
  if (gifBusy) return;
  gifBusy = true;
  $('#btnGif').classList.add('live');
  log('capturing GIF · 3s');
  try {
    const blob = await captureGif(canvas, { seconds: 3, fps: 15, maxW: 540, onProgress: (p) => { $('#btnGif').textContent = `GIF ${Math.round(p * 100)}%`; } });
    saveBlob(blob, `dasca-${Date.now()}.gif`);
    log(`saved GIF · ${(blob.size / 1e6).toFixed(1)} MB`);
  } catch (e) {
    log(`gif failed: ${e.message}`);
  }
  $('#btnGif').textContent = 'GIF';
  $('#btnGif').classList.remove('live');
  gifBusy = false;
}

// ───────────────────────────── share via URL hash
function encodeChain() {
  const data = state.layers.map((L) => {
    const mods = {};
    for (const [k, m] of Object.entries(L.mods)) if (m.src !== 'off' && m.depth > 0) mods[k] = [m.src, +m.rate.toFixed(3), +m.depth.toFixed(3)];
    const p = {};
    for (const [k, v] of Object.entries(L.params)) p[k] = +(+v).toFixed(4);
    return [L.type, p, mods, L.on ? 1 : 0];
  });
  return btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/=+$/, '');
}

function decodeChain(s) {
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(s))));
    return data.filter((d) => BY_ID[d[0]]);
  } catch { return null; }
}

async function share() {
  const url = `${location.origin}${location.pathname}#c=${encodeChain()}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); log('link copied: anyone opening it gets this exact chain'); }
  catch { log('link is in the address bar'); }
}

// ───────────────────────────── wiring
$('#btnFile').onclick = () => $('#file').click();
$('#file').onchange = (e) => loadFile(e.target.files[0]);
document.querySelector('[data-src="demo"]').onclick = useDemo;
document.querySelector('[data-src="cam"]').onclick = useCam;
$('#res').onchange = (e) => {
  state.res = parseInt(e.target.value, 10);
  const el = state.el;
  const w = el.videoWidth || el.naturalWidth || el.width, hh = el.videoHeight || el.naturalHeight || el.height;
  setSourceEl(el, state.src, w, hh);
};
$('#btnMic').onclick = async () => {
  try { await mod.enableMic(); $('#btnMic').classList.add('on'); log('mic on: pick audio / bass / treble on any ∿'); }
  catch (e) { log(`mic unavailable: ${e.message}`); }
};
$('#btnClipAudio').onclick = () => {
  if (!videoEl) return;
  try {
    if (!clipAudioNode) {
      mod.ctx = mod.ctx || new AudioContext();
      clipAudioNode = mod.ctx.createMediaElementSource(videoEl);
      clipAudioNode.connect(mod.ctx.destination);
    }
    videoEl.muted = false;
    mod.attach(clipAudioNode);
    mod.ctx.resume();
    $('#btnClipAudio').classList.add('on');
    log('clip audio drives modulation');
  } catch (e) { log(`clip audio failed: ${e.message}`); }
};
$('#btnDice').onclick = chaos;
$('#btnKick').onclick = () => { state.kick = true; };
$('#btnPause').onclick = () => togglePause();
$('#btnSnap').onclick = snap;
$('#btnGif').onclick = gif;
$('#btnRec').onclick = toggleRec;
$('#btnRender').onclick = renderClip;
$('#btnShare').onclick = share;
$('#btnCompare').onclick = () => toggleCompare();
$('#btnClear').onclick = () => { state.layers = []; renderStack(); };

function togglePause() {
  state.paused = !state.paused;
  $('#btnPause').classList.toggle('on', state.paused);
  if (videoEl && state.src === 'video') state.paused ? videoEl.pause() : videoEl.play();
}

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); togglePause(); }
  else if (k === 'd') chaos();
  else if (k === 'k') state.kick = true;
  else if (k === 's') snap();
  else if (k === 'r') toggleRec();
  else if (k === 'g') gif();
  else if (k === 'c') toggleCompare();
});

// ───────────────────────────── loop
let prev = performance.now(), fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { $('#fps').textContent = `${Math.round(fpsN / fpsAcc)} fps`; fpsAcc = 0; fpsN = 0; }
  if (state.paused) return;
  state.t += dt;
  mod.tick();

  const active = state.layers.filter((l) => l.on);
  for (const L of active) {
    for (const q of BY_ID[L.type].params) L.live[q.k] = mod.apply(q, L.params[q.k], L.mods[q.k], state.t, L.phase);
  }

  let upload = true;
  if (state.src === 'demo') demo.draw(state.t);
  else if (state.src === 'image') { upload = state.staticDirty; state.staticDirty = false; }
  else if (state.el.readyState < 2) upload = false;

  engine.render(active, { time: state.t, kick: state.kick, sourceEl: state.el, uploadSource: upload });
  state.kick = false;
  updateLive();
}

// ───────────────────────────── boot
renderLibrary();
const fromHash = location.hash.startsWith('#c=') ? decodeChain(location.hash.slice(3)) : null;
useDemo();
if (fromHash && fromHash.length) {
  for (const [t, p, m, on] of fromHash) { const L = addLayer(t, p, m); if (L && on === 0) L.on = false; }
  renderStack();
  log('chain loaded from link');
} else {
  loadChain(PRESETS.find((p) => p.name === 'Melt Signal').chain);
  log('ready. drop media, press D for chaos, drag on the image to mosh.');
}
requestAnimationFrame(frame);

// handy from the devtools console
window.dasca = { state, engine, addLayer, loadChain, chaos };
