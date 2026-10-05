// Small physics helpers shared by both games. Pure maths, no drawing.

import { TRACTION, MAX_TRAVEL_ANGLE } from './config.js';

const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Set the ball moving at `speed` in the direction `angle` (radians, 0 = right). */
export function setVelocity(ball, angle, speed) {
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
}

/**
 * Keep the ball from travelling too steeply (or straight up/down), while
 * keeping its speed. `preferX` picks the direction if vx is exactly 0.
 */
export function limitAngle(ball, speed, preferX = 1) {
  const dirX = Math.sign(ball.vx) || Math.sign(preferX) || 1;
  const max = MAX_TRAVEL_ANGLE * DEG;
  let a = Math.atan2(ball.vy, Math.abs(ball.vx)); // -90..90 deg, ignoring left/right
  const limited = Math.abs(a) > max;
  a = clamp(a, -max, max);
  ball.vx = Math.cos(a) * speed * dirX;
  ball.vy = Math.sin(a) * speed;
  return limited;
}

/** -1..1: how hard the paddle was swiping when it hit (smoothly levels off). */
export function swipeStrength(paddleVy) {
  return Math.tanh(paddleVy / TRACTION.refSpeed);
}

/**
 * Bend the ball's path in the direction the paddle was moving and give it a
 * little spin so it keeps curving that way for a moment.
 */
export function applyTraction(ball, paddleVy, speed) {
  const k = swipeStrength(paddleVy);
  if (Math.abs(k) < 0.02) {
    ball.spin = 0;
    return 0;
  }
  const dirX = Math.sign(ball.vx) || 1;
  // Angle of travel with "up/down" measured the same way for both directions.
  const a = Math.atan2(ball.vy, Math.abs(ball.vx)) + k * TRACTION.maxDeflect * DEG;
  ball.vx = Math.cos(a) * speed * dirX;
  ball.vy = Math.sin(a) * speed;
  ball.spin = k * TRACTION.spin; // positive = keeps curving downwards
  return k;
}

/** Curve the ball a little each step according to its spin, then let the spin fade. */
export function applySpin(ball, speed, dt) {
  if (!ball.spin) return;
  const dirX = Math.sign(ball.vx) || 1;
  const a = Math.atan2(ball.vy, Math.abs(ball.vx)) + ball.spin * dt;
  ball.vx = Math.cos(a) * speed * dirX;
  ball.vy = Math.sin(a) * speed;
  if (limitAngle(ball, speed)) ball.spin = 0;
  ball.spin *= Math.exp(-dt / TRACTION.spinFade);
  if (Math.abs(ball.spin) < 0.01) ball.spin = 0;
}

/**
 * Round ball against a rounded paddle (a "capsule": a vertical bar with round ends).
 * Returns null if they don't touch, else the contact normal (pointing at the ball)
 * and where along the paddle it touched (-1 top end .. 1 bottom end).
 */
export function capsuleContact(ball, r, px, py, length, width) {
  const radius = width / 2;
  const half = Math.max(0, length / 2 - radius);
  const cy = clamp(ball.y, py - half, py + half);
  const dx = ball.x - px;
  const dy = ball.y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist >= r + radius) return null;
  let nx = dx / dist;
  let ny = dy / dist;
  if (!Number.isFinite(nx)) { nx = -Math.sign(ball.vx) || 1; ny = 0; }
  return { nx, ny, depth: r + radius - dist, along: clamp((ball.y - py) / (length / 2), -1, 1), onFace: ball.y > py - half && ball.y < py + half };
}

/** Bounce the ball off a surface with normal (nx, ny), keeping its speed. */
export function reflect(ball, nx, ny) {
  const dot = ball.vx * nx + ball.vy * ny;
  if (dot >= 0) return false; // already moving away
  ball.vx -= 2 * dot * nx;
  ball.vy -= 2 * dot * ny;
  return true;
}

