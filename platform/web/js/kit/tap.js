// Controller kit: the tap button.
//
// One agreed look and feel in every game: a giant button in the player's colour
// with a big icon in the middle. It lights up while pressed. Games use the press
// (drop a block, flip gravity) or the hold (keep moving while held down).
//
// Layout params: { ready, icon, text, recharge, look, landed, lost }
//   ready: false dims it (e.g. "not your turn")
//   icon: an emoji (shown as pixel art where the platform has one)
//   recharge: seconds; with ready: false, the button fills up over that time
//             (e.g. a dash that needs to recharge)
//   look: 'block' shows the player's own block (their colour and animal) hanging
//         on a wire, which drops when tapped. `landed` and `lost` are running
//         counts: when one goes up, the phone cheers (+1) or wobbles (oops).
// Sends { down: true } when pressed and { down: false } when let go, reliably.

import { pix } from '../pixels.js';

export function tap(el, spec, ctx, params = {}) {
  el.className = 'tap-control';
  el.innerHTML = `<div class="tap-fill"></div>
    <div class="tap-block-stage"><i class="tap-wire"></i><div class="tap-block"><i class="tap-cable"></i><span class="tap-face"></span></div></div>
    <div class="tap-icon"></div><div class="tap-text"></div><div class="tap-pop"></div>`;
  const fill = el.querySelector('.tap-fill');
  const icon = el.querySelector('.tap-icon');
  const text = el.querySelector('.tap-text');
  const block = el.querySelector('.tap-block');
  const face = el.querySelector('.tap-face');
  const pop = el.querySelector('.tap-pop');

  let p = params;
  let down = false;
  let shownIcon = null;
  let seen = { landed: params.landed || 0, lost: params.lost || 0 };

  function setIcon(value) {
    if (value === shownIcon) return;
    shownIcon = value;
    icon.innerHTML = pix(value, 'pix tap-pix');
  }

  function show() {
    const waiting = p.ready === false;
    const blockLook = p.look === 'block';
    el.classList.toggle('waiting', waiting);
    el.classList.toggle('block-look', blockLook);
    el.classList.toggle('my-turn', blockLook && !waiting);
    if (blockLook) {
      const me = ctx.me?.() || {};
      if (face.dataset.avatar !== me.avatar) { face.dataset.avatar = me.avatar || ''; face.innerHTML = me.avatar ? pix(me.avatar, 'pix') : ''; }
      // My turn: my block hangs, ready to drop. Someone else's: their animal and waiting dots.
      if (!waiting) block.classList.remove('dropped');
      setIcon(waiting ? (p.icon || '⏳') : '');
      text.textContent = waiting ? '' : 'TAP!';
      // A block of mine landed (cheer) or fell off (gentle wobble).
      const landed = p.landed || 0;
      const lost = p.lost || 0;
      if (landed > seen.landed) burst('+1', 'cheer');
      else if (lost > seen.lost) burst('oops', 'oops');
      seen = { landed, lost };
    } else {
      setIcon(p.icon || spec.label || '👆');
      text.textContent = p.text || '';
    }
    // Recharging: the fill rises from the bottom over `recharge` seconds.
    const charging = waiting && p.recharge > 0;
    el.classList.toggle('charging', charging);
    fill.style.animation = 'none';
    if (charging) {
      void fill.offsetWidth; // restart the animation
      fill.style.animation = `tap-charge ${p.recharge}s linear forwards`;
    }
  }

  function burst(label, kind) {
    pop.textContent = label;
    pop.className = `tap-pop ${kind}`;
    void pop.offsetWidth;
    pop.classList.add('go');
    if (kind === 'cheer') {
      for (let i = 0; i < 10; i++) {
        const b = document.createElement('i');
        b.className = 'tap-confetti';
        b.style.setProperty('--dx', `${(Math.random() * 2 - 1) * 140}px`);
        b.style.setProperty('--dy', `${-60 - Math.random() * 160}px`);
        b.style.setProperty('--r', `${Math.random() * 360}deg`);
        el.appendChild(b);
        setTimeout(() => b.remove(), 900);
      }
    }
  }

  function press() {
    if (down) return;
    down = true;
    el.classList.add('pressed');
    if (p.look === 'block' && p.ready !== false) {
      block.classList.remove('dropped');
      void block.offsetWidth;
      block.classList.add('dropped'); // whoosh: my block falls
    }
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
