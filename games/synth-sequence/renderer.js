// Draws Synth Sequence on a <canvas>. Only reads engine state, never changes it.
// A round neon synthesizer: four glowing pad segments around a ring, light rings
// blooming out on each note, and equaliser bars dancing around the edge.

import { WORLD, PADS, HEARTS, COLORS } from './config.js';

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
const CX = WORLD.width / 2;
const CY = 480;
const R_OUT = 290;
const R_IN = 135;
const BARS = 48;
// Pads sit like the phone's 2 x 2 grid: cyan top-left, pink top-right, yellow bottom-left, green bottom-right.
const ANGLES = [Math.PI * 1.25, Math.PI * 1.75, Math.PI * 0.75, Math.PI * 0.25]; // centre of each segment

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.players = {}; // seat -> { avatar, color }
    this.glow = [0, 0, 0, 0]; // how brightly each pad glows (fades out)
    this.rings = []; // light rings blooming out
    this.bars = new Array(BARS).fill(0);
    this.shake = 0;
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

  /** Light a pad (from the playback or a press). */
  hit(pad, strong = 1) {
    this.glow[pad] = 1;
    this.rings.push({ pad, t: 0, strong });
    // Kick the equaliser bars nearest that pad.
    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * TAU;
      const d = Math.abs(Math.atan2(Math.sin(a - ANGLES[pad]), Math.cos(a - ANGLES[pad])));
      this.bars[i] = Math.max(this.bars[i], Math.max(0, 1 - d / 1.2) * strong);
    }
  }

  handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'show') this.hit(ev.pad, 1);
      else if (ev.type === 'note') this.hit(ev.pad, 0.7);
      else if (ev.type === 'oops') this.shake = 0.4;
    }
  }

  draw(state, dt) {
    const { ctx } = this;
    this.time += dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.w, this.h);
    const jx = this.shake > 0 ? (Math.random() - 0.5) * 16 * this.shake * this.scale : 0;
    this.shake = Math.max(0, this.shake - dt);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox + jx, this.oy);

    // The screen keeps a pad lit for as long as the engine says.
    if (state.lit !== null && state.lit !== undefined) this.glow[state.lit] = 1;
    this.drawBars(dt);
    this.drawRings(dt);
    this.drawBoard(state, dt);
    this.drawCentre(state);
    this.drawHud(state);
    this.drawOverlay(state);
  }

  drawBars(dt) {
    const { ctx } = this;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * TAU;
      const idle = 0.08 + 0.05 * Math.sin(this.time * 3 + i);
      const v = Math.max(idle, this.bars[i]);
      this.bars[i] = Math.max(0, this.bars[i] - dt * 1.6);
      const pad = this.padAt(a);
      ctx.strokeStyle = PADS[pad].color;
      ctx.globalAlpha = 0.35 + 0.6 * v;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(a) * (R_OUT + 24), CY + Math.sin(a) * (R_OUT + 24));
      ctx.lineTo(CX + Math.cos(a) * (R_OUT + 30 + v * 70), CY + Math.sin(a) * (R_OUT + 30 + v * 70));
      ctx.stroke();
    }
    ctx.restore();
  }

  padAt(a) {
    let best = 0;
    let bestD = 9;
    ANGLES.forEach((c, i) => {
      const d = Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c)));
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  drawRings(dt) {
    const { ctx } = this;
    ctx.save();
    for (const r of this.rings) {
      r.t += dt;
      const k = r.t / 0.8;
      ctx.globalAlpha = Math.max(0, (1 - k) * 0.7 * r.strong);
      ctx.strokeStyle = PADS[r.pad].color;
      ctx.lineWidth = 8 * (1 - k) + 2;
      ctx.beginPath();
      ctx.arc(CX, CY, R_OUT + 20 + k * 260, ANGLES[r.pad] - Math.PI / 4, ANGLES[r.pad] + Math.PI / 4);
      ctx.stroke();
    }
    this.rings = this.rings.filter((r) => r.t < 0.8);
    ctx.restore();
  }

  drawBoard(state, dt) {
    const { ctx } = this;
    for (let i = 0; i < 4; i++) {
      const g = this.glow[i];
      if (state.lit !== i) this.glow[i] = Math.max(0, g - dt * 3);
      const a0 = ANGLES[i] - Math.PI / 4 + 0.05;
      const a1 = ANGLES[i] + Math.PI / 4 - 0.05;
      const color = PADS[i].color;
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, R_OUT, a0, a1);
      ctx.arc(CX, CY, R_IN, a1, a0, true);
      ctx.closePath();
      // Glow: a wide faint stroke, brighter when lit.
      ctx.lineWidth = 16 + 30 * g;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.15 + 0.35 * g;
      ctx.stroke();
      ctx.globalAlpha = 1;
      const fill = ctx.createRadialGradient(CX, CY, R_IN, CX, CY, R_OUT);
      fill.addColorStop(0, `${color}${g > 0.05 ? 'ee' : '30'}`);
      fill.addColorStop(1, `${color}${g > 0.05 ? 'aa' : '18'}`);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      ctx.stroke();
      // Team relay: whose colour this is.
      const owner = state.mode === 'team' ? state.owners[i] : null;
      if (owner) {
        const mid = (R_OUT + R_IN) / 2;
        ctx.font = `64px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.fillText((this.players[owner] || {}).avatar || '🙂', CX + Math.cos(ANGLES[i]) * mid, CY + Math.sin(ANGLES[i]) * mid);
      }
      ctx.restore();
    }
  }

  // The middle: what to do now (👀 watch, 🎹 play), and the pattern as dots.
  drawCentre(state) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = '#0b0720';
    ctx.strokeStyle = '#ffffff33';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CX, CY, R_IN - 14, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    let icon = '🎵';
    if (state.phase === 'show') icon = '👀';
    else if (state.phase === 'input') icon = '🎹';
    else if (state.phase === 'result') icon = state.result === 'oops' ? '🔁' : '✨';
    const pulse = state.phase === 'input' ? 1 + 0.06 * Math.sin(this.time * 6) : 1;
    ctx.font = `${Math.round(96 * pulse)}px ${FONT}`;
    ctx.fillText(icon, CX, CY - 18);
    // Pattern length: one dot per note (team: filled as the team plays them).
    const n = state.sequence.length;
    const size = n > 12 ? 9 : 12;
    const gap = size * 2.4;
    const perRow = Math.min(n, 8);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 8);
      const col = i % 8;
      const rowCount = Math.min(perRow, n - row * 8);
      const x = CX + (col - (rowCount - 1) / 2) * gap;
      const y = CY + 62 + row * gap;
      const played = state.mode === 'team' ? i < state.pos && state.phase === 'input' : false;
      const shown = state.phase === 'show' && i <= state.showAt;
      ctx.fillStyle = played || shown ? '#ffffff' : 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawHud(state) {
    const { ctx } = this;
    ctx.save();
    ctx.textBaseline = 'middle';
    if (state.mode === 'team') {
      ctx.textAlign = 'left';
      ctx.font = `46px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText('❤️'.repeat(state.hearts) + '🖤'.repeat(HEARTS - state.hearts), 40, 60);
      // The computer's best, to beat.
      ctx.textAlign = 'right';
      ctx.font = `bold 48px ${FONT}`;
      ctx.fillText(`🎵 ${state.best}  /  🤖 ${state.goal}`, WORLD.width - 40, 60);
    } else {
      // Players down the sides: who they are, how they did this round, hearts.
      const ps = Object.values(state.players).sort((a, b) => a.seat - b.seat);
      ps.forEach((p, i) => {
        const x = i % 2 === 0 ? 210 : WORLD.width - 210;
        const y = ps.length > 2 ? (i < 2 ? 360 : 620) : 480;
        const avatar = (this.players[p.seat] || {}).avatar || '🙂';
        let mark = '';
        if (p.out) mark = '💔';
        else if (state.phase === 'input') mark = p.done ? (p.last === 'good' ? '✅' : '❌') : '🎹';
        ctx.globalAlpha = p.out ? 0.35 : 1;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = `70px ${FONT}`;
        ctx.fillText(`${avatar}${mark ? ` ${mark}` : ''}`, x, y);
        ctx.font = `34px ${FONT}`;
        ctx.fillText('❤️'.repeat(p.hearts) + '🖤'.repeat(HEARTS - p.hearts), x, y + 64);
      });
      ctx.globalAlpha = 1;
      ctx.textAlign = 'right';
      ctx.font = `bold 48px ${FONT}`;
      ctx.fillText(`🎵 ${state.sequence.length}`, WORLD.width - 40, 60);
    }
    ctx.restore();
  }

  drawOverlay(state) {
    const { ctx } = this;
    if (state.phase !== 'countdown') return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const k = state.timer % 1;
    ctx.font = `bold ${Math.round(160 + 60 * k)}px ${FONT}`;
    ctx.fillStyle = COLORS.text;
    ctx.globalAlpha = 0.4 + 0.6 * k;
    ctx.fillText(String(Math.max(1, Math.ceil(state.timer))), CX, CY);
    ctx.restore();
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
  }
}
