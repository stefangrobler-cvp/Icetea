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

## Drawing (Neon Voxel)

`renderer3d.js` draws the pitch in 3D with three.js (kept in `vendor/`, MIT): a striped
neon pitch sunk into the ground, rods with block footballers that swing round the bar
when they kick, glowing goals whose nets shake, a GOAL! banner, the kick-off ring and
aim arrow made of blocks, the players' pixel animals and block scores behind the pitch.
`game.js` adds a split-second hold on each kick and slow motion once a ball is past the
last defender and rolling straight at the goal (both slow the whole game evenly). On a
screen without WebGL it uses the flat `renderer2d.js` instead.
