# Game plug-in contract (version 1)

Every game is a sealed-off folder in `games/<id>/`. It talks to the platform only
through this contract and never imports platform code. A game folder can be moved
to its own repository unchanged.

## What a game folder must contain

- `manifest.js`: `export const manifest = { ... }` — who can play and how. Plain
  data with no browser code, so the server can read and check it.
- `game.js`: re-exports the manifest and exports `createGame`:

```js
import { manifest } from './manifest.js';
export { manifest };
export function createGame(host) {     // called once each time the game is opened
  return { start, input, update, draw, pause, resume, stop, /* optional: */ optionChanged, playerJoined, playerLeft, playerBack };
}
```

To add a game: create the folder, then add its id to `platform/catalogue.json`.
The platform checks the manifest when it starts and leaves out (with a clear
message) any game that doesn't follow the contract.

Everything else in the folder (engine, drawing, sounds, pictures) is the game's own
business. Automated tests (`test/contract.test.js`) fail if a game imports anything
outside its folder, or uses the network, browser storage or platform globals.

## 1. The manifest

Plain data, so the platform can list the game without running it.

| Field | Meaning |
|---|---|
| `contract` | Contract version this game was built for: `1` |
| `id` | Lower-case id, same as the folder name, e.g. `pong` |
| `name`, `icon`, `version` | Shown on the game list. `icon` is one emoji |
| `ages`, `matchLength` | Shown on the game card, e.g. `"4+"`, `"2–5 min"` |
| `players` | `{ min, max }` people with phones (rooms hold up to 4) |
| `modes` | How people play: `{ id, icon, label, sides, computer?, players }`. `sides` are the teams (e.g. `["left", "right"]`); `computer` is the side the computer plays, if any |
| `options` | Simple choices shown as big icon buttons, e.g. difficulty: `{ id, label, choices: [{ id, icon, label }], default, changeWhilePaused? }` |
| `layouts` | Phone layouts: each is one or two controls from the controller kit (below) |
| `howTo` | Up to three tips: `{ icon, text }` — icon first, a few words after |

The platform puts players on sides: the computer takes its side, people share the
others in seat order.

## 2. What the platform gives the game: `host`

| `host.…` | What it is |
|---|---|
| `stage` | The element on the big screen to draw in (fills the screen) |
| `players` | `[{ seat, nickname, avatar, color, side, boost, art }]` for this match. `art` is the player's animal as pixel data, `{ rows, palette }` (each row a string, each letter a palette colour, `.` see-through): draw this rather than the `avatar` emoji. No device or account details. `boost` (0 none, 1 a little, 2 a lot) is help a younger player chose on their phone: make the game easier for *that* player (e.g. a bigger paddle), never harder for anyone else |
| `theme` | Colours to draw with: `background`, `line`, `ball`, `cpu`, `text`. Use these rather than hard-coding colours, so families' themes can re-skin the game later |
| `audio` | `{ context, output }`: a Web Audio context and the node to play into (respects the mute button). May be `null` |
| `random()` | Random number 0..1 |
| `setLayout(seat, layoutId, params?)` | Show one of the manifest's layouts on that player's phone. Can change at any time (e.g. an aiming circle for a kick-off) |
| `message(seat \| 'all', { icon, text? } \| null)` | A short notice on the phones (e.g. "🦁 Leo kicks off"); `null` clears it. Sending to `'all'` replaces any per-phone notices |
| `vibrate(seat, ms)` | Buzz that phone where the phone allows it (Android); other phones flash instead |
| `report(event)` | Tell the platform what happened (section 4) |

## 3. What the game must do (the platform calls these)

| Call | When |
|---|---|
| `start({ mode, options, players })` | A match begins. `options` holds the chosen value for each manifest option |
| `input(seat, controlId, value)` | A phone control moved (see the controller kit for values) |
| `update(dt)`, `draw()` | Every frame, `dt` in seconds. The platform owns the clock and stops calling `update` while paused |
| `pause()`, `resume()` | The game is paused: someone pressed ❚❚, or a phone dropped out. The platform shows the pause and "waiting for player" screens |
| `optionChanged(id, value)` | Optional. An option marked `changeWhilePaused` changed during a pause |
| `playerJoined(player)` | Optional. A phone joined mid-match; return `true` if the game took them in |
| `playerLeft(seat)`, `playerBack(seat)` | Optional. For information; the platform already pauses |
| `stop()` | Leave: remove everything the game added to `stage` |

