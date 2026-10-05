# Block Stacker 🧊

A plug-in game for the platform (see `platform/contract/README.md`).

- **Team v computer (1–4 phones):** take turns dropping blocks onto one floating
  platform. Reach the 🏁 line before the time runs out. The computer sends glitch
  shakes (⚠️ warning first). Each block that falls off costs a ❤️; three and it's over.
- **Tower race (2–4 phones):** a tower each, everyone drops at once. Lose all your ❤️
  and you're out. Last one standing, or the most blocks when time runs out, wins.
- **Phone:** tilt rail on top (nudge the block left/right, or drag the rail on phones
  without a motion sensor) and a giant tap button to drop.
- **Help for younger players:** wider blocks that swing slower.
- **Levels:** goal 10 / 14 / 18 blocks; faster swing and stronger, more frequent shakes.

| File | What it does |
|---|---|
| `manifest.js` | Name, players, modes, difficulty, phone layout |
| `game.js` | The contract: `createGame(host)` |
| `engine.js`, `config.js` | Rules and physics (no drawing) |
| `renderer.js`, `sounds.js` | Drawing and sounds |
| `vendor/matter.js` | [Matter.js](https://brm.io/matter-js/) 0.20.0 physics (MIT, `vendor/LICENSE-matter-js`), wrapped as a module |

Tests: `test/block-stacker.test.js`.
