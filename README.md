# Neon Arcade (working name)

A family game platform: a tablet or TV is the shared screen and each person's
phone is their controller. Nothing to install, no sign-in. Phase one (Foundation):
rooms, QR joining, the controller kit, the game plug-in contract, guest play and
basic measurement, with Pong and Soccer as the first two games.

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

## Running it

```
npm install
npm start        # then open http://localhost:3000 (big screen) on a computer or tablet
npm test
```

Settings (environment variables): `PORT`, `STATS_KEY` (turns on `/stats?key=...`),
`METRICS_FILE` (where measurement is written; default `data/metrics.jsonl`).

## Hosting

Alpha runs on Render's free plan from `render.yaml` (every push to the branch deploys).
The free plan sleeps after 15 minutes without visitors and wipes saved files on
restart, so measurement there is for testing only; roll-out will use proper
servers with a database behind `platform/server/metrics.js`.
