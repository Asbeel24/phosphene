// Curated starting chains. Format: [type, params, mods] where mods = { key: [source, rate, depth] }.

export const PRESETS = [
  { name: 'Broadcast 1987', chain: [
    ['composite', { chroma: 0.7, ring: 0.4, crawl: 0.3 }],
    ['interlace', { shift: 1 }],
    ['crt', { mtype: 1, mask: 0.5, curve: 0.18, lines: 480 }],
  ] },
  { name: 'Trinitron Night', chain: [
    ['tone', { contrast: 1.25, sat: 1.3 }],
    ['phosphor', { persist: 0.8, halo: 0.9 }],
    ['crt', { mtype: 0, mask: 0.6, curve: 0.06, conv: 1.2, glow: 0.5 }],
  ] },
  { name: 'Dub Tape', chain: [
    ['tape', { wobble: 0.6, head: 0.8, drop: 0.5, delay: 0.7, age: 0.6 }, { wobble: ['drift', 0.3, 0.3] }],
    ['composite', { chroma: 0.9, sat: 0.8 }],
    ['vhs', { jitter: 0.4, noise: 0.3, track: 0.2 }],
  ] },
  { name: 'Arcade Cabinet', chain: [
    ['pixelate', { size: 4, gap: 0 }],
    ['phosphor', { persist: 0.5, halo: 1.3, radius: 8 }],
    ['crt', { mtype: 2, mask: 0.7, curve: 0.3, lines: 240, scan: 0.8 }],
  ] },
  { name: 'Security Cam', chain: [
    ['tone', { sat: 0, contrast: 1.4 }],
    ['tape', { wobble: 0.1, head: 0.3, soft: 0.7, age: 0.2 }],
    ['interlace', { rate: 0.5, shift: 2, dark: 0.2 }],
    ['crt', { mtype: 3, curve: 0.1, lines: 300, glow: 0.1 }],
  ] },
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
