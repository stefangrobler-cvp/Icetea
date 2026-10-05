import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, PHASE, quarters } from '../games/cyber-hunt/engine.js';
import { DIFFICULTIES, TEAM_ROUNDS, RACE_TO, PENALTY, FREEZE, BOOST, REACH, CITY } from '../games/cyber-hunt/config.js';

// Cyber Hunt's own rules, tested without any platform.

function seeded(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function run(e, seconds) {
  const events = [];
  for (let t = 0; t < seconds && e.state.phase !== PHASE.OVER; t += 1 / 60) events.push(...e.step(1 / 60));
  return events;
}

function until(e, phase, limit = 30) {
  for (let t = 0; t < limit && e.state.phase !== phase; t += 1 / 60) e.step(1 / 60);
  assert.equal(e.state.phase, phase);
}

// Which quarter a point is in, and where it sits inside it (0..1, allowing for the reach).
function aimAt(e, seat, x, y) {
  const qs = quarters();
  const quad = qs.findIndex((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
  const q = qs[quad];
  const ex = q.w * REACH;
  const ey = q.h * REACH;
  e.choose(seat, quad);
  e.point(seat, (x - q.x + ex) / (q.w + 2 * ex), (y - q.y + ey) / (q.h + 2 * ey));
}

// Tag every glitch in the round with this player.
function findAll(e, seat) {
  for (const t of e.state.things.filter((x) => x.glitch && !x.found)) {
    aimAt(e, seat, t.x, t.y);
    assert.equal(e.tag(seat), 'found');
  }
}

const solo = () => [{ seat: 1, side: 'team' }];

test('cyber-hunt: countdown, then a "find this" intro, then the hunt', () => {
  const e = new Engine({ rng: seeded(1) });
  e.startMatch('team', solo());
  const events = run(e, 3.1);
  const round = events.find((ev) => ev.type === 'round');
  assert.ok(round?.target);
  assert.equal(e.state.phase, PHASE.INTRO);
  until(e, PHASE.HUNT);
  const glitches = e.state.things.filter((t) => t.glitch);
  assert.equal(glitches.length, DIFFICULTIES.easy.targets);
  assert.ok(glitches.every((t) => t.icon === e.state.target));
  assert.ok(e.state.things.some((t) => !t.glitch && t.icon === e.state.target), 'normal look-alikes too');
  assert.equal(new Set(glitches.map((t) => quarters().findIndex((q) => t.x >= q.x && t.x < q.x + q.w && t.y >= q.y && t.y < q.y + q.h))).size, glitches.length, 'spread over different quarters');
});

test('cyber-hunt: pick a quarter, the cursor moves inside it (reaching a little past its edges)', () => {
  const e = new Engine({ rng: seeded(2) });
  e.startMatch('team', solo());
  until(e, PHASE.HUNT);
  const p = e.state.players[1];
  assert.equal(p.mode, 'pick');
  assert.equal(e.choose(1, 3), true);
  assert.equal(p.mode, 'hunt');
  const q = quarters()[3];
  assert.ok(Math.abs(p.x - (q.x + q.w / 2)) < 1 && Math.abs(p.y - (q.y + q.h / 2)) < 1, 'starts in the middle of the quarter');
  e.point(1, 0, 0);
  assert.ok(p.x < q.x && p.y < q.y, 'can reach past the top-left edge');
  e.point(1, 1, 1);
  assert.ok(p.x <= CITY.right && p.y <= CITY.bottom, 'but never off the city');
  e.back(1);
  assert.equal(p.mode, 'pick');
  assert.equal(e.choose(1, 7), false);
});

test('cyber-hunt: tagging a glitch finds it; tagging a normal one freezes you (and brings the scan closer)', () => {
  const e = new Engine({ rng: seeded(3) });
  e.startMatch('team', solo());
  until(e, PHASE.HUNT);
  const glitch = e.state.things.find((t) => t.glitch);
  aimAt(e, 1, glitch.x, glitch.y);
  assert.equal(e.tag(1), 'found');
  assert.equal(e.state.found, 1);
  assert.equal(e.tag(1) === 'found', false, 'already found');

  // Pick a normal thing well away from any glitch.
  const decoy = e.state.things.find((t) => !t.glitch && e.state.things.filter((g) => g.glitch && !g.found).every((g) => Math.hypot(g.x - t.x, g.y - t.y) > 200));
  const left = e.state.scan.left;
  aimAt(e, 1, decoy.x, decoy.y);
  assert.equal(e.tag(1), 'wrong');
  assert.ok(e.state.scan.left <= left - PENALTY + 0.01);
  assert.equal(e.tag(1), null, 'frozen');
  run(e, FREEZE + 0.1);
  assert.notEqual(e.tag(1), null, 'thawed');
});

test('cyber-hunt: tagging empty city does nothing bad', () => {
  const e = new Engine({ rng: seeded(4) });
  e.startMatch('team', solo());
  until(e, PHASE.HUNT);
  e.state.things = e.state.things.filter((t) => t.glitch); // clear the rest
  const g = e.state.things[0];
  const far = quarters().find((q) => !(g.x >= q.x && g.x < q.x + q.w && g.y >= q.y && g.y < q.y + q.h));
  aimAt(e, 1, far.x + far.w / 2, far.y + far.h / 2);
  const before = e.state.scan.left;
  const result = e.tag(1);
  assert.ok(result === 'miss' || result === 'found');
  if (result === 'miss') assert.equal(e.state.scan.left, before);
});

test('cyber-hunt: team finds every glitch over three rounds and wins', () => {
  const e = new Engine({ rng: seeded(5) });
  e.startMatch('team', [{ seat: 1, side: 'team' }, { seat: 2, side: 'team' }]);
  for (let r = 0; r < TEAM_ROUNDS; r++) {
    until(e, PHASE.HUNT);
    findAll(e, r % 2 ? 2 : 1);
    if (r < TEAM_ROUNDS - 1) assert.equal(e.state.phase, PHASE.ROUND_END);
  }
  run(e, 3);
  assert.equal(e.state.winner, 'team');
  assert.equal(e.state.found, TEAM_ROUNDS * DIFFICULTIES.easy.targets);
  assert.equal(new Set(e.state.used).size, TEAM_ROUNDS, 'a different thing to find each round');
});

test('cyber-hunt: if the scan finishes first, the computer wins', () => {
  const e = new Engine({ rng: seeded(6) });
  e.startMatch('team', solo());
  until(e, PHASE.HUNT);
  e.state.scan.left = 1;
  run(e, 2);
  assert.equal(e.state.winner, 'cpu');
});

test('cyber-hunt: race - first to tag scores, first to five wins', () => {
  const e = new Engine({ rng: seeded(7) });
  e.startMatch('race', [{ seat: 1, side: 'p1' }, { seat: 2, side: 'p2' }]);
  let guard = 0;
  while (e.state.phase !== PHASE.OVER && guard++ < 10) {
    until(e, PHASE.HUNT);
    findAll(e, 2);
    run(e, 2);
  }
  assert.equal(e.state.winner, 'p2');
  assert.ok(e.state.players[2].points >= RACE_TO);
  assert.equal(e.state.players[1].points, 0);
});

test('cyber-hunt: help gives a bigger reach and pulls the cursor towards a glitch', () => {
  const e = new Engine({ rng: seeded(8) });
  e.startMatch('team', [{ seat: 1, side: 'team', boost: 2 }, { seat: 2, side: 'team', boost: 0 }]);
  until(e, PHASE.HUNT);
  const g = e.state.things.find((t) => t.glitch);
  e.state.things = [g]; // just the glitch, standing still
  g.vx = 0;
  g.vy = 0;
  aimAt(e, 1, g.x + 70, g.y);
  aimAt(e, 2, g.x + 70, g.y);
  const [a, b] = [e.state.players[1], e.state.players[2]];
  assert.ok(Math.hypot(a.x - g.x, a.y - g.y) < Math.hypot(b.x - g.x, b.y - g.y), 'pulled closer');
  assert.ok(BOOST.hit[2] > BOOST.hit[0]);
  assert.equal(e.tag(2), 'miss', 'without help, 70 away is too far');
  assert.equal(e.tag(1), 'found', 'with help it is close enough');
});

test('cyber-hunt: a new round sends everyone back to picking a quarter', () => {
  const e = new Engine({ rng: seeded(9) });
  e.startMatch('team', solo());
  until(e, PHASE.HUNT);
  findAll(e, 1);
  until(e, PHASE.INTRO);
  assert.equal(e.state.players[1].mode, 'pick');
});

test('cyber-hunt: nothing moves while paused, and nobody can tag', () => {
  const e = new Engine({ rng: seeded(10) });
  e.startMatch('team', solo());
  until(e, PHASE.HUNT);
  const g = e.state.things.find((t) => t.glitch);
  aimAt(e, 1, g.x, g.y);
  const before = JSON.stringify(e.state);
  e.pause();
  run(e, 2);
  assert.equal(e.tag(1), null);
  assert.equal(JSON.stringify(e.state), before);
});

test('cyber-hunt: a kid joining a team game can hunt straight away', () => {
  const e = new Engine({ rng: seeded(11) });
  e.startMatch('team', solo());
  until(e, PHASE.HUNT);
  assert.equal(e.addPlayer({ seat: 3, side: 'team' }), true);
  assert.equal(e.addPlayer({ seat: 3, side: 'team' }), false);
  assert.equal(e.choose(3, 0), true);
});
