// Draws Soccer (foosball) as a neon voxel pitch in 3D (three.js). Only reads engine
// state, never changes it. Effects (kicks swinging the players, sparks, the net
// shaking, GOAL!) come from the engine's events. The pitch is 1600 x 900 game
// units; here 80 units = 1 block.
//
// Same interface as the flat renderer (renderer2d.js), which game.js uses instead
// on a screen without 3D: players, mode, caption, bigText, replaying, banner,
// handleEvents(events, state), draw(state, dt), destroy().

import THREE from './vendor/three.js';
import { COURT, COLORS, TOSS_SECONDS, KICKOFF } from './config.js';
import { goalHeight } from './rules.js';

const S = 80; // game units per block
const CX = COURT.width / 2 / S; // half the pitch's length, in blocks
const CZ = COURT.height / 2 / S; // half its width
const FLOOR = -0.7; // the pitch is sunk into the ground
const R = 0.24; // ball size on screen (a little bigger than the real one, to read on a TV)
const ROD_Y = FLOOR + 0.75; // height of the rods above the grass
const GOAL_DEPTH = 1.1;
const wx = (x) => (x - COURT.width / 2) / S;
const wz = (y) => (y - COURT.height / 2) / S;

const NIGHT = { sky: '#1c0c44', ground: '#2a1366', pit: '#12082e', rock: ['#3b1d85', '#4a27a3', '#341a78'], pine: ['#0b6f73', '#0f8f8a'] };
const TURF = ['#0e3d2b', '#11482f'];
const CHALK = '#bfffd6';
const FLOWERS = ['#00f0ff', '#ff2bd6', '#39ff7a', '#ff9f1c'];

// The computer player: Soccer's own pixel robot.
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

