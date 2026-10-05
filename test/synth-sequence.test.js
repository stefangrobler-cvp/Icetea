import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, PHASE, shareColors } from '../games/synth-sequence/engine.js';
import { DIFFICULTIES, HEARTS, START_LENGTH, HINT_AFTER } from '../games/synth-sequence/config.js';

// Synth Sequence's own rules, tested without any platform.

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

function until(e, phase, limit = 60) {
  const events = [];
  for (let t = 0; t < limit && e.state.phase !== phase && e.state.phase !== PHASE.OVER; t += 1 / 60) events.push(...e.step(1 / 60));
  assert.equal(e.state.phase, phase);
  return events;
}

// The team plays the pattern back: each note by whoever owns that colour.
function teamPlays(e) {
  for (const pad of [...e.state.sequence]) assert.equal(e.press(e.state.owners[pad], pad), 'good');
}

const team = (n) => Array.from({ length: n }, (_, i) => ({ seat: i + 1, side: 'team' }));

test('synth-sequence: the colours are shared out between the team', () => {
  assert.deepEqual(shareColors([1]), { 0: 1, 1: 1, 2: 1, 3: 1 });
  assert.deepEqual(shareColors([3, 1]), { 0: 1, 1: 1, 2: 3, 3: 3 });
  assert.deepEqual(shareColors([1, 2, 3]), { 0: 1, 1: 2, 2: 3, 3: 3 });
  assert.deepEqual(shareColors([1, 2, 3, 4]), { 0: 1, 1: 2, 2: 3, 3: 4 });
});

test('synth-sequence: the screen plays the pattern, then it is your turn', () => {
  const e = new Engine({ rng: seeded(1) });
  e.startMatch('team', team(1));
  const events = until(e, PHASE.INPUT);
  assert.equal(e.state.sequence.length, START_LENGTH);
  const shown = events.filter((ev) => ev.type === 'show').map((ev) => ev.pad);
  assert.deepEqual(shown, e.state.sequence, 'each note lit in order');
  assert.ok(events.some((ev) => ev.type === 'your-turn'));
});

test('synth-sequence: playing it right grows the pattern by one', () => {
  const e = new Engine({ rng: seeded(2) });
  e.startMatch('team', team(1));
  until(e, PHASE.INPUT);
  const first = [...e.state.sequence];
  teamPlays(e);
  until(e, PHASE.INPUT);
  assert.equal(e.state.sequence.length, START_LENGTH + 1);
  assert.deepEqual(e.state.sequence.slice(0, first.length), first, 'same start, one more note');
});

test('synth-sequence: relay - only the owner of a colour can play it', () => {
  const e = new Engine({ rng: seeded(3) });
  e.startMatch('team', team(2));
  until(e, PHASE.INPUT);
  const pad = e.state.sequence[0];
  const owner = e.state.owners[pad];
  const other = owner === 1 ? 2 : 1;
  assert.equal(e.press(other, pad), null, 'not your colour: ignored');
  assert.deepEqual(e.padsFor(1), [0, 1]);
  assert.deepEqual(e.padsFor(2), [2, 3]);
  assert.equal(e.press(owner, pad), 'good');
});

test('synth-sequence: a wrong note costs a heart and the same pattern plays again', () => {
  const e = new Engine({ rng: seeded(4) });
  e.startMatch('team', team(1));
  until(e, PHASE.INPUT);
  const seq = [...e.state.sequence];
  const wrong = (seq[0] + 1) % 4;
  assert.equal(e.press(1, wrong), 'oops');
  assert.equal(e.state.hearts, HEARTS - 1);
  until(e, PHASE.INPUT);
  assert.deepEqual(e.state.sequence, seq, 'same pattern, not longer');
});

test('synth-sequence: team reaches the computer\'s best and wins', () => {
  const e = new Engine({ rng: seeded(5) });
  e.startMatch('team', team(3));
  for (let guard = 0; guard < 20 && e.state.phase !== PHASE.OVER; guard++) {
    until(e, PHASE.INPUT);
    teamPlays(e);
  }
  assert.equal(e.state.winner, 'team');
  assert.equal(e.state.best, DIFFICULTIES.easy.goal);
});

