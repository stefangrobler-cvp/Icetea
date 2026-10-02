// The game screen (tablet). Runs the engine, draws it, plays sounds, and keeps
// the phones up to date. All the rules live in /shared/engine.js.

import { Engine, PHASE } from '/shared/engine.js';
import { MODES, COLORS } from '/shared/config.js';
import { MSG, ACTIONS } from '/shared/protocol.js';
import { Connection, keepScreenOn } from './net.js';
import { Renderer } from './renderer.js';
import { unlock, sounds } from './sound.js';

const $ = (id) => document.getElementById(id);

const engine = new Engine();
const renderer = new Renderer($('court'));
const players = { 1: false, 2: false }; // which phones are connected
let room = null;
let started = false; // has someone tapped "Tap to start"?

// ---------- connection to the server ----------

const conn = new Connection({
  onOpen(c) {
    $('offline').classList.add('hidden');
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('neonpong.room')); } catch { /* ignore */ }
    c.send({ t: MSG.HOST, room: saved?.room, token: saved?.token });
  },
  onClose() {
    $('offline').classList.remove('hidden');
    // We can't hear the phones right now, so hold the game.
    for (const slot of [1, 2]) setPlayer(slot, false);
  },
  onMessage(msg) {
    switch (msg.t) {
      case MSG.INPUT:
        engine.setPaddle(msg.s, msg.y);
        break;
      case MSG.ROOM:
        room = msg.room;
        sessionStorage.setItem('neonpong.room', JSON.stringify({ room: msg.room, token: msg.token }));
        $('room-code').textContent = room;
        $('qr').src = $('message-qr').src = `/qr.svg?room=${room}`;
        for (const slot of [1, 2]) setPlayer(slot, msg.players[slot]);
        break;
      case MSG.PLAYER:
        setPlayer(msg.slot, msg.connected);
        break;
      case MSG.COMMAND:
        handleAction(msg.action, msg);
        break;
    }
  },
});

function setPlayer(slot, connected) {
  players[slot] = Boolean(connected);
  engine.setPlayerConnected(slot, players[slot]);
}

const connectedSlots = () => [1, 2].filter((s) => players[s]);

// ---------- actions (from the tablet's own buttons or from a phone) ----------

function handleAction(action, data = {}) {
  switch (action) {
    case ACTIONS.SETTINGS:
      engine.setSettings({ mode: data.mode, difficulty: data.difficulty });
      break;
    case ACTIONS.START:
    case ACTIONS.PLAY_AGAIN:
      if (!engine.inMatch && engine.canStart(connectedSlots())) engine.startMatch(connectedSlots());
      break;
    case ACTIONS.PAUSE:
      engine.pause();
      break;
    case ACTIONS.RESUME:
      engine.resume();
      break;
    case ACTIONS.CHANGE_SETTINGS:
      if (!engine.inMatch) engine.backToLobby();
      break;
  }
  updateScreen();
}

// ---------- tablet buttons ----------

$('tap').addEventListener('click', () => {
  unlock();
  keepScreenOn();
  started = true;
  updateScreen();
});

document.querySelectorAll('[data-setting] button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.parentElement.dataset.setting;
    handleAction(ACTIONS.SETTINGS, { [key]: btn.dataset.value });
  });
});
$('start').addEventListener('click', () => handleAction(ACTIONS.START));
$('again').addEventListener('click', () => handleAction(ACTIONS.PLAY_AGAIN));
$('change').addEventListener('click', () => handleAction(ACTIONS.CHANGE_SETTINGS));
$('pause').addEventListener('click', () => handleAction(ACTIONS.PAUSE));
$('resume').addEventListener('click', () => handleAction(ACTIONS.RESUME));

// ---------- what the phones need to know ----------

function phoneState() {
  const s = engine.summary();
  const mode = MODES[s.settings.mode];
  return {
    t: MSG.STATE,
    ...s,
    players: { ...players },
    canStart: engine.canStart(connectedSlots()),
    needPlayers: mode.humans,
  };
}

let lastSent = '';
function syncPhones() {
  const state = phoneState();
  const text = JSON.stringify(state);
  if (text === lastSent) return;
  lastSent = text;
  conn.send({ t: MSG.BROADCAST, msg: state });
}

// ---------- screens ----------

