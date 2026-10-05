# Architecture (phase one: Foundation)

The platform shell from the brief's Foundation phase: rooms and live connection,
QR joining, the controller kit, the game plug-in contract, guest play and basic
measurement. Pong, Soccer, Block Stacker, Hazard Storm, Cyber Hunt and Synth Sequence are the games plugged into the contract so far.

```
 Phone (controller kit) ──controls──▶ Server (rooms, relay) ──▶ Big screen (platform shell)
 Phone (controller kit) ◀──state────  Server                ◀── runs the game through the contract
          ▲                                                          │
          └──────────── direct Wi-Fi link (WebRTC) for controls ─────┘
```

## Folders

```
platform/
  contract/      the game plug-in contract (contract.js) and its guide (README.md)
  server/        rooms, live connection, QR codes, game catalogue, measurement
  shared/        message names, nicknames/avatars, theme (platform only, not for games)
  web/           big screen (index.html, js/screen.js), phone (play.html, js/phone.js),
                 controller kit (js/kit/), sound, direct link, font
  catalogue.json the list of games
games/
  pong/          a sealed game: manifest.js + game.js + its own engine, drawing, sounds
  soccer/        another sealed game
test/            contract and boundary checks, each game's rules, platform, server
```

## The rules that keep games sealed

- A game talks to the platform only through `host` (what it is given) and the
  methods it returns from `createGame` (what the platform calls). See
  `platform/contract/README.md`.
- A game imports nothing outside its folder and uses no network, browser storage
  or platform globals. `test/contract.test.js` enforces this.
- No game code runs on phones. Phones only show layouts built from the controller
  kit, as listed in the game's manifest.
- The platform runs game code defensively: a game that throws is stopped and the
  room goes back to the game list, rather than the platform breaking.
- Everything a game sends or receives is plain data, so later an outside maker's
  game can run in a sealed-off frame with the same contract.

## Who owns what

| Platform | Game |
|---|---|
| Rooms, QR + room code, joining, reconnecting | The match itself |
| Nickname and avatar (guest, no sign-in) | Serving, coin toss, kick-offs, replays |
| Lobby: game list, modes, options from manifests | Drawing on its stage |
| The clock (`update`/`draw`), pause, drop-outs | Reporting events: started, point, ended |
| Results screen with crown, rematch | Which phone layout each player sees |
| Mute, theme colours, measurement | |

## Controller kit

`swipe` (swipe pad, up/down or sideways), `aim` (aiming circle), `tap` (giant button, press or hold) and
`tilt` (tilt left/right; a drag rail where there's no motion sensor), `pads` (2-4 coloured
pads) and `pointer` (a touchpad moving a cursor on the big screen): only what the games use.
New controls are added when a game genuinely needs one, after asking.
Phones vibrate where allowed (Android); elsewhere (iPhone) the controls flash.

## Measurement

First-party only (no third-party code). The server writes one JSON line per event
(`platform/server/metrics.js`) through a small storage interface, so the file used
during alpha can be swapped for a database: `postgresStore` is used when
`DATABASE_URL` is set. Device and screen tags
are random, stored hashed, and only used to count returning devices.
Numbers page: `/stats?key=<STATS_KEY>` (off unless `STATS_KEY` is set), including
the 👍 / 👎 share per game from the after-match `feedback` vote.

## Help for younger players

Each player's profile carries `boost` (0–2), passed to games as `players[].boost`.
Games decide what help means (Pong: longer paddle; Soccer: longer players).

## Not built yet (later phases)

Sign-in, profiles beyond guest nickname and avatar, rewards, scoreboards, sharing,
buying, themes and the admin console. `host.theme` and the reported events are
where themes and the rewards engine will plug in.
