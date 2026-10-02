// Neon Pong game engine: all the rules, none of the drawing.
//
// A display (the tablet web page today, an Apple TV app later) does three things:
//   1. calls engine.step(seconds) every frame and gets back a list of events
//      (hits, bounces, points...) to play sounds or effects for,
//   2. reads engine.state to draw the court,
//   3. passes player input in with setPaddle(), pause(), resume() etc.
//
// The match flow (countdown, pause, scoring, winning) lives here. What is
// different between Ping Pong and Soccer lives in shared/games/.
// Phase two (power-ups) can hook in at step() and add new event types.

import {
  COURT, BALL, MODES, GAMES, DIFFICULTIES, POINTS_TO_WIN,
  COUNTDOWN_SECONDS, DEFAULT_SETTINGS, PADDLE_GLIDE_SPEED,
} from './config.js';
import { ComputerPlayer } from './ai.js';
import { applySpin, clamp } from './physics.js';
import { classic } from './games/classic.js';
import { soccer } from './games/soccer.js';

const RULES = { classic, soccer };
const SUBSTEP = 1 / 240; // physics runs in small slices so the ball never skips through a paddle
const VELOCITY_SMOOTHING = 0.05; // seconds: how quickly a paddle's measured speed follows its movement

export const PHASE = {
  LOBBY: 'lobby', // choosing settings
  COUNTDOWN: 'countdown', // 3, 2, 1 before a serve
  PLAYING: 'playing',
  PAUSED: 'paused', // someone pressed pause
  WAITING: 'waiting', // a player's phone dropped out
  OVER: 'over', // someone won
};

