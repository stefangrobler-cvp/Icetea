// The phone: a controller in the browser, nothing to install.
//
// It joins a room, asks for a nickname and avatar, lets anyone pick a game and
// press START, then shows whatever controller layout the game asks for, built
// only from the controller kit. No game code ever runs on the phone.

import { MSG, ACTIONS } from '/platform/shared/protocol.js';
import { AVATARS, cleanProfile, defaultAvatar, nicknameAllowed } from '/platform/shared/profile.js';
import { Connection, keepScreenOn } from './net.js';
import { PhoneLink } from './direct.js';
import { mountLayout } from './kit/kit.js';

const $ = (id) => document.getElementById(id);
const roomCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase();

// A random tag remembered on this phone, so a reload or a dropped connection gets
// the same seat back, and returning phones can be counted (never linked to a person).
let clientId = localStorage.getItem('fgp.clientId') || localStorage.getItem('neonpong.clientId');
if (!clientId) clientId = (crypto.randomUUID?.() || String(Math.random()).slice(2)) + Date.now();
localStorage.setItem('fgp.clientId', clientId);

let seat = null;
let state = null;
let hostOnline = true;
let problem = roomCode ? null : 'noroom';
let rtt = null; // last measured delay to the big screen and back, in ms

// Nickname and avatar: remembered on this phone; asked once per room.
let profile = null;
try { profile = JSON.parse(localStorage.getItem('fgp.profile') || localStorage.getItem('neonpong.profile')); } catch { /* none yet */ }
let profileConfirmed = sessionStorage.getItem('fgp.profileRoom') === roomCode;
let editingProfile = false;

// ---------- connection ----------

const conn = new Connection({
  onOpen(c) {
    if (roomCode) c.send({ t: MSG.JOIN, room: roomCode, clientId });
  },
  onClose() {
    seat = null;
    link.close();
    render();
  },
  onMessage(msg) {
    switch (msg.t) {
      case MSG.JOINED:
        seat = msg.slot;
        problem = null;
        sendProfile();
        if (!link.open) link.start();
        break;
      case MSG.SIGNAL: link.handleSignal(msg.data); break;
      case MSG.PONG: onPong(msg); break;
      case MSG.BUZZ: buzz(msg.ms); break;
      case MSG.ERROR: problem = msg.reason; break;
      case MSG.HOST_STATUS:
        // The big screen came back (e.g. it was reloaded): set up a fresh direct link.
        if (msg.online && !hostOnline && seat) { link.start(); sendProfile(); }
        hostOnline = msg.online;
        break;
      case MSG.STATE: state = msg; break;
    }
    render();
  },
});

function command(action, extra = {}) {
  conn.send({ t: MSG.COMMAND, action, ...extra });
}

// Direct link to the big screen over Wi-Fi, for controls.
const link = new PhoneLink({
  sendSignal: (data) => conn.send({ t: MSG.SIGNAL, data }),
  onMessage: (msg) => {
    if (msg.t === MSG.PONG) onPong(msg);
    else if (msg.t === MSG.BUZZ) buzz(msg.ms);
  },
});

// Measure the delay to the big screen once a second (shown there, and measured).
function onPong(msg) {
  rtt = Math.round(performance.now() - msg.ts);
}
setInterval(() => {
  if (!seat) return;
  const ping = JSON.stringify({ t: MSG.PING, ts: performance.now(), rtt, direct: link.open });
  if (!link.send(ping)) conn.send(ping);
}, 1000);

// ---------- controls (the controller kit sends through here) ----------

let counter = 0;
const kitContext = {
  values: {}, // control id -> last value (kept when the layout changes)
  send(id, value, reliable = false) {
    counter += 1;
    const text = JSON.stringify({ t: MSG.INPUT, c: id, v: value, n: counter });
    if (reliable) {
      // Must arrive (e.g. "let go" of the aiming circle): through the server too.
      conn.send(text);
      link.send(text);
    } else if (!link.send(text)) {
      conn.send(text); // straight to the big screen if we can, otherwise through the server
    }
  },
};

// The direct link may drop a message now and then (on purpose, for speed), so
// repeat the current swipe positions a few times a second.
setInterval(() => {
  if (!link.open || !layout) return;
  for (const spec of layout.specs) {
    if (spec.control !== 'swipe') continue;
    counter += 1;
    link.send(JSON.stringify({ t: MSG.INPUT, c: spec.id, v: kitContext.values[spec.id] ?? 0.5, n: counter }));
  }
}, 150);

let layout = null; // { key, specs, view }
function showLayout(matchId, id, params, specs) {
  const key = `${matchId}:${id}`;
  if (layout?.key === key) {
    if (JSON.stringify(params) !== layout.params) {
      layout.params = JSON.stringify(params);
      layout.view.update(params);
    }
    return;
  }
  if (layout && !layout.key.startsWith(`${matchId}:`)) kitContext.values = {}; // new match: start in the middle
  layout?.view.destroy();
  layout = { key, specs, params: JSON.stringify(params), view: mountLayout($('controller'), specs, params, kitContext) };
}
function hideLayout() {
  layout?.view.destroy();
  layout = null;
}

