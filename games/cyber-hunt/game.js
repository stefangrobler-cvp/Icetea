// Cyber Hunt, as a plug-in game. This is the only file the platform talks to.
//
// It exports `manifest` and `createGame(host)`. Everything the game needs from the
// platform comes through `host` (see platform/contract/README.md); nothing here
// imports platform code, so this folder can be lifted out on its own.

import { manifest } from './manifest.js';
import { Engine, PHASE } from './engine.js';
import { Renderer } from './renderer.js';
import { makeSounds } from './sounds.js';
import { COLORS } from './config.js';

export { manifest };

const CELEBRATE = 1.6; // seconds before the results screen

export function createGame(host) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;display:block;touch-action:none';
  host.stage.appendChild(canvas);

  // Colours come from the platform's theme (neon for now).
  for (const key of ['background', 'line', 'text']) if (host.theme?.[key]) COLORS[key] = host.theme[key];

  const engine = new Engine({ rng: host.random });
  const renderer = new Renderer(canvas);
  const sounds = makeSounds(host.audio);

  let players = [];
  let mode = 'team';
  let ended = false;
  let endIn = 0;
  let lastDt = 1 / 60;
  let alarmed = false;
  const shown = {}; // seat -> last layout + params sent

  // Which layout each phone shows: coloured pads to pick a quarter, or the touchpad.
  function phoneLayout(seat) {
    const s = engine.state;
    const p = s.players[seat];
    const active = s.phase === PHASE.HUNT || s.phase === PHASE.INTRO;
    if (p?.mode === 'hunt') return ['hunt', { back: true, ready: active && p.frozen <= 0 }];
    return ['pick', { ready: active }];
  }

  function updatePhones(force = false) {
    for (const p of players) {
      const [layout, params] = phoneLayout(p.seat);
      const key = JSON.stringify([layout, params]);
      if (!force && shown[p.seat] === key) continue;
      shown[p.seat] = key;
      host.setLayout(p.seat, layout, params);
    }
  }

  function handle(events) {
    renderer.handleEvents(events);
    for (const ev of events) {
      if (ev.type === 'countdown') sounds.tick();
      else if (ev.type === 'round') {
        sounds.round();
        host.message('all', { icon: ev.target, text: '🔍' });
      } else if (ev.type === 'go') {
        sounds.go();
        host.message('all', null);
      } else if (ev.type === 'pick') sounds.pick();
      else if (ev.type === 'found') {
        sounds.found();
        host.vibrate(ev.seat, 60);
        const side = mode === 'team' ? 'team' : engine.state.players[ev.seat].side;
        host.report({ type: 'point-scored', side, scores: engine.scores() });
      } else if (ev.type === 'wrong') {
        sounds.wrong();
        host.vibrate(ev.seat, 250);
        if (mode === 'team') host.report({ type: 'point-scored', side: 'cpu', scores: engine.scores() });
      } else if (ev.type === 'miss') sounds.miss();
      else if (ev.type === 'round-done') sounds.roundDone();
      else if (ev.type === 'win') {
        if (ev.winner === 'cpu') sounds.lose(); else sounds.win();
        endIn = CELEBRATE;
      }
    }
    // Team mode: an alarm when the scan is nearly done.
    const scan = engine.state.scan;
    if (scan && !alarmed && scan.left < scan.total * 0.2) {
      alarmed = true;
      sounds.alarm();
    }
  }

  return {
    start({ mode: modeId, options, players: list }) {
      players = list.map((p) => ({ ...p }));
      mode = modeId === 'race' ? 'race' : 'team';
      ended = false;
      endIn = 0;
      alarmed = false;
      for (const k of Object.keys(shown)) delete shown[k];
      renderer.players = Object.fromEntries(players.map((p) => [p.seat, { avatar: p.avatar, color: p.color }]));
      engine.setDifficulty(options.difficulty);
      engine.startMatch(mode, players.map((p) => ({ seat: p.seat, side: p.side, boost: p.boost || 0 })));
      updatePhones(true);
      host.report({ type: 'match-started' });
    },

    input(seat, control, value) {
      if (control === 'zone' && value?.down === true) engine.choose(seat, value.pad);
      else if (control === 'cursor' && value) {
        if (value.back) engine.back(seat);
        else {
          engine.point(seat, value.x, value.y);
          if (value.tap) engine.tag(seat);
        }
      }
      updatePhones();
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
          host.report({ type: 'match-ended', winner: s.winner, scores: engine.scores(), stats: { found: s.found, wrong: s.wrong, rounds: s.round } });
        }
      }
    },

    draw() {
      renderer.draw(engine.state, lastDt);
    },

    pause() { engine.pause(); },
    resume() { engine.resume(); },

    optionChanged(id, value) {
      if (id === 'difficulty') engine.setDifficulty(value);
    },

    // A kid joined a team game: they start hunting straight away.
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
