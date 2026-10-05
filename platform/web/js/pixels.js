// Turns the platform's pixel art into crisp images for the menus (big screen and phones).
// An emoji with no pixel picture yet is shown as itself.

import { PALETTE, artFor, glyphs } from '/platform/shared/pixels.js';

const cache = new Map();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A data: URL picture of these rows (8 screen pixels per art pixel, scaled crisply by CSS). */
export function pixelURL(rows) {
  const key = rows.join('|');
  if (cache.has(key)) return cache.get(key);
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const s = 8;
  const canvas = document.createElement('canvas');
  canvas.width = w * s;
  canvas.height = h * s;
  const ctx = canvas.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || !PALETTE[ch]) return;
    ctx.fillStyle = PALETTE[ch];
    ctx.fillRect(x * s, y * s, s, s);
  }));
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** HTML for one emoji: its pixel picture if there is one, else the emoji itself. */
export function pix(emoji, cls = 'pix') {
  const rows = artFor(emoji);
  if (!rows) return `<span class="${cls} emoji">${esc(emoji)}</span>`;
  return `<img class="${cls}" src="${pixelURL(rows)}" alt="" draggable="false">`;
}

/** HTML for a row of emoji, e.g. a mode's '🧒🧒⚡🤖'. */
export function pixRow(text, cls = 'pix') {
  return `<span class="pix-row">${glyphs(text).filter((g) => g.trim()).map((g) => pix(g, cls)).join('')}</span>`;
}
