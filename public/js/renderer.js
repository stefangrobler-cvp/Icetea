// Draws the game on a <canvas>. Only reads engine state, never changes it.
// Effects (bounces, ripples, wobbling paddles) are driven by the engine's events.

import { COURT, BALL, COLORS, SOCCER, TOSS_SECONDS, KICKOFF } from '/shared/config.js';
import { goalHeight } from '/shared/games/soccer.js';

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
    this.flash = 0; // brief glow after a point
    this.shake = 0;
    this.ripples = [];
    this.squash = null; // ball squash after a bounce
    this.wobble = new Map(); // paddle id -> { t, amp }
    this.trail = [];
    this.pop = { left: 1, right: 1 }; // score pop animation timers
    this.banner = null; // "GOAL!"
    this.roll = 0; // soccer ball pattern rotation
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Once the rounded font has loaded, redraw the cached score pictures with it.
    document.fonts?.ready.then(() => { this.sprites.clear(); });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // Fit the 16:9 court (plus room for the soccer goals) inside the screen.
    const scale = Math.min(w / (COURT.width + 2 * SOCCER.goalDepth + 20), h / (COURT.height + 20));
    this.scale = scale * dpr;
    this.offsetX = ((w - COURT.width * scale) / 2) * dpr;
    this.offsetY = ((h - COURT.height * scale) / 2) * dpr;
    // Glow effects are slow to draw, so each one is drawn once into a
    // "sprite" and then just copied every frame. Sizes changed: redraw them.
    this.sprites = new Map();
  }

  // ---------- effects from engine events ----------

  handleEvents(events, state) {
    for (const ev of events) {
      if (ev.type === 'hit' || ev.type === 'wall' || ev.type === 'post') {
        const power = ev.power || 0;
        this.squash = { t: 0, angle: Math.atan2(ev.ny, ev.nx), amount: 0.28 + power * 0.2 };
        const paddle = state.paddles.find((p) => p.id === ev.paddle);
        this.ripples.push({ x: ev.x, y: ev.y, t: 0, color: paddle?.color || COLORS.line, size: ev.type === 'hit' ? 1 + power : 0.7 });
        if (ev.type === 'hit') {
          // The paddle flexes away from the ball, then springs back.
          this.wobble.set(ev.paddle, { t: 0, amp: -Math.sign(ev.nx || 1) * (10 + power * 18) });
        }
      } else if (ev.type === 'point') {
        this.flash = 1;
        this.pop[ev.scorer] = 0;
        this.trail = [];
        if (state.settings.game === 'soccer') {
          this.banner = { text: 'GOAL!', t: 0, color: this.sideColor(state, ev.scorer) };
          this.shake = 0.35;
        }
      }
    }
  }

  sideColor(state, side) {
    return state.paddles.find((p) => p.side === side)?.color || (side === 'left' ? COLORS[1] : COLORS[2]);
  }

  // ---------- cached pictures ----------

  /**
   * A cached picture. `draw(ctx, scale)` paints it in court units with (0,0)
   * at its top-left corner; `pad` leaves room for the glow.
   */
  sprite(key, w, h, pad, draw) {
    let sp = this.sprites.get(key);
    if (!sp) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil((w + pad * 2) * this.scale));
      c.height = Math.max(1, Math.ceil((h + pad * 2) * this.scale));
      const ctx = c.getContext('2d');
      ctx.scale(this.scale, this.scale);
      ctx.translate(pad, pad);
      draw(ctx, this.scale);
      sp = { canvas: c, w: w + pad * 2, h: h + pad * 2, pad };
      this.sprites.set(key, sp);
    }
    return sp;
  }

  drawSprite(sp, x, y) {
    this.ctx.drawImage(sp.canvas, x - sp.pad, y - sp.pad, sp.w, sp.h);
  }

  glowCapsule(color, w, h, blur = 34) {
    return this.sprite(`cap:${color}:${w}:${h}:${blur}`, w, h, blur * 1.5, (ctx, scale) => {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * scale;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, w / 2);
      ctx.fill();
      ctx.fill();
    });
  }

  // ---------- drawing ----------

  draw(state, dt = 1 / 60) {
    const { ctx } = this;
    const soccer = state.settings.game === 'soccer';
    this.tickEffects(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = soccer ? '#03150c' : COLORS.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake * 30 * this.scale;
      sy = (Math.random() - 0.5) * this.shake * 30 * this.scale;
    }
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX + sx, this.offsetY + sy);

    this.drawSprite(soccer ? this.pitchSprite(state) : this.courtSprite(), 0, 0);
    if (state.paddles.length === 0) return; // lobby: just the empty court

    if (soccer) this.drawScoreboard(state);
    else this.drawBigScores(state);

    for (const p of state.paddles) {
      if (soccer) this.drawRod(p);
      else this.drawPaddle(p, state.paddles.length > 2 && p.side === 'left');
    }

    this.drawRipples();
    if (state.kickoff) this.drawKickoff(state);
    this.drawBall(state, dt, soccer);
    if (state.phase === 'toss') this.drawToss(state);
    this.drawBanner();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.1})`;
      ctx.fillRect(0, 0, COURT.width, COURT.height);
    }
  }

  tickEffects(dt) {
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.shake = Math.max(0, this.shake - dt);
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < 0.45);
    if (this.squash) {
      this.squash.t += dt;
      if (this.squash.t > 0.3) this.squash = null;
    }
    for (const [id, w] of this.wobble) {
      w.t += dt;
      if (w.t > 0.7) this.wobble.delete(id);
    }
    this.pop.left += dt;
    this.pop.right += dt;
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 1.4) this.banner = null;
    }
  }

  // Ping pong court: soft gradient, rounded neon border, dashed centre line.
  courtSprite() {
    return this.sprite('court', COURT.width, COURT.height, 60, (ctx, scale) => {
      const g = ctx.createRadialGradient(COURT.width / 2, COURT.height / 2, 50, COURT.width / 2, COURT.height / 2, COURT.width * 0.65);
      g.addColorStop(0, '#16113d');
      g.addColorStop(1, '#070319');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(0, 0, COURT.width, COURT.height, 30);
      ctx.fill();

      ctx.strokeStyle = COLORS.line;
      ctx.shadowColor = COLORS.line;
      ctx.lineWidth = 5;
      for (const blur of [36, 10]) {
        ctx.shadowBlur = blur * scale;
        ctx.beginPath();
        ctx.roundRect(0, 0, COURT.width, COURT.height, 30);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.45;
      ctx.lineCap = 'round';
      ctx.lineWidth = 6;
      ctx.setLineDash([18, 26]);
      ctx.beginPath();
      ctx.moveTo(COURT.width / 2, 24);
      ctx.lineTo(COURT.width / 2, COURT.height - 24);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(COURT.width / 2, COURT.height / 2, 90, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  // Soccer pitch: striped grass, white lines, goals with nets and glowing posts.
  pitchSprite(state) {
    const leftColor = this.sideColor(state, 'left');
    const rightColor = this.sideColor(state, 'right');
    const gH = goalHeight(state.settings.difficulty);
    return this.sprite(`pitch:${leftColor}:${rightColor}:${gH}`, COURT.width, COURT.height, 70, (ctx, scale) => {
      const W = COURT.width;
      const H = COURT.height;
      const gTop = H / 2 - gH / 2;
      const depth = SOCCER.goalDepth;

      // Grass stripes
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, 22);
      ctx.clip();
      const stripes = 12;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? '#0b3d24' : '#0e4a2c';
        ctx.fillRect((i * W) / stripes, 0, W / stripes + 1, H);
      }
      const vignette = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Goals (behind the end lines)
      for (const [x0, dir, color] of [[0, -1, leftColor], [W, 1, rightColor]]) {
        const gx = dir < 0 ? x0 - depth : x0;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(gx, gTop, depth, gH);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let y = gTop; y <= gTop + gH; y += 15) { ctx.moveTo(gx, y); ctx.lineTo(gx + depth, y); }
        for (let x = gx; x <= gx + depth; x += 15) { ctx.moveTo(x, gTop); ctx.lineTo(x, gTop + gH); }
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 24 * scale;
        ctx.lineWidth = 7;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, gTop);
        ctx.lineTo(x0 + dir * depth, gTop);
        ctx.lineTo(x0 + dir * depth, gTop + gH);
        ctx.lineTo(x0, gTop + gH);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Pitch markings
      ctx.strokeStyle = 'rgba(235,255,240,0.85)';
      ctx.fillStyle = 'rgba(235,255,240,0.85)';
      ctx.shadowColor = 'rgba(180,255,210,0.8)';
      ctx.shadowBlur = 12 * scale;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, 22);
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.moveTo(W / 2 + 110, H / 2);
      ctx.arc(W / 2, H / 2, 110, 0, TAU);
      // Penalty boxes and goal boxes
      ctx.rect(0, H / 2 - 270, 200, 540);
      ctx.rect(W - 200, H / 2 - 270, 200, 540);
      ctx.rect(0, H / 2 - 200, 80, 400);
      ctx.rect(W - 80, H / 2 - 200, 80, 400);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(200, H / 2, 70, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W - 200, H / 2, 70, Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      for (const [x, y] of [[W / 2, H / 2], [150, H / 2], [W - 150, H / 2]]) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, TAU);
        ctx.fill();
      }
      // Goal posts
      for (const [x, color] of [[0, leftColor], [W, rightColor]]) {
        for (const y of [gTop, gTop + gH]) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = color;
          ctx.shadowBlur = 20 * scale;
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, TAU);
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
    });
  }

  // Big glowing score numbers in each half (ping pong).
  drawBigScores(state) {
    for (const side of ['left', 'right']) {
      const color = this.sideColor(state, side);
      const text = String(state.scores[side]);
      const sp = this.sprite(`score:${text}:${color}`, 220, 200, 50, (ctx, scale) => {
        ctx.font = `700 190px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 40 * scale;
        ctx.globalAlpha = 0.85;
        ctx.fillText(text, 110, 100);
      });
      const cx = COURT.width / 2 + (side === 'left' ? -230 : 230);
      const pop = 1 + 0.45 * Math.exp(-this.pop[side] / 0.12) * Math.cos(this.pop[side] * 20);
      this.ctx.save();
      this.ctx.translate(cx, 150);
      this.ctx.scale(pop, pop);
      this.ctx.globalAlpha = 0.55;
      this.drawSprite(sp, -110, -100);
      this.ctx.restore();
    }
  }

  // Scoreboard pill at the top of the pitch (soccer).
  drawScoreboard(state) {
    const { ctx } = this;
    const left = this.sideColor(state, 'left');
    const right = this.sideColor(state, 'right');
    const key = `board:${state.scores.left}:${state.scores.right}:${left}:${right}`;
    const sp = this.sprite(key, 260, 84, 30, (c, scale) => {
      c.fillStyle = 'rgba(3, 10, 8, 0.82)';
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.lineWidth = 3;
      c.beginPath();
      c.roundRect(0, 0, 260, 84, 42);
      c.fill();
      c.stroke();
      c.font = `700 62px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (const [x, text, color] of [[70, state.scores.left, left], [190, state.scores.right, right]]) {
        c.fillStyle = color;
        c.shadowColor = color;
        c.shadowBlur = 18 * scale;
        c.fillText(String(text), x, 46);
      }
      c.shadowBlur = 0;
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fillText('–', 130, 42);
    });
    const pop = 1 + 0.25 * Math.exp(-Math.min(this.pop.left, this.pop.right) / 0.15);
    ctx.save();
    ctx.translate(COURT.width / 2, 58);
    ctx.scale(pop, pop);
    this.drawSprite(sp, -130, -42);
    ctx.restore();
  }

  bend(id) {
    const w = this.wobble.get(id);
    if (!w) return 0;
    // A springy flex: quick bend that rings out.
    return w.amp * Math.exp(-w.t / 0.13) * Math.cos(w.t * 2 * Math.PI * 7);
  }

  // Ping pong paddle: a glowing rounded bar that flexes when it hits the ball.
  drawPaddle(p, seeThrough) {
    const { ctx } = this;
    ctx.globalAlpha = seeThrough ? 0.85 : 1; // see overlaps in team mode
    this.drawSprite(this.glowCapsule(p.color, p.w, p.h), p.x - p.w / 2, p.y - p.h / 2);
    this.drawBar(p.x, p.y, p.w, p.h, p.color, this.bend(p.id));
    ctx.globalAlpha = 1;
  }

  drawBar(x, y, w, h, color, bend) {
    const { ctx } = this;
    const top = y - h / 2 + w / 2;
    const bottom = y + h / 2 - w / 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.quadraticCurveTo(x + bend * 2, y, x, bottom);
    ctx.stroke();
    // A bright core makes it look lit from inside.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = w * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, top + 4);
    ctx.quadraticCurveTo(x + bend * 2, y, x, bottom - 4);
    ctx.stroke();
  }

  // Soccer rod: a metal bar across the pitch with three players on it.
  drawRod(p) {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(220,230,240,0.35)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(p.x, -14);
    ctx.lineTo(p.x, COURT.height + 14);
    ctx.stroke();
    const bend = this.bend(p.id);
    const glow = this.glowCapsule(p.color, p.w, p.h, 26);
    for (const o of p.offsets) {
      const y = p.y + o;
      this.drawSprite(glow, p.x - p.w / 2, y - p.h / 2);
      this.drawBar(p.x, y, p.w, p.h, p.color, bend);
      // Head, seen from above
      ctx.fillStyle = '#0b1220';
      ctx.beginPath();
      ctx.arc(p.x + bend * 0.6, y, p.w * 0.36, 0, TAU);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x + bend * 0.6, y, p.w * 0.2, 0, TAU);
      ctx.fill();
    }
  }

  drawRipples() {
    const { ctx } = this;
    ctx.lineWidth = 4;
    for (const r of this.ripples) {
      const k = r.t / 0.45;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.beginPath();
      ctx.arc(r.x, r.y, BALL.radius + k * 60 * r.size, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawBall(state, dt, soccer) {
    const { ctx } = this;
    const ball = state.ball;
    if (!ball.visible) {
      this.trail = [];
      return;
    }
    const r = BALL.radius;

    // Fading trail behind the ball for a sense of speed
    this.trail.push({ x: ball.x, y: ball.y });
    if (this.trail.length > 12) this.trail.shift();
    const trailColor = soccer ? '255,255,255' : '160,200,255';
    for (let i = 0; i < this.trail.length - 1; i++) {
      const k = (i + 1) / this.trail.length;
      ctx.fillStyle = `rgba(${trailColor},${k * 0.22})`;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, r * (0.4 + 0.6 * k), 0, TAU);
      ctx.fill();
    }

    // Soft glow
    const glow = this.sprite(`ballglow:${soccer}`, r * 2, r * 2, 40, (c) => {
      const g = c.createRadialGradient(r, r, r * 0.5, r, r, r + 40);
      g.addColorStop(0, soccer ? 'rgba(255,255,255,0.55)' : 'rgba(170,210,255,0.8)');
      g.addColorStop(1, 'rgba(170,210,255,0)');
      c.fillStyle = g;
      c.fillRect(-40, -40, r * 2 + 80, r * 2 + 80);
    });
    this.drawSprite(glow, ball.x - r, ball.y - r);

    // Squash along the bounce direction, then spring back
    ctx.save();
    ctx.translate(ball.x, ball.y);
    if (this.squash) {
      const s = this.squash.amount * Math.exp(-this.squash.t / 0.06) * Math.cos(this.squash.t * 2 * Math.PI * 6);
      ctx.rotate(this.squash.angle);
      ctx.scale(1 - s, 1 + s * 0.7);
      ctx.rotate(-this.squash.angle);
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    if (soccer) {
      this.roll += (Math.hypot(ball.vx, ball.vy) * dt) / r * Math.sign(ball.vx || 1) * 0.5;
      this.drawPentagons(r);
    } else {
      ctx.fillStyle = 'rgba(160,200,255,0.5)';
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.3, r * 0.35, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // Simple football pattern that spins as the ball rolls.
  drawPentagons(r) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.clip();
    ctx.rotate(this.roll);
    ctx.fillStyle = '#111';
    const pent = (cx, cy, size) => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 5;
        ctx.lineTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size);
      }
      ctx.fill();
    };
    pent(0, 0, r * 0.38);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5;
      pent(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02, r * 0.32);
    }
    ctx.restore();
  }

  /** Short name for a side, as printed on the coin. */
  sideLabel(state, side) {
    const avatar = (slot) => this.profiles?.[slot]?.avatar || `P${slot}`;
    if (state.settings.mode === 'team') {
      if (side === 'right') return '🤖';
      const kids = [...new Set(state.paddles.filter((p) => p.slot).map((p) => p.slot))];
      return kids.map(avatar).join('');
    }
    return avatar(side === 'left' ? 1 : 2);
  }

  // Coin toss: the coin flips up in the air and lands showing the winner.
  drawToss(state) {
    const { ctx } = this;
    const p = Math.min(1, 1 - state.toss.timeLeft / (TOSS_SECONDS - 0.6)); // lands with 0.6 s to spare
    const flips = state.toss.winner === 'left' ? 10 : 11; // an even number of half-turns lands on the left face
    const ease = 1 - (1 - p) ** 3;
    const angle = ease * flips * Math.PI;
    const squeeze = Math.cos(angle);
    const side = squeeze >= 0 ? 'left' : 'right';
    const color = this.sideColor(state, side);
    const lift = Math.sin(Math.min(1, p) * Math.PI) * 170;
    const r = 78;
    ctx.save();
    ctx.translate(COURT.width / 2, COURT.height / 2 - lift);
    ctx.scale(Math.max(0.04, Math.abs(squeeze)), 1);
    ctx.fillStyle = '#0b0820';
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // The winner's avatar on the coin face (two small ones for a team of two kids).
    const text = this.sideLabel(state, side);
    const size = Array.from(text).length > 1 ? 50 : 84;
    ctx.fillStyle = color;
    ctx.font = `700 ${size}px ${FONT}, "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 6);
    ctx.restore();
  }

  // Soccer kick-off: a pulsing ring round the ball, the kicker's aim arrow,
  // and a ring that runs down until the ball is kicked automatically.
  drawKickoff(state) {
    const { ctx } = this;
    const k = state.kickoff;
    const color = k.slot ? COLORS[k.slot] : COLORS.cpu; // the kicker's own colour
    const { x, y } = state.ball;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.35 + 0.4 * pulse;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, 34 + pulse * 6, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (k.wait > 0) return;
    if (k.slot !== null) {
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(x, y, 50, -Math.PI / 2, -Math.PI / 2 + TAU * (k.timeLeft / KICKOFF.timeLimit));
      ctx.stroke();
    }
    // Aim arrow
    const len = 190;
    const ex = x + Math.cos(k.aim) * len;
    const ey = y + Math.sin(k.aim) * len;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.setLineDash([4, 22]);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(k.aim) * 40, y + Math.sin(k.aim) * 40);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(k.aim) * 26, ey + Math.sin(k.aim) * 26);
    ctx.lineTo(ex + Math.cos(k.aim + 2.4) * 22, ey + Math.sin(k.aim + 2.4) * 22);
    ctx.lineTo(ex + Math.cos(k.aim - 2.4) * 22, ey + Math.sin(k.aim - 2.4) * 22);
    ctx.closePath();
    ctx.fill();
  }

  drawBanner() {
    if (!this.banner) return;
    const { ctx } = this;
    const t = this.banner.t;
    const scale = Math.min(1, t / 0.18) * (1 + 0.15 * Math.exp(-t / 0.2));
    const alpha = t > 1 ? Math.max(0, 1 - (t - 1) / 0.4) : 1;
    ctx.save();
    ctx.translate(COURT.width / 2, COURT.height / 2);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.font = `700 200px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(this.banner.text, 0, 0);
    ctx.fillStyle = this.banner.color;
    ctx.fillText(this.banner.text, 0, 0);
    ctx.restore();
  }
}
