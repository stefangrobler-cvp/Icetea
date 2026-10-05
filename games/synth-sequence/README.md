# Synth Sequence 🎹

A plug-in game for the platform (see `platform/contract/README.md`).

- A round neon synthesizer plays a pattern of lights and 80s synth notes on four
  pads: cyan (low), pink (middle), yellow (high), green (chord). Players repeat it on
  their phones' pads (same colours). Each round adds a note and plays a bit faster.
- **Team relay (1–4 phones):** the colours are shared out (2 kids: two each; 4 kids:
  one each) and each plays only their own notes. Reach the 🤖's best length (5 / 8 / 11)
  to win. A wrong note costs a ❤️ (3) and the same pattern plays again.
- **Last one standing (2–4 phones):** everyone repeats the whole pattern on their own
  phone; a wrong note costs that player a ❤️; the last one with hearts wins.
- **Phones during playback:** on Easy they light up along with the screen; on Medium
  and Hard they show 👀 (watch the screen).
- **Help for younger players:** after a pause (3 s / 1.5 s) the right pad lights up on
  that child's phone only.

| File | What it does |
|---|---|
| `manifest.js` | Name, players, modes, difficulty, phone layout |
| `game.js` | The contract: `createGame(host)` |
| `engine.js`, `config.js` | Rules (no drawing) |
| `renderer.js`, `sounds.js` | The synthesizer drawing and synth sounds |

Tests: `test/synth-sequence.test.js`.
