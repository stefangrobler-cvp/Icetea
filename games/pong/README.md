# Pong

A plug-in game for the platform (see `platform/contract/README.md`).

- 1 v 1, or one or two kids against the computer.
- Phone: one swipe pad (`play` layout).
- Coin toss decides who serves; first to 7; slow-motion replay of the winning point.
- Swiping while hitting bends the ball's path and adds curve ("traction").

| File | What it does |
|---|---|
| `manifest.js` | Name, players, modes, difficulty, phone layout |
| `game.js` | The contract: `createGame(host)` |
| `engine.js`, `rules.js`, `physics.js`, `ai.js`, `config.js` | The rules and the computer player |
| `renderer.js`, `replay.js`, `sounds.js` | Drawing, the replay, sounds |

Tests: `test/pong.test.js`.
