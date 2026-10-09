// Draws Glow Tube flat, for screens that can't do 3D: the half-pipe seen from above,
// unrolled into a strip that scrolls towards the riders at the bottom. Left wall on
// the left, right wall on the right. Same interface as renderer3d.js.

import { TUBE, COLORS } from './config.js';

const W = 1600;
const H = 900;
const AHEAD = 70; // metres shown above the riders
const RIDERS_Y = 760;
const FONT = '"Press Start 2P", Fredoka, sans-serif';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.players = {};
    this.sparks = [];
    this.time = 0;
    this.banner = null;
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  resize() {
    const area = this.canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = area?.clientWidth || window.innerWidth;
    const h = area?.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.scale = Math.min(this.canvas.width / W, this.canvas.height / H);
    this.ox = (this.canvas.width - W * this.scale) / 2;
    this.oy = (this.canvas.height - H * this.scale) / 2;
  }

  colorOf(seat) { return this.players[seat]?.color || COLORS.line; }

  // Across the tube -> x on screen; metres ahead -> y on screen.
  x(a) { return W / 2 + (a / (TUBE.maxAngle + 0.3)) * 520; }
  y(ahead) { return RIDERS_Y - (ahead / AHEAD) * (RIDERS_Y - 70); }

  handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'catch') this.burst(this.x(ev.a), RIDERS_Y - 20, this.colorOf(ev.seat), 10);
      else if (ev.type === 'tumble') this.burst(this.x(ev.a), RIDERS_Y, '#ffe600', 12);
      else if (ev.type === 'go') this.banner = { text: 'GO!', life: 0.8 };
      else if (ev.type === 'finish') this.banner = { text: 'FINISH!', life: 2.4 };
    }
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 5;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
    }
  }

  draw(view, dt = 1 / 60) {
    const { ctx } = this;
    this.time += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);

    // The tube: darker in the deep middle, neon rims, rings rushing past.
    const left = this.x(-(TUBE.maxAngle + 0.3));
    const right = this.x(TUBE.maxAngle + 0.3);
    const g = ctx.createLinearGradient(left, 0, right, 0);
    g.addColorStop(0, '#3b1d85');
    g.addColorStop(0.5, '#1c0c44');
    g.addColorStop(1, '#3b1d85');
    ctx.fillStyle = g;
    ctx.fillRect(left, 0, right - left, H);
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(left - 6, 0, 6, H);
    ctx.fillStyle = '#ff2bd6';
    ctx.fillRect(right, 0, 6, H);
    ctx.fillStyle = 'rgba(125,140,255,0.35)';
    for (let d = -(view.distance % 6); d < AHEAD; d += 6) ctx.fillRect(left, this.y(d), right - left, 3);

    // Start and finish lines.
    for (const [lineD, label] of [[0, ''], [view.length, '🏁']]) {
      const ahead = lineD - view.distance;
      if (ahead < -5 || ahead > AHEAD) continue;
      const y = this.y(ahead);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = i % 2 ? '#14082e' : '#f4f2ff';
        ctx.fillRect(left + (i * (right - left)) / 40, y - 10, (right - left) / 40, 20);
      }
      if (label) {
        ctx.font = `60px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(label, right + 60, y);
      }
    }

    // Obstacles and crystals.
    for (const o of view.obstacles) {
      const y = this.y(o.d - view.distance);
      ctx.fillStyle = '#3b1d85';
      ctx.fillRect(this.x(o.a - o.width), y - 16, this.x(o.a + o.width) - this.x(o.a - o.width), 32);
      ctx.strokeStyle = '#ff2bd6';
      ctx.lineWidth = 4;
      ctx.strokeRect(this.x(o.a - o.width), y - 16, this.x(o.a + o.width) - this.x(o.a - o.width), 32);
    }
    for (const c of view.crystals) {
      const x = this.x(c.a);
      const y = this.y(c.d - view.distance);
      ctx.fillStyle = this.colorOf(c.seat);
      ctx.beginPath();
      ctx.moveTo(x, y - 18);
      ctx.lineTo(x + 13, y);
      ctx.lineTo(x, y + 18);
      ctx.lineTo(x - 13, y);
      ctx.closePath();
      ctx.fill();
    }

    // Riders: a board in their colour with their animal on top.
    view.riders.forEach((r) => {
      const x = this.x(r.a);
      ctx.save();
      ctx.translate(x, RIDERS_Y);
      if (r.tumble > 0) ctx.rotate(r.spin);
      ctx.fillStyle = this.colorOf(r.seat);
      ctx.fillRect(-40, 18, 80, 14);
      ctx.font = `56px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.players[r.seat]?.avatar || '🙂', 0, -16);
      ctx.restore();
    });

    // Sparks.
    for (const s of this.sparks) {
      s.x += s.vx * dt * 60;
      s.y += s.vy * dt * 60;
      s.life -= dt * 2;
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 4, s.y - 4, 8, 8);
    }
    ctx.globalAlpha = 1;
    this.sparks = this.sparks.filter((s) => s.life > 0);

    this.drawHud(view, dt);
  }

  drawHud(view, dt) {
    const { ctx } = this;
    // Distance to the finish: a bar along the top with the riders' animals on it.
    const bx = 300;
    const bw = 1000;
    ctx.fillStyle = 'rgba(125,140,255,0.25)';
    ctx.fillRect(bx, 26, bw, 14);
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(bx, 26, bw * view.progress, 14);
    ctx.font = `36px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🏁', bx + bw + 34, 34);
    ctx.fillText(view.riders.map((r) => this.players[r.seat]?.avatar || '🙂').join(''), bx + bw * view.progress, 70);

    // Crystals: everyone's count, or the team jar.
    ctx.font = `bold 40px ${FONT}`;
    if (view.mode === 'team') {
      ctx.fillStyle = view.jar >= view.goal ? '#39ff7a' : COLORS.text;
      ctx.fillText(`💎 ${view.jar} / ${view.goal}`, W / 2, H - 40);
    } else {
      const parts = view.riders.map((r) => ({ text: `${this.players[r.seat]?.avatar || '🙂'} ${r.caught}`, color: this.colorOf(r.seat) }));
      parts.forEach((p, i) => {
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, W / 2 + (i - (parts.length - 1) / 2) * 260, H - 40);
      });
    }

    if (view.phase === 'countdown') {
      ctx.font = `bold 200px ${FONT}`;
      ctx.fillStyle = COLORS.text;
      ctx.fillText(String(Math.max(1, Math.ceil(view.countdown))), W / 2, H / 2);
    }
    if (this.banner) {
      this.banner.life -= dt;
      ctx.font = `bold 110px ${FONT}`;
      ctx.fillStyle = '#ffe600';
      ctx.globalAlpha = Math.min(1, this.banner.life * 3);
      ctx.fillText(this.banner.text, W / 2, H * 0.4);
      ctx.globalAlpha = 1;
      if (this.banner.life <= 0) this.banner = null;
    }
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
  }
}
