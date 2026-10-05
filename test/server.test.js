import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 3000 + Math.floor(Math.random() * 1000) + 4000;
const METRICS_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fgp-')), 'metrics.jsonl');
let server;

before(async () => {
  server = spawn(process.execPath, ['platform/server/index.js'], {
    env: { ...process.env, PORT: String(PORT), STATS_KEY: 'test-key', METRICS_FILE },
  });
  await new Promise((resolve) => server.stdout.once('data', resolve));
});
after(() => server.kill());

// Opens a socket that records every message it receives.
function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  ws.inbox = [];
  ws.on('message', (d) => ws.inbox.push(JSON.parse(d)));
  ws.next = (type, timeout = 2000) => new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const i = ws.inbox.findIndex((m) => m.t === type);
      if (i >= 0) return resolve(ws.inbox.splice(i, 1)[0]);
      if (Date.now() - started > timeout) return reject(new Error(`no ${type}`));
      setTimeout(check, 10);
    };
    check();
  });
  return new Promise((resolve) => ws.on('open', () => resolve(ws)));
}

test('phones join a room, inputs reach the screen, state reaches the phones', async () => {
  const host = await client();
  host.send(JSON.stringify({ t: 'host', screenTag: 'screen-1' }));
  const { room } = await host.next('room');
  assert.match(room, /^[A-Z]{4}$/);

  const a = await client();
  a.send(JSON.stringify({ t: 'join', room, clientId: 'kid-a' }));
  assert.equal((await a.next('joined')).slot, 1);
  const b = await client();
  b.send(JSON.stringify({ t: 'join', room, clientId: 'kid-b' }));
  assert.equal((await b.next('joined')).slot, 2);
  assert.deepEqual(await host.next('player'), { t: 'player', slot: 1, connected: true });

  // Controller kit values: a number, or a small object (the aiming circle).
  a.send(JSON.stringify({ t: 'in', c: 'paddle', v: 0.25, n: 7 }));
  assert.deepEqual(await host.next('in'), { t: 'in', s: 1, c: 'paddle', v: 0.25, n: 7 });
  a.send(JSON.stringify({ t: 'in', c: 'kick', v: { angle: 0.5, release: true, evil: 'x' }, n: 8 }));
  assert.deepEqual(await host.next('in'), { t: 'in', s: 1, c: 'kick', v: { angle: 0.5, release: true }, n: 8 });
  a.send(JSON.stringify({ t: 'in', c: '<script>', v: 1, n: 9 }));

  // Setting up the direct link: phone -> screen, and screen -> one phone only.
  a.send(JSON.stringify({ t: 'sig', data: { sdp: 'offer' } }));
  assert.deepEqual(await host.next('sig'), { t: 'sig', data: { sdp: 'offer' }, slot: 1 });
  host.send(JSON.stringify({ t: 'to', slot: 1, msg: { t: 'sig', data: { sdp: 'answer' } } }));
  assert.deepEqual(await a.next('sig'), { t: 'sig', data: { sdp: 'answer' } });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(b.inbox.some((m) => m.t === 'sig'), false);

  b.send(JSON.stringify({ t: 'cmd', action: 'pause' }));
  assert.equal((await host.next('cmd')).slot, 2);

  host.send(JSON.stringify({ t: 'bcast', msg: { t: 'state', phase: 'paused' } }));
  assert.equal((await a.next('state')).phase, 'paused');
  assert.equal((await b.next('state')).phase, 'paused');

  // Up to four phones join; a fifth is turned away.
  const extra = [];
  for (const id of ['kid-c', 'kid-d']) {
    const p = await client();
    p.send(JSON.stringify({ t: 'join', room, clientId: id }));
    await p.next('joined');
    extra.push(p);
  }
  const c = await client();
  c.send(JSON.stringify({ t: 'join', room, clientId: 'kid-e' }));
  assert.equal((await c.next('error')).reason, 'full');

  // Kid B drops out: the screen is told, and B gets the same slot back on rejoin.
  host.inbox.length = 0;
  b.close();
  assert.deepEqual(await host.next('player'), { t: 'player', slot: 2, connected: false });
  const b2 = await client();
  b2.send(JSON.stringify({ t: 'join', room, clientId: 'kid-b' }));
  assert.equal((await b2.next('joined')).slot, 2);
  assert.equal((await b2.next('state')).phase, 'paused'); // late joiner gets the latest state

  // The screen's measurements are kept (known ones only).
  host.send(JSON.stringify({ t: 'metric', name: 'match_started', data: { game: 'pong', firstMatch: true, msSinceStart: 30000 } }));
  host.send(JSON.stringify({ t: 'metric', name: 'not_a_metric', data: { x: 1 } }));
  await new Promise((r) => setTimeout(r, 150));
  const lines = fs.readFileSync(METRICS_FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(lines.some((l) => l.type === 'match_started' && l.game === 'pong'));
  assert.ok(lines.some((l) => l.type === 'phone_joined'));
  assert.ok(!lines.some((l) => l.type === 'not_a_metric'));

  for (const ws of [host, a, b2, c, ...extra]) ws.close();
});

test('unknown room is reported', async () => {
  const p = await client();
  p.send(JSON.stringify({ t: 'join', room: 'ZZZZ', clientId: 'x' }));
  assert.equal((await p.next('error')).reason, 'noroom');
  p.close();
});

test('QR code and pages are served', async () => {
  const qr = await fetch(`http://localhost:${PORT}/qr.svg?room=ABCD`);
  assert.equal(qr.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  assert.equal((await fetch(`http://localhost:${PORT}/play`)).status, 200);
  assert.equal((await fetch(`http://localhost:${PORT}/games/pong/game.js`)).status, 200);
  assert.equal((await fetch(`http://localhost:${PORT}/platform/contract/contract.js`)).status, 200);
});

test('the game list comes from the games\' manifests', async () => {
  const list = await (await fetch(`http://localhost:${PORT}/api/catalogue`)).json();
  const { games } = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'platform', 'catalogue.json'), 'utf8'));
  assert.deepEqual(list.map((g) => g.id), games);
  assert.ok(games.includes('pong') && games.includes('soccer'));
  assert.ok(list.every((g) => g.contract === 1 && g.layouts));
});

test('the numbers page needs the secret key', async () => {
  assert.equal((await fetch(`http://localhost:${PORT}/stats`)).status, 404);
  assert.equal((await fetch(`http://localhost:${PORT}/stats?key=wrong`)).status, 404);
  const s = await (await fetch(`http://localhost:${PORT}/stats?key=test-key&format=json`)).json();
  assert.ok(s.roomsOpened >= 1);
  assert.ok('medianDelayMs' in s);
});
