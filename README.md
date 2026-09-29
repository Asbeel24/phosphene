# DASCA · Signal Lab

A browser-side lab for breaking images, video and webcam feeds. Everything runs on the GPU (WebGL2) in the page: nothing is uploaded anywhere.

## What's inside

- **Sources**: built-in animated test signal, image or video files (drag and drop), webcam. Processing resolution 540p to 1440p. DONOR loads a second image or video for motion transplant.
- **Effect chain**: stack any number of layers, reorder by dragging or with the arrows, bypass, duplicate, randomize a single layer.
- **24 effects**
  - Time / motion (these keep memory of previous frames): Datamosh (a per-frame optical-flow field drags the previous output forward; classic, transplant and bloom modes, motion carry, auto cuts, and maps that confine the mosh to highlights, shadows, a radial or angled gradient, or painted areas), Pixel Sort (GPU odd-even sort that advances a little every frame, so the image melts), Ghost (a time field over a 64-frame buffer: gradient, radial, point, noise, luminance or painted fields drive slit-scan, trails, freezes and directional smears, with stretch and depth warp), Echo Tunnel (video feedback), Mosh Brush (drag on the canvas to tear pixels along your stroke).
  - Glitch: RGB Split, Block Crash (some blocks pulled from older frames).
  - Analog: CRT (grille / shadow / slot masks, misconvergence), Composite (NTSC chroma smear, ringing, dot crawl), Tape Deck (wobble, head-switching tear, dropouts, chroma delay), Phosphor (persistence and halation), Interlace, VHS.
  - Stylize: Dither (Bayer, 1-bit / Game Boy / CGA / acid palettes), ASCII, Halftone (mono / CMY / RGB screens), Pixelate / LED, Edge Glow.
  - Space: Liquid (domain-warped noise), Kaleido, Mirror Tile.
  - Color: Thermal Map, Color Crush.
- **Modulation**: every parameter has a ∿ button. Drive it with sine / triangle / saw / square LFOs, random sample and hold, smooth drift, the microphone (level, bass, treble), the loaded clip's own soundtrack, or the mouse position.
- **A|B compare**: press C (or A|B) and drag on the image to split the original and the processed signal.
- **CHAOS**: one key builds a random chain with random modulation. KICK forces a keyframe and resets all feedback.
- **Export**: PNG snapshot, 3 second GIF, live recording (MP4 where the browser can encode it, otherwise WebM), and RENDER CLIP, which re-plays a loaded video from the start and records the full processed clip.
- **Share**: SHARE copies a link whose URL contains the whole chain, parameters and modulation included.

Shortcuts: `Space` pause · `D` chaos · `K` kick · `S` PNG · `G` GIF · `R` record.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Deploy

It is a static Vite site. On Vercel, import the repository; the Vite preset is detected automatically (build `npm run build`, output `dist`).

## Adding an effect

Effects live in `src/effects.js`. Each one is a fragment shader body plus a list of parameters; `src/glsl.js` holds the shared prelude (samplers for the chain input, the source, the layer's own history, the brush field, the glyph atlas and the frame ring, plus noise and color helpers). Set `feedback: true` to get `u_hist`, and `iter: '<param>'` to run the pass several times per frame.
