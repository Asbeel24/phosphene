// Parameter modulation: LFOs, sample & hold, microphone bands, mouse.

export const SOURCES = ['off', 'sine', 'tri', 'saw', 'square', 'random', 'drift', 'audio', 'bass', 'treble', 'mouse x', 'mouse y'];

const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const smooth = (t) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return (rnd(i) * (1 - u) + rnd(i + 1) * u) * 2 - 1; };

export class Modulator {
  constructor() {
    this.audio = { level: 0, bass: 0, treble: 0 };
    this.mouse = [0.5, 0.5];
    this.analyser = null;
  }

  async enableMic() {
    if (this.analyser) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.attach(stream);
  }

  attach(streamOrNode) {
    const ctx = this.ctx || (this.ctx = new AudioContext());
    const src = streamOrNode instanceof MediaStream ? ctx.createMediaStreamSource(streamOrNode) : streamOrNode;
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.6;
    src.connect(an);
    this.analyser = an;
    this.bins = new Uint8Array(an.frequencyBinCount);
  }

  tick() {
    const an = this.analyser;
    if (!an) return;
    an.getByteFrequencyData(this.bins);
    const b = this.bins, n = b.length;
    let lo = 0, hi = 0, all = 0;
    for (let i = 0; i < n; i++) {
      const v = b[i] / 255;
      all += v;
      if (i < 12) lo += v;
      else if (i > n * 0.25) hi += v;
    }
    const A = this.audio;
    A.level = A.level * 0.5 + Math.min(1, (all / n) * 3) * 0.5;
    A.bass = A.bass * 0.5 + Math.min(1, (lo / 12) * 1.3) * 0.5;
    A.treble = A.treble * 0.5 + Math.min(1, (hi / (n * 0.75)) * 6) * 0.5;
  }

  // returns a value in [-1, 1] (bipolar LFOs) or [0, 1] (audio / mouse)
  sample(src, rate, t, phase = 0) {
    const x = t * rate + phase;
    switch (src) {
      case 'sine': return Math.sin(x * Math.PI * 2);
      case 'tri': return 1 - 4 * Math.abs(((x + 0.25) % 1) - 0.5);
      case 'saw': return (x % 1) * 2 - 1;
      case 'square': return x % 1 < 0.5 ? 1 : -1;
      case 'random': return rnd(Math.floor(x) + phase * 99) * 2 - 1;
      case 'drift': return smooth(x + phase * 13);
      case 'audio': return this.audio.level;
      case 'bass': return this.audio.bass;
      case 'treble': return this.audio.treble;
      case 'mouse x': return this.mouse[0];
      case 'mouse y': return this.mouse[1];
      default: return 0;
    }
  }

  apply(q, base, m, t, phase) {
    if (!m || m.src === 'off' || !m.depth) return base;
    const s = this.sample(m.src, m.rate, t, phase);
    let v = base + s * m.depth * (q.max - q.min);
    v = Math.min(q.max, Math.max(q.min, v));
    if (q.s >= 1) v = Math.round(v);
    return v;
  }
}
