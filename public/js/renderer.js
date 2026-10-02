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
  }

  pointScored() {
    this.flash = 1;
  }

  draw(state, dt = 1 / 60) {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);

    // Court border (drawn twice: a wide soft glow, then a tighter bright one)
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 6;
    for (const blur of [40, 12]) {
      this.glow(COLORS.line, blur);
      ctx.strokeRect(0, 0, COURT.width, COURT.height);
    }

    // Dashed centre line
    ctx.fillStyle = COLORS.line;
    for (let y = 18; y < COURT.height; y += 54) ctx.fillRect(COURT.width / 2 - 4, y, 8, 30);

    // Scores, tinted with the colour of each side (hidden in the lobby)
    if (state.paddles.length === 0) {
      ctx.shadowBlur = 0;
      return;
    }
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
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.12})`;
      ctx.fillRect(0, 0, COURT.width, COURT.height);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }
    ctx.shadowBlur = 0;
  }

  neonRect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    for (const blur of [50, 16]) {
      this.glow(color, blur);
      this.ctx.fillRect(x, y, w, h);
    }
  }

  glow(color, blur) {
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = blur * this.scale;
  }

  drawNumber(n, x, y, color, align) {
    const text = String(n);
    const px = 22; // size of one "pixel" of a digit
    const digitW = px * 3;
    const gap = px;
    const totalW = text.length * digitW + (text.length - 1) * gap;
    let cx = align === 'right' ? x - totalW : x;
    this.glow(color, 36);
    this.ctx.fillStyle = color;
    for (const ch of text) {
      const bits = DIGITS[Number(ch)];
      for (let i = 0; i < 15; i++) {
        if (bits[i] === '1') this.ctx.fillRect(cx + (i % 3) * px, y + Math.floor(i / 3) * px, px, px);
      }
      cx += digitW + gap;
    }
  }
}
