// Cyber Hunt's rules: plain logic with no drawing, sound or page code, so it can be
// tested on its own (test/cyber-hunt.test.js).
//
// A city full of wandering things. Each round asks for one kind of thing, and a few
// of them are "glitched": find and tag those. A player first picks one of the four
// coloured quarters (pads), then moves a cursor inside it (pointer) and taps to tag.
// Team mode: find every glitch over 3 rounds before the computer's scan finishes.
// Race: whoever tags a glitch first scores; first to 5 wins.

import {
  CITY, REACH, ICON, POOL, BOOST, COUNTDOWN, INTRO, ROUND_END, FREEZE, PENALTY,
  TEAM_ROUNDS, RACE_TO, MAX_ROUNDS, DIFFICULTIES,
} from './config.js';

export const PHASE = { COUNTDOWN: 'countdown', INTRO: 'intro', HUNT: 'hunt', ROUND_END: 'round-end', OVER: 'over' };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The four quarters of the city, in pad order: top-left, top-right, bottom-left, bottom-right. */
export function quarters() {
  const w = (CITY.right - CITY.left) / 2;
  const h = (CITY.bottom - CITY.top) / 2;
  return [0, 1, 2, 3].map((i) => ({ x: CITY.left + (i % 2) * w, y: CITY.top + Math.floor(i / 2) * h, w, h }));
}

