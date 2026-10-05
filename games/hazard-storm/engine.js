// Hazard Storm's rules: plain logic with no drawing, sound or page code, so it can be
// tested on its own (test/hazard-storm.test.js).
//
// Every player is an orb on a track at the bottom of the screen, moving left and right.
// Hazards come from above: falling spikes, laser beams that slam down on a strip of
// the floor, and bouncing plasma balls. Each one blinks a warning first.
// Team mode: survive until the time runs out with a shared shield; 🔋 batteries refill it.
// Versus ("last one standing"): 3 hearts each, orbs bump each other; last one left wins.

import {
  WORLD, ARENA, TRACK_Y, ORB, DASH, BUMP, SHIELD, HEARTS, COUNTDOWN, BOOST,
  SPIKE, BEAM, BALL, BATTERY, DIFFICULTIES, VERSUS_TIME, VERSUS_RAMP, UNLOCK,
} from './config.js';

export const PHASE = { COUNTDOWN: 'countdown', PLAYING: 'playing', OVER: 'over' };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Engine {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.difficulty = 'easy';
    this.paused = false;
    this.pending = [];
    this.state = { phase: PHASE.OVER, orbs: {}, hazards: [], mode: 'team', winner: null };
  }

  setDifficulty(id) {
    if (DIFFICULTIES[id]) this.difficulty = id;
  }

  get settings() { return DIFFICULTIES[this.difficulty]; }

  /** players: [{ seat, side, boost }]; mode 'team' or 'versus' */
  startMatch(mode, players) {
    this.nextId = 1;
    this.pending = [];
    const s = {
      mode,
      phase: PHASE.COUNTDOWN,
      countdown: COUNTDOWN,
      elapsed: 0,
      time: mode === 'team' ? this.settings.time : VERSUS_TIME,
      shield: SHIELD,
      hits: 0,
      orbs: {},
      hazards: [],
      spawnIn: 0.6,
      batteryIn: BATTERY.every,
      winner: null,
    };
    this.state = s;
    const sorted = [...players].sort((a, b) => a.seat - b.seat);
    sorted.forEach((p, i) => {
      const x = ARENA.left + ((i + 1) / (sorted.length + 1)) * (ARENA.right - ARENA.left);
      this.addOrb(p, x);
    });
  }

  addOrb(p, x) {
    const boost = p.boost || 0;
    this.state.orbs[p.seat] = {
      seat: p.seat, side: p.side, boost,
      x, target: x, prevX: x, vx: 0, knock: 0,
      r: Math.round(ORB.radius * (BOOST.radius[boost] || 1)),
      dir: x < WORLD.width / 2 ? 1 : -1,
      ghost: 0, safe: 0, cooldown: 0, dashing: 0,
      hearts: HEARTS, out: false,
      lastInput: null,
    };
  }

  /** A kid joined a team game mid-storm: a new orb in the middle, safe for a moment. */
  addPlayer(p) {
    if (this.state.mode !== 'team' || this.state.orbs[p.seat]) return false;
    this.addOrb(p, WORLD.width / 2);
    this.state.orbs[p.seat].safe = 2;
    return true;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  /**
   * The swipe pad: 0 (left) .. 1 (right). It works like a trackpad, so the orb moves
   * by how far the value changed (a dash or a bump doesn't get undone), and at either
   * end of the pad the orb goes all the way to that side.
   */
  move(seat, value) {
    const o = this.state.orbs[seat];
    if (!o || typeof value !== 'number' || !Number.isFinite(value)) return;
    const v = clamp(value, 0, 1);
    const lo = ARENA.left + o.r;
    const hi = ARENA.right - o.r;
    if (o.lastInput !== null) o.target += (v - o.lastInput) * (hi - lo);
    o.lastInput = v;
    if (v <= 0.001) o.target = lo;
    if (v >= 0.999) o.target = hi;
    o.target = clamp(o.target, lo, hi);
  }

  /** The 💨 button: a quick dash sideways, see-through for a moment. */
  dash(seat) {
    const s = this.state;
    const o = s.orbs[seat];
    if (!o || o.out || o.cooldown > 0 || this.paused || s.phase !== PHASE.PLAYING) return false;
    const heading = Math.abs(o.target - o.x) > 6 ? Math.sign(o.target - o.x) : o.dir;
    let dir = heading;
    // Against a wall: dash the other way.
    if ((dir > 0 && o.x > ARENA.right - o.r - 40) || (dir < 0 && o.x < ARENA.left + o.r + 40)) dir = -dir;
    o.target = clamp(o.x + dir * DASH.distance, ARENA.left + o.r, ARENA.right - o.r);
    o.dir = dir;
    o.ghost = DASH.ghost;
    o.dashing = 0.25;
    o.cooldown = DASH.cooldown;
    this.pending.push({ type: 'dash', seat, dir });
    return true;
  }

  flush() {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** Advance dt seconds. Returns the events that happened. */
  step(dt) {
    const s = this.state;
    if (this.paused || s.phase === PHASE.OVER) return this.flush();
    dt = Math.min(dt, 0.1);
    this.moveOrbs(dt);

    if (s.phase === PHASE.COUNTDOWN) {
      const before = Math.ceil(s.countdown);
      s.countdown -= dt;
      if (Math.ceil(s.countdown) !== before && s.countdown > 0) this.pending.push({ type: 'countdown', n: Math.ceil(s.countdown) });
      if (s.countdown <= 0) {
        s.phase = PHASE.PLAYING;
        this.pending.push({ type: 'go' });
      }
      return this.flush();
    }

    s.elapsed += dt;
    s.time = Math.max(0, s.time - dt);
    if (s.mode === 'versus') this.bumps();
    this.spawn(dt);
    this.moveHazards(dt);
    this.checkHits();
    this.checkEnd();
    return this.flush();
  }

  moveOrbs(dt) {
    for (const o of Object.values(this.state.orbs)) {
      if (o.out) continue;
      o.ghost = Math.max(0, o.ghost - dt);
      o.safe = Math.max(0, o.safe - dt);
      o.cooldown = Math.max(0, o.cooldown - dt);
      o.dashing = Math.max(0, o.dashing - dt);
      // A bump pushes the orb (and where it's heading) sideways, fading quickly.
      if (o.knock) {
        const shift = o.knock * dt;
        o.x += shift;
        o.target += shift;
        o.knock *= Math.exp(-BUMP.decay * dt);
        if (Math.abs(o.knock) < 5) o.knock = 0;
      }
      const lo = ARENA.left + o.r;
      const hi = ARENA.right - o.r;
      o.target = clamp(o.target, lo, hi);
      const speed = o.dashing > 0 ? DASH.speed : ORB.speed;
      const d = o.target - o.x;
      o.x = clamp(o.x + clamp(d, -speed * dt, speed * dt), lo, hi);
      o.vx = (o.x - o.prevX) / dt;
      if (Math.abs(o.vx) > 30) o.dir = Math.sign(o.vx);
      o.prevX = o.x;
    }
  }

  // Last one standing: orbs that touch push each other apart (gently).
  bumps() {
    const orbs = Object.values(this.state.orbs).filter((o) => !o.out && o.ghost <= 0);
    for (let i = 0; i < orbs.length; i++) {
      for (let j = i + 1; j < orbs.length; j++) {
        const a = orbs[i];
        const b = orbs[j];
        const gap = b.x - a.x;
        const overlap = a.r + b.r - Math.abs(gap);
        if (overlap <= 0) continue;
        const side = Math.sign(gap) || 1; // b is to the right of a when positive
        a.x -= (side * overlap) / 2;
        b.x += (side * overlap) / 2;
        a.target = a.x;
        b.target = b.x;
        const closing = Math.max(0, (a.vx - b.vx) * side);
        const push = BUMP.push + closing * 0.35;
        if (a.knock * -side < push * 0.5 || b.knock * side < push * 0.5) {
          a.knock = -side * push;
          b.knock = side * push;
          this.pending.push({ type: 'bump', seats: [a.seat, b.seat], x: (a.x + b.x) / 2 });
        }
      }
    }
  }

  // ---------- the storm ----------

  progress() {
    const s = this.state;
    return s.mode === 'team' ? clamp(s.elapsed / this.settings.time, 0, 1) : clamp(s.elapsed / VERSUS_RAMP, 0, 1);
  }

  spawn(dt) {
    const s = this.state;
    const f = this.progress();
    s.spawnIn -= dt;
    if (s.spawnIn <= 0) {
      const [first, last] = this.settings.every;
      s.spawnIn = first + (last - first) * f;
      const kinds = [['spike', 3], ['beam', 2], ['ball', 1.5]].filter(([k]) => f >= UNLOCK[k]);
      const total = kinds.reduce((a, [, w]) => a + w, 0);
      let pick = this.rng() * total;
      const kind = kinds.find(([, w]) => (pick -= w) < 0)?.[0] || 'spike';
      this.make(kind);
      // Later in the storm on the harder levels, spikes come in pairs.
      if (kind === 'spike' && f > 0.6 && this.difficulty !== 'easy') this.make('spike');
    }
    if (s.mode === 'team') {
      s.batteryIn -= dt;
      if (s.batteryIn <= 0) {
        s.batteryIn = BATTERY.every;
        if (s.shield < SHIELD) this.make('battery');
      }
    }
  }

  make(kind) {
    const s = this.state;
    const id = this.nextId++;
    const warn = this.settings.warn;
    const width = ARENA.right - ARENA.left;
    const randX = (margin) => ARENA.left + margin + this.rng() * (width - 2 * margin);
    let h;
    if (kind === 'spike') {
      // Keep away from spikes that are already warning, so pairs never make a wall.
      let x = randX(40);
      for (let tries = 0; tries < 6 && s.hazards.some((o) => o.kind === 'spike' && o.phase === 'warn' && Math.abs(o.x - x) < 260); tries++) x = randX(40);
      h = { kind, x, y: ARENA.top - SPIKE.height };
    } else if (kind === 'beam') {
      const w = BEAM.minWidth + this.rng() * (BEAM.maxWidth - BEAM.minWidth);
      const x1 = ARENA.left + this.rng() * (width - w);
      h = { kind, x1, x2: x1 + w, from: this.rng() < 0.5 ? -1 : 1, grown: 0, fire: 0 };
    } else if (kind === 'ball') {
      const fromLeft = this.rng() < 0.5;
      const apex = BALL.apex[0] + this.rng() * (BALL.apex[1] - BALL.apex[0]);
      h = {
        kind, x: fromLeft ? ARENA.left - BALL.radius : ARENA.right + BALL.radius, y: TRACK_Y - apex,
        vx: (fromLeft ? 1 : -1) * BALL.speed * this.settings.speed, vy: 0, apex,
      };
    } else {
      h = { kind: 'battery', x: randX(80), y: ARENA.top - BATTERY.size };
    }
    s.hazards.push({ id, phase: kind === 'battery' ? 'active' : 'warn', warn: kind === 'beam' ? warn * 1.2 : warn, ...h });
    if (kind !== 'battery') this.pending.push({ type: 'warn', kind, id });
  }

  moveHazards(dt) {
    const s = this.state;
    const speed = this.settings.speed;
    const floor = TRACK_Y + ORB.radius; // the ground the orbs run on
    for (const h of s.hazards) {
      if (h.phase === 'warn') {
        h.warn -= dt;
        if (h.warn <= 0) {
          h.phase = 'active';
          this.pending.push({ type: 'fire', kind: h.kind, id: h.id, x: h.kind === 'beam' ? (h.x1 + h.x2) / 2 : h.x });
        }
        continue;
      }
      if (h.kind === 'spike') {
        h.y += SPIKE.speed * speed * dt;
        if (h.y > floor) { h.done = true; this.pending.push({ type: 'smash', x: h.x }); }
      } else if (h.kind === 'beam') {
        if (h.grown < 1) h.grown = Math.min(1, h.grown + dt / BEAM.grow);
        else {
          h.fire += dt;
          if (h.fire >= BEAM.fire) h.done = true;
        }
      } else if (h.kind === 'ball') {
        h.vy += BALL.gravity * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        if (h.y > floor - BALL.radius) {
          h.y = floor - BALL.radius;
          h.vy = -Math.sqrt(2 * BALL.gravity * h.apex);
          this.pending.push({ type: 'boing', x: h.x });
        }
        if (h.x < ARENA.left - 120 || h.x > ARENA.right + 120) h.done = true;
      } else if (h.kind === 'battery') {
        h.y += BATTERY.speed * dt;
        if (h.y > floor) h.done = true;
      }
    }
    s.hazards = s.hazards.filter((h) => !h.done);
  }

  /** The strip of floor a beam is burning right now (it grows from one side first). */
  beamSpan(h) {
    if (h.phase !== 'active') return null;
    const w = (h.x2 - h.x1) * h.grown;
    return h.from < 0 ? [h.x1, h.x1 + w] : [h.x2 - w, h.x2];
  }

  touches(o, h) {
    if (h.phase !== 'active') return false;
    if (h.kind === 'spike') {
      // Closest point of the spike's box to the orb's centre.
      const cx = clamp(o.x, h.x - SPIKE.width / 2, h.x + SPIKE.width / 2);
      const cy = clamp(TRACK_Y, h.y - SPIKE.height, h.y);
      return Math.hypot(o.x - cx, TRACK_Y - cy) < o.r;
    }
    if (h.kind === 'beam') {
      const [a, b] = this.beamSpan(h);
      return o.x + o.r * 0.6 > a && o.x - o.r * 0.6 < b;
    }
    if (h.kind === 'ball') return Math.hypot(o.x - h.x, TRACK_Y - h.y) < o.r + BALL.radius * 0.85;
    if (h.kind === 'battery') return Math.abs(o.x - h.x) < o.r + BATTERY.size / 2 && Math.abs(TRACK_Y - h.y) < o.r + BATTERY.size / 2;
    return false;
  }

  checkHits() {
    const s = this.state;
    for (const o of Object.values(s.orbs)) {
      if (o.out) continue;
      for (const h of s.hazards) {
        if (h.done || !this.touches(o, h)) continue;
        if (h.kind === 'battery') {
          h.done = true;
          s.shield = Math.min(SHIELD, s.shield + 1);
          this.pending.push({ type: 'battery', seat: o.seat, x: h.x });
          continue;
        }
        if (o.ghost > 0 || o.safe > 0) continue;
        if (h.kind === 'spike') h.done = true;
        o.safe = BOOST.safe[o.boost] || BOOST.safe[0];
        s.hits += 1;
        if (s.mode === 'team') s.shield = Math.max(0, s.shield - 1);
        else o.hearts = Math.max(0, o.hearts - 1);
        this.pending.push({ type: 'hit', seat: o.seat, kind: h.kind, x: o.x });
        if (s.mode === 'versus' && o.hearts === 0) {
          o.out = true;
          this.pending.push({ type: 'out', seat: o.seat, x: o.x });
        }
        break;
      }
    }
    s.hazards = s.hazards.filter((h) => !h.done);
  }

  checkEnd() {
    const s = this.state;
    if (s.phase !== PHASE.PLAYING) return;
    let winner;
    if (s.mode === 'team') {
      if (s.shield <= 0) winner = 'cpu';
      else if (s.time <= 0) winner = 'team';
    } else {
      const alive = Object.values(s.orbs).filter((o) => !o.out);
      if (alive.length <= 1) winner = alive[0]?.side ?? null;
      else if (s.time <= 0) {
        const best = Math.max(...alive.map((o) => o.hearts));
        const top = alive.filter((o) => o.hearts === best);
        winner = top.length === 1 ? top[0].side : null;
      }
    }
    if (winner === undefined) return;
    s.phase = PHASE.OVER;
    s.winner = winner;
    this.pending.push({ type: 'win', winner });
  }

  scores() {
    const s = this.state;
    if (s.mode === 'team') return { team: s.shield, cpu: s.hits };
    return Object.fromEntries(Object.values(s.orbs).map((o) => [o.side, o.hearts]));
  }
}
