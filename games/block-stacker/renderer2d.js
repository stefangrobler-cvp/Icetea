// Draws Block Stacker flat on a 2D <canvas>: the fallback for screens that cannot do 3D (no WebGL).
// Neon arcade look: indigo perspective grid, see-through glowing blocks with bright
// corners, a laser wire, sparks when blocks land.

import { WORLD, PLATFORM, HEARTS, AUTO_DROP, COLORS } from './config.js';

// Older iPads (before iOS 16) can't draw rounded rectangles natively.
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

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.players = {}; // seat -> { avatar, color }
    this.sparks = [];
    this.flash = 0; // red flash when a block is lost
    this.time = 0;
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

  /** Effects for what just happened (sparks, flashes). */
  handleEvents(events, view) {
    for (const ev of events) {
      if (ev.type === 'land') this.burst(ev.x, ev.y, this.colorOf(ev.seat), 10 + Math.round(ev.power * 18), 1 + ev.power);
      else if (ev.type === 'lost') {
        this.flash = 1;
        this.burst(ev.x, view.cameraTop + WORLD.height - 20, this.colorOf(ev.seat), 26, 2.2, true);
      } else if (ev.type === 'drop') {
        const t = view.towers[ev.tower];
        if (t) this.burst(t.hanging?.x ?? t.x, t.wireY, COLORS.wire, 8, 0.7);
      }
    }
  }

  burst(x, y, color, n, power, shards = false) {
    for (let i = 0; i < n; i++) {
      const a = shards ? -Math.PI / 2 + (Math.random() - 0.5) * 2.2 : Math.random() * TAU;
      const v = (2 + Math.random() * 6) * power;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (shards ? 4 : 1), life: 1, color, size: shards ? 6 + Math.random() * 10 : 3 + Math.random() * 3, shard: shards });
    }
  }

  draw(view, dt) {
    const { ctx } = this;
    this.time += dt;
    const cam = view.cameraTop;
    const shaking = view.towers.some((t) => t.force?.on && t.force.kind === 'quake');

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBackground(cam);

    // World layer (scrolls with the camera; shakes during an earthquake).
    const jx = shaking ? (Math.random() - 0.5) * 10 * this.scale : 0;
    const jy = shaking ? (Math.random() - 0.5) * 6 * this.scale : 0;
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox + jx, this.oy + jy - cam * this.scale);

    if (view.mode === 'team' && view.goal) this.drawGoal(view);
    for (const t of view.towers) this.drawPlatform(t, view);
    for (const b of view.blocks) {
      if (b.cells) this.drawShape(b.x, b.y, b.cells, b.size, b.angle, b.color, 1);
      else this.drawBlock(b.x, b.y, b.w, b.h, b.angle, b.color, 1);
    }
    for (const t of view.towers) this.drawWire(t, view);
    for (const t of view.towers) this.drawForce(t, view);
    this.drawSparks(dt);

    // Screen layer: scores, time, countdown.
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    this.drawHud(view);
    this.drawOverlay(view, dt);
  }

  drawBackground(cam) {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, COLORS.background);
    g.addColorStop(1, '#170b45');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Perspective grid: lines fan out from a point above the screen and scroll with the camera.
    ctx.save();
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = Math.max(1, this.scale);
    const vx = w / 2;
    const vy = -h * 0.6;
    ctx.globalAlpha = 0.12;
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(vx + i * w * 0.14, h);
      ctx.stroke();
    }
    const gap = 90 * this.scale;
    const shift = ((-cam * this.scale * 0.5) % gap + gap) % gap;
    for (let y = shift; y < h; y += gap) {
      ctx.globalAlpha = 0.04 + 0.12 * (y / h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGoal(view) {
    const { ctx } = this;
    const t = view.towers[0];
    const y = view.goalY;
    const reached = t.score >= view.goal;
    ctx.save();
    ctx.strokeStyle = reached ? '#39ff7a' : COLORS.cpu;
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.time * 4);
    ctx.lineWidth = 6;
    ctx.setLineDash([18, 14]);
    ctx.beginPath();
    ctx.moveTo(t.x - t.width * 0.9, y);
    ctx.lineTo(t.x + t.width * 0.9, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.font = `64px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('🏁', t.x + t.width * 0.9 + 46, y - 6);
    ctx.restore();
  }

  drawPlatform(t, view) {
    const { ctx } = this;
    const color = view.mode === 'team' ? COLORS.line : this.colorOf(t.seats[0]);
    const left = t.x - t.width / 2;
    ctx.save();
    ctx.globalAlpha = t.out ? 0.3 : 1;
    // Anti-gravity glow under the platform.
    const g = ctx.createLinearGradient(0, PLATFORM.y, 0, PLATFORM.y + 160);
    g.addColorStop(0, `${color}66`);
    g.addColorStop(1, `${color}00`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(left + 20, PLATFORM.y + PLATFORM.height);
    ctx.lineTo(left + t.width - 20, PLATFORM.y + PLATFORM.height);
    ctx.lineTo(t.x + t.width * 0.25, PLATFORM.y + 160);
    ctx.lineTo(t.x - t.width * 0.25, PLATFORM.y + 160);
    ctx.closePath();
    ctx.fill();
    // The platform itself.
    ctx.lineWidth = 14;
    ctx.strokeStyle = `${color}40`;
    ctx.beginPath();
    ctx.roundRect(left, PLATFORM.y, t.width, PLATFORM.height, 10);
    ctx.stroke();
    ctx.fillStyle = `${color}55`;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();

    // Under the platform: who it belongs to, hearts and blocks stacked.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (view.mode === 'versus') {
      // One line under the platform: who, hearts, blocks stacked.
      const p = this.players[t.seats[0]] || {};
      ctx.fillStyle = '#ffffff'; // emoji take on the fill's transparency in some browsers
      ctx.font = `44px ${FONT}`;
      ctx.fillText(`${t.out ? '💔' : p.avatar || '🙂'}  ${this.hearts(t.hearts)}`, t.x, PLATFORM.y + 82);
      ctx.fillStyle = color;
      ctx.font = `bold 44px ${FONT}`;
      ctx.fillText(`🧊 ${t.score}${!t.out && t.charge <= 0 ? (t.nextForce === 'quake' ? ' 🌋' : ' 💨') : ''}`, t.x, PLATFORM.y + 140);
    }
    ctx.restore();
  }

  hearts(n) {
    return '❤️'.repeat(n) + '🖤'.repeat(Math.max(0, HEARTS - n));
  }

  drawBlock(x, y, w, h, angle, color, alpha) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    // Soft outer glow (a wide faint line is much cheaper than canvas shadows).
    ctx.lineWidth = 12;
    ctx.strokeStyle = `${color}30`;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 6);
    ctx.stroke();
    // See-through glass body with a brighter top edge.
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, `${color}66`);
    g.addColorStop(1, `${color}22`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
    // Inner edge, for a cube-like look.
    ctx.globalAlpha = alpha * 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 9, -h / 2 + 9, w - 18, h - 18, 4);
    ctx.stroke();
    // Glowing corners.
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      ctx.arc((cx * w) / 2, (cy * h) / 2, 3.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** A shape: its cubes, turned with the body. */
  drawShape(x, y, cells, size, angle, color, alpha) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    for (const c of cells) this.drawBlock(c.x, c.y, size, size, 0, color, alpha);
    ctx.restore();
  }

  /** Wind or an earthquake on a tower: a warning icon first, then streaks or dust. */
  drawForce(t, view) {
    const f = t.force;
    if (!f || t.out) return;
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!f.on) {
      const k = 1 + 0.15 * Math.sin(this.time * 20);
      ctx.font = `${Math.round(90 * k)}px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(f.kind === 'quake' ? '🌋' : '💨', t.x, t.wireY - 130);
      if (view.mode === 'versus' && this.players[f.from]) {
        ctx.font = `48px ${FONT}`;
        ctx.fillText(this.players[f.from].avatar || '', t.x + 80, t.wireY - 150);
      }
    } else if (f.kind === 'wind') {
      ctx.strokeStyle = '#c9f4ff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const y = t.wireY + 40 + ((i * 97) % (PLATFORM.y - t.wireY));
        const run = ((this.time * 900 + i * 230) % (t.width * 2.4)) - t.width * 1.2;
        const x = t.x + f.dir * run;
        ctx.globalAlpha = 0.5 * f.gust;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - f.dir * 90, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawWire(t, view) {
    if (t.out) return;
    const { ctx } = this;
    const span = t.width * (t.swing || 0.6) + 90;
    const y = t.wireY;
    ctx.save();
    // The laser wire.
    ctx.lineCap = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = `${COLORS.wire}33`;
    ctx.beginPath();
    ctx.moveTo(t.x - span, y);
    ctx.lineTo(t.x + span, y);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.wire;
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.time * 12);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.wire;
    for (const ex of [t.x - span, t.x + span]) {
      ctx.beginPath();
      ctx.arc(ex, y, 9, 0, TAU);
      ctx.fill();
    }

    const hb = t.hanging;
    if (hb && view.phase === 'playing') {
      // The thin laser holding the block.
      ctx.strokeStyle = COLORS.wire;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const hookX = hb.x + (hb.hook?.x || 0);
      ctx.moveTo(hookX, y);
      ctx.lineTo(hookX, hb.y + (hb.cells ? hb.top : -hb.h / 2));
      ctx.stroke();
      // Where it would land: a faint guide line straight down.
      ctx.globalAlpha = 0.18;
      ctx.setLineDash([6, 10]);
      ctx.strokeStyle = hb.color;
      ctx.beginPath();
      ctx.moveTo(hb.x, hb.y + (hb.cells ? hb.bottom : hb.h / 2));
      ctx.lineTo(hb.x, PLATFORM.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      if (hb.cells) this.drawShape(hb.x, hb.y, hb.cells, hb.size, 0, hb.color, 0.95);
      else this.drawBlock(hb.x, hb.y, hb.w, hb.h, 0, hb.color, 0.95);

      // Whose block it is (and a ring that runs down before it drops by itself).
      const p = this.players[hb.seat] || {};
      const ax = hb.x;
      const ay = y - 52;
      ctx.font = `52px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.avatar || '🙂', ax, ay);
      if (hb.left < 5) {
        ctx.strokeStyle = hb.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(ax, ay, 38, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, hb.left / 5));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawSparks(dt) {
    const { ctx } = this;
    ctx.save();
    for (const s of this.sparks) {
      s.x += s.vx * dt * 60;
      s.y += s.vy * dt * 60;
      s.vy += (s.shard ? 0.5 : 0.25) * dt * 60;
      s.life -= dt * (s.shard ? 1.1 : 1.8);
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.shard ? `${s.color}aa` : s.color;
      if (s.shard) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.life * 6);
        ctx.fillRect(-s.size / 2, -s.size / 4, s.size, s.size / 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, TAU);
        ctx.fill();
      }
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    ctx.restore();
  }

  drawHud(view) {
    const { ctx } = this;
    ctx.save();
    ctx.textBaseline = 'middle';
    // Time left: a shrinking bar along the top.
    const total = view.totalTime;
    const share = total ? Math.max(0, view.time / total) : 0;
    const barW = 700;
    const bx = WORLD.width / 2 - barW / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(bx, 26, barW, 18, 9);
    ctx.fill();
    ctx.fillStyle = share < 0.2 ? '#ff4d6d' : COLORS.line;
    ctx.beginPath();
    ctx.roundRect(bx, 26, Math.max(18, barW * share), 18, 9);
    ctx.fill();
    ctx.font = `34px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('⏱️', bx - 14, 36);

    if (view.mode === 'team') {
      const t = view.towers[0];
      ctx.textAlign = 'left';
      ctx.font = `40px ${FONT}`;
      ctx.fillText(this.hearts(t.hearts), 30, 40);
      ctx.fillStyle = COLORS.text;
      ctx.font = `bold 44px ${FONT}`;
      ctx.fillText(`🧊 ${t.score} / ${view.goal} 🏁`, 30, 100);
      // The computer: calm, warning, sending a force.
      const f = t.force;
      ctx.textAlign = 'right';
      ctx.font = `64px ${FONT}`;
      const pulse = f && !f.on ? 1 + 0.15 * Math.sin(this.time * 20) : 1;
      ctx.save();
      ctx.translate(WORLD.width - 60, 60);
      ctx.scale(pulse, pulse);
      ctx.textAlign = 'center';
      ctx.fillText(f ? '⚠️' : '🤖', 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  drawOverlay(view, dt) {
    const { ctx } = this;
    ctx.save();
    // Red edges (team): a warning before a force, and a flash when a block falls off.
    const f = view.mode === 'team' ? view.towers[0]?.force : null;
    const warn = f && !f.on ? 0.35 + 0.25 * Math.sin(this.time * 18) : 0;
    const red = Math.max(warn, this.flash * 0.6, f?.on ? 0.5 : 0);
    this.flash = Math.max(0, this.flash - dt * 2);
    if (red > 0) {
      const g = ctx.createRadialGradient(WORLD.width / 2, WORLD.height / 2, WORLD.height * 0.35, WORLD.width / 2, WORLD.height / 2, WORLD.width * 0.7);
      g.addColorStop(0, 'rgba(255,40,80,0)');
      g.addColorStop(1, `rgba(255,40,80,${red})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (view.phase === 'countdown') {
      const n = Math.max(1, Math.ceil(view.countdown));
      const k = view.countdown % 1;
      ctx.font = `bold ${Math.round(200 + 80 * k)}px ${FONT}`;
      ctx.fillStyle = COLORS.text;
      ctx.globalAlpha = 0.4 + 0.6 * k;
      ctx.fillText(String(n), WORLD.width / 2, WORLD.height / 2);
    } else if (view.phase === 'over' && view.winner === 'team') {
      ctx.font = `bold 120px ${FONT}`;
      ctx.fillStyle = '#39ff7a';
      ctx.fillText('🏁 🎉', WORLD.width / 2, WORLD.height / 2 - 120);
    }
    ctx.restore();
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
  }
}
