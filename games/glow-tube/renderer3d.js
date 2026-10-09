// Draws Glow Tube in 3D (three.js): a neon half-pipe running off into the night,
// seen from just behind the riders. Each player's animal rides a skateboard in their
// colour, leaving a glowing trail; crystals float above the tube, dark blocks glow
// pink as they come. Only reads the engine's view, never changes it; effects come
// from the engine's events.
//
// Same interface as the flat renderer (renderer2d.js), which game.js uses instead on
// a screen without 3D: players, handleEvents(events, view), draw(view, dt), destroy().

import THREE from './vendor/three.js';
import { TUBE, COLORS } from './config.js';

const R = TUBE.radius;
const EDGE = TUBE.maxAngle + 0.3; // the tube's walls go a little higher than riders can
const AHEAD = 140; // metres of tube drawn ahead
const BEHIND = 9; // ...and behind the riders (towards the camera)
const RING_GAP = 6;
const RIDE = 7; // the riders are this far down the tube from the camera's spot
const NIGHT = { sky: '#120730', tube: '#2a1366', tubeDeep: '#1c0c44', rim: '#7d8cff', block: '#3b1d85', warn: '#ff2bd6' };
const SPARKS = ['#00f0ff', '#ff2bd6', '#39ff7a', '#ff9f1c', '#ffe600'];
const CRYSTAL_ART = { rows: ['..w..', '.wcw.', 'wcccw', '.wcw.', '..w..'], palette: { w: '#f4f2ff', c: '#7fd8ff' } };
const FLAG = { rows: ['kwkwk', 'wkwkw', 'kwkwk'], palette: { k: '#14082e', w: '#f4f2ff' } };
const DIGITS = {
  1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
};

