// Neon Pong game engine: all the rules, none of the drawing.
//
// A display (the tablet web page today, an Apple TV app later) does three things:
//   1. calls engine.step(seconds) every frame and gets back a list of events
//      (hits, bounces, points...) to play sounds or effects for,
//   2. reads engine.state to draw the court,
//   3. passes player input in with setPaddle(), pause(), resume() etc.
//
// Phase two (power-ups) can hook in at step() and add new event types.

import {
  COURT, PADDLE, BALL, MODES, DIFFICULTIES, COLORS, POINTS_TO_WIN,
  COUNTDOWN_SECONDS, MAX_BOUNCE_ANGLE, DEFAULT_SETTINGS,
} from './config.js';
import { ComputerPlayer } from './ai.js';

const SUBSTEP = 1 / 240; // physics runs in small slices so the ball never skips through a paddle

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
    this.ai = null;
    this.state = {
      settings: { ...DEFAULT_SETTINGS },
      phase: PHASE.LOBBY,
      matchId: 0,
      scores: { left: 0, right: 0 },
      paddles: [],
      ball: { x: COURT.width / 2, y: COURT.height / 2, vx: 0, vy: 0, visible: false },
      countdown: 0, // seconds left in the countdown
      serveTo: 'left', // side the next serve goes towards
      resumeBall: false, // after a pause, continue the rally instead of serving
      manualPause: false,
      missing: [], // player slots whose phone is disconnected
      winner: null, // 'left' | 'right'
    };
  }

  // ---------- settings & match flow ----------

  setSettings({ mode, difficulty }) {
    const s = this.state;
    if (s.phase !== PHASE.LOBBY && s.phase !== PHASE.OVER) return false;
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
    const h = diff.paddleHeight;
    const leftX = PADDLE.inset + PADDLE.width; // front face of a left paddle
    const rightX = COURT.width - PADDLE.inset - PADDLE.width; // front face of a right paddle
    const make = (id, side, color, slot = null) => ({
      id, side, slot, color, h, w: PADDLE.width,
      x: side === 'left' ? leftX : rightX,
      y: COURT.height / 2,
      human: slot !== null,
    });

    const sorted = [...slots].sort();
    if (mode === 'versus') {
      s.paddles = [make('p1', 'left', COLORS[1], 1), make('p2', 'right', COLORS[2], 2)];
    } else {
      s.paddles = sorted.map((slot) => make(`p${slot}`, 'left', COLORS[slot], slot));
      s.paddles.push(make('cpu', 'right', COLORS.cpu));
      this.ai = new ComputerPlayer(diff.ai, this.rng);
    }
    if (mode === 'versus') this.ai = null;

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
    this.ai = null;
  }

  isInMatch(slot) {
    return this.state.paddles.some((p) => p.slot === slot);
  }

  get inMatch() {
    const p = this.state.phase;
    return p !== PHASE.LOBBY && p !== PHASE.OVER;
  }

  // ---------- input ----------

  /** y01: 0 = paddle at the top, 1 = paddle at the bottom. */
  setPaddle(slot, y01) {
    const paddle = this.state.paddles.find((p) => p.slot === slot);
    if (!paddle || !Number.isFinite(y01)) return;
    const t = Math.max(0, Math.min(1, y01));
    paddle.y = paddle.h / 2 + t * (COURT.height - paddle.h);
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
      s.ball = { x: COURT.width / 2, y: COURT.height / 2, vx: 0, vy: 0, visible: true };
    }
    if (this.ai) this.ai.reset();
  }

  serve() {
    const s = this.state;
    const speed = DIFFICULTIES[s.settings.difficulty].ballSpeed;
    // A gentle angle between 10 and 30 degrees, up or down.
    const deg = 10 + this.rng() * 20;
    const angle = (deg * Math.PI) / 180 * (this.rng() < 0.5 ? -1 : 1);
    const dir = s.serveTo === 'left' ? -1 : 1;
    s.ball = {
      x: COURT.width / 2,
      y: COURT.height / 2,
      vx: Math.cos(angle) * speed * dir,
      vy: Math.sin(angle) * speed,
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

    // The computer keeps its paddle moving during countdowns too, like a human would.
    if (this.ai && (s.phase === PHASE.PLAYING || s.phase === PHASE.COUNTDOWN)) {
      const cpu = s.paddles.find((p) => p.id === 'cpu');
      this.ai.update(dt, s.ball, cpu, s.phase === PHASE.PLAYING);
      cpu.y = Math.max(cpu.h / 2, Math.min(COURT.height - cpu.h / 2, cpu.y));
    }

    if (s.phase !== PHASE.PLAYING) return;
    this.moveBall(dt, events);
  }

  moveBall(dt, events) {
    const s = this.state;
    const ball = s.ball;
    const r = BALL.size / 2;
    const prevX = ball.x;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Top and bottom walls
    if (ball.y - r < 0) {
      ball.y = r;
      ball.vy = Math.abs(ball.vy);
      events.push({ type: 'wall' });
    } else if (ball.y + r > COURT.height) {
      ball.y = COURT.height - r;
      ball.vy = -Math.abs(ball.vy);
      events.push({ type: 'wall' });
    }

    // Paddles: did the ball's front edge cross a paddle's face this slice?
    const movingLeft = ball.vx < 0;
    const side = movingLeft ? 'left' : 'right';
    const candidates = s.paddles.filter((p) => p.side === side).filter((p) => {
      const crossed = movingLeft
        ? prevX - r >= p.x && ball.x - r < p.x
        : prevX + r <= p.x && ball.x + r > p.x;
      return crossed && Math.abs(ball.y - p.y) <= p.h / 2 + r;
    });
    if (candidates.length > 0) {
      // In team mode two paddles can overlap: the one closest to the ball takes the hit.
      candidates.sort((a, b) => Math.abs(ball.y - a.y) - Math.abs(ball.y - b.y));
      this.bounceOff(candidates[0]);
      events.push({ type: 'hit', paddle: candidates[0].id, side });
      return;
    }

    // Past the end of the court: point to the other side.
    if (ball.x + r < 0 || ball.x - r > COURT.width) {
      const scorer = ball.x < 0 ? 'right' : 'left';
      const loser = scorer === 'left' ? 'right' : 'left';
      s.scores[scorer] += 1;
      ball.visible = false;
      events.push({ type: 'point', scorer });
      if (s.scores[scorer] >= POINTS_TO_WIN) {
        s.phase = PHASE.OVER;
        s.winner = scorer;
        events.push({ type: 'win', winner: scorer });
      } else {
        s.serveTo = loser; // serve towards whoever just lost the point
        this.beginCountdown(false);
      }
    }
  }

  bounceOff(paddle) {
    const ball = this.state.ball;
    const r = BALL.size / 2;
    const speed = Math.hypot(ball.vx, ball.vy); // speed never changes within a level
    const offset = (ball.y - paddle.y) / (paddle.h / 2 + r); // -1 (top edge) .. 1 (bottom edge)
    const angle = Math.max(-1, Math.min(1, offset)) * (MAX_BOUNCE_ANGLE * Math.PI) / 180;
    const dir = paddle.side === 'left' ? 1 : -1;
    ball.vx = Math.cos(angle) * speed * dir;
    ball.vy = Math.sin(angle) * speed;
    ball.x = paddle.side === 'left' ? paddle.x + r : paddle.x - r;
  }

  // ---------- for phones ----------

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
    };
  }
}
