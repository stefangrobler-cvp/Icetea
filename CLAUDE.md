# Neon Arcade: family game platform

Family games on a shared big screen (tablet, TV), played with phones as controllers.
Platform shell in `platform/`, games as sealed plug-ins in `games/<id>/`.
Read `docs/ARCHITECTURE.md` and `platform/contract/README.md` before changing either.

## Working with the owner

- The owner works from a tablet and is not a developer: explain in plain language,
  short, no jargon. Give step-by-step instructions for anything they must do themselves.
- Develop on the branch named in the session; commit and push when a piece of work is done.
  No pull requests unless asked.

## Hard rules

- **Games are sealed.** A game only touches its own folder and talks to the platform
  through `host` (contract v1). No imports outside the folder, no network, no browser
  storage, no platform globals. `test/contract.test.js` enforces this.
- **Controller kit stays small.** Only `swipe` (looks `bar`, `rod`; up/down or sideways), `aim`, `tap`, `tilt`, `pads` and `pointer` exist.
  Reuse them and add layouts freely (a game may switch layouts mid-match with
  `host.setLayout`). **Ask the owner before adding a new control type.**
- **Phase one only.** Do not build sign-in, accounts/profiles beyond guest nickname +
  avatar + help level, rewards, scoreboards, sharing, buying, themes or an admin console.
- **No third-party advertising, analytics or tracking code.** Measurement is first-party
  (`platform/server/metrics.js`) and only records fields listed in `SCREEN_METRICS`.
- **Works in current Safari and Chrome** on phones and tablets (iPad included:
  provide fallbacks such as `roundRect`; vibration is Android-only, iPhone flashes).
- **A child who can't read must be able to play.** Icons and colour first, words second.
  `howTo` tips start with an emoji icon (menus show it as pixel art where
  `platform/shared/pixels.js` has one). Results show the players' animals.
- **Neon Voxel look**: a night-violet world of chunky blocks with neon player colours,
  pixel-art animals instead of emoji on screen, pixel-stepped ribbon labels. Reference:
  `docs/style-samples/neon-voxel-pong.html`. Draw with `host.theme` and player colours;
  draw players as their `art` (pixel data from `host.players`), not their emoji.
  Fonts: Fredoka for text, Press Start 2P for short labels (both self-hosted).
- **3D games** use three.js r128 kept in the game's own `vendor/` folder (see `games/pong/`),
  with its network loaders switched off, and fall back to a flat 2D drawing when a screen
  has no WebGL. Check the frame rate on a real tablet.

## Games

- Start a new game with the `/new-game` skill (or `npm run new-game -- <id> "<Name>" <icon>`),
  which copies `templates/game/` and adds the id to `platform/catalogue.json`.
- Shape of a game: `manifest.js` (plain data), `game.js` (`createGame(host)`),
  `engine.js` (rules only, no DOM — this is what tests import), `renderer.js`, `sounds.js`, `README.md`.
  Bigger games split further like `games/pong/` and `games/soccer/`.
- Every game should: support `boost` (0–2) as help for *that* player only; pause cleanly;
  accept `playerJoined` mid-match where it makes sense; report `match-started`,
  `point-scored`, `match-ended`; use `host.random` so tests can be repeatable.

## Checks

- `npm test` — all tests (contract, boundary, each game's rules, platform, server).
- Browser check of one game: `npm start`, then `node scripts/smoke.cjs <game-id> <screenshot-dir>`
  (Playwright; Chromium is preinstalled in cloud sessions). Look at the screenshots.
- `npm start` serves on `PORT` (default 3000). Stop test servers with `pkill -x node`.
