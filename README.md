# Neon Arcade (working name)

A family game platform: a tablet or TV is the shared screen and each person's
phone is their controller. Nothing to install, no sign-in. Phase one (Foundation):
rooms, QR joining, the controller kit, the game plug-in contract, guest play and
basic measurement, with Pong, Soccer, Block Stacker and Hazard Storm as the first games.

## Playing

1. **Big screen:** open the web address and press **▶ Start on this screen**.
   The first time, a one-page **How to play** appears.
2. **Phones (up to 4):** scan the QR code with the camera (or open the address on
   the phone and type the 4-letter room code). Pick a nickname and an animal.
3. Pick a game, how to play (1 v 1, or team against the computer) and the level,
   then **START** on the big screen or any phone.
4. **❚❚** on any phone pauses: resume, change the level, or go back to the games.
   If a phone drops out, the game waits for it.
5. The winner gets a crown; **Play again** for a rematch.

## For game makers

Each game is a sealed folder in `games/` that follows the plug-in contract:
[platform/contract/README.md](platform/contract/README.md).
How it all fits together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Start a new game from the template (a small working starter you then replace):

```
npm run new-game -- air-hockey "Air Hockey" 🏒
npm test
node scripts/smoke.cjs air-hockey   # with npm start running: quick browser check
```

With Claude Code: `CLAUDE.md` holds the project rules, `/new-game <idea>` walks
through brief → build → check, and the `game-builder` agent builds approved games
in parallel. A start-up hook installs everything in cloud sessions.

## Running it

```
npm install
npm start        # then open http://localhost:3000 (big screen) on a computer or tablet
npm test
```

Settings (environment variables): `PORT`, `STATS_KEY` (turns on `/stats?key=...`),
`METRICS_FILE` (where measurement is written; default `data/metrics.jsonl`),
`DATABASE_URL` (a Postgres address; when set, measurement is kept in the
`platform_events` table instead of the file, so it survives restarts).

## Hosting

Alpha runs on Render's free plan from `render.yaml` (every push to the branch deploys).
The free plan sleeps after 15 minutes without visitors and wipes saved files on
restart, so without `DATABASE_URL` measurement there is for testing only. Set
`DATABASE_URL` (any Postgres, e.g. a free Neon database) to keep it.

## For players

- Welcome screen plays a short looping demo: two phones moving the paddles.
- Help for younger players: each phone picks 💪 / 🐣 / 🐣🐣 in the lobby; more
  help means a longer paddle (Pong) or longer players (Soccer) for that player only.
- After each match, 👍 / 👎 on the phones and the big screen (one vote each),
  counted on the numbers page.
