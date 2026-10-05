// Pong settings and tuning numbers. Everything here belongs to this game only.

export const COURT = { width: 1600, height: 900 };

export const POINTS_TO_WIN = 7;
export const COUNTDOWN_SECONDS = 3;
export const TOSS_SECONDS = 2.6; // coin toss at the start of every match

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

export const LANE = { MAIN: 0 };

// Help for a younger player, chosen on their own phone (0 none, 1 a little, 2 a lot):
// their paddle is this much longer. It never makes anyone else's game harder.
export const BOOST = [1, 1.35, 1.7];

// Ball speed is in court units per second (the court is 1600 wide).
// `ai` controls the computer player in team mode:
//   maxSpeed   - how fast the computer paddle can move
//   reaction   - seconds before it reacts to the ball coming its way
//   aimError   - how far off (court units) its guess of where the ball lands can be
//   predict    - true = works out bounces off the walls, false = just chases the ball
// Against flawless play the computer misses roughly 35-40% (easy), 15% (medium), 4% (hard).
export const DIFFICULTIES = {
  easy: { id: 'easy', paddleHeight: 250, ballSpeed: 560, ai: { maxSpeed: 300, reaction: 0.5, aimError: 330, predict: false } },
  medium: { id: 'medium', paddleHeight: 175, ballSpeed: 820, ai: { maxSpeed: 560, reaction: 0.2, aimError: 115, predict: true } },
  hard: { id: 'hard', paddleHeight: 120, ballSpeed: 1080, ai: { maxSpeed: 1000, reaction: 0.07, aimError: 68, predict: true } },
};

// Fallback colours; the platform's theme overrides these when a match starts.
export const COLORS = {
  ball: '#ffffff',
  line: '#7d8cff',
  background: '#05010f',
  cpu: '#ffe600',
};
