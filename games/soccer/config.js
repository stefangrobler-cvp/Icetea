// Soccer (foosball) settings and tuning numbers. Everything here belongs to this game only.

export const COURT = { width: 1600, height: 900 };

export const POINTS_TO_WIN = 7;
export const COUNTDOWN_SECONDS = 3;
export const TOSS_SECONDS = 2.6; // coin toss at the start of every match

// Kick-off: the kicker aims on their phone, then lets go.
export const KICKOFF = {
  getReady: 1.2, // seconds before the kicker can kick (time to see the goal celebration)
  timeLimit: 12, // after this many seconds the ball is kicked automatically
  cpuThinking: 1.4, // how long the computer "aims" before kicking
};

export const BALL = { radius: 14 };

// The ball never travels steeper than this (degrees from horizontal), so it
// can't end up bouncing straight up and down forever. Kick-offs use it too.
export const MAX_TRAVEL_ANGLE = 62;

// "Traction": moving a rod while it kicks the ball puts curve on it.
export const TRACTION = { maxDeflect: 24, refSpeed: 1500, spin: 0.55, spinFade: 0.6 };

// Rods glide to the finger position at up to this speed (units/s).
export const PADDLE_GLIDE_SPEED = 7000;

// Which of a team's two rods a swipe pad moves.
export const LANE = { DEFENCE: 0, ATTACK: 1 };

export const SOCCER = {
  goalHeight: { easy: 380, medium: 320, hard: 280 }, // the goal mouth in the middle of each end, per level
  goalDepth: 46, // how far the net sticks out behind the goal line (drawing only)
  // Where each rod sits, as a fraction of the court width. The rods interleave
  // like a real foosball table: L-defence, R-attack, L-attack, R-defence.
  rodX: { left: { [LANE.DEFENCE]: 0.15, [LANE.ATTACK]: 0.62 }, right: { [LANE.DEFENCE]: 0.85, [LANE.ATTACK]: 0.38 } },
  // Three players on each rod. Spacing is worked out so that neighbouring
  // players' reach overlaps by `overlap` (court units), so there is no spot
  // on a rod's line that nobody can reach, at any player size.
  playersPerRod: { [LANE.DEFENCE]: 3, [LANE.ATTACK]: 3 },
  overlap: 70,
  playerLength: 0.45, // player size compared to `paddleHeight` for that level
  // The computer's players are never bigger than this (court units), so the
  // "big players" help on Easy goes to the kids, not to the computer.
  cpuMaxPlayerLength: 80,
  playerWidth: 30,
};

// `ai` controls the computer's rods in team mode (see ai.js):
//   maxSpeed, reaction, aimError, predict as in Pong, plus
//   distracted - chance (0..1) it doesn't react to a ball coming its way at all
// Against a decent kid in simulation, the kid wins about 12/12 (easy), 7/12 (medium), 4/12 (hard).
export const DIFFICULTIES = {
  easy: { id: 'easy', paddleHeight: 250, ballSpeed: 504, ai: { maxSpeed: 200, reaction: 0.5, aimError: 140, predict: false, distracted: 0.45 } },
  medium: { id: 'medium', paddleHeight: 175, ballSpeed: 738, ai: { maxSpeed: 420, reaction: 0.25, aimError: 80, predict: true, distracted: 0.22 } },
  hard: { id: 'hard', paddleHeight: 120, ballSpeed: 972, ai: { maxSpeed: 600, reaction: 0.1, aimError: 60, predict: true, distracted: 0.12 } },
};

// Fallback colours; the platform's theme overrides these when a match starts.
export const COLORS = {
  ball: '#ffffff',
  line: '#7d8cff',
  background: '#03150c',
  cpu: '#ffe600',
};
