// The game screen (tablet). Runs the engine, draws it, plays sounds, and keeps
// the phones up to date. All the rules live in /shared/engine.js.

import { Engine, PHASE } from '/shared/engine.js';
import { MODES, COLORS } from '/shared/config.js';
import { MSG, ACTIONS } from '/shared/protocol.js';
import { cleanProfile, playerLabel } from '/shared/profile.js';
import { Connection, keepScreenOn } from './net.js';
import { HostLinks } from './direct.js';
import { Renderer } from './renderer.js';
import { unlock, sounds } from './sound.js';

const $ = (id) => document.getElementById(id);

const engine = new Engine();
const renderer = new Renderer($('court'));
window.neonPong = { engine }; // handy for testing from the browser console
const players = { 1: false, 2: false }; // which phones are connected
const lastSeq = {}; // newest paddle message seen from each phone, per rod ("slot:lane")
const lag = { 1: null, 2: null }; // { rtt, direct } as reported by each phone
const profiles = { 1: cleanProfile(null, 1), 2: cleanProfile(null, 2) }; // names and avatars
const label = (slot) => playerLabel(profiles, slot); // "🦊 Mia"
renderer.profiles = profiles; // the coin toss shows the avatars
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
        paddleInput(msg.s, msg);
        break;
      case MSG.SIGNAL:
        links.handleSignal(msg.slot, msg.data);
        break;
      case MSG.PING:
        handlePing(msg.slot, msg, (reply) => conn.send({ t: MSG.SEND_TO, slot: msg.slot, msg: reply }));
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

// Direct Wi-Fi links to the phones (see direct.js).
const links = new HostLinks({
  sendSignal: (slot, data) => conn.send({ t: MSG.SEND_TO, slot, msg: { t: MSG.SIGNAL, data } }),
  onMessage: (slot, msg, reply) => {
    if (msg.t === MSG.INPUT) paddleInput(slot, msg);
    else if (msg.t === MSG.PING) handlePing(slot, msg, reply);
  },
});

// Paddle positions can arrive by two routes, so ignore any older than the newest.
function paddleInput(slot, msg) {
  const lane = Number(msg.l) || 0;
  const key = `${slot}:${lane}`;
  if (!(msg.n > (lastSeq[key] || 0))) return;
  lastSeq[key] = msg.n;
  engine.setPaddle(slot, msg.y, lane);
}

function handlePing(slot, msg, reply) {
  reply({ t: MSG.PONG, ts: msg.ts });
  lag[slot] = msg.rtt == null ? null : { rtt: msg.rtt, direct: Boolean(msg.direct) };
}

function setPlayer(slot, connected) {
  if (connected && !players[slot]) { lastSeq[`${slot}:0`] = 0; lastSeq[`${slot}:1`] = 0; } // phone (re)joined: it may count from 1 again
  if (!connected) { links.close(slot); lag[slot] = null; }
  players[slot] = Boolean(connected);
  engine.setPlayerConnected(slot, players[slot]);
  // A kid who joins during a team-v-computer match joins the team straight away.
  if (connected && engine.inMatch && !engine.isInMatch(slot)) engine.addPlayer(slot);
}

const connectedSlots = () => [1, 2].filter((s) => players[s]);

// ---------- actions (from the tablet's own buttons or from a phone) ----------

let pendingEvents = []; // events from phone actions (e.g. a kick), played on the next frame

