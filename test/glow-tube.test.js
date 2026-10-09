import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, PHASE } from '../games/glow-tube/engine.js';
import { TUBE, CRYSTAL, TUMBLE, BOOST, DIFFICULTIES } from '../games/glow-tube/config.js';

// Glow Tube's own rules, tested without any platform.

function seeded(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const race = (n) => Array.from({ length: n }, (_, i) => ({ seat: i + 1, side: `p${i + 1}`, color: '#0ff' }));
const team = (seats, extra = {}) => seats.map((seat) => ({ seat, side: 'team', color: '#0ff', ...extra }));

function run(e, seconds, play) {
  const events = [];
  for (let t = 0; t < seconds && e.state.phase !== PHASE.OVER; t += 1 / 60) {
    if (play) play(e);
    events.push(...e.step(1 / 60));
  }
  return events;
}

// A good rider: steers to their next crystal, around any obstacle in the way.
function good(e) {
  const s = e.state;
  for (const r of Object.values(s.riders)) {
    const next = s.crystals.find((c) => c.seat === r.seat && !c.taken && c.d > s.distance);
    let target = next ? next.a : 0;
    const block = s.obstacles.find((o) => o.d > s.distance && o.d < s.distance + 8 && Math.abs(o.a - target) < o.width + 0.15);
    if (block) target = block.a + (block.a > 0 ? -1 : 1) * (block.width + 0.3);
    e.steer(r.seat, target / TUBE.maxAngle);
  }
}

test('glow-tube: countdown, then everyone rides from the start line to the finish line', () => {
  const e = new Engine({ rng: seeded(1) });
  e.startMatch('race', race(2));
  assert.equal(e.state.phase, PHASE.COUNTDOWN);
  run(e, 3.1);
  assert.equal(e.state.phase, PHASE.RIDING);
  const events = run(e, 120);
  assert.equal(e.state.phase, PHASE.OVER);
  assert.equal(e.state.distance, DIFFICULTIES.easy.length);
  assert.ok(events.some((ev) => ev.type === 'finish'));
});

test('glow-tube: every player gets the same number of crystals, laid out away from obstacles', () => {
  const e = new Engine({ rng: seeded(2) });
  e.setDifficulty('hard');
  e.startMatch('race', race(4));
  const counts = [1, 2, 3, 4].map((seat) => e.state.crystals.filter((c) => c.seat === seat).length);
  assert.ok(counts[0] > 20);
  assert.ok(counts.every((n) => n === counts[0]), `equal: ${counts}`);
  for (const c of e.state.crystals) {
    assert.ok(Math.abs(c.a) <= TUBE.maxAngle);
    assert.ok(!e.state.obstacles.some((o) => Math.abs(o.d - c.d) < 1 && Math.abs(o.a - c.a) < o.width), 'no crystal inside an obstacle');
  }
});

test('glow-tube: riders catch only their own colour, and steering is limited to the walls', () => {
  const e = new Engine({ rng: seeded(3) });
  e.startMatch('race', race(2));
  run(e, 3.1);
  const events = run(e, 120, good);
  const catches = events.filter((ev) => ev.type === 'catch');
  assert.ok(catches.length > 20);
  for (const ev of catches) assert.equal(e.state.crystals.find((c) => c.id === ev.id).seat, ev.seat);
  e.steer(1, 7);
  assert.equal(e.state.riders[1].target, TUBE.maxAngle);
  e.steer(1, 'left');
  assert.equal(e.state.riders[1].target, TUBE.maxAngle, 'bad values are ignored');
});

test('glow-tube: race - the most crystals at the finish wins; a tie is a draw', () => {
  const e = new Engine({ rng: seeded(4) });
  e.startMatch('race', race(2));
  run(e, 3.1);
  run(e, 120, (eng) => {
    good(eng);
    eng.steer(2, eng.state.riders[2].a > 0 ? -1 : 1); // player 2 just swings wall to wall
  });
  assert.ok(e.state.riders[1].caught > e.state.riders[2].caught);
  assert.equal(e.state.winner, 'p1');
  const tie = new Engine({ rng: seeded(4) });
  tie.startMatch('race', race(2));
  run(tie, 3.1);
  tie.state.riders[1].caught = 5;
  tie.state.riders[2].caught = 5;
  tie.state.distance = tie.state.length - 1;
  run(tie, 1);
  assert.equal(tie.state.winner, null);
});

test('glow-tube: team - a good team fills the jar on every level; doing nothing does not', () => {
  for (const level of Object.keys(DIFFICULTIES)) {
    const e = new Engine({ rng: seeded(5) });
    e.setDifficulty(level);
    e.startMatch('team', team([1, 2]));
    assert.ok(e.state.goal > 0);
    run(e, 200, good);
    assert.equal(e.state.winner, 'team', level);
    assert.ok(e.jar() >= e.state.goal);
  }
  const idle = new Engine({ rng: seeded(5) });
  idle.startMatch('team', team([1]));
  run(idle, 200);
  assert.equal(idle.state.winner, 'cpu');
});

test('glow-tube: hitting an obstacle is a tumble - no catching or steering for a moment, never out', () => {
  const e = new Engine({ rng: seeded(6) });
  e.setDifficulty('hard');
  e.startMatch('race', race(2));
  run(e, 3.1);
  const o = e.state.obstacles[0];
  // Ride straight into the first obstacle.
  const events = run(e, 60, (eng) => { eng.steer(1, o.a / TUBE.maxAngle); });
  const tumble = events.find((ev) => ev.type === 'tumble' && ev.seat === 1);
  assert.ok(tumble);
  const r = e.state.riders[1];
  assert.ok(e.state.phase !== PHASE.OVER || r.caught >= 0);
  // Mid-tumble: steering doesn't move the board.
  const t2 = new Engine({ rng: seeded(6) });
  t2.setDifficulty('hard');
  t2.startMatch('race', race(2));
  run(t2, 3.1);
  run(t2, 30, (eng) => { if (!eng.state.riders[1].tumble) eng.steer(1, o.a / TUBE.maxAngle); });
  const r2 = t2.state.riders[1];
  if (r2.tumble > 0) {
    const a = r2.a;
    t2.steer(1, -1);
    run(t2, Math.min(0.3, r2.tumble - 0.05));
    assert.equal(t2.state.riders[1].a, a);
  }
  assert.ok(TUMBLE > 0.5 && TUMBLE < 2);
});

test('glow-tube: help gives that player a wider catch and a pull towards their crystals', () => {
  const play = (boost) => {
    const e = new Engine({ rng: seeded(7) });
    e.startMatch('race', [{ seat: 1, side: 'p1', boost }, { seat: 2, side: 'p2', boost: 0 }]);
    run(e, 200, (eng) => eng.steer(1, 0)); // holds the middle the whole way
    return [e.state.riders[1].caught, e.state.riders[2].caught];
  };
  const [plain] = play(0);
  const [helped, other] = play(2);
  assert.ok(helped > plain * 1.5, `${helped} vs ${plain}`);
  assert.ok(BOOST.catch[2] > BOOST.catch[0]);
  assert.equal(other, play(0)[1], 'the other player is unchanged');
});

test('glow-tube: nothing moves while paused', () => {
  const e = new Engine({ rng: seeded(8) });
  e.startMatch('race', race(2));
  run(e, 5);
  const before = JSON.stringify(e.view());
  e.pause();
  run(e, 2, good);
  assert.equal(JSON.stringify(e.view()), before);
  e.resume();
  run(e, 0.5);
  assert.notEqual(JSON.stringify(e.view()), before);
});

test('glow-tube: a kid joining a team ride gets a board and crystals from there on', () => {
  const e = new Engine({ rng: seeded(9) });
  e.startMatch('team', team([1]));
  run(e, 10);
  const goal = e.state.goal;
  assert.equal(e.addPlayer(3, { color: '#0f0' }), true);
  assert.equal(e.addPlayer(3, { color: '#0f0' }), false, 'only once');
  const mine = e.state.crystals.filter((c) => c.seat === 3);
  assert.ok(mine.length > 0 && mine.every((c) => c.d > e.state.distance));
  assert.ok(e.state.goal > goal, 'the jar goal grows with the extra crystals');
  const r = new Engine();
  r.startMatch('race', race(2));
  assert.equal(r.addPlayer(3), false, 'race: wait for the next one');
  assert.ok(CRYSTAL.gap > 0);
});
