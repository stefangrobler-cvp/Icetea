// Glow Tube, as a plug-in game. This is the only file the platform talks to.
//
// It exports `manifest` and `createGame(host)`. Everything the game needs from the
// platform comes through `host` (see platform/contract/README.md); nothing here
// imports platform code, so this folder can be lifted out on its own.

import { manifest } from './manifest.js';
import { Engine, PHASE } from './engine.js';
import { Renderer as Renderer3D, canDraw3D } from './renderer3d.js';
import { Renderer as Renderer2D } from './renderer2d.js';
import { makeSounds } from './sounds.js';
import { COLORS } from './config.js';

export { manifest };

const CELEBRATE = 2.5; // seconds to enjoy crossing the finish line before the results

export function createGame(host) {
  const makeCanvas = () => {
    const c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;inset:0;display:block;touch-action:none';
    host.stage.appendChild(c);
    return c;
  };
  let canvas = makeCanvas();
  for (const key of ['background', 'line', 'cpu', 'text']) if (host.theme?.[key]) COLORS[key] = host.theme[key];

  const engine = new Engine({ rng: host.random });
  // The tube in 3D; a flat top-down drawing on a screen that can't do 3D.
  let renderer = null;
  if (canDraw3D()) {
    try { renderer = new Renderer3D(canvas); } catch (e) { console.warn('Glow Tube: 3D unavailable, drawing flat', e); }
  }
  if (!renderer) {
    canvas.remove();
    canvas = makeCanvas();
    renderer = new Renderer2D(canvas);
  }
  const sounds = makeSounds(host.audio);

  let players = [];
  let mode = 'race';
  let steer = 'tilt';
  let ended = false;
  let endIn = 0;
  let lastDt = 1 / 60;

  const describe = (p) => ({ avatar: p.avatar, color: p.color, art: p.art });

  function showControls() {
    for (const p of players) host.setLayout(p.seat, steer === 'slide' ? 'slide' : 'tilt');
  }

  function handle(events) {
    renderer.handleEvents(events, engine.view());
    for (const ev of events) {
      if (ev.type === 'countdown') sounds.tick();
      else if (ev.type === 'go') sounds.go();
      else if (ev.type === 'catch') {
        sounds.catch();
        host.vibrate(ev.seat, 20);
        const side = mode === 'team' ? 'team' : engine.state.riders[ev.seat]?.side;
        host.report({ type: 'point-scored', side, scores: engine.scores() });
      } else if (ev.type === 'tumble') {
        sounds.tumble();
        host.vibrate(ev.seat, 200);
      } else if (ev.type === 'finish') {
        if (ev.winner === 'cpu') sounds.lose(); else sounds.win();
        endIn = CELEBRATE;
      }
    }
  }

  return {
    start({ mode: modeId, options, players: list }) {
      players = list.map((p) => ({ ...p }));
      mode = modeId === 'team' ? 'team' : 'race';
      steer = options.steer === 'slide' ? 'slide' : 'tilt';
      ended = false;
      endIn = 0;
      renderer.players = Object.fromEntries(players.map((p) => [p.seat, describe(p)]));
      engine.setDifficulty(options.difficulty);
      engine.startMatch(mode, players.map((p) => ({ seat: p.seat, side: p.side, color: p.color, boost: p.boost || 0 })));
      showControls();
      host.report({ type: 'match-started' });
    },

    input(seat, control, value) {
      if (control === 'steer') engine.steer(seat, value);
    },

    update(dt) {
      lastDt = dt;
      if (ended) return;
      handle(engine.step(dt));
      if (endIn > 0) {
        endIn -= dt;
        if (endIn <= 0) {
          ended = true;
          const s = engine.state;
          const most = Math.max(0, ...Object.values(s.riders).map((r) => r.caught));
          host.report({ type: 'match-ended', winner: s.winner, scores: engine.scores(), stats: { mostCrystals: most } });
        }
      }
    },

    draw() {
      renderer.draw(engine.view(), lastDt);
    },

    pause() { engine.pause(); },
    resume() { engine.resume(); },

    optionChanged(id, value) {
      if (id === 'steer') {
        steer = value === 'slide' ? 'slide' : 'tilt';
        showControls();
      }
    },

    // A kid joined during a team ride: they get a board and crystals from here on.
    playerJoined(player) {
      if (mode !== 'team' || engine.state.phase === PHASE.OVER) return false;
      if (!engine.addPlayer(player.seat, { color: player.color, boost: player.boost || 0 })) return false;
      players.push({ ...player, side: 'team' });
      renderer.players[player.seat] = describe(player);
      showControls();
      return true;
    },

    stop() {
      renderer.destroy();
      canvas.remove();
    },
  };
}
