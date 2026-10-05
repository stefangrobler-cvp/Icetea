// Draws __NAME__ on a <canvas>. Only reads engine state, never changes it.

const FONT = 'Fredoka, "Avenir Next", system-ui, sans-serif';

export class Renderer {
  constructor(canvas, theme) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = theme;
    this.players = {}; // seat -> { avatar, color }
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const area = this.canvas.parentElement;
    this.w = area?.clientWidth || window.innerWidth;
    this.h = area?.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(state) {
    const { ctx, w, h, theme } = this;
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, w, h);

    // Catchers: a glowing bar in the player's colour, with their avatar.
    for (const [seat, c] of Object.entries(state.catchers)) {
      const p = this.players[seat] || {};
      const color = p.color || theme.line;
      const bh = c.size * h;
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(c.x * w - 8, c.y * h - bh / 2, 16, bh, 8);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = `${Math.round(h * 0.05)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.avatar || '', c.x * w, c.y * h - bh / 2 - h * 0.04);
    }

    // Stars.
    ctx.font = `${Math.round(h * 0.07)}px ${FONT}`;
    for (const star of state.stars) ctx.fillText('⭐', star.x * w, star.y * h);

    // Score: icons first.
    ctx.fillStyle = theme.text;
    ctx.font = `${Math.round(h * 0.06)}px ${FONT}`;
    ctx.fillText(`⭐ ${state.caught}    💨 ${state.missed}`, w / 2, h * 0.08);
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
  }
}
