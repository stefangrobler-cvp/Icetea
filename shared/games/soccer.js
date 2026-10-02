// Foosball-style soccer: two rods per team, three players on each rod.
// The ball bounces off every wall except the goal mouths at each end.

import { COURT, BALL, COLORS, LANE, SOCCER, TRACTION } from '../config.js';
import { capsuleContact, limitAngle, swipeStrength } from '../physics.js';

const goalTop = () => COURT.height / 2 - SOCCER.goalHeight / 2;
const goalBottom = () => COURT.height / 2 + SOCCER.goalHeight / 2;
const POST_RADIUS = 7;

function rod({ side, lane, slot = null, color, diff }) {
  const h = Math.round(diff.paddleHeight * SOCCER.playerLength);
  const S = SOCCER.playerSpacing;
  const n = SOCCER.playersPerRod;
  const offsets = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * S);
  const reach = offsets[offsets.length - 1];
  return {
    id: `${side}-${lane === LANE.DEFENCE ? 'def' : 'att'}`,
    side, lane, slot, color, h,
    kind: lane === LANE.DEFENCE ? 'def' : 'att',
    w: SOCCER.playerWidth,
    human: slot !== null,
    x: SOCCER.rodX[side][lane] * COURT.width,
    y: COURT.height / 2,
    offsets,
    // The outer players can just reach the walls.
    minY: reach + h / 2,
    maxY: COURT.height - reach - h / 2,
    facing: null, // players can kick with either side
  };
}

export const soccer = {
  id: 'soccer',

  ballSpeed: (diff) => diff.ballSpeed * SOCCER.ballSpeed,

  createPaddles({ mode, diff, slots }) {
    const team = (side, owners, color) => [
      rod({ side, lane: LANE.DEFENCE, slot: owners[0], color: color(owners[0]), diff }),
      rod({ side, lane: LANE.ATTACK, slot: owners[1], color: color(owners[1]), diff }),
    ];
    const kidColor = (slot) => COLORS[slot];
    if (mode === 'versus') {
      // Each kid works both of their team's rods (one thumb each).
      return [...team('left', [1, 1], kidColor), ...team('right', [2, 2], kidColor)];
    }
    // Team v computer: with two kids, one takes defence and the other attack.
    const owners = slots.length >= 2 ? [slots[0], slots[1]] : [slots[0], slots[0]];
    return [...team('left', owners, kidColor), ...team('right', [null, null], () => COLORS.cpu)];
  },

  collide(engine, events) {
    const { ball } = engine.state;
    const r = BALL.radius;
    const speed = engine.speed;
    for (const p of engine.state.paddles) {
      for (const o of p.offsets) {
        const c = capsuleContact(ball, r, p.x, p.y + o, p.h, p.w);
        if (!c) continue;
        // Push the ball out of the player.
        ball.x += c.nx * c.depth;
        ball.y += c.ny * c.depth;
        // Bounce relative to the moving rod, so a moving player "kicks" the ball.
        const rvx = ball.vx;
        const rvy = ball.vy - p.vy;
        const dot = rvx * c.nx + rvy * c.ny;
        if (dot >= 0) continue; // already moving apart
        let vx = rvx - 2 * dot * c.nx;
        let vy = rvy - 2 * dot * c.ny + p.vy;
        const len = Math.hypot(vx, vy) || 1;
        ball.vx = (vx / len) * speed;
        ball.vy = (vy / len) * speed;
        // A swipe while kicking puts curve on the ball, like in ping pong.
        const k = swipeStrength(p.vy);
        ball.spin = Math.abs(c.nx) > 0.4 ? k * TRACTION.spin : 0;
        limitAngle(ball, speed, c.nx);
        events.push({ type: 'hit', paddle: p.id, x: ball.x, y: ball.y, nx: c.nx, ny: c.ny, power: Math.abs(k) });
        return; // one kick per step is plenty
      }
    }
  },

  /** Ends of the pitch: walls with a goal in the middle. Returns who scored, or null. */
  endZone(engine, events) {
    const { ball } = engine.state;
    const r = BALL.radius;
    const W = COURT.width;
    const top = goalTop();
    const bottom = goalBottom();

    // Goal posts: small round bumpers at each corner of both goal mouths.
    for (const px of [0, W]) {
      for (const py of [top, bottom]) {
        const dx = ball.x - px;
        const dy = ball.y - py;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < r + POST_RADIUS) {
          const nx = dx / d;
          const ny = dy / d;
          ball.x = px + nx * (r + POST_RADIUS);
          ball.y = py + ny * (r + POST_RADIUS);
          const dot = ball.vx * nx + ball.vy * ny;
          if (dot < 0) {
            ball.vx -= 2 * dot * nx;
            ball.vy -= 2 * dot * ny;
            ball.spin = 0;
            limitAngle(ball, engine.speed, nx || (px === 0 ? 1 : -1));
            events.push({ type: 'post', x: px, y: py, nx, ny });
          }
          return null;
        }
      }
    }

    const inMouth = ball.y > top && ball.y < bottom;
    for (const [lineX, dir, scorer] of [[0, 1, 'right'], [W, -1, 'left']]) {
      const past = (lineX - ball.x) * dir; // how far past this end line the ball centre is
      if (past + r <= 0) continue; // nowhere near this end
      if (inMouth || past > 0) {
        // Inside the goal: the sides of the net keep it in.
        if (ball.y - r < top) { ball.y = top + r; ball.vy = Math.abs(ball.vy); }
        if (ball.y + r > bottom) { ball.y = bottom - r; ball.vy = -Math.abs(ball.vy); }
        if (past > r) return scorer; // whole ball over the line: GOAL!
      } else {
        // The end wall either side of the goal.
        ball.x = lineX + dir * r;
        ball.vx = Math.abs(ball.vx) * dir;
        ball.spin = -(ball.spin || 0) * 0.5;
        // Nudge the angle a touch so the ball can't get stuck bouncing in a line forever.
        const a = Math.atan2(ball.vy, Math.abs(ball.vx)) + (engine.rng() - 0.5) * 0.06;
        ball.vx = Math.cos(a) * engine.speed * dir;
        ball.vy = Math.sin(a) * engine.speed;
        limitAngle(ball, engine.speed, dir);
        events.push({ type: 'wall', x: lineX, y: ball.y, nx: dir, ny: 0 });
      }
    }
    return null;
  },

  goalTop,
  goalBottom,
};
