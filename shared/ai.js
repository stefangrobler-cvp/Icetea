// The computer player used in "Team vs computer" mode.
// It only reads the game state and moves its own paddle (or soccer rod), like a human would.

import { COURT, BALL } from './config.js';
import { clamp } from './physics.js';

export class ComputerPlayer {
  /**
   * @param {object} settings  difficulty.ai settings from config.js
   * @param {() => number} rng random number source (0..1), swappable in tests
   */
  constructor(settings, rng = Math.random) {
    this.settings = settings;
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.reactTimer = 0;
    this.targetY = null;
    this.tracking = false; // true while the ball is heading our way
    this.error = 0;
  }

  /** Move `paddle` (which belongs to this computer) for `dt` seconds. */
  update(dt, ball, paddle, ballInPlay) {
    const s = this.settings;
    const rod = paddle.offsets.length > 1; // soccer rod with several players
    const comingTowardsUs = ballInPlay && ball.vx !== 0 && Math.sign(ball.vx) === Math.sign(paddle.x - ball.x);
    if (this.targetY === null) this.targetY = paddle.y;

    if (comingTowardsUs && !this.tracking) {
      // Ball just turned our way: wait a moment, then pick a (slightly wrong) target.
      this.tracking = true;
      this.reactTimer = s.reaction;
      this.error = (this.rng() * 2 - 1) * s.aimError;
    } else if (!comingTowardsUs) {
      this.tracking = false;
    }

    let goal;
    if (this.tracking) {
      if (this.reactTimer > 0) {
        this.reactTimer -= dt;
        goal = this.targetY; // still "thinking", keep going where we were going
      } else {
        const aimAt = s.predict ? predictLandingY(ball, paddle.x) : ball.y;
        goal = placeFor(paddle, aimAt + this.error);
      }
    } else if (rod && ballInPlay) {
      goal = placeFor(paddle, ball.y); // rods keep shadowing the ball, ready for rebounds
    } else {
      goal = (paddle.minY + paddle.maxY) / 2; // drift back to the middle while waiting
    }
    this.targetY = goal;

    const maxStep = s.maxSpeed * dt;
    paddle.y = clamp(paddle.y + clamp(goal - paddle.y, -maxStep, maxStep), paddle.minY, paddle.maxY);
  }
}

/** Where the paddle/rod centre must be so one of its players is at y. */
function placeFor(paddle, y) {
  let best = paddle.y;
  let bestMiss = Infinity;
  for (const o of paddle.offsets) {
    const centre = clamp(y - o, paddle.minY, paddle.maxY);
    const miss = Math.abs(centre + o - y) + Math.abs(centre - paddle.y) * 0.01;
    if (miss < bestMiss) { bestMiss = miss; best = centre; }
  }
  return best;
}

/** Where (y) will the ball be when it reaches x, counting wall bounces. */
export function predictLandingY(ball, x) {
  if (ball.vx === 0) return ball.y;
  const t = (x - ball.x) / ball.vx;
  if (t < 0) return ball.y;
  const r = BALL.radius;
  const top = r;
  const span = COURT.height - 2 * r;
  // Unfold the bounces: the ball travels in a straight line on a mirrored strip.
  let y = ball.y + ball.vy * t - top;
  y = ((y % (2 * span)) + 2 * span) % (2 * span);
  if (y > span) y = 2 * span - y;
  return y + top;
}