const rnd = (() => { let s = 31; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

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

/** A point on the tube: `a` across, `ahead` metres in front of the riders, `lift` off the surface. */
function onTube(a, ahead, lift = 0) {
  const r = R - lift;
  return new THREE.Vector3(Math.sin(a) * r, R - Math.cos(a) * r, -ahead);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.players = {}; // seat -> { avatar, color, art }
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.gl = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(NIGHT.sky);
    this.scene.fog = new THREE.Fog(NIGHT.sky, 70, AHEAD);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.3, 400);
    try {
      this.composer = new THREE.EffectComposer(r);
      this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
      this.composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.7, 0.4, 0.82));
    } catch {
      this.composer = null;
    }

    this.unit = new THREE.BoxGeometry(1, 1, 1);
    this.gem = new THREE.OctahedronGeometry(0.42);
    this.lam = new Map();
    this.textures = new Map();
    this.riders = new Map(); // seat -> { group, board, face, trail, history }
    this.crystals = new Map(); // id -> mesh
    this.obstacles = new Map(); // id -> group
    this.debris = [];
    this.time = 0;
    this.shake = 0;
    this.frames = 0;
    this.slowFrames = 0;
    this.countShown = null;

    this.buildWorld();
    this.buildOverlay();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  mat(color, extra) {
    const key = color + (extra ? JSON.stringify(extra) : '');
    if (!this.lam.has(key)) this.lam.set(key, new THREE.MeshLambertMaterial({ color, ...extra }));
    return this.lam.get(key);
  }

  colorOf(seat) {
    return this.players[seat]?.color || COLORS.line;
  }

  // ---------- the world: tube, rings, rails, stars, start and finish ----------

  buildWorld() {
    const { scene } = this;
    scene.add(new THREE.HemisphereLight('#d9ccff', '#2a1366', 0.9));
    const sun = new THREE.DirectionalLight('#ffffff', 0.5);
    sun.position.set(0, 12, 6);
    scene.add(sun);

    // The half-pipe: one long curved sheet, darker deep in the middle.
    const geo = new THREE.PlaneGeometry(1, 1, 48, 1);
    const pos = geo.attributes.position;
    const colors = [];
    const light = new THREE.Color(NIGHT.tube);
    const deep = new THREE.Color(NIGHT.tubeDeep);
    for (let i = 0; i < pos.count; i++) {
      const a = pos.getX(i) * 2 * EDGE;
      const z = pos.getY(i) > 0 ? -AHEAD - 20 : BEHIND + 4;
      const p = onTube(a, -z);
      pos.setXYZ(i, p.x, p.y, p.z);
      const c = deep.clone().lerp(light, Math.min(1, Math.abs(a) / EDGE + 0.2));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

    // Glowing rails along the top of both walls.
    for (const side of [-1, 1]) {
      const p = onTube(side * EDGE, 0);
      const rail = new THREE.Mesh(this.unit, new THREE.MeshBasicMaterial({ color: side < 0 ? '#00f0ff' : '#ff2bd6' }));
      rail.scale.set(0.12, 0.12, AHEAD + BEHIND + 20);
      rail.position.set(p.x, p.y, -(AHEAD - BEHIND) / 2);
      scene.add(rail);
    }

    // Neon rings across the tube that rush past: they show the speed.
    const arc = (thickness, color) => {
      const g = new THREE.TorusGeometry(R - 0.02, thickness, 4, 48, EDGE * 2);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }));
      m.rotation.z = -Math.PI / 2 - EDGE;
      return m;
    };
    this.rings = Array.from({ length: Math.ceil((AHEAD + BEHIND) / RING_GAP) + 2 }, (_, i) => {
      const m = arc(0.05, i % 2 ? '#7d8cff' : '#5a34b8');
      const holder = new THREE.Group();
      holder.add(m);
      holder.position.y = R;
      scene.add(holder);
      return holder;
    });

    // Start and finish: a checkered band across the tube, posts and flags.
    this.startLine = this.line(false);
    this.finishLine = this.line(true);

    // Stars and streaks in the night around the tube.
    this.stars = [];
    const starColors = ['#f4f2ff', '#c9b8ff', '#7fd8ff', '#ff9ef0'];
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(this.unit, new THREE.MeshBasicMaterial({ color: starColors[i % 4], fog: false }));
      const ang = rnd() * Math.PI * 2;
      const rad = 18 + rnd() * 40;
      m.position.set(Math.cos(ang) * rad, R + 4 + Math.abs(Math.sin(ang)) * rad * 0.8, -rnd() * 200);
      m.scale.setScalar(0.12 + rnd() * 0.15);
      scene.add(m);
      this.stars.push(m);
    }

    // Spare bits for bursts (crystal sparkles, tumbles).
    this.debrisPool = Array.from({ length: 140 }, () => {
      const m = new THREE.Mesh(this.unit, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true }));
      m.visible = false;
      scene.add(m);
      return { m, v: new THREE.Vector3(), life: 0, max: 1, s: 0.2 };
    });

    // The countdown number.
    this.countGroup = new THREE.Group();
    scene.add(this.countGroup);
  }

  /** A checkered band across the tube (and, for the finish, an arch of flags). */
  line(finish) {
    const g = new THREE.Group();
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 16;
    const x = c.getContext('2d');
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) {
      x.fillStyle = (i + j) % 2 ? '#14082e' : '#f4f2ff';
      x.fillRect(i * 8, j * 8, 8, 8);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    const geo = new THREE.PlaneGeometry(1, 1, 48, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const p = onTube(pos.getX(i) * 2 * EDGE, pos.getY(i) * 1.6, 0.03);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })));
    if (finish) {
      // Two neon posts at the rims and a row of flags hanging between them.
      for (const side of [-1, 1]) {
        const p = onTube(side * EDGE, 0);
        const post = new THREE.Mesh(this.unit, new THREE.MeshBasicMaterial({ color: '#ffe600' }));
        post.scale.set(0.3, 4.5, 0.3);
        post.position.set(p.x, p.y + 2.25, 0);
        g.add(post);
      }
      const top = onTube(EDGE, 0).y + 4.3;
      const beam = new THREE.Mesh(this.unit, new THREE.MeshBasicMaterial({ color: '#ffe600' }));
      beam.scale.set(Math.sin(EDGE) * R * 2 + 0.3, 0.25, 0.25);
      beam.position.set(0, top, 0);
      g.add(beam);
      for (let i = -4; i <= 4; i++) {
        const f = this.sprite(FLAG, 1.1);
        f.position.set(i * 1.25, top - 0.55, 0);
        g.add(f);
      }
    }
    this.scene.add(g);
    return g;
  }

  sprite(art, size) {
    const s = new THREE.Sprite(this.artMaterial(art, true));
    s.scale.set(size, size * (art.rows.length / art.rows[0].length), 1);
    return s;
  }

  /** Pixel art as a texture (for sprites, or flat cut-outs that tilt with their rider). */
  artMaterial(art, forSprite) {
    const key = `${forSprite ? 's' : 'm'}:${art.rows.join('|')}`;
    let material = this.textures.get(key);
    if (!material) {
      const c = document.createElement('canvas');
      c.width = art.rows[0].length * 8;
      c.height = art.rows.length * 8;
      paint(c.getContext('2d'), art, 0, 0, 8);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      material = forSprite
        ? new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, fog: false })
        : new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, color: '#d4d4d4' }); // a touch dimmer, so white fur doesn't over-glow
      this.textures.set(key, material);
    }
    return material;
  }

  // ---------- riders: an animal on a neon skateboard, leaving a glowing trail ----------

  makeRider(seat) {
    const color = this.colorOf(seat);
    const group = new THREE.Group();
    const body = new THREE.Group(); // tilts and spins on top of the board
    group.add(body);
    const board = new THREE.Mesh(this.unit, this.mat(color, { emissive: color, emissiveIntensity: 0.8 }));
    board.scale.set(1.5, 0.12, 0.55);
    board.position.y = 0.22;
    body.add(board);
    for (const [x, z] of [[-0.5, 0.2], [0.5, 0.2], [-0.5, -0.2], [0.5, -0.2]]) {
      const wheel = new THREE.Mesh(this.unit, this.mat('#14082e'));
      wheel.scale.set(0.2, 0.2, 0.14);
      wheel.position.set(x, 0.1, z);
      body.add(wheel);
    }
    const art = this.players[seat]?.art;
    let face = null;
    if (art) {
      face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5 * (art.rows.length / art.rows[0].length)), this.artMaterial(art, false));
      face.position.y = 1.05;
      body.add(face);
    }
    this.scene.add(group);
    // The trail: flat glowing tiles laid on the tube behind the board.
    const trail = new THREE.InstancedMesh(this.unit, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }), 30);
    trail.frustumCulled = false;
    this.scene.add(trail);
    return { group, body, face, trail, history: [], lastA: null };
  }

  syncRiders(view) {
    const seen = new Set();
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    view.riders.forEach((r, i) => {
      seen.add(r.seat);
      let v = this.riders.get(r.seat);
      if (!v) { v = this.makeRider(r.seat); this.riders.set(r.seat, v); }
      // Riders side by side; a little stagger so two in the same spot don't flicker.
      const stagger = (i - (view.riders.length - 1) / 2) * 0.35;
      const p = onTube(r.a, RIDE + stagger);
      v.group.position.copy(p);
      v.group.rotation.z = r.a; // stands square to the wall
      // Lean into the carve, and spin and hop while tumbling.
      const carve = v.lastA === null ? 0 : (r.a - v.lastA) / Math.max(this.dt, 1e-3);
      v.lastA = r.a;
      v.lean = (v.lean || 0) + (Math.max(-0.5, Math.min(0.5, -carve * 0.25)) - (v.lean || 0)) * Math.min(1, this.dt * 8);
      v.body.rotation.z = v.lean + (r.tumble > 0 ? r.spin : 0);
      v.body.position.y = r.tumble > 0 ? Math.abs(Math.sin(r.spin * 0.5)) * 0.8 : Math.sin(this.time * 9 + i) * 0.03;
      // Trail: where this rider was over the last few metres.
      if (view.phase === 'riding') v.history.push({ a: r.a, d: view.distance });
      while (v.history.length && view.distance - v.history[0].d > 5) v.history.shift();
      const n = Math.min(v.trail.count, v.history.length);
      for (let k = 0; k < v.trail.count; k++) {
        const h = v.history[Math.floor((k / v.trail.count) * v.history.length)];
        if (k >= n || !h) { m4.makeScale(0, 0, 0); v.trail.setMatrixAt(k, m4); continue; }
        const tp = onTube(h.a, h.d - view.distance + RIDE + stagger, 0.02);
        q.setFromAxisAngle(zAxis, h.a);
        const w = 0.35 + 0.35 * (k / v.trail.count);
        m4.compose(tp, q, new THREE.Vector3(w, 0.04, 0.45));
        v.trail.setMatrixAt(k, m4);
      }
      v.trail.instanceMatrix.needsUpdate = true;
    });
    for (const [seat, v] of this.riders) if (!seen.has(seat)) { this.scene.remove(v.group); this.scene.remove(v.trail); this.riders.delete(seat); }
  }

  // ---------- crystals and obstacles ----------

  syncCrystals(view) {
    const seen = new Set();
    for (const c of view.crystals) {
      seen.add(c.id);
      let m = this.crystals.get(c.id);
      if (!m) {
        const color = this.colorOf(c.seat);
        m = new THREE.Mesh(this.gem, this.mat(color, { emissive: color, emissiveIntensity: 0.9 }));
        this.scene.add(m);
        this.crystals.set(c.id, m);
      }
      m.position.copy(onTube(c.a, c.d - view.distance + RIDE, 0.75));
      m.rotation.y = this.time * 3 + c.id;
      m.scale.setScalar(1 + Math.sin(this.time * 6 + c.id) * 0.08);
    }
    for (const [id, m] of this.crystals) if (!seen.has(id)) { this.scene.remove(m); this.crystals.delete(id); }
  }

  syncObstacles(view) {
    const seen = new Set();
    for (const o of view.obstacles) {
      seen.add(o.id);
      let g = this.obstacles.get(o.id);
      if (!g) {
        // A row of dark voxel blocks along the curve, with a pink glow on top.
        g = new THREE.Group();
        g.userData.glow = new THREE.MeshBasicMaterial({ color: NIGHT.warn, transparent: true, opacity: 0.6 });
        const span = o.width * 2 * R;
        const n = Math.max(2, Math.round(span / 0.9));
        for (let k = 0; k < n; k++) {
          const a = o.a - o.width + ((k + 0.5) / n) * o.width * 2;
          const p = onTube(a, 0, 0.55);
          const b = new THREE.Mesh(this.unit, this.mat(NIGHT.block));
          b.scale.set(span / n * 0.96, 1.1, 0.9);
          b.position.set(p.x, p.y, 0);
          b.rotation.z = a;
          g.add(b);
          const cap = new THREE.Mesh(this.unit, g.userData.glow);
          const cp = onTube(a, 0, 1.12);
          cap.scale.set(span / n * 0.98, 0.1, 0.95);
          cap.position.set(cp.x, cp.y, 0);
          cap.rotation.z = a;
          g.add(cap);
        }
        this.scene.add(g);
        this.obstacles.set(o.id, g);
      }
      const ahead = o.d - view.distance;
      g.position.z = -(ahead + RIDE);
      // Glows brighter and pulses as it gets close.
      const near = Math.max(0, 1 - ahead / 45);
      g.userData.glow.opacity = 0.35 + near * (0.45 + 0.2 * Math.sin(this.time * 14));
    }
    for (const [id, g] of this.obstacles) if (!seen.has(id)) { this.scene.remove(g); this.obstacles.delete(id); }
  }

  // ---------- HUD: distance to the finish, crystals, countdown ----------

  buildOverlay() {
    const host = this.canvas.parentElement || document.body;
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:"Press Start 2P",Fredoka,monospace;color:#f4f2ff;';
    el.innerHTML = `
      <div style="position:absolute;left:50%;top:16px;translate:-50% 0;width:min(70vw,900px);height:22px">
        <div style="position:absolute;inset:7px 0;border-radius:4px;background:rgba(125,140,255,0.2);box-shadow:inset 0 0 0 2px rgba(125,140,255,0.5)"></div>
        <div data-v="fill" style="position:absolute;left:0;top:7px;bottom:7px;width:0;border-radius:4px;background:linear-gradient(90deg,#00f0ff,#ff2bd6)"></div>
        <div data-v="who" style="position:absolute;top:-14px;left:0;translate:-50% 0;display:flex;gap:2px"></div>
        <img data-v="flag" alt="" style="position:absolute;right:-30px;top:-6px;width:34px;image-rendering:pixelated">
      </div>
      <div data-v="scores" style="position:absolute;left:0;right:0;bottom:16px;display:flex;justify-content:center;gap:18px"></div>
      <div data-v="banner" style="position:absolute;left:50%;top:38%;translate:-50% -50%;font-size:clamp(28px,6vw,80px);color:#ffe600;text-shadow:0 0 24px #ffe600,0 6px 0 #160934;opacity:0;transition:opacity 0.3s"></div>`;
    host.appendChild(el);
    this.overlay = el;
    this.ui = Object.fromEntries([...el.querySelectorAll('[data-v]')].map((n) => [n.dataset.v, n]));
    this.ui.flag.src = artURL(FLAG, 7);
    this.crystalURL = artURL(CRYSTAL_ART, 5);
    this.hudKey = '';
  }

  drawHud(view) {
    this.ui.fill.style.width = `${view.progress * 100}%`;
    this.ui.who.style.left = `${view.progress * 100}%`;
    const whoKey = view.riders.map((r) => r.seat).join(',');
    if (whoKey !== this.whoKey) {
      this.whoKey = whoKey;
      this.ui.who.innerHTML = view.riders.map((r) => {
        const art = this.players[r.seat]?.art;
        return art ? `<img src="${artURL(art, 3)}" style="width:28px;image-rendering:pixelated;filter:drop-shadow(0 0 6px ${this.colorOf(r.seat)})">` : '';
      }).join('');
    }
    // Crystals: each rider's own count (race), or the team's jar against the goal.
    const key = JSON.stringify([view.mode, view.riders.map((r) => [r.seat, r.caught]), view.goal]);
    if (key !== this.hudKey) {
      this.hudKey = key;
      const gem = `<img src="${this.crystalURL}" style="width:26px;image-rendering:pixelated">`;
      if (view.mode === 'team') {
        const share = Math.min(1, view.jar / Math.max(1, view.goal));
        const animals = view.riders.map((r) => {
          const art = this.players[r.seat]?.art;
          return art ? `<img src="${artURL(art, 3)}" style="width:36px;image-rendering:pixelated">` : '';
        }).join('');
        this.ui.scores.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:8px;background:rgba(22,9,52,0.8);box-shadow:0 0 0 3px ${share >= 1 ? '#39ff7a' : '#7d8cff'}">
          ${animals}<div style="position:relative;width:min(30vw,320px);height:22px;border-radius:4px;background:rgba(125,140,255,0.2);overflow:hidden">
          <div style="position:absolute;inset:0 auto 0 0;width:${share * 100}%;background:${share >= 1 ? '#39ff7a' : 'linear-gradient(90deg,#00f0ff,#7fd8ff)'}"></div></div>
          ${gem}<span style="font-size:clamp(14px,1.8vw,22px)">${view.jar} / ${view.goal}</span></div>`;
      } else {
        this.ui.scores.innerHTML = view.riders.map((r) => {
          const art = this.players[r.seat]?.art;
          const c = this.colorOf(r.seat);
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:8px;background:rgba(22,9,52,0.8);box-shadow:0 0 0 3px ${c}">
            ${art ? `<img src="${artURL(art, 3)}" style="width:36px;image-rendering:pixelated">` : ''}${gem}<span style="font-size:clamp(16px,2vw,26px);color:${c}">${r.caught}</span></div>`;
        }).join('');
      }
    }
  }

  setDigit(group, n, color, size) {
    group.clear();
    if (n == null || !DIGITS[n]) return;
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
      this.setDigit(this.countGroup, n, '#f4f2ff', 0.7);
      this.countPop = 1;
    }
    this.countPop = Math.max(0, (this.countPop || 0) - this.dt * 2.5);
    this.countGroup.scale.setScalar(1 + Math.sin(this.countPop * Math.PI) * 0.35);
    this.countGroup.position.set(0, R + 1, -RIDE - 14);
  }

  // ---------- effects ----------

  burst(p, color, n, power, up = 3, size = 0.16) {
    let k = 0;
    for (const d of this.debrisPool) {
      if (d.life > 0) continue;
      d.m.material.color.set(color);
      d.m.position.copy(p);
      d.m.visible = true;
      d.v.set((rnd() * 2 - 1) * power, rnd() * up + 1, (rnd() * 2 - 1) * power);
      d.max = d.life = 0.4 + rnd() * 0.5;
      d.s = size * (0.6 + rnd() * 0.8);
      if (++k >= n) break;
    }
  }

  banner(text, seconds) {
    this.ui.banner.textContent = text;
    this.ui.banner.style.opacity = '1';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { this.ui.banner.style.opacity = '0'; }, seconds * 1000);
  }

  handleEvents(events, view) {
    for (const ev of events) {
      if (ev.type === 'catch') {
        this.burst(onTube(ev.a, RIDE, 0.75), this.colorOf(ev.seat), 10, 2.5, 3, 0.14);
      } else if (ev.type === 'tumble') {
        this.burst(onTube(ev.a, RIDE, 0.8), '#ffe600', 12, 2, 4, 0.14);
        this.shake = Math.max(this.shake, 0.25);
      } else if (ev.type === 'go') {
        this.banner('GO!', 0.8);
      } else if (ev.type === 'finish') {
        this.banner('FINISH!', 2.4);
        for (let i = 0; i < 6; i++) {
          setTimeout(() => this.burst(new THREE.Vector3((rnd() - 0.5) * 9, R + 2 + rnd() * 3, -RIDE - 6), SPARKS[i % 5], 20, 4, 5, 0.2), i * 200);
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
    // Narrow screens: pull back so both walls stay in view.
    this.back = Math.max(0, (1.6 - this.camera.aspect) * 5);
    this.camera.updateProjectionMatrix();
  }

  draw(view, dt = 1 / 60) {
    this.dt = Math.min(dt, 0.1);
    this.time += this.dt;
    this.watchSpeed();

    // Rings and lines move towards the camera as the riders travel.
    const offset = view.distance % RING_GAP;
    this.rings.forEach((ring, i) => { ring.position.z = BEHIND - i * RING_GAP + offset; });
    this.startLine.position.z = view.distance - RIDE;
    this.startLine.visible = view.distance < BEHIND + 2;
    this.finishLine.position.z = -(view.length - view.distance + RIDE);
    this.finishLine.visible = view.length - view.distance < AHEAD + 10;
    for (const s of this.stars) {
      s.position.z += view.phase === 'riding' ? this.dt * 4 : 0;
      if (s.position.z > 10) s.position.z -= 210;
    }

    this.syncRiders(view);
    this.syncCrystals(view);
    this.syncObstacles(view);
    this.drawCountdown(view);
    this.drawHud(view);

    for (const d of this.debrisPool) {
      if (d.life <= 0) continue;
      d.life -= this.dt;
      d.v.y -= 12 * this.dt;
      d.m.position.addScaledVector(d.v, this.dt);
      d.m.scale.setScalar(d.s * Math.min(1, (d.life / d.max) * 1.6));
      d.m.material.opacity = Math.min(1, (d.life / d.max) * 2);
      if (d.life <= 0) d.m.visible = false;
    }

    // Camera: just behind and above the riders, looking down the tube.
    this.shake = Math.max(0, this.shake - this.dt * 1.5);
    const sh = this.reduceMotion ? 0 : this.shake * this.shake * 1.5;
    this.camera.position.set((rnd() - 0.5) * sh, 3.4 + this.back * 0.4 + (rnd() - 0.5) * sh, 8.5 + this.back);
    this.camera.lookAt(0, 2.2, -24);

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
    clearTimeout(this.bannerTimer);
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
