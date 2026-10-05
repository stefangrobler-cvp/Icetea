// Soccer (foosball) game engine: all the rules, none of the drawing.
//
// game.js calls engine.step(seconds) every frame and gets back a list of events
// (kicks, bounces, goals...) to play sounds or effects for, reads engine.state to
// draw the pitch, and passes player input in with setPaddle(), aimKickoff(),
// kick(), pause() and resume(). The rods, goals and posts live in rules.js.

import {
  COURT, BALL, DIFFICULTIES, POINTS_TO_WIN, COUNTDOWN_SECONDS, TOSS_SECONDS,
  PADDLE_GLIDE_SPEED, KICKOFF, LANE,
} from './config.js';
import { ComputerPlayer } from './ai.js';
import { applySpin, clamp, clampKickAngle } from './physics.js';
import { rules } from './rules.js';
const SUBSTEP = 1 / 240; // physics runs in small slices so the ball never skips through a paddle
const VELOCITY_SMOOTHING = 0.05; // seconds: how quickly a paddle's measured speed follows its movement

export const PHASE = {
  LOBBY: 'lobby', // choosing settings
  TOSS: 'toss', // coin toss at the start of a match
  COUNTDOWN: 'countdown', // 3, 2, 1 before carrying on after a pause
  KICKOFF: 'kickoff', // ball on the centre spot, waiting for the kicker to aim and kick
  PLAYING: 'playing',
  PAUSED: 'paused', // paused by the platform (pause button, or a phone dropped out)
  OVER: 'over', // someone won
};

const LIVE = new Set([PHASE.TOSS, PHASE.COUNTDOWN, PHASE.KICKOFF, PHASE.PLAYING]);
const other = (side) => (side === 'left' ? 'right' : 'left');