export class Engine {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.difficulty = 'easy';
    this.paused = false;
    this.pending = [];
    this.state = { phase: PHASE.OVER, things: [], players: {}, mode: 'team', winner: null };
  }

  setDifficulty(id) {
    if (DIFFICULTIES[id]) this.difficulty = id;
  }

  get settings() { return DIFFICULTIES[this.difficulty]; }

  /** players: [{ seat, side, boost }]; mode 'team' or 'race' */
  startMatch(mode, players) {
    this.nextId = 1;
    this.pending = [];
    this.state = {
      mode,
      phase: PHASE.COUNTDOWN,
      timer: COUNTDOWN,
      round: 0,
      target: null,
      things: [],
      players: {},
      found: 0, // team: glitches found in all rounds
      wrong: 0,
      scan: mode === 'team' ? { left: this.settings.time, total: this.settings.time } : null,
      winner: null,
      used: [],
    };
    for (const p of players) this.addPlayer(p);
  }

  addPlayer(p) {
    if (this.state.players[p.seat]) return false;
    this.state.players[p.seat] = {
      seat: p.seat, side: p.side, boost: p.boost || 0,
      mode: 'pick', quad: null, px: 0.5, py: 0.5, x: 0, y: 0, frozen: 0, points: 0,
    };
    return true;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  canAct() {
    const p = this.state.phase;
    return !this.paused && (p === PHASE.HUNT || p === PHASE.INTRO);
  }

  /** Pads: pick a quarter (0-3) to hunt in. */
  choose(seat, quad) {
    const p = this.state.players[seat];
    if (!p || !this.canAct() || !Number.isInteger(quad) || quad < 0 || quad > 3) return false;
    p.mode = 'hunt';
    p.quad = quad;
    p.px = 0.5;
    p.py = 0.5;
    this.placeCursor(p);
    this.pending.push({ type: 'pick', seat, quad });
    return true;
  }

  /** 🔙: back to picking a quarter. */
  back(seat) {
    const p = this.state.players[seat];
    if (!p || p.mode !== 'hunt') return false;
    p.mode = 'pick';
    return true;
  }

  /** Pointer: where the cursor is inside the quarter (0..1 each way). */
  point(seat, x, y) {
    const p = this.state.players[seat];
    if (!p || p.mode !== 'hunt' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    p.px = clamp(x, 0, 1);
    p.py = clamp(y, 0, 1);
    this.placeCursor(p);
  }

  placeCursor(p) {
    const q = quarters()[p.quad];
    const ex = q.w * REACH;
    const ey = q.h * REACH;
    let x = clamp(q.x - ex + p.px * (q.w + 2 * ex), CITY.left, CITY.right);
    let y = clamp(q.y - ey + p.py * (q.h + 2 * ey), CITY.top, CITY.bottom);
    // Help for younger players: a gentle pull towards a glitch inside the lens.
    const pull = BOOST.magnet[p.boost] || 0;
    if (pull > 0 && this.state.phase === PHASE.HUNT) {
      const near = this.nearest(x, y, BOOST.lens[p.boost], (t) => t.glitch && !t.found);
      if (near) {
        x += (near.x - x) * pull;
        y += (near.y - y) * pull;
      }
    }
    p.x = x;
    p.y = y;
  }

  nearest(x, y, radius, filter = () => true) {
    let best = null;
    let bestD = radius;
    for (const t of this.state.things) {
      if (t.found || !filter(t)) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  /** A tap on the pointer: tag whatever is under the cursor. */
  tag(seat) {
    const s = this.state;
    const p = s.players[seat];
    if (!p || p.mode !== 'hunt' || this.paused || s.phase !== PHASE.HUNT || p.frozen > 0) return null;
    this.placeCursor(p);
    const thing = this.nearest(p.x, p.y, BOOST.hit[p.boost] || BOOST.hit[0]);
    if (!thing) {
      this.pending.push({ type: 'miss', seat, x: p.x, y: p.y });
      return 'miss';
    }
    if (thing.glitch) {
      thing.found = true;
      thing.foundBy = seat;
      p.points += 1;
      s.found += 1;
      this.pending.push({ type: 'found', seat, x: thing.x, y: thing.y, id: thing.id });
      if (s.things.every((t) => !t.glitch || t.found)) this.endRound();
      return 'found';
    }
    p.frozen = FREEZE;
    s.wrong += 1;
    if (s.scan) s.scan.left = Math.max(0, s.scan.left - PENALTY);
    this.pending.push({ type: 'wrong', seat, x: thing.x, y: thing.y });
    return 'wrong';
  }

  // ---------- rounds ----------

  newRound() {
    const s = this.state;
    s.round += 1;
    const fresh = POOL.filter((icon) => !s.used.includes(icon));
    const pool = fresh.length ? fresh : POOL;
    s.target = pool[Math.floor(this.rng() * pool.length)];
    s.used.push(s.target);
    s.things = [];
    const { targets, twins, others } = this.settings;
    // Spread the glitches over different quarters, so each round sends you looking around.
    const quads = [0, 1, 2, 3].sort(() => this.rng() - 0.5);
    for (let i = 0; i < targets; i++) this.spawn(s.target, true, quads[i % 4]);
    for (let i = 0; i < twins; i++) this.spawn(s.target, false);
    const decoys = POOL.filter((icon) => icon !== s.target);
    for (let i = 0; i < others; i++) this.spawn(decoys[Math.floor(this.rng() * decoys.length)], false);
    for (const p of Object.values(s.players)) {
      p.mode = 'pick';
      p.frozen = 0;
    }
    s.phase = PHASE.INTRO;
    s.timer = INTRO;
    this.pending.push({ type: 'round', round: s.round, target: s.target });
  }

  spawn(icon, glitch, quad = null) {
    const q = quad === null ? null : quarters()[quad];
    const m = ICON;
    const x = q ? q.x + m + this.rng() * (q.w - 2 * m) : CITY.left + m + this.rng() * (CITY.right - CITY.left - 2 * m);
    const y = q ? q.y + m + this.rng() * (q.h - 2 * m) : CITY.top + m + this.rng() * (CITY.bottom - CITY.top - 2 * m);
    const a = this.rng() * Math.PI * 2;
    const speed = this.settings.speed * (0.6 + this.rng() * 0.8);
    this.state.things.push({ id: this.nextId++, icon, glitch, found: false, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, turnIn: 1 + this.rng() * 3 });
  }

  endRound() {
    const s = this.state;
    if (s.mode === 'race') {
      const best = Math.max(...Object.values(s.players).map((p) => p.points));
      if (best >= RACE_TO) return this.finish();
    }
    s.phase = PHASE.ROUND_END;
    s.timer = ROUND_END;
    this.pending.push({ type: 'round-done', round: s.round });
  }

  finish() {
    const s = this.state;
    let winner;
    if (s.mode === 'team') winner = s.scan.left > 0 ? 'team' : 'cpu';
    else {
      const players = Object.values(s.players);
      const best = Math.max(...players.map((p) => p.points));
      const top = players.filter((p) => p.points === best);
      winner = top.length === 1 ? top[0].side : null;
    }
    s.phase = PHASE.OVER;
    s.winner = winner;
    this.pending.push({ type: 'win', winner });
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
    for (const p of Object.values(s.players)) p.frozen = Math.max(0, p.frozen - dt);
    this.wander(dt);
    for (const p of Object.values(s.players)) if (p.mode === 'hunt') this.placeCursor(p);

    if (s.phase === PHASE.COUNTDOWN) {
      const before = Math.ceil(s.timer);
      s.timer -= dt;
      if (Math.ceil(s.timer) !== before && s.timer > 0) this.pending.push({ type: 'countdown', n: Math.ceil(s.timer) });
      if (s.timer <= 0) this.newRound();
    } else if (s.phase === PHASE.INTRO) {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.phase = PHASE.HUNT;
        this.pending.push({ type: 'go' });
      }
    } else if (s.phase === PHASE.HUNT) {
      if (s.scan) {
        s.scan.left = Math.max(0, s.scan.left - dt);
        if (s.scan.left <= 0) this.finish();
      }
    } else if (s.phase === PHASE.ROUND_END) {
      s.timer -= dt;
      if (s.timer <= 0) {
        if ((s.mode === 'team' && s.round >= TEAM_ROUNDS) || (s.mode === 'race' && s.round >= MAX_ROUNDS)) this.finish();
        else this.newRound();
      }
    }
    return this.flush();
  }

  wander(dt) {
    for (const t of this.state.things) {
      if (t.found) continue;
      t.turnIn -= dt;
      if (t.turnIn <= 0) {
        // Wander: turn a little now and then.
        const a = Math.atan2(t.vy, t.vx) + (this.rng() - 0.5) * 2;
        const speed = Math.hypot(t.vx, t.vy);
        t.vx = Math.cos(a) * speed;
        t.vy = Math.sin(a) * speed;
        t.turnIn = 1 + this.rng() * 3;
      }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      const m = ICON / 2;
      if (t.x < CITY.left + m || t.x > CITY.right - m) { t.vx = -t.vx; t.x = clamp(t.x, CITY.left + m, CITY.right - m); }
      if (t.y < CITY.top + m || t.y > CITY.bottom - m) { t.vy = -t.vy; t.y = clamp(t.y, CITY.top + m, CITY.bottom - m); }
    }
  }

  /** How many glitches this round, and how many are found. */
  roundProgress() {
    const glitches = this.state.things.filter((t) => t.glitch);
    return { total: glitches.length, found: glitches.filter((t) => t.found).length };
  }

  scores() {
    const s = this.state;
    if (s.mode === 'team') return { team: s.found, cpu: s.wrong };
    return Object.fromEntries(Object.values(s.players).map((p) => [p.side, p.points]));
  }
}