const rnd = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

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
    this.banner = null; // { t } while GOAL! shows (game.js holds the kick-off caption back meanwhile)
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

    this.rods = new Map(); // rod id -> { group, figures, key, kick, kickDir }
    this.goals = null; // built once the goal size is known
    this.goalKey = '';
    this.cast = [];
    this.castKey = '';
    this.scoreShown = { left: -1, right: -1 };
    this.pop = { left: 0, right: 0 };
    this.shake = 0;
    this.flash = 0;
    this.push = 0;
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

  box(w, h, d, color, x, y, z, material, parent = this.scene) {
    const m = new THREE.Mesh(this.unit, material || this.mat(color));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
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
    const front = new THREE.DirectionalLight('#ffffff', 0.22);
    front.position.set(0, 10, 30);
    scene.add(front);

    // Ground around a sunken pitch (the ends are left open for the goals).
    const G = NIGHT.ground;
    const end = CX + GOAL_DEPTH + 0.6;
    this.box(90, 2, 40, G, 0, -1, -CZ - 20);
    this.box(90, 2, 40, G, 0, -1, CZ + 20);
    this.box(40, 2, CZ * 2, G, -end - 20, -1, 0);
    this.box(40, 2, CZ * 2, G, end + 20, -1, 0);
    // Striped turf, and the strip of ground behind each goal.
    const stripes = 12;
    for (let i = 0; i < stripes; i++) {
      const w = (CX * 2) / stripes;
      this.box(w, 1, CZ * 2, TURF[i % 2], -CX + w * (i + 0.5), FLOOR - 0.5, 0);
    }
    for (const s of [-1, 1]) this.box(end - CX, 1, CZ * 2, NIGHT.pit, s * (CX + (end - CX) / 2), FLOOR - 0.5, 0);

    // Chalk lines made of thin glowing strips.
    const chalk = new THREE.MeshBasicMaterial({ color: CHALK });
    const line = (w, d, x, z) => this.box(w, 0.04, d, null, x, FLOOR + 0.02, z, chalk);
    line(0.1, CZ * 2, 0, 0);
    for (const s of [-1, 1]) {
      line(0.08, CZ * 2, s * CX, 0);
      const bx = s * (CX - 200 / S);
      line(0.08, 540 / S, bx, 0);
      line(200 / S, 0.08, s * (CX - 100 / S), -270 / S);
      line(200 / S, 0.08, s * (CX - 100 / S), 270 / S);
      const gx = s * (CX - 80 / S);
      line(0.08, 400 / S, gx, 0);
      line(80 / S, 0.08, s * (CX - 40 / S), -200 / S);
      line(80 / S, 0.08, s * (CX - 40 / S), 200 / S);
      this.box(0.16, 0.05, 0.16, null, s * (CX - 150 / S), FLOOR + 0.03, 0, chalk);
    }
    // Centre circle: a ring of small blocks.
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      this.box(0.18, 0.04, 0.18, null, Math.cos(a) * (110 / S), FLOOR + 0.02, Math.sin(a) * (110 / S), chalk);
    }
    this.box(0.16, 0.05, 0.16, null, 0, FLOOR + 0.03, 0, chalk);
    // Neon rim along the long sides.
    const rim = new THREE.MeshBasicMaterial({ color: COLORS.line });
    this.box(end * 2, 0.08, 0.14, null, 0, 0.04, -CZ, rim);
    this.box(end * 2, 0.08, 0.14, null, 0, 0.04, CZ, rim);

    // Scenery, deliberately lopsided: a block heap and pines on the left, a small heap on the right.
    [[-18, -9, 3, 2.2, 3], [-15.6, -10.6, 2, 1.4, 2], [-20, -7, 2, 3.2, 2], [16.5, 8.6, 2.4, 1.4, 2], [18.4, 9.8, 1.4, 0.9, 1.4], [6, -9.8, 1.2, 0.8, 1.2]]
      .forEach(([x, z, w, h, d], i) => { this.box(w, h, d, NIGHT.rock[i % 3], x, h / 2, z).rotation.y = (i % 2) * 0.3; });
    const pine = (x, z, s) => [[1.6, 1.2], [1.2, 1], [0.8, 0.9], [0.4, 0.8]]
      .forEach(([w, h], i) => this.box(w * s, h * s, w * s, NIGHT.pine[i % 2], x, (0.6 + i * 0.95) * s, z));
    pine(-20.5, -3.8, 1.15); pine(-22, -0.4, 0.85); pine(17.5, -8.8, 1); pine(20.5, -6.4, 0.7);
    [[-13, 8], [-8, 9], [-2, 9.8], [4, 8.3], [10, 9], [14.5, -7.8], [-6, -8.4], [1, -10], [9.6, -9], [-18.5, 4.5], [18, 3], [-12, -7.4]]
      .forEach(([x, z], i) => {
        const petal = new THREE.MeshBasicMaterial({ color: FLOWERS[i % 4] });
        const s = 0.32;
        [[0, -1], [-1, 0], [1, 0], [0, 1]].forEach(([dx, dz]) => this.box(s, s, s, null, x + dx * s, s / 2, z + dz * s, petal));
        this.box(s, s * 1.2, s, null, x, s * 0.6, z, new THREE.MeshBasicMaterial({ color: '#ffe600' }));
      });

    // Score digits stand behind the pitch.
    this.digits = {};
    for (const side of ['left', 'right']) {
      const g = new THREE.Group();
      g.position.set(side === 'left' ? -2.6 : 2.6, 0, -CZ - 1.6);
      g.rotation.x = -0.6;
      scene.add(g);
      this.digits[side] = g;
    }
    this.countGroup = new THREE.Group();
    this.countGroup.position.set(0, FLOOR, 0.6);
    this.countGroup.rotation.x = -0.75;
    scene.add(this.countGroup);
    this.countShown = null;
  }

  // Goals: glowing block frames in each team's colour, with a net of thin bars.
  buildGoals(state) {
    const gH = goalHeight(state.settings.difficulty) / S;
    const colors = { left: this.sideColor(state, 'left'), right: this.sideColor(state, 'right') };
    const key = `${gH}:${colors.left}:${colors.right}`;
    if (key === this.goalKey) return;
    this.goalKey = key;
    if (this.goals) for (const g of Object.values(this.goals)) this.scene.remove(g.group);
    this.goals = {};
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      const group = new THREE.Group();
      group.position.set(s * CX, FLOOR, 0);
      const frame = new THREE.MeshLambertMaterial({ color: colors[side], emissive: colors[side], emissiveIntensity: 0.6 });
      const H = 0.9;
      for (const z of [-gH / 2, gH / 2]) this.box(0.18, H, 0.18, null, 0, H / 2, z, frame, group); // posts
      this.box(0.18, 0.18, gH + 0.18, null, 0, H, 0, frame, group); // crossbar
      for (const z of [-gH / 2, gH / 2]) this.box(GOAL_DEPTH, 0.1, 0.1, null, s * GOAL_DEPTH / 2, H, z, frame, group);
      const net = new THREE.Group();
      const strand = new THREE.MeshBasicMaterial({ color: '#d9d2ff', transparent: true, opacity: 0.35 });
      for (let z = -gH / 2; z <= gH / 2 + 0.01; z += 0.36) this.box(0.03, H, 0.03, null, s * GOAL_DEPTH, H / 2, z, strand, net);
      for (let y = 0.2; y < H; y += 0.25) this.box(0.03, 0.03, gH, null, s * GOAL_DEPTH, y, 0, strand, net);
      for (let x = 0.3; x < GOAL_DEPTH; x += 0.3) this.box(0.03, 0.03, gH, null, s * x, H, 0, strand, net);
      group.add(net);
      // A glowing slot on the floor of the goal: it flashes when the ball goes in.
      const glow = new THREE.MeshBasicMaterial({ color: colors[side], transparent: true, opacity: 0.35 });
      const slot = this.box(GOAL_DEPTH, 0.04, gH, null, s * GOAL_DEPTH / 2, 0.03, 0, glow, group);
      this.scene.add(group);
      this.goals[side] = { group, net, slot, frame, shake: 0 };
    }
  }

  // The football: white with dark patches round six of its corners.
  makeBall() {
    const geo = new THREE.IcosahedronGeometry(R, 1);
    const base = new THREE.IcosahedronGeometry(R, 0).attributes.position;
    const corners = [];
    for (let i = 0; i < base.count; i++) corners.push(new THREE.Vector3().fromBufferAttribute(base, i));
    const dark = corners.filter((c, i, all) => all.findIndex((d) => d.distanceTo(c) < 1e-4) === i).filter((_, i) => i % 2 === 0);
    const pos = geo.attributes.position;
    const colors = [];
    const v = new THREE.Vector3();
    for (let t = 0; t < pos.count; t += 3) {
      let near = false;
      for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, t + k); if (dark.some((c) => c.distanceTo(v) < 1e-3)) near = true; }
      const c = near ? [0.12, 0.1, 0.18] : [1, 1, 1];
      for (let k = 0; k < 3; k++) colors.push(...c);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const ball = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#3a3550' }));
    ball.castShadow = true;
    return ball;
  }

  buildEffects() {
    const { scene } = this;
    this.ball = this.makeBall();
    scene.add(this.ball);
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 64;
    const gx = glowCanvas.getContext('2d');
    const gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.7)');
    gr.addColorStop(0.35, 'rgba(190,255,220,0.25)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    gx.fillStyle = gr;
    gx.fillRect(0, 0, 64, 64);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.halo.scale.setScalar(1.9);
    scene.add(this.halo);
    this.trail = Array.from({ length: 9 }, (_, i) => {
      const m = new THREE.Mesh(this.unit, new THREE.MeshBasicMaterial({ color: '#d8ffe8', transparent: true, opacity: 0.35 - i * 0.035 }));
      m.scale.setScalar(R * 1.1 - i * 0.025);
      scene.add(m);
      return m;
    });
    this.trailPos = [];
    this.debris = Array.from({ length: 120 }, () => {
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
    // Kick-off: a pulsing ring of blocks round the ball, the aim (a dotted line of
    // blocks and an arrow head) and a ring of blocks that runs down.
    this.kick = new THREE.Group();
    const kickMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.kick.userData.mat = kickMat;
    this.kickPulse = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return this.box(0.14, 0.08, 0.14, null, Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62, kickMat, this.kick);
    });
    this.kickTimer = Array.from({ length: 24 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 24) * Math.PI * 2;
      return this.box(0.1, 0.06, 0.1, null, Math.cos(a) * 0.9, 0.05, Math.sin(a) * 0.9, new THREE.MeshBasicMaterial({ color: '#f4f2ff', transparent: true, opacity: 0.5 }), this.kick);
    });
    this.kickAim = new THREE.Group();
    this.kickDots = Array.from({ length: 7 }, (_, i) => this.box(0.16, 0.12, 0.16, null, 0.9 + i * 0.36, 0.1, 0, kickMat, this.kickAim));
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 4), kickMat);
    head.rotation.z = -Math.PI / 2;
    head.position.set(3.6, 0.15, 0);
    this.kickAim.add(head);
    this.kick.add(this.kickAim);
    this.kick.visible = false;
    scene.add(this.kick);
    // The coin for the coin toss.
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
    this.goalEl = ribbon('left:50%;top:42%;translate:-50% -50%;font-size:clamp(40px,8vw,110px);padding:22px 34px 18px;');
    this.goalEl.textContent = 'GOAL!';
    this.replayEl = ribbon('left:24px;bottom:24px;font-size:clamp(12px,1.6vw,20px);background:#ff2bd6;');
    this.replayEl.textContent = 'Replay';
    this.skipEl = ribbon('right:96px;bottom:24px;font-size:11px;background:#f4f2ff;');
    this.skipEl.textContent = 'Tap to skip';
    host.appendChild(el);
    this.overlay = el;
  }

  sideColor(state, side) {
    return state.paddles.find((p) => p.side === side)?.color || COLORS.line;
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
    const seen = new Set();
    for (const p of state.paddles) {
      const id = p.slot ?? `cpu-${p.side}`;
      if (seen.has(id)) continue; // one character per player, however many rods they work
      seen.add(id);
      const who = p.slot ? this.players[p.slot] : null;
      sides[p.side].push({ seat: p.slot, art: who?.art || (p.slot ? null : ROBOT), color: p.color });
    }
    const key = JSON.stringify([sides.left.map((c) => [c.seat, c.color, Boolean(c.art)]), sides.right.map((c) => [c.seat, c.color, Boolean(c.art)])]);
    if (key === this.castKey) return;
    this.castKey = key;
    for (const c of this.cast) this.scene.remove(c.group);
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

  // A rod across the pitch with its block footballers, which swing to kick.
  syncRods(state) {
    const seen = new Set();
    for (const p of state.paddles) {
      seen.add(p.id);
      const len = p.h / S;
      const key = `${p.color}:${len.toFixed(2)}:${p.offsets.length}`;
      let v = this.rods.get(p.id);
      if (!v || v.key !== key) {
        if (v) this.scene.remove(v.group);
        const group = new THREE.Group();
        // The bar itself, fixed across the whole pitch.
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, CZ * 2 + 1.2, 6), new THREE.MeshLambertMaterial({ color: '#c9c3e6' }));
        bar.rotation.x = Math.PI / 2;
        bar.position.y = ROD_Y;
        bar.castShadow = true;
        group.add(bar);
        for (const z of [-CZ - 0.6, CZ + 0.6]) this.box(0.22, 0.22, 0.22, p.color, 0, ROD_Y, z, null, group);
        // The footballers slide along it together.
        const slider = new THREE.Group();
        group.add(slider);
        const shirt = new THREE.MeshLambertMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 0.45 });
        const figures = p.offsets.map((o) => {
          const pivot = new THREE.Group(); // turns round the bar to kick
          pivot.position.set(0, ROD_Y, wz(COURT.height / 2 + o));
          this.box(0.4, 0.42, len * 0.9, null, 0, 0.05, 0, shirt, pivot); // body (as wide as the real player)
          this.box(0.3, 0.3, 0.3, '#f4f2ff', 0, 0.38, 0, null, pivot); // head
          this.box(0.32, 0.55, 0.22, p.color, 0, -0.42, -len * 0.18, shirt, pivot); // legs
          this.box(0.32, 0.55, 0.22, p.color, 0, -0.42, len * 0.18, shirt, pivot);
          this.box(0.36, 0.14, 0.26, '#14082e', 0, -0.72, -len * 0.18, null, pivot); // boots
          this.box(0.36, 0.14, 0.26, '#14082e', 0, -0.72, len * 0.18, null, pivot);
          slider.add(pivot);
          return pivot;
        });
        this.scene.add(group);
        v = { group, slider, figures, key, kick: 0, kickDir: 1 };
        this.rods.set(p.id, v);
      }
      v.group.position.set(wx(p.x), 0, 0);
      v.slider.position.z = wz(p.y);
      // Kick: the players swing round the bar towards where the ball went, then settle.
      v.kick = Math.max(0, v.kick - this.dt * 3.2);
      const swing = v.kick > 0 ? Math.sin((1 - v.kick) * Math.PI) * 1.1 * v.kickDir : 0;
      for (const f of v.figures) f.rotation.z = -swing;
    }
    for (const [id, v] of this.rods) if (!seen.has(id)) { this.scene.remove(v.group); this.rods.delete(id); }
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

  burst(x, y, z, color, n, power, up = 5, size = 0.22) {
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
        const rod = state.paddles.find((p) => p.id === ev.paddle);
        const color = rod?.color || COLORS.line;
        const x = wx(ev.x);
        const z = wz(ev.y);
        const power = ev.power || 0;
        this.burst(x, FLOOR + R, z, color, 8 + Math.round(power * 10), 3 + power * 2);
        this.ring(x, z, color);
        this.shake = Math.max(this.shake, 0.14 + power * 0.2);
        this.flash = 1;
        const v = this.rods.get(ev.paddle);
        if (v) { v.kick = 1; v.kickDir = Math.sign(state.ball?.vx || ev.nx || 1); }
        for (const c of this.cast) if (c.seat && c.seat === rod?.slot) c.nod = 1;
      } else if (ev.type === 'wall') {
        this.burst(wx(ev.x), FLOOR + R, wz(ev.y), '#b9a8e8', 4, 1.4, 2.5, 0.15);
      } else if (ev.type === 'post') {
        this.burst(wx(ev.x), FLOOR + 0.5, wz(ev.y), '#ffffff', 10, 2.5, 4, 0.16);
        this.shake = Math.max(this.shake, 0.25);
        const side = ev.x < COURT.width / 2 ? 'left' : 'right';
        if (this.goals) this.goals[side].shake = 0.6;
      } else if (ev.type === 'kickoff') {
        this.ring(0, 0, '#ffffff');
        this.burst(0, FLOOR + R, 0, '#bfffd6', 8, 2.2, 3, 0.16);
      } else if (ev.type === 'point') {
        const into = ev.scorer === 'left' ? 'right' : 'left'; // the ball went into the other team's goal
        const s = into === 'left' ? -1 : 1;
        const color = this.sideColor(state, ev.scorer);
        this.burst(s * (CX + 0.5), FLOOR + 0.6, wz(ev.y), color, 40, 5, 9, 0.28);
        if (this.goals) {
          this.goals[into].shake = 1;
          this.goals[into].slot.material.color.set(color);
          this.goals[into].slot.material.opacity = 1;
        }
        // The scorers jump; the others give a little hop too (nobody droops: kids hate losing).
        for (const c of this.cast) { if (c.side === ev.scorer) c.jump = 1; else c.nod = 1; }
        this.shake = 0.55;
        this.push = s;
        this.banner = { t: 0, color };
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

  // Fit the pitch and its goals (and the strip behind with the scores and players) to the screen.
  fitCamera(height) {
    const pts = [];
    for (const x of [-CX - GOAL_DEPTH - 0.2, CX + GOAL_DEPTH + 0.2]) {
      for (const z of [CZ + 0.2, -CZ]) pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, FLOOR, z));
      pts.push(new THREE.Vector3(x * 0.75, 4.4, -CZ - 1.8));
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

  coinFace(arts) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#ffe600';
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#b39d00';
    x.fillRect(8, 8, 112, 112);
    x.fillStyle = '#ffe600';
    x.fillRect(14, 14, 100, 100);
    const list = arts.filter(Boolean).slice(0, 2);
    const cell = list.length > 1 ? 4 : 7;
    list.forEach((art, i) => {
      const w = art.rows[0].length * cell;
      const h = art.rows.length * cell;
      const ox = list.length > 1 ? 14 + i * 52 : 64 - w / 2;
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
    const artOf = (side) => [...new Set(state.paddles.filter((p) => p.side === side).map((p) => p.slot))]
      .map((slot) => (slot ? this.players[slot]?.art : ROBOT));
    if (this.coinKey !== this.castKey) {
      this.coinKey = this.castKey;
      this.coin.material = [this.mat('#ffe600'), this.coinFace(artOf('left')), this.coinFace(artOf('right'))];
    }
    const p = Math.min(1, 1 - toss.timeLeft / (TOSS_SECONDS - 0.6));
    const flips = toss.winner === 'left' ? 10 : 11;
    const ease = 1 - (1 - p) ** 3;
    this.coin.visible = true;
    this.coin.rotation.set(-0.5 + ease * flips * Math.PI, 0, 0);
    this.coin.position.set(0, FLOOR + 2.2 + Math.sin(Math.min(1, p) * Math.PI) * 3.2, 0.6);
  }

  drawKickoff(state) {
    const k = state.kickoff;
    this.kick.visible = Boolean(k) && state.ball.visible;
    if (!this.kick.visible) return;
    const color = (k.slot && this.players[k.slot]?.color) || COLORS.cpu; // the kicker's own colour
    this.kick.userData.mat.color.set(color);
    this.kick.position.set(wx(state.ball.x), FLOOR, wz(state.ball.y));
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    this.kickPulse.forEach((b) => { b.scale.y = 0.08 + pulse * 0.12; });
    const ready = k.wait <= 0;
    this.kickAim.visible = ready;
    this.kickAim.rotation.y = -k.aim; // the court's y runs down the screen; the scene's z does too
    this.kickDots.forEach((d, i) => { d.position.y = 0.1 + Math.max(0, Math.sin(this.time * 8 - i * 0.7)) * 0.12; });
    const left = ready && k.slot !== null ? k.timeLeft / KICKOFF.timeLimit : 0;
    this.kickTimer.forEach((b, i) => { b.visible = i / this.kickTimer.length < left; });
  }

  drawCountdown() {
    const n = this.bigText && /^[0-9]$/.test(this.bigText) ? Number(this.bigText) : null;
    if (n !== this.countShown) {
      this.countShown = n;
      this.countGroup.clear();
      if (n != null) { this.setDigit(this.countGroup, n, '#f4f2ff', 0.55); this.countPop = 1; }
    }
    this.countPop = Math.max(0, (this.countPop || 0) - this.dt * 2.5);
    this.countGroup.scale.setScalar(1 + Math.sin(this.countPop * Math.PI) * 0.35);
  }

  draw(state, dt = 1 / 60) {
    this.dt = Math.min(dt, 0.1);
    this.time += this.dt;
    this.watchSpeed();
    if (state.paddles.length) { this.setCast(state); this.buildGoals(state); }
    this.syncRods(state);

    for (const side of ['left', 'right']) {
      const n = Math.min(9, state.scores?.[side] ?? 0);
      const color = this.sideColor(state, side);
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

    // The ball rolls; after a goal it stays in the net a moment.
    const b = state.ball;
    this.flash = Math.max(0, this.flash - this.dt * 5);
    this.ball.visible = b.visible;
    if (b.visible) {
      this.ball.position.set(wx(b.x), FLOOR + R, wz(b.y));
      this.ball.rotation.x += (b.vy / S) * this.dt / R * 0.5;
      this.ball.rotation.z -= (b.vx / S) * this.dt / R * 0.5;
      this.lastBall = this.ball.position.clone();
    } else if (this.banner && this.lastBall) {
      this.ball.visible = true;
      this.ball.position.copy(this.lastBall);
      this.ball.position.x += Math.sign(this.lastBall.x) * Math.min(0.5, this.banner.t * 2);
    }
    this.halo.visible = this.ball.visible;
    this.halo.position.copy(this.ball.position);
    this.halo.scale.setScalar(1.9 + this.flash * 1.8);
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
      const floorY = Math.abs(d.m.position.z) < CZ ? FLOOR : 0;
      if (d.m.position.y < floorY + d.s / 2) {
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
    if (this.goals) {
      for (const side of ['left', 'right']) {
        const g = this.goals[side];
        g.shake = Math.max(0, g.shake - this.dt * 1.6);
        const s = side === 'left' ? -1 : 1;
        g.net.position.x = s * Math.sin(this.time * 40) * g.shake * 0.12;
        g.net.scale.x = 1 + g.shake * 0.25;
        g.slot.material.opacity += (0.35 - g.slot.material.opacity) * this.dt * 1.5;
      }
    }

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
    this.drawKickoff(state);
    this.drawCountdown();

    // GOAL!, captions and the replay label.
    if (this.banner) {
      this.banner.t += this.dt;
      if (this.banner.t > 1.4) this.banner = null;
    }
    this.goalEl.hidden = !this.banner;
    if (this.banner) {
      this.goalEl.style.background = this.banner.color;
      const t = this.banner.t;
      this.goalEl.style.scale = String(Math.min(1, t / 0.18) * (1 + 0.15 * Math.exp(-t / 0.2)));
      this.goalEl.style.opacity = String(t > 1 ? Math.max(0, 1 - (t - 1) / 0.4) : 1);
    }
    this.captionEl.hidden = !this.caption;
    if (this.caption) {
      this.captionEl.textContent = this.caption.text;
      this.captionEl.style.background = this.caption.color || '#f4f2ff';
    }
    this.replayEl.hidden = !this.replaying;
    this.skipEl.hidden = !this.replaying;

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