// Vibrate where the phone allows it; otherwise flash the controls.
function buzz(ms) {
  if (navigator.vibrate && navigator.vibrate(ms)) return;
  layout?.view.flash();
}

// ---------- buttons ----------

$('start').addEventListener('click', () => { keepScreenOn(); command(ACTIONS.START); });
$('pause').addEventListener('click', () => command(ACTIONS.PAUSE));
$('resume').addEventListener('click', () => command(ACTIONS.RESUME));
$('again').addEventListener('click', () => { keepScreenOn(); command(ACTIONS.PLAY_AGAIN); });
$('change').addEventListener('click', () => command(ACTIONS.CHANGE_GAME));

// Game, mode and option buttons are made from what the big screen sends; one handler for all.
document.body.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-pick]');
  if (!btn) return;
  const { pick, value, option } = btn.dataset;
  if (pick === 'game') command(ACTIONS.SETTINGS, { game: value });
  else if (pick === 'mode') command(ACTIONS.SETTINGS, { mode: value });
  else if (pick === 'option') command(ACTIONS.SETTINGS, { options: { [option]: value } });
});

// "Games" (leave the match) needs two taps, so a stray tap doesn't end it.
{
  const btn = $('menu');
  const text = btn.textContent;
  let timer = null;
  const reset = () => { clearTimeout(timer); timer = null; btn.textContent = text; btn.classList.remove('confirm'); };
  btn.addEventListener('click', () => {
    if (timer) { reset(); command(ACTIONS.MENU); return; }
    btn.textContent = 'Tap again to leave';
    btn.classList.add('confirm');
    timer = setTimeout(reset, 3000);
  });
}

// Screen locked or switched app: tell the big screen straight away so it pauses,
// then reconnect as soon as the phone is back.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { link.close(); conn.closeQuietly(); } else conn.reconnectNow();
});
window.addEventListener('pageshow', (e) => { if (e.persisted) conn.reconnectNow(); });

// ---------- who are you? ----------

function sendProfile() {
  if (profileConfirmed && profile && seat) command(ACTIONS.PROFILE, profile);
}

let pickedAvatar = null;
function openProfile() {
  editingProfile = true;
  $('name').value = profile?.name || '';
  $('name-hint').classList.add('hidden');
  pickedAvatar = profile?.avatar || defaultAvatar(seat || 1);
  const grid = $('avatars');
  if (!grid.children.length) {
    for (const a of AVATARS) {
      const b = document.createElement('button');
      b.textContent = a;
      b.dataset.avatar = a;
      b.addEventListener('click', () => { pickedAvatar = a; markAvatar(); });
      grid.appendChild(b);
    }
  }
  markAvatar();
}

function markAvatar() {
  for (const b of $('avatars').children) b.classList.toggle('selected', b.dataset.avatar === pickedAvatar);
}

$('profile-done').addEventListener('click', () => {
  const typed = $('name').value.trim();
  if (!nicknameAllowed(typed)) {
    $('name-hint').classList.remove('hidden');
    return;
  }
  const tidy = cleanProfile({ name: typed, avatar: pickedAvatar }, seat || 1);
  // An empty nickname stays empty, so it shows as "Player 1" or "Player 2" for whichever seat we get.
  profile = { name: typed ? tidy.name : '', avatar: tidy.avatar };
  localStorage.setItem('fgp.profile', JSON.stringify(profile));
  sessionStorage.setItem('fgp.profileRoom', roomCode);
  profileConfirmed = true;
  editingProfile = false;
  $('name').blur();
  sendProfile();
  render();
});
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('name').blur(); });
$('badge').addEventListener('click', () => { if (state?.phase === 'lobby' && seat) { openProfile(); render(); } });

// ---------- drawing the screen ----------

const show = (id, on) => $(id).classList.toggle('hidden', !on);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const button = (pick, value, icon, text, selected, extra = '') =>
  `<button data-pick="${pick}" data-value="${value}" ${extra} class="${selected ? 'selected' : ''}"><span class="icon">${icon}</span>${esc(text)}</button>`;
const nameOf = (s) => (state?.players?.[s] ? `${state.players[s].avatar} ${state.players[s].name}` : `Player ${s}`);
const SCREENS = ['status', 'profile', 'lobby', 'paused', 'results', 'controller', 'score', 'pause', 'note'];

