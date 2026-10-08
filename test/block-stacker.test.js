import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, PHASE, FORCES, shapeLayout, turnCells } from '../games/block-stacker/engine.js';
import { DIFFICULTIES, PLATFORM, FORCE, SHAPES, SHAPE_SETS, SHAPE_GOAL, CELL, ASSIST, LOCK, PERFECT } from '../games/block-stacker/config.js';

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

test('block-stacker: a block that falls off is just an oops - nobody loses, the game goes on', () => {
  const e = new Engine({ rng: seeded(4) });
  e.setDifficulty('hard'); // the widest swing, so a block can be dropped clear of the platform
  e.startMatch('team', team([1]));
  run(e, 3.1);
  const events = run(e, 60, (eng) => {
    // Drop only when the block is well away from the platform.
    const t = eng.view().towers[0];
    if (t.hanging && Math.abs(t.hanging.x - t.x) > t.width * 0.6) eng.drop(1);
  });
  assert.ok(events.filter((ev) => ev.type === 'lost').length >= 4);
  assert.equal(e.state.phase, PHASE.PLAYING, 'still playing');
  assert.ok(!('hearts' in e.view().towers[0]));
  assert.deepEqual(e.scores(), { team: 0, cpu: 0 });
});

test('block-stacker: the aiming helper slides a nearly-right drop over the tower (not on hard as much)', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const e = new Engine({ rng: seeded(30) });
    e.setDifficulty(level);
    e.startMatch('team', team([1]));
    run(e, 3.1);
    const t = e.state.towers[0];
    const off = t.width * ASSIST[level].range * 0.9; // just inside the helper's reach
    t.hanging.phase = Math.asin(off / (t.width * t.hanging.swing)); // put the swing there
    e.drop(1);
    const block = e.state.blocks[0];
    assert.ok(Math.abs(block.x - t.x - off * (1 - ASSIST[level].pull)) < 1, level);
  }
});

test('block-stacker: a drop right on top is a PERFECT', () => {
  const e = new Engine({ rng: seeded(31) });
  e.startMatch('team', team([1]));
  run(e, 3.1);
  const t = e.state.towers[0];
  t.hanging.phase = 0; // dead centre
  e.drop(1);
  const events = run(e, 2);
  assert.ok(events.some((ev) => ev.type === 'perfect' && ev.seat === 1));
  assert.ok(PERFECT > 0);
});

test('block-stacker: settled blocks lock in place, all but the top one', () => {
  const e = new Engine({ rng: seeded(32) });
  e.startMatch('team', team([1]));
  run(e, 40, careful);
  const blocks = [...e.state.blocks].filter((b) => b.landed).sort((a, b) => a.y - b.y);
  assert.ok(blocks.length >= 4);
  assert.ok(blocks.slice(LOCK.loose + 1).every((b) => b.locked), 'the lower blocks are locked');
  for (const b of blocks.filter((x) => x.locked)) assert.ok(Math.abs(b.angle % (Math.PI / 2)) < 1e-6, 'locked blocks sit straight');
  // An earthquake moves locked blocks along with the island, and puts them back.
  const x0 = blocks.at(-1).x;
  e.startForce(e.state.towers[0], 'quake', 'cpu');
  run(e, FORCE.warn + FORCE.last + 0.5);
  assert.ok(Math.abs(e.state.blocks.find((b) => b.id === blocks.at(-1).id).x - x0) < 1);
});

test('block-stacker: the computer warns before every force, and sends both wind and earthquakes', () => {
  const e = new Engine({ rng: seeded(5) });
  e.setDifficulty('hard');
  e.startMatch('team', team([1]));
  const events = run(e, 120, careful);
  const forces = events.filter((ev) => ev.type === 'force-warn' || ev.type === 'force');
  assert.ok(forces.length >= 4);
  forces.forEach((ev, i) => {
    assert.equal(ev.type, i % 2 === 0 ? 'force-warn' : 'force');
    assert.equal(ev.from, 'cpu');
    if (i % 2) assert.equal(ev.kind, forces[i - 1].kind, 'the warning shows what is coming');
  });
  const kinds = new Set(forces.map((ev) => ev.kind));
  assert.ok(kinds.has('wind') && kinds.has('quake'));
});

