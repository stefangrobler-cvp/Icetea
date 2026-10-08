// Block Stacker's rules and physics: plain logic with no drawing, sound or page code,
// so it can be tested on its own (test/block-stacker.test.js).
//
// Team mode: everyone takes turns dropping blocks on one shared floating platform,
// while the computer sends gusts of wind and earthquakes (with a warning first). Stack
// up to the goal before the time runs out; every block that falls off costs a heart.
// Versus mode: everyone has their own tower and drops at the same time. Lose all your
// hearts and you're out; last one standing, or the most blocks when time runs out, wins.
// Each player has a force button there: a gust of wind or an earthquake that rocks
// everyone else's tower, then recharges.
//
// Blocks are plain bars ('classic') or shapes of 2-4 cubes that can be turned before
// dropping ('shapes'). With shapes, the team builds up to a height instead of a count.

import Matter from './vendor/matter.js';
import {
  WORLD, PLATFORM, BLOCK, WIRE_GAP, HANG, HEARTS, COUNTDOWN, AUTO_DROP, LOST_BELOW,
  NUDGE, BOOST, DIFFICULTIES, VERSUS_TIME, CELL, SHAPES, SHAPE_SETS, SHAPE_BOOST, SHAPE_GOAL, FORCE,
} from './config.js';

const { Engine: Physics, Bodies, Body, Composite, Events, Sleeping } = Matter;

export const PHASE = { COUNTDOWN: 'countdown', PLAYING: 'playing', OVER: 'over' };
export const FORCES = ['wind', 'quake'];
const STEP = 1000 / 120; // two physics steps per frame: steadier towers
const GRAVITY = 0.001; // Matter's gravity scale: a push of this x mass matches gravity

/**
 * Where a shape's cubes sit around its middle (its centre of mass), in world units.
 * cells: [[col, row]]. Returns { cells: [{ x, y }], w, h, top, bottom, hook }; hook is
 * where the cable holds it (the top cube nearest the middle).
 */
export function shapeLayout(cells, size) {
  const mx = cells.reduce((a, [c]) => a + c + 0.5, 0) / cells.length;
  const my = cells.reduce((a, [, r]) => a + r + 0.5, 0) / cells.length;
  const out = cells.map(([c, r]) => ({ x: (c + 0.5 - mx) * size, y: (r + 0.5 - my) * size }));
  const cols = cells.map(([c]) => c);
  const rows = cells.map(([, r]) => r);
  const top = Math.min(...out.map((p) => p.y)) - size / 2;
  const hookCell = out.filter((p) => p.y - size / 2 <= top + 0.01).sort((a, b) => Math.abs(a.x) - Math.abs(b.x))[0];
  return {
    cells: out,
    w: (Math.max(...cols) - Math.min(...cols) + 1) * size,
    h: (Math.max(...rows) - Math.min(...rows) + 1) * size,
    top,
    bottom: Math.max(...out.map((p) => p.y)) + size / 2,
    hook: { x: hookCell.x, y: top },
  };
}

