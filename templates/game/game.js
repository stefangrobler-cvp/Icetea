// __NAME__, as a plug-in game. This is the only file the platform talks to.
//
// It exports `manifest` and `createGame(host)`. Everything the game needs from the
// platform comes through `host` (see platform/contract/README.md); nothing here
// imports platform code, so this folder can be lifted out on its own.

import { manifest } from './manifest.js';
import { Engine, PHASE } from './engine.js';
import { Renderer } from './renderer.js';
import { makeSounds } from './sounds.js';

export { manifest };

export function createGame(host) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;display:block;touch-action:none';
  host.stage.appendChild(canvas);

  const engine = new Engine({ rng: host.random });
  const renderer = new Renderer(canvas, host.theme);
  const sounds = makeSounds(host.audio);
  let ended = false;

  function add(player) {
    renderer.players[player.seat] = { avatar: player.avatar, color: player.color };
    host.setLayout(player.seat, 'play');
  }

  return {
    start({ options, players }) {
      ended = false;
      engine.setDifficulty(options.difficulty);
      engine.startMatch(players.map((p) => ({ seat: p.seat, boost: p.boost || 0 })));
      renderer.players = {};
      players.forEach(add);
      host.message('all', { icon: '⭐', text: 'Catch the stars!' });
      host.report({ type: 'match-started' });
    },

    input(seat, control, value) {
      if (control === 'move' && typeof value === 'number') engine.move(seat, value);
    },

    update(dt) {
      if (ended) return;
      for (const ev of engine.step(dt)) {
        if (ev.type === 'catch') {
          sounds.catch();
          host.vibrate(ev.seat, 20);
          host.report({ type: 'point-scored', side: 'team', scores: { team: engine.state.caught, cpu: engine.state.missed } });
        } else if (ev.type === 'miss') {
          sounds.miss();
          host.report({ type: 'point-scored', side: 'cpu', scores: { team: engine.state.caught, cpu: engine.state.missed } });
        }
      }
      if (engine.state.phase === PHASE.OVER) {
        ended = true;
        host.message('all', null);
        const s = engine.state;
        host.report({ type: 'match-ended', winner: s.winner, scores: { team: s.caught, cpu: s.missed } });
      }
    },

    draw() { renderer.draw(engine.state); },
    pause() { engine.pause(); },
    resume() { engine.resume(); },

    optionChanged(id, value) {
      if (id === 'difficulty') engine.setDifficulty(value);
    },

    // A kid joined mid-match: they get their own catcher.
    playerJoined(player) {
      if (engine.state.catchers[player.seat]) return false;
      engine.addPlayer(player.seat, player.boost || 0);
      add(player);
      return true;
    },

    stop() {
      renderer.destroy();
      canvas.remove();
    },
  };
}
