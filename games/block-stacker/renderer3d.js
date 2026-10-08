// Draws Block Stacker in 3D (three.js), seen from the front: chunky neon blocks that
// wear the face of whoever dropped them, floating voxel islands in a starry night sky,
// a laser wire, a waving block flag at the goal. Only reads the engine's view, never
// changes it; effects come from the engine's events. The world is 1600 x 900 game
// units (y grows downwards); here 80 units = 1 block-unit.
//
// Same interface as the flat renderer (renderer2d.js), which game.js uses instead
// on a screen without 3D: players, handleEvents(events, view), draw(view, dt), destroy().

import THREE from './vendor/three.js';
import { WORLD, PLATFORM, HEARTS, COLORS } from './config.js';

const S = 80;
const DEPTH = 1.0; // how deep the blocks are (the physics is flat; this is just for looks)
const wx = (x) => (x - WORLD.width / 2) / S;
const wy = (y) => -(y - WORLD.height / 2) / S;

const NIGHT = { sky: '#1c0c44', rock: ['#3b1d85', '#4a27a3', '#341a78'], top: '#2a1366', moss: '#0f8f8a' };
const ROBOT = {
  rows: ['.....yy.....', '.....kk.....', '.yyyyyyyyyy.', '.yyyyyyyyyy.', '.ykkkkkkkky.', '.ykcckkccky.',
    '.ykcckkccky.', '.ykkkkkkkky.', '.yyyyyyyyyy.', '.yykkkkkkyy.', '.yyyyyyyyyy.', '............'],
  palette: { y: '#ffe600', k: '#14082e', c: '#00f0ff' },
};
const HEART = { rows: ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], palette: { r: '#ff3b6b' } };
const HEART_EMPTY = { rows: HEART.rows, palette: { r: '#3b1d85' } };
const FLAG = { rows: ['kwkwk', 'wkwkw', 'kwkwk'], palette: { k: '#14082e', w: '#f4f2ff' } };
const CUBE = { rows: ['.cccc', 'cwwwc', 'cwwwc', 'cwwwc', 'cccc.'], palette: { c: '#7d8cff', w: '#c9d0ff' } };
const DIGITS = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
};
const SPARKS = ['#00f0ff', '#ff2bd6', '#39ff7a', '#ff9f1c', '#ffe600'];
// Forces: a gust of wind and an earthquake (same pictures as the phone buttons).
const FORCE_ART = {
  wind: { rows: ['......uu..', '........u.', 'uuuuuuuuu.', '..........', '.wwwwwwwww', '..........', 'uuuuuuu...', '.......u..', '.....uu...'], palette: { u: '#7fd8ff', w: '#f4f2ff' } },
  quake: { rows: ['m.......m', '.m.....m.', '.........', 'nnnnynnnn', 'nnnyynnnn', 'NNNNyyNNN', 'nnnnnynnn', 'nnnnyynnn'], palette: { m: '#ff2bd6', N: '#6b4129', n: '#9a6440', y: '#ffe600' } },
};

