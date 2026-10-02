import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, PHASE } from '../shared/engine.js';
import { COURT, DIFFICULTIES, POINTS_TO_WIN, SOCCER, BALL } from '../shared/config.js';

// Small repeatable random generator so tests give the same result every run.
function seeded(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function run(engine, seconds, onFrame) {
  const all = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    if (onFrame) onFrame(engine);
    all.push(...engine.step(1 / 60));
  }
  return all;
}

test('head to head: countdown, serve, and the ball moves at a constant speed', () => {
  const e = new Engine({ rng: seeded(3) });
  e.setSettings({ mode: 'versus', difficulty: 'medium' });
  e.startMatch([1, 2]);
  assert.equal(e.state.phase, PHASE.COUNTDOWN);
  run(e, 3.1);
  assert.equal(e.state.phase, PHASE.PLAYING);
  const speed = DIFFICULTIES.medium.ballSpeed;
  run(e, 0.5);
  assert.ok(Math.abs(Math.hypot(e.state.ball.vx, e.state.ball.vy) - speed) < 1e-6);
});

test('a missed ball scores for the other side and serves towards the loser', () => {
  const e = new Engine({ rng: seeded(5) });
  e.startMatch([1, 2]);
  e.state.serveTo = 'left';
  run(e, 3.05);
  // Keep the left paddle far away from the ball so it misses.
  const events = run(e, 5, (eng) => eng.setPaddle(1, eng.state.ball.y > COURT.height / 2 ? 0 : 1));
  const point = events.find((ev) => ev.type === 'point');
  assert.equal(point.scorer, 'right');
  assert.equal(e.state.scores.right, 1);
  assert.equal(e.state.serveTo, 'left');
});

test('a paddle in the way returns the ball', () => {
  const e = new Engine({ rng: seeded(7) });
  e.startMatch([1, 2]);
  run(e, 3.05);
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
  e.startMatch([1, 2]);
  // Both players hide in a corner, so every serve is a point.
  run(e, 120, (eng) => { eng.setPaddle(1, 0); eng.setPaddle(2, 0); });
  assert.equal(e.state.phase, PHASE.OVER);
  assert.equal(Math.max(e.state.scores.left, e.state.scores.right), POINTS_TO_WIN);
  assert.ok(e.state.winner);
});

test('pause and disconnect hold the game, and it resumes where it was', () => {
  const e = new Engine({ rng: seeded(11) });
  e.startMatch([1, 2]);
  run(e, 3.2);
  const before = { ...e.state.ball };
  e.pause();
  assert.equal(e.state.phase, PHASE.PAUSED);
  e.setPlayerConnected(2, false);
  assert.equal(e.state.phase, PHASE.WAITING);
  run(e, 2);
  assert.deepEqual(e.state.ball, before);
  e.setPlayerConnected(2, true);
  assert.equal(e.state.phase, PHASE.PAUSED); // still paused by the player
  e.resume();
  assert.equal(e.state.phase, PHASE.COUNTDOWN);
  run(e, 3.05);
  assert.equal(e.state.phase, PHASE.PLAYING);
  assert.equal(Math.sign(e.state.ball.vx), Math.sign(before.vx)); // same rally continues
  assert.deepEqual(e.state.scores, { left: 0, right: 0 });
});

test('settings can only change outside a match', () => {
  const e = new Engine();
  assert.ok(e.setSettings({ mode: 'team', difficulty: 'hard' }));
  e.startMatch([1]);
  assert.equal(e.setSettings({ difficulty: 'easy' }), false);
  assert.equal(e.state.settings.difficulty, 'hard');
});

