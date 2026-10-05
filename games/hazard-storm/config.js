// Hazard Storm's numbers in one place. World units: the screen is 1600 x 900, y grows down.

export const WORLD = { width: 1600, height: 900 };
export const ARENA = { left: 50, right: 1550, top: 110 };
export const TRACK_Y = 790; // where the orbs run (their centre)

export const ORB = { radius: 40, speed: 1500 }; // speed: how fast an orb follows the swipe (per second)
export const DASH = { distance: 300, speed: 2600, ghost: 0.45, cooldown: 3 };
export const BUMP = { push: 380, decay: 6 }; // last one standing only
export const SHIELD = 5; // team mode: shared shield
export const HEARTS = 3; // last one standing: each
export const COUNTDOWN = 3;

// Help for younger players: a smaller orb, and a longer safe blink after a hit.
export const BOOST = { radius: [1, 0.82, 0.68], safe: [1.4, 2, 2.6] };

export const SPIKE = { width: 36, height: 74, speed: 520 };
export const BEAM = { minWidth: 200, maxWidth: 440, grow: 0.25, fire: 0.75 };
export const BALL = { radius: 30, speed: 330, apex: [240, 400], gravity: 1500 };
export const BATTERY = { size: 46, speed: 170, every: 12 };

// warn: seconds a hazard blinks before it is dangerous; every: seconds between
// hazards at the start and at the end of the storm; speed: how fast hazards move.
export const DIFFICULTIES = {
  easy: { time: 75, warn: 1.4, speed: 0.8, every: [1.8, 1.05] },
  medium: { time: 90, warn: 1.1, speed: 1, every: [1.35, 0.75] },
  hard: { time: 110, warn: 0.85, speed: 1.2, every: [1.05, 0.55] },
};
export const VERSUS_TIME = 150; // last one standing: the storm stops here (most hearts wins)
export const VERSUS_RAMP = 90; // seconds for the storm to reach full strength

// When each kind of hazard joins the storm (share of the way through).
export const UNLOCK = { spike: 0, beam: 0.2, ball: 0.45 };

export const COLORS = {
  background: '#05010f', line: '#00f0ff', cpu: '#ffe600', text: '#f4f2ff',
  spike: '#ff9f1c', beam: '#ff2bd6', ball: '#ffffff', battery: '#39ff7a',
};
