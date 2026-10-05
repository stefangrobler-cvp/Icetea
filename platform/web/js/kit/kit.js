// The controller kit: the only controls a phone ever shows.
//
// A game's manifest lists layouts made of these controls; the phone builds them
// here. Games never run code on a phone. Each control has one agreed look and
// behaviour across every game, so players already know how to play.
//
// Add a control only when a game genuinely can't be built from these, and ask first.

import { swipe } from './swipe.js';
import { aim } from './aim.js';
import { tap } from './tap.js';
import { tilt } from './tilt.js';

const CONTROLS = { swipe, aim, tap, tilt };

/**
 * Build a layout (one or two controls side by side) inside `container`.
 * ctx = { send(controlId, value, reliable?), values: {} }   (values persist between layouts)
 */
export function mountLayout(container, controls, params, ctx) {
  container.replaceChildren();
  // Tilt is a slim rail: stack it above the other control instead of side by side.
  container.className = controls.some((c) => c.control === 'tilt') ? 'zones stacked' : 'zones';
  const parts = controls.map((spec) => {
    const make = CONTROLS[spec.control];
    const el = document.createElement('div');
    container.appendChild(el);
    if (!make) {
      el.textContent = `Unknown control: ${spec.control}`;
      return { el, update() {}, destroy() {} };
    }
    return { el, ...make(el, spec, ctx, params || {}) };
  });
  return {
    update(next) { for (const p of parts) p.update(next || {}); },
    /** Flash the controls (used where the phone can't vibrate). */
    flash() {
      for (const p of parts) {
        const target = p.el.querySelector('.dial') || p.el;
        if (target.classList.contains('tilt-control')) continue;
        target.classList.remove('buzz');
        void target.offsetWidth; // restart the animation
        target.classList.add('buzz');
      }
    },
    destroy() {
      for (const p of parts) p.destroy();
      container.replaceChildren();
    },
  };
}
