# Hazard Storm ⚡

A plug-in game for the platform (see `platform/contract/README.md`).

- Everyone is a glowing orb on a track at the bottom, moving left and right.
  Hazards blink a warning first, then strike: 🔶 falling spikes, 🟣 laser beams
  that burn a strip of floor, ⚪ bouncing plasma balls. The storm builds up:
  spikes first, then beams, then balls.
- **Team v storm (1–4 phones):** survive until the ⏱️ bar runs out with a shared
  shield (⚡ x5); 🔋 batteries refill it. Shield gone: the 🤖 wins.
- **Last one standing (2–4 phones):** 3 ❤️ each; orbs bump each other gently.
- **Phone:** a 💨 dash button (zip sideways, see-through for a moment, then it
  recharges) above a sideways swipe pad.
- **Help for younger players:** a smaller orb and a longer safe blink after a hit.
- **Levels:** longer warnings, fewer and slower hazards on Easy.

| File | What it does |
|---|---|
| `manifest.js` | Name, players, modes, difficulty, phone layout |
| `game.js` | The contract: `createGame(host)` |
| `engine.js`, `config.js` | Rules (no drawing) |
| `renderer.js`, `sounds.js` | Drawing and sounds |

Tests: `test/hazard-storm.test.js`.
