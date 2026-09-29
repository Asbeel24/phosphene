import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const MIMES = [
  ['video/mp4;codecs=avc1.640028', 'mp4'],
  ['video/mp4;codecs=avc1', 'mp4'],
  ['video/mp4', 'mp4'],
  ['video/webm;codecs=vp9', 'webm'],
  ['video/webm;codecs=vp8', 'webm'],
  ['video/webm', 'webm'],
];

export class Recorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
  }

  start(onDone) {
    const [mime, ext] = MIMES.find(([m]) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ['', 'webm'];
    const stream = this.canvas.captureStream(60);
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 20e6 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => onDone(new Blob(chunks, { type: mime || 'video/webm' }), ext);
    rec.start(250);
    this.rec = rec;
    this.active = true;
    return ext.toUpperCase();
  }

  stop() {
    if (!this.active) return;
    this.rec.stop();
    this.active = false;
  }
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

export async function captureGif(src, { seconds = 3, fps = 15, maxW = 540, onProgress }) {
  const scale = Math.min(1, maxW / src.width);
  const w = Math.round(src.width * scale), h = Math.round(src.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  const total = Math.round(seconds * fps);
  const frames = [];
  let t0 = performance.now(), next = 0;
  while (frames.length < total) {
    await nextFrame();
    const t = performance.now() - t0;
    if (t < next) continue;
    next += 1000 / fps;
    x.drawImage(src, 0, 0, w, h);
    frames.push(x.getImageData(0, 0, w, h).data);
    onProgress?.((frames.length / total) * 0.5);
  }
  const gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    const palette = quantize(frames[i], 256);
    gif.writeFrame(applyPalette(frames[i], palette), w, h, { palette, delay: Math.round(1000 / fps) });
    if (i % 4 === 0) { onProgress?.(0.5 + (i / frames.length) * 0.5); await nextFrame(); }
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
