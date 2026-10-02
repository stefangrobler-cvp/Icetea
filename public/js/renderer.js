// Draws the game on a <canvas>. Only reads engine state, never changes it.

import { COURT, BALL, COLORS } from '/shared/config.js';

// Chunky 3x5 pixel digits for the scores, classic arcade style.
const DIGITS = [
  '111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111',
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.flash = 0; // brief glow after a point
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // Fit the 16:9 court inside the screen with a small margin.
    const scale = Math.min(w / COURT.width, h / COURT.height) * 0.96;
    this.scale = scale * dpr;
    this.offsetX = ((w - COURT.width * scale) / 2) * dpr;
    this.offsetY = ((h - COURT.height * scale) / 2) * dpr;
    // Glow effects are slow to draw, so each one is drawn once into a
    // "sprite" and then just copied every frame. Sizes changed: redraw them.
    this.sprites = new Map();
    this.court = null;
  }

  pointScored() {
    this.flash = 1;
  }

  /**
   * A cached picture of something with a neon glow around it.
   * `draw(ctx)` paints it in court units with (0,0) at its top-left corner.
   */
  sprite(key, w, h, pad, draw) {
    let sp = this.sprites.get(key);
    if (!sp) {
      const c = document.createElement('canvas');
      c.width = Math.ceil((w + pad * 2) * this.scale);
      c.height = Math.ceil((h + pad * 2) * this.scale);
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

  // Court border and centre line never move: draw them once.
  courtSprite() {
    if (!this.court) {
      const pad = 40;
      this.court = this.sprite('court', COURT.width, COURT.height, pad, (ctx, scale) => {
        ctx.strokeStyle = COLORS.line;
        ctx.fillStyle = COLORS.line;
        ctx.lineWidth = 6;
        ctx.shadowColor = COLORS.line;
        for (const blur of [40, 12]) {
          ctx.shadowBlur = blur * scale;
          ctx.strokeRect(0, 0, COURT.width, COURT.height);
        }
        ctx.shadowBlur = 0;
        for (let y = 18; y < COURT.height; y += 54) ctx.fillRect(COURT.width / 2 - 4, y, 8, 30);
      });
    }
    return this.court;
  }

  neonRect(x, y, w, h, color) {
    const sp = this.sprite(`rect:${color}:${w}:${h}`, w, h, 50, (ctx, scale) => {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      for (const blur of [50, 16]) {
        ctx.shadowBlur = blur * scale;
        ctx.fillRect(0, 0, w, h);
      }
    });
    this.drawSprite(sp, x, y);
  }

  draw(state, dt = 1 / 60) {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);

    this.drawSprite(this.courtSprite(), 0, 0);

    // Scores, tinted with the colour of each side (hidden in the lobby)
    if (state.paddles.length === 0) return;
    const leftColor = state.paddles.find((p) => p.side === 'left')?.color || COLORS[1];
    const rightColor = state.paddles.find((p) => p.side === 'right')?.color || COLORS[2];
    this.drawNumber(state.scores.left, COURT.width / 2 - 140, 50, leftColor, 'right');
    this.drawNumber(state.scores.right, COURT.width / 2 + 140, 50, rightColor, 'left');

    // Paddles
    for (const p of state.paddles) {
      const x = p.side === 'left' ? p.x - p.w : p.x;
      ctx.globalAlpha = state.paddles.length > 2 && p.side === 'left' ? 0.85 : 1; // see overlaps in team mode
      this.neonRect(x, p.y - p.h / 2, p.w, p.h, p.color);
      ctx.globalAlpha = 1;
    }

    // Ball
    if (state.ball.visible) {
      const r = BALL.size / 2;
      this.neonRect(state.ball.x - r, state.ball.y - r, BALL.size, BALL.size, COLORS.ball);
    }

    // Flash the court after a point
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.12})`;
      ctx.fillRect(0, 0, COURT.width, COURT.height);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }
  }

  drawNumber(n, x, y, color, align) {
    const text = String(n);
    const px = 22; // size of one "pixel" of a digit
    const digitW = px * 3;
    const gap = px;
    const totalW = text.length * digitW + (text.length - 1) * gap;
    const sp = this.sprite(`num:${text}:${color}`, totalW, px * 5, 40, (ctx, scale) => {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 36 * scale;
      let cx = 0;
      for (const ch of text) {
        const bits = DIGITS[Number(ch)];
        for (let i = 0; i < 15; i++) {
          if (bits[i] === '1') ctx.fillRect(cx + (i % 3) * px, Math.floor(i / 3) * px, px, px);
        }
        cx += digitW + gap;
      }
    });
    this.drawSprite(sp, align === 'right' ? x - totalW : x, y);
  }
}
