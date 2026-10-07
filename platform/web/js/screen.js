// The big screen: the platform shell around the games.
//
// It opens a room, shows the QR code and room code, lets people pick a game,
// starts the game through the plug-in contract, pauses it (pause button or a
// phone dropping out), shows the results and rematch, and keeps every phone up
// to date. It never looks inside a game: it only uses the contract.

import { MSG, ACTIONS, MAX_PLAYERS } from '/platform/shared/protocol.js';
import { cleanProfile, playerLabel } from '/platform/shared/profile.js';
import { DEFAULT_THEME } from '/platform/shared/theme.js';
import { CONTRACT_VERSION, EVENTS, validateGameObject, assignSides } from '/platform/contract/contract.js';
import { Connection, keepScreenOn } from './net.js';
import { HostLinks } from './direct.js';
import { unlock, gameAudio, fanfare, isMuted, setMuted } from './audio.js';
import { startDemo } from './demo.js';
import { pix, pixRow, pixelURL } from './pixels.js';
import { avatarArt, artFor } from '/platform/shared/pixels.js';

const $ = (id) => document.getElementById(id);
const theme = DEFAULT_THEME;
const SEATS = Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1);
// The connection readout (delay, frames per second) is for testing: add ?debug to the address.
const DEBUG = new URLSearchParams(location.search).has('debug');

// ---------- a phone opened the main address: offer to join instead ----------

const looksLikePhone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 500;
const forcedScreen = new URLSearchParams(location.search).has('screen');
if (looksLikePhone && !forcedScreen) {
  $('tap').classList.add('hidden');
  $('mute').classList.add('hidden');
  $('phone-landing').classList.remove('hidden');
  const go = () => {
    const code = $('code').value.toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length === 4) location.href = `/play?room=${code}`;
  };
  $('code-go').addEventListener('click', go);
  $('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  $('use-as-screen').addEventListener('click', () => { location.href = '/?screen=1'; });
} else {
  startScreen();
}

// Pixel icons on the page's fixed buttons and cards (marked data-icon / data-pix in the HTML).
function decorate() {
  for (const el of document.querySelectorAll('[data-icon]')) el.insertAdjacentHTML('afterbegin', pix(el.dataset.icon));
  for (const el of document.querySelectorAll('[data-pix]')) el.innerHTML = pixRow(el.dataset.pix);
}

// The night meadow behind the menus: neon block flowers that twinkle.
function meadow(canvas) {
  const ctx = canvas.getContext('2d');
  const colors = ['#00f0ff', '#ff2bd6', '#39ff7a', '#ff9f1c', '#7d8cff'];
  const flowers = Array.from({ length: 70 }, (_, i) => ({
    x: (i * 0.618034) % 1, y: (i * 0.4142 + 0.13 * (i % 3)) % 1, c: colors[i % 5], s: 0.6 + ((i * 7) % 5) / 5, ph: i,
  }));
  return (t) => {
    const w = innerWidth;
    const h = innerHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.fillStyle = '#160934';
    ctx.fillRect(0, 0, w, h);
    const tile = 64;
    ctx.fillStyle = 'rgba(90, 52, 184, 0.10)';
    for (let y = 0; y < h; y += tile) for (let x = ((y / tile) % 2) * (tile / 2); x < w; x += tile) ctx.fillRect(x, y, tile / 2, tile / 2);
    for (const f of flowers) {
      const u = 5 * f.s;
      const x = f.x * w;
      const y = f.y * h;
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t / 900 + f.ph);
      ctx.fillStyle = f.c;
      ctx.fillRect(x, y - u, u, u); ctx.fillRect(x - u, y, u, u); ctx.fillRect(x + u, y, u, u); ctx.fillRect(x, y + u, u, u);
      ctx.fillStyle = '#ffe600';
      ctx.fillRect(x, y, u, u);
    }
    ctx.globalAlpha = 1;
  };
}

// Each game card gets its own dark tint, in catalogue order.
const CARD_TINTS = [['#3b1d85', '#00f0ff'], ['#0f5a3c', '#39ff7a'], ['#163a8a', '#7d8cff'], ['#6a3410', '#ff9f1c'], ['#0b4a5c', '#00f0ff'], ['#5c0f52', '#ff2bd6']];

