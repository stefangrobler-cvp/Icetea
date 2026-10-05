// Draws Pong flat on a 2D <canvas>: the fallback for screens that cannot do 3D (no WebGL).
// Effects (bounces, ripples, wobbling paddles) are driven by the engine's events.

import { COURT, BALL, COLORS, TOSS_SECONDS } from './config.js';

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
    this.players = {}; // seat -> { avatar, color }, for the coin toss
    this.mode = 'versus';
    this.caption = null; // { text, color } shown in a pill at the bottom
    this.bigText = null; // countdown number in the middle
    this.replaying = false;
    this.ctx = canvas.getContext('2d');
    this.flash = 0; // brief glow after a point
    this.shake = 0;
    this.ripples = [];
    this.squash = null; // ball squash after a bounce
    this.wobble = new Map(); // paddle id -> { t, amp }
    this.trail = [];
    this.pop = { left: 1, right: 1 }; // score pop animation timers
    this.banner = null; // "GOAL!"
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    // Once the rounded font has loaded, redraw the cached score pictures with it.
    document.fonts?.ready.then(() => { this.sprites.clear(); });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Fill the area the platform gave us (falls back to the whole window).
    const area = this.canvas.parentElement;
    const w = area?.clientWidth || window.innerWidth;
    const h = area?.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // Fit the 16:9 court inside the screen with a small margin.
    const scale = Math.min(w / (COURT.width + 60), h / (COURT.height + 20));
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
      }
    }
  }

  sideColor(state, side) {
    return state.paddles.find((p) => p.side === side)?.color || COLORS.line;
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
    this.tickEffects(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake * 30 * this.scale;
      sy = (Math.random() - 0.5) * this.shake * 30 * this.scale;
    }
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX + sx, this.offsetY + sy);

    this.drawSprite(this.courtSprite(), 0, 0);
    if (state.paddles.length === 0) return; // nothing to play yet: just the empty court

    this.drawBigScores(state);
    for (const p of state.paddles) this.drawPaddle(p, state.paddles.length > 2 && p.side === 'left');

    this.drawRipples();
    this.drawBall(state, dt);
    if (state.phase === 'toss') this.drawToss(state);
    this.drawBanner();
    this.drawOverlay();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.1})`;
      ctx.fillRect(0, 0, COURT.width, COURT.height);
    }
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
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

  drawBall(state) {
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
    const trailColor = '160,200,255';
    for (let i = 0; i < this.trail.length - 1; i++) {
      const k = (i + 1) / this.trail.length;
      ctx.fillStyle = `rgba(${trailColor},${k * 0.22})`;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, r * (0.4 + 0.6 * k), 0, TAU);
      ctx.fill();
    }

    // Soft glow
    const glow = this.sprite('ballglow', r * 2, r * 2, 40, (c) => {
      const g = c.createRadialGradient(r, r, r * 0.5, r, r, r + 40);
      g.addColorStop(0, 'rgba(170,210,255,0.8)');
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
    ctx.fillStyle = 'rgba(160,200,255,0.5)';
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.3, r * 0.35, 0, TAU);
    ctx.fill();
    ctx.restore();
  }


  /** Short name for a side, as printed on the coin. */
  sideLabel(state, side) {
    const avatar = (slot) => this.players[slot]?.avatar || `P${slot}`;
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


  // Countdown number, a caption pill ("🦁 Leo serves first!") and the replay label.
  drawOverlay() {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.bigText) {
      ctx.font = `700 260px ${FONT}`;
      ctx.lineWidth = 12;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(this.bigText, COURT.width / 2, COURT.height / 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.bigText, COURT.width / 2, COURT.height / 2);
    }
    if (this.caption) {
      ctx.font = `600 44px ${FONT}, "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      const w = ctx.measureText(this.caption.text).width + 70;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.roundRect(COURT.width / 2 - w / 2, COURT.height - 110, w, 76, 38);
      ctx.fill();
      ctx.fillStyle = this.caption.color || '#ffffff';
      ctx.fillText(this.caption.text, COURT.width / 2, COURT.height - 70);
    }
    if (this.replaying) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 200);
      ctx.font = `700 46px ${FONT}, "Apple Color Emoji", sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ff4d6d';
      ctx.fillText('🎬 REPLAY', 30, 50);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'right';
      ctx.font = `500 30px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('Tap to skip', COURT.width - 30, COURT.height - 30);
    }
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
