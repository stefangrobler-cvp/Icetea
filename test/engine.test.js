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

test('head to head: coin toss, countdown, the toss winner serves, constant speed', () => {
  const e = new Engine({ rng: seeded(3) });
  e.setSettings({ mode: 'versus', difficulty: 'medium' });
  e.startMatch([1, 2]);
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
  e.startMatch([1, 2]);
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
  e.startMatch([1, 2]);
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
  toPlay(e);
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
  toPlay(e);
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
  toPlay(e);
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
  toPlay(e);
  const def = e.state.paddles.find((p) => p.id === 'left-def');
  def.y = def.target = COURT.height / 2 - def.offsets[1]; // a player right on the ball's path
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
  const rng = seeded(99);
  let kidClock = -1;
  let kidError = 0;
  run(e, 900, (eng) => {
    // A decent (not perfect) kid: lines the nearest player of each rod up with
    // the ball, but misjudges it a little, more so now and then.
    if (Math.floor(eng.time * 2) !== kidClock) { kidClock = Math.floor(eng.time * 2); kidError = (rng() * 2 - 1) * 70; }
    const aimY = eng.state.ball.y + kidError;
    for (const p of eng.state.paddles.filter((x) => x.slot === 1)) {
      const reach = (o) => Math.abs(Math.max(p.minY, Math.min(p.maxY, aimY - o)) + o - aimY);
      const o = p.offsets.reduce((a2, b2) => (reach(b2) < reach(a2) ? b2 : a2));
      eng.setPaddle(1, (aimY - o - p.minY) / (p.maxY - p.minY), p.lane);
    }
    const k = eng.state.kickoff;
    if (k && k.slot === 1 && k.wait <= 0) eng.kick(1, 0);
  });
  console.log(`soccer match vs medium computer: ${e.state.scores.left}-${e.state.scores.right} (${e.state.phase})`);
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

test('soccer: every spot along every rod can be reached by some player, at every level', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const e = new Engine();
    e.setSettings({ game: 'soccer', difficulty });
    e.startMatch([1, 2]);
    for (const p of e.state.paddles) {
      for (let y = BALL.radius; y <= COURT.height - BALL.radius; y += 2) {
        // Can any player on this rod be moved so its body covers height y?
        const ok = p.offsets.some((o) => y >= p.minY + o - p.h / 2 && y <= p.maxY + o + p.h / 2);
        assert.ok(ok, `${difficulty} ${p.id}: nobody can reach y=${y}`);
      }
      // ...and neighbouring players' reach overlaps, so nothing slips between them.
      for (let i = 1; i < p.offsets.length; i++) {
        const overlap = (p.maxY + p.offsets[i - 1] + p.h / 2) - (p.minY + p.offsets[i] - p.h / 2);
        assert.ok(overlap >= SOCCER.overlap - 1e-6, `${difficulty} ${p.id}: overlap ${overlap}`);
      }
    }
  }
});

test('soccer: coin toss winner kicks off, then the team that lets a goal in kicks off', () => {
  const e = new Engine({ rng: seeded(12) });
  e.setSettings({ game: 'soccer' });
  e.startMatch([1, 2]);
  const winner = e.state.toss.winner;
  run(e, 2.7);
  assert.equal(e.state.phase, PHASE.KICKOFF);
  assert.equal(e.state.kickoff.side, winner);
  const kicker = e.state.kickoff.slot;
  assert.equal(kicker, winner === 'left' ? 1 : 2);
  // Can't kick while the "get ready" moment is on, and only the kicker can kick.
  assert.equal(e.kick(kicker, 0), false);
  run(e, 1.3);
  assert.equal(e.kick(kicker === 1 ? 2 : 1, 0), false);
  // Aim straight up: gets limited to a sensible angle, still the right way.
  assert.ok(e.aimKickoff(kicker, -Math.PI / 2));
  assert.ok(e.kick(kicker));
  assert.equal(e.state.phase, PHASE.PLAYING);
  assert.equal(Math.sign(e.state.ball.vx), winner === 'left' ? 1 : -1);
  assert.ok(e.state.ball.vy < 0);
  // Fire the ball into the left goal: the left team kicks off next.
  e.state.paddles = [];
  Object.assign(e.state.ball, { x: 200, y: COURT.height / 2, vx: -e.speed, vy: 0, spin: 0 });
  run(e, 1);
  assert.equal(e.state.phase, PHASE.KICKOFF);
  assert.equal(e.state.kickoff.side, 'left');
});

