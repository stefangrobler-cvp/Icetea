# __NAME__

A plug-in game for the platform (see `platform/contract/README.md`).

- Status: **starter** made from `templates/game` (catch the stars together). Replace with the real game.
- Phone: one swipe pad (`play` layout).

| File | What it does |
|---|---|
| `manifest.js` | Name, players, modes, options, phone layouts |
| `game.js` | The contract: `createGame(host)` |
| `engine.js` | The rules (no drawing or browser code) |
| `renderer.js`, `sounds.js` | Drawing and sounds |

Tests: `test/__ID__.test.js`.