test('team mode: two kids on the left can overlap freely, computer on the right', () => {
  const e = new Engine();
  e.setSettings({ mode: 'team' });
  e.startMatch([1, 2]);
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
    e.startMatch([1, 2]);
    run(e, 3.2);
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

test('soccer: two rods of three players per team, interleaved like foosball', () => {
  const e = new Engine();
  e.setSettings({ game: 'soccer' });
  e.startMatch([1, 2]);
  const rods = [...e.state.paddles].sort((a, b) => a.x - b.x).map((p) => `${p.side}:${p.kind}:${p.offsets.length}`);
  assert.deepEqual(rods, ['left:def:3', 'right:att:3', 'left:att:3', 'right:def:3']);
  assert.deepEqual(e.summary().controls, { 1: [{ lane: 0, kind: 'def' }, { lane: 1, kind: 'att' }], 2: [{ lane: 1, kind: 'att' }, { lane: 0, kind: 'def' }] });
  // Each lane moves its own rod.
  e.setPaddle(1, 0, 0);
  e.setPaddle(1, 1, 1);
  run(e, 0.2);
  const def = e.state.paddles.find((p) => p.id === 'left-def');
  const att = e.state.paddles.find((p) => p.id === 'left-att');
  assert.equal(def.y, def.minY);
  assert.equal(att.y, att.maxY);
});

test('soccer team mode: one kid on defence, the other on attack', () => {
  const e = new Engine();
  e.setSettings({ game: 'soccer', mode: 'team' });
  e.startMatch([1, 2]);
  assert.deepEqual(e.summary().controls, { 1: [{ lane: 0, kind: 'def' }], 2: [{ lane: 1, kind: 'att' }] });
  e.startMatch([1]);
  assert.equal(e.summary().controls[1].length, 2);
});

// Soccer with all rods moved out of the way, then the ball fired at an end.
function soccerShot(y, vy = 0) {
  const e = new Engine({ rng: seeded(4) });
  e.setSettings({ game: 'soccer' });
  e.startMatch([1, 2]);
  run(e, 3.2);
  e.state.paddles = [];
  e.state.ball = { x: 300, y, vx: -e.speed, vy, spin: 0, visible: true };
  return e;
}

test('soccer: a shot into the goal mouth scores', () => {
  const e = soccerShot(COURT.height / 2);
  const events = run(e, 1);
  assert.equal(events.find((x) => x.type === 'point')?.scorer, 'right');
});

test('soccer: the end wall beside the goal bounces the ball back', () => {
  const e = soccerShot(120);
  const events = run(e, 1);
  assert.equal(events.some((x) => x.type === 'point'), false);
  assert.ok(events.some((x) => x.type === 'wall' && x.nx === 1));
  assert.ok(e.state.ball.vx > 0);
});

test('soccer: a player in the way blocks the shot and the speed stays the same', () => {
  const e = soccerShot(COURT.height / 2);
  e.startMatch([1, 2]);
  run(e, 3.2);
  const def = e.state.paddles.find((p) => p.id === 'left-def');
  def.y = def.target = COURT.height / 2; // middle player right on the ball's path
  e.state.ball = { x: 600, y: COURT.height / 2, vx: -e.speed, vy: 0, spin: 0, visible: true };
  e.state.paddles = [def];
  const events = run(e, 1);
  assert.ok(events.some((x) => x.type === 'hit' && x.paddle === 'left-def'));
  assert.equal(events.some((x) => x.type === 'point'), false);
  assert.ok(Math.abs(Math.hypot(e.state.ball.vx, e.state.ball.vy) - e.speed) < 1e-6);
});

test('soccer: a full match against the computer finishes', () => {
  const e = new Engine({ rng: seeded(8) });
  e.setSettings({ game: 'soccer', mode: 'team', difficulty: 'medium' });
  e.startMatch([1]);
  run(e, 900, (eng) => {
    // A kid who just follows the ball with both rods.
    eng.setPaddle(1, eng.state.ball.y / COURT.height, 0);
    eng.setPaddle(1, eng.state.ball.y / COURT.height, 1);
  });
  assert.equal(e.state.phase, PHASE.OVER);
  console.log(`soccer match vs medium computer: ${e.state.scores.left}-${e.state.scores.right}`);
});

// Measures how often the computer misses against a perfect team.
function cpuMissRate(difficulty, seed) {
  const e = new Engine({ rng: seeded(seed) });
  e.setSettings({ mode: 'team', difficulty });
  e.startMatch([1]);
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
    if (e.state.phase === PHASE.OVER) { e.startMatch([1]); }
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
