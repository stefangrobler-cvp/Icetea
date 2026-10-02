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
let paddle = 0.5; // 0 = top, 1 = bottom
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
        sendPaddle(true);
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
          paddle = 0.5; // new match: paddles start in the middle
          sendPaddle(true);
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

let lastSentY = null;
let seq = 0;
function sendPaddle(force = false) {
  const y = Math.round(paddle * 1000) / 1000;
  if (!force && y === lastSentY) return;
  lastSentY = y;
  seq += 1;
  const msg = `{"t":"in","y":${y},"n":${seq}}`;
  // Straight to the tablet if we can, otherwise through the server.
  if (!link.send(msg)) conn.send(msg);
  // Move the little paddle on the phone too, so kids can feel it working.
  const preview = document.querySelector('.paddle-preview');
  preview.style.transform = `translateY(${(paddle - 0.5) * window.innerHeight * 0.35}px)`;
}

// The direct link may drop a message now and then (on purpose, for speed),
// so repeat the current position a few times a second.
setInterval(() => { if (link.open) link.send(`{"t":"in","y":${lastSentY ?? 0.5},"n":${++seq}}`); }, 150);

const swipe = $('swipe');
const lastTouchY = new Map();
swipe.addEventListener('touchstart', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) lastTouchY.set(t.identifier, t.clientY);
  swipe.classList.add('touching');
}, { passive: false });

swipe.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const prev = lastTouchY.get(t.identifier);
    if (prev === undefined) continue;
    lastTouchY.set(t.identifier, t.clientY);
    // Swiping about 70% of the screen height moves the paddle the full court.
    paddle += (t.clientY - prev) / (window.innerHeight * 0.7);
  }
  paddle = Math.max(0, Math.min(1, paddle));
  sendPaddle();
}, { passive: false });

const endTouch = (e) => {
  for (const t of e.changedTouches) lastTouchY.delete(t.identifier);
  if (lastTouchY.size === 0) swipe.classList.remove('touching');
};
swipe.addEventListener('touchend', endTouch);
swipe.addEventListener('touchcancel', endTouch);

// Mouse support, handy for testing on a computer.
let mouseY = null;
swipe.addEventListener('mousedown', (e) => { mouseY = e.clientY; });
window.addEventListener('mouseup', () => { mouseY = null; });
window.addEventListener('mousemove', (e) => {
  if (mouseY === null) return;
  paddle = Math.max(0, Math.min(1, paddle + (e.clientY - mouseY) / (window.innerHeight * 0.7)));
  mouseY = e.clientY;
  sendPaddle();
});

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
    ['lobby', 'message', 'paused', 'over', 'swipe', 'score', 'pause'].forEach((id) => show(id, false));
    return;
  }

  const phase = state.phase;
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
  show('swipe', playing && (phase === 'countdown' || phase === 'playing'));
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
