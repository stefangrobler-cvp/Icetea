import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, PHASE } from '../games/soccer/engine.js';
import { COURT, SOCCER, BALL } from '../games/soccer/config.js';

// Soccer's own rules, tested without any platform: the game folder stands on its own.

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

test('two rods of three players per team, interleaved like foosball', () => {
  const e = new Engine();
    start(e, [1, 2]);
  const rods = [...e.state.paddles].sort((a, b) => a.x - b.x).map((p) => `${p.side}:${p.kind}:${p.offsets.length}`);
  assert.deepEqual(rods, ['left:def:3', 'right:att:3', 'left:att:3', 'right:def:3']);
  assert.deepEqual(e.controls(), { 1: [{ lane: 0, kind: 'def' }, { lane: 1, kind: 'att' }], 2: [{ lane: 1, kind: 'att' }, { lane: 0, kind: 'def' }] });
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
  e.setSettings({ mode: 'team' });
  start(e, [1, 2]);
  assert.deepEqual(e.controls(), { 1: [{ lane: 0, kind: 'def' }], 2: [{ lane: 1, kind: 'att' }] });
  start(e, [1]);
  assert.equal(e.controls()[1].length, 2);
});

// Soccer with all rods moved out of the way, then the ball fired at an end.
function soccerShot(y, vy = 0) {
  const e = new Engine({ rng: seeded(4) });
    start(e, [1, 2]);
  toPlay(e);
  e.state.paddles = [];
  e.state.ball = { x: 300, y, vx: -e.speed, vy, spin: 0, visible: true };
  return e;
}

test('a shot into the goal mouth scores', () => {
  const e = soccerShot(COURT.height / 2);
  const events = run(e, 1);
  assert.equal(events.find((x) => x.type === 'point')?.scorer, 'right');
});

test('the end wall beside the goal bounces the ball back', () => {
  const e = soccerShot(120);
  const events = run(e, 1);
  assert.equal(events.some((x) => x.type === 'point'), false);
  assert.ok(events.some((x) => x.type === 'wall' && x.nx === 1));
  assert.ok(e.state.ball.vx > 0);
});

test('a player in the way blocks the shot and the speed stays the same', () => {
  const e = soccerShot(COURT.height / 2);
  start(e, [1, 2]);
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

test('a full match against the computer finishes', () => {
  const e = new Engine({ rng: seeded(8) });
  e.setSettings({ mode: 'team', difficulty: 'medium' });
  start(e, [1]);
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


test('every spot along every rod can be reached by some player, at every level', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const e = new Engine();
    e.setSettings({ difficulty });
    start(e, [1, 2]);
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

test('coin toss winner kicks off, then the team that lets a goal in kicks off', () => {
  const e = new Engine({ rng: seeded(12) });
    start(e, [1, 2]);
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

test('two kids v computer get one rod each; the attacker kicks off; computer kicks itself', () => {
  const e = new Engine({ rng: seeded(2) });
  e.setSettings({ mode: 'team' });
  start(e, [1]);
  assert.equal(e.controls()[1].length, 2); // one kid: both rods
  e.addPlayer(2); // second kid joins mid-match
  assert.deepEqual(e.controls(), { 1: [{ lane: 0, kind: 'def' }], 2: [{ lane: 1, kind: 'att' }] });
  e.beginKickoff('left');
  assert.equal(e.state.kickoff.slot, 2);
  e.beginKickoff('right');
  assert.equal(e.state.kickoff.slot, null);
  for (let i = 0; i < 60 * 5 && e.state.phase !== PHASE.PLAYING; i++) e.step(1 / 60);
  assert.equal(e.state.phase, PHASE.PLAYING);
  assert.ok(e.state.ball.vx < 0, 'computer kicks towards the kids');
});

test('attackers can pass back; defenders clear forward and never score own goals', () => {
  const e = soccerShot(COURT.height / 2);
  start(e, [1, 2]);
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
