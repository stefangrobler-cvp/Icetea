// The phone controller. Swipe up/down to move your paddle.

import { COLORS } from '/shared/config.js';
import { MSG, ACTIONS } from '/shared/protocol.js';
import { Connection, keepScreenOn } from './net.js';
import { PhoneLink } from './direct.js';

const $ = (id) => document.getElementById(id);
const roomCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase();

// A random id remembered on this phone, so a reload or a dropped connection
// gets the same player slot back.
let clientId = localStorage.getItem('neonpong.clientId');
if (!clientId) {
  clientId = (crypto.randomUUID?.() || String(Math.random()).slice(2)) + Date.now();
  localStorage.setItem('neonpong.clientId', clientId);
}

let slot = null;
let state = null;
let hostOnline = true;
let problem = roomCode ? null : 'noroom';
let matchId = null;
let rtt = null; // last measured delay to the game screen and back, in ms

// ---------- connection ----------

const conn = new Connection({
  onOpen(c) {
    if (!roomCode) return;
    c.send({ t: MSG.JOIN, room: roomCode, clientId });
  },
  onClose() {
    slot = null;
    link.close();
    render();
  },
  onMessage(msg) {
    switch (msg.t) {
      case MSG.JOINED:
        slot = msg.slot;
        problem = null;
        sendAll(true);
        if (!link.open) link.start();
        break;
      case MSG.SIGNAL:
        link.handleSignal(msg.data);
        break;
      case MSG.PONG:
        handlePong(msg);
        break;
      case MSG.ERROR:
        problem = msg.reason;
        break;
      case MSG.HOST_STATUS:
        // The game screen came back (e.g. it was reloaded): set up a fresh direct link.
        if (msg.online && !hostOnline && slot) link.start();
        hostOnline = msg.online;
        break;
      case MSG.STATE:
        if (state && msg.matchId !== matchId && msg.phase !== 'lobby') {
          resetPositions(); // new match: paddles start in the middle
        }
        matchId = msg.matchId;
        state = msg;
        break;
    }
    render();
  },
});

function command(action, extra = {}) {
  conn.send({ t: MSG.COMMAND, action, ...extra });
}

// Direct link to the tablet over Wi-Fi, for paddle movement.
const link = new PhoneLink({
  sendSignal: (data) => conn.send({ t: MSG.SIGNAL, data }),
  onMessage: (msg) => { if (msg.t === MSG.PONG) handlePong(msg); },
});

// Measure the delay to the game screen once a second (shown on the tablet).
function handlePong(msg) {
  rtt = Math.round(performance.now() - msg.ts);
}
setInterval(() => {
  if (!slot) return;
  const ping = JSON.stringify({ t: MSG.PING, ts: performance.now(), rtt, direct: link.open });
  if (!link.send(ping)) conn.send(ping);
}, 1000);

// ---------- swiping ----------
//
// Ping pong: the whole screen is one swipe area. Soccer: one area per rod
// (left and right, matching where the rods are on the tablet), so each
// thumb works its own rod.

const LABELS = { main: '', def: '🛡️ Defend', att: '⚽ Attack' };
const positions = {}; // lane -> paddle position, 0 (top) .. 1 (bottom)
const lastSent = {}; // lane -> last position sent
let seq = 0;
let zones = []; // [{ lane, el, preview }]
let zonesKey = '';

function sendPaddle(lane, force = false) {
  const y = Math.round((positions[lane] ?? 0.5) * 1000) / 1000;
  if (!force && y === lastSent[lane]) return;
  lastSent[lane] = y;
  seq += 1;
  const msg = `{"t":"in","y":${y},"n":${seq},"l":${lane}}`;
  // Straight to the tablet if we can, otherwise through the server.
  if (!link.send(msg)) conn.send(msg);
  // Move the little paddle on the phone too, so kids can feel it working.
  const zone = zones.find((z) => z.lane === lane);
  if (zone) zone.preview.style.transform = `translate(-50%, -50%) translateY(${(y - 0.5) * zone.el.clientHeight * (zone.rod ? 0.25 : 0.5)}px)`;
}

