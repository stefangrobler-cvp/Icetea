// Controller kit: the tap button.
//
// One agreed look and feel in every game: a giant button in the player's colour
// with a big emoji in the middle. It lights up while pressed. Games use the press
// (drop a block, flip gravity) or the hold (keep moving while held down).
//
// Layout params: { ready, icon, text, recharge }
//   ready: false dims it (e.g. "not your turn")
//   recharge: seconds; with ready: false, the button fills up over that time
//             (e.g. a dash that needs to recharge)
// Sends { down: true } when pressed and { down: false } when let go, reliably.

export function tap(el, spec, ctx, params = {}) {
  el.className = 'tap-control';
  el.innerHTML = '<div class="tap-fill"></div><div class="tap-icon"></div><div class="tap-text"></div>';
  const fill = el.querySelector('.tap-fill');
  const icon = el.querySelector('.tap-icon');
  const text = el.querySelector('.tap-text');

  let p = params;
  let down = false;

  function show() {
    const waiting = p.ready === false;
    el.classList.toggle('waiting', waiting);
    icon.textContent = p.icon || spec.label || '👆';
    text.textContent = p.text || '';
    // Recharging: the fill rises from the bottom over `recharge` seconds.
    const charging = waiting && p.recharge > 0;
    el.classList.toggle('charging', charging);
    fill.style.animation = 'none';
    if (charging) {
      void fill.offsetWidth; // restart the animation
      fill.style.animation = `tap-charge ${p.recharge}s linear forwards`;
    }
  }

  function press() {
    if (down) return;
    down = true;
    el.classList.add('pressed');
    ctx.values[spec.id] = true;
    ctx.send(spec.id, { down: true }, true);
  }
  function release() {
    if (!down) return;
    down = false;
    el.classList.remove('pressed');
    ctx.values[spec.id] = false;
    ctx.send(spec.id, { down: false }, true);
  }

  const fingers = new Set();
  const onStart = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) fingers.add(t.identifier);
    press();
  };
  const onEnd = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) fingers.delete(t.identifier);
    if (fingers.size === 0) release();
  };
  el.addEventListener('touchstart', onStart, { passive: false });
  el.addEventListener('touchend', onEnd, { passive: false });
  el.addEventListener('touchcancel', onEnd, { passive: false });

  // Mouse support, handy for testing on a computer.
  const mdown = () => press();
  const mup = () => release();
  el.addEventListener('mousedown', mdown);
  window.addEventListener('mouseup', mup);

  show();
  return {
    update(next = {}) { p = next; show(); },
    destroy() {
      if (down) release();
      window.removeEventListener('mouseup', mup);
    },
  };
}
