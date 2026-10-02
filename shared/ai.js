// The computer player used in "Team vs computer" mode.
// It only reads the game state and moves its own paddle, like a human would.

import { COURT, BALL } from './config.js';

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
    this.targetY = COURT.height / 2;
    this.tracking = false; // true while the ball is heading our way
    this.error = 0;
  }

  /** Move `paddle` (which belongs to this computer) for `dt` seconds. */
  update(dt, ball, paddle, ballInPlay) {
    const s = this.settings;
    const comingTowardsUs = ballInPlay && Math.sign(ball.vx) === (paddle.side === 'right' ? 1 : -1);

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
        goal = aimAt + this.error;
      }
    } else {
      goal = COURT.height / 2; // drift back to the middle while waiting
    }
    this.targetY = goal;

    const maxStep = s.maxSpeed * dt;
    const diff = goal - paddle.y;
    paddle.y += Math.max(-maxStep, Math.min(maxStep, diff));
  }
}

/** Where (y) will the ball be when it reaches x, counting wall bounces. */
export function predictLandingY(ball, x) {
  if (ball.vx === 0) return ball.y;
  const t = (x - ball.x) / ball.vx;
  if (t < 0) return ball.y;
  const r = BALL.size / 2;
  const top = r;
  const span = COURT.height - 2 * r;
  // Unfold the bounces: the ball travels in a straight line on a mirrored strip.
  let y = ball.y + ball.vy * t - top;
  y = ((y % (2 * span)) + 2 * span) % (2 * span);
  if (y > span) y = 2 * span - y;
  return y + top;
}