function sendAll(force = false) {
  for (const lane of Object.keys(positions)) sendPaddle(Number(lane), force);
}

function resetPositions() {
  for (const lane of Object.keys(positions)) positions[lane] = 0.5;
  for (const z of zones) positions[z.lane] = 0.5;
  sendAll(true);
}

// The direct link may drop a message now and then (on purpose, for speed),
// so repeat the current positions a few times a second.
setInterval(() => {
  if (!link.open) return;
  for (const z of zones) {
    link.send(`{"t":"in","y":${lastSent[z.lane] ?? 0.5},"n":${++seq},"l":${z.lane}}`);
  }
}, 150);

/** Build the swipe areas for the rods/paddle this phone controls. */
function buildZones(controls, game) {
  const key = JSON.stringify([controls, game]);
  if (key === zonesKey) return;
  zonesKey = key;
  const container = $('zones');
  container.innerHTML = '';
  zones = controls.map(({ lane, kind }) => {
    const el = document.createElement('div');
    el.className = 'zone';
    const preview = document.createElement('div');
    preview.className = `preview${game === 'soccer' ? ' rod' : ''}`;
    preview.innerHTML = game === 'soccer' ? '<i></i><i></i><i></i>' : '<i></i>';
    el.innerHTML = `<div class="arrow">▲</div><div class="label">${LABELS[kind] || ''}</div><div class="arrow">▼</div>`;
    el.appendChild(preview);
    container.appendChild(el);
    if (positions[lane] === undefined) positions[lane] = 0.5;
    const zone = { lane, el, preview, rod: game === 'soccer' };
    attachSwipe(zone);
    return zone;
  });
  for (const z of zones) sendPaddle(z.lane, true);
}

function attachSwipe(zone) {
  const { el, lane } = zone;
  const lastY = new Map(); // touch id -> last y
  const move = (dy) => {
    // Swiping about 70% of the screen height moves the paddle the whole way.
    positions[lane] = Math.max(0, Math.min(1, positions[lane] + dy / (window.innerHeight * 0.7)));
    sendPaddle(lane);
  };
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) lastY.set(t.identifier, t.clientY);
    el.classList.add('touching');
  }, { passive: false });
  el.addEventListener('touchmove', (e) => {
    e.preventDefault();
    // A finger that started in this area keeps controlling it, even if it slides out.
    for (const t of e.changedTouches) {
      const prev = lastY.get(t.identifier);
      if (prev === undefined) continue;
      lastY.set(t.identifier, t.clientY);
      move(t.clientY - prev);
    }
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) lastY.delete(t.identifier);
    if (lastY.size === 0) el.classList.remove('touching');
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
  // Mouse support, handy for testing on a computer.
  let mouseY = null;
  el.addEventListener('mousedown', (e) => { mouseY = e.clientY; });
  window.addEventListener('mouseup', () => { mouseY = null; });
  window.addEventListener('mousemove', (e) => {
    if (mouseY === null) return;
    move(e.clientY - mouseY);
    mouseY = e.clientY;
  });
}

// ---------- buttons ----------

document.querySelectorAll('[data-setting] button').forEach((btn) => {
  btn.addEventListener('click', () => {
    command(ACTIONS.SETTINGS, { [btn.parentElement.dataset.setting]: btn.dataset.value });
  });
});
$('start').addEventListener('click', () => { keepScreenOn(); command(ACTIONS.START); });
$('pause').addEventListener('click', () => command(ACTIONS.PAUSE));
$('resume').addEventListener('click', () => command(ACTIONS.RESUME));
$('again').addEventListener('click', () => { keepScreenOn(); command(ACTIONS.PLAY_AGAIN); });
$('change').addEventListener('click', () => command(ACTIONS.CHANGE_SETTINGS));

