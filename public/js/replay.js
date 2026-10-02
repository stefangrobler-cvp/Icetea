// Slow-motion replay of the winning shot.
// While the ball is in play, the tablet records what the court looks like every
// frame (only the last few seconds are kept). When the match is won, it plays
// those frames back slowly, then shows the winner screen.

const KEEP_SECONDS = 3; // how much of the final rally to replay
const SPEED = 0.35; // replay speed (0.35 = about three times slower)
const HOLD_SECONDS = 1.2; // linger on the last frame (the goal) before the winner screen

export class Replay {
  constructor() {
    this.frames = [];
    this.playing = false;
    this.speed = SPEED;
  }

  /** Forget the rally so far (a point was scored, or a new match started). */
  clear() {
    this.frames = [];
  }

  /** Remember one frame of the court. `time` is in seconds. */
  record(time, state, events) {
    this.frames.push({
      time,
      ball: { ...state.ball },
      scores: { ...state.scores },
      paddles: state.paddles.map((p) => ({ ...p })),
      events: events.filter((e) => e.type !== 'win'),
    });
    while (this.frames.length && this.frames[0].time < time - KEEP_SECONDS) this.frames.shift();
  }

  start() {
    if (this.frames.length < 2) return false;
    this.playing = true;
    this.at = this.frames[0].time;
    this.index = 0;
    this.hold = HOLD_SECONDS;
    return true;
  }

  stop() {
    this.playing = false;
    this.frames = [];
  }

  /**
   * Move the replay on by `dt` real seconds. Returns the frame to draw and any
   * events (hits, bounces, the goal) that happened since last time, or null when finished.
   */
  advance(dt) {
    if (!this.playing) return null;
    const last = this.frames[this.frames.length - 1];
    if (this.at >= last.time) {
      this.hold -= dt;
      if (this.hold <= 0) {
        this.stop();
        return null;
      }
      return { frame: last, events: [] };
    }
    this.at += dt * this.speed;
    const events = [];
    while (this.index < this.frames.length - 1 && this.frames[this.index + 1].time <= this.at) {
      this.index += 1;
      events.push(...this.frames[this.index].events);
    }
    return { frame: this.frames[this.index], events };
  }
}
