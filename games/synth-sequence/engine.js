// Synth Sequence's rules: plain logic with no drawing, sound or page code, so it can be
// tested on its own (test/synth-sequence.test.js).
//
// The screen plays a pattern of coloured pads; players repeat it on their phones'
// pads. Each round the pattern grows by one note and plays a little faster.
// Team mode (a relay): each player owns some of the colours and plays only those
// notes; reach the computer's best length to win. A wrong note costs a heart and the
// same pattern plays again. Last one standing: everyone repeats the whole pattern on
// their own; a wrong note costs that player a heart; the last one with hearts wins.

import { COUNTDOWN, HEARTS, START_LENGTH, GAP, RESULT, MAX_LENGTH, HINT_AFTER, DIFFICULTIES } from './config.js';

export const PHASE = { COUNTDOWN: 'countdown', SHOW: 'show', INPUT: 'input', RESULT: 'result', OVER: 'over' };

/** Share the four colours between the team: who owns which pad. */
export function shareColors(seats) {
  const sorted = [...seats].sort((a, b) => a - b);
  const owners = {};
  const plan = { 1: [[0, 1, 2, 3]], 2: [[0, 1], [2, 3]], 3: [[0], [1], [2, 3]], 4: [[0], [1], [2], [3]] }[sorted.length] || [[0, 1, 2, 3]];
  sorted.forEach((seat, i) => { for (const pad of plan[i] || []) owners[pad] = seat; });
  return owners;
}