function handleAction(action, data = {}) {
  switch (action) {
    case ACTIONS.PROFILE:
      if (data.slot === 1 || data.slot === 2) profiles[data.slot] = cleanProfile(data, data.slot);
      break;
    case ACTIONS.AIM:
      engine.aimKickoff(data.slot, Number(data.angle));
      return; // nothing on screen changes apart from the arrow
    case ACTIONS.KICK:
      engine.kick(data.slot, Number(data.angle), pendingEvents);
      break;
    case ACTIONS.MENU:
      // Leave the match: only from the pause / waiting screen or after a match.
      if ([PHASE.PAUSED, PHASE.WAITING, PHASE.OVER].includes(engine.state.phase)) engine.backToLobby();
      break;
    case ACTIONS.SETTINGS:
      engine.setSettings({ game: data.game, mode: data.mode, difficulty: data.difficulty });
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
confirmTap($('menu'), 'Tap again to leave the game', () => handleAction(ACTIONS.MENU));

/** A button that needs two taps (so a stray tap doesn't end the match). */
function confirmTap(btn, askText, action) {
  const label = btn.textContent;
  let timer = null;
  const reset = () => { clearTimeout(timer); timer = null; btn.textContent = label; btn.classList.remove('confirm'); };
  btn.addEventListener('click', () => {
    if (timer) { reset(); action(); return; }
    btn.textContent = askText;
    btn.classList.add('confirm');
    timer = setTimeout(reset, 3000);
  });
}

/** "Player 1", "Team", "Computer"... */
function sideName(side) {
  if (engine.state.settings.mode === 'team') return side === 'left' ? 'Team' : 'Computer';
  return label(side === 'left' ? 1 : 2);
}

function sideColor(side) {
  return engine.state.paddles.find((p) => p.side === side)?.color || COLORS.ball;
}

// ---------- what the phones need to know ----------

function phoneState() {
  const s = engine.summary();
  const mode = MODES[s.settings.mode];
  return {
    t: MSG.STATE,
    ...s,
    players: { ...players },
    profiles: { ...profiles },
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
  const celebrating = Boolean(renderer.banner); // "GOAL!" is on screen
  const k = s.kickoff;
  const view = JSON.stringify([started, s.phase, s.settings, players, lag, profiles, s.missing, s.winner, celebrating,
    s.phase === PHASE.TOSS && s.toss.timeLeft < 0.6, k && [k.side, k.slot, k.wait > 0],
    s.phase === PHASE.COUNTDOWN ? Math.ceil(s.countdown) : 0]);
  if (view === lastView) return;
  lastView = view;
  document.body.dataset.game = s.settings.game;

  $('tap').classList.toggle('hidden', started);
  $('lobby').classList.toggle('hidden', !started || s.phase !== PHASE.LOBBY);
  $('winner').classList.toggle('hidden', !started || s.phase !== PHASE.OVER);
  $('pause').classList.toggle('hidden', !started || !engine.inMatch || s.phase === PHASE.PAUSED || s.phase === PHASE.WAITING);
  if (!started) return;

  // Lobby
  for (const slot of [1, 2]) {
    const chip = $(`chip-${slot}`);
    chip.classList.toggle('on', players[slot]);
    chip.querySelector('.chip-name').textContent = players[slot] ? label(slot) : `P${slot}`;
    chip.querySelector('small').textContent = players[slot] ? `Ready! ${lagText(slot)}` : 'Waiting…';
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
  $('pause-menu').classList.add('hidden');
  $('menu').classList.add('hidden');
  msg.classList.remove('dim');
  const hint = $('hint');
  hint.classList.add('hidden');
  const soccer = s.settings.game === 'soccer';
  if (s.phase === PHASE.TOSS) {
    hint.classList.remove('hidden');
    const landed = s.toss.timeLeft < 0.6;
    hint.textContent = landed
      ? `${sideName(s.toss.winner)} ${soccer ? 'kicks off' : 'serves first'}!`
      : '🪙 Coin toss…';
    hint.style.color = landed ? sideColor(s.toss.winner) : COLORS.ball;
  } else if (s.phase === PHASE.KICKOFF && !celebrating) {
    hint.classList.remove('hidden');
    hint.style.color = k.slot ? COLORS[k.slot] : COLORS.cpu;
    hint.textContent = k.slot === null ? '🤖 Computer kicks off…'
      : k.wait > 0 ? `${label(k.slot)} kicks off`
        : `${label(k.slot)}: aim on your phone and let go! ⚽`;
  }
  if (s.phase === PHASE.COUNTDOWN && !celebrating) {
    msg.classList.remove('hidden');
    $('message-big').textContent = Math.ceil(s.countdown);
    $('message-big').style.color = COLORS.ball;
    $('message-small').textContent = '';
  } else if (s.phase === PHASE.PAUSED) {
    msg.classList.remove('hidden');
    msg.classList.add('dim');
    $('message-big').textContent = 'PAUSED';
    $('message-big').style.color = COLORS.cpu;
    $('message-small').textContent = '';
    $('pause-menu').classList.remove('hidden');
    $('menu').classList.remove('hidden');
  } else if (s.phase === PHASE.WAITING) {
    msg.classList.remove('hidden');
    msg.classList.add('dim');
    const who = s.missing.map((slot) => label(slot)).join(' and ');
    $('message-big').textContent = 'WAITING';
    $('message-big').style.color = COLORS[s.missing[0]] || COLORS.cpu;
    $('message-small').textContent = `Waiting for ${who}…`;
    $('message-qr').classList.remove('hidden');
    $('menu').classList.remove('hidden');
  }

  // Winner
  if (s.phase === PHASE.OVER) {
    const team = s.settings.mode === 'team';
    const kids = [...new Set(s.paddles.filter((p) => p.slot).map((p) => p.slot))];
    const text = team
      ? (s.winner === 'left' ? `${kids.map((k) => profiles[k].avatar).join('')} TEAM WINS!` : '🤖 COMPUTER WINS!')
      : `${label(s.winner === 'left' ? 1 : 2)} wins!`;
    $('winner-text').textContent = text;
    $('winner-text').style.color = team
      ? (s.winner === 'left' ? COLORS[1] : COLORS.cpu)
      : COLORS[s.winner === 'left' ? 1 : 2];
  }
}

// e.g. "⚡ 14ms" (direct over Wi-Fi) or "🌐 160ms" (through the internet server)
function lagText(slot) {
  const l = lag[slot];
  return l ? `${l.direct ? '⚡' : '🌐'} ${l.rtt}ms` : '';
}

// Small connection readout in the corner, to check how quick the controls are.
let fps = 0;
let frames = 0;
let fpsTime = performance.now();
function updateStats(now) {
  frames += 1;
  if (now - fpsTime >= 1000) {
    fps = Math.round((frames * 1000) / (now - fpsTime));
    frames = 0;
    fpsTime = now;
    const parts = [1, 2].filter((slot) => players[slot]).map((slot) => `P${slot} ${lagText(slot)}`);
    $('stats').textContent = `${parts.join('   ')}   ${fps}fps`;
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
  const soccer = engine.state.settings.game === 'soccer';
  if (pendingEvents.length) { events = [...pendingEvents, ...events]; pendingEvents = []; }
  renderer.handleEvents(events, engine.state);
  for (const ev of events) {
    if (ev.type === 'hit') (soccer ? sounds.kick : sounds.paddle)(ev.power);
    else if (ev.type === 'wall') (soccer ? sounds.thud : sounds.wall)();
    else if (ev.type === 'post') sounds.post();
    else if (ev.type === 'toss') sounds.go();
    else if (ev.type === 'kickoff') { sounds.whistle(); sounds.kick(0.6); }
    else if (ev.type === 'countdown') sounds.tick();
    else if (ev.type === 'serve') (soccer ? sounds.whistle : sounds.go)();
    else if (ev.type === 'point') {
      if (soccer) sounds.whistle(); else sounds.point();
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
  updateStats(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// The tablet went to sleep or switched apps: pause so nobody loses a point.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') engine.pause();
  else conn.reconnectNow();
});
