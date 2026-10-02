# Neon Pong – plan

## How it fits together

```
 Phone (controller)  ──swipe──▶  Server (relay)  ──▶  Tablet (game screen)
 Phone (controller)  ◀─score───  Server (relay)  ◀──  Tablet runs the game
```

- **Tablet = the game host.** It runs the game engine 120 times a second and
  draws it. Running the ball locally keeps it perfectly smooth.
- **Phones = controllers.** They send the paddle position (not "move up a bit"),
  so a lost or late message can never leave a paddle in the wrong place.
- **Direct link for swipes.** Each phone opens a direct WebRTC connection to
  the tablet over the home Wi-Fi (`public/js/direct.js`), so paddle movement
  never has to travel to the internet server and back. If that can't be set up,
  swipes go through the server instead. The tablet shows which route each phone
  uses: ⚡ = direct, 🌐 = through the server, plus the delay in milliseconds.
- **Server = a tiny relay.** It creates a room per tablet, hands out the QR code,
  passes messages between phones and tablet, and tells the tablet when a phone
  drops or comes back. It has no game logic.

## Keeping the game logic reusable (Apple TV later)

All rules live in `shared/` and have **no** knowledge of screens, browsers or
networking:

| File | What it does |
|------|--------------|
| `shared/config.js` | Modes, difficulty numbers, colours, points to win |
| `shared/engine.js` | Ball, paddles, scoring, countdown, pause, winner |
| `shared/ai.js` | The computer player |
| `shared/protocol.js` | Names of the messages sent over the network |

The tablet page only *draws* what the engine says (`public/js/renderer.js`).
An Apple TV app can either embed this same JavaScript (tvOS has JavaScriptCore)
or port these few small files to Swift one-for-one.

Power-ups (phase two) will plug into the engine's `events` and `step()` –
the engine already reports every hit, bounce and point as an event.

## File structure

```
server/index.js        web server + rooms + QR code
shared/                game rules (no screen code)
public/index.html      tablet: game screen
public/play.html       phone: controller
public/js/             browser code (tablet, phone, renderer, sound, network)
public/css/style.css   neon look
test/                  automated checks
render.yaml            one-click hosting setup for Render
```

## Stages

1. Plan + skeleton (this file)
2. Game engine + computer player + tests
3. Server: rooms, QR code, relay, reconnects
4. Tablet screen: tap to start, lobby with QR, game, pause, winner
5. Phone controller: colour, swipe area, score, pause, settings
6. Sound
7. Hosting on Render + instructions
