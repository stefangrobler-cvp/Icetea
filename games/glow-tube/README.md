# Glow Tube 🛹 (prototype)

A plug-in game for the platform (see `platform/contract/README.md`). A rough playable
version to test the idea and the controls before the full polish.

- Everyone rides a neon skateboard down the same half-pipe, side by side at the same
  speed, from the start line to the 🏁 finish line. A bar at the top shows how far
  there is to go.
- **Catch the crystals in your colour.** Steer up the left wall, along the bottom or up
  the right wall. Other colours are someone else's (no penalty for passing them).
- **Dark blocks** glow pink as they come. Riding into one is a tumble: a second where
  you can't steer or catch. Nobody is ever out.
- **Crystal race (2–4 phones):** the most crystals at the finish wins (a draw if equal).
- **Team v computer (1–4 phones):** everyone's crystals go in one jar; fill it to the
  goal by the finish (35% / 45% / 55% of all crystals), or the 🤖 wins.
- **Phone, two ways to steer (lobby choice "Steer"):** 📲 Tilt the phone, or 👆 Slide a
  thumb along a big rail (the thumb's place is your place in the tube). Phones without a
  motion sensor always get the rail.
- **Help for younger players:** a wider catch, and a gentle pull towards their crystals.
- **Levels:** longer and faster tubes, crystals further up the walls, more blocks.

| File | What it does |
|---|---|
| `manifest.js` | Name, players, modes, options (steer, difficulty), phone layouts |
| `game.js` | The contract: `createGame(host)` |
| `engine.js`, `config.js` | Rules (no drawing): the track is laid out at the start |
| `renderer3d.js` | Drawing in 3D (Neon Voxel): the half-pipe, skateboards, trails, crystals, blocks |
| `renderer2d.js`, `sounds.js` | Flat drawing from above (screens without WebGL) and sounds |
| `vendor/three.js` | [three.js](https://threejs.org/) r128 + glow add-ons (MIT, `vendor/LICENSE-three`), network loaders switched off |

Tests: `test/glow-tube.test.js`.
