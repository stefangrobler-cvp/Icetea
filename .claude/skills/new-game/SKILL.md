---
name: new-game
description: Add a new game to the Neon Arcade platform from an idea - plan it against the contract and controller kit, scaffold games/<id>/ from the template, build the rules with tests, draw it, and check it in the browser. Use when the owner asks for a new game or gives game ideas.
---

# New game

Arguments: a game idea (and optionally an id, name and emoji icon).
Read `CLAUDE.md` and `platform/contract/README.md` first.

## 1. Game brief (before any code)

Write a short brief, in plain language, and decide:
- **id / name / icon**: id lower-case with dashes (`air-hockey`), name ≤ 30 chars, one emoji.
- **Players and modes**: 1–4 phones; head-to-head and/or team v computer (`sides`, `computer`).
- **Controls**: map every action to the controller kit — `swipe` (0..1 slider; look `bar` or `rod`; `direction: horizontal` for left/right),
  `aim` (dial; `{angle}` then `{angle, release:true}`), `tap` (giant button; `{down:true}` /
  `{down:false}`, params `ready`, `icon`, `text`) `tilt` (-1..1; drag rail fallback),
  `pads` (2-4 coloured pads; `{pad, down}`) and `pointer` (touchpad cursor; `{x,y}`, `{x,y,tap}`, `{back}`). Use several layouts and switch
  them mid-match with `host.setLayout` if needed.
  **If the idea truly needs a control that isn't in the kit (slingshot, joystick, drawing...),
  stop and ask the owner before building it.** Suggest a way to play it with the existing kit too.
- **Win rule and match length** (aim for 1–5 minutes), **difficulty options**, and what
  **boost** (help for younger players) does in this game.
- **Can a child who can't read play it?** Icons and colour for everything important.

If the owner asked for a batch of ideas, present all briefs together (sorted quick-win first,
flagging any that need a new control) and wait for approval before building.

## 2. Scaffold

```
npm run new-game -- <id> "<Name>" <icon>
```

This makes `games/<id>/` (a working "catch the stars" starter), `test/<id>.test.js`,
and adds the id to `platform/catalogue.json`. Run `npm test` — it should pass straight away.

## 3. Build

1. `manifest.js`: modes, options, layouts, three `howTo` tips (emoji first).
2. `engine.js`: the rules as plain logic (no DOM, no `window`), using the injected `rng`.
   Write tests in `test/<id>.test.js` as you go: winning, losing, scoring, pause freezes
   everything, boost only helps that player, the computer can be beaten on easy and is
   harder on hard (where there is a computer).
3. `game.js`: wire engine to `host` — layouts, input, messages on phones, `host.vibrate`
   on hits, `host.report` events, `playerJoined`, `optionChanged`. Never import outside the folder.
4. `renderer.js`: neon look using `host.theme` colours and seat colours, glow, Fredoka font,
   players' avatars. Fill `host.stage`, handle resize, and remove everything in `stop()`.
5. `sounds.js`: Web Audio beeps into `host.audio.output` (so mute works).
6. `README.md` for the game, and add it to the games list in the root `README.md`.

Use Pong and Soccer (`games/pong`, `games/soccer`) as the reference for coin toss,
countdown, replays and computer players — copy patterns into the new folder, don't import them.

## 4. Check

- `npm test` all green.
- `npm start` (e.g. `PORT=3124 node platform/server/index.js &`), then
  `BASE=http://localhost:3124 node scripts/smoke.cjs <id> <scratchpad>`; open the screenshots
  and check it looks right on the big screen and the phone. `pkill -x node` afterwards.
- Re-read the diff: nothing outside `games/<id>/`, `test/<id>.test.js`,
  `platform/catalogue.json` and READMEs should change for a normal game.

## 5. Finish

Commit ("Add <Name>"), push, and tell the owner in plain language: how to play it,
what to try with the kids, and anything that needs testing on real devices.
