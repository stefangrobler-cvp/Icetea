// Platform server: serves the pages and games, makes QR codes, opens rooms,
// relays messages between the big screen and the phones, and keeps the basic
// measurement log. It contains no game rules: games run on the big screen.

import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { MSG, MAX_PLAYERS } from '../shared/protocol.js';
import { loadCatalogue } from './catalogue.js';
import { createMetrics, fileStore } from './metrics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = process.env.PORT || 3000;
const ROOM_TTL_MS = 30 * 60 * 1000; // keep a room 30 min after the big screen leaves
const HEARTBEAT_MS = 2500; // how often we check that phones are still there
const STATS_KEY = process.env.STATS_KEY || ''; // secret for the numbers page; no key = page off

const catalogue = await loadCatalogue(ROOT);
const metrics = createMetrics(fileStore(process.env.METRICS_FILE || path.join(ROOT, 'data', 'metrics.jsonl')));

// ---------- web pages ----------

const app = express();
app.disable('x-powered-by');
const files = (dir) => express.static(path.join(ROOT, dir), { maxAge: 0, extensions: ['html'] });
app.use('/platform/shared', files('platform/shared'));
app.use('/platform/contract', files('platform/contract'));
app.use('/games', files('games')); // each game's own folder, as-is
app.use(files('platform/web'));
app.get('/healthz', (_req, res) => res.send('ok'));
app.get('/api/catalogue', (_req, res) => res.json(catalogue));

// QR code that sends a phone straight to the controller page for a room.
app.get('/qr.svg', async (req, res) => {
  const room = String(req.query.room || '').toUpperCase();
  if (!/^[A-Z]{4}$/.test(room)) return res.status(400).send('bad room');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol).split(',')[0];
  const url = `${proto}://${req.headers.host}/play?room=${room}`;
  const svg = await QRCode.toString(url, {
    type: 'svg', margin: 1, errorCorrectionLevel: 'M',
    color: { dark: '#05010f', light: '#ffffff' },
  });
  res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
});

// The numbers page, behind a secret link: /stats?key=...
app.get('/stats', (req, res) => {
  if (!STATS_KEY || req.query.key !== STATS_KEY) return res.status(404).send('Not found');
  const s = metrics.summary();
  if (req.query.format === 'json') return res.json(s);
  const rows = Object.entries(s).filter(([k]) => k !== 'perGame')
    .map(([k, v]) => `<tr><td>${k}</td><td>${v ?? '–'}</td></tr>`).join('');
  const games = Object.entries(s.perGame)
    .map(([g, v]) => `<tr><td>${g}</td><td>${v.started}</td><td>${v.finished}</td><td>${v.rematches}</td></tr>`).join('');
  res.send(`<!doctype html><meta name="viewport" content="width=device-width"><title>Numbers</title>
<style>body{font-family:system-ui;background:#05010f;color:#eee;padding:16px}td{padding:4px 12px;border-bottom:1px solid #333}</style>
<h2>Numbers</h2><table>${rows}</table><h3>Games</h3>
<table><tr><td>game</td><td>started</td><td>finished</td><td>rematches</td></tr>${games}</table>`);
});

// ---------- rooms ----------

/**
 * room = {
 *   code, token, host: WebSocket|null, hostGoneAt,
 *   players: { [seat]: { clientId, ws|null } }   (seats 1..MAX_PLAYERS)
 * }
 */
const rooms = new Map();
const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O (look like 1 and 0)

function newRoomCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += ROOM_LETTERS[crypto.randomInt(ROOM_LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
}

function playerStatus(room) {
  const out = {};
  for (let seat = 1; seat <= MAX_PLAYERS; seat++) out[seat] = Boolean(room.players[seat]?.ws);
  return out;
}

function forEachPhone(room, fn) {
  for (let seat = 1; seat <= MAX_PLAYERS; seat++) {
    const p = room.players[seat];
    if (p?.ws) fn(p.ws, seat);
  }
}

// Pick a seat for a phone: its old seat if it had one, else an empty one,
// else one whose phone has dropped out (so a kid can rejoin on a different phone).
function pickSeat(room, clientId) {
  for (let seat = 1; seat <= MAX_PLAYERS; seat++) {
    if (room.players[seat]?.clientId === clientId) return seat;
  }
  for (let seat = 1; seat <= MAX_PLAYERS; seat++) if (!room.players[seat]) return seat;
  for (let seat = 1; seat <= MAX_PLAYERS; seat++) if (!room.players[seat].ws) return seat;
  return null;
}

// A control value from the controller kit: a number, or a small object of numbers/true-false.
function cleanValue(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  const entries = Object.entries(v).slice(0, 4);
  for (const [k, x] of entries) {
    if (!/^[a-zA-Z]{1,12}$/.test(k)) continue;
    if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
    else if (typeof x === 'boolean') out[k] = x;
  }
  return out;
}

// ---------- live connections ----------

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.role = null; // 'host' | 'phone'
  ws.room = null;
  ws.slot = null;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    ws.isAlive = true;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (ws.role === 'phone') return handlePhone(ws, msg);
    if (ws.role === 'host') return handleHost(ws, msg);
    if (msg.t === MSG.HOST) return registerHost(ws, msg);
    if (msg.t === MSG.JOIN) return registerPhone(ws, msg);
  });

  ws.on('close', () => dropConnection(ws));
  ws.on('error', () => {});
});