/** A quarter turn clockwise (as seen on screen), moved back to start at column 0, row 0. */
export function turnCells(cells) {
  const turned = cells.map(([c, r]) => [-r, c]);
  const minC = Math.min(...turned.map(([c]) => c));
  const minR = Math.min(...turned.map(([, r]) => r));
  return turned.map(([c, r]) => [c - minC, r - minR]);
}

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
  startMatch(mode, players, { blocks = 'classic' } = {}) {
    this.physics = Physics.create({ enableSleeping: true, positionIterations: 14, velocityIterations: 10 });
    this.physics.gravity.y = 1;
    this.bodies = new Map(); // block id -> Matter body
    this.nextId = 1;
    this.acc = 0;
    this.players = {};
    for (const p of players) this.players[p.seat] = { boost: p.boost || 0, color: p.color, side: p.side };
    this.tiltBy = {};
    this.pending = [];

    const shapes = blocks === 'shapes';
    const goal = mode !== 'team' ? null : shapes ? SHAPE_GOAL[this.difficulty] : this.settings.goal;
    const s = {
      mode,
      shapes,
      phase: PHASE.COUNTDOWN,
      countdown: COUNTDOWN,
      time: mode === 'team' ? this.settings.time : VERSUS_TIME,
      goal, // team: blocks to stack (classic) or cubes high to build (shapes)
      goalY: goal === null ? null : PLATFORM.y - goal * (shapes ? CELL : BLOCK.height),
      towers: [],
      blocks: [], // { id, tower, x, y, angle, w, h, color, landed, cells?, size? }
      cameraTop: 0,
      cpuForceIn: mode === 'team' ? this.settings.glitchEvery : Infinity, // team: the computer's next force
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
      hearts: HEARTS, out: false, count: 0, height: 0, top: PLATFORM.y,
      hanging: null, // { w, h, color, seat, offset, phase, waited, cells?, size?, turns }
      force: null, // a force rocking this tower: { kind, from, warn, left, t, dir, power }
      windX: 0, // how far the wind is blowing the hanging block right now
      charge: FORCE.firstCharge, // tower race: seconds until the force button is ready
      chargeFull: FORCE.firstCharge, // ...out of this many
      forcesSent: 0,
      nextForce: FORCES[Math.floor(this.rng() * FORCES.length)],
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

  /** Shapes: turn this player's hanging shape a quarter turn. Returns whether it turned. */
  rotate(seat) {
    const s = this.state;
    if (this.paused || s.phase !== PHASE.PLAYING || !s.shapes) return false;
    const tower = s.towers.find((t) => !t.out && t.hanging && t.hanging.seat === seat);
    if (!tower) return false;
    const h = tower.hanging;
    if (h.shape === 'square') { h.turns += 1; return true; } // looks the same either way
    this.setShape(h, turnCells(h.grid));
    h.turns += 1;
    this.pending.push({ type: 'rotate', seat, tower: tower.index });
    return true;
  }

  /** Tower race: send this player's force (wind or earthquake) to everyone else's tower. */
  useForce(seat) {
    const s = this.state;
    if (this.paused || s.phase !== PHASE.PLAYING || s.mode !== 'versus') return false;
    const mine = s.towers.find((t) => t.seats[0] === seat);
    if (!mine || mine.out || mine.charge > 0) return false;
    const kind = mine.nextForce;
    const targets = s.towers.filter((t) => t !== mine && !t.out && !t.force);
    if (!targets.length) return false;
    for (const t of targets) this.startForce(t, kind, seat);
    mine.charge = FORCE.recharge;
    mine.chargeFull = FORCE.recharge;
    mine.forcesSent += 1;
    mine.nextForce = FORCES[Math.floor(this.rng() * FORCES.length)];
    this.pending.push({ type: 'force-sent', seat, kind, tower: mine.index });
    return true;
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
    const hanging = {
      seat, color: p.color || '#00f0ff',
      phase: this.rng() * Math.PI * 2, offset: 0, waited: 0, turns: 0,
      speed: this.settings.swingSpeed * (BOOST.swing[boost] || 1),
      swing: this.settings.swing,
    };
    if (this.state.shapes) {
      const set = SHAPE_SETS[boost > 0 ? 'helped' : this.difficulty];
      hanging.shape = set[Math.floor(this.rng() * set.length)];
      hanging.size = Math.round(CELL * (SHAPE_BOOST[boost] || 1));
      this.setShape(hanging, SHAPES[hanging.shape]);
    } else {
      const base = BLOCK.widths[Math.floor(this.rng() * BLOCK.widths.length)];
      hanging.w = Math.round(Math.min(base * (BOOST.width[boost] || 1), tower.width * 0.95));
      hanging.h = BLOCK.height;
    }
    tower.hanging = hanging;
    this.pending.push({ type: 'turn', seat, tower: tower.index });
  }

  setShape(h, grid) {
    const lay = shapeLayout(grid, h.size);
    Object.assign(h, { grid, cells: lay.cells, w: lay.w, h: lay.h, top: lay.top, bottom: lay.bottom, hook: lay.hook });
  }

  wireY(tower) {
    return Math.min(PLATFORM.y - WIRE_GAP - 40, tower.top - WIRE_GAP);
  }

  hangingPos(tower) {
    const h = tower.hanging;
    const range = tower.width * h.swing;
    const x = tower.x + Math.sin(h.phase) * range + (this.tiltBy[h.seat] || 0) * NUDGE.swing + tower.windX;
    return { x, y: this.wireY(tower) + HANG - (h.cells ? h.top : -h.h / 2) };
  }

  release(tower) {
    const h = tower.hanging;
    const { x, y } = this.hangingPos(tower);
    const id = this.nextId++;
    const feel = { friction: 1, frictionStatic: 10, frictionAir: 0.012, restitution: 0, density: 0.0016, slop: 0.02 };
    let body;
    if (h.cells) {
      // A shape: one body made of its cubes, so it tips and leans as a whole.
      const parts = h.cells.map((c) => Bodies.rectangle(x + c.x, y + c.y, h.size, h.size, { ...feel, chamfer: { radius: 3 } }));
      body = Body.create({ parts, ...feel, label: 'block' });
      // Matter adds up the cubes' own spin resistance but forgets how far each is from
      // the middle, so a shape would spin far too easily (and could fly off). Fix it here.
      const inertia = parts.reduce((sum, p) => sum + p.inertia + p.mass * ((p.position.x - body.position.x) ** 2 + (p.position.y - body.position.y) ** 2), 0);
      Body.setInertia(body, inertia);
    } else {
      body = Bodies.rectangle(x, y, h.w, h.h, { ...feel, chamfer: { radius: 3 }, label: 'block' });
    }
    body.plugin = { id, tower: tower.index, seat: h.seat };
    Composite.add(this.physics.world, body);
    this.bodies.set(id, body);
    const block = { id, tower: tower.index, seat: h.seat, x, y, angle: 0, w: h.w, h: h.h, color: h.color, landed: false };
    if (h.cells) Object.assign(block, { cells: h.cells, size: h.size, shape: h.shape });
    this.state.blocks.push(block);
    tower.hanging = null;
    tower.falling = id;
    tower.settle = 0;
    tower.sinceDrop = 0;
  }

  onCollisions(pairs) {
    for (const pair of pairs) {
      for (const part of [pair.bodyA, pair.bodyB]) {
        const body = part.parent || part; // a shape's cubes belong to one body
        const id = body.plugin?.id;
        if (!id) continue;
        const block = this.state.blocks.find((b) => b.id === id);
        if (!block || block.landed) continue;
        block.landed = true;
        const power = Math.min(1, body.speed / 14);
        this.pending.push({ type: 'land', seat: block.seat, tower: block.tower, power, x: body.position.x, y: block.cells ? body.bounds.max.y : body.position.y + block.h / 2 });
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
    this.updateForces(dt);

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
      this.applyForces(STEP / 1000);
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
      t.top = Math.min(PLATFORM.y, ...mine.map((b) => (b.cells ? this.bodies.get(b.id).bounds.min.y - 6 : b.y - b.h * 0.7)));
      // Shapes: how many cubes high the tower stands.
      if (this.state.shapes) t.height = Math.max(0, Math.floor((PLATFORM.y - t.top + 6 + CELL * 0.25) / CELL));
    }
  }

  // ---------- forces: wind and earthquakes ----------

  /** How hard forces rock this tower: gentler when someone on it has help. */
  forcePower(tower) {
    const boost = Math.max(0, ...tower.seats.map((seat) => this.players[seat]?.boost || 0));
    return FORCE.boost[boost] ?? 1;
  }

  startForce(tower, kind, from) {
    if (tower.out || tower.force) return;
    tower.force = { kind, from, warn: FORCE.warn, left: 0, t: 0, dir: this.rng() < 0.5 ? -1 : 1, power: this.forcePower(tower) };
    this.pending.push({ type: 'force-warn', kind, from, tower: tower.index });
  }

  updateForces(dt) {
    const s = this.state;
    // Team: the computer sends a force every so often (when none is already on).
    const team = s.mode === 'team' ? s.towers[0] : null;
    if (team && !team.force) {
      s.cpuForceIn -= dt;
      if (s.cpuForceIn <= 0) {
        s.cpuForceIn = this.settings.glitchEvery;
        this.startForce(team, FORCES[Math.floor(this.rng() * FORCES.length)], 'cpu');
      }
    }
    for (const t of s.towers) {
      if (s.mode === 'versus' && !t.out) t.charge = Math.max(0, t.charge - dt);
      const f = t.force;
      t.windX = 0;
      if (!f) continue;
      if (f.warn > 0) {
        f.warn -= dt;
        if (f.warn <= 0) {
          f.warn = 0;
          f.left = FORCE.last;
          f.t = 0;
          for (const b of s.blocks) if (b.tower === t.index) Sleeping.set(this.bodies.get(b.id), false);
          this.pending.push({ type: 'force', kind: f.kind, from: f.from, tower: t.index });
        }
        continue;
      }
      f.left -= dt;
      if (f.kind === 'wind') t.windX = f.dir * FORCE.windSwing * f.power * this.gust(f);
      if (f.left <= 0 || t.out) {
        t.force = null;
        t.windX = 0;
        Body.setPosition(t.platform, { x: t.baseX, y: t.platform.position.y });
        Body.setVelocity(t.platform, { x: 0, y: 0 });
        t.x = t.baseX;
      }
    }
  }

  /** A gust builds up and dies down: 0 -> 1 -> 0 over the force's time. */
  gust(f) {
    return Math.sin(Math.PI * Math.min(1, Math.max(0, f.t / FORCE.last)));
  }

  applyForces(dt) {
    for (const t of this.state.towers) {
      const f = t.force;
      if (!f || f.warn > 0 || f.left <= 0) continue;
      f.t += dt;
      if (f.kind === 'quake') {
        // The island shakes from side to side under the tower.
        const x = t.baseX + Math.sin(f.t * FORCE.quakeHz * Math.PI * 2) * this.settings.glitchPower * f.power;
        const dx = x - t.platform.position.x;
        Body.setPosition(t.platform, { x, y: t.platform.position.y });
        Body.setVelocity(t.platform, { x: dx, y: 0 });
        t.x = x;
      } else {
        // The wind pushes every block on the tower sideways, harder the higher it is
        // (the top of a tall tower sways; the bottom stays put).
        const push = f.dir * FORCE.wind[this.difficulty] * GRAVITY * f.power * this.gust(f);
        for (const b of this.state.blocks) {
          if (b.tower !== t.index) continue;
          const body = this.bodies.get(b.id);
          if (!body) continue;
          const up = Math.max(0, PLATFORM.y - body.position.y) / BLOCK.height;
          const lift = Math.min(FORCE.windTop, 0.4 + up * FORCE.windRise);
          Body.applyForce(body, body.position, { x: push * lift * body.mass, y: 0 });
        }
      }
    }
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
      if (this.score(t) >= s.goal && !t.falling) winner = 'team';
      else if (t.hearts === 0 || s.time <= 0) winner = 'cpu';
    } else {
      const alive = s.towers.filter((t) => !t.out);
      if (alive.length <= 1) winner = alive[0]?.side ?? null;
      else if (s.time <= 0) {
        const best = Math.max(...alive.map((t) => this.score(t)));
        const top = alive.filter((t) => this.score(t) === best);
        winner = top.length === 1 ? top[0].side : null;
      }
    }
    if (winner === undefined) return;
    s.phase = PHASE.OVER;
    s.winner = winner;
    for (const t of s.towers) t.hanging = null;
    this.pending.push({ type: 'win', winner });
  }

  /** A tower's score: blocks standing (classic) or cubes high (shapes). */
  score(t) {
    return this.state.shapes ? t.height : t.count;
  }

  /** Each side's score: blocks standing (team mode: blocks and hearts lost). */
  scores() {
    const s = this.state;
    if (s.mode === 'team') return { team: s.towers[0] ? this.score(s.towers[0]) : 0, cpu: HEARTS - (s.towers[0]?.hearts ?? HEARTS) };
    return Object.fromEntries(s.towers.map((t) => [t.side, this.score(t)]));
  }

  /** Where everything is, for drawing. */
  view() {
    const s = this.state;
    return {
      ...s,
      towers: s.towers.map((t) => ({
        index: t.index, x: t.x, width: t.width, seats: t.seats, side: t.side, hearts: t.hearts, out: t.out, count: t.count,
        height: t.height, score: this.score(t),
        wireY: this.wireY(t),
        force: t.force ? { kind: t.force.kind, from: t.force.from, warn: t.force.warn, on: t.force.warn <= 0, dir: t.force.dir, gust: t.force.warn > 0 ? 0 : this.gust(t.force) } : null,
        charge: t.charge,
        chargeFull: t.chargeFull,
        forcesSent: t.forcesSent,
        nextForce: t.nextForce,
        swing: this.settings.swing,
        hanging: t.hanging ? { ...t.hanging, ...this.hangingPos(t), left: AUTO_DROP - t.hanging.waited } : null,
      })),
    };
  }
}