export class Engine {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.accumulator = 0;
    this.ais = new Map(); // paddle id -> ComputerPlayer
    this.slots = []; // the players in the current match
    this.state = {
      settings: { mode: 'versus', difficulty: 'easy' },
      phase: PHASE.LOBBY,
      matchId: 0,
      scores: { left: 0, right: 0 },
      paddles: [],
      ball: this.centreBall(),
      countdown: 0, // seconds left in the countdown
      toss: null, // { winner, timeLeft } during the coin toss
      kickoff: null, // { side, slot, aim, wait, timeLeft } during a kick-off
      resumeBall: false, // after a pause, continue the rally instead of serving
      heldFrom: null, // the phase we were in when the game got paused
      manualPause: false,
      winner: null, // 'left' | 'right'
    };
  }

  centreBall() {
    return { x: COURT.width / 2, y: COURT.height / 2, vx: 0, vy: 0, spin: 0, visible: false };
  }

  get rules() {
    return rules;
  }

  /** Ball speed for the current game and level. It never changes during a match. */
  get speed() {
    return this.rules.ballSpeed(DIFFICULTIES[this.state.settings.difficulty]);
  }

  // ---------- settings & match flow ----------

  /**
   * Change settings. Anything goes between matches; while the game is paused
   * only the difficulty can change, and it takes effect straight away.
   */
  setSettings({ mode, difficulty }) {
    const s = this.state;
    if (s.phase === PHASE.PAUSED) {
      if (!difficulty || !DIFFICULTIES[difficulty] || difficulty === s.settings.difficulty) return false;
      s.settings.difficulty = difficulty;
      this.rebuildPaddles(this.slots);
      // A ball that was mid-rally carries on at the new level's speed.
      const b = s.ball;
      const v = Math.hypot(b.vx, b.vy);
      if (v > 0) { b.vx *= this.speed / v; b.vy *= this.speed / v; }
      return true;
    }
    if (s.phase !== PHASE.LOBBY && s.phase !== PHASE.OVER) return false;
    if (mode === 'versus' || mode === 'team') s.settings.mode = mode;
    if (difficulty && DIFFICULTIES[difficulty]) s.settings.difficulty = difficulty;
    return true;
  }

  /**
   * Start a fresh match. `slots` are the players' seats, e.g. [1, 2];
   * `sides` maps seat -> 'left' | 'right'; `colors` maps seat -> colour, plus `cpu`.
   */
  startMatch(slots, { sides = {}, colors = {} } = {}) {
    const s = this.state;
    this.slots = [...slots].sort();
    this.sides = { ...sides };
    this.colors = { ...colors };
    s.paddles = [];
    this.rebuildPaddles(this.slots);
    s.matchId += 1;
    s.scores = { left: 0, right: 0 };
    s.winner = null;
    s.manualPause = false;
    s.kickoff = null;
    s.ball = this.centreBall();
    // Coin toss: decides who kicks off first.
    s.toss = { winner: this.rng() < 0.5 ? 'left' : 'right', timeLeft: TOSS_SECONDS };
    s.phase = PHASE.TOSS;
    return true;
  }

  /**
   * (Re)build the paddles/rods for these players at the current level, keeping
   * each one where it was (used after a level change, or when a kid joins mid-match).
   */
  rebuildPaddles(slots) {
    const s = this.state;
    const diff = DIFFICULTIES[s.settings.difficulty];
    const old = new Map(s.paddles.map((p) => [p.id, p]));
    s.paddles = this.rules.createPaddles({ mode: s.settings.mode, diff, slots, sides: this.sides, colors: this.colors });
    for (const p of s.paddles) {
      const was = old.get(p.id);
      const at = (y, from) => p.minY + clamp((y - from.minY) / (from.maxY - from.minY || 1), 0, 1) * (p.maxY - p.minY);
      p.y = was ? at(was.y, was) : clamp(COURT.height / 2, p.minY, p.maxY);
      p.target = was ? at(was.target, was) : p.y; // where the player's finger wants it
      p.vy = 0; // measured speed, used for "traction"
      p.prevY = p.y;
    }
    this.ais = new Map(s.paddles.filter((p) => !p.human).map((p) => [p.id, new ComputerPlayer(diff.ai, this.rng)]));
  }

  /**
   * A phone joined while a team-v-computer match is on: bring that kid into the
   * team straight away (the two kids then get one rod each).
   */
  addPlayer(slot) {
    const s = this.state;
    if (!this.inMatch || s.settings.mode !== 'team' || this.slots.includes(slot)) return false;
    this.slots = [...this.slots, slot].sort();
    this.sides[slot] = 'left';
    this.rebuildPaddles(this.slots);
    if (s.kickoff) s.kickoff.slot = this.kickerFor(s.kickoff.side);
    return true;
  }

  isInMatch(slot) {
    return this.state.paddles.some((p) => p.slot === slot);
  }

  get inMatch() {
    const p = this.state.phase;
    return p !== PHASE.LOBBY && p !== PHASE.OVER;
  }

  // ---------- input ----------

  /**
   * y01: 0 = top, 1 = bottom. `lane` picks which rod when a player
   * has two (0 = defence, 1 = attack).
   */
  setPaddle(slot, y01, lane = 0) {
    if (!Number.isFinite(y01)) return;
    const mine = this.state.paddles.filter((p) => p.slot === slot);
    const paddle = mine.length === 1 ? mine[0] : mine.find((p) => p.lane === lane);
    if (!paddle) return;
    paddle.target = paddle.minY + clamp(y01, 0, 1) * (paddle.maxY - paddle.minY);
  }

  pause() {
    const s = this.state;
    if (!this.inMatch || s.manualPause) return false;
    s.manualPause = true;
    this.updateHold();
    return true;
  }

  resume() {
    const s = this.state;
    if (!s.manualPause) return false;
    s.manualPause = false;
    this.updateHold();
    return true;
  }

  // Works out whether the game must be held or can carry on. (The platform
  // pauses the game both when someone presses pause and when a phone drops out.)
  updateHold() {
    const s = this.state;
    const held = s.phase === PHASE.PAUSED;
    if (s.manualPause) {
      if (!held) s.heldFrom = s.phase;
      s.phase = PHASE.PAUSED;
    } else if (held) {
      this.carryOn();
    }
  }

  // Everyone is back: pick up where we left off.
  carryOn() {
    const s = this.state;
    const from = s.heldFrom;
    s.heldFrom = null;
    if (from === PHASE.TOSS) s.phase = PHASE.TOSS;
    else if (from === PHASE.KICKOFF) this.beginKickoff(s.kickoff.side);
    else if (from === PHASE.PLAYING) this.beginCountdown(true); // short countdown, then the rally continues
    else this.beginCountdown(s.resumeBall);
  }

  beginCountdown(resumeBall) {
    const s = this.state;
    s.phase = PHASE.COUNTDOWN;
    s.countdown = COUNTDOWN_SECONDS;
    s.resumeBall = resumeBall;
    if (!resumeBall) s.ball = { ...this.centreBall(), visible: true };
    for (const ai of this.ais.values()) ai.reset();
  }

  // ---------- kick-off ----------

  /** Which phone takes the kick-off for this side (null = the computer). */
  kickerFor(side) {
    const humans = this.state.paddles.filter((p) => p.side === side && p.slot);
    if (humans.length === 0) return null;
    // With two kids on a team, the attacker (front rod) kicks off.
    return (humans.find((p) => p.lane === LANE.ATTACK) || humans[0]).slot;
  }

  beginKickoff(side) {
    const s = this.state;
    s.phase = PHASE.KICKOFF;
    s.ball = { ...this.centreBall(), visible: true };
    s.kickoff = {
      side,
      slot: this.kickerFor(side),
      aim: side === 'left' ? 0 : Math.PI, // straight at the other team's goal
      wait: KICKOFF.getReady,
      timeLeft: KICKOFF.timeLimit,
      cpuAim: null,
    };
    for (const ai of this.ais.values()) ai.reset();
  }

  /** The kicker is moving their finger round the aiming circle. */
  aimKickoff(slot, angle) {
    const k = this.state.kickoff;
    if (this.state.phase !== PHASE.KICKOFF || !k || k.slot !== slot || !Number.isFinite(angle)) return false;
    k.aim = this.clampKick(angle, k.side);
    return true;
  }

  /** The kicker let go: kick the ball that way. */
  kick(slot, angle, events = []) {
    const s = this.state;
    const k = s.kickoff;
    if (s.phase !== PHASE.KICKOFF || !k || k.slot !== slot || k.wait > 0) return false;
    if (Number.isFinite(angle)) k.aim = this.clampKick(angle, k.side);
    this.launch(events);
    return true;
  }

  // Kicks can go any way except too steeply up or down.
  clampKick(angle, side) {
    return clampKickAngle(angle, side === 'left' ? 1 : -1);
  }

  launch(events) {
    const s = this.state;
    const a = s.kickoff.aim;
    s.ball = {
      x: COURT.width / 2, y: COURT.height / 2, vx: Math.cos(a) * this.speed, vy: Math.sin(a) * this.speed, spin: 0, visible: true,
      lastTouch: { side: s.kickoff.side, id: 'kickoff' }, // kick-offs fly past your own attackers
    };
    events.push({ type: 'kickoff', side: s.kickoff.side, x: s.ball.x, y: s.ball.y });
    s.kickoff = null;
    s.phase = PHASE.PLAYING;
  }

  // ---------- simulation ----------

  /** Advance the game by dt seconds. Returns events for sound/effects. */
  step(dt) {
    const events = [];
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator >= SUBSTEP) {
      this.accumulator -= SUBSTEP;
      this.tick(SUBSTEP, events);
    }
    return events;
  }

  tick(dt, events) {
    const s = this.state;
    this.time = (this.time || 0) + dt;

    if (s.phase === PHASE.TOSS) {
      s.toss.timeLeft -= dt;
      if (s.toss.timeLeft <= 0) {
        events.push({ type: 'toss', winner: s.toss.winner });
        this.beginKickoff(s.toss.winner);
      }
    } else if (s.phase === PHASE.COUNTDOWN) {
      const before = Math.ceil(s.countdown);
      s.countdown -= dt;
      const after = Math.ceil(s.countdown);
      if (after !== before && after > 0) events.push({ type: 'countdown', value: after });
      if (s.countdown <= 0) {
        // Only used to carry on after a pause: the rally continues where it was.
        s.phase = PHASE.PLAYING;
        s.resumeBall = false;
        events.push({ type: 'serve' });
      }
    } else if (s.phase === PHASE.KICKOFF) {
      this.tickKickoff(dt, events);
    }

    if (LIVE.has(s.phase)) this.movePaddles(dt);
    if (s.phase === PHASE.PLAYING) this.moveBall(dt, events);
  }

  tickKickoff(dt, events) {
    const k = this.state.kickoff;
    if (k.wait > 0) {
      k.wait -= dt;
      return;
    }
    if (k.slot === null) {
      // The computer picks a spot to aim at, takes a moment, then kicks.
      if (k.cpuAim === null) {
        const base = k.side === 'left' ? 0 : Math.PI;
        k.cpuAim = this.clampKick(base + (this.rng() - 0.5) * 1.2, k.side);
        k.cpuTime = KICKOFF.cpuThinking;
      }
      const turn = Math.atan2(Math.sin(k.cpuAim - k.aim), Math.cos(k.cpuAim - k.aim)); // shortest way round
      k.aim += turn * Math.min(1, dt * 4);
      k.cpuTime -= dt;
      if (k.cpuTime <= 0) { k.aim = k.cpuAim; this.launch(events); }
      return;
    }
    k.timeLeft -= dt;
    if (k.timeLeft <= 0) this.launch(events); // nobody kicked: off it goes where it was aimed
  }

  movePaddles(dt) {
    const s = this.state;
    const glide = PADDLE_GLIDE_SPEED * dt;
    const ballLive = s.phase === PHASE.PLAYING;
    for (const p of s.paddles) {
      p.prevY = p.y;
      if (p.human) {
        // Glide to the finger: instant for normal swipes, smooths out big jumps.
        p.y += clamp(p.target - p.y, -glide, glide);
      } else {
        // The computer keeps its paddle moving before the serve too, like a human would.
        this.ais.get(p.id)?.update(dt, s.ball, p, ballLive);
      }
      p.y = clamp(p.y, p.minY, p.maxY);
      // Remember how fast it's moving, for traction when it hits the ball.
      const raw = (p.y - p.prevY) / dt;
      p.vy += (raw - p.vy) * Math.min(1, dt / VELOCITY_SMOOTHING);
    }
  }

  moveBall(dt, events) {
    const s = this.state;
    const ball = s.ball;
    const r = BALL.radius;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    applySpin(ball, this.speed, dt);

    // Top and bottom walls
    if (ball.y - r < 0 || ball.y + r > COURT.height) {
      const top = ball.y - r < 0;
      ball.y = top ? r : COURT.height - r;
      ball.vy = top ? Math.abs(ball.vy) : -Math.abs(ball.vy);
      ball.spin = -(ball.spin || 0) * 0.5; // the curve flips and weakens, like a real bounce
      events.push({ type: 'wall', x: ball.x, y: top ? 0 : COURT.height, nx: 0, ny: top ? 1 : -1 });
    }

    this.rules.collide(this, events);

    const scorer = this.rules.endZone(this, events);
    if (!scorer) return;
    const loser = other(scorer);
    s.scores[scorer] += 1;
    ball.visible = false;
    events.push({ type: 'point', scorer, x: ball.x, y: ball.y });
    if (s.scores[scorer] >= POINTS_TO_WIN) {
      s.phase = PHASE.OVER;
      s.winner = scorer;
      events.push({ type: 'win', winner: scorer });
    } else {
      this.beginKickoff(loser); // like real football: the team that let the goal in kicks off
    }
  }

  // ---------- for the controllers ----------

  /** Which rods each phone controls, in left-to-right order as on the big screen. */
  controls() {
    const out = {};
    for (const p of [...this.state.paddles].sort((a, b) => a.x - b.x)) {
      if (!p.slot) continue;
      (out[p.slot] ||= []).push({ lane: p.lane, kind: p.kind });
    }
    return out;
  }

}