export class Engine {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.difficulty = 'easy';
    this.paused = false;
    this.pending = [];
    this.state = { phase: PHASE.OVER, sequence: [], players: {}, mode: 'team', winner: null };
  }

  setDifficulty(id) {
    if (DIFFICULTIES[id]) this.difficulty = id;
  }

  get settings() { return DIFFICULTIES[this.difficulty]; }

  /** players: [{ seat, side, boost }]; mode 'team' or 'versus' */
  startMatch(mode, players) {
    this.pending = [];
    const s = {
      mode,
      phase: PHASE.COUNTDOWN,
      timer: COUNTDOWN,
      sequence: [],
      lit: null, // pad lit on the screen right now
      showAt: 0, // which note is playing
      noteOn: false,
      pos: 0, // team: next note to play
      idle: 0, // seconds since the last correct note (team)
      hearts: HEARTS, // team
      best: 0, // longest pattern completed
      goal: mode === 'team' ? this.settings.goal : null,
      owners: {},
      players: {},
      result: null, // 'good' | 'oops'
      winner: null,
    };
    this.state = s;
    for (const p of players) {
      s.players[p.seat] = { seat: p.seat, side: p.side, boost: p.boost || 0, hearts: HEARTS, out: false, pos: 0, done: false, idle: 0, hint: null, last: null };
    }
    if (mode === 'team') s.owners = shareColors(players.map((p) => p.seat));
    for (let i = 0; i < START_LENGTH - 1; i++) s.sequence.push(this.randomPad());
  }

  randomPad() {
    // Avoid three of the same in a row: harder to tell apart.
    const seq = this.state.sequence;
    for (;;) {
      const pad = Math.floor(this.rng() * 4);
      if (seq.length >= 2 && seq[seq.length - 1] === pad && seq[seq.length - 2] === pad) continue;
      return pad;
    }
  }

  /** A team mate joined: share the colours again (from the next pattern on). */
  addPlayer(p) {
    const s = this.state;
    if (s.mode !== 'team' || s.players[p.seat]) return false;
    s.players[p.seat] = { seat: p.seat, side: p.side, boost: p.boost || 0, hearts: HEARTS, out: false, pos: 0, done: false, idle: 0, hint: null, last: null };
    s.owners = shareColors(Object.keys(s.players).map(Number));
    return true;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  /** Pads this player may use. */
  padsFor(seat) {
    const s = this.state;
    if (s.mode !== 'team') return [0, 1, 2, 3];
    return [0, 1, 2, 3].filter((pad) => s.owners[pad] === seat);
  }

  noteLength() {
    const { note, fastest } = this.settings;
    const len = this.state.sequence.length;
    return Math.max(fastest, note - (len - START_LENGTH) * 0.03);
  }

  // ---------- playing a pattern ----------

  nextPattern() {
    const s = this.state;
    s.sequence.push(this.randomPad());
    this.replay();
  }

  replay() {
    const s = this.state;
    s.phase = PHASE.SHOW;
    s.showAt = -1;
    s.noteOn = false;
    s.timer = 0.6; // a breath before the first note
    s.lit = null;
    s.pos = 0;
    s.idle = 0;
    for (const p of Object.values(s.players)) {
      p.pos = 0;
      p.done = p.out;
      p.idle = 0;
      p.hint = null;
    }
    this.pending.push({ type: 'listen', length: s.sequence.length });
  }

  startInput() {
    const s = this.state;
    s.phase = PHASE.INPUT;
    s.lit = null;
    this.pending.push({ type: 'your-turn' });
  }

  /** A pad pressed on a phone. */
  press(seat, pad) {
    const s = this.state;
    const p = s.players[seat];
    if (!p || this.paused || s.phase !== PHASE.INPUT || !Number.isInteger(pad) || pad < 0 || pad > 3) return null;
    if (s.mode === 'team') {
      if (s.owners[pad] !== seat) return null; // not your colour
      const expected = s.sequence[s.pos];
      this.pending.push({ type: 'note', seat, pad });
      if (pad !== expected) return this.teamMistake(seat, pad);
      s.pos += 1;
      s.idle = 0;
      for (const q of Object.values(s.players)) q.hint = null;
      if (s.pos >= s.sequence.length) this.teamDone();
      return 'good';
    }
    if (p.out || p.done) return null;
    this.pending.push({ type: 'note', seat, pad });
    if (pad !== s.sequence[p.pos]) return this.playerMistake(p);
    p.pos += 1;
    p.idle = 0;
    p.hint = null;
    if (p.pos >= s.sequence.length) {
      p.done = true;
      p.last = 'good';
      this.pending.push({ type: 'player-done', seat });
      this.checkVersusRound();
    }
    return 'good';
  }

  teamMistake(seat, pad) {
    const s = this.state;
    s.hearts -= 1;
    this.pending.push({ type: 'oops', seat, pad, expected: s.sequence[s.pos] });
    if (s.hearts <= 0) {
      this.finish('cpu');
      return 'oops';
    }
    s.phase = PHASE.RESULT;
    s.result = 'oops';
    s.timer = RESULT;
    return 'oops';
  }

  teamDone() {
    const s = this.state;
    s.best = s.sequence.length;
    this.pending.push({ type: 'good', length: s.sequence.length });
    if (s.best >= s.goal) return this.finish('team');
    s.phase = PHASE.RESULT;
    s.result = 'good';
    s.timer = RESULT;
  }

  playerMistake(p) {
    const s = this.state;
    p.hearts -= 1;
    p.done = true;
    p.last = 'oops';
    this.pending.push({ type: 'oops', seat: p.seat, expected: s.sequence[p.pos] });
    if (p.hearts <= 0) {
      p.out = true;
      this.pending.push({ type: 'out', seat: p.seat });
    }
    this.checkVersusRound();
    return 'oops';
  }

  checkVersusRound() {
    const s = this.state;
    const players = Object.values(s.players);
    if (!players.every((p) => p.done)) return;
    const alive = players.filter((p) => !p.out);
    const everyoneGood = alive.length > 0 && alive.every((p) => p.last === 'good');
    if (alive.length <= 1 && players.length > 1) {
      // Last one standing (or nobody left: whoever had hearts longest... a draw).
      return this.finish(alive[0]?.side ?? null);
    }
    if (alive.some((p) => p.last === 'good')) s.best = Math.max(s.best, s.sequence.length);
    if (s.sequence.length >= MAX_LENGTH && everyoneGood) {
      const most = Math.max(...alive.map((p) => p.hearts));
      const top = alive.filter((p) => p.hearts === most);
      return this.finish(top.length === 1 ? top[0].side : null);
    }
    s.phase = PHASE.RESULT;
    // If nobody got it right, the same pattern plays again (it only grows once someone manages it).
    s.result = everyoneGood ? 'good' : alive.some((p) => p.last === 'good') ? 'mixed' : 'oops';
    s.timer = RESULT;
    this.pending.push({ type: 'round-done', good: alive.filter((p) => p.last === 'good').map((p) => p.seat) });
  }

  finish(winner) {
    const s = this.state;
    s.phase = PHASE.OVER;
    s.winner = winner;
    s.lit = null;
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

    if (s.phase === PHASE.COUNTDOWN) {
      const before = Math.ceil(s.timer);
      s.timer -= dt;
      if (Math.ceil(s.timer) !== before && s.timer > 0) this.pending.push({ type: 'countdown', n: Math.ceil(s.timer) });
      if (s.timer <= 0) this.nextPattern();
    } else if (s.phase === PHASE.SHOW) {
      s.timer -= dt;
      if (s.timer <= 0) {
        if (s.noteOn) {
          // Note finished: a short gap.
          s.noteOn = false;
          s.lit = null;
          s.timer = GAP;
        } else if (s.showAt + 1 < s.sequence.length) {
          s.showAt += 1;
          s.noteOn = true;
          s.lit = s.sequence[s.showAt];
          s.timer = this.noteLength();
          this.pending.push({ type: 'show', pad: s.lit, index: s.showAt });
        } else {
          this.startInput();
        }
      }
    } else if (s.phase === PHASE.INPUT) {
      this.waiting(dt);
    } else if (s.phase === PHASE.RESULT) {
      s.timer -= dt;
      if (s.timer <= 0) {
        if (s.result === 'oops') this.replay(); // team: the same pattern again
        else this.nextPattern();
      }
    }
    return this.flush();
  }

  // Waiting for presses: hints for younger players, and a time limit per note.
  waiting(dt) {
    const s = this.state;
    const wait = this.settings.wait;
    if (s.mode === 'team') {
      s.idle += dt;
      const pad = s.sequence[s.pos];
      const owner = s.players[s.owners[pad]];
      const hintAfter = owner && HINT_AFTER[owner.boost];
      if (hintAfter && s.idle >= hintAfter && owner.hint === null) {
        owner.hint = pad;
        this.pending.push({ type: 'hint', seat: owner.seat, pad });
      }
      if (s.idle >= wait) this.teamMistake(owner?.seat ?? null, null);
      return;
    }
    for (const p of Object.values(s.players)) {
      if (p.done) continue;
      p.idle += dt;
      const hintAfter = HINT_AFTER[p.boost];
      if (hintAfter && p.idle >= hintAfter && p.hint === null) {
        p.hint = s.sequence[p.pos];
        this.pending.push({ type: 'hint', seat: p.seat, pad: p.hint });
      }
      if (p.idle >= wait) this.playerMistake(p);
      if (s.phase !== PHASE.INPUT) return;
    }
  }

  scores() {
    const s = this.state;
    if (s.mode === 'team') return { team: s.best, cpu: s.goal };
    return Object.fromEntries(Object.values(s.players).map((p) => [p.side, p.hearts]));
  }
}
