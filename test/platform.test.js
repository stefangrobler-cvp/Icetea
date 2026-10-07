import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanProfile, playerLabel, nicknameAllowed } from '../platform/shared/profile.js';
import { createMetrics, memoryStore } from '../platform/server/metrics.js';

test('nicknames are tidied up and fall back to the animal', () => {
  assert.deepEqual(cleanProfile({ name: '  Mia  ', avatar: '🐯', boost: 2 }, 1), { name: 'Mia', avatar: '🐯', boost: 2 });
  // No name: the player is called after their animal (the default animal for seat 2 is the panda).
  assert.deepEqual(cleanProfile({ name: '', avatar: 'x', boost: 9 }, 2), { name: 'Panda', avatar: '🐼', boost: 0 });
  assert.equal(cleanProfile({ name: '', avatar: '🐸' }, 1).name, 'Frog');
  assert.equal(cleanProfile({ name: 'Bartholomew-the-Great' }, 1).name, 'Bartholomew-');
  assert.equal(cleanProfile({ name: 'a\u0007b' }, 1).name, 'ab');
  assert.equal(playerLabel({ 1: { name: 'Leo', avatar: '🦁' } }, 1), '🦁 Leo');
  assert.equal(playerLabel({}, 2), '🐼 Panda');
});

test('nickname filter blocks rude words, also with spaces and number swaps', () => {
  for (const ok of ['Mia', 'Leo', 'Super Sam', 'Ana 7']) assert.ok(nicknameAllowed(ok), ok);
  for (const bad of ['sh1t', 'F U C K', 'poes', 'b!tch']) assert.equal(nicknameAllowed(bad), false, bad);
  assert.equal(cleanProfile({ name: 'sh1t' }, 3).name, 'Tiger'); // blocked name: the seat's default animal (tiger)
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
  m.fromScreen('ABCD', 'feedback', { game: 'pong', vote: 'up', from: 'phone' });
  m.fromScreen('ABCD', 'feedback', { game: 'pong', vote: 'up', from: 'phone' });
  m.fromScreen('ABCD', 'feedback', { game: 'pong', vote: 'down', from: 'screen' });
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
  assert.deepEqual(s.perGame.pong, { started: 1, finished: 1, rematches: 1, thumbsUp: 2, thumbsDown: 1 });
  assert.equal(s.thumbsUpPct, 67);
});

test('measurement can be stored in Postgres (using a stand-in database here)', async () => {
  const { postgresStore } = await import('../platform/server/metrics.js');
  const rows = [];
  const fakeDb = {
    async query(sql, params) {
      if (sql.startsWith('insert')) rows.push({ data: params[2] });
      if (sql.startsWith('select')) return { rows };
      return { rows: [] };
    },
  };
  const store = await postgresStore('postgres://example', fakeDb);
  const m = createMetrics(store, await store.readAll());
  m.arrival('phone_joined', 'phone-9', { room: 'ABCD', seat: 1 });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(rows.length, 1);
  // A restart reads the events back, so a returning phone is still recognised.
  const again = createMetrics(store, await store.readAll());
  assert.equal(again.arrival('phone_joined', 'phone-9', { room: 'WXYZ', seat: 1 }), true);
});
