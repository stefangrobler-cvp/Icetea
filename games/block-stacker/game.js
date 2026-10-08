// Block Stacker, as a plug-in game. This is the only file the platform talks to.
//
// It exports `manifest` and `createGame(host)`. Everything the game needs from the
// platform comes through `host` (see platform/contract/README.md); nothing here
// imports platform code, so this folder can be lifted out on its own.

import { manifest } from './manifest.js';
import { Engine, PHASE } from './engine.js';
import { Renderer as Renderer3D, canDraw3D } from './renderer3d.js';
import { Renderer as Renderer2D } from './renderer2d.js';
import { makeSounds } from './sounds.js';
import { COLORS, SHAPES } from './config.js';

export { manifest };

const CELEBRATE = 2.2; // seconds to enjoy the final tower before the results

export function createGame(host) {
  const makeCanvas = () => {
    const c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;inset:0;display:block;touch-action:none';
    host.stage.appendChild(c);
    return c;
  };
  let canvas = makeCanvas();

  // Colours come from the platform's theme (neon for now).
  for (const key of ['background', 'line', 'cpu', 'text']) if (host.theme?.[key]) COLORS[key] = host.theme[key];

  const engine = new Engine({ rng: host.random });
  // Neon voxel blocks in 3D; the flat drawing on a screen that can't do 3D.
  let renderer = null;
  if (canDraw3D()) {
    try { renderer = new Renderer3D(canvas); } catch (e) { console.warn('Block Stacker: 3D unavailable, drawing flat', e); }
  }
  if (!renderer) {
    canvas.remove();
    canvas = makeCanvas();
    renderer = new Renderer2D(canvas);
  }
  const sounds = makeSounds(host.audio);

  let players = [];
  let mode = 'team';
  let shapes = false;
  let layoutId = 'play';
  let ended = false;
  let endIn = 0;
  let totalTime = 0;
  let lastDt = 1 / 60;
  let best = 0;
  const shown = {}; // seat -> last layout params sent, so phones only get changes

  const avatar = (seat) => players.find((p) => p.seat === seat)?.avatar || '🙂';
  // Each phone's own running counts, so it can cheer when its block lands (or wobble when one falls).
  const tally = {}; // seat -> { landed, lost }
  const mine = (seat) => tally[seat] || (tally[seat] = { landed: 0, lost: 0 });

  const FORCE_ICON = { wind: '💨', quake: '🌋' };

  // What each phone shows right now: the big drop button, plus the small turn
  // button (shapes) and force button (tower race), each with its own params.
  function phoneParams(seat) {
    const s = engine.state;
    const tower = mode === 'team' ? s.towers[0] : s.towers.find((t) => t.seats[0] === seat);
    const params = dropParams(seat, tower);
    const myTurn = s.phase === PHASE.PLAYING && tower?.hanging?.seat === seat && !tower.out;
    if (shapes) params.turn = { ready: myTurn, icon: '🔄' };
    if (mode === 'versus') params.force = forceParams(tower);
    return params;
  }

  function dropParams(seat, tower) {
    const s = engine.state;
    if (s.phase === PHASE.COUNTDOWN) return { ready: false, icon: String(Math.max(1, Math.ceil(s.countdown))) };
    if (s.phase === PHASE.OVER) return { ready: false, icon: s.winner === 'cpu' ? '🤖' : '🏁' };
    if (!tower) return { ready: false, icon: '⏳' };
    if (tower.out) return { ready: false, icon: '💔' };
    // The phone shows its own block (or shape) hanging on a wire; tap and it drops.
    const block = { look: 'block', ...mine(seat) };
    const h = tower.hanging;
    if (h?.seat === seat) return h.shape ? { ...block, ready: true, grid: SHAPES[h.shape], turns: h.turns } : { ...block, ready: true };
    if (mode === 'team') return { ...block, ready: false, icon: avatar(engine.currentSeat(tower)) };
    return { ...block, ready: false, icon: avatar(seat) };
  }

  // Tower race: the force button fills up, then glows when it's ready to send.
  function forceParams(tower) {
    const s = engine.state;
    const icon = FORCE_ICON[tower?.nextForce] || '💨';
    if (!tower || tower.out || s.phase === PHASE.OVER) return { ready: false, icon };
    if (s.phase === PHASE.COUNTDOWN) return { ready: false, icon };
    if (tower.charge > 0) return { ready: false, icon, recharge: tower.chargeFull, chargeId: tower.forcesSent };
    return { ready: true, icon };
  }

  function updatePhones(force = false) {
    for (const p of players) {
      const params = phoneParams(p.seat);
      const key = JSON.stringify(params);
      if (!force && shown[p.seat] === key) continue;
      shown[p.seat] = key;
      host.setLayout(p.seat, layoutId, params);
    }
  }

  function report(type, extra = {}) {
    host.report({ type, ...extra });
  }

  function handle(events) {
    renderer.handleEvents(events, engine.view());
    for (const ev of events) {
      if (ev.type === 'countdown') sounds.tick();
      else if (ev.type === 'go') sounds.go();
      else if (ev.type === 'turn') {
        sounds.turn();
        host.vibrate(ev.seat, 30);
      } else if (ev.type === 'drop') {
        sounds.drop();
        host.vibrate(ev.seat, 40);
      } else if (ev.type === 'land') {
        sounds.land(ev.power);
        mine(ev.seat).landed += 1;
        host.vibrate(ev.seat, 25);
        const scores = engine.scores();
        best = Math.max(best, ...Object.values(scores));
        report('point-scored', { side: mode === 'team' ? 'team' : engine.state.towers[ev.tower].side, scores });
      } else if (ev.type === 'lost') {
        sounds.lost();
        mine(ev.seat).lost += 1;
        host.vibrate(ev.seat, 150);
        if (mode === 'team') report('point-scored', { side: 'cpu', scores: engine.scores() });
      } else if (ev.type === 'out') {
        host.vibrate(ev.seat, 300);
      } else if (ev.type === 'rotate') {
        sounds.turn90();
      } else if (ev.type === 'force-sent') {
        sounds.send();
        host.vibrate(ev.seat, 40);
      } else if (ev.type === 'force-warn') {
        sounds.warn();
      } else if (ev.type === 'force') {
        if (ev.kind === 'quake') sounds.quake(); else sounds.wind();
        // Everyone building the tower that's hit feels it.
        for (const seat of engine.state.towers[ev.tower]?.seats || []) host.vibrate(seat, 400);
      } else if (ev.type === 'win') {
        if (ev.winner === 'cpu') sounds.lose(); else sounds.win();
        if (ev.winner && ev.winner !== 'cpu') report('highlight', { name: mode === 'team' ? 'tower-complete' : 'tallest-tower', side: ev.winner });
        endIn = CELEBRATE;
      }
    }
  }

  return {
    start({ mode: modeId, options, players: list }) {
      players = list.map((p) => ({ ...p }));
      mode = modeId === 'versus' ? 'versus' : 'team';
      shapes = options.blocks === 'shapes';
      layoutId = mode === 'versus' ? (shapes ? 'race-shapes' : 'race') : (shapes ? 'shapes' : 'play');
      ended = false;
      endIn = 0;
      best = 0;
      for (const k of Object.keys(shown)) delete shown[k];
      for (const k of Object.keys(tally)) delete tally[k];
      renderer.players = Object.fromEntries(players.map((p) => [p.seat, { avatar: p.avatar, color: p.color, art: p.art }]));
      engine.setDifficulty(options.difficulty);
      engine.startMatch(mode, players.map((p) => ({ seat: p.seat, side: p.side, color: p.color, boost: p.boost || 0 })), { blocks: shapes ? 'shapes' : 'classic' });
      totalTime = engine.state.time;
      updatePhones(true);
      report('match-started');
    },

    input(seat, control, value) {
      if (control === 'drop' && value?.down === true) engine.drop(seat);
      else if (control === 'turn' && value?.down === true) engine.rotate(seat);
      else if (control === 'force' && value?.down === true) engine.useForce(seat);
      else if (control === 'nudge') engine.tilt(seat, value);
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
          report('match-ended', { winner: engine.state.winner, scores: engine.scores(), stats: { tallestTower: best } });
        }
      }
    },

    draw() {
      renderer.draw({ ...engine.view(), totalTime }, lastDt);
    },

    pause() { engine.pause(); },
    resume() { engine.resume(); },

    optionChanged(id, value) {
      if (id === 'difficulty') engine.setDifficulty(value);
    },

    // A kid joined during a team game: they join the turns.
    playerJoined(player) {
      if (mode !== 'team' || players.some((p) => p.seat === player.seat)) return false;
      if (!engine.addPlayer(player.seat, { side: 'team', color: player.color, boost: player.boost || 0 })) return false;
      players.push({ ...player, side: 'team' });
      renderer.players[player.seat] = { avatar: player.avatar, color: player.color, art: player.art };
      updatePhones(true);
      return true;
    },

    stop() {
      renderer.destroy();
      canvas.remove();
    },
  };
}
