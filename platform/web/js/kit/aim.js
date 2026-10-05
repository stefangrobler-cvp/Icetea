// Controller kit: the aiming circle.
//
// One agreed look and feel in every game: a big circle with the emoji label in the
// middle. Touch it, slide round to aim (an arrow follows), let go to fire. Directions
// steeper than `maxAngle` are shaded and blocked. A marker shows the target side.
//
// Layout params: { target: 'left' | 'right', targetIcon, ready, seconds, maxAngle }
// Sends { angle } while aiming and { angle, release: true } when let go
// (radians: 0 = right, down is positive).

const DEG = Math.PI / 180;

export function aim(el, spec, ctx, params = {}) {
  el.className = 'aim-control';
  el.innerHTML = `
    <p class="medium neon dial-title" style="color: var(--me)"></p>
    <div class="dial">
      <div class="goal-mark"></div>
      <div class="dial-arrow hidden"></div>
      <div class="dial-ball"></div>
    </div>
    <p class="small dial-hint"></p>`;
  const title = el.querySelector('.dial-title');
  const dial = el.querySelector('.dial');
  const mark = el.querySelector('.goal-mark');
  const arrow = el.querySelector('.dial-arrow');
  const hint = el.querySelector('.dial-hint');
  el.querySelector('.dial-ball').textContent = spec.label || '🎯';

  let p = params;
  let aiming = false;
  let angle = 0;
  let lastSent = 0;
  const forward = () => (p.target === 'left' ? -1 : 1);

  function show() {
    title.textContent = p.ready === false ? 'Get ready…' : 'Your turn! 🎯';
    hint.textContent = p.ready === false ? '' : `Touch the circle, slide round, let go!${p.seconds ? ` (${p.seconds})` : ''}`;
    dial.classList.toggle('waiting', p.ready === false);
    mark.className = `goal-mark ${p.target === 'left' ? 'left' : 'right'}`;
    mark.textContent = p.targetIcon || '🎯';
    // Bright where you can aim, dark wedges straight up and down where you can't.
    const max = Math.max(10, Math.min(89, p.maxAngle || 89));
    const a1 = 90 - max;
    const a2 = 90 + max;
    dial.style.background = `conic-gradient(
      rgba(0,0,0,0.55) 0deg ${a1}deg, rgba(47,224,122,0.22) ${a1}deg ${a2}deg,
      rgba(0,0,0,0.55) ${a2}deg ${360 - a2}deg, rgba(47,224,122,0.12) ${360 - a2}deg ${360 - a1}deg,
      rgba(0,0,0,0.55) ${360 - a1}deg 360deg)`;
  }

  // Keep the aim within maxAngle of flat, on whichever side the finger is.
  function limit(a) {
    const max = (p.maxAngle || 89) * DEG;
    const dx = Math.cos(a);
    const dir = Math.sign(dx) || forward();
    const up = Math.max(-max, Math.min(max, Math.atan2(Math.sin(a), Math.abs(dx))));
    return Math.atan2(Math.sin(up), Math.cos(up) * dir);
  }

  function aimAt(x, y) {
    const box = dial.getBoundingClientRect();
    const dx = x - (box.left + box.width / 2);
    const dy = y - (box.top + box.height / 2);
    if (Math.hypot(dx, dy) < box.width * 0.12) return; // right in the middle: no clear direction yet
    aiming = true;
    angle = limit(Math.atan2(dy, dx));
    arrow.classList.remove('hidden');
    arrow.style.transform = `rotate(${angle}rad)`;
    const now = performance.now();
    if (now - lastSent > 50) {
      lastSent = now;
      ctx.send(spec.id, { angle });
    }
  }

  function letGo() {
    if (!aiming) return;
    aiming = false;
    arrow.classList.add('hidden');
    if (p.ready !== false) ctx.send(spec.id, { angle, release: true }, true); // must arrive: send reliably
  }

  const start = (e) => { e.preventDefault(); const t = e.changedTouches[0]; aimAt(t.clientX, t.clientY); };
  const move = (e) => { e.preventDefault(); const t = e.changedTouches[0]; aimAt(t.clientX, t.clientY); };
  const end = (e) => { e.preventDefault(); letGo(); };
  const cancel = () => { aiming = false; arrow.classList.add('hidden'); };
  dial.addEventListener('touchstart', start, { passive: false });
  dial.addEventListener('touchmove', move, { passive: false });
  dial.addEventListener('touchend', end);
  dial.addEventListener('touchcancel', cancel);

  let down = false;
  const mdown = (e) => { down = true; aimAt(e.clientX, e.clientY); };
  const mmove = (e) => { if (down) aimAt(e.clientX, e.clientY); };
  const mup = () => { if (down) { down = false; letGo(); } };
  dial.addEventListener('mousedown', mdown);
  window.addEventListener('mousemove', mmove);
  window.addEventListener('mouseup', mup);

  show();
  return {
    update(next = {}) { p = next; show(); },
    destroy() {
      window.removeEventListener('mousemove', mmove);
      window.removeEventListener('mouseup', mup);
    },
  };
}