function registerHost(ws, { room: code, token, screenTag }) {
  let room = code && rooms.get(String(code));
  if (room && room.token === token) {
    // The big screen reloaded: take the room back over.
    if (room.host && room.host !== ws) room.host.close();
  } else {
    room = { code: newRoomCode(), token: crypto.randomUUID(), host: null, hostGoneAt: 0, players: {} };
    rooms.set(room.code, room);
    metrics.arrival('screen_opened', screenTag, { room: room.code });
    metrics.record('room_opened', { room: room.code });
  }
  room.host = ws;
  room.hostGoneAt = 0;
  ws.role = 'host';
  ws.room = room;
  send(ws, { t: MSG.ROOM, room: room.code, token: room.token, players: playerStatus(room) });
  forEachPhone(room, (phone) => send(phone, { t: MSG.HOST_STATUS, online: true }));
}

function registerPhone(ws, { room: code, clientId }) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) return send(ws, { t: MSG.ERROR, reason: 'noroom' });
  const id = String(clientId || crypto.randomUUID()).slice(0, 64);
  const seat = pickSeat(room, id);
  if (!seat) return send(ws, { t: MSG.ERROR, reason: 'full' });

  const old = room.players[seat];
  const firstTime = old?.clientId !== id;
  if (old?.ws && old.ws !== ws) old.ws.close(); // same phone opened twice: keep the newest
  room.players[seat] = { clientId: id, ws };
  ws.role = 'phone';
  ws.room = room;
  ws.slot = seat;
  ws._socket?.setNoDelay(true);
  if (firstTime) metrics.arrival('phone_joined', id, { room: room.code, seat });
  send(ws, { t: MSG.JOINED, slot: seat, clientId: id });
  send(ws, { t: MSG.HOST_STATUS, online: Boolean(room.host) });
  if (room.lastState) send(ws, room.lastState);
  send(room.host, { t: MSG.PLAYER, slot: seat, connected: true });
}

function handlePhone(ws, msg) {
  const room = ws.room;
  if (msg.t === MSG.INPUT) {
    // A control moved: the hot path. (Normally this goes over the direct link
    // instead; this is the backup route.)
    if (!room.host || !/^[a-zA-Z0-9]{1,16}$/.test(String(msg.c))) return;
    const v = cleanValue(msg.v);
    if (v === null) return;
    send(room.host, { t: MSG.INPUT, s: ws.slot, c: msg.c, v, n: Number(msg.n) || 0 });
  } else if (msg.t === MSG.COMMAND || msg.t === MSG.SIGNAL || msg.t === MSG.PING) {
    send(room.host, { ...msg, slot: ws.slot });
  }
}

function handleHost(ws, msg) {
  const room = ws.room;
  if (msg.t === MSG.BROADCAST && msg.msg) {
    const text = JSON.stringify(msg.msg);
    if (msg.msg.t === MSG.STATE) room.lastState = text; // late joiners get the latest state
    forEachPhone(room, (phone) => send(phone, text));
  } else if (msg.t === MSG.SEND_TO && msg.msg) {
    send(room.players[msg.slot]?.ws, msg.msg);
  } else if (msg.t === MSG.METRIC) {
    metrics.fromScreen(room.code, String(msg.name), msg.data);
  }
}

function dropConnection(ws) {
  const room = ws.room;
  if (!room) return;
  if (ws.role === 'host' && room.host === ws) {
    room.host = null;
    room.hostGoneAt = Date.now();
    forEachPhone(room, (phone) => send(phone, { t: MSG.HOST_STATUS, online: false }));
  } else if (ws.role === 'phone' && room.players[ws.slot]?.ws === ws) {
    room.players[ws.slot].ws = null;
    send(room.host, { t: MSG.PLAYER, slot: ws.slot, connected: false });
  }
}

// Find phones that vanished without saying goodbye (screen locked, out of wifi...).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.host && room.hostGoneAt && now - room.hostGoneAt > ROOM_TTL_MS) {
      forEachPhone(room, (phone) => phone.close());
      rooms.delete(code);
    }
  }
}, HEARTBEAT_MS);

server.listen(PORT, () => {
  console.log(`Family game platform running on http://localhost:${PORT} with ${catalogue.length} games`);
});
