// Procedural test signal shown before the user loads anything, so the chain always has motion to chew on.

export function makeDemo(w = 1280, h = 720) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');

  function draw(t) {
    const g = x.createLinearGradient(0, 0, w, h);
    const hue = (t * 12) % 360;
    g.addColorStop(0, `hsl(${hue}, 80%, 8%)`);
    g.addColorStop(0.5, `hsl(${(hue + 60) % 360}, 90%, 35%)`);
    g.addColorStop(1, `hsl(${(hue + 180) % 360}, 90%, 12%)`);
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);

    // perspective floor grid
    x.strokeStyle = 'rgba(198,255,0,0.35)';
    x.lineWidth = 2;
    const hz = h * 0.58;
    for (let i = -16; i <= 16; i++) {
      x.beginPath(); x.moveTo(w / 2 + i * 12, hz); x.lineTo(w / 2 + i * 160, h); x.stroke();
    }
    for (let j = 0; j < 14; j++) {
      const k = ((j + (t * 1.5) % 1) / 14) ** 2.2;
      const y = hz + (h - hz) * k;
      x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke();
    }

    // sun with bands
    const sx = w * 0.5, sy = h * 0.42, sr = h * 0.26;
    const sg = x.createLinearGradient(0, sy - sr, 0, sy + sr);
    sg.addColorStop(0, '#fff45c'); sg.addColorStop(1, '#ff2bd6');
    x.save();
    x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2); x.clip();
    x.fillStyle = sg; x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    x.fillStyle = 'rgba(0,0,0,0.9)';
    for (let i = 0; i < 8; i++) {
      const by = sy + i * sr * 0.14 + ((t * 20) % (sr * 0.14));
      x.fillRect(sx - sr, by, sr * 2, 3 + i * 1.6);
    }
    x.restore();

    // orbiting shapes
    for (let i = 0; i < 7; i++) {
      const a = t * (0.4 + i * 0.13) + i;
      const px = w / 2 + Math.cos(a) * w * 0.34, py = h * 0.45 + Math.sin(a * 1.3) * h * 0.3;
      x.save();
      x.translate(px, py); x.rotate(a * 2);
      x.fillStyle = i % 2 ? '#00e5ff' : '#c6ff00';
      x.globalAlpha = 0.9;
      const s = 30 + i * 8;
      if (i % 3 === 0) x.fillRect(-s / 2, -s / 2, s, s);
      else { x.beginPath(); x.moveTo(0, -s); x.lineTo(s * 0.86, s / 2); x.lineTo(-s * 0.86, s / 2); x.fill(); }
      x.restore();
    }

    // wordmark
    x.save();
    x.font = `900 ${h * 0.2}px "Syne", system-ui, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#fff';
    x.fillText('DASCA', w / 2 + Math.sin(t * 2) * 12, h * 0.8);
    x.font = `500 ${h * 0.03}px "JetBrains Mono", monospace`;
    x.fillStyle = 'rgba(255,255,255,0.8)';
    x.fillText('DROP AN IMAGE OR VIDEO · OR TURN ON THE CAMERA', w / 2, h * 0.93);
    x.restore();
  }

  return { canvas: c, draw };
}