// Screen locked or switched app: tell the game straight away so it pauses,
// then reconnect as soon as the phone is back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { link.close(); conn.closeQuietly(); }
  else conn.reconnectNow();
});
window.addEventListener('pageshow', (e) => { if (e.persisted) conn.reconnectNow(); });

// ---------- drawing the screen ----------

const show = (id, on) => $(id).classList.toggle('hidden', !on);

function render() {
  const myColor = COLORS[slot] || COLORS.ball;
  document.body.style.setProperty('--me', myColor);
  $('badge').textContent = slot ? `P${slot}` : '…';

  // Problems first
  let status = null;
  if (problem === 'noroom') status = 'Scan the code on the game screen again';
  else if (problem === 'full') status = 'Two players are already playing';
  else if (!conn.open || !slot) status = 'Connecting…';
  else if (!hostOnline) status = 'Waiting for the game screen…';
  else if (!state) status = 'Connecting…';
  show('status', Boolean(status));
  if (status) {
    $('status-text').textContent = status;
    ['lobby', 'message', 'paused', 'over', 'zones', 'score', 'pause'].forEach((id) => show(id, false));
    return;
  }

  const phase = state.phase;
  document.body.dataset.game = state.settings.game;
  const mySide = state.sides[slot]; // 'left' | 'right' | undefined (not in this match)
  const inMatch = ['countdown', 'playing', 'paused', 'waiting'].includes(phase);
  const playing = inMatch && Boolean(mySide);

  // Lobby
  show('lobby', phase === 'lobby');
  if (phase === 'lobby') {
    $('you-are').textContent = `You are Player ${slot}`;
    document.querySelectorAll('[data-setting]').forEach((row) => {
      const current = state.settings[row.dataset.setting];
      row.querySelectorAll('button').forEach((b) => b.classList.toggle('selected', b.dataset.value === current));
    });
    $('start').disabled = !state.canStart;
    $('start-hint').textContent = state.canStart ? '' : 'Waiting for a friend to join…';
  }

  // Score + controls
  show('score', inMatch || phase === 'over');
  $('score-left').textContent = state.scores.left;
  $('score-right').textContent = state.scores.right;
  const team = state.settings.mode === 'team';
  $('score-left').style.color = team ? myColor : COLORS[1];
  $('score-right').style.color = team ? COLORS.cpu : COLORS[2];
  const active = playing && (phase === 'countdown' || phase === 'playing');
  if (playing) buildZones(state.controls[slot] || [], state.settings.game);
  show('zones', active);
  show('pause', playing && (phase === 'countdown' || phase === 'playing'));
  show('paused', playing && phase === 'paused');

  // Countdown / waiting / not in this match
  let big = '';
  let small = '';
  if (inMatch && !mySide) small = 'You can join the next game!';
  else if (phase === 'countdown') big = String(state.countdown);
  else if (phase === 'waiting') {
    big = '⏳';
    small = `Waiting for ${state.missing.map((s) => `Player ${s}`).join(' and ')}`;
  }
  show('message', Boolean(big || small));
  $('message-big').textContent = big;
  $('message-small').textContent = small;

  // Game over
  show('over', phase === 'over');
  if (phase === 'over') {
    let text;
    let icon = '🏆';
    if (state.settings.mode === 'team') {
      text = state.winner === 'left' ? 'TEAM WINS!' : 'Computer wins!';
      if (state.winner !== 'left') icon = '🤖';
    } else if (mySide && state.winner === mySide) {
      text = 'YOU WIN!';
    } else {
      text = `Player ${state.winner === 'left' ? 1 : 2} wins!`;
      icon = '👏';
    }
    $('over-icon').textContent = icon;
    $('over-text').textContent = text;
    $('over-text').style.color = icon === '🤖' ? COLORS.cpu : myColor;
    $('again').disabled = !state.canStart;
  }
}

render();
