# Decision log

Short entries, newest first. Why we chose something, and when to look at it again.

## 2026-10-08: Block Stacker has no hearts; friendlier stacking (owner approved)
- **Why:** the owner's family found it hard even on Easy, and Hard almost impossible.
- **What:** no hearts and nobody knocked out: a fallen block is an "oops" (lost time only). Team: reach
  the flag before time runs out. Tower race: tallest tower when time runs out. Settled blocks lock
  (all but the top one; a block left at a slant is tipped off), an aiming helper on every level
  (strongest on Easy), PERFECT drops, calmer start on Easy, goals 8 / 12 / 15.
- **How we tuned:** a simulated "real child" with sloppy timing. Classic: almost no oopses on
  Easy/Medium, a few on Hard. Shapes on Hard still drops roughly one block in three for a careless player.
- **Watch:** Easy may now be too easy for older kids; that's what Medium/Hard are for.

## 2026-10-08: Block Stacker gets Shapes and forces (rule change, owner approved)
- **What:** a "Blocks: Classic / Shapes" choice (turnable pieces of 2–4 cubes; team goal becomes a
  height), and forces: wind and earthquakes. The computer sends them in team mode; each player gets a
  recharging force button in the tower race. Tilt control removed from Block Stacker.
- **Platform change:** the `tap` control gained `size: 'small'`; a layout may add up to two small tap
  buttons under its main control. No new control type.
- **Watch:** Shapes on Medium/Hard and Classic on Hard are tough in simulations; and in the tower race,
  check that being "hit" by a sibling is fun rather than upsetting. Retune after family play.

## 2026-10-07: Block Stacker is the third game in the new look
- **Why:** the owner's children enjoyed it most. Seen from the front in 3D; every block wears the face
  of the child who dropped it. Rules and physics unchanged.
- **Reminder:** this is the last game before the outside-family test agreed below.

## 2026-10-07: Carry on redesigning before outside families have played (override)
- **Decision:** the owner played the redesign with his own children ("seems good") and will keep testing;
  meanwhile work moves on to the next game.
- **Risk:** our own household isn't the target audience's evidence: they know the game and want to please.
  A problem in the new look (speed on older tablets, readability from the couch, the kick-off aim for
  young children) could be copied into every game we redesign.
- **Revisit by:** before a third game is redesigned, or before `redesign-v1` replaces the live version,
  whichever comes first: at least 3 outside families play Pong and Soccer, watched without help.

## 2026-10-07: Three fixes from the studio review
- Losing never stings (everyone cheered); players shown by animal as well as colour; joining needs no typing.

## 2026-10-05: Neon Voxel look
- Night-violet block world, neon player colours, pixel-art animals instead of emoji, 3D for Pong and
  Soccer with a flat fallback. Reference: `docs/style-samples/neon-voxel-pong.html`.