The game owns everything inside the match (serving, coin tosses, kick-offs,
replays). The platform owns everything around it: joining, nicknames and avatars,
the lobby, pausing, drop-outs, the results screen and the rematch button.

## 4. Events the game reports: `host.report({ type, ... })`

| `type` | Contents | Required |
|---|---|---|
| `match-started` | — | Yes, from `start()` |
| `point-scored` | `side`, `scores: { [side]: number }` | Yes, each point |
| `match-ended` | `winner` (a side, or `null` for a draw), `scores`, optional `stats` like `{ longestRally: 14 }` | Yes, once, when the game is completely finished (after any replay) |
| `highlight` | `name`, optional `seat` / `side` | Optional, for celebrations and achievements later |

The game reports *what happened*; the platform decides what it is worth.

## 5. The controller kit

Phones only ever run the platform's controller kit; no game code runs on a phone.
Each control has one agreed look and behaviour across all games:

| Control | Settings | Looks and behaves | `input` value |
|---|---|---|---|
| `swipe` | `id`, `label?` (emoji), `look?`: `bar` or `rod`, `direction?`: `vertical` (default) or `horizontal` | Big swipe area in the player's colour. Drag up and down (or left and right) anywhere in it; ▲▼ / ◀▶ hints; it glows while touched; a small preview moves with your thumb | number 0 (top) .. 1 (bottom), or 0 (left) .. 1 (right) |
| `aim` | `id`, `label?` (emoji) | Aiming circle. Touch, slide round to aim, let go to fire. Layout params: `target` (`left`/`right`: the side to aim at), `targetIcon` (emoji marking it), `ready`, `seconds`, `maxAngle` (degrees from flat; steeper directions are shaded and blocked) | `{ angle }` while aiming, `{ angle, release: true }` when let go (radians, 0 = right, down is positive) |
| `tap` | `id`, `label?` (emoji) | Giant button in the player's colour with a big emoji; lights up while pressed. Layout params: `ready` (`false` dims it, e.g. not your turn), `icon` (emoji instead of the label), `text` (a few words), `recharge` (seconds: with `ready: false`, the button fills up over that time, e.g. a dash recharging) | `{ down: true }` when pressed, `{ down: false }` when let go (always delivered) |
| `tilt` | `id`, `label?` (emoji on the puck) | A rail with a glowing puck that follows the phone's left/right tilt. iPhones show "📲 Tap to tilt" first (permission). Without a motion sensor, or if refused, the rail is dragged with a finger instead. Shown as a slim strip above the other control (a sideways swipe pad is stacked the same way) | number -1 (left) .. 1 (right) |
| `pads` | `id`, `label?` (emoji), `pads?`: 2, 3 or 4 (default 4) | Big pads in fixed colours: cyan, pink, yellow, green (in that order); side by side, or a 2 x 2 grid for 4. Light up while pressed. Layout params: `ready`, `icons` (an emoji per pad), `lit` (index of a pad to light up, e.g. to play back a pattern), `active` (the pads this player may use; the others are dimmed) | `{ pad, down: true }` when pressed, `{ pad, down: false }` when let go (always delivered) |
| `pointer` | `id`, `label?` (faint emoji in the middle) | The whole area is a touchpad: slide to move your cursor on the big screen (like a laptop trackpad), a quick tap to tag. A dot shows where the cursor is; it starts in the middle each time the pad appears. Layout params: `ready`, `back` (show a 🔙 button) | `{ x, y }` (0..1) while moving; `{ x, y, tap: true }` for a tap and `{ back: true }` for 🔙 (always delivered) |

New controls are added only when a game genuinely can't be built from these.
