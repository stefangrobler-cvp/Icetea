// Controller kit: pointer (touchpad).
//
// One agreed look and feel in every game: the whole area is a touchpad in the
// player's colour. Slide a finger to move your cursor on the big screen (like a
// laptop trackpad); a quick tap tags whatever is under it. A small dot shows where
// the cursor is. Optional 🔙 button in the corner.
//
// Layout params: { ready, back: true (show the 🔙 button) }
// Sends { x, y } (0..1 each, starting in the middle) while moving, and reliably
// { x, y, tap: true } for a tap and { back: true } for the 🔙 button.

const GAIN = 1.1; // sliding across the pad this many times its width moves edge to edge
const TAP_MS = 260;
const TAP_MOVE = 14; // a finger that moved more than this (px) was sliding, not tapping

export function pointer(el, spec, ctx, params = {}) {
  el.className = 'pointer-control';
  el.innerHTML = `
    <div class="pointer-dot"></div>
    <div class="pointer-hint">${spec.label || ''}</div>
    <button class="pointer-back hidden" aria-label="Back">🔙</button>`;
  const dot = el.querySelector('.pointer-dot');
  const backBtn = el.querySelector('.pointer-back');

  let p = params;
  // Each time this pad appears the cursor starts in the middle.
  ctx.values[spec.id] = { x: 0.5, y: 0.5 };
  const pos = ctx.values[spec.id];
  let lastSent = 0;

  function show() {
    el.classList.toggle('waiting', p.ready === false);
    backBtn.classList.toggle('hidden', !p.back);
    dot.style.left = `${pos.x * 100}%`;
    dot.style.top = `${pos.y * 100}%`;
  }

  function moveBy(dx, dy) {
    const box = el.getBoundingClientRect();
    pos.x = Math.max(0, Math.min(1, pos.x + dx / (box.width * GAIN)));
    pos.y = Math.max(0, Math.min(1, pos.y + dy / (box.height * GAIN)));
    show();
    const now = performance.now();
    if (now - lastSent > 30) {
      lastSent = now;
      ctx.send(spec.id, { x: round(pos.x), y: round(pos.y) });
    }
  }
  const round = (v) => Math.round(v * 1000) / 1000;

  function tap() {
    if (p.ready === false) return;
    el.classList.remove('tapped');
    void el.offsetWidth;
    el.classList.add('tapped');
    ctx.send(spec.id, { x: round(pos.x), y: round(pos.y), tap: true }, true);
  }

  // One finger drives the cursor; a short touch that hardly moved is a tap.
  let finger = null; // { id, x, y, startX, startY, at }
  const onStart = (e) => {
    if (e.target === backBtn) return;
    e.preventDefault();
    if (finger) return;
    const t = e.changedTouches[0];
    finger = { id: t.identifier, x: t.clientX, y: t.clientY, startX: t.clientX, startY: t.clientY, at: performance.now() };
    el.classList.add('touching');
  };
  const onMove = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (!finger || t.identifier !== finger.id) continue;
      moveBy(t.clientX - finger.x, t.clientY - finger.y);
      finger.x = t.clientX;
      finger.y = t.clientY;
    }
  };
  const onEnd = (e) => {
    for (const t of e.changedTouches) {
      if (!finger || t.identifier !== finger.id) continue;
      const still = Math.hypot(t.clientX - finger.startX, t.clientY - finger.startY) < TAP_MOVE;
      if (still && performance.now() - finger.at < TAP_MS) tap();
      finger = null;
      el.classList.remove('touching');
    }
  };
  el.addEventListener('touchstart', onStart, { passive: false });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onEnd);
  el.addEventListener('touchcancel', onEnd);

  const onBack = (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctx.send(spec.id, { back: true }, true);
  };
  backBtn.addEventListener('touchend', onBack);
  backBtn.addEventListener('click', onBack);

  // Mouse support, handy for testing on a computer: drag to move, click to tap.
  let mouse = null;
  const mdown = (e) => { if (e.target !== backBtn) mouse = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, at: performance.now() }; };
  const mmove = (e) => { if (!mouse) return; moveBy(e.clientX - mouse.x, e.clientY - mouse.y); mouse.x = e.clientX; mouse.y = e.clientY; };
  const mup = (e) => {
    if (!mouse) return;
    if (Math.hypot(e.clientX - mouse.startX, e.clientY - mouse.startY) < TAP_MOVE && performance.now() - mouse.at < TAP_MS) tap();
    mouse = null;
  };
  el.addEventListener('mousedown', mdown);
  window.addEventListener('mousemove', mmove);
  window.addEventListener('mouseup', mup);

  show();
  ctx.send(spec.id, { x: 0.5, y: 0.5 });
  return {
    update(next = {}) { p = next; show(); },
    destroy() {
      window.removeEventListener('mousemove', mmove);
      window.removeEventListener('mouseup', mup);
    },
  };
}