let lastView = '';
function updateScreen() {
  const s = engine.state;
  const view = JSON.stringify([started, s.phase, s.settings, players, s.missing, s.winner,
    s.phase === PHASE.COUNTDOWN ? Math.ceil(s.countdown) : 0]);
  if (view === lastView) return;
  lastView = view;

  $('tap').classList.toggle('hidden', started);
  $('lobby').classList.toggle('hidden', !started || s.phase !== PHASE.LOBBY);
  $('winner').classList.toggle('hidden', !started || s.phase !== PHASE.OVER);
  $('pause').classList.toggle('hidden', !started || !engine.inMatch || s.phase === PHASE.PAUSED || s.phase === PHASE.WAITING);
  if (!started) return;

  // Lobby
  for (const slot of [1, 2]) {
    const chip = $(`chip-${slot}`);
    chip.classList.toggle('on', players[slot]);
    chip.querySelector('small').textContent = players[slot] ? 'Ready!' : 'Waiting…';
  }
  document.querySelectorAll('[data-setting]').forEach((row) => {
    const current = s.settings[row.dataset.setting];
    row.querySelectorAll('button').forEach((b) => b.classList.toggle('selected', b.dataset.value === current));
  });
  const canStart = engine.canStart(connectedSlots());
  $('start').disabled = !canStart;
  const need = MODES[s.settings.mode].humans;
  $('start-hint').textContent = canStart ? 'Press START here or on a phone'
    : need === 2 ? '1 v 1 needs two phones' : 'Scan the code with a phone to join';

  // Countdown / paused / waiting
  const msg = $('message');
  msg.classList.add('hidden');
  $('message-qr').classList.add('hidden');
  $('resume').classList.add('hidden');
  msg.classList.remove('dim');
  if (s.phase === PHASE.COUNTDOWN) {
    msg.classList.remove('hidden');
    $('message-big').textContent = Math.ceil(s.countdown);
    $('message-big').style.color = COLORS.ball;
    $('message-small').textContent = '';
  } else if (s.phase === PHASE.PAUSED) {
    msg.classList.remove('hidden');
    msg.classList.add('dim');
    $('message-big').textContent = 'PAUSED';
    $('message-big').style.color = COLORS.cpu;
    $('message-small').textContent = 'Press ▶ on a phone to play';
    $('resume').classList.remove('hidden');
  } else if (s.phase === PHASE.WAITING) {
    msg.classList.remove('hidden');
    msg.classList.add('dim');
    const who = s.missing.map((slot) => `Player ${slot}`).join(' and ');
    $('message-big').textContent = 'WAITING';
    $('message-big').style.color = COLORS[s.missing[0]] || COLORS.cpu;
    $('message-small').textContent = `Waiting for ${who}…`;
    $('message-qr').classList.remove('hidden');
  }

  // Winner
  if (s.phase === PHASE.OVER) {
    const team = s.settings.mode === 'team';
    const text = team
      ? (s.winner === 'left' ? 'TEAM WINS!' : 'COMPUTER WINS!')
      : `PLAYER ${s.winner === 'left' ? 1 : 2} WINS!`;
    $('winner-text').textContent = text;
    $('winner-text').style.color = team
      ? (s.winner === 'left' ? COLORS[1] : COLORS.cpu)
      : COLORS[s.winner === 'left' ? 1 : 2];
  }
}

function confetti() {
  const colors = [COLORS[1], COLORS[2], COLORS.cpu, '#39ff7a'];
  for (let i = 0; i < 80; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colors[i % colors.length];
    c.style.boxShadow = `0 0 10px ${colors[i % colors.length]}`;
    c.style.animationDuration = `${2 + Math.random() * 2.5}s`;
    c.style.animationDelay = `${Math.random() * 1.2}s`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 6000);
  }
}

// ---------- main loop ----------

function playEvents(events) {
  for (const ev of events) {
    if (ev.type === 'hit') sounds.paddle();
    else if (ev.type === 'wall') sounds.wall();
    else if (ev.type === 'countdown') sounds.tick();
    else if (ev.type === 'serve') sounds.go();
    else if (ev.type === 'point') {
      sounds.point();
      renderer.pointScored();
      if (!events.some((e) => e.type === 'win')) setTimeout(sounds.cheer, 250);
    } else if (ev.type === 'win') {
      setTimeout(sounds.win, 300);
      confetti();
    }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (started) playEvents(engine.step(dt));
  updateScreen();
  syncPhones();
  renderer.draw(engine.state, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// The tablet went to sleep or switched apps: pause so nobody loses a point.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') engine.pause();
  else conn.reconnectNow();
});