test('block-stacker: running out of time before the flag: the computer wins', () => {
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

test('block-stacker: tower race - a tower each, dropping at the same time; nobody is knocked out', () => {
  const e = new Engine({ rng: seeded(8) });
  e.setDifficulty('hard');
  e.startMatch('versus', [
    { seat: 1, side: 'p1', color: '#0ff' },
    { seat: 2, side: 'p2', color: '#f0f' },
  ]);
  assert.equal(e.state.towers.length, 2);
  run(e, 3.1);
  assert.ok(e.view().towers.every((t) => t.hanging), 'both have a block at once');
  const events = run(e, 200, (eng) => {
    for (const t of eng.view().towers) {
      if (!t.hanging) continue;
      const off = Math.abs(t.hanging.x - t.x);
      if (t.seats[0] === 1 && off < 8) eng.drop(1); // careful
      if (t.seats[0] === 2 && off > t.width * 0.6) eng.drop(2); // misses every time
    }
  });
  assert.ok(events.filter((ev) => ev.type === 'lost' && ev.seat === 2).length >= 3, 'player 2 keeps playing after misses');
  assert.equal(e.state.winner, 'p1', 'the tallest tower when time runs out');
});

test('block-stacker: tower race - when time runs out, the tallest tower wins', () => {
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

test('block-stacker: the platform stays where it was after an earthquake', () => {
  const e = new Engine({ rng: seeded(13) });
  e.setDifficulty('hard');
  e.startMatch('team', team([1]));
  run(e, 3 + DIFFICULTIES.hard.glitchEvery + 5);
  assert.equal(Math.round(e.state.towers[0].platform.position.x), 800);
  assert.equal(Math.round(e.state.towers[0].platform.position.y), PLATFORM.y + PLATFORM.height / 2);
});

// ---------- shapes ----------

// A thoughtful player with shapes: turns the shape flat side down, then drops over the middle.
function thoughtful(e) {
  for (const t of e.view().towers) {
    const h = t.hanging;
    if (!h) continue;
    const real = e.state.towers[t.index].hanging;
    if (real.plan === undefined) {
      let best = 0;
      let bestTurn = 0;
      let grid = real.grid;
      for (let k = 0; k < 4; k++) {
        const lay = shapeLayout(grid, h.size);
        const low = Math.max(...lay.cells.map((c) => c.y));
        const flat = lay.cells.filter((c) => c.y > low - 1).length * 10 - lay.h / h.size;
        if (flat > best) { best = flat; bestTurn = k; }
        grid = turnCells(grid);
      }
      real.plan = bestTurn;
    }
    if (real.turns < real.plan) e.rotate(h.seat);
    else if (Math.abs(h.x - t.x) < 8) e.drop(h.seat);
  }
}

test('block-stacker: a shape\'s cubes sit round its middle, and a turn is a clockwise quarter turn', () => {
  const lay = shapeLayout(SHAPES.bar3, 50);
  assert.deepEqual(lay.cells.map((c) => [c.x, c.y]), [[-50, 0], [0, 0], [50, 0]]);
  assert.equal(lay.w, 150);
  assert.equal(lay.h, 50);
  assert.equal(lay.top, -25);
  assert.deepEqual(turnCells(SHAPES.bar3), [[0, 0], [0, 1], [0, 2]], 'a lying bar stands up');
  // Four turns bring every shape back as it was.
  for (const [name, grid] of Object.entries(SHAPES)) {
    const back = turnCells(turnCells(turnCells(turnCells(grid))));
    assert.deepEqual([...back].sort(), [...grid].sort(), name);
  }
  // The corner's top-left cube turns to the top-right.
  assert.deepEqual(turnCells([[0, 0], [0, 1], [1, 1]]).sort(), [[0, 0], [0, 1], [1, 0]].sort());
});

test('block-stacker: shapes - the player whose turn it is can turn their shape, nobody else', () => {
  const e = new Engine({ rng: seeded(21) });
  e.startMatch('team', team([1, 2]), { blocks: 'shapes' });
  assert.equal(e.rotate(1), false, 'not during the countdown');
  run(e, 3.1);
  const h = e.state.towers[0].hanging;
  assert.ok(SHAPE_SETS.easy.includes(h.shape));
  assert.equal(h.cells.length, SHAPES[h.shape].length);
  const before = JSON.stringify(h.grid);
  assert.equal(e.rotate(2), false, 'not your turn');
  assert.equal(e.rotate(1), true);
  assert.equal(h.turns, 1);
  if (h.shape !== 'square') assert.notEqual(JSON.stringify(h.grid), before);
  e.drop(1);
  const events = run(e, 4);
  const block = e.state.blocks[0];
  assert.ok(block.cells && block.landed, 'the shape landed as one piece');
  assert.ok(events.some((ev) => ev.type === 'land' && ev.seat === 1));
  const classic = new Engine({ rng: seeded(21) });
  classic.startMatch('team', team([1]));
  run(classic, 3.1);
  assert.equal(classic.rotate(1), false, 'classic blocks don\'t turn');
});

test('block-stacker: shapes - a shape dropped on the platform settles instead of flying off', () => {
  for (const shape of Object.keys(SHAPES)) {
    const e = new Engine({ rng: seeded(22) });
    e.startMatch('team', team([1]), { blocks: 'shapes' });
    run(e, 3.1);
    const h = e.state.towers[0].hanging;
    h.shape = shape;
    e.setShape(h, SHAPES[shape]);
    run(e, 5, (eng) => { const t = eng.view().towers[0]; if (t.hanging && Math.abs(t.hanging.x - t.x) < 8) eng.drop(1); });
    const first = e.state.blocks[0];
    assert.ok(Math.abs(first.x - 800) < PLATFORM.width / 2, `${shape} stays on the platform`);
    assert.ok(first.y < PLATFORM.y, `${shape} rests on top`);
  }
});

test('block-stacker: shapes - thoughtful stacking builds up to the flag on easy', () => {
  const every = DIFFICULTIES.easy.glitchEvery;
  try {
    DIFFICULTIES.easy.glitchEvery = 9999; // judge the stacking itself
    let wins = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const e = new Engine({ rng: seeded(seed) });
      e.startMatch('team', team([1]), { blocks: 'shapes' });
      assert.equal(e.state.goal, SHAPE_GOAL.easy);
      assert.equal(e.state.goalY, PLATFORM.y - SHAPE_GOAL.easy * CELL);
      run(e, 200, thoughtful);
      if (e.state.winner === 'team') {
        wins += 1;
        assert.ok(e.state.towers[0].height >= SHAPE_GOAL.easy);
      }
    }
    assert.ok(wins >= 3, `won ${wins} of 4`);
  } finally {
    DIFFICULTIES.easy.glitchEvery = every;
  }
});

test('block-stacker: shapes - players with help only get the easy shapes, a bit bigger', () => {
  const e = new Engine({ rng: seeded(23) });
  e.startMatch('versus', [{ seat: 1, side: 'p1', boost: 2 }, { seat: 2, side: 'p2' }], { blocks: 'shapes' });
  run(e, 3.1);
  for (let i = 0; i < 20; i++) {
    e.spawn(e.state.towers[0]);
    assert.ok(SHAPE_SETS.helped.includes(e.state.towers[0].hanging.shape));
  }
  assert.ok(e.state.towers[0].hanging.size > e.state.towers[1].hanging.size);
});

// ---------- forces ----------

test('block-stacker: tower race - the force button charges, then rocks everyone else\'s tower', () => {
  const e = new Engine({ rng: seeded(24) });
  e.startMatch('versus', [{ seat: 1, side: 'p1' }, { seat: 2, side: 'p2' }, { seat: 3, side: 'p3' }]);
  run(e, 3.1);
  assert.equal(e.useForce(1), false, 'still charging');
  run(e, FORCE.firstCharge);
  assert.equal(e.view().towers[0].charge, 0);
  const kind = e.state.towers[0].nextForce;
  assert.ok(FORCES.includes(kind));
  assert.equal(e.useForce(1), true);
  assert.equal(e.useForce(1), false, 'it has to charge again');
  assert.equal(e.state.towers[0].charge, FORCE.recharge);
  assert.equal(e.state.towers[0].force, null, 'not your own tower');
  for (const t of e.state.towers.slice(1)) assert.equal(t.force.kind, kind);
  const events = run(e, FORCE.warn + FORCE.last + 0.2);
  assert.equal(events.filter((ev) => ev.type === 'force' && ev.from === 1).length, 2);
  assert.ok(e.state.towers.every((t) => !t.force), 'it passes');
  const team2 = new Engine();
  team2.startMatch('team', team([1]));
  run(team2, 3 + FORCE.firstCharge + 1);
  assert.equal(team2.useForce(1), false, 'team mode: only the computer sends forces');
});

test('block-stacker: wind pushes the tower\'s blocks and blows the hanging block aside', () => {
  const e = new Engine({ rng: seeded(25) });
  e.startMatch('versus', [{ seat: 1, side: 'p1' }, { seat: 2, side: 'p2' }]);
  run(e, 3.1);
  e.drop(2);
  run(e, 3); // player 2's block lands
  const block = e.state.blocks.find((b) => b.seat === 2);
  const x0 = block.x;
  e.startForce(e.state.towers[1], 'wind', 1);
  const dir = e.state.towers[1].force.dir;
  run(e, FORCE.warn + FORCE.last * 0.5);
  assert.ok(Math.abs(e.state.towers[1].windX) > 20, 'the hanging block is blown aside');
  assert.ok((block.x - x0) * dir > 0.2, 'the landed block was pushed with the wind');
  run(e, FORCE.last);
  assert.equal(e.state.towers[1].windX, 0);
});

test('block-stacker: forces rock a tower with a helped player more gently', () => {
  const e = new Engine({ rng: seeded(26) });
  e.startMatch('versus', [{ seat: 1, side: 'p1', boost: 2 }, { seat: 2, side: 'p2' }]);
  run(e, 3.1);
  e.startForce(e.state.towers[0], 'quake', 2);
  e.startForce(e.state.towers[1], 'quake', 1);
  assert.ok(e.state.towers[0].force.power < e.state.towers[1].force.power);
});
