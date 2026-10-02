// Game settings and tuning numbers. No screen or network code in here,
// so this file can be reused by any display (web tablet now, Apple TV later).

export const COURT = { width: 1600, height: 900 };

export const POINTS_TO_WIN = 7;
export const COUNTDOWN_SECONDS = 3;

export const PADDLE = {
  width: 24,
  inset: 60, // distance from the court edge to the paddle's back
};

export const BALL = { size: 22 };

// Largest angle (degrees) the ball can leave a paddle at. Hitting near the
// edge of a paddle sends the ball off at a steeper angle.
export const MAX_BOUNCE_ANGLE = 55;

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
    ai: { maxSpeed: 300, reaction: 0.5, aimError: 290, predict: false },
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
    ai: { maxSpeed: 1000, reaction: 0.07, aimError: 72, predict: true },
  },
};

export const COLORS = {
  1: '#00f0ff', // player 1: neon cyan
  2: '#ff2bd6', // player 2: neon pink
  cpu: '#ffe600', // computer: neon yellow
  ball: '#ffffff',
  line: '#7d8cff',
  background: '#05010f',
};

export const DEFAULT_SETTINGS = { mode: 'versus', difficulty: 'easy' };
