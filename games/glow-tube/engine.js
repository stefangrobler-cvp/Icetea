// Glow Tube's rules: plain logic with no drawing, sound or page code, so it can be
// tested on its own (test/glow-tube.test.js).
//
// Everyone rides a skateboard down the same neon half-pipe, side by side at the same
// speed, from the start line to the finish line. Each player steers across the tube
// (up the left wall, along the bottom, up the right wall) to catch crystals in their
// own colour. Dark obstacles make a rider tumble for a moment (they miss crystals),
// but nobody is ever knocked out.
//
// Race: the most crystals at the finish wins (a draw if the best are equal).
// Team: everyone's crystals go in one jar; fill it to the goal by the finish, or the
// computer wins.
//
// The whole track is laid out at the start (from the injected rng), so a match can be
// replayed exactly in tests.

import { TUBE, COUNTDOWN, STEER_SPEED, CRYSTAL, OBSTACLE, TUMBLE, BOOST, DIFFICULTIES } from './config.js';

export const PHASE = { COUNTDOWN: 'countdown', RIDING: 'riding', OVER: 'over' };
const START_AT = 30; // metres of empty tube after the start line

export class Engine {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.difficulty = 'easy';
    this.paused = false;
    this.pending = [];
    this.state = { phase: PHASE.OVER, riders: {}, crystals: [], obstacles: [], distance: 0, winner: null };
  }

  setDifficulty(id) {
    if (DIFFICULTIES[id]) this.difficulty = id;
  }

  get settings() { return DIFFICULTIES[this.difficulty]; }

  /** mode 'race' or 'team'; players: [{ seat, side, color, boost }] */
  startMatch(mode, players) {
    const s = this.settings;
    this.pending = [];
    this.state = {
      mode,
      phase: PHASE.COUNTDOWN,
      countdown: COUNTDOWN,
      length: s.length,
      speed: s.speed,
      distance: 0,
      riders: {},
      crystals: [], // { id, seat, d, a, taken }
      obstacles: [], // { id, d, a, width }
      goal: 0,
      winner: null,
    };
    this.nextId = 1;
    const seats = players.map((p) => p.seat);
    players.forEach((p, i) => this.addRider(p, i, players.length));
    this.layTrack(seats);
  }

  addRider({ seat, side, color, boost = 0 }, index = 0, count = 1) {
    // Riders start spread across the bottom of the tube.
    const a = count > 1 ? (index / (count - 1) - 0.5) * TUBE.maxAngle * 0.8 : 0;
    this.state.riders[seat] = { seat, side, color, boost, a, target: a, caught: 0, tumble: 0, spin: 0 };
  }

  /** A kid joined mid-ride (team mode): they get a board and crystals from here on. */
  addPlayer(seat, info = {}) {
    const s = this.state;
    if (s.mode !== 'team' || s.riders[seat] || s.phase === PHASE.OVER) return false;
    this.addRider({ seat, side: 'team', ...info });
    this.layCrystals(seat, s.distance + 30, this.groupSizes.filter((g) => g.d > s.distance + 30));
    s.goal = this.teamGoal();
    return true;
  }

  // ---------- the track ----------

  layTrack(seats) {
    const s = this.state;
    const end = s.length - 15;
    // Obstacles first, evenly spaced with a little jitter, at random places across the tube.
    for (let d = START_AT + 20; d < end; d += this.settings.obstacleEvery * (0.8 + this.rng() * 0.4)) {
      s.obstacles.push({ id: this.nextId++, d, a: this.across(0.95), width: OBSTACLE.width });
    }
    // Crystal trails: everyone gets the same number of trails of the same sizes at the
    // same distances (fair), each at their own place across the tube.
    this.groupSizes = [];
    for (let d = START_AT; d < end; ) {
      const n = CRYSTAL.groupMin + Math.floor(this.rng() * (CRYSTAL.groupMax - CRYSTAL.groupMin + 1));
      this.groupSizes.push({ d, n });
      d += n * CRYSTAL.gap + CRYSTAL.groupGap;
    }
    for (const seat of seats) this.layCrystals(seat, 0, this.groupSizes);
    s.goal = this.teamGoal();
  }

  layCrystals(seat, from, groups) {
    for (const { d, n } of groups) {
      if (d < from) continue;
      // Each trail starts somewhere across the tube and drifts a little.
      let a = this.across(this.settings.spread);
      const drift = (this.rng() * 2 - 1) * 0.12;
      for (let k = 0; k < n; k++) {
        const cd = d + k * CRYSTAL.gap;
        a = Math.max(-TUBE.maxAngle, Math.min(TUBE.maxAngle, a + drift));
        // Never right behind an obstacle: move the crystal to the other side of the tube.
        const block = this.state.obstacles.find((o) => Math.abs(o.d - cd) < OBSTACLE.keepClear && Math.abs(o.a - a) < o.width + 0.25);
        const ca = block ? Math.max(-TUBE.maxAngle, Math.min(TUBE.maxAngle, block.a + (block.a > 0 ? -1 : 1) * (block.width + 0.45))) : a;
        this.state.crystals.push({ id: this.nextId++, seat, d: cd, a: ca, taken: false });
      }
    }
  }

  /** A random place across the tube, within `share` of the way up the walls. */
  across(share) {
    return (this.rng() * 2 - 1) * TUBE.maxAngle * share;
  }

  teamGoal() {
    const s = this.state;
    if (s.mode !== 'team') return 0;
    return Math.max(1, Math.round(s.crystals.length * this.settings.goal));
  }

  // ---------- input ----------

  /** Steering: -1 (all the way up the left wall) .. 1 (up the right wall). */
  steer(seat, value) {
    const r = this.state.riders[seat];
    if (!r || typeof value !== 'number' || !Number.isFinite(value)) return;
    r.target = Math.max(-1, Math.min(1, value)) * TUBE.maxAngle;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  // ---------- the ride ----------

  step(dt) {
    const s = this.state;
    if (this.paused || s.phase === PHASE.OVER) return this.flush();

    if (s.phase === PHASE.COUNTDOWN) {
      const before = Math.ceil(s.countdown);
      s.countdown -= dt;
      if (Math.ceil(s.countdown) !== before && s.countdown > 0) this.pending.push({ type: 'countdown', n: Math.ceil(s.countdown) });
      if (s.countdown <= 0) {
        s.phase = PHASE.RIDING;
        this.pending.push({ type: 'go' });
      }
      return this.flush();
    }

    const from = s.distance;
    s.distance = Math.min(s.length, s.distance + s.speed * dt);
    for (const r of Object.values(s.riders)) this.ride(r, dt, from, s.distance);

    if (s.distance >= s.length) this.finish();
    return this.flush();
  }

  ride(r, dt, from, to) {
    const s = this.state;
    if (r.tumble > 0) {
      r.tumble = Math.max(0, r.tumble - dt);
      r.spin += dt * 12;
      if (r.tumble === 0) r.spin = 0;
    } else {
      // Help: a gentle pull towards this rider's next crystal.
      let target = r.target;
      const pull = BOOST.pull[r.boost] || 0;
      if (pull > 0) {
        const next = s.crystals.find((c) => c.seat === r.seat && !c.taken && c.d > to && c.d < to + 12);
        if (next) target += (next.a - target) * pull * 0.5;
      }
      const maxMove = STEER_SPEED * dt;
      r.a += Math.max(-maxMove, Math.min(maxMove, target - r.a));
    }

    // Everything passed this frame.
    const reach = (CRYSTAL.catch * (BOOST.catch[r.boost] || 1)) / TUBE.radius; // as an angle
    if (r.tumble === 0) {
      for (const c of s.crystals) {
        if (c.taken || c.seat !== r.seat || c.d <= from || c.d > to) continue;
        if (Math.abs(c.a - r.a) <= reach) {
          c.taken = true;
          r.caught += 1;
          this.pending.push({ type: 'catch', seat: r.seat, id: c.id, d: c.d, a: c.a });
        }
      }
      for (const o of s.obstacles) {
        if (o.d <= from || o.d > to) continue;
        if (Math.abs(o.a - r.a) <= o.width) {
          r.tumble = TUMBLE;
          this.pending.push({ type: 'tumble', seat: r.seat, d: o.d, a: r.a });
          break;
        }
      }
    }
  }

  finish() {
    const s = this.state;
    s.phase = PHASE.OVER;
    const riders = Object.values(s.riders);
    if (s.mode === 'team') {
      s.winner = this.jar() >= s.goal ? 'team' : 'cpu';
    } else {
      const best = Math.max(...riders.map((r) => r.caught));
      const top = riders.filter((r) => r.caught === best);
      s.winner = top.length === 1 ? top[0].side : null;
    }
    this.pending.push({ type: 'finish', winner: s.winner });
  }

  /** Team mode: every crystal in the jar. */
  jar() {
    return Object.values(this.state.riders).reduce((n, r) => n + r.caught, 0);
  }

  /** Each side's score: crystals caught (team: the jar against the goal still to go). */
  scores() {
    const s = this.state;
    if (s.mode === 'team') return { team: this.jar(), cpu: 0 };
    return Object.fromEntries(Object.values(s.riders).map((r) => [r.side, r.caught]));
  }

  flush() {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** Where everything is, for drawing (only what's near enough to see). */
  view(ahead = 140) {
    const s = this.state;
    // Things just passed vanish (they'd loom past the camera).
    const near = (x, behind) => x.d > s.distance - behind && x.d < s.distance + ahead;
    return {
      mode: s.mode,
      phase: s.phase,
      countdown: s.countdown,
      length: s.length,
      distance: s.distance,
      progress: s.length ? s.distance / s.length : 0,
      goal: s.goal,
      jar: this.jar(),
      winner: s.winner,
      riders: Object.values(s.riders).map((r) => ({ seat: r.seat, side: r.side, color: r.color, a: r.a, caught: r.caught, tumble: r.tumble, spin: r.spin, boost: r.boost })),
      crystals: s.crystals.filter((c) => !c.taken && near(c, 1)),
      obstacles: s.obstacles.filter((o) => near(o, 3)),
    };
  }
}
