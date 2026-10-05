# Cyber Hunt 🔍

A plug-in game for the platform (see `platform/contract/README.md`).

- A neon city full of wandering things, split into four coloured quarters
  (cyan, pink, yellow, green). Each round shows what to find: one kind of thing,
  flickering with a "glitch". Normal look-alikes wander around too.
- **Phone, two steps:** tap the coloured pad for the quarter where you saw it
  (`pads`), then slide on the touchpad to move your magnifying lens and tap to tag
  (`pointer`); 🔙 goes back to the pads. A wrong tag freezes you for a second.
- **Team v scanner (1–4 phones):** find every glitch over 3 rounds before the
  🤖's red scan line crosses the city (a wrong tag moves it 4 seconds closer).
- **Spotting race (2–4 phones):** first to tag a glitch scores; first to 5 wins.
- **Help for younger players:** a bigger lens and reach, and the lens is gently
  pulled towards a glitch.
- **Levels:** more look-alikes and decoys, faster wandering, a quicker scan.

| File | What it does |
|---|---|
| `manifest.js` | Name, players, modes, difficulty, phone layouts (`pick`, `hunt`) |
| `game.js` | The contract: `createGame(host)` |
| `engine.js`, `config.js` | Rules (no drawing) |
| `renderer.js`, `sounds.js` | Drawing (city, glitch effect, lenses) and sounds |

Tests: `test/cyber-hunt.test.js`.