test('soccer: two kids v computer get one rod each; the attacker kicks off; computer kicks itself', () => {
  const e = new Engine({ rng: seeded(2) });
  e.setSettings({ game: 'soccer', mode: 'team' });
  e.startMatch([1]);
  assert.equal(e.summary().controls[1].length, 2); // one kid: both rods
  e.addPlayer(2); // second kid joins mid-match
  assert.deepEqual(e.summary().controls, { 1: [{ lane: 0, kind: 'def' }], 2: [{ lane: 1, kind: 'att' }] });
  e.beginKickoff('left');
  assert.equal(e.state.kickoff.slot, 2);
  e.beginKickoff('right');
  assert.equal(e.state.kickoff.slot, null);
  for (let i = 0; i < 60 * 5 && e.state.phase !== PHASE.PLAYING; i++) e.step(1 / 60);
  assert.equal(e.state.phase, PHASE.PLAYING);
  assert.ok(e.state.ball.vx < 0, 'computer kicks towards the kids');
});

test('pause: change the level on the fly, then carry on with the same scores', () => {
  const e = new Engine({ rng: seeded(6) });
  e.setSettings({ game: 'soccer', difficulty: 'easy' });
  e.startMatch([1, 2]);
  toPlay(e);
  e.state.scores = { left: 2, right: 3 };
  const easyH = e.state.paddles[0].h;
  assert.equal(e.setSettings({ difficulty: 'hard' }), false, 'not while playing');
  e.pause();
  assert.ok(e.setSettings({ difficulty: 'hard' }));
  assert.equal(e.setSettings({ game: 'classic' }), false, 'game can only change from the menu');
  assert.ok(e.state.paddles[0].h < easyH);
  assert.ok(Math.abs(Math.hypot(e.state.ball.vx, e.state.ball.vy) - e.speed) < 1e-6);
  e.resume();
  toPlay(e);
  assert.deepEqual(e.state.scores, { left: 2, right: 3 });
  e.pause();
  e.backToLobby();
  assert.equal(e.state.phase, PHASE.LOBBY);
});

test('soccer: attackers can pass back; defenders clear forward and never score own goals', () => {
  const e = soccerShot(COURT.height / 2);
  e.startMatch([1, 2]);
  toPlay(e);
  const all = e.state.paddles;
  const att = all.find((p) => p.id === 'left-att');
  const def = all.find((p) => p.id === 'left-def');
  // Ball heading forward hits the back of its own attacker: bounces back (a back pass).
  e.state.paddles = [att];
  att.y = att.target = COURT.height / 2;
  e.state.ball = { x: att.x - 200, y: COURT.height / 2 + 5, vx: e.speed, vy: 0, spin: 0, visible: true };
  let events = run(e, 0.5);
  assert.ok(events.some((x) => x.type === 'hit' && x.paddle === 'left-att'));
  assert.ok(e.state.ball.vx < 0, 'attacker passed it back');
  // ...but a clearance by the team's own defender flies past its attackers.
  e.state.ball = { x: att.x - 200, y: COURT.height / 2 + 5, vx: e.speed, vy: 0, spin: 0, visible: true, lastTouch: { side: 'left', id: 'left-def' } };
  events = run(e, 0.5);
  assert.equal(events.some((x) => x.type === 'hit'), false);
  // Ball behind the defender, heading forward (off the end wall): passes through.
  e.state.paddles = [def];
  def.y = def.target = COURT.height / 2;
  e.state.ball = { x: def.x - 120, y: COURT.height / 2, vx: e.speed, vy: 0, spin: 0, visible: true };
  events = run(e, 0.4);
  assert.equal(events.some((x) => x.type === 'hit'), false);
  // Ball coming at the defender from the front: cleared forward.
  e.state.ball = { x: def.x + 250, y: COURT.height / 2 + 10, vx: -e.speed, vy: 0, spin: 0, visible: true };
  events = run(e, 0.6);
  assert.ok(events.some((x) => x.type === 'hit' && x.paddle === 'left-def'));
  assert.ok(e.state.ball.vx > 0);
});
