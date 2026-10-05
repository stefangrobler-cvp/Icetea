// Draws Cyber Hunt on a <canvas>. Only reads engine state, never changes it.
// Neon city at night: dark blocks with lit windows, glowing signs, four coloured
// quarters; the things to find flicker with a "glitch"; each hunting player has
// a magnifying lens in their colour.

import { WORLD, CITY, QUAD_COLORS, ICON, BOOST, COLORS } from './config.js';
import { quarters } from './engine.js';

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  };
}

const FONT = 'Fredoka, "Avenir Next", system-ui, sans-serif';
// The things to find must look exactly right, so ask for the colour emoji fonts first.
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const TAU = Math.PI * 2;
const ZOOM = 1.9;
const SPRITE = 96; // emoji picture size (pixels) before scaling

// A small repeatable random generator, so the city looks the same every frame.
function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.players = {}; // seat -> { avatar, color }
    this.sprites = new Map(); // emoji -> { plain, cyan, pink }
    this.pops = []; // found / wrong effects
    this.time = 0;
    this.city = this.planCity();
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    document.fonts?.ready.then(() => this.sprites.clear());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const area = this.canvas.parentElement;
    const w = area?.clientWidth || window.innerWidth;
    const h = area?.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.w = w * dpr;
    this.h = h * dpr;
    this.scale = Math.min(this.w / WORLD.width, this.h / WORLD.height);
    this.ox = (this.w - WORLD.width * this.scale) / 2;
    this.oy = (this.h - WORLD.height * this.scale) / 2;
  }

  // Buildings and signs, planned once.
  planCity() {
    const r = seeded(7);
    const blocks = [];
    const signs = [];
    const step = 120;
    for (let x = CITY.left + 10; x < CITY.right - 60; x += step) {
      for (let y = CITY.top + 10; y < CITY.bottom - 60; y += step) {
        if (r() < 0.18) continue; // a little square
        const w = step - 30 - r() * 20;
        const h = step - 30 - r() * 20;
        const windows = [];
        for (let wx = 10; wx < w - 12; wx += 16) for (let wy = 10; wy < h - 12; wy += 16) if (r() < 0.3) windows.push([wx, wy, r()]);
        blocks.push({ x, y, w, h, windows, hue: QUAD_COLORS[Math.floor(r() * 4)] });
        if (r() < 0.22) signs.push({ x: x + r() * (w - 40), y: y + r() * (h - 20), w: 26 + r() * 40, h: 10 + r() * 8, color: ['#ff2bd6', '#00f0ff', '#ffe600', '#39ff7a', '#ff9f1c'][Math.floor(r() * 5)], speed: 1 + r() * 4, phase: r() * TAU });
      }
    }
    return { blocks, signs };
  }

  colorOf(seat) {
    return this.players[seat]?.color || '#ffffff';
  }

  sprite(icon) {
    let s = this.sprites.get(icon);
    if (s) return s;
    const make = () => {
      const c = document.createElement('canvas');
      c.width = SPRITE;
      c.height = SPRITE;
      return c;
    };
    const plain = make();
    const g = plain.getContext('2d');
    g.font = `${SPRITE * 0.8}px ${EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(icon, SPRITE / 2, SPRITE / 2 + 4);
    // Single-colour copies for the glitch's colour fringes.
    const tint = (color) => {
      const c = make();
      const t = c.getContext('2d');
      t.drawImage(plain, 0, 0);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = color;
      t.fillRect(0, 0, SPRITE, SPRITE);
      return c;
    };
    s = { plain, cyan: tint('#00f0ff'), pink: tint('#ff2bd6') };
    this.sprites.set(icon, s);
    return s;
  }

  handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'found') this.pops.push({ kind: 'found', x: ev.x, y: ev.y, t: 0, color: this.colorOf(ev.seat) });
      else if (ev.type === 'wrong') this.pops.push({ kind: 'wrong', x: ev.x, y: ev.y, t: 0 });
      else if (ev.type === 'miss') this.pops.push({ kind: 'miss', x: ev.x, y: ev.y, t: 0, color: this.colorOf(ev.seat) });
    }
  }

  draw(state, dt) {
    const { ctx } = this;
    this.time += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);

    const hunters = Object.values(state.players).filter((p) => p.mode === 'hunt');
    this.drawScene(state, hunters);
    for (const p of hunters) this.drawLens(state, p);
    this.drawPops(dt);
    this.drawHud(state);
    this.drawOverlay(state);
  }

  // The city and everything in it (also redrawn, magnified, inside each lens).
  drawScene(state, hunters, clip = null) {
    const { ctx } = this;
    ctx.save();
    if (clip) {
      ctx.beginPath();
      ctx.arc(clip.x, clip.y, clip.r, 0, TAU);
      ctx.clip();
      ctx.fillStyle = '#0a0620';
      ctx.fillRect(clip.x - clip.r, clip.y - clip.r, clip.r * 2, clip.r * 2);
    }
    this.drawCity(clip);
    this.drawQuarters(hunters);
    if (state.scan && state.phase !== 'countdown') this.drawScan(state);
    for (const t of state.things) {
      if (t.found) continue;
      if (clip && Math.hypot(t.x - clip.x, t.y - clip.y) > clip.r + ICON) continue;
      this.drawThing(t);
    }
    ctx.restore();
  }

  drawCity(clip) {
    const { ctx } = this;
    for (const b of this.city.blocks) {
      if (clip && (b.x > clip.x + clip.r || b.x + b.w < clip.x - clip.r || b.y > clip.y + clip.r || b.y + b.h < clip.y - clip.r)) continue;
      ctx.fillStyle = '#0d0a26';
      ctx.strokeStyle = `${b.hue}55`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffe9a8';
      for (const [wx, wy, k] of b.windows) {
        ctx.globalAlpha = 0.15 + 0.35 * k;
        ctx.fillRect(b.x + wx, b.y + wy, 6, 6);
      }
      ctx.globalAlpha = 1;
    }
    for (const s of this.city.signs) {
      ctx.globalAlpha = 0.45 + 0.4 * (Math.sin(this.time * s.speed + s.phase) > -0.3 ? 1 : 0.2);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, s.w, s.h);
    }
    ctx.globalAlpha = 1;
  }

  drawQuarters(hunters) {
    const { ctx } = this;
    quarters().forEach((q, i) => {
      const busy = hunters.some((p) => p.quad === i);
      ctx.strokeStyle = QUAD_COLORS[i];
      ctx.globalAlpha = busy ? 0.95 : 0.45;
      ctx.lineWidth = busy ? 6 : 3;
      ctx.beginPath();
      ctx.roundRect(q.x + 6, q.y + 6, q.w - 12, q.h - 12, 18);
      ctx.stroke();
      ctx.globalAlpha = busy ? 0.08 : 0.03;
      ctx.fillStyle = QUAD_COLORS[i];
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  drawScan(state) {
    const { ctx } = this;
    const share = 1 - state.scan.left / state.scan.total;
    const x = CITY.left + (CITY.right - CITY.left) * share;
    ctx.fillStyle = 'rgba(255, 40, 80, 0.10)';
    ctx.fillRect(CITY.left, CITY.top, x - CITY.left, CITY.bottom - CITY.top);
    ctx.strokeStyle = COLORS.cpu;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(this.time * 20);
    ctx.beginPath();
    ctx.moveTo(x, CITY.top);
    ctx.lineTo(x, CITY.bottom);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawThing(t) {
    const { ctx } = this;
    const s = this.sprite(t.icon);
    const size = ICON;
    const x = t.x - size / 2;
    const y = t.y - size / 2;
    if (!t.glitch) {
      ctx.drawImage(s.plain, x, y, size, size);
      return;
    }
    // Glitch: colour fringes that jump, and slices that slip sideways now and then.
    const tick = Math.floor(this.time * 12 + t.id * 3);
    const r = seeded(tick * 31 + t.id);
    const jump = r() < 0.35;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(s.cyan, x - 4 - (jump ? 4 : 0), y, size, size);
    ctx.drawImage(s.pink, x + 4 + (jump ? 4 : 0), y, size, size);
    ctx.globalAlpha = 1;
    const slices = 4;
    for (let i = 0; i < slices; i++) {
      const sy = (SPRITE / slices) * i;
      const shift = jump && r() < 0.5 ? (r() - 0.5) * 18 : 0;
      ctx.drawImage(s.plain, 0, sy, SPRITE, SPRITE / slices, x + shift, y + (size / slices) * i, size, size / slices);
    }
    // A scanline flicker.
    if (r() < 0.3) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x, y + r() * size, size, 2);
    }
  }

  drawLens(state, p) {
    const { ctx } = this;
    const color = this.colorOf(p.seat);
    const radius = BOOST.lens[p.boost] || BOOST.lens[0];
    // The magnified view: the scene again, scaled up around the cursor and clipped to a circle.
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, TAU);
    ctx.clip();
    ctx.translate(p.x, p.y);
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-p.x, -p.y);
    this.drawScene(state, [], { x: p.x, y: p.y, r: radius / ZOOM });
    ctx.restore();
    // The lens rim, the cross-hair and whose lens it is.
    ctx.save();
    ctx.globalAlpha = p.frozen > 0 ? 0.4 : 1;
    ctx.lineWidth = 14;
    ctx.strokeStyle = `${color}44`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - 14, p.y);
    ctx.lineTo(p.x + 14, p.y);
    ctx.moveTo(p.x, p.y - 14);
    ctx.lineTo(p.x, p.y + 14);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.font = `40px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const a = -Math.PI / 4;
    ctx.fillText(p.frozen > 0 ? '🥶' : (this.players[p.seat] || {}).avatar || '🙂', p.x + Math.cos(a) * (radius + 6), p.y + Math.sin(a) * (radius + 6));
    ctx.restore();
  }

  drawPops(dt) {
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.pops) {
      p.t += dt;
      const k = p.t / 0.9;
      ctx.globalAlpha = Math.max(0, 1 - k);
      if (p.kind === 'found') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 30 + k * 90, 0, TAU);
        ctx.stroke();
        ctx.font = `${60 + k * 30}px ${FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText('✨', p.x, p.y - k * 60);
      } else if (p.kind === 'wrong') {
        ctx.font = `70px ${FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText('❌', p.x, p.y);
      } else {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10 + k * 30, 0, TAU);
        ctx.stroke();
      }
    }
    this.pops = this.pops.filter((p) => p.t < 0.9);
    ctx.restore();
  }

  // Top bar: what to find (icon + dots), and the score or the scan's progress.
  drawHud(state) {
    const { ctx } = this;
    ctx.save();
    ctx.textBaseline = 'middle';
    if (state.target) {
      const glitches = state.things.filter((t) => t.glitch);
      const cardW = 150 + glitches.length * 46;
      const cx = WORLD.width / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = '#ffffff55';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(cx - cardW / 2, 22, cardW, 104, 30);
      ctx.fill();
      ctx.stroke();
      this.drawThing({ id: 0, glitch: true, icon: state.target, x: cx - cardW / 2 + 70, y: 74 });
      glitches.forEach((t, i) => {
        const x = cx - cardW / 2 + 140 + i * 46;
        ctx.fillStyle = t.found ? '#39ff7a' : 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.arc(x, 74, 15, 0, TAU);
        ctx.fill();
      });
    }
    if (state.mode === 'team') {
      // The computer's scan: 🤖 and how far it has got.
      const share = state.scan.left / state.scan.total;
      ctx.font = `52px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('🤖', 40, 74);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.roundRect(110, 64, 300, 20, 10);
      ctx.fill();
      ctx.fillStyle = share < 0.25 ? COLORS.cpu : '#7d8cff';
      ctx.beginPath();
      ctx.roundRect(110, 64, Math.max(20, 300 * share), 20, 10);
      ctx.fill();
      ctx.textAlign = 'right';
      ctx.font = `bold 44px ${FONT}`;
      ctx.fillStyle = '#39ff7a';
      ctx.fillText(`✨ ${state.found}`, WORLD.width - 40, 74);
    } else {
      const ps = Object.values(state.players).sort((a, b) => a.seat - b.seat);
      ps.forEach((p, i) => {
        const left = i % 2 === 0;
        const x = left ? 40 + Math.floor(i / 2) * 200 : WORLD.width - 40 - Math.floor(i / 2) * 200;
        ctx.textAlign = left ? 'left' : 'right';
        ctx.font = `bold 44px ${FONT}`;
        ctx.fillStyle = this.colorOf(p.seat);
        ctx.fillText(`${(this.players[p.seat] || {}).avatar || '🙂'} ${p.points}`, x, 74);
      });
    }
    ctx.restore();
  }

  drawOverlay(state) {
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = WORLD.width / 2;
    const cy = (CITY.top + CITY.bottom) / 2;
    if (state.phase === 'countdown') {
      const k = state.timer % 1;
      ctx.font = `bold ${Math.round(200 + 80 * k)}px ${FONT}`;
      ctx.fillStyle = COLORS.text;
      ctx.globalAlpha = 0.4 + 0.6 * k;
      ctx.fillText(String(Math.max(1, Math.ceil(state.timer))), cx, cy);
    } else if (state.phase === 'intro') {
      // "Find these!" card: the target, big and glitching, with 🔍.
      ctx.fillStyle = 'rgba(5,1,15,0.82)';
      ctx.fillRect(0, CITY.top, WORLD.width, CITY.bottom - CITY.top);
      const n = state.things.filter((t) => t.glitch).length;
      ctx.save();
      ctx.translate(cx, cy - 30);
      ctx.scale(3.2, 3.2);
      this.drawThing({ id: 1, glitch: true, icon: state.target, x: 0, y: 0 });
      ctx.restore();
      ctx.font = `bold 80px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`🔍 × ${n}`, cx, cy + 170);
    } else if (state.phase === 'round-end') {
      ctx.font = `bold 140px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('✨🎉✨', cx, cy);
    }
    ctx.restore();
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
  }
}
