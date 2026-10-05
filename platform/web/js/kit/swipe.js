// Controller kit: the swipe pad.
//
// One agreed look and feel in every game: a big area in the player's colour with
// ▲▼ hints and an optional emoji label. Drag up and down anywhere in it (relative,
// like a trackpad); it glows while touched and a small preview moves with the thumb.
// Sends a number from 0 (top) to 1 (bottom).

const GAIN = 0.7; // swiping this share of the screen height moves the full range

export function swipe(el, spec, ctx) {
  el.className = 'zone';
  el.innerHTML = `<div class="arrow">▲</div><div class="label"></div><div class="arrow">▼</div>`;
  el.querySelector('.label').textContent = spec.label || '';
  const preview = document.createElement('div');
  preview.className = `preview${spec.look === 'rod' ? ' rod' : ''}`;
  preview.innerHTML = spec.look === 'rod' ? '<i></i><i></i><i></i>' : '<i></i>';
  el.appendChild(preview);

  if (ctx.values[spec.id] === undefined) ctx.values[spec.id] = 0.5;

  const show = () => {
    const y = ctx.values[spec.id];
    preview.style.transform = `translate(-50%, -50%) translateY(${(y - 0.5) * el.clientHeight * (spec.look === 'rod' ? 0.25 : 0.5)}px)`;
  };
  const move = (dy) => {
    const v = Math.max(0, Math.min(1, ctx.values[spec.id] + dy / (window.innerHeight * GAIN)));
    if (v === ctx.values[spec.id]) return;
    ctx.values[spec.id] = v;
    ctx.send(spec.id, Math.round(v * 1000) / 1000);
    show();
  };

  const lastY = new Map(); // touch id -> last y
  const onStart = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) lastY.set(t.identifier, t.clientY);
    el.classList.add('touching');
  };
  const onMove = (e) => {
    e.preventDefault();
    // A finger that started in this area keeps controlling it, even if it slides out.
    for (const t of e.changedTouches) {
      const prev = lastY.get(t.identifier);
      if (prev === undefined) continue;
      lastY.set(t.identifier, t.clientY);
      move(t.clientY - prev);
    }
  };
  const onEnd = (e) => {
    for (const t of e.changedTouches) lastY.delete(t.identifier);
    if (lastY.size === 0) el.classList.remove('touching');
  };
  el.addEventListener('touchstart', onStart, { passive: false });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onEnd);
  el.addEventListener('touchcancel', onEnd);

  // Mouse support, handy for testing on a computer.
  let mouseY = null;
  const down = (e) => { mouseY = e.clientY; };
  const up = () => { mouseY = null; };
  const drag = (e) => { if (mouseY !== null) { move(e.clientY - mouseY); mouseY = e.clientY; } };
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