const rnd = (() => { let s = 23; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

/** Can this screen draw in 3D? */
export function canDraw3D() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Pixel art onto a canvas, `cell` screen pixels per art pixel. */
function paint(ctx, art, ox, oy, cell) {
  art.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || !art.palette[ch]) return;
    ctx.fillStyle = art.palette[ch];
    ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
  }));
}
function artURL(art, cell = 6) {
  const c = document.createElement('canvas');
  c.width = art.rows[0].length * cell;
  c.height = art.rows.length * cell;
  paint(c.getContext('2d'), art, 0, 0, cell);
  return c.toDataURL();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.players = {}; // seat -> { avatar, color, art }
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(NIGHT.sky);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 300);
    try {
      this.composer = new THREE.EffectComposer(r);
      this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
      this.composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.65, 0.4, 0.86));
    } catch {
      this.composer = null;
    }

    this.unit = new THREE.BoxGeometry(1, 1, 1);
    this.lam = new Map();
    this.textures = new Map();
    this.blocks = new Map(); // block id -> mesh
    this.towers = new Map(); // tower index -> { group, key, wire, cable, posts, guide, face, ring, label }
    this.debris = [];
    this.time = 0;
    this.shake = 0;
    this.flash = 0;
    this.camY = 0;
    this.countShown = null;
    this.frames = 0;
    this.slowFrames = 0;

    this.buildWorld();
    this.buildEffects();
    this.buildOverlay();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  // ---------- building ----------

  mat(color, extra) {
    const key = color + (extra ? JSON.stringify(extra) : '');
    if (!this.lam.has(key)) this.lam.set(key, new THREE.MeshLambertMaterial({ color, ...extra }));
    return this.lam.get(key);
  }

  box(w, h, d, material, x, y, z, parent = this.scene) {
    const m = new THREE.Mesh(this.unit, material);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  buildWorld() {
    const { scene } = this;
    scene.add(new THREE.HemisphereLight('#c9b8ff', '#2a1366', 0.7));
    const sun = new THREE.DirectionalLight('#ffffff', 0.6);
    sun.position.set(-6, 14, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 30, bottom: -10, near: 1, far: 60 });
    scene.add(sun);
    this.sun = sun;
    scene.add(sun.target);
    const front = new THREE.DirectionalLight('#ffffff', 0.25);
    front.position.set(0, 4, 20);
    scene.add(front);

    // Stars and distant floating islands behind the towers; they drift as the camera climbs.
    this.stars = [];
    const starColors = ['#f4f2ff', '#c9b8ff', '#9d8cff', '#f4f2ff', '#7fd8ff'];
    for (let i = 0; i < 110; i++) {
      const m = this.box(0.07, 0.07, 0.07, new THREE.MeshBasicMaterial({ color: starColors[i % 5], transparent: true, opacity: 0.7 }), (rnd() - 0.5) * 90, -10 + rnd() * 80, -32 - rnd() * 14);
      m.castShadow = false;
      this.stars.push({ m, ph: rnd() * 6 });
    }
    for (const [x, y, z, s] of [[-14, 1, -12, 1.6], [13, 6, -14, 1.2], [-9, 14, -16, 1.4], [11, 22, -15, 1.8], [-12, 30, -17, 1.2], [8, 40, -14, 1.5]]) {
      this.island(x, y, z, 3 * s, null);
    }
  }

  // A floating voxel island: a slab on top and a stepped rock underneath.
  island(x, y, z, width, parent) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.box(width, 0.35, width * 0.6, this.mat(NIGHT.top), 0, 0, 0, g);
    this.box(width * 0.9, 0.12, width * 0.5, this.mat(NIGHT.moss), 0, 0.22, 0, g);
    [0.8, 0.58, 0.36, 0.16].forEach((k, i) => this.box(width * k, 0.45, width * 0.55 * k, this.mat(NIGHT.rock[i % 3]), (i % 2 ? 0.1 : -0.1) * width, -0.4 - i * 0.45, 0, g));
    (parent || this.scene).add(g);
    return g;
  }

  buildEffects() {
    this.debrisPool = Array.from({ length: 120 }, () => {
      const m = new THREE.Mesh(this.unit, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true }));
      m.visible = false;
      this.scene.add(m);
      return { m, v: new THREE.Vector3(), life: 0, max: 1, s: 0.2 };
    });
    // Goal: a line of small blocks and a waving checkered flag made of blocks.
    this.goal = new THREE.Group();
    this.goal.visible = false;
    this.goalLine = new THREE.MeshBasicMaterial({ color: COLORS.cpu });
    this.goalDots = Array.from({ length: 14 }, (_, i) => this.box(0.22, 0.08, 0.22, this.goalLine, 0, 0, 0, this.goal));
    this.pole = this.box(0.1, 1.6, 0.1, this.mat('#f4f2ff'), 0, 0.8, 0, this.goal);
    this.flagCells = [];
    FLAG.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const m = this.box(0.2, 0.2, 0.08, new THREE.MeshLambertMaterial({ color: FLAG.palette[ch], emissive: ch === 'w' ? '#605a80' : '#000000' }), 0.15 + x * 0.2, 1.45 - y * 0.2, 0, this.goal);
      this.flagCells.push({ m, x, y });
    }));
    this.scene.add(this.goal);
    // The countdown number.
    this.countGroup = new THREE.Group();
    this.scene.add(this.countGroup);
  }

  buildOverlay() {
    const host = this.canvas.parentElement || document.body;
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:"Press Start 2P",Fredoka,monospace;color:#f4f2ff;';
    el.innerHTML = `
      <div data-v="vignette" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center, rgba(255,40,80,0) 45%, rgba(255,40,80,0.75) 100%)"></div>
      <div data-v="team" style="position:absolute;left:18px;top:14px;display:flex;flex-direction:column;gap:10px"></div>
      <div data-v="timer" style="position:absolute;left:50%;top:18px;translate:-50% 0;display:flex;gap:4px"></div>
      <img data-v="robot" alt="" style="position:absolute;right:20px;top:72px;width:64px;image-rendering:pixelated">
      <div data-v="labels"></div>`;
    host.appendChild(el);
    this.overlay = el;
    this.ui = Object.fromEntries([...el.querySelectorAll('[data-v]')].map((n) => [n.dataset.v, n]));
    this.ui.robot.src = artURL(ROBOT);
    this.heartURL = artURL(HEART, 5);
    this.heartEmptyURL = artURL(HEART_EMPTY, 5);
    this.cubeURL = artURL(CUBE, 6);
    this.flagURL = artURL(FLAG, 8);
    this.timerCells = Array.from({ length: 20 }, () => {
      const d = document.createElement('i');
      d.style.cssText = 'display:block;width:clamp(10px,1.6vw,22px);height:16px;border-radius:2px;background:#7d8cff';
      this.ui.timer.appendChild(d);
      return d;
    });
    this.hudKey = '';
  }

  colorOf(seat) {
    return this.players[seat]?.color || COLORS.line;
  }

  artOf(seat) {
    return this.players[seat]?.art || null;
  }

  // ---------- blocks: neon boxes wearing their builder's animal on the front ----------

  faceMaterial(seat, w, h, color, withArt = true) {
    const key = `${seat}:${w}:${h}:${color}:${withArt}`;
    if (this.textures.has(key)) return this.textures.get(key);
    const H = 48;
    const W = Math.round((H * w) / h);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = color;
    x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(0,0,0,0.28)';
    x.fillRect(3, 3, W - 6, H - 6);
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillRect(0, 0, W, 3);
    const art = withArt ? this.artOf(seat) : null;
    if (art) {
      const cell = Math.floor((H - 10) / art.rows.length);
      paint(x, art, Math.round(W / 2 - (art.rows[0].length * cell) / 2), Math.round(H / 2 - (art.rows.length * cell) / 2), cell);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    const face = new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 });
    this.textures.set(key, face);
    return face;
  }

  makeBlock(seat, w, h, color) {
    const side = this.mat(color, { emissive: color, emissiveIntensity: 0.4 });
    const top = this.mat(color, { emissive: color, emissiveIntensity: 0.7 });
    const face = this.faceMaterial(seat, w, h, color);
    // Box faces: +x, -x, +y (top), -y, +z (front, towards the viewer), -z.
    const m = new THREE.Mesh(this.unit, [side, side, top, side, face, side]);
    m.scale.set(w / S, h / S, DEPTH);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.pop = 0;
    this.scene.add(m);
    return m;
  }

  /** A shape: one cube per cell around its middle; the animal rides the middle cube. */
  makeShape(seat, cells, size, color) {
    const g = new THREE.Group();
    const side = this.mat(color, { emissive: color, emissiveIntensity: 0.4 });
    const top = this.mat(color, { emissive: color, emissiveIntensity: 0.7 });
    const middle = cells.reduce((best, c) => (Math.hypot(c.x, c.y) < Math.hypot(best.x, best.y) ? c : best));
    for (const c of cells) {
      const face = this.faceMaterial(seat, size, size, color, c === middle);
      const m = new THREE.Mesh(this.unit, [side, side, top, side, face, side]);
      m.scale.set((size / S) * 0.98, (size / S) * 0.98, DEPTH);
      m.position.set(c.x / S, -c.y / S, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    g.userData.pop = 0;
    g.userData.shape = true;
    this.scene.add(g);
    return g;
  }

  syncBlocks(view) {
    const seen = new Set();
    for (const b of view.blocks) {
      seen.add(b.id);
      let m = this.blocks.get(b.id);
      if (!m) {
        m = b.cells ? this.makeShape(b.seat, b.cells, b.size, b.color) : this.makeBlock(b.seat, b.w, b.h, b.color);
        this.blocks.set(b.id, m);
      }
      m.position.set(wx(b.x), wy(b.y), 0);
      m.rotation.z = -b.angle;
      // A little squash when it lands.
      m.userData.pop = Math.max(0, m.userData.pop - this.dt * 4);
      const k = Math.sin(m.userData.pop * Math.PI) * 0.12;
      if (m.userData.shape) m.scale.set(1 + k, 1 - k, 1);
      else m.scale.set((b.w / S) * (1 + k), (b.h / S) * (1 - k), DEPTH);
    }
    for (const [id, m] of this.blocks) if (!seen.has(id)) { this.scene.remove(m); this.blocks.delete(id); }
  }

  // ---------- towers: island platform, laser wire, hanging block ----------

  syncTowers(view) {
    for (const t of view.towers) {
      const color = view.mode === 'team' ? COLORS.line : this.colorOf(t.seats[0]);
      const key = `${t.width}:${color}`;
      let v = this.towers.get(t.index);
      if (!v || v.key !== key) {
        if (v) { this.scene.remove(v.group); this.scene.remove(v.wireGroup); v.label?.remove(); }
        const group = new THREE.Group();
        const width = t.width / S;
        // The island: top slab exactly where the physics platform is, glowing rim in the tower's colour.
        this.box(width, PLATFORM.height / S, 1.6, this.mat(NIGHT.top), 0, 0, 0, group);
        const rim = new THREE.MeshBasicMaterial({ color });
        this.box(width + 0.08, 0.06, 0.08, rim, 0, PLATFORM.height / S / 2, 0.8, group);
        [0.86, 0.62, 0.4, 0.2].forEach((k, i) => this.box(width * k, 0.42, 1.4 * k + 0.2, this.mat(NIGHT.rock[i % 3]), (i % 2 ? 0.08 : -0.08) * width, -0.32 - i * 0.42, 0, group));
        const glow = this.box(width * 0.5, 0.05, 0.6, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }), 0, -2.1, 0, group);
        glow.castShadow = false;
        this.scene.add(group);
        // The laser wire and its posts, the cable to the hanging block, the landing guide.
        const wireGroup = new THREE.Group();
        const pink = new THREE.MeshBasicMaterial({ color: COLORS.wire });
        const wire = this.box(1, 0.06, 0.06, pink, 0, 0, 0, wireGroup);
        const posts = [this.box(0.22, 0.22, 0.22, pink, 0, 0, 0, wireGroup), this.box(0.22, 0.22, 0.22, pink, 0, 0, 0, wireGroup)];
        const cable = this.box(0.04, 1, 0.04, pink, 0, 0, 0, wireGroup);
        const guideMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 });
        const guide = Array.from({ length: 24 }, () => this.box(0.08, 0.08, 0.08, guideMat, 0, 0, 0, wireGroup));
        const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
        const ring = Array.from({ length: 12 }, (_, i) => {
          const a = -Math.PI / 2 - (i / 12) * Math.PI * 2;
          const m = this.box(0.09, 0.09, 0.09, ringMat, Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0, wireGroup);
          m.userData.a = a;
          return m;
        });
        this.scene.add(wireGroup);
        // Versus: who the tower belongs to, its hearts and blocks, under the island.
        let label = null;
        if (view.mode === 'versus') {
          label = document.createElement('div');
          label.style.cssText = 'position:absolute;translate:-50% 0;display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;background:rgba(22,9,52,0.7);font-size:14px;white-space:nowrap';
          this.ui.labels.appendChild(label);
        }
        // Forces: a warning picture over the tower, and streaks for the wind.
        const streakMat = new THREE.MeshBasicMaterial({ color: '#c9f4ff', transparent: true, opacity: 0 });
        const streaks = Array.from({ length: 12 }, () => {
          const m = this.box(1.1, 0.05, 0.05, streakMat, 0, 0, 0.9, wireGroup);
          m.castShadow = false;
          m.visible = false;
          return m;
        });
        v = { group, wireGroup, key, wire, posts, cable, guide, ring, ringMat, face: null, faceSeat: null, label, labelKey: '', streaks, streakMat, warn: null, warnKey: '', spin: 0, turns: 0 };
        this.towers.set(t.index, v);
      }
      v.group.position.set(wx(t.x), wy(PLATFORM.y + PLATFORM.height / 2), 0);
      this.drawForce(t, v, view);
      v.group.visible = true;
      v.group.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.opacity = o.material.transparent ? (t.out ? 0.2 : o.material.opacity) : 1; });

      const hb = t.hanging;
      const live = !t.out && view.phase === 'playing';
      const span = (t.width * (t.swing || 0.6) + 90) / S;
      const y = wy(t.wireY);
      v.wireGroup.visible = !t.out;
      v.wire.position.set(wx(t.x), y, 0);
      v.wire.scale.x = span * 2;
      v.posts[0].position.set(wx(t.x) - span, y, 0);
      v.posts[1].position.set(wx(t.x) + span, y, 0);
      v.cable.visible = Boolean(hb) && live;
      v.ring.forEach((m) => { m.visible = false; });
      v.guide.forEach((m) => { m.visible = false; });
      if (v.face) v.face.visible = false;
      if (hb && live) {
        const hx = wx(hb.x);
        const top = wy(hb.y + (hb.cells ? hb.top : -hb.h / 2));
        v.cable.position.set(hx + (hb.hook?.x || 0) / S, (y + top) / 2, 0);
        v.cable.scale.y = Math.max(0.05, y - top);
        // Where it will land: dots straight down to the tower top.
        const bottom = wy(hb.y + (hb.cells ? hb.bottom : hb.h / 2));
        const floor = wy(PLATFORM.y);
        v.guide.forEach((m, i) => {
          const gy = bottom - 0.35 - i * 0.42;
          m.visible = gy > floor;
          m.position.set(hx, gy, 0.3);
        });
        // Whose turn: their animal rides the wire, with a ring that runs down before it drops by itself.
        if (v.faceSeat !== hb.seat) {
          if (v.face) v.wireGroup.remove(v.face);
          const art = this.artOf(hb.seat);
          v.face = art ? this.sprite(art, 0.95) : null;
          if (v.face) v.wireGroup.add(v.face);
          v.faceSeat = hb.seat;
        }
        if (v.face) {
          v.face.visible = true;
          v.face.position.set(hx, y + 0.7 + Math.abs(Math.sin(this.time * 4)) * 0.12, 0.2);
        }
        if (hb.left < 5) {
          v.ringMat.color.set(hb.color);
          const share = Math.max(0, hb.left / 5);
          v.ring.forEach((m, i) => {
            m.visible = i / v.ring.length < share;
            m.position.set(hx + Math.cos(m.userData.a) * 0.62, y + 0.7 + Math.sin(m.userData.a) * 0.62, 0.2);
          });
        }
        // The hanging block itself (an engine block only exists once it's dropped).
        // A shape that was just turned spins round into its new place.
        if (hb.cells && hb.seat === v.hangSeat && hb.turns === v.turns + 1) v.spin = Math.PI / 2;
        v.turns = hb.turns || 0;
        const hangKey = hb.cells ? `${hb.seat}:${hb.shape}:${hb.size}:${JSON.stringify(hb.grid)}` : `${hb.seat}:${hb.w}`;
        if (!v.hanging || v.hangKey !== hangKey) {
          if (v.hanging) this.scene.remove(v.hanging);
          v.hanging = hb.cells ? this.makeShape(hb.seat, hb.cells, hb.size, hb.color) : this.makeBlock(hb.seat, hb.w, hb.h, hb.color);
          v.hangKey = hangKey;
        }
        v.hangSeat = hb.seat;
        v.spin = Math.max(0, v.spin - this.dt * 9);
        v.hanging.visible = true;
        v.hanging.position.set(hx, wy(hb.y), 0);
        v.hanging.rotation.z = Math.sin(this.time * 3) * 0.04 + v.spin * v.spin * (2 / Math.PI);
      } else if (v.hanging) {
        v.hanging.visible = false;
      }

      if (v.label) {
        const who = this.artOf(t.seats[0]);
        const ready = !t.out && view.phase === 'playing' && t.charge <= 0 ? t.nextForce : '';
        const labelKey = `${t.hearts}:${t.score}:${t.out}:${ready}`;
        if (labelKey !== v.labelKey) {
          v.labelKey = labelKey;
          const hearts = Array.from({ length: HEARTS }, (_, i) => `<img src="${i < t.hearts ? this.heartURL : this.heartEmptyURL}" style="width:22px;image-rendering:pixelated">`).join('');
          v.label.innerHTML = `${who ? `<img src="${artURL(who, 3)}" style="width:32px;image-rendering:pixelated;opacity:${t.out ? 0.4 : 1}">` : ''}${hearts}<img src="${this.cubeURL}" style="width:20px;image-rendering:pixelated;margin-left:4px">${t.score}${
            ready ? `<img src="${artURL(FORCE_ART[ready], 3)}" style="width:30px;image-rendering:pixelated;margin-left:6px;filter:drop-shadow(0 0 6px #7fd8ff)">` : ''}`;
          v.label.style.boxShadow = `0 0 0 3px ${this.colorOf(t.seats[0])}`;
        }
        const p = new THREE.Vector3(wx(t.x), wy(PLATFORM.y) - 2.3, 0.8).project(this.camera);
        v.label.style.left = `${(p.x * 0.5 + 0.5) * this.width}px`;
        v.label.style.top = `${(-p.y * 0.5 + 0.5) * this.height}px`;
      }
    }
  }

  // Wind or an earthquake on this tower: its picture bobs over the tower as a warning
  // (with the sender's animal in the tower race), then wind streaks blow across.
  drawForce(t, v, view) {
    const f = t.out ? null : t.force;
    const warnKey = f && !f.on ? `${f.kind}:${view.mode === 'versus' ? f.from : ''}` : '';
    if (warnKey !== v.warnKey) {
      v.warnKey = warnKey;
      if (v.warn) v.wireGroup.remove(v.warn);
      v.warn = null;
      if (warnKey) {
        v.warn = new THREE.Group();
        v.warn.add(this.sprite(FORCE_ART[f.kind], 1.5));
        const from = view.mode === 'versus' ? this.artOf(f.from) : null;
        if (from) {
          const who = this.sprite(from, 0.8);
          who.position.set(1.1, 0.35, 0);
          v.warn.add(who);
        }
        v.wireGroup.add(v.warn);
      }
    }
    if (v.warn) {
      v.warn.position.set(wx(t.x), wy(t.wireY) + 2.0 + Math.sin(this.time * 6) * 0.1, 0.4);
      v.warn.scale.setScalar(1 + Math.abs(Math.sin(this.time * 10)) * 0.15);
    }
    const blowing = f?.on && f.kind === 'wind';
    v.streakMat.opacity = blowing ? 0.65 * f.gust : 0;
    const span = (t.width / S) * 1.3;
    const yTop = wy(t.wireY) - 0.4;
    const yBottom = wy(PLATFORM.y) + 0.3;
    v.streaks.forEach((m, i) => {
      m.visible = Boolean(blowing);
      if (!blowing) return;
      const run = ((this.time * 12 + i * 1.37) % (span * 2)) - span;
      m.position.set(wx(t.x) + f.dir * run, yBottom + ((i * 0.618) % 1) * (yTop - yBottom), 0.9);
    });
  }

  sprite(art, size) {
    const key = `sprite:${art.rows.join('|')}`;
    let material = this.textures.get(key);
    if (!material) {
      const c = document.createElement('canvas');
      c.width = art.rows[0].length * 8;
      c.height = art.rows.length * 8;
      paint(c.getContext('2d'), art, 0, 0, 8);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      material = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 });
      this.textures.set(key, material);
    }
    const s = new THREE.Sprite(material);
    s.scale.set(size, size * (art.rows.length / art.rows[0].length), 1);
    return s;
  }

  // ---------- goal flag, countdown, HUD ----------

  drawGoal(view) {
    const t = view.towers[0];
    this.goal.visible = view.mode === 'team' && Boolean(view.goal) && Boolean(t);
    if (!this.goal.visible) return;
    const reached = t.score >= view.goal;
    this.goalLine.color.set(reached ? '#39ff7a' : COLORS.cpu);
    const y = wy(view.goalY);
    const half = (t.width / S) * 0.9;
    this.goal.position.set(wx(t.x), y, 0.4);
    this.goalDots.forEach((m, i) => {
      m.position.set(-half + (i / (this.goalDots.length - 1)) * half * 2, Math.sin(this.time * 3 + i * 0.5) * 0.03, 0);
    });
    this.pole.position.set(half + 0.25, 0.8, 0);
    this.flagCells.forEach(({ m, x, y: fy }) => {
      m.position.set(half + 0.4 + x * 0.2, 1.45 - fy * 0.2 + Math.sin(this.time * 5 - x * 0.9) * 0.06 * x, Math.sin(this.time * 5 - x * 0.9) * 0.05 * x);
    });
  }

  setDigit(group, n, color, size) {
    group.clear();
    if (n == null) return;
    const cells = [];
    DIGITS[n].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '1') cells.push([x, y]); }));
    const mesh = new THREE.InstancedMesh(this.unit, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.6 }), cells.length);
    const m4 = new THREE.Matrix4();
    cells.forEach(([x, y], k) => { m4.makeScale(size * 0.94, size * 0.94, size * 0.94).setPosition((x - 1) * size, (2 - y) * size, 0); mesh.setMatrixAt(k, m4); });
    group.add(mesh);
  }

  drawCountdown(view) {
    const n = view.phase === 'countdown' ? Math.max(1, Math.ceil(view.countdown)) : null;
    if (n !== this.countShown) {
      this.countShown = n;
      this.setDigit(this.countGroup, n, '#f4f2ff', 0.55);
      this.countPop = 1;
    }
    this.countPop = Math.max(0, (this.countPop || 0) - this.dt * 2.5);
    this.countGroup.scale.setScalar(1 + Math.sin(this.countPop * Math.PI) * 0.35);
    this.countGroup.position.set(0, this.camY + 0.6, 2);
  }

  drawHud(view) {
    const team = view.mode === 'team' ? view.towers[0] : null;
    const turn = team?.hanging?.seat ?? null;
    const key = JSON.stringify([view.mode, team?.hearts, team?.score, view.goal, team?.seats, turn]);
    if (key !== this.hudKey) {
      this.hudKey = key;
      if (team) {
        const animals = team.seats.map((seat) => {
          const art = this.artOf(seat);
          if (!art) return '';
          const on = seat === turn;
          return `<img src="${artURL(art, 4)}" style="width:${on ? 56 : 38}px;image-rendering:pixelated;filter:drop-shadow(0 0 ${on ? 10 : 0}px ${this.colorOf(seat)});opacity:${on ? 1 : 0.6};${on ? 'animation:bs-hop 0.6s ease-in-out infinite' : ''}">`;
        }).join('');
        const hearts = Array.from({ length: HEARTS }, (_, i) => `<img src="${i < team.hearts ? this.heartURL : this.heartEmptyURL}" style="width:30px;image-rendering:pixelated">`).join('');
        this.ui.team.innerHTML = `<style>@keyframes bs-hop{50%{transform:translateY(-6px)}}</style>
          <div style="display:flex;gap:8px;align-items:end;min-height:58px">${animals}</div>
          <div style="display:flex;gap:6px">${hearts}</div>
          <div style="display:flex;gap:10px;align-items:center;font-size:clamp(16px,2vw,26px)"><img src="${this.cubeURL}" style="width:30px;image-rendering:pixelated">${team.score} / ${view.goal}<img src="${this.flagURL}" style="width:34px;image-rendering:pixelated"></div>`;
      } else {
        this.ui.team.innerHTML = '';
      }
    }
    this.ui.robot.hidden = !team;
    const f = team?.force;
    const alarm = Boolean(f);
    this.ui.robot.style.transform = alarm ? `rotate(${Math.sin(this.time * 30) * 12}deg) scale(1.15)` : '';
    this.ui.robot.style.filter = alarm ? 'drop-shadow(0 0 12px #ff3b6b)' : 'drop-shadow(0 0 8px #ffe600)';
    // Time left as a row of blocks that go out one by one.
    const share = view.totalTime ? Math.max(0, view.time / view.totalTime) : 0;
    this.timerCells.forEach((c, i) => {
      const on = i / this.timerCells.length < share;
      c.style.background = on ? (share < 0.2 ? '#ff3b6b' : '#7d8cff') : 'rgba(125,140,255,0.15)';
    });
    // Red glow (team): a warning before a force, the force itself, and a flash when a block falls off.
    const warn = f && !f.on ? 0.45 + 0.35 * Math.sin(this.time * 18) : 0;
    this.flash = Math.max(0, this.flash - this.dt * 2);
    this.ui.vignette.style.opacity = String(Math.max(warn, this.flash, f?.on ? 0.5 : 0));
  }

  // ---------- effects ----------

  burst(x, y, z, color, n, power, up = 4, size = 0.18) {
    let k = 0;
    for (const d of this.debrisPool) {
      if (d.life > 0) continue;
      d.m.material.color.set(color);
      d.m.position.set(x, y, z);
      d.m.visible = true;
      d.v.set((rnd() * 2 - 1) * power, rnd() * up + 1, (rnd() * 2 - 1) * power * 0.5);
      d.max = d.life = 0.5 + rnd() * 0.6;
      d.s = size * (0.6 + rnd() * 0.8);
      if (++k >= n) break;
    }
  }

  handleEvents(events, view) {
    for (const ev of events) {
      if (ev.type === 'land') {
        const color = this.colorOf(ev.seat);
        this.burst(wx(ev.x), wy(ev.y), 0.5, color, 8 + Math.round(ev.power * 14), 2 + ev.power * 2);
        this.shake = Math.max(this.shake, 0.08 + ev.power * 0.18);
        const t = view.towers[ev.tower];
        const top = view.blocks.filter((b) => b.tower === ev.tower).sort((a, b) => a.y - b.y)[0];
        const m = top && this.blocks.get(top.id);
        if (m) m.userData.pop = 1;
        if (t && view.mode === 'team' && t.count + 1 === view.goal) this.shake = 0.3;
      } else if (ev.type === 'lost') {
        this.flash = 0.9;
        this.shake = Math.max(this.shake, 0.35);
        this.burst(wx(ev.x), wy(PLATFORM.y) - 3, 0.5, this.colorOf(ev.seat), 22, 3, 6, 0.24);
      } else if (ev.type === 'drop') {
        const t = view.towers[ev.tower];
        if (t) this.burst(wx(t.hanging?.x ?? t.x), wy(t.wireY), 0.3, COLORS.wire, 6, 1.2, 2, 0.12);
      } else if (ev.type === 'force') {
        const t = view.towers[ev.tower];
        if (ev.kind === 'quake') {
          this.shake = Math.max(this.shake, 0.6);
          // Dust and rock bits shaken off the island.
          if (t) for (const side of [-1, 1]) this.burst(wx(t.x) + side * (t.width / S) * 0.45, wy(PLATFORM.y) - 0.3, 0.6, NIGHT.rock[1], 10, 1.5, 3, 0.16);
        }
      } else if (ev.type === 'rotate') {
        const t = view.towers[ev.tower];
        if (t?.hanging) this.burst(wx(t.hanging.x), wy(t.hanging.y), 0.8, '#f4f2ff', 6, 1.4, 1.5, 0.1);
      } else if (ev.type === 'win' && ev.winner && ev.winner !== 'cpu') {
        // Fireworks over the winning tower.
        const t = view.mode === 'team' ? view.towers[0] : view.towers.find((x) => x.side === ev.winner);
        if (t) {
          for (let i = 0; i < 5; i++) {
            setTimeout(() => this.burst(wx(t.x) + (rnd() - 0.5) * 4, wy(t.wireY) + rnd() * 1.5, 0.5, SPARKS[i % 5], 22, 4, 6, 0.2), i * 220);
          }
        }
      }
    }
  }

  // ---------- drawing ----------

  resize() {
    const area = this.canvas.parentElement;
    const w = area?.clientWidth || window.innerWidth;
    const h = area?.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.gl.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Far enough back to show the whole 1600 x 900 world, whatever the screen's shape.
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.dist = Math.max((WORLD.height / S / 2) / t, (WORLD.width / S / 2 + 0.6) / (t * this.camera.aspect)) + DEPTH;
  }

  draw(view, dt = 1 / 60) {
    this.dt = Math.min(dt, 0.1);
    this.time += this.dt;
    this.watchSpeed();

    this.syncBlocks(view);
    this.syncTowers(view);
    this.drawGoal(view);
    this.drawCountdown(view);
    this.drawHud(view);

    for (const d of this.debrisPool) {
      if (d.life <= 0) continue;
      d.life -= this.dt;
      d.v.y -= 16 * this.dt;
      d.m.position.addScaledVector(d.v, this.dt);
      d.m.scale.setScalar(d.s * Math.min(1, (d.life / d.max) * 1.6));
      d.m.material.opacity = Math.min(1, (d.life / d.max) * 2);
      d.m.rotation.z += this.dt * 5;
      if (d.life <= 0) d.m.visible = false;
    }
    for (const s of this.stars) s.m.scale.setScalar(0.07 * (0.5 + 0.6 * Math.abs(Math.sin(this.time * 1.2 + s.ph)))); // twinkle

    // Camera: follows the tower up (the engine's cameraTop), a little above and in
    // front so the tops of the blocks show; shakes in an earthquake, a landing or a fall.
    const target = wy(view.cameraTop + WORLD.height / 2);
    this.camY += (target - this.camY) * Math.min(1, this.dt * 3);
    this.shake = Math.max(0, this.shake - this.dt * 1.5);
    const quaking = view.towers.some((t) => t.force?.on && t.force.kind === 'quake');
    const sh = this.reduceMotion ? 0 : this.shake * this.shake * 1.2 + (quaking ? 0.06 : 0);
    this.camera.position.set((rnd() - 0.5) * sh, this.camY + 1.8 + (rnd() - 0.5) * sh, this.dist);
    this.camera.lookAt(0, this.camY + 0.2, 0);
    this.sun.position.set(-6, this.camY + 14, 12);
    this.sun.target.position.set(0, this.camY, 0);

    if (this.composer) this.composer.render(); else this.gl.render(this.scene, this.camera);
  }

  // A slow screen drops the glow (the costliest part) rather than stutter.
  watchSpeed() {
    if (!this.composer || this.frames > 240) return;
    this.frames += 1;
    if (this.frames > 30 && this.dt > 1 / 40) this.slowFrames += 1;
    if (this.slowFrames > 60) this.composer = null;
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.overlay.remove();
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) { x.map?.dispose?.(); x.dispose?.(); }
    });
    this.gl.dispose();
    this.gl.forceContextLoss?.();
  }
}
