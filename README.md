# Neon Pong

A retro two-screen Pong game for kids. A tablet shows the court; phones are the
controllers. Nothing to install: it all runs in the web browser.

## Playing

1. **Tablet:** open the game's web address, turn the tablet sideways, tap **Tap to start**.
2. **Phones:** open the Camera app, point it at the QR code on the tablet, tap the link.
   The first phone is Player 1 (blue), the second is Player 2 (pink).
3. Pick **1 v 1** or **Team v CPU** and **Easy / Medium / Hard** on the tablet or any phone.
4. Press **START**. Swipe up and down on the phone to move your paddle.
5. First to 7 wins. Either phone can pause (❚❚) and resume (▶).

If a phone locks or loses Wi-Fi, the game pauses and shows *Waiting for player*.
Unlock the phone (or scan the code again) and the game carries on.

| | Paddles | Ball | Computer (team mode) |
|---|---|---|---|
| Easy | big | slow | slow, often guesses wrong |
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

- `shared/` – the game rules (engine, computer player, settings). No screen code,
  so it can be reused for the Apple TV version.
- `server/` – serves the pages, makes QR codes, relays messages between phones and tablet.
- `public/` – the tablet game screen (`index.html`) and the phone controller (`play.html`).
