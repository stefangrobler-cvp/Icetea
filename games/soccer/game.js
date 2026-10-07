// Soccer (foosball), as a plug-in game. This is the only file the platform talks to.
//
// It exports `manifest` and `createGame(host)`. Everything Soccer needs from the
// platform comes through `host` (see platform/contract/README.md); nothing here
// imports platform code, so this folder can be lifted out on its own.

import { manifest } from './manifest.js';
import { Engine, PHASE } from './engine.js';
import { Renderer as Renderer3D, canDraw3D } from './renderer3d.js';
import { Renderer as Renderer2D } from './renderer2d.js';
import { rules } from './rules.js';
import { Replay } from './replay.js';
import { makeSounds } from './sounds.js';
import { COLORS, LANE, MAX_TRAVEL_ANGLE, BALL, COURT } from './config.js';

export { manifest };

const KICK_FREEZE = 0.04; // seconds the game holds still on each kick, so it lands with a thump
const SLOW_MOTION = 0.35; // game speed while a ball nobody can stop rolls into a goal

// Phone layout (from the manifest) for the rods a player works, left to right.
const LAYOUT_FOR = { 'def,att': 'both-left', 'att,def': 'both-right', def: 'defence', att: 'attack' };
const LANE_FOR = { def: LANE.DEFENCE, att: LANE.ATTACK };