export class Engine {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.accumulator = 0;
    this.ais = new Map(); // paddle id -> ComputerPlayer
    this.time = 0;
    this.state = {
      settings: { ...DEFAULT_SETTINGS },
      phase: PHASE.LOBBY,
      matchId: 0,
      scores: { left: 0, right: 0 },
      paddles: [],
      ball: { x: COURT.width / 2, y: COURT.height / 2, vx: 0, vy: 0, spin: 0, visible: false },
      countdown: 0, // seconds left in the countdown
      serveTo: 'left', // side the next serve goes towards
      resumeBall: false, // after a pause, continue the rally instead of serving
      manualPause: false,
      missing: [], // player slots whose phone is disconnected
      winner: null, // 'left' | 'right'
    };
  }

  get rules() {
    return RULES[this.state.settings.game];
  }

  /** Ball speed for the current game and level. It never changes during a match. */
  get speed() {
    return this.rules.ballSpeed(DIFFICULTIES[this.state.settings.difficulty]);
  }

  // ---------- settings & match flow ----------

  setSettings({ game, mode, difficulty }) {
    const s = this.state;
    if (s.phase !== PHASE.LOBBY && s.phase !== PHASE.OVER) return false;
    if (game && GAMES[game]) s.settings.game = game;
    if (mode && MODES[mode]) s.settings.mode = mode;
    if (difficulty && DIFFICULTIES[difficulty]) s.settings.difficulty = difficulty;
    return true;
  }

  /** Can a match start with these player slots connected (e.g. [1, 2])? */
  canStart(connectedSlots) {
    return connectedSlots.length >= MODES[this.state.settings.mode].humans;
  }

  /** Start a fresh match. `slots` are the connected players, e.g. [1, 2]. */
  startMatch(slots) {
    const s = this.state;
    const { mode, difficulty } = s.settings;
    const diff = DIFFICULTIES[difficulty];
    s.paddles = this.rules.createPaddles({ mode, diff, slots: [...slots].sort() });
    for (const p of s.paddles) {
      p.y = clamp(p.y, p.minY, p.maxY);
      p.target = p.y; // where the player's finger wants it
      p.vy = 0; // measured speed, used for "traction"
      p.prevY = p.y;
    }
    this.ais = new Map(s.paddles.filter((p) => !p.human).map((p) => [p.id, new ComputerPlayer(diff.ai, this.rng)]));

    s.matchId += 1;
    s.scores = { left: 0, right: 0 };
    s.winner = null;
    s.manualPause = false;
    s.missing = []; // the screen only starts a match with connected players
    s.serveTo = this.rng() < 0.5 ? 'left' : 'right';
    this.beginCountdown(false);
    return true;
  }

  backToLobby() {
    const s = this.state;
    s.phase = PHASE.LOBBY;
    s.paddles = [];
    s.ball.visible = false;
    s.manualPause = false;
    s.missing = [];
    s.winner = null;
    this.ais = new Map();
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
   * y01: 0 = top, 1 = bottom. `lane` picks which rod in soccer when a
   * player has two (0 = defence, 1 = attack); ping pong ignores it.
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

  /** Tell the engine a player's phone dropped out or came back. */
  setPlayerConnected(slot, connected) {
    const s = this.state;
    const has = s.missing.includes(slot);
    if (connected && has) s.missing = s.missing.filter((x) => x !== slot);
    else if (!connected && !has && this.isInMatch(slot)) s.missing = [...s.missing, slot];
    else return;
    if (this.inMatch) this.updateHold();
  }

  // Works out whether the game must be held (paused / waiting) or can carry on.
  updateHold() {
    const s = this.state;
    const wasHeld = s.phase === PHASE.PAUSED || s.phase === PHASE.WAITING;
    if (s.missing.length > 0) {
      if (!wasHeld) this.rememberRally();
      s.phase = PHASE.WAITING;
    } else if (s.manualPause) {
      if (!wasHeld) this.rememberRally();
      s.phase = PHASE.PAUSED;
    } else if (wasHeld) {
      // Everyone is back: short countdown, then carry on.
      this.beginCountdown(s.resumeBall);
    }
  }

  rememberRally() {
    const s = this.state;
    // If the ball was moving, continue that rally after the pause. If we were
    // mid-countdown, just redo the countdown and serve.
    s.resumeBall = s.phase === PHASE.PLAYING || (s.phase === PHASE.COUNTDOWN && s.resumeBall);
  }

  beginCountdown(resumeBall) {
    const s = this.state;
    s.phase = PHASE.COUNTDOWN;
    s.countdown = COUNTDOWN_SECONDS;
    s.resumeBall = resumeBall;
    if (!resumeBall) {
      s.ball = { x: COURT.width / 2, y: COURT.height / 2, vx: 0, vy: 0, spin: 0, visible: true };
    }
    for (const ai of this.ais.values()) ai.reset();
  }

  serve() {
    const s = this.state;
    // A gentle angle between 10 and 30 degrees, up or down.
    const deg = 10 + this.rng() * 20;
    const angle = (deg * Math.PI) / 180 * (this.rng() < 0.5 ? -1 : 1);
    const dir = s.serveTo === 'left' ? -1 : 1;
    s.ball = {
      x: COURT.width / 2,
      y: COURT.height / 2,
      vx: Math.cos(angle) * this.speed * dir,
      vy: Math.sin(angle) * this.speed,
      spin: 0,
      visible: true,
    };
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
    this.time += dt;

    if (s.phase === PHASE.COUNTDOWN) {
      const before = Math.ceil(s.countdown);
      s.countdown -= dt;
      const after = Math.ceil(s.countdown);
      if (after !== before && after > 0) events.push({ type: 'countdown', value: after });
      if (s.countdown <= 0) {
        s.phase = PHASE.PLAYING;
        if (!s.resumeBall) this.serve();
        s.resumeBall = false;
        events.push({ type: 'serve' });
      }
    }

    const live = s.phase === PHASE.PLAYING || s.phase === PHASE.COUNTDOWN;
    if (live) this.movePaddles(dt);
    if (s.phase !== PHASE.PLAYING) return;
    this.moveBall(dt, events);
  }

  movePaddles(dt) {
    const s = this.state;
    const glide = PADDLE_GLIDE_SPEED * dt;
    for (const p of s.paddles) {
      p.prevY = p.y;
      if (p.human) {
        // Glide to the finger: instant for normal swipes, smooths out big jumps.
        p.y += clamp(p.target - p.y, -glide, glide);
      } else {
        // The computer keeps its paddle moving during countdowns too, like a human would.
        this.ais.get(p.id)?.update(dt, s.ball, p, s.phase === PHASE.PLAYING);
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
    const loser = scorer === 'left' ? 'right' : 'left';
    s.scores[scorer] += 1;
    ball.visible = false;
    events.push({ type: 'point', scorer, x: ball.x, y: ball.y });
    if (s.scores[scorer] >= POINTS_TO_WIN) {
      s.phase = PHASE.OVER;
      s.winner = scorer;
      events.push({ type: 'win', winner: scorer });
    } else {
      s.serveTo = loser; // serve towards whoever just lost the point
      this.beginCountdown(false);
    }
  }

  // ---------- for phones ----------

  /** Which paddles/rods each phone controls, in left-to-right order as on the tablet. */
  controls() {
    const out = {};
    for (const p of [...this.state.paddles].sort((a, b) => a.x - b.x)) {
      if (!p.slot) continue;
      (out[p.slot] ||= []).push({ lane: p.lane, kind: p.kind });
    }
    return out;
  }

  /** Small summary sent to the phones whenever it changes. */
  summary() {
    const s = this.state;
    return {
      phase: s.phase,
      matchId: s.matchId,
      settings: { ...s.settings },
      scores: { ...s.scores },
      countdown: s.phase === PHASE.COUNTDOWN ? Math.ceil(s.countdown) : 0,
      missing: [...s.missing],
      winner: s.winner,
      sides: Object.fromEntries(s.paddles.filter((p) => p.slot).map((p) => [p.slot, p.side])),
      controls: this.controls(),
    };
  }
}
