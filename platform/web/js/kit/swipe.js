// Controller kit: the swipe pad.
//
// One agreed look and feel in every game: a big area in the player's colour with
// arrow hints and an optional emoji label. Drag anywhere in it (relative, like a
// trackpad); it glows while touched and a small preview moves with the thumb.
// Up and down by default (sends 0 top .. 1 bottom); with direction 'horizontal',
// left and right (sends 0 left .. 1 right).

const GAIN = 0.7; // swiping this share of the screen height moves the full range
const SIDEWAYS_GAIN = 0.9; // sideways: the phone is narrow, so use nearly its full width

export function swipe(el, spec, ctx) {
  const sideways = spec.direction === 'horizontal';
  el.className = sideways ? 'zone horizontal' : 'zone';
  el.innerHTML = sideways
    ? '<div class="arrow">◀</div><div class="label"></div><div class="arrow">▶</div>'
    : '<div class="arrow">▲</div><div class="label"></div><div class="arrow">▼</div>';
  el.querySelector('.label').textContent = spec.label || '';
  const preview = document.createElement('div');
  preview.className = `preview${spec.look === 'rod' ? ' rod' : ''}`;
  preview.innerHTML = spec.look === 'rod' ? '<i></i><i></i><i></i>' : '<i></i>';
  el.appendChild(preview);

  if (ctx.values[spec.id] === undefined) ctx.values[spec.id] = 0.5;

  const show = () => {
    const v = ctx.values[spec.id] - 0.5;
    const span = spec.look === 'rod' ? 0.25 : 0.5;
    preview.style.transform = sideways
      ? `translate(-50%, -50%) translateX(${v * el.clientWidth * 0.8}px)`
      : `translate(-50%, -50%) translateY(${v * el.clientHeight * span}px)`;
  };
  const move = (d) => {
    const span = sideways ? window.innerWidth * SIDEWAYS_GAIN : window.innerHeight * GAIN;
    const v = Math.max(0, Math.min(1, ctx.values[spec.id] + d / span));
    if (v === ctx.values[spec.id]) return;
    ctx.values[spec.id] = v;
    ctx.send(spec.id, Math.round(v * 1000) / 1000);
    show();
  };
  const pos = (t) => (sideways ? t.clientX : t.clientY);

  const last = new Map(); // touch id -> last position
  const onStart = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) last.set(t.identifier, pos(t));
    el.classList.add('touching');
  };
  const onMove = (e) => {
    e.preventDefault();
    // A finger that started in this area keeps controlling it, even if it slides out.
    for (const t of e.changedTouches) {
      const prev = last.get(t.identifier);
      if (prev === undefined) continue;
      last.set(t.identifier, pos(t));
      move(pos(t) - prev);
    }
  };
  const onEnd = (e) => {
    for (const t of e.changedTouches) last.delete(t.identifier);
    if (last.size === 0) el.classList.remove('touching');
  };
  el.addEventListener('touchstart', onStart, { passive: false });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onEnd);
  el.addEventListener('touchcancel', onEnd);

  // Mouse support, handy for testing on a computer.
  let mouse = null;
  const down = (e) => { mouse = pos(e); };
  const up = () => { mouse = null; };
  const drag = (e) => { if (mouse !== null) { move(pos(e) - mouse); mouse = pos(e); } };
  el.addEventListener('mousedown', down);
  window.addEventListener('mouseup', up);
  window.addEventListener('mousemove', drag);

  requestAnimationFrame(show);
  ctx.send(spec.id, ctx.values[spec.id]);

  return {
    update() {},
    destroy() {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('mousemove', drag);
    },
  };
}
