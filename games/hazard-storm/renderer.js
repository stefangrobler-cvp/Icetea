// Draws Hazard Storm on a <canvas>. Only reads engine state, never changes it.
// Neon arcade look: pitch-black arena with glowing cyan borders, orange spikes,
// magenta beams, white plasma balls; every hazard blinks before it is dangerous.

import { WORLD, ARENA, TRACK_Y, ORB, SPIKE, BALL, BATTERY, SHIELD, HEARTS, DASH, COLORS } from './config.js';

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
const TAU = Math.PI * 2;
const FLOOR = TRACK_Y + ORB.radius;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.players = {}; // seat -> { avatar, color }
    this.sparks = [];
    this.trails = new Map(); // ball id -> recent positions
    this.flash = 0;
    this.shake = 0;
    this.time = 0;
    this.gone = {}; // seat -> x where they went out
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
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

  colorOf(seat) {
    return this.players[seat]?.color || COLORS.line;
  }

  reset() {
    this.sparks = [];
    this.trails.clear();
    this.gone = {};
    this.flash = 0;
    this.shake = 0;
  }

  handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'hit') {
        this.burst(ev.x, TRACK_Y, this.colorOf(ev.seat), 26, 2);
        this.burst(ev.x, TRACK_Y, '#ffffff', 10, 1.4);
        this.flash = 1;
        this.shake = 0.35;
      } else if (ev.type === 'out') {
        this.gone[ev.seat] = ev.x;
      } else if (ev.type === 'smash') {
        this.burst(ev.x, FLOOR, COLORS.spike, 12, 1, true);
      } else if (ev.type === 'battery') {
        this.burst(ev.x, TRACK_Y, COLORS.battery, 18, 1.2);
      } else if (ev.type === 'bump') {
        this.burst(ev.x, TRACK_Y, '#ffffff', 10, 1);
      } else if (ev.type === 'fire' && ev.kind === 'beam') {
        this.shake = Math.max(this.shake, 0.15);
      }
    }
  }

  burst(x, y, color, n, power, up = false) {
    for (let i = 0; i < n; i++) {
      const a = up ? -Math.PI / 2 + (Math.random() - 0.5) * 2.4 : Math.random() * TAU;
      const v = (2 + Math.random() * 6) * power;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color, size: 2.5 + Math.random() * 3.5 });
    }
  }

  draw(state, dt) {
    const { ctx } = this;
    this.time += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.w, this.h);

    const jx = this.shake > 0 ? (Math.random() - 0.5) * 14 * this.shake * this.scale : 0;
    const jy = this.shake > 0 ? (Math.random() - 0.5) * 10 * this.shake * this.scale : 0;
    this.shake = Math.max(0, this.shake - dt);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox + jx, this.oy + jy);

    this.drawArena();
    for (const h of state.hazards) if (h.phase === 'warn') this.drawWarning(h);
    for (const h of state.hazards) if (h.phase === 'active') this.drawHazard(h);
    for (const id of this.trails.keys()) if (!state.hazards.some((h) => h.id === id)) this.trails.delete(id);
    this.drawOrbs(state);
    this.drawSparks(dt);
    this.drawHud(state);
    this.drawOverlay(state, dt);
  }

  drawArena() {
    const { ctx } = this;
    const w = ARENA.right - ARENA.left;
    const h = FLOOR - ARENA.top + 30;
    ctx.save();
    // Faint floor grid.
    ctx.strokeStyle = COLORS.line;
    ctx.globalAlpha = 0.06;
    ctx.lineWidth = 2;
    for (let x = ARENA.left + 75; x < ARENA.right; x += 75) {
      ctx.beginPath();
      ctx.moveTo(x, ARENA.top);
      ctx.lineTo(x, FLOOR);
      ctx.stroke();
    }
    for (let y = ARENA.top + 75; y < FLOOR; y += 75) {
      ctx.beginPath();
      ctx.moveTo(ARENA.left, y);
      ctx.lineTo(ARENA.right, y);
      ctx.stroke();
    }
    // Glowing border.
    ctx.globalAlpha = 1;
    ctx.lineWidth = 16;
    ctx.strokeStyle = `${COLORS.line}22`;
    ctx.beginPath();
    ctx.roundRect(ARENA.left, ARENA.top, w, h, 24);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.line;
    ctx.stroke();
    // The track the orbs run on.
    const g = ctx.createLinearGradient(0, FLOOR, 0, FLOOR + 30);
    g.addColorStop(0, `${COLORS.line}55`);
    g.addColorStop(1, `${COLORS.line}00`);
    ctx.fillStyle = g;
    ctx.fillRect(ARENA.left + 4, FLOOR, w - 8, 30);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ARENA.left, FLOOR);
    ctx.lineTo(ARENA.right, FLOOR);
    ctx.stroke();
    ctx.restore();
  }

  blink(speed = 10) {
    return 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.time * speed));
  }

  drawWarning(h) {
    const { ctx } = this;
    ctx.save();
    const a = this.blink(14);
    if (h.kind === 'spike') {
      // Where it will land: a glowing patch on the floor and a dashed line from the top.
      ctx.globalAlpha = 0.25 * a;
      ctx.fillStyle = COLORS.spike;
      ctx.fillRect(h.x - SPIKE.width, ARENA.top, SPIKE.width * 2, FLOOR - ARENA.top);
      ctx.globalAlpha = a;
      ctx.strokeStyle = COLORS.spike;
      ctx.lineWidth = 4;
      this.triangle(h.x, ARENA.top + 8, SPIKE.width, SPIKE.height * 0.7);
      ctx.stroke();
      ctx.fillStyle = COLORS.spike;
      ctx.beginPath();
      ctx.ellipse(h.x, FLOOR, SPIKE.width * 1.2, 8, 0, 0, TAU);
      ctx.fill();
    } else if (h.kind === 'beam') {
      ctx.globalAlpha = 0.18 * a + 0.06;
      ctx.fillStyle = COLORS.beam;
      ctx.fillRect(h.x1, ARENA.top, h.x2 - h.x1, FLOOR - ARENA.top);
      ctx.globalAlpha = a;
      ctx.strokeStyle = COLORS.beam;
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 12]);
      ctx.strokeRect(h.x1, ARENA.top, h.x2 - h.x1, FLOOR - ARENA.top);
      ctx.setLineDash([]);
      ctx.font = `bold 54px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.beam;
      ctx.fillText(h.from < 0 ? '▶' : '◀', h.from < 0 ? h.x1 + 40 : h.x2 - 40, ARENA.top + 50);
    } else if (h.kind === 'ball') {
      const x = h.vx > 0 ? ARENA.left + 46 : ARENA.right - 46;
      ctx.globalAlpha = a;
      ctx.strokeStyle = COLORS.ball;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, h.y, BALL.radius, 0, TAU);
      ctx.stroke();
      ctx.font = `bold 54px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.ball;
      ctx.fillText(h.vx > 0 ? '▶' : '◀', x + Math.sign(h.vx) * 70, h.y);
    }
    ctx.restore();
  }

  triangle(x, top, w, h) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, top);
    ctx.lineTo(x + w / 2, top);
    ctx.lineTo(x, top + h);
    ctx.closePath();
  }

  drawHazard(h) {
    const { ctx } = this;
    ctx.save();
    if (h.kind === 'spike') {
      // A falling energy spike with a short trail.
      const g = ctx.createLinearGradient(0, h.y - SPIKE.height * 2.2, 0, h.y - SPIKE.height);
      g.addColorStop(0, `${COLORS.spike}00`);
      g.addColorStop(1, `${COLORS.spike}66`);
      ctx.fillStyle = g;
      ctx.fillRect(h.x - SPIKE.width / 3, h.y - SPIKE.height * 2.2, (SPIKE.width * 2) / 3, SPIKE.height * 1.2);
      ctx.lineWidth = 12;
      ctx.strokeStyle = `${COLORS.spike}44`;
      this.triangle(h.x, h.y - SPIKE.height, SPIKE.width, SPIKE.height);
      ctx.stroke();
      ctx.fillStyle = COLORS.spike;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    } else if (h.kind === 'beam') {
      const [a, b] = h.from < 0 ? [h.x1, h.x1 + (h.x2 - h.x1) * h.grown] : [h.x2 - (h.x2 - h.x1) * h.grown, h.x2];
      const flicker = 0.8 + 0.2 * Math.sin(this.time * 60);
      ctx.globalAlpha = 0.35 * flicker;
      ctx.fillStyle = COLORS.beam;
      ctx.fillRect(a - 14, ARENA.top, b - a + 28, FLOOR - ARENA.top);
      ctx.globalAlpha = 0.85 * flicker;
      ctx.fillRect(a, ARENA.top, b - a, FLOOR - ARENA.top);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect((a + b) / 2 - (b - a) * 0.12, ARENA.top, (b - a) * 0.24, FLOOR - ARENA.top);
    } else if (h.kind === 'ball') {
      const trail = this.trails.get(h.id) || [];
      trail.push({ x: h.x, y: h.y });
      if (trail.length > 10) trail.shift();
      this.trails.set(h.id, trail);
      trail.forEach((p, i) => {
        ctx.globalAlpha = (i / trail.length) * 0.35;
        ctx.fillStyle = COLORS.beam;
        ctx.beginPath();
        ctx.arc(p.x, p.y, BALL.radius * (0.4 + (0.6 * i) / trail.length), 0, TAU);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, BALL.radius * 1.8);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, `${COLORS.beam}cc`);
      g.addColorStop(1, `${COLORS.beam}00`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, BALL.radius * 1.8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(h.x, h.y, BALL.radius * 0.7, 0, TAU);
      ctx.fill();
    } else if (h.kind === 'battery') {
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(this.time * 6);
      ctx.fillStyle = COLORS.battery;
      ctx.beginPath();
      ctx.arc(h.x, h.y, BATTERY.size, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.font = `${BATTERY.size}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔋', h.x, h.y);
    }
    ctx.restore();
  }

  drawOrbs(state) {
    const { ctx } = this;
    for (const x of Object.values(this.gone)) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.font = `48px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('💔', x, TRACK_Y);
      ctx.restore();
    }
    for (const o of Object.values(state.orbs)) {
      if (o.out) continue;
      const color = this.colorOf(o.seat);
      const p = this.players[o.seat] || {};
      ctx.save();
      let alpha = 1;
      if (o.ghost > 0) alpha = 0.35;
      else if (o.safe > 0) alpha = Math.sin(this.time * 30) > 0 ? 1 : 0.3;
      // Dash streak.
      if (o.ghost > 0) {
        ctx.globalAlpha = 0.4;
        const g = ctx.createLinearGradient(o.x - o.dir * 220, 0, o.x, 0);
        g.addColorStop(0, `${color}00`);
        g.addColorStop(1, color);
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(o.x, o.x - o.dir * 220), TRACK_Y - o.r * 0.6, 220, o.r * 1.2);
      }
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 14;
      ctx.strokeStyle = `${color}40`;
      ctx.beginPath();
      ctx.arc(o.x, TRACK_Y, o.r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#0b0720';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.round(o.r * 1.15)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.avatar || '🙂', o.x, TRACK_Y + 2);
      // Dash recharge: a ring under the orb that fills up.
      const ready = 1 - o.cooldown / DASH.cooldown;
      ctx.globalAlpha = ready >= 1 ? 0.9 : 0.5;
      ctx.lineWidth = 5;
      ctx.strokeStyle = ready >= 1 ? color : '#ffffff';
      ctx.beginPath();
      ctx.arc(o.x, TRACK_Y, o.r + 10, Math.PI * 0.25, Math.PI * 0.25 + Math.PI * 0.5 * ready);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawSparks(dt) {
    const { ctx } = this;
    ctx.save();
    for (const s of this.sparks) {
      s.x += s.vx * dt * 60;
      s.y += s.vy * dt * 60;
      s.vy += 0.25 * dt * 60;
      s.life -= dt * 1.8;
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, TAU);
      ctx.fill();
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    ctx.restore();
  }

  drawHud(state) {
    const { ctx } = this;
    ctx.save();
    ctx.textBaseline = 'middle';
    // Time: a shrinking bar along the top.
    const share = state.totalTime ? Math.max(0, state.time / state.totalTime) : 0;
    const barW = state.mode === 'team' ? 560 : 380;
    const bx = WORLD.width / 2 - barW / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(bx, 40, barW, 18, 9);
    ctx.fill();
    ctx.fillStyle = state.mode === 'team' && share < 0.2 ? '#39ff7a' : COLORS.line;
    ctx.beginPath();
    ctx.roundRect(bx, 40, Math.max(18, barW * share), 18, 9);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `34px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('⏱️', bx - 14, 50);

    if (state.mode === 'team') {
      // The shared shield: bright bolts left, dim bolts lost.
      ctx.textAlign = 'left';
      ctx.font = `44px ${FONT}`;
      for (let i = 0; i < SHIELD; i++) {
        ctx.globalAlpha = i < state.shield ? 1 : 0.18;
        ctx.fillText('\u26A1\uFE0F', ARENA.left + i * 50, 50); // ⚡ drawn as a colour emoji
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.font = `56px ${FONT}`;
      ctx.fillText('🤖', ARENA.right - 30, 50);
    } else {
      // Each player's avatar and hearts along the top.
      const orbs = Object.values(state.orbs).sort((a, b) => a.seat - b.seat);
      // Two on the left, two on the right, clear of the time bar in the middle.
      const spots = [[ARENA.left, 'left'], [ARENA.right, 'right'], [ARENA.left + 250, 'left'], [ARENA.right - 250, 'right']];
      orbs.forEach((o, i) => {
        const [x, align] = spots[i];
        ctx.globalAlpha = o.out ? 0.35 : 1;
        ctx.textAlign = align;
        ctx.font = `34px ${FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${(this.players[o.seat] || {}).avatar || '🙂'} ${'❤️'.repeat(o.hearts)}${'🖤'.repeat(HEARTS - o.hearts)}`, x, 50);
      });
    }
    ctx.restore();
  }

  drawOverlay(state, dt) {
    const { ctx } = this;
    ctx.save();
    if (this.flash > 0) {
      const g = ctx.createRadialGradient(WORLD.width / 2, WORLD.height / 2, WORLD.height * 0.35, WORLD.width / 2, WORLD.height / 2, WORLD.width * 0.7);
      g.addColorStop(0, 'rgba(255,40,80,0)');
      g.addColorStop(1, `rgba(255,40,80,${this.flash * 0.45})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (state.phase === 'countdown') {
      const k = state.countdown % 1;
      ctx.font = `bold ${Math.round(200 + 80 * k)}px ${FONT}`;
      ctx.fillStyle = COLORS.text;
      ctx.globalAlpha = 0.4 + 0.6 * k;
      ctx.fillText(String(Math.max(1, Math.ceil(state.countdown))), WORLD.width / 2, WORLD.height / 2 - 40);
    } else if (state.phase === 'over' && state.winner === 'team') {
      ctx.font = `bold 130px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('🛡️🎉', WORLD.width / 2, WORLD.height / 2 - 80);
    }
    ctx.restore();
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
  }
}