function startScreen() {
  decorate();
  $('crown-pix').src = pixelURL(artFor('👑'));
  const drawMeadow = meadow($('bg-meadow'));
  // The looping demo on the welcome screen (stops once we're past it).
  let stopDemo = startDemo($('demo'), DEFAULT_THEME);

  // ---------- state ----------

  let catalogue = []; // game manifests from /api/catalogue
  const players = {}; // seat -> { connected, profile }
  for (const seat of SEATS) players[seat] = { connected: false, profile: cleanProfile(null, seat) };
  const lag = {}; // seat -> { rtt, direct }
  const lastSeq = {}; // "seat:control" -> newest input counter seen
  let room = null;

  let started = false; // pressed Start on the welcome screen
  let showHowto = false;
  let seenHowto = false;
  try { seenHowto = localStorage.getItem('fgp.seenHowto') === '1'; } catch { /* private mode */ }

  let selection = { game: null, mode: null, options: {} };
  let modePicked = false; // someone tapped a mode; until then it follows how many phones joined
  let phase = 'lobby'; // lobby | loading | match | results
  let match = null; // the current match (see startMatch)
  let results = null;
  let paused = false; // someone pressed pause
  let held = false; // whether the game has been told it's paused
  let matchCounter = 0;
  let matchesThisVisit = 0;
  let startPressedAt = null;

  // Anonymous tag for this screen: lets measurement tell a returning screen.
  let screenTag = null;
  try {
    screenTag = localStorage.getItem('fgp.screenTag');
    if (!screenTag) {
      screenTag = (crypto.randomUUID?.() || String(Math.random()).slice(2)) + Date.now();
      localStorage.setItem('fgp.screenTag', screenTag);
    }
  } catch { /* private mode */ }

  const byId = (id) => catalogue.find((g) => g.id === id);
  const label = (seat) => playerLabel(Object.fromEntries(SEATS.map((s) => [s, players[s].profile])), seat);
  const connectedSeats = () => SEATS.filter((s) => players[s].connected);
  const selectedGame = () => byId(selection.game);
  const selectedMode = () => selectedGame()?.modes.find((m) => m.id === selection.mode);
  const missingSeats = () => (match ? match.seats.filter((s) => !players[s].connected) : []);
  const metric = (name, data = {}) => conn.send({ t: MSG.METRIC, name, data });

  // ---------- connection to the server ----------

  const conn = new Connection({
    onOpen(c) {
      $('offline').classList.add('hidden');
      let saved = null;
      try { saved = JSON.parse(sessionStorage.getItem('fgp.room')); } catch { /* ignore */ }
      c.send({ t: MSG.HOST, room: saved?.room, token: saved?.token, screenTag });
    },
    onClose() {
      $('offline').classList.remove('hidden');
      // We can't hear the phones right now, so hold the game.
      for (const seat of SEATS) setConnected(seat, false);
    },
    onMessage(msg) {
      switch (msg.t) {
        case MSG.INPUT: onInput(msg.s, msg); break;
        case MSG.SIGNAL: links.handleSignal(msg.slot, msg.data); break;
        case MSG.PING:
          onPing(msg.slot, msg, (reply) => conn.send({ t: MSG.SEND_TO, slot: msg.slot, msg: reply }));
          break;
        case MSG.ROOM:
          room = msg.room;
          sessionStorage.setItem('fgp.room', JSON.stringify({ room: msg.room, token: msg.token }));
          $('room-code').innerHTML = [...room].map((c) => `<span>${c}</span>`).join('');
          $('qr').src = $('held-qr').src = `/qr.svg?room=${room}`;
          for (const seat of SEATS) setConnected(seat, msg.players[seat]);
          break;
        case MSG.PLAYER: setConnected(msg.slot, msg.connected); break;
        case MSG.COMMAND: onAction(msg.action, msg); break;
      }
    },
  });

  // Direct Wi-Fi links to the phones (see direct.js).
  const links = new HostLinks({
    sendSignal: (seat, data) => conn.send({ t: MSG.SEND_TO, slot: seat, msg: { t: MSG.SIGNAL, data } }),
    onMessage: (seat, msg, reply) => {
      if (msg.t === MSG.INPUT) onInput(seat, msg);
      else if (msg.t === MSG.PING) onPing(seat, msg, reply);
    },
  });

  function sendToPhone(seat, msg) {
    if (!links.send(seat, msg)) conn.send({ t: MSG.SEND_TO, slot: seat, msg });
  }

  function setConnected(seat, connected) {
    const p = players[seat];
    if (!p) return;
    const was = p.connected;
    p.connected = Boolean(connected);
    if (p.connected && !was) for (const key of Object.keys(lastSeq)) if (key.startsWith(`${seat}:`)) lastSeq[key] = 0;
    if (!p.connected) { links.close(seat); lag[seat] = null; }
    if (was !== p.connected) fitMode();
    if (match && phase === 'match' && match.seats.includes(seat) && was !== p.connected) {
      if (!p.connected) {
        metric('drop_out', { game: match.manifest.id, seat });
        safely(() => match.game.playerLeft?.(seat));
      } else {
        safely(() => match.game.playerBack?.(seat));
      }
    }
  }

  // Controller kit input. It can arrive by two routes, so ignore any older than the newest.
  function onInput(seat, msg) {
    // One-off events (taps, releases) are counted apart from position updates.
    const key = `${seat}:${msg.c}${msg.e ? ':e' : ''}`;
    if (!(msg.n > (lastSeq[key] || 0))) return;
    lastSeq[key] = msg.n;
    if (match?.game && match.seats.includes(seat)) safely(() => match.game.input(seat, String(msg.c), msg.v));
  }

  // Delay measurement: each phone pings once a second and reports its last result.
  const latencySamples = [];
  function onPing(seat, msg, reply) {
    reply({ t: MSG.PONG, ts: msg.ts });
    lag[seat] = msg.rtt == null ? null : { rtt: msg.rtt, direct: Boolean(msg.direct) };
    if (Number.isFinite(msg.rtt)) latencySamples.push({ rtt: msg.rtt, direct: Boolean(msg.direct) });
  }
  setInterval(() => {
    if (latencySamples.length < 5) return;
    const sorted = latencySamples.map((s) => s.rtt).sort((a, b) => a - b);
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    metric('latency', {
      samples: sorted.length, p50: at(0.5), p95: at(0.95),
      directShare: Math.round((latencySamples.filter((s) => s.direct).length / latencySamples.length) * 100) / 100,
    });
    latencySamples.length = 0;
  }, 30000);

  // ---------- the game list ----------

  fetch('/api/catalogue').then((r) => r.json()).then((list) => {
    catalogue = list;
    if (catalogue.length) chooseGame(catalogue[0].id);
    $('welcome-icons').innerHTML = catalogue.map((g) => pix(g.icon)).join('');
    buildHowtoGames();
    lastView = '';
  });

  function chooseGame(id) {
    const game = byId(id);
    if (!game) return;
    const keep = selection.options;
    selection = { game: id, mode: game.modes[0].id, options: {} };
    modePicked = false;
    fitMode();
    // Keep a choice like difficulty when the next game has the same option.
    for (const opt of game.options || []) {
      selection.options[opt.id] = opt.choices.some((c) => c.id === keep[opt.id]) ? keep[opt.id] : opt.default;
    }
  }

  // Until someone picks a mode, use the first one that works with the phones here,
  // so one phone alone gets "Team v computer" instead of a START that can't be pressed.
  function fitMode() {
    const game = selectedGame();
    if (!game || modePicked || (phase !== 'lobby' && phase !== 'results')) return;
    const count = connectedSeats().length;
    const fits = game.modes.find((m) => count >= m.players.min && count <= m.players.max)
      || game.modes.find((m) => count >= m.players.min);
    selection.mode = (fits || game.modes[0]).id;
  }

  function canStart() {
    const mode = selectedMode();
    return Boolean(mode) && connectedSeats().length >= mode.players.min;
  }

  // ---------- running a game through the contract ----------

  const modules = {};
  async function loadGame(id) {
    if (!modules[id]) modules[id] = import(`/games/${id}/game.js`);
    const mod = await modules[id];
    if (mod.manifest?.contract !== CONTRACT_VERSION || typeof mod.createGame !== 'function') {
      throw new Error(`${id} doesn't follow contract version ${CONTRACT_VERSION}`);
    }
    return mod;
  }

  /** Run game code, but never let a broken game take the platform down. */
  function safely(fn) {
    try {
      return fn();
    } catch (e) {
      console.error('Game error:', e);
      if (match) { stopGame(); phase = 'lobby'; }
      return undefined;
    }
  }

  function stopGame() {
    if (match?.game) {
      const g = match.game;
      match = null;
      try { g.stop(); } catch (e) { console.error(e); }
    }
    match = null;
    $('stage').replaceChildren();
    paused = false;
    held = false;
  }

  async function startMatch(rematch = false) {
    const manifest = selectedGame();
    const mode = selectedMode();
    if (!manifest || !mode || !canStart() || phase === 'loading') return;
    const seats = connectedSeats().slice(0, mode.players.max);
    phase = 'loading';
    stopGame();
    let mod;
    try {
      mod = await loadGame(manifest.id);
    } catch (e) {
      console.error(e);
      phase = 'lobby';
      return;
    }
    const sides = assignSides(mode, seats);
    const list = seats.map((seat) => ({
      seat, nickname: players[seat].profile.name, avatar: players[seat].profile.avatar,
      color: theme.seats[seat], side: sides[seat], boost: players[seat].profile.boost || 0,
      art: avatarArt(players[seat].profile.avatar),
    }));
    const m = {
      id: ++matchCounter, manifest, modeSpec: mode, options: { ...selection.options }, seats, sides,
      scores: {}, layouts: {}, messages: {}, startedAt: performance.now(), game: null,
    };
    match = m;
    const game = mod.createGame(makeHost(m, list));
    const problems = validateGameObject(game);
    if (problems.length) {
      console.error(`${manifest.id}: ${problems.join(', ')}`);
      stopGame();
      phase = 'lobby';
      return;
    }
    m.game = game;
    phase = 'match';
    results = null;
    paused = false;
    held = false;
    safely(() => game.start({ mode: mode.id, options: { ...m.options }, players: list.map((p) => ({ ...p })) }));
    if (rematch) metric('rematch', { game: manifest.id });
    metric('match_started', {
      game: manifest.id, mode: mode.id, difficulty: m.options.difficulty, players: seats.length,
      firstMatch: matchesThisVisit === 0, msSinceStart: startPressedAt ? Math.round(performance.now() - startPressedAt) : undefined,
    });
    matchesThisVisit += 1;
  }

  // Everything a game may use. Calls from a game that has since been stopped are ignored.
  function makeHost(m, list) {
    const live = () => match === m;
    const short = (v, max) => (v == null ? '' : String(v).slice(0, max));
    return {
      stage: $('stage'),
      players: list.map((p) => ({ ...p })),
      theme: { background: theme.background, line: theme.line, ball: theme.ball, text: theme.text, cpu: theme.cpu },
      audio: gameAudio(),
      random: Math.random,
      setLayout(seat, layoutId, params) {
        if (!live()) return;
        if (!m.manifest.layouts[layoutId]) { console.warn(`${m.manifest.id}: no layout "${layoutId}"`); return; }
        m.layouts[seat] = { id: layoutId, params: params ? JSON.parse(JSON.stringify(params)) : null };
      },
      message(target, msg) {
        if (!live()) return;
        const note = msg ? { icon: short(msg.icon, 8), text: short(msg.text, 80) } : null;
        if (target === 'all') m.messages = { all: note };
        else m.messages[target] = note;
      },
      vibrate(seat, ms) {
        if (!live()) return;
        sendToPhone(seat, { t: MSG.BUZZ, ms: Math.max(5, Math.min(200, Number(ms) || 20)) });
      },
      report(event) {
        if (live()) onReport(m, event);
      },
    };
  }

  function onReport(m, ev) {
    switch (ev?.type) {
      case EVENTS.MATCH_STARTED:
        break; // measured in startMatch
      case EVENTS.POINT_SCORED:
        m.scores = { ...ev.scores };
        break;
      case EVENTS.MATCH_ENDED: {
        m.scores = { ...ev.scores };
        const winners = m.seats.filter((s) => m.sides[s] === ev.winner);
        results = {
          game: m.manifest.id,
          winner: ev.winner ?? null,
          winners,
          computerWon: ev.winner != null && ev.winner === m.modeSpec.computer,
          team: Boolean(m.modeSpec.computer),
          scores: m.scores,
          votes: {}, // seat (or 'screen') -> 'up' | 'down'
        };
        phase = 'results';
        fanfare();
        confetti();
        metric('match_ended', {
          game: m.manifest.id, mode: m.modeSpec.id, difficulty: m.options.difficulty, players: m.seats.length,
          durationMs: Math.round(performance.now() - m.startedAt), winner: ev.winner ?? null,
          scores: m.scores, stats: ev.stats, computerWon: results.computerWon,
        });
        break;
      }
      case EVENTS.HIGHLIGHT:
        break; // kept for achievements later
      default:
        console.warn(`${m.manifest.id}: unknown event`, ev);
    }
  }

  // A phone joined (or picked its nickname) during a team-v-computer match: offer them to the game.
  function maybeJoinMatch(seat) {
    if (!match?.game || phase !== 'match' || match.seats.includes(seat)) return;
    const mode = match.modeSpec;
    if (!mode.computer || match.seats.length >= mode.players.max || !match.game.playerJoined) return;
    const side = assignSides(mode, [...match.seats, seat])[seat];
    const player = {
      seat, nickname: players[seat].profile.name, avatar: players[seat].profile.avatar,
      color: theme.seats[seat], side, boost: players[seat].profile.boost || 0,
      art: avatarArt(players[seat].profile.avatar),
    };
    if (safely(() => match.game.playerJoined(player))) {
      match.seats.push(seat);
      match.sides[seat] = side;
    }
  }

  // ---------- actions (from the big screen's own buttons or from a phone) ----------

  function onAction(action, data = {}) {
    switch (action) {
      case ACTIONS.PROFILE:
        if (players[data.slot]) {
          players[data.slot].profile = cleanProfile(data, data.slot);
          maybeJoinMatch(data.slot);
        }
        break;
      case ACTIONS.SETTINGS: changeSettings(data); break;
      case ACTIONS.FEEDBACK: vote(data.slot ?? 'screen', data.vote); break;
      case ACTIONS.START:
        if (phase === 'lobby') startMatch(false);
        break;
      case ACTIONS.PLAY_AGAIN:
        if (phase === 'results') startMatch(true);
        break;
      case ACTIONS.CHANGE_GAME:
        if (phase === 'results') { stopGame(); phase = 'lobby'; }
        break;
      case ACTIONS.PAUSE:
        if (phase === 'match') paused = true;
        break;
      case ACTIONS.RESUME:
        paused = false;
        break;
      case ACTIONS.MENU:
        if (phase === 'match' && (paused || missingSeats().length)) {
          metric('match_abandoned', { game: match.manifest.id, durationMs: Math.round(performance.now() - match.startedAt) });
          stopGame();
          phase = 'lobby';
        } else if (phase === 'results') {
          stopGame();
          phase = 'lobby';
        }
        break;
    }
  }

  // Thumbs up or down after a match: one vote per phone (and one from the big screen).
  function vote(who, choice) {
    if (phase !== 'results' || !results || results.votes[who] || !['up', 'down'].includes(choice)) return;
    results.votes[who] = choice;
    metric('feedback', { game: results.game, vote: choice, from: who === 'screen' ? 'screen' : 'phone' });
  }

  function changeSettings({ game, mode, options }) {
    if (phase === 'lobby' || phase === 'results') {
      if (game && byId(game) && game !== selection.game) chooseGame(game);
      if (mode && selectedGame()?.modes.some((m) => m.id === mode)) { selection.mode = mode; modePicked = true; }
      for (const opt of selectedGame()?.options || []) {
        const v = options?.[opt.id];
        if (opt.choices.some((c) => c.id === v)) selection.options[opt.id] = v;
      }
    } else if (phase === 'match' && paused && match?.game) {
      // While paused, options marked changeWhilePaused can change (e.g. difficulty).
      for (const opt of match.manifest.options || []) {
        const v = options?.[opt.id];
        if (!opt.changeWhilePaused || !opt.choices.some((c) => c.id === v) || match.options[opt.id] === v) continue;
        match.options[opt.id] = v;
        selection.options[opt.id] = v;
        safely(() => match.game.optionChanged?.(opt.id, v));
      }
    }
  }

  // ---------- big-screen buttons ----------

  function letsGo() {
    unlock(); // the first tap lets the browser play sound
    keepScreenOn();
    startPressedAt = performance.now();
    metric('start_pressed');
    if (!seenHowto) { showHowto = true; return; }
    started = true;
  }
  $('welcome-start').addEventListener('click', letsGo);
  $('welcome-howto').addEventListener('click', () => { unlock(); showHowto = true; });
  $('lobby-howto').addEventListener('click', () => { showHowto = true; });
  $('howto-done').addEventListener('click', () => {
    unlock();
    keepScreenOn();
    seenHowto = true;
    try { localStorage.setItem('fgp.seenHowto', '1'); } catch { /* private mode */ }
    if (!startPressedAt) startPressedAt = performance.now();
    showHowto = false;
    started = true;
  });
  $('start').addEventListener('click', () => onAction(ACTIONS.START));
  $('again').addEventListener('click', () => onAction(ACTIONS.PLAY_AGAIN));
  $('change').addEventListener('click', () => onAction(ACTIONS.CHANGE_GAME));
  $('pause').addEventListener('click', () => onAction(ACTIONS.PAUSE));
  $('resume').addEventListener('click', () => onAction(ACTIONS.RESUME));
  confirmTap($('menu'), 'Tap again to leave the game', () => onAction(ACTIONS.MENU));
  $('screen-thumbs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-vote]');
    if (btn) onAction(ACTIONS.FEEDBACK, { vote: btn.dataset.vote });
  });
  $('mute').innerHTML = pix(isMuted() ? '🔇' : '🔊');
  $('mute').addEventListener('click', () => {
    unlock();
    setMuted(!isMuted());
    $('mute').innerHTML = pix(isMuted() ? '🔇' : '🔊');
  });

  // Game, mode and option buttons are made from the manifests; one click handler for all.
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick]');
    if (!btn) return;
    const { pick, value, option } = btn.dataset;
    if (pick === 'game') changeSettings({ game: value });
    else if (pick === 'mode') changeSettings({ mode: value });
    else if (pick === 'option') changeSettings({ options: { [option]: value } });
  });

  /** A button that needs two taps (so a stray tap doesn't end the match). */
  function confirmTap(btn, askText, action) {
    const text = btn.textContent;
    let timer = null;
    const reset = () => { clearTimeout(timer); timer = null; btn.textContent = text; btn.classList.remove('confirm'); };
    btn.addEventListener('click', () => {
      if (timer) { reset(); action(); return; }
      btn.textContent = askText;
      btn.classList.add('confirm');
      timer = setTimeout(reset, 3000);
    });
  }

  // ---------- what the phones need to know ----------

  function sideColors(m) {
    const out = {};
    for (const side of m.modeSpec.sides) {
      const seat = m.seats.find((s) => m.sides[s] === side);
      out[side] = side === m.modeSpec.computer ? theme.cpu : (seat ? theme.seats[seat] : theme.line);
    }
    return out;
  }

  function phoneState() {
    const mode = selectedMode();
    const state = {
      t: MSG.STATE,
      phase: phase === 'loading' ? 'lobby' : phase,
      matchId: match?.id || 0,
      players: Object.fromEntries(SEATS.map((s) => [s, {
        connected: players[s].connected, name: players[s].profile.name, avatar: players[s].profile.avatar, color: theme.seats[s],
        boost: players[s].profile.boost || 0,
      }])),
      selection,
      canStart: canStart(),
      need: mode?.players.min || 1,
      results,
    };
    if (phase === 'lobby' || phase === 'loading' || phase === 'results') {
      // Just what the phone's game list needs.
      state.catalogue = catalogue.map((g) => ({ id: g.id, name: g.name, icon: g.icon, modes: g.modes, options: g.options || [] }));
    }
    if (match && (phase === 'match' || phase === 'results')) {
      state.match = {
        game: match.manifest.id,
        icon: match.manifest.icon,
        seats: match.seats,
        sides: match.sides,
        // Only sides someone is playing on (a 4-way race with 2 players shows 2 scores).
        sideOrder: match.modeSpec.sides.filter((side) => side === match.modeSpec.computer || match.seats.some((seat) => match.sides[seat] === side)),
        sideColors: sideColors(match),
        scores: match.scores,
        layouts: match.layouts, // seat -> { id, params }
        layoutSpecs: match.manifest.layouts,
        messages: match.messages,
        pauseOptions: (match.manifest.options || []).filter((o) => o.changeWhilePaused),
        options: match.options,
      };
      state.held = phase === 'match' ? { paused, missing: missingSeats() } : null;
    }
    return state;
  }

  let lastSent = '';
  function syncPhones() {
    const state = phoneState();
    const text = JSON.stringify(state);
    if (text === lastSent) return;
    lastSent = text;
    conn.send({ t: MSG.BROADCAST, msg: state });
  }

  // ---------- drawing the platform screens ----------

  const button = (pick, value, html, selected, extra = '') => `<button data-pick="${pick}" data-value="${value}" ${extra} class="${selected ? 'selected' : ''}">${html}</button>`;
  const choice = (icon, label) => `${pixRow(icon)}<span>${esc(label)}</span>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function buildHowtoGames() {
    $('howto-games').innerHTML = catalogue.map((g) => `<div class="howto-game"><b>${pix(g.icon)}${esc(g.name)}</b>${
      (g.howTo || []).map((t) => `<div>${pix(t.icon)} ${esc(t.text)}</div>`).join('')}</div>`).join('');
  }

  let lastView = '';
  function updateScreen() {
    const missing = missingSeats();
    const view = JSON.stringify([started, showHowto, phase, selection, catalogue.length, lag, paused, missing, results,
      SEATS.map((s) => [players[s].connected, players[s].profile])]);
    if (view === lastView) return;
    lastView = view;

    $('tap').classList.toggle('hidden', started || showHowto);
    if (started && stopDemo) { stopDemo(); stopDemo = null; }
    $('howto').classList.toggle('hidden', !showHowto);
    $('lobby').classList.toggle('hidden', !started || showHowto || (phase !== 'lobby' && phase !== 'loading'));
    $('results').classList.toggle('hidden', !started || phase !== 'results');
    const isHeld = phase === 'match' && (paused || missing.length > 0);
    $('held').classList.toggle('hidden', !isHeld);
    $('pause').classList.toggle('hidden', phase !== 'match' || isHeld);
    $('bg-meadow').classList.toggle('hidden', Boolean(match));
    $('site').textContent = location.host;
    if (!started) return;

    // Lobby: players, games, modes and options, all from the manifests.
    $('players').innerHTML = SEATS.map((s) => {
      const p = players[s];
      if (!p.connected) {
        return `<div class="player-chip" style="--c:${theme.seats[s]}"><span class="slot-empty">${s}</span><span class="chip-text"><small>Scan to join</small></span></div>`;
      }
      const boost = p.profile.boost ? `<span class="boost">${pix('🐣').repeat(p.profile.boost)}</span>` : '';
      return `<div class="player-chip on" style="--c:${theme.seats[s]}">${pix(p.profile.avatar, 'pix slot-avatar')}<span class="chip-text"><span class="chip-name">${
        esc(p.profile.name)} ${boost}</span><small>Ready${DEBUG ? ` ${lagText(s)}` : ''}</small></span></div>`;
    }).join('');
    $('games').innerHTML = catalogue.map((g, i) => {
      const [tint, glow] = CARD_TINTS[i % CARD_TINTS.length];
      const count = g.players.min === g.players.max ? g.players.min : `${g.players.min}–${g.players.max}`;
      return button('game', g.id,
        `<span class="icon">${pix(g.icon)}</span><span class="info"><b>${esc(g.name)}</b><span class="meta"><span>${esc(g.ages)}</span><span>${pix('👤')}${count}</span><span>${pix('⏱')}${esc(g.matchLength)}</span></span></span><span class="ribbon">Picked</span>`,
        g.id === selection.game, `style="--t:${tint};--c:${glow}"`);
    }).join('');
    const game = selectedGame();
    $('modes').innerHTML = (game?.modes || []).map((m) => button('mode', m.id, choice(m.icon, m.label), m.id === selection.mode)).join('');
    $('options').innerHTML = (game?.options || []).map((opt) => `<div><h3>${esc(opt.label)}</h3><div class="row">${
      opt.choices.map((c) => button('option', c.id, choice(c.icon, c.label), selection.options[opt.id] === c.id, `data-option="${opt.id}"`)).join('')}</div></div>`).join('');
    const ok = canStart();
    $('start').disabled = !ok || phase === 'loading';
    const need = selectedMode()?.players.min || 1;
    $('start-hint').textContent = ok ? 'Press START here or on a phone'
      : need > 1 ? `This needs ${need} phones` : 'Scan the code with a phone to join';

    // Paused, or waiting for a phone that dropped out.
    if (isHeld) {
      const waiting = missing.length > 0;
      $('held-big').textContent = waiting ? 'WAITING' : 'PAUSED';
      $('held-big').style.color = waiting ? theme.seats[missing[0]] : theme.cpu;
      $('held-small').textContent = waiting ? `Waiting for ${missing.map(label).join(' and ')}…` : '';
      $('held-qr').classList.toggle('hidden', !waiting);
      $('pause-menu').classList.toggle('hidden', waiting);
      $('pause-options').innerHTML = (match?.manifest.options || []).filter((o) => o.changeWhilePaused)
        .map((opt) => `<div class="row">${opt.choices.map((c) => button('option', c.id, `${pix(c.icon)} ${esc(c.label)}`,
          match.options[opt.id] === c.id, `data-option="${opt.id}"`)).join('')}</div>`).join('');
    }

    // Results: the winner's animal with a crown, and the final score.
    if (phase === 'results' && results) {
      // The winner keeps the crown, but every player is cheered. When the computer
      // wins, the children come first ("Great game!"), not a crowned robot.
      const seats = match?.seats || [];
      const kids = seats.map((s) => players[s].profile.avatar).join('');
      let avatar;
      let text;
      let note = '';
      let cheer = false;
      if (results.winner == null) { avatar = kids; text = 'Great game!'; note = 'It\'s a draw'; }
      else if (results.computerWon) { avatar = kids; text = 'Great game!'; note = 'The computer won this time'; }
      else if (results.team) { avatar = results.winners.map((s) => players[s].profile.avatar).join(''); text = 'Team wins!'; }
      else { const s = results.winners[0]; avatar = players[s].profile.avatar; text = `${players[s].profile.name} wins!`; cheer = seats.length > 1; }
      $('winner-avatar').innerHTML = pixRow(avatar, 'pix who');
      $('crown-pix').hidden = results.winner == null || results.computerWon;
      $('result-note').textContent = note;
      $('result-note').hidden = !note;
      $('cheer').hidden = !cheer;
      if (cheer) {
        $('cheer').innerHTML = `<b>Great game, everyone!</b><span>${seats.map((s, i) =>
          `<span class="cheer-one" style="--c:${theme.seats[s]};animation-delay:${i * 0.12}s">${pix(players[s].profile.avatar)}<small>${esc(players[s].profile.name)}</small></span>`).join('')}</span>`;
      }
      const colors = match ? sideColors(match) : {};
      const order = match?.modeSpec.sides.filter((side) => side in (results.scores || {})) || [];
      $('final-score').innerHTML = order.map((side) => `<span style="color:${colors[side] || theme.text}">${results.scores[side]}</span>`).join('<i>–</i>');
      const mine = results.votes.screen;
      for (const b of $('screen-thumbs').children) {
        b.classList.toggle('selected', b.dataset.vote === mine);
        b.disabled = Boolean(mine) && b.dataset.vote !== mine;
      }
      $('winner-text').textContent = text;
      const lead = results.computerWon || results.winner == null ? theme.seats[seats[0]] : theme.seats[results.winners[0]];
      $('results').style.setProperty('--c', lead || theme.text);
    }
  }

  // e.g. "⚡ 14ms" (direct over Wi-Fi) or "🌐 160ms" (through the internet server)
  function lagText(seat) {
    const l = lag[seat];
    return l ? `${l.direct ? '⚡' : '🌐'} ${l.rtt}ms` : '';
  }

  function confetti() {
    const colors = [...Object.values(theme.seats), theme.cpu];
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

  // Small connection readout in the corner, to check how quick the controls are.
  let fps = 0;
  let frames = 0;
  let fpsTime = performance.now();
  function updateStats(now) {
    if (!DEBUG) return;
    frames += 1;
    if (now - fpsTime < 1000) return;
    fps = Math.round((frames * 1000) / (now - fpsTime));
    frames = 0;
    fpsTime = now;
    const parts = connectedSeats().map((s) => `P${s} ${lagText(s)}`);
    $('stats').textContent = `${parts.join('   ')}   ${fps}fps`;
  }

  // ---------- main loop: the platform owns the clock ----------

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (match?.game) {
      const g = match.game;
      // Pause the game when someone pressed pause, or a phone dropped out.
      const shouldHold = phase === 'match' && (paused || missingSeats().length > 0);
      if (shouldHold !== held) {
        held = shouldHold;
        safely(() => (held ? g.pause() : g.resume()));
      }
      if (phase === 'match' && !held) safely(() => g.update(dt));
      if (match?.game) safely(() => match.game.draw());
    }
    updateScreen();
    syncPhones();
    updateStats(now);
    if (!match) drawMeadow(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // The screen went to sleep or switched apps: pause so nobody loses a point.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (phase === 'match') paused = true; } else conn.reconnectNow();
  });

  window.platform = { get match() { return match; } }; // handy for testing from the browser console
}
