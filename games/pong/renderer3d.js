// Draws Pong as a neon voxel court in 3D (three.js). Only reads engine state, never
// changes it. Effects (sparks, rings, the paddle ripple, the goal drop) come from
// the engine's events. The court is 1600 x 900 game units; here 80 units = 1 block.
//
// Same interface as the flat renderer (renderer2d.js), which game.js uses instead
// on a screen without 3D: players, mode, caption, bigText, replaying,
// handleEvents(events, state), draw(state, dt), destroy().

import THREE from './vendor/three.js';
import { COURT, COLORS, TOSS_SECONDS } from './config.js';

const S = 80; // game units per block
const CX = COURT.width / 2 / S; // half the court's length, in blocks
const CZ = COURT.height / 2 / S; // half its width
const FLOOR = -0.7; // the court is sunk into the ground
const R = 0.26; // ball size on screen (a little bigger than the real one, to read on a TV)
const wx = (x) => (x - COURT.width / 2) / S;
const wz = (y) => (y - COURT.height / 2) / S;

const NIGHT = { sky: '#1c0c44', ground: '#2a1366', floor: '#20104f', pit: '#12082e', rock: ['#3b1d85', '#4a27a3', '#341a78'], pine: ['#0b6f73', '#0f8f8a'] };
const FLOWERS = ['#00f0ff', '#ff2bd6', '#39ff7a', '#ff9f1c'];

// The computer player: Pong's own pixel robot.
const ROBOT = {
  rows: ['.....yy.....', '.....kk.....', '.yyyyyyyyyy.', '.yyyyyyyyyy.', '.ykkkkkkkky.', '.ykcckkccky.',
    '.ykcckkccky.', '.ykkkkkkkky.', '.yyyyyyyyyy.', '.yykkkkkkyy.', '.yyyyyyyyyy.', '............'],
  palette: { y: '#ffe600', k: '#14082e', c: '#00f0ff' },
};
const DIGITS = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
};

const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

