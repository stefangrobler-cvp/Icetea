import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanProfile, playerLabel, nicknameAllowed } from '../platform/shared/profile.js';
import { createMetrics, memoryStore } from '../platform/server/metrics.js';

test('nicknames are tidied up and fall back to "Player N"', () => {
  assert.deepEqual(cleanProfile({ name: '  Mia  ', avatar: '🐯' }, 1), { name: 'Mia', avatar: '🐯' });
  assert.deepEqual(cleanProfile({ name: '', avatar: 'x' }, 2), { name: 'Player 2', avatar: '🐼' });
  assert.equal(cleanProfile({ name: 'Bartholomew-the-Great' }, 1).name, 'Bartholomew-');
  assert.equal(cleanProfile({ name: 'a\u0007b' }, 1).name, 'ab');
  assert.equal(playerLabel({ 1: { name: 'Leo', avatar: '🦁' } }, 1), '🦁 Leo');
  assert.equal(playerLabel({}, 2), '🐼 Player 2');
});

test('nickname filter blocks rude words, also with spaces and number swaps', () => {
  for (const ok of ['Mia', 'Leo', 'Super Sam', 'Ana 7']) assert.ok(nicknameAllowed(ok), ok);
  for (const bad of ['sh1t', 'F U C K', 'poes', 'b!tch']) assert.equal(nicknameAllowed(bad), false, bad);
  assert.equal(cleanProfile({ name: 'sh1t' }, 3).name, 'Player 3');
});

test('measurement: returning devices, numbers summary, and only known measurements are kept', () => {
  const m = createMetrics(memoryStore());
  assert.equal(m.arrival('screen_opened', 'screen-a', { room: 'ABCD' }), false);
  m.record('room_opened', { room: 'ABCD' });
  assert.equal(m.arrival('phone_joined', 'phone-1', { room: 'ABCD', seat: 1 }), false);
  assert.equal(m.arrival('phone_joined', 'phone-1', { room: 'WXYZ', seat: 1 }), true, 'same phone, later: returning');
  m.fromScreen('ABCD', 'match_started', { game: 'pong', mode: 'versus', firstMatch: true, msSinceStart: 42000, secret: 'dropped' });
  m.fromScreen('ABCD', 'match_ended', { game: 'pong', durationMs: 180000, winner: 'left' });
  m.fromScreen('ABCD', 'rematch', { game: 'pong' });
  m.fromScreen('ABCD', 'latency', { samples: 30, p50: 18, p95: 40, directShare: 1 });
  assert.equal(m.fromScreen('ABCD', 'anything_else', { a: 1 }), null);
  assert.equal(m.events.find((e) => e.type === 'match_started').secret, undefined);
  // Device tags are stored hashed, never as sent.
  assert.ok(m.events.every((e) => e.tag !== 'phone-1' && e.tag !== 'screen-a'));
  const s = m.summary();
  assert.equal(s.returningPhonesPct, 50);
  assert.equal(s.medianSecondsStartToFirstMatch, 42);
  assert.equal(s.matchesFinished, 1);
  assert.equal(s.medianMatchMinutes, 3);
  assert.equal(s.medianDelayMs, 18);
  assert.deepEqual(s.perGame.pong, { started: 1, finished: 1, rematches: 1 });
});