let lastLobby = '';
function render() {
  const me = state?.players?.[seat];
  document.body.style.setProperty('--me', me?.color || '#ffffff');
  $('badge').textContent = seat ? (profile?.avatar || defaultAvatar(seat)) : '…';

  // Problems first
  let status = null;
  if (problem === 'noroom') status = 'Scan the code on the big screen again';
  else if (problem === 'full') status = 'This game is full (4 players)';
  else if (!conn.open || !seat) status = 'Connecting…';
  else if (!hostOnline) status = 'Waiting for the big screen…';
  else if (!state) status = 'Connecting…';
  if (status) {
    SCREENS.forEach((id) => show(id, id === 'status'));
    $('status-text').textContent = status;
    hideLayout();
    return;
  }

  // First time in this room: who are you? (also when tapping your avatar in the lobby)
  if (!profileConfirmed && !editingProfile) openProfile();
  if (editingProfile) {
    SCREENS.forEach((id) => show(id, id === 'profile'));
    hideLayout();
    return;
  }
  show('status', false);
  show('profile', false);

  const phase = state.phase;
  const match = state.match;
  const inMatch = Boolean(match?.seats?.includes(seat));

  // Lobby: the game list, modes and options, all from the games' manifests.
  show('lobby', phase === 'lobby');
  if (phase === 'lobby') {
    $('you-are').textContent = profile?.name ? `Hi ${profile.name}!` : `You are Player ${seat}`;
    const key = JSON.stringify([state.catalogue, state.selection]);
    if (key !== lastLobby) {
      lastLobby = key;
      const sel = state.selection;
      const game = state.catalogue?.find((g) => g.id === sel.game);
      $('lobby-settings').innerHTML = `
        <div class="row game-cards">${(state.catalogue || []).map((g) => button('game', g.id, g.icon, g.name, g.id === sel.game)).join('')}</div>
        <div class="row">${(game?.modes || []).map((m) => button('mode', m.id, m.icon, m.label, m.id === sel.mode)).join('')}</div>
        ${(game?.options || []).map((o) => `<div class="row">${o.choices.map((c) => button('option', c.id, c.icon, c.label, sel.options[o.id] === c.id, `data-option="${o.id}"`)).join('')}</div>`).join('')}`;
    }
    $('start').disabled = !state.canStart;
    $('start-hint').textContent = state.canStart ? '' : state.need > 1 ? 'Waiting for a friend to join…' : '';
  }

  // During a match: score, pause, and the game's controller layout.
  const held = state.held;
  const waiting = held?.missing?.length > 0;
  const playing = phase === 'match' && inMatch && !held?.paused && !waiting;
  show('score', (phase === 'match' || phase === 'results') && Boolean(match));
  if (match) {
    $('score').innerHTML = match.sideOrder.map((side) => `<span class="neon" style="color:${match.sideColors[side]}">${match.scores?.[side] ?? 0}</span>`).join('<span>:</span>');
  }
  show('pause', playing);
  const myLayout = inMatch && phase === 'match' ? match.layouts?.[seat] : null;
  if (myLayout && match.layoutSpecs[myLayout.id] && !held?.paused) {
    showLayout(state.matchId, myLayout.id, myLayout.params, match.layoutSpecs[myLayout.id]);
    show('controller', true);
  } else {
    hideLayout();
    show('controller', false);
  }

  // Paused: resume, options that can change mid-game, back to the games.
  show('paused', phase === 'match' && inMatch && held?.paused && !waiting);
  if (held?.paused) {
    $('pause-settings').innerHTML = (match.pauseOptions || []).map((o) => `<div class="row">${
      o.choices.map((c) => button('option', c.id, c.icon, c.label, match.options[o.id] === c.id, `data-option="${o.id}"`)).join('')}</div>`).join('');
  }

  // A short message: from the game, or the platform (waiting, not in this match).
  let note = null;
  if (phase === 'match' && !inMatch) note = { icon: '👀', text: 'You can join the next game!' };
  else if (waiting) note = { icon: '⏳', text: `Waiting for ${held.missing.map(nameOf).join(' and ')}` };
  else if (playing) note = seat in (match.messages || {}) ? match.messages[seat] : match.messages?.all;
  show('note', Boolean(note));
  if (note) {
    $('note').querySelector('.icon').textContent = note.icon || '';
    $('note').querySelector('.text').textContent = note.text || '';
  }

  // Results: the winner's avatar with a crown.
  show('results', phase === 'results');
  const r = state.results;
  if (phase === 'results' && r) {
    let icon;
    let text;
    if (r.winner == null) { icon = '🤝'; text = 'Draw!'; }
    else if (r.computerWon) { icon = '🤖'; text = 'Computer wins!'; }
    else if (r.team) { icon = r.winners.map((s) => state.players[s]?.avatar).join(''); text = 'TEAM WINS!'; }
    else if (r.winners.includes(seat)) { icon = state.players[seat]?.avatar; text = 'YOU WIN!'; }
    else { icon = state.players[r.winners[0]]?.avatar; text = `${state.players[r.winners[0]]?.name} wins!`; }
    $('over-icon').textContent = icon || '🏆';
    $('over-text').textContent = text;
    $('over-text').style.color = r.computerWon ? '#ffe600' : state.players[r.winners[0]]?.color || '#ffffff';
    $('again').disabled = !state.canStart;
  }
}

render();
