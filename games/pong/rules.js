// Ping Pong rules: one paddle per side, score by getting the ball past it.

import { COURT, PADDLE, BALL, LANE, MAX_BOUNCE_ANGLE, BOOST } from './config.js';
import { capsuleContact, reflect, setVelocity, applyTraction, limitAngle } from './physics.js';

const DEG = Math.PI / 180;

function paddle({ id, side, slot = null, color, h }) {
  const w = PADDLE.width;
  return {
    id, side, slot, color, h, w,
    lane: LANE.MAIN,
    kind: 'main',
    human: slot !== null,
    x: side === 'left' ? PADDLE.inset + w / 2 : COURT.width - PADDLE.inset - w / 2,
    y: COURT.height / 2,
    offsets: [0], // one "player" on this paddle, in its middle
    minY: h / 2,
    maxY: COURT.height - h / 2,
    facing: side === 'left' ? 1 : -1, // which way the hitting face points
  };
}

export const rules = {
  id: 'classic',

  ballSpeed: (diff) => diff.ballSpeed,

  /**
   * `sides` maps each player's seat to 'left' or 'right'; `colors` maps seat -> colour,
   * plus `cpu`; `boosts` maps seat -> 0..2 (a longer paddle for a younger player).
   */
  createPaddles({ mode, diff, slots, sides, colors, boosts = {} }) {
    const h = diff.paddleHeight;
    const hFor = (slot) => Math.round(Math.min(h * (BOOST[boosts[slot]] || 1), COURT.height * 0.45));
    if (mode === 'versus') {
      return slots.map((slot) => paddle({ id: `p${slot}`, side: sides[slot], slot, color: colors[slot], h: hFor(slot) }));
    }
    // Team: each kid gets their own paddle on the left; they can overlap freely.
    const list = slots.map((slot) => paddle({ id: `p${slot}`, side: 'left', slot, color: colors[slot], h: hFor(slot) }));
    list.push(paddle({ id: 'cpu', side: 'right', color: colors.cpu, h }));
    return list;
  },

  collide(engine, events) {
    const { ball } = engine.state;
    const r = BALL.radius;
    const speed = engine.speed;
    // In team mode two paddles can overlap: the one closest to the ball takes the hit.
    let best = null;
    for (const p of engine.state.paddles) {
      const c = capsuleContact(ball, r, p.x, p.y, p.h, p.w);
      if (c && (!best || c.depth > best.c.depth)) best = { p, c };
    }
    if (!best) return;
    const { p, c } = best;

    const inFront = (ball.x - p.x) * p.facing > 0;
    const comingAtFace = ball.vx * p.facing < 0;
    let power = 0;
    if (c.onFace && inFront && comingAtFace) {
      // Classic pong: where it hits the paddle sets the angle...
      setVelocity(ball, c.along * MAX_BOUNCE_ANGLE * DEG, speed);
      ball.vx *= p.facing;
      // ...and a swipe while hitting drags it further and gives it curve.
      power = applyTraction(ball, p.vy, speed);
      ball.x = p.x + p.facing * (p.w / 2 + r);
      limitAngle(ball, speed, p.facing);
      events.push({ type: 'hit', paddle: p.id, x: ball.x, y: ball.y, nx: p.facing, ny: 0, power: Math.abs(power) });
    } else {
      // Hit the rounded end of a paddle: bounce off it naturally.
      ball.x += c.nx * c.depth;
      ball.y += c.ny * c.depth;
      if (reflect(ball, c.nx, c.ny)) {
        limitAngle(ball, speed, c.nx);
        events.push({ type: 'hit', paddle: p.id, x: ball.x, y: ball.y, nx: c.nx, ny: c.ny, power: 0 });
      }
    }
  },

  /** Returns the side that scored, or null. */
  endZone(engine) {
    const { ball } = engine.state;
    const r = BALL.radius;
    if (ball.x + r < 0) return 'right';
    if (ball.x - r > COURT.width) return 'left';
    return null;
  },
};
