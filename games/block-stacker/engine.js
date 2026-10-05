// Block Stacker's rules and physics: plain logic with no drawing, sound or page code,
// so it can be tested on its own (test/block-stacker.test.js).
//
// Team mode: everyone takes turns dropping blocks on one shared floating platform,
// while the computer sends "glitch" shakes. Stack the goal before the time runs out;
// every block that falls off costs a heart.
// Versus mode: everyone has their own tower and drops at the same time. Lose all your
// hearts and you're out; last one standing, or the most blocks when time runs out, wins.

import Matter from './vendor/matter.js';
import {
  WORLD, PLATFORM, BLOCK, WIRE_GAP, HANG, HEARTS, COUNTDOWN, AUTO_DROP, LOST_BELOW,
  NUDGE, BOOST, DIFFICULTIES, VERSUS_TIME, GLITCH,
} from './config.js';

const { Engine: Physics, Bodies, Body, Composite, Events, Sleeping } = Matter;

export const PHASE = { COUNTDOWN: 'countdown', PLAYING: 'playing', OVER: 'over' };
const STEP = 1000 / 120; // two physics steps per frame: steadier towers

export class Engine {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.difficulty = 'easy';
    this.paused = false;
    this.pending = []; // events waiting to be returned by the next step()
    this.state = { phase: PHASE.OVER, towers: [], blocks: [], mode: 'team', winner: null };
  }

  setDifficulty(id) {
    if (DIFFICULTIES[id]) this.difficulty = id;
  }

  get settings() { return DIFFICULTIES[this.difficulty]; }

  /**
   * players: [{ seat, side, color, boost }]
   * mode 'team': one shared tower; 'versus': a tower each.
   */
  startMatch(mode, players) {
    this.physics = Physics.create({ enableSleeping: true, positionIterations: 14, velocityIterations: 10 });
    this.physics.gravity.y = 1;
    this.bodies = new Map(); // block id -> Matter body
    this.nextId = 1;
    this.acc = 0;
    this.players = {};
    for (const p of players) this.players[p.seat] = { boost: p.boost || 0, color: p.color, side: p.side };
    this.tiltBy = {};
    this.pending = [];

    const s = {
      mode,
      phase: PHASE.COUNTDOWN,
      countdown: COUNTDOWN,
      time: mode === 'team' ? this.settings.time : VERSUS_TIME,
      goal: mode === 'team' ? this.settings.goal : null,
      towers: [],
      blocks: [], // { id, tower, x, y, angle, w, h, color, landed }
      cameraTop: 0,
      glitch: { next: mode === 'team' ? this.settings.glitchEvery : Infinity, warn: 0, shake: 0 },
      winner: null,
      turn: 0, // team mode: index into towers[0].seats
    };
    this.state = s;

    if (mode === 'team') {
      s.towers.push(this.makeTower(0, WORLD.width / 2, PLATFORM.width, players.map((p) => p.seat).sort((a, b) => a - b), 'team'));
    } else {
      const sorted = [...players].sort((a, b) => a.seat - b.seat);
      const spacing = WORLD.width / sorted.length;
      const width = Math.min(PLATFORM.width, spacing * 0.62);
      sorted.forEach((p, i) => s.towers.push(this.makeTower(i, spacing * (i + 0.5), width, [p.seat], p.side)));
    }

    Events.on(this.physics, 'collisionStart', (e) => this.onCollisions(e.pairs));
  }

  makeTower(index, x, width, seats, side) {
    const platform = Bodies.rectangle(x, PLATFORM.y + PLATFORM.height / 2, width, PLATFORM.height, {
      isStatic: true, friction: 1, frictionStatic: 10, label: 'platform',
    });
    Composite.add(this.physics.world, platform);
    return {
      index, x, width, seats, side, platform, baseX: x,
      hearts: HEARTS, out: false, count: 0, top: PLATFORM.y,
      hanging: null, // { w, h, color, seat, offset, phase, waited }
      falling: null, // block id
      settle: 0, // seconds the falling block has been calm
      sinceDrop: 0,
      spawnIn: 0,
    };
  }

  /** Team mode: whose turn it is. Versus: the tower's owner. */
  currentSeat(tower) {
    if (this.state.mode !== 'team') return tower.seats[0];
    return tower.seats[this.state.turn % tower.seats.length];
  }

  addPlayer(seat, { side, color, boost = 0 } = {}) {
    if (this.state.mode !== 'team') return false;
    const tower = this.state.towers[0];
    if (!tower || tower.seats.includes(seat)) return false;
    this.players[seat] = { boost, color, side };
    tower.seats.push(seat);
    return true;
  }

  tilt(seat, value) {
    if (typeof value === 'number' && Number.isFinite(value)) this.tiltBy[seat] = Math.max(-1, Math.min(1, value));
  }

  /** A tap: drop this player's hanging block, if it's theirs to drop. Returns whether it dropped. */
  drop(seat) {
    const s = this.state;
    if (this.paused || s.phase !== PHASE.PLAYING) return false;
    const tower = s.towers.find((t) => !t.out && t.hanging && t.hanging.seat === seat);
    if (!tower) return false;
    this.release(tower);
    this.pending.push({ type: 'drop', seat, tower: tower.index });
    return true;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  // ---------- inside the match ----------

  spawn(tower) {
    const seat = this.currentSeat(tower);
    const p = this.players[seat] || {};
    const boost = p.boost || 0;
    const base = BLOCK.widths[Math.floor(this.rng() * BLOCK.widths.length)];
    const w = Math.round(Math.min(base * (BOOST.width[boost] || 1), tower.width * 0.95));
    tower.hanging = {
      seat, w, h: BLOCK.height, color: p.color || '#00f0ff',
      phase: this.rng() * Math.PI * 2, offset: 0, waited: 0,
      speed: this.settings.swingSpeed * (BOOST.swing[boost] || 1),
      swing: this.settings.swing,
    };
    this.pending.push({ type: 'turn', seat, tower: tower.index });
  }

  wireY(tower) {
    return Math.min(PLATFORM.y - WIRE_GAP - 40, tower.top - WIRE_GAP);
  }

  hangingPos(tower) {
    const h = tower.hanging;
    const range = tower.width * h.swing;
    const x = tower.x + Math.sin(h.phase) * range + (this.tiltBy[h.seat] || 0) * NUDGE.swing;
    return { x, y: this.wireY(tower) + HANG + h.h / 2 };
  }

  release(tower) {
    const h = tower.hanging;
    const { x, y } = this.hangingPos(tower);
    const id = this.nextId++;
    const body = Bodies.rectangle(x, y, h.w, h.h, {
      friction: 1, frictionStatic: 10, frictionAir: 0.012, restitution: 0, density: 0.0016, slop: 0.02,
      chamfer: { radius: 3 }, label: 'block',
    });
    body.plugin = { id, tower: tower.index, seat: h.seat };
    Composite.add(this.physics.world, body);
    this.bodies.set(id, body);
    this.state.blocks.push({ id, tower: tower.index, seat: h.seat, x, y, angle: 0, w: h.w, h: h.h, color: h.color, landed: false });
    tower.hanging = null;
    tower.falling = id;
    tower.settle = 0;
    tower.sinceDrop = 0;
  }

  onCollisions(pairs) {
    for (const pair of pairs) {
      for (const body of [pair.bodyA, pair.bodyB]) {
        const id = body.plugin?.id;
        if (!id) continue;
        const block = this.state.blocks.find((b) => b.id === id);
        if (!block || block.landed) continue;
        block.landed = true;
        const power = Math.min(1, body.speed / 14);
        this.pending.push({ type: 'land', seat: block.seat, tower: block.tower, power, x: body.position.x, y: body.position.y + block.h / 2 });
      }
    }
  }

  /** Advance dt seconds. Returns the events that happened. */
  step(dt) {
    const s = this.state;
    if (this.paused || s.phase === PHASE.OVER) return this.flush();

    if (s.phase === PHASE.COUNTDOWN) {
      const before = Math.ceil(s.countdown);
      s.countdown -= dt;
      if (Math.ceil(s.countdown) !== before && s.countdown > 0) this.pending.push({ type: 'countdown', n: Math.ceil(s.countdown) });
      if (s.countdown <= 0) {
        s.phase = PHASE.PLAYING;
        this.pending.push({ type: 'go' });
        for (const t of s.towers) this.spawn(t);
      }
      this.updateCamera(dt);
      return this.flush();
    }

    s.time = Math.max(0, s.time - dt);
    this.updateGlitch(dt);

    for (const t of s.towers) {
      if (t.out) continue;
      if (t.hanging) {
        t.hanging.phase += t.hanging.speed * dt;
        t.hanging.waited += dt;
        if (t.hanging.waited >= AUTO_DROP) {
          const seat = t.hanging.seat;
          this.release(t);
          this.pending.push({ type: 'drop', seat, tower: t.index, auto: true });
        }
      } else if (t.falling) {
        this.nudgeFalling(t, dt);
      } else if (t.spawnIn > 0) {
        t.spawnIn -= dt;
        if (t.spawnIn <= 0) this.spawn(t);
      }
    }

    // Physics in fixed small steps, so it behaves the same on every screen.
    this.acc += Math.min(dt, 0.1) * 1000;
    while (this.acc >= STEP) {
      this.moveGlitchPlatform(STEP / 1000);
      Physics.update(this.physics, STEP);
      this.acc -= STEP;
    }

    this.syncBlocks();
    for (const t of s.towers) this.checkFalling(t, dt);
    this.countTowers();
    this.updateCamera(dt);
    this.checkEnd();
    return this.flush();
  }

  flush() {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  nudgeFalling(tower, dt) {
    const body = this.bodies.get(tower.falling);
    const block = this.state.blocks.find((b) => b.id === tower.falling);
    if (!body || !block || block.landed) return;
    const push = (this.tiltBy[block.seat] || 0) * NUDGE.fall * dt * 60;
    const vx = Math.max(-NUDGE.maxFallSpeed, Math.min(NUDGE.maxFallSpeed, body.velocity.x + push * 0.1));
    Body.setVelocity(body, { x: vx, y: body.velocity.y });
  }

  checkFalling(tower, dt) {
    if (!tower.falling) return;
    const body = this.bodies.get(tower.falling);
    if (!body) { tower.falling = null; tower.spawnIn = 0.4; this.nextTurn(); return; }
    tower.sinceDrop += dt;
    const block = this.state.blocks.find((b) => b.id === tower.falling);
    const calm = block?.landed && body.speed < 0.35 && Math.abs(body.angularVelocity) < 0.02;
    tower.settle = calm ? tower.settle + dt : 0;
    if (tower.settle > 0.35 || tower.sinceDrop > 3) {
      tower.falling = null;
      tower.spawnIn = 0.35;
      this.nextTurn();
    }
  }

  nextTurn() {
    if (this.state.mode === 'team') this.state.turn += 1;
  }

  syncBlocks() {
    const s = this.state;
    const lost = [];
    for (const b of s.blocks) {
      const body = this.bodies.get(b.id);
      b.x = body.position.x;
      b.y = body.position.y;
      b.angle = body.angle;
      if (b.y > PLATFORM.y + LOST_BELOW) lost.push(b);
    }
    for (const b of lost) {
      Composite.remove(this.physics.world, this.bodies.get(b.id));
      this.bodies.delete(b.id);
      s.blocks = s.blocks.filter((x) => x.id !== b.id);
      const tower = s.towers[b.tower];
      if (tower.falling === b.id) {
        tower.falling = null;
        tower.spawnIn = 0.4;
        this.nextTurn();
      }
      if (tower.out || s.phase !== PHASE.PLAYING) continue;
      tower.hearts = Math.max(0, tower.hearts - 1);
      this.pending.push({ type: 'lost', seat: b.seat, tower: tower.index, x: b.x });
      if (tower.hearts === 0 && s.mode === 'versus') {
        tower.out = true;
        tower.hanging = null;
        this.pending.push({ type: 'out', seat: tower.seats[0], tower: tower.index });
      }
    }
  }

  countTowers() {
    for (const t of this.state.towers) {
      const mine = this.state.blocks.filter((b) => b.tower === t.index && b.landed && b.id !== t.falling);
      t.count = mine.length;
      // Highest point of the tower (blocks are drawn from their centre).
      t.top = Math.min(PLATFORM.y, ...mine.map((b) => b.y - b.h * 0.7));
    }
  }

  updateGlitch(dt) {
    const g = this.state.glitch;
    if (this.state.mode !== 'team') return;
    if (g.shake > 0) {
      g.shake -= dt;
      if (g.shake <= 0) {
        g.shake = 0;
        g.next = this.settings.glitchEvery;
        const t = this.state.towers[0];
        Body.setPosition(t.platform, { x: t.baseX, y: t.platform.position.y });
        Body.setVelocity(t.platform, { x: 0, y: 0 });
        t.x = t.baseX;
      }
    } else if (g.warn > 0) {
      g.warn -= dt;
      if (g.warn <= 0) {
        g.warn = 0;
        g.shake = GLITCH.shake;
        g.t = 0;
        for (const body of this.bodies.values()) Sleeping.set(body, false);
        this.pending.push({ type: 'glitch' });
      }
    } else {
      g.next -= dt;
      if (g.next <= 0) {
        g.warn = GLITCH.warn;
        this.pending.push({ type: 'warn' });
      }
    }
  }

  moveGlitchPlatform(dt) {
    const g = this.state.glitch;
    if (!(g.shake > 0)) return;
    const t = this.state.towers[0];
    g.t += dt;
    const x = t.baseX + Math.sin(g.t * GLITCH.hz * Math.PI * 2) * this.settings.glitchPower;
    const dx = x - t.platform.position.x;
    Body.setPosition(t.platform, { x, y: t.platform.position.y });
    Body.setVelocity(t.platform, { x: dx, y: 0 });
    t.x = x;
  }

  updateCamera(dt) {
    const s = this.state;
    const highest = Math.min(...s.towers.map((t) => this.wireY(t)));
    const target = Math.min(0, highest - 110);
    s.cameraTop += (target - s.cameraTop) * Math.min(1, dt * 2.5);
  }

  checkEnd() {
    const s = this.state;
    if (s.phase !== PHASE.PLAYING) return;
    let winner;
    if (s.mode === 'team') {
      const t = s.towers[0];
      if (t.count >= s.goal && !t.falling) winner = 'team';
      else if (t.hearts === 0 || s.time <= 0) winner = 'cpu';
    } else {
      const alive = s.towers.filter((t) => !t.out);
      if (alive.length <= 1) winner = alive[0]?.side ?? null;
      else if (s.time <= 0) {
        const best = Math.max(...alive.map((t) => t.count));
        const top = alive.filter((t) => t.count === best);
        winner = top.length === 1 ? top[0].side : null;
      }
    }
    if (winner === undefined) return;
    s.phase = PHASE.OVER;
    s.winner = winner;
    for (const t of s.towers) t.hanging = null;
    this.pending.push({ type: 'win', winner });
  }

  /** Each side's score: blocks standing (team mode: blocks and hearts lost). */
  scores() {
    const s = this.state;
    if (s.mode === 'team') return { team: s.towers[0]?.count || 0, cpu: HEARTS - (s.towers[0]?.hearts ?? HEARTS) };
    return Object.fromEntries(s.towers.map((t) => [t.side, t.count]));
  }

  /** Where everything is, for drawing. */
  view() {
    const s = this.state;
    return {
      ...s,
      towers: s.towers.map((t) => ({
        index: t.index, x: t.x, width: t.width, seats: t.seats, side: t.side, hearts: t.hearts, out: t.out, count: t.count,
        wireY: this.wireY(t),
        swing: this.settings.swing,
        hanging: t.hanging ? { ...t.hanging, ...this.hangingPos(t), left: AUTO_DROP - t.hanging.waited } : null,
      })),
    };
  }
}
