// Controller kit: tilt.
//
// One agreed look and feel in every game: a glowing rail with a puck that slides
// the way the phone is tilted (left / right, holding the phone upright).
// iPhones need permission first, so the rail starts as a "📲 Tap to tilt" button.
// Phones without a motion sensor (or where it was refused) get the same rail to
// drag with a finger instead: we use what the device has.
//
// Setting: mode 'slide' skips the motion sensor: always a big rail to slide a thumb
// along (anywhere on the control), where the thumb's place is the value.
// On its own in a layout, the control fills the phone with a big rail, and the puck
// shows the player's animal (unless the spec has a label).
//
// Sends a number from -1 (tilted left) to 1 (tilted right).

import { pix } from '../pixels.js';

const FULL_TILT_DEG = 20; // tilting this far gives the full value
const SEND_EVERY_MS = 40;
let granted = false; // iPhone permission, asked once per visit

export function tilt(el, spec, ctx) {
  const slide = spec.mode === 'slide';
  el.className = slide ? 'tilt-control tilt-slide' : 'tilt-control';
  el.innerHTML = `
    <div class="tilt-rail"><div class="tilt-puck"></div></div>
    <button class="tilt-ask hidden">📲 Tap to tilt</button>`;
  const rail = el.querySelector('.tilt-rail');
  const puck = el.querySelector('.tilt-puck');
  const ask = el.querySelector('.tilt-ask');
  const me = ctx.me?.() || {};
  if (spec.label) puck.textContent = spec.label;
  else if (me.avatar) puck.innerHTML = pix(me.avatar, 'pix');

  if (ctx.values[spec.id] === undefined) ctx.values[spec.id] = 0;
  let lastSent = 0;
  let sensor = false;
  let fallbackTimer = 0;

  function set(v, force = false) {
    v = Math.max(-1, Math.min(1, Math.round(v * 100) / 100));
    const changed = v !== ctx.values[spec.id];
    ctx.values[spec.id] = v;
    puck.style.left = `${50 + v * 42}%`;
    const now = performance.now();
    if ((changed && now - lastSent > SEND_EVERY_MS) || force) {
      lastSent = now;
      ctx.send(spec.id, v);
    }
  }

  // Motion sensor: left / right tilt, whichever way round the phone is held.
  function onOrient(e) {
    if (e.gamma == null) return;
    sensor = true;
    clearTimeout(fallbackTimer);
    el.classList.remove('drag');
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    let deg = e.gamma;
    if (angle === 90) deg = e.beta;
    else if (angle === -90 || angle === 270) deg = -e.beta;
    set(deg / FULL_TILT_DEG);
  }

  function listen() {
    window.addEventListener('deviceorientation', onOrient);
    // No readings soon after: no sensor here, so drag the rail instead.
    fallbackTimer = setTimeout(() => { if (!sensor) useDrag(); }, 1200);
  }

  function useDrag() {
    ask.classList.add('hidden');
    rail.classList.remove('hidden');
    el.classList.add('drag');
  }

  const needsPermission = typeof DeviceOrientationEvent !== 'undefined'
    && typeof DeviceOrientationEvent.requestPermission === 'function';
  if (slide) {
    useDrag();
  } else if (needsPermission && !granted) {
    rail.classList.add('hidden');
    ask.classList.remove('hidden');
    ask.addEventListener('click', async () => {
      let ok = false;
      try { ok = (await DeviceOrientationEvent.requestPermission()) === 'granted'; } catch { ok = false; }
      ask.classList.add('hidden');
      rail.classList.remove('hidden');
      granted = ok;
      if (ok) listen(); else useDrag();
    });
  } else if (typeof DeviceOrientationEvent !== 'undefined') {
    listen();
  } else {
    useDrag();
  }

  // Drag fallback: finger position along the rail.
  const dragTo = (x) => {
    if (sensor) return;
    const box = rail.getBoundingClientRect();
    set(((x - box.left) / box.width) * 2 - 1);
  };
  const tstart = (e) => { e.preventDefault(); dragTo(e.changedTouches[0].clientX); };
  const tmove = (e) => { e.preventDefault(); dragTo(e.changedTouches[0].clientX); };
  const area = slide ? el : rail; // slide: a thumb anywhere on the control counts
  area.addEventListener('touchstart', tstart, { passive: false });
  area.addEventListener('touchmove', tmove, { passive: false });
  let mouse = false;
  const mdown = (e) => { mouse = true; dragTo(e.clientX); };
  const mmove = (e) => { if (mouse) dragTo(e.clientX); };
  const mup = () => { mouse = false; };
  area.addEventListener('mousedown', mdown);
  window.addEventListener('mousemove', mmove);
  window.addEventListener('mouseup', mup);

  set(ctx.values[spec.id], true);
  return {
    update() {},
    destroy() {
      clearTimeout(fallbackTimer);
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('mousemove', mmove);
      window.removeEventListener('mouseup', mup);
    },
  };
}
