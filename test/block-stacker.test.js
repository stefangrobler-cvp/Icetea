import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, PHASE } from '../games/block-stacker/engine.js';
import { HEARTS, DIFFICULTIES, PLATFORM } from '../games/block-stacker/config.js';

// Block Stacker's own rules and physics, tested without any platform.

function seeded(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const team = (seats, extra = {}) => seats.map((seat) => ({ seat, side: 'team', color: '#00f0ff', ...extra }));

// Play until the match ends (or the time limit), calling `play` before every frame.
function run(e, seconds, play) {
  const events = [];
  for (let t = 0; t < seconds && e.state.phase !== PHASE.OVER; t += 1 / 60) {
    if (play) play(e);
    events.push(...e.step(1 / 60));
  }
  return events;
}

// A careful player: drops when the swinging block is right over the middle of its tower.
function careful(e) {
  for (const t of e.view().towers) if (t.hanging && Math.abs(t.hanging.x - t.x) < 8) e.drop(t.hanging.seat);
}

test('block-stacker: countdown, then the first player\'s block swings on the wire', () => {
  const e = new Engine({ rng: seeded(1) });
  e.startMatch('team', team([1, 2]));
  assert.equal(e.state.phase, PHASE.COUNTDOWN);
  assert.equal(e.drop(1), false, 'no dropping during the countdown');
  const events = run(e, 3.1);
  assert.equal(e.state.phase, PHASE.PLAYING);
  assert.ok(events.some((ev) => ev.type === 'turn' && ev.seat === 1));
  assert.equal(e.view().towers[0].hanging.seat, 1);
});

test('block-stacker: team mode takes turns, and only the player whose turn it is can drop', () => {
  const e = new Engine({ rng: seeded(2) });
  e.startMatch('team', team([1, 2]));
  run(e, 3.1);
  assert.equal(e.drop(2), false, 'not your turn');
  assert.equal(e.drop(1), true);
  const events = run(e, 4);
  assert.ok(events.some((ev) => ev.type === 'land' && ev.seat === 1));
  assert.ok(events.some((ev) => ev.type === 'turn' && ev.seat === 2), 'next it is player 2');
  assert.equal(e.state.towers[0].count, 1);
});

test('block-stacker: careful stacking reaches the goal and the team wins (every level)', () => {
  const every = DIFFICULTIES.hard.glitchEvery;
  try {
    DIFFICULTIES.hard.glitchEvery = 9999; // on hard, judge the stacking itself (shakes are tested below)
    for (const level of Object.keys(DIFFICULTIES)) {
      const e = new Engine({ rng: seeded(3) });
      e.setDifficulty(level);
      e.startMatch('team', team([1]));
      run(e, 200, careful);
      assert.equal(e.state.winner, 'team', `${level}: careful stacking wins`);
      assert.ok(e.state.towers[0].count >= DIFFICULTIES[level].goal);
    }
  } finally {
    DIFFICULTIES.hard.glitchEvery = every;
  }
});

test('block-stacker: blocks dropped off the platform cost hearts, and the computer wins at zero', () => {
  const e = new Engine({ rng: seeded(4) });
  e.setDifficulty('hard'); // the widest swing, so a block can be dropped clear of the platform
  e.startMatch('team', team([1]));
  run(e, 3.1);
  const events = run(e, 120, (eng) => {
    // Drop only when the block is well away from the platform.
    const t = eng.view().towers[0];
    if (t.hanging && Math.abs(t.hanging.x - t.x) > t.width * 0.6) eng.drop(1);
  });
  assert.equal(events.filter((ev) => ev.type === 'lost').length, HEARTS);
  assert.equal(e.state.towers[0].hearts, 0);
  assert.equal(e.state.winner, 'cpu');
});

test('block-stacker: the computer warns before every glitch shake', () => {
  const e = new Engine({ rng: seeded(5) });
  e.setDifficulty('hard');
  e.startMatch('team', team([1]));
  const events = run(e, 40, careful);
  const types = events.map((ev) => ev.type).filter((t) => t === 'warn' || t === 'glitch');
  assert.ok(types.length >= 2);
  types.forEach((t, i) => assert.equal(t, i % 2 === 0 ? 'warn' : 'glitch'));
});

test('block-stacker: running out of time loses for the team', () => {
  const e = new Engine({ rng: seeded(6) });
  e.startMatch('team', team([1]));
  e.state.time = 5;
  run(e, 10); // nobody taps: blocks drop by themselves only every 10 s
  assert.equal(e.state.winner, 'cpu');
});

test('block-stacker: a waiting block drops by itself after a while', () => {
  const e = new Engine({ rng: seeded(7) });
  e.startMatch('team', team([1]));
  const events = run(e, 3 + 10.5);
  assert.ok(events.some((ev) => ev.type === 'drop' && ev.auto));
});

test('block-stacker: tower race - a tower each, dropping at the same time, last one standing wins', () => {
  const e = new Engine({ rng: seeded(8) });
  e.setDifficulty('hard');
  e.startMatch('versus', [
    { seat: 1, side: 'p1', color: '#0ff' },
    { seat: 2, side: 'p2', color: '#f0f' },
  ]);
  assert.equal(e.state.towers.length, 2);
  run(e, 3.1);
  assert.ok(e.view().towers.every((t) => t.hanging), 'both have a block at once');
  const events = run(e, 120, (eng) => {
    for (const t of eng.view().towers) {
      if (!t.hanging) continue;
      const off = Math.abs(t.hanging.x - t.x);
      if (t.seats[0] === 1 && off < 8) eng.drop(1); // careful
      if (t.seats[0] === 2 && off > t.width * 0.6) eng.drop(2); // misses every time
    }
  });
  assert.ok(events.some((ev) => ev.type === 'out' && ev.seat === 2));
  assert.equal(e.state.winner, 'p1');
});

test('block-stacker: tower race - when time runs out, the most blocks wins', () => {
  const e = new Engine({ rng: seeded(9) });
  e.startMatch('versus', [{ seat: 1, side: 'p1' }, { seat: 2, side: 'p2' }, { seat: 3, side: 'p3' }]);
  run(e, 3.1);
  e.state.time = 14;
  run(e, 20, (eng) => {
    const t = eng.view().towers[1];
    if (t.hanging && Math.abs(t.hanging.x - t.x) < 8) eng.drop(2); // only player 2 stacks
  });
  assert.equal(e.state.phase, PHASE.OVER);
  assert.equal(e.state.winner, 'p2');
});

test('block-stacker: on easy, a block dropped at any moment lands over the platform', () => {
  const e = new Engine({ rng: seeded(14) });
  e.startMatch('team', team([1]));
  run(e, 3.1);
  let furthest = 0;
  run(e, 8, (eng) => {
    const t = eng.view().towers[0];
    if (t.hanging) furthest = Math.max(furthest, Math.abs(t.hanging.x - t.x));
  });
  assert.ok(furthest < e.state.towers[0].width / 2, `swings at most ${Math.round(furthest)} from the middle`);
});

test('block-stacker: help gives wider, slower blocks to that player only', () => {
  const e = new Engine({ rng: () => 0 });
  e.startMatch('versus', [{ seat: 1, side: 'p1', boost: 2 }, { seat: 2, side: 'p2', boost: 0 }]);
  run(e, 3.1);
  const [a, b] = e.view().towers;
  assert.ok(a.hanging.w > b.hanging.w);
  assert.ok(a.hanging.speed < b.hanging.speed);
});

test('block-stacker: tilting nudges the hanging block', () => {
  const e = new Engine({ rng: seeded(10) });
  e.startMatch('team', team([1]));
  run(e, 3.1);
  const x0 = e.view().towers[0].hanging.x;
  e.tilt(1, 1);
  assert.ok(e.view().towers[0].hanging.x > x0 + 30);
  e.tilt(1, 'nonsense');
  assert.ok(e.view().towers[0].hanging.x > x0 + 30, 'bad values are ignored');
});

test('block-stacker: nothing moves while paused', () => {
  const e = new Engine({ rng: seeded(11) });
  e.startMatch('team', team([1]));
  run(e, 3.1);
  e.drop(1);
  run(e, 0.2);
  const before = JSON.stringify(e.view());
  e.pause();
  run(e, 2);
  assert.equal(e.drop(1), false);
  assert.equal(JSON.stringify(e.view()), before);
  e.resume();
  run(e, 0.5);
  assert.notEqual(JSON.stringify(e.view()), before);
});

test('block-stacker: a kid joining a team game gets a turn', () => {
  const e = new Engine({ rng: seeded(12) });
  e.startMatch('team', team([1]));
  assert.equal(e.addPlayer(3, { color: '#0f0' }), true);
  assert.equal(e.addPlayer(3, { color: '#0f0' }), false, 'only once');
  run(e, 3.1);
  e.drop(1);
  const events = run(e, 4);
  assert.ok(events.some((ev) => ev.type === 'turn' && ev.seat === 3));
  const v = new Engine();
  v.startMatch('versus', [{ seat: 1, side: 'p1' }, { seat: 2, side: 'p2' }]);
  assert.equal(v.addPlayer(3), false, 'tower race: wait for the next game');
});

test('block-stacker: the platform stays where it was after a glitch', () => {
  const e = new Engine({ rng: seeded(13) });
  e.setDifficulty('hard');
  e.startMatch('team', team([1]));
  run(e, 3 + DIFFICULTIES.hard.glitchEvery + 5);
  assert.equal(Math.round(e.state.towers[0].platform.position.x), 800);
  assert.equal(Math.round(e.state.towers[0].platform.position.y), PLATFORM.y + PLATFORM.height / 2);
});
