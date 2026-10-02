# Neon Pong

A retro two-screen Pong game for kids. A tablet shows the court; phones are the
controllers. Nothing to install: it all runs in the web browser.

## Playing

1. **Tablet:** open the game's web address, turn the tablet sideways, press **▶ Start**.
   The first time on a tablet, a one-page **How to play** guide appears first (also
   available any time from the ❓ buttons).
2. **Phones:** open the Camera app, point it at the QR code on the tablet, tap the link.
   Type your name and tap an animal avatar, then **Let's go!** (the phone remembers it;
   tap your avatar at the top of the menu to change it). The first phone is blue, the second pink.
3. Pick the game (**🏓 Ping Pong** or **⚽ Soccer**), then **1 v 1** or **Team v CPU**,
   then **Easy / Medium / Hard**, on the tablet or any phone.
4. Press **START**. Swipe up and down on the phone to move your paddle.
   Swipe *while* you hit the ball to bend its path and give it a curve: the faster
   the swipe, the bigger the bend.
5. First to 7 wins. Either phone can pause (❚❚) and resume (▶).

The tablet's lobby (and the small text in the bottom corner during a game) shows
how quick each phone's connection is: **⚡** means the phone talks straight to the
tablet over Wi-Fi (fastest), **🌐** means it goes through the internet server.
For ⚡, the phones and tablet must be on the same Wi-Fi.

### Soccer

Like a foosball table: each team has two rods with three players on each.
Score by getting the ball into the other team's goal; every other wall bounces it back.

- **1 v 1:** each phone shows two swipe areas side by side, one per rod
  (🛡️ Defend and ⚽ Attack, in the same left/right order as on the tablet).
  Use one thumb on each.
- **Team v CPU with two kids:** one kid plays defence, the other attack, one swipe area each.
  With one kid, they get both rods. A kid who joins mid-match joins the team straight away.
- **Rods:** 3 players on each. Neighbouring players' reach overlaps, so there is no spot
  on the pitch a rod can't cover, at any level.
- **Passing:** attackers play the ball both ways, so they can pass back to their defence.
  Defenders only clear forward, and a ball behind them can't be knocked into their own net.
  A clearance or kick-off by your own team flies past your own attackers.
- **Kick-off:** a coin toss (showing the players' avatars) picks who kicks off first; after a goal, the team that let it in
  kicks off. The kicker's phone shows a circle: touch it, slide round to aim (the arrow also
  shows on the tablet), and let go to kick. After 12 seconds it kicks by itself.
- **Pause menu** (either phone or the tablet): ▶ resume, change the level on the fly
  (🐢 🐇 🚀), or 🏠 Main menu (tap twice) to pick a different game.

When a match is won, the tablet replays the winning shot in slow motion (tap to skip),
then shows the winner's avatar with a crown.

If a phone locks or loses Wi-Fi, the game pauses and shows *Waiting for player*.
Unlock the phone (or scan the code again) and the game carries on.

| | Paddles | Ball | Computer (team mode) |
|---|---|---|---|
| Easy | big | slow | slow, often guesses wrong (soccer: bigger goals too) |
| Medium | medium | faster | decent |
| Hard | small | fast | sharp, rarely misses |

## Hosting on Render (free)

1. Go to <https://render.com> and choose **Get Started** → **GitHub** to sign up with your GitHub account.
2. In Render, click **New +** → **Blueprint**.
3. Connect this repository when asked, pick it from the list, and click **Apply**.
   Render reads `render.yaml` and builds the game (takes 2–3 minutes).
4. Open the service called **neon-pong**. The web address is at the top,
   for example `https://neon-pong.onrender.com`.

Every change pushed to the repository's main branch is deployed automatically.
The free plan goes to sleep after 15 minutes without visitors: the first visit
after that takes up to a minute to wake up.

## Running it on a computer

```
npm install
npm start        # then open http://localhost:3000
npm test
```

## How the code is organised

See [docs/PLAN.md](docs/PLAN.md). In short:

- `shared/` – the game rules (engine, computer player, settings, physics). No screen code,
  so it can be reused for the Apple TV version. `shared/games/` holds what is different
  between Ping Pong and Soccer.
- `server/` – serves the pages, makes QR codes, relays messages between phones and tablet.
- `public/` – the tablet game screen (`index.html`) and the phone controller (`play.html`).