export function createGame(host) {
  const makeCanvas = () => {
    const c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;inset:0;display:block;touch-action:none';
    host.stage.appendChild(c);
    return c;
  };
  let canvas = makeCanvas();

  // Colours come from the platform's theme (neon for now). The pitch keeps its own green.
  for (const key of ['line', 'ball', 'cpu']) if (host.theme?.[key]) COLORS[key] = host.theme[key];

  const engine = new Engine({ rng: host.random });
  // The neon voxel pitch in 3D; the flat pitch on a screen that can't do 3D.
  let renderer = null;
  if (canDraw3D()) {
    try { renderer = new Renderer3D(canvas); } catch (e) { console.warn('Soccer: 3D unavailable, drawing flat', e); }
  }
  if (!renderer) {
    canvas.remove();
    canvas = makeCanvas();
    renderer = new Renderer2D(canvas);
  }
  const in3D = renderer instanceof Renderer3D;
  const sounds = makeSounds(host.audio);
  const replay = new Replay();

  let players = []; // { seat, nickname, avatar, color, side }
  let mode = 'versus';
  let ended = false;
  let lastDt = 1 / 60;
  let shown = null;
  let pending = []; // events from a kick, played on the next update
  let lastMessage = '';
  let freeze = 0; // seconds left of a kick's freeze
  const layouts = {}; // seat -> last layout sent (so we only send changes)

  const name = (seat) => {
    const p = players.find((x) => x.seat === seat);
    return p ? `${p.avatar} ${p.nickname}` : '';
  };
  const sideName = (side) => {
    if (mode === 'team') return side === 'left' ? 'Team' : '🤖 Computer';
    return name(players.find((p) => p.side === side)?.seat);
  };
  // Without the emoji, for the big screen in 3D (it shows the pixel animals).
  const plain = (text) => (in3D ? text.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/\s+/g, ' ').trim() : text);
  const sideColor = (side) => engine.state.paddles.find((p) => p.side === side)?.color || COLORS.line;
  const seatColor = (seat) => players.find((p) => p.seat === seat)?.color || COLORS.cpu;

  canvas.addEventListener('click', () => { if (replay.playing) finishReplay(); });

  function finishReplay() {
    replay.stop();
    renderer.replaying = false;
    renderer.banner = null; // don't leave GOAL! behind the results
    endMatch();
  }

  function endMatch() {
    if (ended) return;
    ended = true;
    host.message('all', null);
    const s = engine.state;
    host.report({ type: 'match-ended', winner: s.winner, scores: { ...s.scores } });
  }

  // Each phone shows its rods; the kicker gets the aiming circle during a kick-off.
  function updateLayouts() {
    const s = engine.state;
    const k = s.kickoff;
    const controls = engine.controls();
    for (const p of players) {
      let layout = { id: LAYOUT_FOR[(controls[p.seat] || []).map((c) => c.kind).join(',')] || 'both-left' };
      if (s.phase === PHASE.KICKOFF && k && k.slot === p.seat) {
        layout = {
          id: 'kickoff',
          params: {
            target: k.side === 'left' ? 'right' : 'left', // the other team's goal
            targetIcon: '🥅',
            ready: k.wait <= 0,
            seconds: Math.ceil(k.timeLeft),
            maxAngle: MAX_TRAVEL_ANGLE, // kicks can't go too steeply up or down
          },
        };
      }
      const key = JSON.stringify(layout);
      if (layouts[p.seat] !== key) {
        layouts[p.seat] = key;
        host.setLayout(p.seat, layout.id, layout.params);
      }
    }
  }

  function updateMessages() {
    const s = engine.state;
    const k = s.kickoff;
    let caption = null;
    let big = null;
    let phone = null;
    if (replay.playing) {
      phone = { icon: '🎬', text: 'Watch the replay!' };
    } else if (s.phase === PHASE.TOSS) {
      const landed = s.toss.timeLeft < 0.6;
      const text = landed ? `${sideName(s.toss.winner)} kicks off!` : '🪙 Coin toss…';
      caption = { text: plain(landed ? text : (in3D ? 'Coin toss' : text)), color: landed ? sideColor(s.toss.winner) : (in3D ? '#ffe600' : '#ffffff') };
      phone = { icon: '🪙', text: landed ? text : 'Coin toss…' };
    } else if (s.phase === PHASE.KICKOFF && !renderer.banner) {
      const who = k.slot === null ? '🤖 Computer' : name(k.slot);
      caption = {
        text: plain(k.slot !== null && k.wait <= 0 ? `${who}: aim on your phone and let go! ⚽` : `${who} kicks off`),
        color: seatColor(k.slot),
      };
      phone = { icon: '⚽', text: `${who} kicks off` };
    } else if (s.phase === PHASE.COUNTDOWN) {
      big = String(Math.ceil(s.countdown));
      phone = { icon: big };
    }
    renderer.caption = caption;
    renderer.bigText = big;
    // The kicker sees the aiming circle instead, so the message is for everyone else.
    const kicker = s.phase === PHASE.KICKOFF && k?.slot ? k.slot : null;
    const key = JSON.stringify([phone, kicker]);
    if (key !== lastMessage) {
      lastMessage = key;
      host.message('all', phone);
      if (kicker) host.message(kicker, null);
    }
  }

  function handle(events) {
    const won = events.some((e) => e.type === 'win');
    renderer.handleEvents(won ? events.filter((e) => e.type !== 'point') : events, engine.state);
    for (const ev of events) {
      if (ev.type === 'hit') {
        sounds.kick(ev.power);
        freeze = KICK_FREEZE;
        const rod = engine.state.paddles.find((p) => p.id === ev.paddle);
        if (rod?.slot) host.vibrate(rod.slot, 15 + Math.round(ev.power * 25));
      } else if (ev.type === 'wall') sounds.thud();
      else if (ev.type === 'post') sounds.post();
      else if (ev.type === 'toss') sounds.go();
      else if (ev.type === 'countdown') sounds.tick();
      else if (ev.type === 'serve') sounds.whistle();
      else if (ev.type === 'kickoff') { sounds.whistle(); sounds.kick(0.6); }
      else if (ev.type === 'point') {
        sounds.whistle();
        host.report({ type: 'point-scored', side: ev.scorer, scores: { ...engine.state.scores } });
        if (!won) setTimeout(sounds.cheer, 250);
      } else if (ev.type === 'win') {
        if (replay.start()) renderer.replaying = true;
        else endMatch();
      }
    }
  }

  // Is the ball past the last defender and rolling straight at the goal mouth?
  // (Defenders let a ball behind them through, so nobody can stop it now.)
  function unstoppable() {
    const s = engine.state;
    const b = s.ball;
    if (s.phase !== PHASE.PLAYING || !b.visible || !b.vx) return false;
    const side = b.vx < 0 ? 'left' : 'right'; // the goal it's heading for
    const def = s.paddles.find((p) => p.side === side && p.lane === LANE.DEFENCE);
    if (!def) return false;
    const behind = side === 'left' ? b.x + BALL.radius < def.x - def.w / 2 : b.x - BALL.radius > def.x + def.w / 2;
    if (!behind) return false;
    const endX = side === 'left' ? 0 : COURT.width;
    const yAtLine = b.y + (b.vy / b.vx) * (endX - b.x);
    const diff = s.settings.difficulty;
    return yAtLine > rules.goalTop(diff) + BALL.radius && yAtLine < rules.goalBottom(diff) - BALL.radius;
  }

  return {
    start({ mode: modeId, options, players: list }) {
      players = list.map((p) => ({ ...p }));
      mode = modeId;
      ended = false;
      freeze = 0;
      pending = [];
      replay.stop();
      renderer.replaying = false;
      renderer.mode = mode;
      renderer.players = Object.fromEntries(players.map((p) => [p.seat, { avatar: p.avatar, color: p.color, art: p.art }]));
      for (const seat of Object.keys(layouts)) delete layouts[seat];
      engine.setSettings({ mode, difficulty: options.difficulty });
      const sides = Object.fromEntries(players.map((p) => [p.seat, p.side]));
      const colors = { ...Object.fromEntries(players.map((p) => [p.seat, p.color])), cpu: COLORS.cpu };
      const boosts = Object.fromEntries(players.map((p) => [p.seat, p.boost || 0]));
      engine.startMatch(players.map((p) => p.seat), { sides, colors, boosts });
      updateLayouts();
      host.report({ type: 'match-started' });
    },

    input(seat, control, value) {
      if (LANE_FOR[control] !== undefined && typeof value === 'number') {
        engine.setPaddle(seat, value, LANE_FOR[control]);
      } else if (control === 'kick' && value && Number.isFinite(value.angle)) {
        if (value.release) engine.kick(seat, value.angle, pending);
        else engine.aimKickoff(seat, value.angle);
      }
    },

    update(dt) {
      lastDt = dt;
      if (replay.playing) {
        const out = replay.advance(dt);
        if (out) {
          shown = { ...engine.state, phase: PHASE.PLAYING, kickoff: null, toss: null, ...out.frame };
          renderer.handleEvents(out.events, shown);
        } else {
          finishReplay();
        }
        updateMessages();
        return;
      }
      shown = null;
      if (ended) return;
      // Game feel: a split-second hold on each kick, and slow motion once nobody
      // can stop a ball heading into goal. Both slow the whole game evenly.
      if (freeze > 0 && !pending.length) { freeze -= dt; updateMessages(); return; }
      const events = [...pending, ...engine.step(dt * (unstoppable() ? SLOW_MOTION : 1))];
      pending = [];
      const s = engine.state;
      const scored = events.some((e) => e.type === 'point');
      if (s.phase === PHASE.PLAYING || scored) replay.record(performance.now() / 1000, s, events);
      if (scored && s.phase !== PHASE.OVER) replay.clear();
      handle(events);
      updateLayouts();
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

    // A kid joined during a team-v-computer match: the two kids then get one rod each.
    playerJoined(player) {
      if (mode !== 'team' || players.some((p) => p.seat === player.seat)) return false;
      players.push({ ...player, side: 'left' });
      renderer.players[player.seat] = { avatar: player.avatar, color: player.color, art: player.art };
      engine.colors[player.seat] = player.color;
      engine.addPlayer(player.seat, player.boost || 0);
      updateLayouts();
      return true;
    },

    stop() {
      replay.stop();
      renderer.destroy();
      canvas.remove();
    },
  };
}
