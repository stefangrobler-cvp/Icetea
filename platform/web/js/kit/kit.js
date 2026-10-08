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
import { pads } from './pads.js';
import { pointer } from './pointer.js';

const CONTROLS = { swipe, aim, tap, tilt, pads, pointer };

/**
 * Build a layout (one or two controls side by side, plus small buttons in a row
 * underneath) inside `container`.
 * ctx = { send(controlId, value, reliable?), values: {} }   (values persist between layouts)
 */
export function mountLayout(container, controls, params, ctx) {
  container.replaceChildren();
  // Tilt rails and sideways swipe pads are wide: stack the controls instead of side by side.
  const wide = (c) => c.control === 'tilt' || (c.control === 'swipe' && c.direction === 'horizontal');
  const small = controls.filter((c) => c.size === 'small');
  const main = controls.filter((c) => c.size !== 'small');
  container.className = main.length > 1 && main.some(wide) ? 'zones stacked' : 'zones';
  // Small buttons go in a row under the main control(s).
  let mainArea = container;
  let row = null;
  if (small.length) {
    container.className = 'zones stacked with-row';
    mainArea = document.createElement('div');
    mainArea.className = main.length > 1 && main.some(wide) ? 'zones-main stacked' : 'zones-main';
    row = document.createElement('div');
    row.className = 'zones-row';
    container.append(mainArea, row);
  }
  const parts = controls.map((spec) => {
    const make = CONTROLS[spec.control];
    const el = document.createElement('div');
    (spec.size === 'small' ? row : mainArea).appendChild(el);
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
        if (target.classList.contains('pads-control')) {
          for (const pad of target.querySelectorAll('.pad')) {
            pad.classList.remove('buzz');
            void pad.offsetWidth;
            pad.classList.add('buzz');
          }
          continue;
        }
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
