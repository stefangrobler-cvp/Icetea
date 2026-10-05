import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, PHASE, SETTINGS } from '../games/__ID__/engine.js';

// __NAME__'s own rules, tested without any platform: the game folder stands on its own.

function seeded(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function run(engine, seconds, onFrame) {
  const all = [];
  for (let t = 0; t < seconds && engine.state.phase === PHASE.PLAYING; t += 1 / 60) {
    if (onFrame) onFrame(engine);
    all.push(...engine.step(1 / 60));
  }
  return all;
}

test('__ID__: nobody moving lets stars get away and the computer wins', () => {
  const e = new Engine({ rng: seeded(3) });
  e.startMatch([{ seat: 1 }]);
  e.move(1, 0); // hide at the top
  const events = run(e, 120);
  assert.equal(e.state.phase, PHASE.OVER);
  assert.equal(e.state.winner, 'cpu');
  assert.ok(events.some((ev) => ev.type === 'miss'));
});

test('__ID__: following the stars wins for the team', () => {
  const e = new Engine({ rng: seeded(3) });
  e.startMatch([{ seat: 1 }, { seat: 2 }]);
  run(e, 300, (eng) => {
    const next = eng.state.stars.reduce((a, b) => (!a || b.x < a.x ? b : a), null);
    if (next) eng.move(1, next.y);
  });
  assert.equal(e.state.winner, 'team');
  assert.equal(e.state.caught, SETTINGS.toWin);
});

test('__ID__: help makes only that player\'s catcher bigger', () => {
  const e = new Engine();
  e.startMatch([{ seat: 1, boost: 2 }, { seat: 2, boost: 0 }]);
  assert.ok(e.state.catchers[1].size > e.state.catchers[2].size);
});

test('__ID__: nothing moves while paused', () => {
  const e = new Engine({ rng: seeded(1) });
  e.startMatch([{ seat: 1 }]);
  run(e, 2);
  const before = JSON.stringify(e.state);
  e.pause();
  run(e, 2);
  assert.equal(JSON.stringify(e.state), before);
});
