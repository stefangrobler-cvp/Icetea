// Block Stacker's numbers in one place. World units: the screen is 1600 x 900,
// y grows downwards, and the view scrolls up as towers grow.

export const WORLD = { width: 1600, height: 900 };
export const PLATFORM = { y: 730, height: 26, width: 380 }; // top surface y
export const BLOCK = { height: 58, widths: [120, 140, 160] };
export const WIRE_GAP = 230; // how far above the tower top the wire hangs
export const HANG = 50; // from the wire to the top of the hanging block
export const COUNTDOWN = 3;
export const AUTO_DROP = 10; // seconds before a waiting block drops by itself
export const LOST_BELOW = 420; // a block this far under the platform has fallen off
export const NUDGE = { swing: 60, fall: 0.35, maxFallSpeed: 4 }; // tilt: shift while hanging, push while falling

// Help for younger players: wider blocks that swing slower.
export const BOOST = { width: [1, 1.3, 1.6], swing: [1, 0.8, 0.62] };

// Friendliness: a drop nearly over the tower (within `range` x the platform width of the
// top block) slides `pull` of the way there. Players with help always get the easy helper.
export const ASSIST = {
  easy: { range: 0.4, pull: 0.75 },
  medium: { range: 0.4, pull: 0.65 },
  hard: { range: 0.32, pull: 0.5 },
};
// Settled blocks lock in place (all but the top `loose` ones) once still for `after` seconds,
// if they lie within `tilt` radians of flat. One left leaning at a slant for `shrug`
// seconds is tipped off the tower.
export const LOCK = { loose: 1, after: 0.6, speed: 0.15, spin: 0.01, tilt: 0.5, shrug: 1.2 };
export const PERFECT = 20; // a drop within this of the top block's middle is a PERFECT

// swing: how far the block swings each way, as a share of the platform width.
// glitchEvery: seconds between the computer's forces (team mode); glitchPower: how far an
// earthquake shakes the island.
export const DIFFICULTIES = {
  easy: { swingSpeed: 1.3, swing: 0.42, goal: 8, time: 180, glitchEvery: 22, glitchPower: 3 },
  medium: { swingSpeed: 2.0, swing: 0.55, goal: 12, time: 180, glitchEvery: 14, glitchPower: 4.5 },
  hard: { swingSpeed: 2.5, swing: 0.65, goal: 15, time: 180, glitchEvery: 11, glitchPower: 5 },
};
export const VERSUS_TIME = 120;

// Shape blocks: pieces made of 2-4 cubes that a player can turn before dropping.
// Cells are [column, row], rows growing downwards.
export const CELL = 52;
export const SHAPES = {
  bar2: [[0, 0], [1, 0]],
  bar3: [[0, 0], [1, 0], [2, 0]],
  square: [[0, 0], [1, 0], [0, 1], [1, 1]],
  corner: [[0, 0], [0, 1], [1, 1]],
  ell: [[0, 0], [0, 1], [0, 2], [1, 2]],
  tee: [[0, 0], [1, 0], [2, 0], [1, 1]],
  step: [[1, 0], [2, 0], [0, 1], [1, 1]],
};
// Which shapes each level deals; players with help only get the easy ones, a bit bigger.
export const SHAPE_SETS = {
  easy: ['bar2', 'bar3', 'square', 'corner'],
  medium: ['bar2', 'bar3', 'square', 'corner', 'ell', 'tee'],
  hard: ['bar3', 'square', 'corner', 'ell', 'tee', 'step'],
  helped: ['bar2', 'bar3', 'square'],
};
export const SHAPE_BOOST = [1, 1.1, 1.2]; // cube size for players with help
// Team mode with shapes: build up to a height (in cubes) instead of counting blocks.
export const SHAPE_GOAL = { easy: 7, medium: 9, hard: 11 };

// Forces: a gust of wind or an earthquake that rocks a tower. In team mode the
// computer sends them; in the tower race each player has a button that sends one
// to everyone else's tower, then recharges.
export const FORCE = {
  warn: 1.5, // seconds of warning on the tower before it hits
  last: 1.6, // seconds it lasts
  recharge: 15, // tower race: seconds before the button is ready again
  firstCharge: 8,
  startAfter: { easy: 30, medium: 15, hard: 11 }, // team: calm seconds before the computer's first force
  // Wind: a push as a share of gravity (lower on harder levels, whose towers grow taller),
  // growing by windRise for each block-height up the tower, up to windTop times.
  wind: { easy: 0.2, medium: 0.14, hard: 0.1 },
  windRise: 0.12,
  windTop: 2,
  windSwing: 70, // how far a gust blows the hanging block
  quakeHz: 5,
  boost: [1, 0.6, 0.35], // players with help are rocked less
};

// Default colours (the platform's theme and seat colours replace these).
export const COLORS = { background: '#05010f', line: '#7d8cff', cpu: '#ffe600', text: '#f4f2ff', wire: '#ff2bd6' };