test('synth-sequence: three mistakes and the computer wins', () => {
  const e = new Engine({ rng: seeded(6) });
  e.startMatch('team', team(1));
  for (let i = 0; i < HEARTS; i++) {
    until(e, PHASE.INPUT);
    e.press(1, (e.state.sequence[0] + 1) % 4);
  }
  assert.equal(e.state.winner, 'cpu');
});

test('synth-sequence: waiting too long counts as a mistake', () => {
  const e = new Engine({ rng: seeded(7) });
  e.startMatch('team', team(1));
  until(e, PHASE.INPUT);
  run(e, DIFFICULTIES.easy.wait + 0.2);
  assert.equal(e.state.hearts, HEARTS - 1);
});

test('synth-sequence: help lights the right pad on that player\'s phone after a pause', () => {
  const e = new Engine({ rng: seeded(8) });
  e.startMatch('versus', [{ seat: 1, side: 'p1', boost: 2 }, { seat: 2, side: 'p2', boost: 0 }]);
  until(e, PHASE.INPUT);
  const events = run(e, HINT_AFTER[2] + 0.1);
  assert.ok(events.some((ev) => ev.type === 'hint' && ev.seat === 1 && ev.pad === e.state.sequence[0]));
  assert.equal(e.state.players[1].hint, e.state.sequence[0]);
  assert.equal(e.state.players[2].hint, null, 'no help asked for: no hint');
});

test('synth-sequence: last one standing - everyone plays on their own; the last with hearts wins', () => {
  const e = new Engine({ rng: seeded(9) });
  e.startMatch('versus', [{ seat: 1, side: 'p1' }, { seat: 2, side: 'p2' }]);
  for (let guard = 0; guard < 10 && e.state.phase !== PHASE.OVER; guard++) {
    until(e, PHASE.INPUT);
    for (const pad of [...e.state.sequence]) e.press(1, pad); // player 1 always right
    e.press(2, (e.state.sequence[0] + 1) % 4); // player 2 always wrong
  }
  assert.equal(e.state.winner, 'p1');
  assert.equal(e.state.players[2].out, true);
  assert.equal(e.state.players[1].hearts, HEARTS);
});

test('synth-sequence: last one standing - a player who finished waits for the others', () => {
  const e = new Engine({ rng: seeded(10) });
  e.startMatch('versus', [{ seat: 1, side: 'p1' }, { seat: 2, side: 'p2' }]);
  until(e, PHASE.INPUT);
  for (const pad of [...e.state.sequence]) e.press(1, pad);
  assert.equal(e.state.phase, PHASE.INPUT, 'still waiting for player 2');
  assert.equal(e.press(1, 0), null, 'done for this round');
  for (const pad of [...e.state.sequence]) e.press(2, pad);
  assert.equal(e.state.phase, PHASE.RESULT);
});

test('synth-sequence: last one standing - if everyone gets it wrong, the same pattern plays again', () => {
  const e = new Engine({ rng: seeded(13) });
  e.startMatch('versus', [{ seat: 1, side: 'p1' }, { seat: 2, side: 'p2' }]);
  until(e, PHASE.INPUT);
  const seq = [...e.state.sequence];
  e.press(1, (seq[0] + 1) % 4);
  e.press(2, (seq[0] + 1) % 4);
  until(e, PHASE.INPUT);
  assert.deepEqual(e.state.sequence, seq);
});

test('synth-sequence: nothing happens while paused', () => {
  const e = new Engine({ rng: seeded(11) });
  e.startMatch('team', team(1));
  run(e, 3.5);
  const before = JSON.stringify(e.state);
  e.pause();
  run(e, 3);
  assert.equal(e.press(1, 0), null);
  assert.equal(JSON.stringify(e.state), before);
});

test('synth-sequence: a kid joining the relay gets colours', () => {
  const e = new Engine({ rng: seeded(12) });
  e.startMatch('team', team(1));
  assert.equal(e.addPlayer({ seat: 2, side: 'team' }), true);
  assert.deepEqual(e.padsFor(2), [2, 3]);
  const v = new Engine();
  v.startMatch('versus', [{ seat: 1, side: 'p1' }, { seat: 2, side: 'p2' }]);
  assert.equal(v.addPlayer({ seat: 3, side: 'p3' }), false);
});
