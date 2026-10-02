// Neon Pong server: serves the web pages, makes QR codes, and relays messages
// between the game screen (tablet) and the controllers (phones).
// It contains no game rules: the game screen runs the game.

import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { MSG, MAX_PLAYERS } from '../shared/protocol.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = process.env.PORT || 3000;
const ROOM_TTL_MS = 30 * 60 * 1000; // keep a room 30 min after the game screen leaves
const HEARTBEAT_MS = 2500; // how often we check that phones are still there

// ---------- web pages ----------

const app = express();
app.disable('x-powered-by');
app.use('/shared', express.static(path.join(ROOT, 'shared'), { maxAge: 0 }));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: 0 }));
app.get('/healthz', (_req, res) => res.send('ok'));

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

// ---------- rooms ----------

/**
 * room = {
 *   code, token, host: WebSocket|null, hostGoneAt,
 *   players: { 1: { clientId, ws|null }, 2: ... }
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
  for (let slot = 1; slot <= MAX_PLAYERS; slot++) out[slot] = Boolean(room.players[slot]?.ws);
  return out;
}

function forEachPhone(room, fn) {
  for (let slot = 1; slot <= MAX_PLAYERS; slot++) {
    const p = room.players[slot];
    if (p?.ws) fn(p.ws, slot);
  }
}

// Pick a slot for a phone: its old slot if it had one, else an empty one,
// else one whose phone has dropped out (so a kid can rejoin on a different phone).
function pickSlot(room, clientId) {
  for (let slot = 1; slot <= MAX_PLAYERS; slot++) {
    if (room.players[slot]?.clientId === clientId) return slot;
  }
  for (let slot = 1; slot <= MAX_PLAYERS; slot++) if (!room.players[slot]) return slot;
  for (let slot = 1; slot <= MAX_PLAYERS; slot++) if (!room.players[slot].ws) return slot;
  return null;
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

function registerHost(ws, { room: code, token }) {
  let room = code && rooms.get(String(code));
  if (room && room.token === token) {
    // The game screen reloaded: take the room back over.
    if (room.host && room.host !== ws) room.host.close();
  } else {
    room = { code: newRoomCode(), token: crypto.randomUUID(), host: null, hostGoneAt: 0, players: {} };
    rooms.set(room.code, room);
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
  const slot = pickSlot(room, id);
  if (!slot) return send(ws, { t: MSG.ERROR, reason: 'full' });

  const old = room.players[slot];
  if (old?.ws && old.ws !== ws) {
    old.ws.replaced = true; // same phone opened twice: keep the newest
    old.ws.close();
  }
  room.players[slot] = { clientId: id, ws };
  ws.role = 'phone';
  ws.room = room;
  ws.slot = slot;
  ws._socket?.setNoDelay(true);
  send(ws, { t: MSG.JOINED, slot, clientId: id });
  send(ws, { t: MSG.HOST_STATUS, online: Boolean(room.host) });
  if (room.lastState) send(ws, room.lastState);
  send(room.host, { t: MSG.PLAYER, slot, connected: true });
}

function handlePhone(ws, msg) {
  const room = ws.room;
  if (msg.t === MSG.INPUT) {
    // Paddle movement: the hot path, forwarded as small as possible.
    // (Normally this goes over the direct link instead; this is the backup route.)
    if (room.host) send(room.host, `{"t":"in","s":${ws.slot},"y":${Number(msg.y) || 0},"n":${Number(msg.n) || 0},"l":${msg.l === 1 ? 1 : 0}}`);
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
  console.log(`Neon Pong running on http://localhost:${PORT}`);
});
