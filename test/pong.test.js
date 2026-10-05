import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, PHASE } from '../games/pong/engine.js';
import { COURT, DIFFICULTIES, POINTS_TO_WIN } from '../games/pong/config.js';

// Pong's own rules, tested without any platform: the game folder stands on its own.

// Small repeatable random generator so tests give the same result every run.
function seeded(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

// Skip the coin toss and countdown (or kick off, in soccer) until the ball is in play.
function toPlay(e) {
  for (let i = 0; i < 60 * 20 && e.state.phase !== PHASE.PLAYING; i++) {
    const k = e.state.kickoff;
    if (k && k.slot && k.wait <= 0) e.kick(k.slot, k.aim);
    e.step(1 / 60);
  }
  assert.equal(e.state.phase, PHASE.PLAYING);
}

function run(engine, seconds, onFrame) {
  const all = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    if (onFrame) onFrame(engine);
    all.push(...engine.step(1 / 60));
  }
  return all;
}

// Start a match the way game.js does: seats, their sides and colours.
function start(e, slots) {
  return e.startMatch(slots, { sides: { 1: 'left', 2: 'right' }, colors: { 1: '#0ff', 2: '#f0f', cpu: '#ff0' } });
}

test('head to head: coin toss, countdown, the toss winner serves, constant speed', () => {
  const e = new Engine({ rng: seeded(3) });
  e.setSettings({ mode: 'versus', difficulty: 'medium' });
  start(e, [1, 2]);
  assert.equal(e.state.phase, PHASE.TOSS);
  const winner = e.state.toss.winner;
  run(e, 2.7);
  assert.equal(e.state.phase, PHASE.COUNTDOWN);
  toPlay(e);
  assert.equal(Math.sign(e.state.ball.vx), winner === 'left' ? 1 : -1, 'ball goes away from the toss winner');
  assert.equal(e.state.phase, PHASE.PLAYING);
  const speed = DIFFICULTIES.medium.ballSpeed;
  run(e, 0.5);
  assert.ok(Math.abs(Math.hypot(e.state.ball.vx, e.state.ball.vy) - speed) < 1e-6);
});

test('a missed ball scores for the other side and serves towards the loser', () => {
  const e = new Engine({ rng: seeded(5) });
  start(e, [1, 2]);
  e.state.toss.winner = 'right'; // right serves, towards the left
  toPlay(e);
  // Keep the left paddle far away from the ball so it misses.
  const events = run(e, 5, (eng) => eng.setPaddle(1, eng.state.ball.y > COURT.height / 2 ? 0 : 1));
  const point = events.find((ev) => ev.type === 'point');
  assert.equal(point.scorer, 'right');
  assert.equal(e.state.scores.right, 1);
  assert.equal(e.state.serveTo, 'left');
});

test('a paddle in the way returns the ball', () => {
  const e = new Engine({ rng: seeded(7) });
  start(e, [1, 2]);
  toPlay(e);
  const track = (eng) => {
    const b = eng.state.ball;
    for (const p of eng.state.paddles) p.target = b.y;
  };
  const events = run(e, 10, track);
  assert.ok(events.filter((ev) => ev.type === 'hit').length >= 3);
  assert.equal(events.filter((ev) => ev.type === 'point').length, 0);
});

test('first to 7 wins', () => {
  const e = new Engine({ rng: seeded(9) });
  start(e, [1, 2]);
  // Both players hide in a corner, so every serve is a point.
  run(e, 120, (eng) => { eng.setPaddle(1, 0); eng.setPaddle(2, 0); });
  assert.equal(e.state.phase, PHASE.OVER);
  assert.equal(Math.max(e.state.scores.left, e.state.scores.right), POINTS_TO_WIN);
  assert.ok(e.state.winner);
});

test('pause holds the game, and it resumes where it was after a short countdown', () => {
  // (The platform pauses the game both for the pause button and when a phone drops out.)
  const e = new Engine({ rng: seeded(11) });
  start(e, [1, 2]);
  toPlay(e);
  const before = { ...e.state.ball };
  assert.ok(e.pause());
  assert.equal(e.state.phase, PHASE.PAUSED);
  run(e, 2);
  assert.deepEqual(e.state.ball, before);
  assert.ok(e.resume());
  assert.equal(e.state.phase, PHASE.COUNTDOWN);
  run(e, 3.05);
  assert.equal(e.state.phase, PHASE.PLAYING);
  assert.equal(Math.sign(e.state.ball.vx), Math.sign(before.vx)); // same rally continues
  assert.deepEqual(e.state.scores, { left: 0, right: 0 });
});

test('settings can only change outside a match', () => {
  const e = new Engine();
  assert.ok(e.setSettings({ mode: 'team', difficulty: 'hard' }));
  start(e, [1]);
  assert.equal(e.setSettings({ difficulty: 'easy' }), false);
  assert.equal(e.state.settings.difficulty, 'hard');
});

