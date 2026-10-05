# Soccer (foosball)

A plug-in game for the platform (see `platform/contract/README.md`).

- 1 v 1, or one or two kids against the computer. Two rods per team, three players each.
- Phone layouts: two swipe pads (`both-left` / `both-right`, in the same left/right
  order as on the big screen), one pad when two kids share a team (`defence` /
  `attack`), and the aiming circle for kick-offs (`kickoff`).
- Coin toss decides who kicks off; after a goal the team that let it in kicks off.
- Attackers play the ball both ways; defenders only clear forward (no own goals).
- First to 7; slow-motion replay of the winning goal.

Same file layout as Pong. Tests: `test/soccer.test.js`.
