// Curated starting chains. Format: [type, params, mods] where mods = { key: [source, rate, depth] }.

export const PRESETS = [
  { name: 'Melt Signal', chain: [
    ['datamosh', { amount: 2.2, drift: 0.35, key: 0.002 }],
    ['rgbshift', { amount: 0.008, mode: 2 }, { amount: ['bass', 1, 0.3] }],
    ['crt', { curve: 0.12 }],
  ] },
  { name: 'Sorted Sunset', chain: [
    ['pixelsort', { lo: 0.2, hi: 0.95, speed: 24, fresh: 0.04 }, { hi: ['sine', 0.1, 0.2] }],
    ['gradmap', { pal: 4, mix: 0.7 }],
    ['tone', { sat: 1.6, contrast: 1.2 }],
  ] },
  { name: 'Terminal Ghost', chain: [
    ['echo', { decay: 0.93, zoom: 0.01, spin: 0 }],
    ['ascii', { cell: 9, color: 1 }],
    ['crt', { mask: 0.6, glow: 0.6 }],
  ] },
  { name: 'Thermal Hunter', chain: [
    ['gradmap', { pal: 0 }],
    ['edge', { gain: 3, mix: 0.4, color: 1 }],
    ['blocks', { amount: 0.08, rate: 4 }],
    ['crt', { scan: 0.7, curve: 0.08 }],
  ] },
  { name: 'Paper Machine', chain: [
    ['tone', { contrast: 1.4, sat: 1.4 }],
    ['halftone', { size: 8, mode: 1 }, { angle: ['drift', 0.1, 0.3] }],
  ] },
  { name: 'Mandala Crash', chain: [
    ['kaleido', { seg: 8, spin: 0.15 }, { seg: ['random', 0.5, 0.3] }],
    ['blocks', { amount: 0.25, size: 24 }],
    ['echo', { decay: 0.85, zoom: -0.02, spin: 0.03, hue: 0.05, blend: 2 }],
  ] },
  { name: 'Time Worm', chain: [
    ['timeslice', { mode: 2, depth: 31 }],
    ['liquid', { amp: 0.04, freq: 2 }],
    ['dither', { pal: 3, scale: 3 }],
  ] },
  { name: 'Gameboy Tape', chain: [
    ['vhs', { jitter: 0.6, bleed: 0.8, track: 0.6 }],
    ['dither', { pal: 1, scale: 4, spread: 0.8 }],
  ] },
  { name: 'Bass Crusher', chain: [
    ['liquid', { amp: 0.02 }, { amp: ['bass', 1, 0.5] }],
    ['rgbshift', { amount: 0.02, mode: 1 }, { amount: ['audio', 1, 0.6] }],
    ['tone', { post: 5, sat: 2 }, { hue: ['saw', 0.05, 0.5] }],
    ['pixelate', { size: 6, shape: 1 }],
  ] },
];
