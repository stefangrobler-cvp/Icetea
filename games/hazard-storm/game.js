// Hazard Storm, as a plug-in game. This is the only file the platform talks to.
//
// It exports `manifest` and `createGame(host)`. Everything the game needs from the
// platform comes through `host` (see platform/contract/README.md); nothing here
// imports platform code, so this folder can be lifted out on its own.

import { manifest } from './manifest.js';
import { Engine, PHASE } from './engine.js';
import { Renderer } from './renderer.js';
import { makeSounds } from './sounds.js';
import { COLORS, DASH } from './config.js';

export { manifest };

const CELEBRATE = 1.8; // seconds before the results screen

export function createGame(host) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;display:block;touch-action:none';
  host.stage.appendChild(canvas);

  // Colours come from the platform's theme (neon for now).
  for (const key of ['background', 'cpu', 'text']) if (host.theme?.[key]) COLORS[key] = host.theme[key];

  const engine = new Engine({ rng: host.random });
  const renderer = new Renderer(canvas);
  const sounds = makeSounds(host.audio);

  let players = [];
  let mode = 'team';
  let ended = false;
  let endIn = 0;
  let totalTime = 0;
  let lastDt = 1 / 60;
  let batteries = 0;
  const shown = {}; // seat -> last layout params sent

  // What each phone's 💨 button shows right now.
  function phoneParams(seat) {
    const s = engine.state;
    if (s.phase === PHASE.COUNTDOWN) return { ready: false, icon: String(Math.max(1, Math.ceil(s.countdown))) };
    if (s.phase === PHASE.OVER) return { ready: false, icon: s.winner === 'cpu' ? '🤖' : '🏆' };
    const o = s.orbs[seat];
    if (!o) return { ready: false, icon: '⏳' };
    if (o.out) return { ready: false, icon: '💔' };
    if (o.cooldown > 0) return { ready: false, icon: '💨', recharge: DASH.cooldown };
    return { ready: true, icon: '💨' };
  }

  function updatePhones(force = false) {
    for (const p of players) {
      const params = phoneParams(p.seat);
      const key = JSON.stringify(params);
      if (!force && shown[p.seat] === key) continue;
      shown[p.seat] = key;
      host.setLayout(p.seat, 'play', params);
    }
  }

  function handle(events) {
    renderer.handleEvents(events);
    for (const ev of events) {
      if (ev.type === 'countdown') sounds.tick();
      else if (ev.type === 'go') sounds.go();
      else if (ev.type === 'warn') sounds.warn(ev.kind);
      else if (ev.type === 'fire' && ev.kind === 'beam') sounds.beam();
      else if (ev.type === 'smash') sounds.smash();
      else if (ev.type === 'boing') sounds.boing();
      else if (ev.type === 'dash') { sounds.dash(); host.vibrate(ev.seat, 20); }
      else if (ev.type === 'bump') { sounds.bump(); for (const seat of ev.seats) host.vibrate(seat, 40); }
      else if (ev.type === 'battery') {
        sounds.battery();
        batteries += 1;
        host.vibrate(ev.seat, 30);
        host.report({ type: 'point-scored', side: 'team', scores: engine.scores() });
      } else if (ev.type === 'hit') {
        sounds.hit();
        host.vibrate(ev.seat, 200);
        if (mode === 'team') host.report({ type: 'point-scored', side: 'cpu', scores: engine.scores() });
      } else if (ev.type === 'out') {
        sounds.out();
        host.vibrate(ev.seat, 400);
        host.report({ type: 'highlight', name: 'knocked-out', seat: ev.seat });
      } else if (ev.type === 'win') {
        if (ev.winner === 'cpu') sounds.lose(); else sounds.win();
        endIn = CELEBRATE;
      }
    }
  }

  return {
    start({ mode: modeId, options, players: list }) {
      players = list.map((p) => ({ ...p }));
      mode = modeId === 'versus' ? 'versus' : 'team';
      ended = false;
      endIn = 0;
      batteries = 0;
      for (const k of Object.keys(shown)) delete shown[k];
      renderer.reset();
      renderer.players = Object.fromEntries(players.map((p) => [p.seat, { avatar: p.avatar, color: p.color }]));
      engine.setDifficulty(options.difficulty);
      engine.startMatch(mode, players.map((p) => ({ seat: p.seat, side: p.side, boost: p.boost || 0 })));
      totalTime = engine.state.time;
      updatePhones(true);
      host.report({ type: 'match-started' });
    },

    input(seat, control, value) {
      if (control === 'move') engine.move(seat, value);
      else if (control === 'dash' && value?.down === true) engine.dash(seat);
    },

    update(dt) {
      lastDt = dt;
      if (ended) return;
      handle(engine.step(dt));
      updatePhones();
      if (endIn > 0) {
        endIn -= dt;
        if (endIn <= 0) {
          ended = true;
          host.message('all', null);
          const s = engine.state;
          host.report({ type: 'match-ended', winner: s.winner, scores: engine.scores(), stats: { hits: s.hits, batteries, seconds: Math.round(s.elapsed) } });
        }
      }
    },

    draw() {
      renderer.draw({ ...engine.state, totalTime }, lastDt);
    },

    pause() { engine.pause(); },
    resume() { engine.resume(); },

    optionChanged(id, value) {
      if (id === 'difficulty') engine.setDifficulty(value);
    },

    // A kid joined a team game: a new orb joins the storm.
    playerJoined(player) {
      if (mode !== 'team' || players.some((p) => p.seat === player.seat)) return false;
      if (!engine.addPlayer({ seat: player.seat, side: 'team', boost: player.boost || 0 })) return false;
      players.push({ ...player, side: 'team' });
      renderer.players[player.seat] = { avatar: player.avatar, color: player.color };
      updatePhones(true);
      return true;
    },

    stop() {
      renderer.destroy();
      canvas.remove();
    },
  };
}
