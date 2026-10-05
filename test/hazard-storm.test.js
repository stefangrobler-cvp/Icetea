import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, PHASE } from '../games/hazard-storm/engine.js';
import { ARENA, TRACK_Y, SHIELD, HEARTS, DASH, DIFFICULTIES, BATTERY } from '../games/hazard-storm/config.js';

// Hazard Storm's own rules, tested without any platform.

function seeded(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function run(e, seconds, play) {
  const events = [];
  for (let t = 0; t < seconds && e.state.phase !== PHASE.OVER; t += 1 / 60) {
    if (play) play(e);
    events.push(...e.step(1 / 60));
  }
  return events;
}

// Start a match and skip the countdown, with no hazards yet.
function ready(mode = 'team', players = [{ seat: 1, side: 'team' }], seed = 1) {
  const e = new Engine({ rng: seeded(seed) });
  e.startMatch(mode, players);
  e.state.spawnIn = 999;
  e.state.batteryIn = 999;
  run(e, 3.05);
  assert.equal(e.state.phase, PHASE.PLAYING);
  return e;
}

// Put one hazard straight into play (already past its warning).
function place(e, h) {
  e.state.hazards.push({ id: 900 + e.state.hazards.length, phase: 'active', warn: 0, ...h });
}

test('hazard-storm: the swipe pad moves the orb like a trackpad, all the way to each side', () => {
  const e = ready();
  const o = e.state.orbs[1];
  const start = o.x;
  e.move(1, 0.5);
  e.move(1, 0.6);
  run(e, 0.5);
  assert.ok(o.x > start + 100, 'moved right');
  e.move(1, 0);
  run(e, 1.5);
  assert.equal(Math.round(o.x), ARENA.left + o.r, 'pad at the left end: orb at the left wall');
  e.move(1, 1);
  run(e, 1.5);
  assert.equal(Math.round(o.x), ARENA.right - o.r);
  e.move(1, NaN);
  assert.ok(Number.isFinite(o.target), 'bad values are ignored');
});

test('hazard-storm: a spike warns first, then falls; it hurts only after the warning', () => {
  const e = ready();
  const o = e.state.orbs[1];
  e.state.hazards.push({ id: 1, kind: 'spike', phase: 'warn', warn: 1, x: o.x, y: TRACK_Y }); // already at the orb
  run(e, 0.5);
  assert.equal(e.state.shield, SHIELD, 'no hit while it is only warning');
  const events = run(e, 1);
  assert.ok(events.some((ev) => ev.type === 'fire'));
  assert.ok(events.some((ev) => ev.type === 'hit' && ev.seat === 1));
  assert.equal(e.state.shield, SHIELD - 1);
});

test('hazard-storm: moving out of the way avoids a spike', () => {
  const e = ready();
  const o = e.state.orbs[1];
  place(e, { kind: 'spike', x: o.x, y: ARENA.top });
  e.move(1, 0.5);
  e.move(1, 0.8); // swipe away
  run(e, 2);
  assert.equal(e.state.hits, 0);
});

test('hazard-storm: a dash zips sideways and spikes pass through while see-through', () => {
  const e = ready();
  const o = e.state.orbs[1];
  const x0 = o.x;
  assert.equal(e.dash(1), true);
  assert.equal(e.dash(1), false, 'needs to recharge');
  place(e, { kind: 'spike', x: o.x, y: TRACK_Y });
  run(e, 0.3);
  assert.equal(e.state.hits, 0, 'ghost: no hit');
  assert.ok(Math.abs(o.x - x0) > DASH.distance * 0.8, 'dashed sideways');
  run(e, DASH.cooldown);
  assert.equal(e.dash(1), true, 'recharged');
});

test('hazard-storm: a beam burns only its own strip of floor', () => {
  const e = ready('team', [{ seat: 1, side: 'team' }, { seat: 2, side: 'team' }]);
  const [a, b] = [e.state.orbs[1], e.state.orbs[2]];
  place(e, { kind: 'beam', x1: a.x - 100, x2: a.x + 100, from: -1, grown: 0, fire: 0 });
  const events = run(e, 1.2);
  assert.ok(events.some((ev) => ev.type === 'hit' && ev.seat === 1));
  assert.ok(!events.some((ev) => ev.type === 'hit' && ev.seat === 2));
  assert.ok(Math.abs(b.x - a.x) > 300);
});

test('hazard-storm: plasma balls bounce along the floor', () => {
  const e = ready();
  e.state.orbs[1].x = ARENA.right - 60; // out of the way
  place(e, { kind: 'ball', x: ARENA.left, y: TRACK_Y - 300, vx: 300, vy: 0, apex: 300 });
  const events = run(e, 2.5);
  assert.ok(events.filter((ev) => ev.type === 'boing').length >= 1);
});

test('hazard-storm: batteries refill the shared shield, up to full', () => {
  const e = ready('team', [{ seat: 1, side: 'team' }]);
  const o = e.state.orbs[1];
  e.state.shield = SHIELD - 1;
  place(e, { kind: 'battery', x: o.x, y: TRACK_Y });
  place(e, { kind: 'battery', x: o.x, y: TRACK_Y - 5 });
  const events = run(e, 0.2);
  assert.equal(events.filter((ev) => ev.type === 'battery').length, 2);
  assert.equal(e.state.shield, SHIELD, 'never more than full');
});

test('hazard-storm: team mode - surviving the storm wins, losing the shield loses', () => {
  const win = ready();
  win.state.time = 1;
  run(win, 2);
  assert.equal(win.state.winner, 'team');

  const lose = ready();
  lose.state.shield = 1;
  place(lose, { kind: 'spike', x: lose.state.orbs[1].x, y: TRACK_Y });
  run(lose, 0.2);
  assert.equal(lose.state.winner, 'cpu');
});

test('hazard-storm: after a hit you blink and can\'t be hit again straight away', () => {
  const e = ready();
  const o = e.state.orbs[1];
  place(e, { kind: 'spike', x: o.x, y: TRACK_Y });
  run(e, 0.1);
  place(e, { kind: 'spike', x: o.x, y: TRACK_Y });
  run(e, 0.1);
  assert.equal(e.state.hits, 1);
});

test('hazard-storm: help gives a smaller orb and a longer safe blink, for that player only', () => {
  const e = ready('team', [{ seat: 1, side: 'team', boost: 2 }, { seat: 2, side: 'team', boost: 0 }]);
  const [a, b] = [e.state.orbs[1], e.state.orbs[2]];
  assert.ok(a.r < b.r);
  place(e, { kind: 'spike', x: a.x, y: TRACK_Y });
  place(e, { kind: 'spike', x: b.x, y: TRACK_Y });
  run(e, 0.05);
  assert.ok(a.safe > b.safe);
});

test('hazard-storm: last one standing - orbs bump each other, and the last one left wins', () => {
  const e = ready('versus', [{ seat: 1, side: 'p1' }, { seat: 2, side: 'p2' }]);
  const [a, b] = [e.state.orbs[1], e.state.orbs[2]];
  // Drive orb 1 into orb 2.
  e.move(1, 0.3);
  const events = run(e, 1.5, (eng) => eng.move(1, Math.min(1, (eng.state.orbs[1].lastInput ?? 0.3) + 0.02)));
  assert.ok(events.some((ev) => ev.type === 'bump'), 'they bumped');
  assert.ok(b.x - a.x >= a.r + b.r - 1, 'never overlapping');
  b.hearts = 1;
  place(e, { kind: 'spike', x: b.x, y: TRACK_Y });
  const end = run(e, 0.2);
  assert.ok(end.some((ev) => ev.type === 'out' && ev.seat === 2));
  assert.equal(e.state.winner, 'p1');
  assert.equal(HEARTS, 3);
});

test('hazard-storm: team mates pass through each other (no bumping)', () => {
  const e = ready('team', [{ seat: 1, side: 'team' }, { seat: 2, side: 'team' }]);
  e.state.orbs[1].target = e.state.orbs[2].x;
  const events = run(e, 1);
  assert.ok(!events.some((ev) => ev.type === 'bump'));
});

test('hazard-storm: the storm builds up - spikes first, then beams and balls', () => {
  const e = new Engine({ rng: seeded(7) });
  e.setDifficulty('medium');
  e.startMatch('team', [{ seat: 1, side: 'team' }]);
  const seen = [];
  const keepGoing = (eng) => { eng.state.shield = SHIELD; }; // nobody is playing: don't let the match end
  const events = run(e, 3 + DIFFICULTIES.medium.time * 0.15, keepGoing);
  for (const ev of events) if (ev.type === 'warn') seen.push(ev.kind);
  assert.ok(seen.length > 3);
  assert.ok(seen.every((k) => k === 'spike'), 'only spikes early on');
  const later = run(e, DIFFICULTIES.medium.time * 0.5, keepGoing).filter((ev) => ev.type === 'warn').map((ev) => ev.kind);
  assert.ok(later.includes('beam') && later.includes('ball'));
});

test('hazard-storm: standing still loses; dodging the warnings survives easy', () => {
  const idle = new Engine({ rng: seeded(3) });
  idle.startMatch('team', [{ seat: 1, side: 'team' }]);
  run(idle, 200);
  assert.equal(idle.state.winner, 'cpu');

  // A simple dodger: when something is coming its way, move to the quietest spot.
  const e = new Engine({ rng: seeded(3) });
  e.startMatch('team', [{ seat: 1, side: 'team' }]);
  const danger = (x) => e.state.hazards.filter((h) => (h.kind === 'spike' && Math.abs(h.x - x) < 90)
    || (h.kind === 'beam' && x > h.x1 - 70 && x < h.x2 + 70)
    || (h.kind === 'ball' && h.phase === 'active' && Math.abs(h.x - x) < 160 && Math.sign(x - h.x) === Math.sign(h.vx))).length;
  let wait = 0;
  run(e, 200, () => {
    const o = e.state.orbs[1];
    wait -= 1 / 60;
    if (wait > 0 || !danger(o.x)) return;
    wait = 0.4;
    let best = o.x;
    for (let x = ARENA.left + 50; x < ARENA.right - 50; x += 40) if (danger(x) + Math.abs(x - o.x) / 800 < danger(best) + Math.abs(best - o.x) / 800) best = x;
    o.target = best;
  });
  assert.equal(e.state.winner, 'team');
  assert.ok(BATTERY.every > 0);
});

test('hazard-storm: nothing moves while paused', () => {
  const e = new Engine({ rng: seeded(4) });
  e.startMatch('team', [{ seat: 1, side: 'team' }]);
  run(e, 8);
  const before = JSON.stringify(e.state);
  e.pause();
  run(e, 2);
  assert.equal(e.dash(1), false);
  assert.equal(JSON.stringify(e.state), before);
});

test('hazard-storm: a kid joining a team game gets an orb, safe for a moment', () => {
  const e = ready();
  assert.equal(e.addPlayer({ seat: 3, side: 'team' }), true);
  assert.equal(e.addPlayer({ seat: 3, side: 'team' }), false);
  assert.ok(e.state.orbs[3].safe > 0);
  const v = ready('versus', [{ seat: 1, side: 'p1' }, { seat: 2, side: 'p2' }]);
  assert.equal(v.addPlayer({ seat: 3, side: 'p3' }), false);
});
