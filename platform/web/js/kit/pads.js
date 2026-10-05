// Controller kit: coloured pads.
//
// One agreed look and feel in every game: 2 to 4 big pads in fixed colours
// (cyan, pink, yellow, green, in that order), side by side for 2, a 2 x 2 grid
// for 4. Each lights up while pressed. The same colours appear on the big screen,
// so "tap the colour you see" works for children who can't read.
//
// Setting: pads (2-4, default 4).
// Layout params: { ready, icons: [emoji per pad], lit: index of a pad to light up }
// Sends { pad, down: true } when pressed and { pad, down: false } when let go, reliably.

export const PAD_COLORS = ['#00f0ff', '#ff2bd6', '#ffe600', '#39ff7a'];

export function pads(el, spec, ctx, params = {}) {
  const count = Math.max(2, Math.min(4, Number(spec.pads) || 4));
  el.className = `pads-control pads-${count}`;
  el.innerHTML = Array.from({ length: count }, (_, i) =>
    `<div class="pad" data-pad="${i}" style="--pad:${PAD_COLORS[i]}"><span></span></div>`).join('');
  const padEls = [...el.querySelectorAll('.pad')];

  let p = params;
  const held = new Map(); // touch id -> pad index

  function show() {
    el.classList.toggle('waiting', p.ready === false);
    padEls.forEach((pad, i) => {
      pad.querySelector('span').textContent = p.icons?.[i] || spec.label || '';
      pad.classList.toggle('lit', p.lit === i);
    });
  }

  function press(i) {
    if (p.ready === false) return;
    padEls[i].classList.add('pressed');
    ctx.send(spec.id, { pad: i, down: true }, true);
  }
  function release(i) {
    padEls[i].classList.remove('pressed');
    if (p.ready === false) return;
    ctx.send(spec.id, { pad: i, down: false }, true);
  }

  const padAt = (x, y) => {
    const hit = document.elementFromPoint(x, y)?.closest('.pad');
    return hit && el.contains(hit) ? Number(hit.dataset.pad) : null;
  };
  const onStart = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const i = padAt(t.clientX, t.clientY);
      if (i === null) continue;
      held.set(t.identifier, i);
      press(i);
    }
  };
  const onEnd = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const i = held.get(t.identifier);
      held.delete(t.identifier);
      if (i !== undefined) release(i);
    }
  };
  el.addEventListener('touchstart', onStart, { passive: false });
  el.addEventListener('touchend', onEnd, { passive: false });
  el.addEventListener('touchcancel', onEnd, { passive: false });

  // Mouse support, handy for testing on a computer.
  let mousePad = null;
  const mdown = (e) => { mousePad = padAt(e.clientX, e.clientY); if (mousePad !== null) press(mousePad); };
  const mup = () => { if (mousePad !== null) release(mousePad); mousePad = null; };
  el.addEventListener('mousedown', mdown);
  window.addEventListener('mouseup', mup);

  show();
  return {
    update(next = {}) { p = next; show(); },
    destroy() { window.removeEventListener('mouseup', mup); },
  };
}
