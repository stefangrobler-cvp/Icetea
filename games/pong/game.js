// Pong, as a plug-in game. This is the only file the platform talks to.
//
// It exports `manifest` and `createGame(host)`. Everything Pong needs from the
// platform comes through `host` (see platform/contract/README.md); nothing here
// imports platform code, so this folder can be lifted out on its own.

import { manifest } from './manifest.js';
import { Engine, PHASE } from './engine.js';
import { Renderer as Renderer3D, canDraw3D } from './renderer3d.js';
import { Renderer as Renderer2D } from './renderer2d.js';
import { Replay } from './replay.js';
import { makeSounds } from './sounds.js';
import { COLORS, BALL } from './config.js';

const HIT_FREEZE = 0.045; // seconds the game holds still on each hit, so it lands with a thump
const SLOW_MOTION = 0.3; // game speed while a ball that got past a paddle rolls into the goal

export { manifest };

export function createGame(host) {
  const makeCanvas = () => {
    const c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;inset:0;display:block;touch-action:none';
    host.stage.appendChild(c);
    return c;
  };
  let canvas = makeCanvas();

  // Colours come from the platform's theme (neon for now).
  for (const key of ['background', 'line', 'ball', 'cpu']) if (host.theme?.[key]) COLORS[key] = host.theme[key];

  const engine = new Engine({ rng: host.random });
  // The neon voxel court in 3D; the flat court on a screen that can't do 3D.
  let renderer = null;
  if (canDraw3D()) {
    try { renderer = new Renderer3D(canvas); } catch (e) { console.warn('Pong: 3D unavailable, drawing flat', e); }
  }
  if (!renderer) {
    canvas.remove();
    canvas = makeCanvas();
    renderer = new Renderer2D(canvas);
  }
  const sounds = makeSounds(host.audio);
  const replay = new Replay();

  let players = []; // { seat, nickname, avatar, color, side }
  let mode = 'versus';
  let ended = false;
  let lastDt = 1 / 60;
  let shown = null; // what to draw this frame (the live game, or a replay frame)
  let rally = 0;
  let longestRally = 0;
  let lastMessage = '';
  let freeze = 0; // seconds left of a hit's freeze

  const name = (seat) => {
    const p = players.find((x) => x.seat === seat);
    return p ? `${p.avatar} ${p.nickname}` : '';
  };
  const sideName = (side) => {
    if (mode === 'team') return side === 'left' ? 'Team' : '🤖 Computer';
    return name(players.find((p) => p.side === side)?.seat);
  };
  // The same, without the emoji, for the big screen (which shows the pixel animals).
  const plainName = (side) => {
    if (mode === 'team') return side === 'left' ? 'Team' : 'Computer';
    return players.find((p) => p.side === side)?.nickname || '';
  };
  const sideColor = (side) => engine.state.paddles.find((p) => p.side === side)?.color || COLORS.line;

  // Tap the big screen during the replay to skip it.
  canvas.addEventListener('click', () => { if (replay.playing) finishReplay(); });

  function finishReplay() {
    replay.stop();
    renderer.replaying = false;
    endMatch();
  }

  function endMatch() {
    if (ended) return;
    ended = true;
    host.message('all', null);
    const s = engine.state;
    host.report({ type: 'match-ended', winner: s.winner, scores: { ...s.scores }, stats: { longestRally } });
  }

  // Captions on the big screen and short messages on the phones, by phase.
  function updateMessages() {
    const s = engine.state;
    let caption = null;
    let big = null;
    let phone = null;
    if (replay.playing) {
      phone = { icon: '🎬', text: 'Watch the replay!' };
    } else if (s.phase === PHASE.TOSS) {
      const landed = s.toss.timeLeft < 0.6;
      const text = landed ? `${sideName(s.toss.winner)} serves first!` : '🪙 Coin toss…';
      caption = renderer instanceof Renderer3D
        ? { text: landed ? `${plainName(s.toss.winner)} serves first!` : 'Coin toss', color: landed ? sideColor(s.toss.winner) : '#ffe600' }
        : { text, color: landed ? sideColor(s.toss.winner) : '#ffffff' };
      phone = { icon: '🪙', text: landed ? text : 'Coin toss…' };
    } else if (s.phase === PHASE.COUNTDOWN) {
      big = String(Math.ceil(s.countdown));
      phone = { icon: big };
    }
    renderer.caption = caption;
    renderer.bigText = big;
    const key = JSON.stringify(phone);
    if (key !== lastMessage) {
      lastMessage = key;
      host.message('all', phone);
    }
  }

  function handle(events) {
    const won = events.some((e) => e.type === 'win');
    // The winning point's effects are saved for the slow-motion replay.
    renderer.handleEvents(won ? events.filter((e) => e.type !== 'point') : events, engine.state);
    for (const ev of events) {
      if (ev.type === 'hit') {
        sounds.paddle(ev.power);
        freeze = HIT_FREEZE;
        const paddle = engine.state.paddles.find((p) => p.id === ev.paddle);
        if (paddle?.slot) {
          host.vibrate(paddle.slot, 15 + Math.round(ev.power * 25));
          rally += 1;
          longestRally = Math.max(longestRally, rally);
        }
      } else if (ev.type === 'wall') sounds.wall();
      else if (ev.type === 'countdown') sounds.tick();
      else if (ev.type === 'serve' || ev.type === 'toss') sounds.go();
      else if (ev.type === 'point') {
        sounds.point();
        rally = 0;
        host.report({ type: 'point-scored', side: ev.scorer, scores: { ...engine.state.scores } });
        if (!won) setTimeout(sounds.cheer, 250);
      } else if (ev.type === 'win') {
        if (replay.start()) renderer.replaying = true;
        else endMatch();
      }
    }
  }

  // Has the ball passed the paddles on the side it's heading to? (It can't be returned now.)
  function ballGotPast() {
    const s = engine.state;
    const b = s.ball;
    if (s.phase !== PHASE.PLAYING || !b.visible) return false;
    const side = b.vx < 0 ? 'left' : 'right';
    const mine = s.paddles.filter((p) => p.side === side);
    if (!mine.length) return false;
    return side === 'left'
      ? b.x + BALL.radius < Math.min(...mine.map((p) => p.x - p.w / 2))
      : b.x - BALL.radius > Math.max(...mine.map((p) => p.x + p.w / 2));
  }

  return {
    start({ mode: modeId, options, players: list }) {
      players = list.map((p) => ({ ...p }));
      mode = modeId;
      ended = false;
      freeze = 0;
      rally = 0;
      longestRally = 0;
      replay.stop();
      renderer.replaying = false;
      renderer.mode = mode;
      renderer.players = Object.fromEntries(players.map((p) => [p.seat, { avatar: p.avatar, color: p.color, art: p.art }]));
      engine.setSettings({ mode, difficulty: options.difficulty });
      const sides = Object.fromEntries(players.map((p) => [p.seat, p.side]));
      const colors = { ...Object.fromEntries(players.map((p) => [p.seat, p.color])), cpu: COLORS.cpu };
      const boosts = Object.fromEntries(players.map((p) => [p.seat, p.boost || 0]));
      engine.startMatch(players.map((p) => p.seat), { sides, colors, boosts });
      for (const p of players) host.setLayout(p.seat, 'play');
      host.report({ type: 'match-started' });
    },

    input(seat, control, value) {
      if (control === 'paddle' && typeof value === 'number') engine.setPaddle(seat, value);
    },

    update(dt) {
      lastDt = dt;
      if (replay.playing) {
        const out = replay.advance(dt);
        if (out) {
          shown = { ...engine.state, phase: PHASE.PLAYING, toss: null, ...out.frame };
          renderer.handleEvents(out.events, shown);
        } else {
          finishReplay();
        }
        updateMessages();
        return;
      }
      shown = null;
      if (ended) return;
      // Game feel: a split-second hold on each hit, and slow motion once a ball
      // has got past a paddle. Both slow the whole game evenly, for every player.
      if (freeze > 0) { freeze -= dt; updateMessages(); return; }
      const events = engine.step(dt * (ballGotPast() ? SLOW_MOTION : 1));
      const s = engine.state;
      const scored = events.some((e) => e.type === 'point');
      // Keep the last few seconds of each rally, so the winning shot can be replayed.
      if (s.phase === PHASE.PLAYING || scored) replay.record(performance.now() / 1000, s, events);
      if (scored && s.phase !== PHASE.OVER) replay.clear();
      handle(events);
      updateMessages();
    },

    draw() {
      renderer.draw(shown || engine.state, replay.playing ? lastDt * replay.speed : lastDt);
    },

    pause() { engine.pause(); },
    resume() { engine.resume(); },

    optionChanged(id, value) {
      if (id === 'difficulty') engine.setSettings({ difficulty: value });
    },

    // A kid joined during a team-v-computer match: they get their own paddle.
    playerJoined(player) {
      if (mode !== 'team' || players.some((p) => p.seat === player.seat)) return false;
      players.push({ ...player, side: 'left' });
      renderer.players[player.seat] = { avatar: player.avatar, color: player.color, art: player.art };
      engine.colors[player.seat] = player.color;
      engine.addPlayer(player.seat, player.boost || 0);
      host.setLayout(player.seat, 'play');
      return true;
    },

    stop() {
      replay.stop();
      renderer.destroy();
      canvas.remove();
    },
  };
}