test('team mode: two kids on the left can overlap freely, computer on the right', () => {
  const e = new Engine();
  e.setSettings({ mode: 'team' });
  start(e, [1, 2]);
  const sides = e.state.paddles.map((p) => `${p.id}:${p.side}`);
  assert.deepEqual(sides, ['p1:left', 'p2:left', 'cpu:right']);
  e.setPaddle(1, 0.5);
  e.setPaddle(2, 0.5);
  run(e, 0.1);
  assert.equal(e.state.paddles[0].y, e.state.paddles[1].y);
});

test('traction: swiping while hitting bends the ball path and adds curve', () => {
  const outgoing = (swipe) => {
    const e = new Engine({ rng: seeded(21) });
    start(e, [1, 2]);
    toPlay(e);
    const s = e.state;
    const left = s.paddles[0];
    // Ball flying flat at the middle of the left paddle.
    s.ball = { x: 400, y: COURT.height / 2, vx: -e.speed, vy: 0, spin: 0, visible: true };
    left.y = left.target = COURT.height / 2;
    left.vy = 0;
    let started = false;
    for (let i = 0; i < 60 * 2; i++) {
      // Swipe through the ball: start 0.1 s before it arrives so the paddle is centred on impact.
      if (swipe && !started && s.ball.x < 98 + e.speed * 0.1) {
        started = true;
        left.y = left.target = COURT.height / 2 - swipe * 0.1;
      }
      if (started) left.target += swipe / 60;
      const ev = e.step(1 / 60).find((x) => x.type === 'hit');
      if (ev) return { vy: s.ball.vy, spin: s.ball.spin, speed: Math.hypot(s.ball.vx, s.ball.vy) };
    }
    throw new Error('no hit');
  };
  const still = outgoing(0);
  const down = outgoing(1200);
  const up = outgoing(-1200);
  assert.ok(Math.abs(still.vy) < 30, 'no swipe: comes straight back');
  assert.ok(down.vy > 100 && down.spin > 0, 'swipe down: goes down and curves down');
  assert.ok(up.vy < -100 && up.spin < 0, 'swipe up: goes up and curves up');
  for (const o of [still, down, up]) assert.ok(Math.abs(o.speed - DIFFICULTIES.easy.ballSpeed) < 1e-6, 'speed unchanged');
});

// Measures how often the computer misses against a perfect team.
function cpuMissRate(difficulty, seed) {
  const e = new Engine({ rng: seeded(seed) });
  e.setSettings({ mode: 'team', difficulty });
  start(e, [1]);
  const rng = seeded(seed + 100);
  let returns = 0;
  let misses = 0;
  let aim = 0;
  for (let i = 0; i < 60 * 600 && e.state.phase !== PHASE.OVER; i++) {
    // A perfect human, hitting the ball with a random spot on the paddle each time.
    const human = e.state.paddles[0];
    if (e.state.ball.vx > 0) aim = (rng() * 2 - 1) * 0.8 * (human.h / 2);
    human.target = e.state.ball.y - aim;
    for (const ev of e.step(1 / 60)) {
      if (ev.type === 'hit' && ev.paddle === 'cpu') returns++;
      if (ev.type === 'point' && ev.scorer === 'left') misses++;
    }
    if (e.state.phase === PHASE.OVER) { start(e, [1]); }
    if (returns + misses > 400) break;
  }
  return misses / (returns + misses);
}

test('computer gets better with difficulty', () => {
  const easy = cpuMissRate('easy', 1);
  const medium = cpuMissRate('medium', 1);
  const hard = cpuMissRate('hard', 1);
  console.log(`computer miss rate  easy ${(easy * 100).toFixed(0)}%  medium ${(medium * 100).toFixed(0)}%  hard ${(hard * 100).toFixed(0)}%`);
  assert.ok(easy > medium && medium > hard, 'harder levels should miss less');
  assert.ok(easy >= 0.25, 'easy computer should make plenty of mistakes');
  assert.ok(hard <= 0.08, 'hard computer should rarely miss');
});

test('pause: change the level on the fly, then carry on with the same scores', () => {
  const e = new Engine({ rng: seeded(6) });
  e.setSettings({ difficulty: 'easy' });
  start(e, [1, 2]);
  toPlay(e);
  e.state.scores = { left: 2, right: 3 };
  const easyH = e.state.paddles[0].h;
  assert.equal(e.setSettings({ difficulty: 'hard' }), false, 'not while playing');
  e.pause();
  assert.ok(e.setSettings({ difficulty: 'hard' }));
  assert.ok(e.state.paddles[0].h < easyH);
  assert.ok(Math.abs(Math.hypot(e.state.ball.vx, e.state.ball.vy) - e.speed) < 1e-6);
  e.resume();
  toPlay(e);
  assert.deepEqual(e.state.scores, { left: 2, right: 3 });
});
