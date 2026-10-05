// The short looping demo on the welcome screen: two phones swiping, and the
// paddles on the big screen moving with them. Drawn by the platform itself
// (it doesn't run a game), so it's tiny and loads instantly.

export function startDemo(canvas, theme) {
  const ctx = canvas.getContext('2d');
  const W = 640;
  const H = 240;
  let raf = 0;
  let t0 = performance.now();

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || W;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round((w * H / W) * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // A phone with a thumb swiping; `pos` is 0 (top) .. 1 (bottom).
  function phone(x, color, pos) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    roundRect(x, 50, 78, 150, 14);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x + 34, 70, 10, 110);
    ctx.globalAlpha = 1;
    ctx.font = '30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👆', x + 39, 78 + pos * 94);
  }

  function frame(now) {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);

    // The ball bounces between the paddles; each paddle follows it a little late.
    const span = 270;
    const period = 1.6;
    const p = (t % (period * 2)) / period; // 0..2
    const bx = 185 + (p < 1 ? p : 2 - p) * span;
    const by = 130 + Math.sin(t * 2.3) * 55;
    const left = 130 + Math.sin(t * 2.3 - 0.4) * 50;
    const right = 130 + Math.sin(t * 2.3 + 0.4) * 50;

    // Big screen
    ctx.lineWidth = 4;
    ctx.strokeStyle = theme.line;
    ctx.shadowColor = theme.line;
    ctx.shadowBlur = 16;
    roundRect(160, 40, 320, 180, 16);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([8, 10]);
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(320, 50);
    ctx.lineTo(320, 210);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (const [x, y, color] of [[178, left, theme.seats[1]], [454, right, theme.seats[2]]]) {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      roundRect(x, y - 30, 8, 60, 4);
      ctx.fill();
    }
    ctx.fillStyle = theme.ball;
    ctx.shadowColor = theme.ball;
    ctx.beginPath();
    ctx.arc(bx, by, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Phones either side, thumbs moving with their paddles
    phone(30, theme.seats[1], (left - 80) / 100);
    phone(532, theme.seats[2], (right - 80) / 100);

    raf = requestAnimationFrame(frame);
  }

  size();
  window.addEventListener('resize', size);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', size);
  };
}