/** Can this screen draw in 3D? */
export function canDraw3D() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.players = {}; // seat -> { avatar, color, art }
    this.mode = 'versus';
    this.caption = null; // { text, color }
    this.bigText = null; // countdown number
    this.replaying = false;
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(NIGHT.sky);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 300);
    try {
      this.composer = new THREE.EffectComposer(r);
      this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
      this.composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.65, 0.4, 0.86));
    } catch {
      this.composer = null; // no glow, everything else still works
    }

    this.unit = new THREE.BoxGeometry(1, 1, 1);
    this.lam = new Map();
    this.buildWorld();
    this.buildEffects();
    this.buildOverlay();

    this.paddles = new Map(); // paddle id -> { group, blocks, key, wave, hitZ, facing }
    this.cast = []; // characters: { group, home, jump, sad, ph, seat, side }
    this.castKey = '';
    this.scoreShown = { left: -1, right: -1 };
    this.pop = { left: 0, right: 0 };
    this.shake = 0;
    this.flash = 0;
    this.push = 0; // camera leans toward a goal after a point
    this.fall = null; // the ball dropping into a goal: { x, z, t }
    this.time = 0;
    this.slowFrames = 0;
    this.frames = 0;

    this.camPos = new THREE.Vector3(0, 70, 50);
    this.camDir = new THREE.Vector3(0, Math.sin(1.02), Math.cos(1.02)); // about 58 degrees down
    this.fitTarget = new THREE.Vector3(0, FLOOR, -1);
    this.fitDist = 40;
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  // ---------- building ----------

  mat(color) {
    if (!this.lam.has(color)) this.lam.set(color, new THREE.MeshLambertMaterial({ color }));
    return this.lam.get(color);
  }

  box(w, h, d, color, x, y, z, material) {
    const m = new THREE.Mesh(this.unit, material || this.mat(color));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  buildWorld() {
    const { scene } = this;
    scene.add(new THREE.HemisphereLight('#c9b8ff', NIGHT.ground, 0.68));
    const sun = new THREE.DirectionalLight('#ffffff', 0.62);
    sun.position.set(-10, 26, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 20, bottom: -20, near: 1, far: 80 });
    scene.add(sun);
    // A soft light from the viewer's side, so the animals show their true colours.
    const front = new THREE.DirectionalLight('#ffffff', 0.22);
    front.position.set(0, 10, 30);
    scene.add(front);

    // Ground with a sunken court; its walls catch soft shadows.
    const G = NIGHT.ground;
    this.box(90, 2, 40, G, 0, -1, -CZ - 20);
    this.box(90, 2, 40, G, 0, -1, CZ + 20);
    this.box(40, 2, CZ * 2, G, -CX - 20 - 0.9, -1, 0);
    this.box(40, 2, CZ * 2, G, CX + 20 + 0.9, -1, 0);
    this.box(CX * 2, 1, CZ * 2, NIGHT.floor, 0, FLOOR - 0.5, 0);
    // A goal slot at each end: the ball drops in when someone scores.
    this.gutters = {};
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      this.box(0.9, 1.4, CZ * 2, NIGHT.pit, s * (CX + 0.45), FLOOR - 1.2, 0);
      const glow = new THREE.MeshBasicMaterial({ color: COLORS.line, transparent: true, opacity: 0.55 });
      this.gutters[side] = this.box(0.9, 0.06, CZ * 2 - 0.4, null, s * (CX + 0.45), FLOOR - 0.45, 0, glow);
    }
    // Neon rim and a dashed centre line of little blocks.
    const rim = new THREE.MeshBasicMaterial({ color: COLORS.line });
    this.box(CX * 2 + 1.8, 0.08, 0.14, null, 0, 0.04, -CZ, rim);
    this.box(CX * 2 + 1.8, 0.08, 0.14, null, 0, 0.04, CZ, rim);
    const dash = new THREE.MeshBasicMaterial({ color: '#6f5bd8' });
    for (let z = -CZ + 0.7; z < CZ; z += 1.1) this.box(0.18, 0.08, 0.55, null, 0, FLOOR + 0.04, z, dash);

    // Scenery, deliberately lopsided: a block heap and pines on the left, a small heap on the right.
    [[-17, -9, 3, 2.2, 3], [-14.6, -10.6, 2, 1.4, 2], [-19, -7, 2, 3.2, 2], [15.5, 8.6, 2.4, 1.4, 2], [17.4, 9.8, 1.4, 0.9, 1.4], [6, -9.8, 1.2, 0.8, 1.2]]
      .forEach(([x, z, w, h, d], i) => { this.box(w, h, d, NIGHT.rock[i % 3], x, h / 2, z).rotation.y = (i % 2) * 0.3; });
    const pine = (x, z, s) => [[1.6, 1.2], [1.2, 1], [0.8, 0.9], [0.4, 0.8]]
      .forEach(([w, h], i) => this.box(w * s, h * s, w * s, NIGHT.pine[i % 2], x, (0.6 + i * 0.95) * s, z));
    pine(-19.5, -3.8, 1.15); pine(-21, -0.4, 0.85); pine(16.5, -8.8, 1); pine(19.5, -6.4, 0.7);
    [[-13, 8], [-8, 9], [-2, 9.8], [4, 8.3], [10, 9], [13.5, -7.8], [-6, -8.4], [1, -10], [9.6, -9], [-17.5, 4.5], [17, 3], [-12, -7.4], [20.5, 0.5]]
      .forEach(([x, z], i) => {
        const c = FLOWERS[i % 4];
        const petal = new THREE.MeshBasicMaterial({ color: c });
        const s = 0.32;
        [[0, -1], [-1, 0], [1, 0], [0, 1]].forEach(([dx, dz]) => this.box(s, s, s, null, x + dx * s, s / 2, z + dz * s, petal));
        this.box(s, s * 1.2, s, null, x, s * 0.6, z, new THREE.MeshBasicMaterial({ color: '#ffe600' }));
      });

    // Score digits stand behind the court.
    this.digits = {};
    for (const side of ['left', 'right']) {
      const g = new THREE.Group();
      g.position.set(side === 'left' ? -2.6 : 2.6, 0, -CZ - 1.6);
      g.rotation.x = -0.6;
      scene.add(g);
      this.digits[side] = g;
    }
    // The countdown number, in the middle of the court.
    this.countGroup = new THREE.Group();
    this.countGroup.position.set(0, FLOOR, 0.6);
    this.countGroup.rotation.x = -0.75;
    scene.add(this.countGroup);
    this.countShown = null;
  }

  buildEffects() {
    const { scene } = this;
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(R, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.65 }));
    this.ball.castShadow = true;
    scene.add(this.ball);
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 64;
    const gx = glowCanvas.getContext('2d');
    const gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.35, 'rgba(160,240,255,0.35)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    gx.fillStyle = gr;
    gx.fillRect(0, 0, 64, 64);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.halo.scale.setScalar(2.2);
    scene.add(this.halo);
    this.trail = Array.from({ length: 9 }, (_, i) => {
      const m = new THREE.Mesh(this.unit, new THREE.MeshBasicMaterial({ color: '#bfefff', transparent: true, opacity: 0.4 - i * 0.04 }));
      m.scale.setScalar(R * 1.2 - i * 0.03);
      scene.add(m);
      return m;
    });
    this.trailPos = [];
    this.debris = Array.from({ length: 110 }, () => {
      const m = new THREE.Mesh(this.unit, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true }));
      m.visible = false;
      scene.add(m);
      return { m, v: new THREE.Vector3(), life: 0, max: 1, s: 0.2 };
    });
    this.rings = Array.from({ length: 5 }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.PI / 4;
      m.visible = false;
      scene.add(m);
      return { m, t: 0 };
    });
    // The coin for the coin toss: each face shows that side's player.
    this.coin = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.28, 24), [this.mat('#ffe600'), this.mat('#ffe600'), this.mat('#ffe600')]);
    this.coin.visible = false;
    scene.add(this.coin);
    this.coinKey = '';
  }

  buildOverlay() {
    const host = this.canvas.parentElement || document.body;
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:"Press Start 2P",Fredoka,monospace;';
    const ribbon = (extra) => {
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;padding:12px 18px 10px;color:#160934;text-transform:uppercase;letter-spacing:1px;transform:rotate(-2.5deg);
        clip-path:polygon(0 4px,4px 4px,4px 0,calc(100% - 4px) 0,calc(100% - 4px) 4px,100% 4px,100% calc(100% - 4px),calc(100% - 4px) calc(100% - 4px),calc(100% - 4px) 100%,4px 100%,4px calc(100% - 4px),0 calc(100% - 4px));${extra}`;
      d.hidden = true;
      el.appendChild(d);
      return d;
    };
    this.captionEl = ribbon('left:50%;bottom:9%;translate:-50% 0;font-size:clamp(12px,1.6vw,20px);white-space:nowrap;');
    this.replayEl = ribbon('left:24px;bottom:24px;font-size:clamp(12px,1.6vw,20px);background:#ff2bd6;');
    this.replayEl.textContent = 'Replay';
    this.skipEl = ribbon('right:96px;bottom:24px;font-size:11px;background:#f4f2ff;');
    this.skipEl.textContent = 'Tap to skip';
    host.appendChild(el);
    this.overlay = el;
  }

  // Characters at the back corners, built from each player's pixel art.
  voxels(art, size, depth) {
    const cells = [];
    art.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && art.palette[ch]) cells.push([x, y, ch]); }));
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size * 0.98, size * 0.98, size * 0.98), new THREE.MeshLambertMaterial({ color: '#ffffff' }), Math.max(1, cells.length * depth));
    const w = art.rows[0].length;
    const h = art.rows.length;
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    let i = 0;
    for (const [x, y, ch] of cells) {
      for (let d = 0; d < depth; d++) {
        m4.makeTranslation((x - w / 2 + 0.5) * size, (h - 1 - y) * size + size / 2, (d - (depth - 1) / 2) * size);
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.set(art.palette[ch]));
        i += 1;
      }
    }
    mesh.castShadow = true;
    return mesh;
  }

  setCast(state) {
    const sides = { left: [], right: [] };
    for (const p of state.paddles) {
      const who = p.slot ? this.players[p.slot] : null;
      sides[p.side].push({ seat: p.slot, art: who?.art || (p.slot ? null : ROBOT), color: p.color });
    }
    const key = JSON.stringify([sides.left.map((c) => [c.seat, c.color, Boolean(c.art)]), sides.right.map((c) => [c.seat, c.color, Boolean(c.art)])]);
    if (key === this.castKey) return;
    this.castKey = key;
    for (const c of this.cast) { this.scene.remove(c.group); c.group.traverse((o) => o.geometry?.dispose?.()); }
    this.cast = [];
    for (const side of ['left', 'right']) {
      sides[side].forEach((who, i) => {
        if (!who.art) return;
        const g = new THREE.Group();
        g.add(this.voxels(who.art, 0.28, 3));
        g.children[0].position.y = 0.3;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.3, 8), new THREE.MeshBasicMaterial({ color: who.color }));
        base.position.y = 0.15;
        g.add(base);
        g.rotation.x = -0.55;
        g.scale.setScalar(0.82);
        const s = side === 'left' ? -1 : 1;
        const home = new THREE.Vector3(s * (8.4 - i * 3.3), 0, -CZ - 1.8);
        g.position.copy(home);
        this.scene.add(g);
        this.cast.push({ group: g, home, jump: 0, sad: 0, nod: 0, ph: rnd() * 6, seat: who.seat, side });
      });
    }
  }

  // Paddles: a column of neon blocks whose front face lines up with the real hitting face.
  syncPaddles(state) {
    const seen = new Set();
    for (const p of state.paddles) {
      seen.add(p.id);
      const len = p.h / S;
      const key = `${p.color}:${len.toFixed(2)}`;
      let v = this.paddles.get(p.id);
      if (!v || v.key !== key) {
        if (v) this.scene.remove(v.group);
        const group = new THREE.Group();
        const n = Math.max(2, Math.round(len / 0.78));
        const each = len / n;
        const material = new THREE.MeshLambertMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 0.55 });
        const blocks = [];
        for (let k = 0; k < n; k++) {
          const b = new THREE.Mesh(this.unit, material);
          b.scale.set(0.55, 0.62, each * 0.92);
          b.position.z = (k - (n - 1) / 2) * each;
          b.castShadow = true;
          group.add(b);
          blocks.push({ mesh: b, z: b.position.z });
        }
        this.scene.add(group);
        v = { group, blocks, key, wave: -1, hitZ: 0, facing: p.facing || (p.side === 'left' ? 1 : -1) };
        this.paddles.set(p.id, v);
      }
      const face = wx(p.x) + v.facing * (p.w / 2 / S);
      v.group.position.set(face - v.facing * 0.275, FLOOR + 0.31, wz(p.y));
      if (v.wave >= 0) v.wave += this.dt * 4;
      for (const b of v.blocks) {
        const dist = Math.abs(v.group.position.z + b.z - v.hitZ) / 0.8;
        const t = v.wave - dist * 0.35;
        const s = t > 0 && t < 1 ? Math.sin(t * Math.PI) : 0;
        b.mesh.position.x = -v.facing * s * 0.3;
        b.mesh.position.y = s * 0.3;
      }
      if (v.wave > 3) v.wave = -1;
    }
    for (const [id, v] of this.paddles) if (!seen.has(id)) { this.scene.remove(v.group); this.paddles.delete(id); }
  }

  setDigit(group, n, color, size) {
    group.clear();
    const cells = [];
    DIGITS[n].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '1') cells.push([x, y]); }));
    const mesh = new THREE.InstancedMesh(this.unit, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.6 }), cells.length);
    const m4 = new THREE.Matrix4();
    cells.forEach(([x, y], k) => { m4.makeScale(size * 0.94, size * 0.94, size * 0.94).setPosition((x - 1) * size, (4 - y) * size + size / 2, 0); mesh.setMatrixAt(k, m4); });
    mesh.castShadow = true;
    group.add(mesh);
  }

  // ---------- effects from engine events ----------

  burst(x, y, z, color, n, power, up = 5, size = 0.24) {
    let k = 0;
    for (const d of this.debris) {
      if (d.life > 0) continue;
      d.m.material.color.set(color);
      d.m.position.set(x, y, z);
      d.m.visible = true;
      d.v.set((rnd() * 2 - 1) * power, rnd() * up + 1.5, (rnd() * 2 - 1) * power);
      d.max = d.life = 0.5 + rnd() * 0.6;
      d.s = size * (0.6 + rnd() * 0.8);
      if (++k >= n) break;
    }
  }

  ring(x, z, color) {
    const r = this.rings.find((q) => q.t <= 0) || this.rings[0];
    r.m.material.color.set(color);
    r.m.position.set(x, FLOOR + 0.06, z);
    r.t = 1;
    r.m.visible = true;
  }

  handleEvents(events, state) {
    for (const ev of events) {
      if (ev.type === 'hit') {
        const paddle = state.paddles.find((p) => p.id === ev.paddle);
        const color = paddle?.color || COLORS.line;
        const x = wx(ev.x);
        const z = wz(ev.y);
        const power = ev.power || 0;
        this.burst(x, FLOOR + R, z, color, 9 + Math.round(power * 10), 3.2 + power * 2);
        this.ring(x, z, color);
        this.shake = Math.max(this.shake, 0.16 + power * 0.22);
        this.flash = 1;
        const v = this.paddles.get(ev.paddle);
        if (v) { v.wave = 0; v.hitZ = z; }
        for (const c of this.cast) if (c.seat && c.seat === paddle?.slot) c.nod = 1;
      } else if (ev.type === 'wall') {
        this.burst(wx(ev.x), FLOOR + R, wz(ev.y), '#b9a8e8', 4, 1.4, 2.5, 0.16);
      } else if (ev.type === 'point') {
        const out = ev.scorer === 'left' ? 'right' : 'left'; // the ball left through the loser's end
        const s = out === 'left' ? -1 : 1;
        const color = state.paddles.find((p) => p.side === ev.scorer)?.color || COLORS.line;
        this.fall = { x: s * (CX + 0.45), z: Math.max(-CZ + 0.5, Math.min(CZ - 0.5, wz(ev.y))), t: 0 };
        this.burst(s * CX, FLOOR, this.fall.z, color, 34, 5, 9, 0.3);
        this.gutters[out].material.color.set(color);
        this.gutters[out].material.opacity = 1;
        // The scorers jump; the others give a little hop too (nobody droops: kids hate losing).
        for (const c of this.cast) { if (c.side === ev.scorer) c.jump = 1; else c.nod = 1; }
        this.shake = 0.55;
        this.push = s;
      }
    }
  }

  // ---------- drawing ----------

  resize() {
    const area = this.canvas.parentElement;
    const w = area?.clientWidth || window.innerWidth;
    const h = area?.clientHeight || window.innerHeight;
    this.gl.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitCamera(h);
  }

  // Fit the court (and the strip behind it with the scores and players) to the screen.
  fitCamera(height) {
    const pts = [];
    for (const x of [-CX - 0.95, CX + 0.95]) {
      for (const z of [CZ + 0.2, -CZ]) pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, FLOOR, z));
      pts.push(new THREE.Vector3(x * 0.85, 4.4, -CZ - 1.8));
    }
    const bottom = -1 + (2 * 40) / Math.max(200, height);
    const top = 0.985;
    const side = 0.985;
    const cam = this.camera;
    const project = (d) => {
      cam.position.copy(this.fitTarget).addScaledVector(this.camDir, d);
      cam.lookAt(this.fitTarget);
      cam.updateMatrixWorld();
      let xMax = 0;
      let yMin = 9;
      let yMax = -9;
      for (const p of pts) {
        const v = p.clone().project(cam);
        xMax = Math.max(xMax, Math.abs(v.x));
        yMin = Math.min(yMin, v.y);
        yMax = Math.max(yMax, v.y);
      }
      return { xMax, yMin, yMax };
    };
    for (let round = 0; round < 4; round++) {
      let lo = 8;
      let hi = 250;
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) / 2;
        const e = project(mid);
        if (e.xMax <= side && e.yMax <= top && e.yMin >= bottom) hi = mid; else lo = mid;
      }
      this.fitDist = hi;
      const e = project(hi);
      this.fitTarget.z -= ((e.yMax + e.yMin) / 2 - (top + bottom) / 2) * ((CZ * 2 + 2) / Math.max(0.2, e.yMax - e.yMin));
    }
  }

  coinFace(who) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#ffe600';
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#b39d00';
    x.fillRect(8, 8, 112, 112);
    x.fillStyle = '#ffe600';
    x.fillRect(14, 14, 100, 100);
    const arts = who.filter(Boolean).slice(0, 2);
    const cell = arts.length > 1 ? 4 : 7;
    arts.forEach((art, i) => {
      const w = art.rows[0].length * cell;
      const h = art.rows.length * cell;
      const ox = arts.length > 1 ? 14 + i * 52 : 64 - w / 2;
      const oy = 64 - h / 2;
      art.rows.forEach((row, y) => [...row].forEach((ch, xx) => {
        if (ch === '.' || !art.palette[ch]) return;
        x.fillStyle = art.palette[ch];
        x.fillRect(ox + xx * cell, oy + y * cell, cell, cell);
      }));
    });
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    return new THREE.MeshLambertMaterial({ map: tex });
  }

  drawToss(state) {
    const toss = state.toss;
    if (state.phase !== 'toss' || !toss) { this.coin.visible = false; return; }
    const artOf = (side) => state.paddles.filter((p) => p.side === side).map((p) => (p.slot ? this.players[p.slot]?.art : ROBOT));
    const key = this.castKey;
    if (this.coinKey !== key) {
      this.coinKey = key;
      this.coin.material = [this.mat('#ffe600'), this.coinFace(artOf('left')), this.coinFace(artOf('right'))];
    }
    const p = Math.min(1, 1 - toss.timeLeft / (TOSS_SECONDS - 0.6)); // lands with 0.6 s to spare
    const flips = toss.winner === 'left' ? 10 : 11; // even number of half-turns lands on the left face
    const ease = 1 - (1 - p) ** 3;
    this.coin.visible = true;
    // Face up (towards the camera) shows the left player; a half turn shows the right.
    this.coin.rotation.set(-0.5 + ease * flips * Math.PI, 0, 0);
    this.coin.position.set(0, FLOOR + 2.2 + Math.sin(Math.min(1, p) * Math.PI) * 3.2, 0.6);
  }

  drawCountdown() {
    const n = this.bigText && /^[0-9]$/.test(this.bigText) ? Number(this.bigText) : null;
    if (n !== this.countShown) {
      this.countShown = n;
      this.countGroup.clear();
      if (n != null) { this.setDigit(this.countGroup, n, '#f4f2ff', 0.55); this.countPop = 1; }
    }
    this.countPop = Math.max(0, (this.countPop || 0) - this.dt * 2.5);
    const s = 1 + Math.sin(this.countPop * Math.PI) * 0.35;
    this.countGroup.scale.setScalar(s);
  }

  draw(state, dt = 1 / 60) {
    this.dt = Math.min(dt, 0.1);
    this.time += this.dt;
    this.watchSpeed();
    if (state.paddles.length) this.setCast(state);
    this.syncPaddles(state);

    // Scores behind the court, popping when they change.
    for (const side of ['left', 'right']) {
      const n = Math.min(9, state.scores?.[side] ?? 0);
      const color = state.paddles.find((p) => p.side === side)?.color || COLORS.line;
      if (n !== this.scoreShown[side] || this.digits[side].userData.color !== color) {
        if (this.scoreShown[side] >= 0 && n > this.scoreShown[side]) this.pop[side] = 1;
        this.scoreShown[side] = n;
        this.digits[side].userData.color = color;
        this.setDigit(this.digits[side], n, color, 0.5);
      }
      this.pop[side] = Math.max(0, this.pop[side] - this.dt * 2.2);
      const k = Math.sin(this.pop[side] * Math.PI);
      this.digits[side].scale.setScalar(1 + k * 0.45);
      this.digits[side].position.y = k * 1.2;
    }

    // The ball, its trail and glow; or the ball dropping into a goal.
    const b = state.ball;
    this.flash = Math.max(0, this.flash - this.dt * 5);
    if (b.visible) {
      this.fall = null;
      this.ball.position.set(wx(b.x), FLOOR + R, wz(b.y));
      this.ball.rotation.x += (b.vy / S) * this.dt * 1.5;
      this.ball.rotation.z -= (b.vx / S) * this.dt * 1.5;
      this.ball.visible = true;
    } else if (this.fall) {
      this.fall.t += this.dt;
      this.ball.position.set(this.fall.x, FLOOR + R - this.fall.t * this.fall.t * 14, this.fall.z);
      this.ball.visible = this.fall.t < 0.6;
    } else {
      this.ball.visible = false;
    }
    this.halo.visible = this.ball.visible;
    this.halo.position.copy(this.ball.position);
    this.halo.scale.setScalar(2.2 + this.flash * 2.2);
    this.trailPos.unshift(this.ball.position.clone());
    this.trailPos.length = Math.min(this.trailPos.length, this.trail.length);
    this.trail.forEach((m, i) => {
      const p = this.trailPos[i];
      m.visible = Boolean(p) && b.visible && state.phase === 'playing';
      if (p) m.position.copy(p);
      m.rotation.y = this.time * 3;
    });

    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= this.dt;
      d.v.y -= 22 * this.dt;
      d.m.position.addScaledVector(d.v, this.dt);
      const inCourt = Math.abs(d.m.position.x) < CX && Math.abs(d.m.position.z) < CZ;
      const floorY = inCourt ? FLOOR : 0;
      if (d.m.position.y < floorY + d.s / 2 && (inCourt || Math.abs(d.m.position.x) > CX + 0.9)) {
        d.m.position.y = floorY + d.s / 2;
        d.v.y *= -0.4;
        d.v.x *= 0.6;
        d.v.z *= 0.6;
      }
      d.m.scale.setScalar(d.s * Math.min(1, (d.life / d.max) * 1.6));
      d.m.material.opacity = Math.min(1, (d.life / d.max) * 2);
      d.m.rotation.y += this.dt * 4;
      if (d.life <= 0) d.m.visible = false;
    }
    for (const r of this.rings) {
      if (r.t <= 0) continue;
      r.t -= this.dt * 2.2;
      r.m.scale.setScalar(1 + (1 - r.t) * 3.5);
      r.m.material.opacity = Math.max(0, r.t);
      if (r.t <= 0) r.m.visible = false;
    }
    for (const side of ['left', 'right']) {
      const g = this.gutters[side].material;
      g.opacity += (0.55 - g.opacity) * this.dt * 2;
    }

    // Characters: breathe, nod when they hit, hop when they score, droop when they miss.
    for (const c of this.cast) {
      c.jump = Math.max(0, c.jump - this.dt * 1.3);
      c.sad = Math.max(0, c.sad - this.dt * 0.9);
      c.nod = Math.max(0, c.nod - this.dt * 4);
      const hop = c.jump > 0 ? Math.abs(Math.sin((1 - c.jump) * Math.PI * 3)) * 1.6 * c.jump : Math.sin(c.nod * Math.PI) * 0.35;
      c.group.position.set(c.home.x, hop, c.home.z);
      c.group.scale.set(0.82 * (1 + c.sad * 0.08), 0.82 * (1 + Math.sin(this.time * 2.4 + c.ph) * 0.025 - c.sad * 0.16), 0.82);
      c.group.rotation.z = c.jump > 0 ? Math.sin(this.time * 18) * 0.12 * c.jump : Math.sin(this.time * 1.3 + c.ph) * 0.03;
    }

    this.drawToss(state);
    this.drawCountdown();

    // Captions and the replay label.
    this.captionEl.hidden = !this.caption;
    if (this.caption) {
      this.captionEl.textContent = this.caption.text;
      this.captionEl.style.background = this.caption.color || '#f4f2ff';
    }
    this.replayEl.hidden = !this.replaying;
    this.skipEl.hidden = !this.replaying;

    // Camera: fitted to the screen, leaning toward a goal after a point, a short shake on impacts.
    this.push *= Math.pow(0.4, this.dt);
    const want = this.fitTarget.clone().addScaledVector(this.camDir, this.fitDist * (1 - Math.abs(this.push) * 0.06));
    want.x += this.push * 1.2;
    this.camPos.lerp(want, Math.min(1, this.dt * 2));
    this.shake = Math.max(0, this.shake - this.dt * 1.8);
    const sh = this.reduceMotion ? 0 : this.shake * this.shake * 1.4;
    this.camera.position.set(this.camPos.x + (rnd() - 0.5) * sh, this.camPos.y + (rnd() - 0.5) * sh, this.camPos.z + (rnd() - 0.5) * sh);
    const look = this.fitTarget.clone();
    look.x += this.push * 0.8;
    this.camera.lookAt(look);

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
