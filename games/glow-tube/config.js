// Glow Tube's numbers in one place.
//
// The tube is a half-pipe seen from behind. Distances run along the tube (metres,
// `d`); a rider's place across it is an angle (`a`, radians): 0 is the bottom, minus
// is up the left wall, plus up the right wall.

export const TUBE = { radius: 6, maxAngle: 1.25 }; // how far up the walls riders can go
export const COUNTDOWN = 3;
export const STEER_SPEED = 2.6; // radians per second a rider can carve across the tube

// Crystals come in little trails of 3-5, one trail per player at a time.
export const CRYSTAL = { gap: 2.6, groupGap: 9, groupMin: 3, groupMax: 5, catch: 1.0 };
// Obstacles: a dark block across part of the tube, glowing as it comes.
export const OBSTACLE = { width: 0.42, keepClear: 3 }; // keepClear: no crystals this close
export const TUMBLE = 1.2; // seconds a rider tumbles after hitting one (can't catch or steer)

// Help for younger players: a wider catch, and a gentle pull towards their own crystals.
export const BOOST = { catch: [1, 1.5, 2], pull: [0, 0.5, 1] };

// length: metres to the finish. speed: metres per second. spread: how far up the walls
// crystals go (share of maxAngle). obstacleEvery: metres between obstacles.
// goal: team mode, the share of all crystals the team needs in the jar.
export const DIFFICULTIES = {
  easy: { length: 700, speed: 10, spread: 0.6, obstacleEvery: 34, goal: 0.35 },
  medium: { length: 850, speed: 12, spread: 0.8, obstacleEvery: 24, goal: 0.45 },
  hard: { length: 1000, speed: 14, spread: 1, obstacleEvery: 18, goal: 0.55 },
};

// Default colours (the platform's theme and seat colours replace these).
export const COLORS = { background: '#160934', line: '#7d8cff', cpu: '#ffe600', text: '#f4f2ff' };
