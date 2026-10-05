// Synth Sequence, as a plug-in game. This is the only file the platform talks to.
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

const CELEBRATE = 1.8; // seconds before the results screen

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
  const shown = {}; // seat -> last layout params sent

  // What each phone's pads show right now.
  function phoneParams(seat) {
    const s = engine.state;
    const p = s.players[seat];
    const params = {};
    if (mode === 'team') params.active = engine.padsFor(seat);
    if (s.phase === PHASE.SHOW) {
      params.ready = false;
      // On Easy the phones light up along with the screen.
      if (engine.settings.mirror && s.lit !== null) params.lit = s.lit;
    } else if (s.phase === PHASE.INPUT) {
      params.ready = mode === 'team' ? true : Boolean(p && !p.done && !p.out);
      if (p?.hint !== null && p?.hint !== undefined) params.lit = p.hint; // help for younger players
    } else {
      params.ready = false;
    }
    if (p?.out) params.icons = ['💔', '💔', '💔', '💔'];
    return params;
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
      else if (ev.type === 'listen') {
        sounds.listen();
        // Medium and Hard: eyes on the big screen while it plays.
        if (!engine.settings.mirror) host.message('all', { icon: '👀' });
      } else if (ev.type === 'show') sounds.pad(ev.pad, engine.noteLength());
      else if (ev.type === 'your-turn') {
        host.message('all', null);
        sounds.yourTurn();
        for (const p of players) host.vibrate(p.seat, 30);
      } else if (ev.type === 'note') sounds.pad(ev.pad, 0.3);
      else if (ev.type === 'oops') {
        sounds.oops();
        if (ev.seat) host.vibrate(ev.seat, 250);
        if (mode === 'team') host.report({ type: 'point-scored', side: 'cpu', scores: engine.scores() });
      } else if (ev.type === 'good') {
        sounds.good();
        host.report({ type: 'point-scored', side: 'team', scores: engine.scores() });
      } else if (ev.type === 'player-done') {
        host.report({ type: 'point-scored', side: engine.state.players[ev.seat].side, scores: engine.scores() });
      } else if (ev.type === 'round-done') {
        if (ev.good.length) sounds.good();
      } else if (ev.type === 'out') {
        host.vibrate(ev.seat, 400);
        host.report({ type: 'highlight', name: 'knocked-out', seat: ev.seat });
      } else if (ev.type === 'win') {
        host.message('all', null);
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
      for (const k of Object.keys(shown)) delete shown[k];
      renderer.players = Object.fromEntries(players.map((p) => [p.seat, { avatar: p.avatar, color: p.color }]));
      engine.setDifficulty(options.difficulty);
      engine.startMatch(mode, players.map((p) => ({ seat: p.seat, side: p.side, boost: p.boost || 0 })));
      updatePhones(true);
      host.report({ type: 'match-started' });
    },

    input(seat, control, value) {
      if (control === 'pads' && value?.down === true) {
        engine.press(seat, value.pad);
        handle(engine.flush());
        updatePhones();
      }
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
          const s = engine.state;
          host.report({ type: 'match-ended', winner: s.winner, scores: engine.scores(), stats: { longestPattern: s.best } });
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

    // A kid joined the relay: the colours are shared out again.
    playerJoined(player) {
      if (mode !== 'team' || players.some((p) => p.seat === player.seat)) return false;
      if (!engine.addPlayer({ seat: player.seat, side: 'team', boost: player.boost || 0 })) return false;
      players.push({ ...player, side: 'team' });
      renderer.players[player.seat] = { avatar: player.avatar, color: player.color };
      updatePhones(true);
      return true;
    },

    stop() {
      host.message('all', null);
      renderer.destroy();
      canvas.remove();
    },
  };
}
