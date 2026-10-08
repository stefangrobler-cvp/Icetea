# Block Stacker 🧊

A plug-in game for the platform (see `platform/contract/README.md`).

- **Team v computer (1–4 phones):** take turns dropping blocks onto one floating
  platform. Reach the 🏁 line before the time runs out. The computer sends glitch
  shakes (⚠️ warning first). Each block that falls off costs a ❤️; three and it's over.
- **Tower race (2–4 phones):** a tower each, everyone drops at once. Lose all your ❤️
  and you're out. Last one standing, or the most blocks when time runs out, wins.
- **Blocks: Classic or Shapes.** Shapes are pieces of 2–4 cubes (bar, square, corner,
  L, T, step) that you turn before dropping. In team mode the goal is then a height
  (8 / 9 / 11 cubes high) instead of a number of blocks.
- **Forces:** gusts of wind (push the tower, harder near the top, and blow the hanging
  block aside) and earthquakes (shake the island). In team mode the computer sends them
  with a warning first; in the tower race each player has a force button that rocks
  everyone else's tower, then recharges (15 s).
- **Phone:** your own block (or shape) hanging on a wire: tap to drop it. Small buttons
  underneath: 🔄 turn (Shapes) and 💨 / 🌋 force (Tower race).
- **Help for younger players:** wider blocks that swing slower; only the easy shapes,
  a bit bigger; forces rock their tower more gently.
- **Levels:** goal 10 / 14 / 18 blocks; faster swing and stronger, more frequent forces.

| File | What it does |
|---|---|
| `manifest.js` | Name, players, modes, difficulty, phone layout |
| `game.js` | The contract: `createGame(host)` |
| `engine.js`, `config.js` | Rules and physics (no drawing) |
| `renderer3d.js` | Drawing in 3D (Neon Voxel): blocks wearing their builder's animal, floating islands, laser wire, block flag |
| `renderer2d.js`, `sounds.js` | Flat drawing (used on screens without WebGL) and sounds |
| `vendor/three.js` | [three.js](https://threejs.org/) r128 + glow add-ons (MIT, `vendor/LICENSE-three`), network loaders switched off |
| `vendor/matter.js` | [Matter.js](https://brm.io/matter-js/) 0.20.0 physics (MIT, `vendor/LICENSE-matter-js`), wrapped as a module |

Tests: `test/block-stacker.test.js`.
