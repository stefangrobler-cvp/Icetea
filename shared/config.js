// Game settings and tuning numbers. No screen or network code in here,
// so this file can be reused by any display (web tablet now, Apple TV later).

export const COURT = { width: 1600, height: 900 };

export const POINTS_TO_WIN = 7;
export const COUNTDOWN_SECONDS = 3;

export const PADDLE = {
  width: 24,
  inset: 60, // distance from the court edge to the paddle's back
};

export const BALL = { radius: 14 };

// Largest angle (degrees) the ball can leave a paddle at. Hitting near the
// edge of a paddle sends the ball off at a steeper angle.
export const MAX_BOUNCE_ANGLE = 50;

// The ball never travels steeper than this (degrees from horizontal), so it
// can't end up bouncing straight up and down forever.
export const MAX_TRAVEL_ANGLE = 62;

// "Traction": moving the paddle while it hits the ball drags the ball along.
//   maxDeflect - most extra angle (degrees) a very fast swipe can add
//   refSpeed   - paddle speed (court units/s) that counts as a fast swipe
//   spin       - how strongly the ball then curves (radians/s at full swipe)
//   spinFade   - seconds for the curve to fade away
export const TRACTION = { maxDeflect: 24, refSpeed: 1500, spin: 0.55, spinFade: 0.6 };

// Human paddles glide to the finger position at up to this speed (units/s),
// which smooths out jumpy Wi-Fi updates without adding noticeable delay.
export const PADDLE_GLIDE_SPEED = 7000;

// The two games you can pick before a match.
export const GAMES = {
  classic: { id: 'classic', label: 'Ping Pong' },
  soccer: { id: 'soccer', label: 'Soccer' },
};

// Lanes: which of a player's rods a swipe controls (soccer has two per team).
export const LANE = { MAIN: 0, DEFENCE: 0, ATTACK: 1 };

// Foosball-style soccer.
export const SOCCER = {
  goalHeight: 300, // the goal mouth in the middle of each end
  goalDepth: 46, // how far the net sticks out behind the goal line (drawing only)
  // Where each rod sits, as a fraction of the court width. The rods interleave
  // like a real foosball table: L-defence, R-attack, L-attack, R-defence.
  rodX: { left: { [LANE.DEFENCE]: 0.15, [LANE.ATTACK]: 0.62 }, right: { [LANE.DEFENCE]: 0.85, [LANE.ATTACK]: 0.38 } },
  playersPerRod: 3,
  playerSpacing: 300, // distance between the players on a rod
  playerLength: 0.45, // player size compared to the ping pong paddle for that level
  playerWidth: 30,
  ballSpeed: 0.9, // ball speed compared to ping pong for that level
};
export const MODES = {
  versus: { id: 'versus', label: 'Head to head', humans: 2 },
  team: { id: 'team', label: 'Team vs computer', humans: 1 }, // 1 or 2 kids
};

// Ball speed is in court units per second (the court is 1600 wide).
// `ai` controls the computer player in team mode:
//   maxSpeed   - how fast the computer paddle can move
//   reaction   - seconds before it reacts to the ball coming its way
//   aimError   - how far off (court units) its guess of where the ball lands can be
//   predict    - true = works out bounces off the walls, false = just chases the ball
// Against flawless play the computer misses roughly 35-40% (easy), 15% (medium), 4% (hard).
export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: 'Easy',
    paddleHeight: 250,
    ballSpeed: 560,
    ai: { maxSpeed: 300, reaction: 0.5, aimError: 330, predict: false },
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    paddleHeight: 175,
    ballSpeed: 820,
    ai: { maxSpeed: 560, reaction: 0.2, aimError: 115, predict: true },
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    paddleHeight: 120,
    ballSpeed: 1080,
    ai: { maxSpeed: 1000, reaction: 0.07, aimError: 68, predict: true },
  },
};

export const COLORS = {
  1: '#00f0ff', // player 1: neon cyan
  2: '#ff2bd6', // player 2: neon pink
  cpu: '#ffe600', // computer: neon yellow
  ball: '#ffffff',
  pitch: '#0b3d24',
  line: '#7d8cff',
  background: '#05010f',
};

export const DEFAULT_SETTINGS = { game: 'classic', mode: 'versus', difficulty: 'easy' };
