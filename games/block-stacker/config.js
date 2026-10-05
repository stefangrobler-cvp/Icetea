// Block Stacker's numbers in one place. World units: the screen is 1600 x 900,
// y grows downwards, and the view scrolls up as towers grow.

export const WORLD = { width: 1600, height: 900 };
export const PLATFORM = { y: 730, height: 26, width: 380 }; // top surface y
export const BLOCK = { height: 58, widths: [120, 140, 160] };
export const WIRE_GAP = 230; // how far above the tower top the wire hangs
export const HANG = 50; // from the wire to the top of the hanging block
export const HEARTS = 3;
export const COUNTDOWN = 3;
export const AUTO_DROP = 10; // seconds before a waiting block drops by itself
export const LOST_BELOW = 420; // a block this far under the platform has fallen off
export const NUDGE = { swing: 60, fall: 0.35, maxFallSpeed: 4 }; // tilt: shift while hanging, push while falling

// Help for younger players: wider blocks that swing slower.
export const BOOST = { width: [1, 1.3, 1.6], swing: [1, 0.8, 0.62] };

// swing: how far the block swings each way, as a share of the platform width.
export const DIFFICULTIES = {
  easy: { swingSpeed: 1.6, swing: 0.42, goal: 10, time: 180, glitchEvery: 16, glitchPower: 3 },
  medium: { swingSpeed: 2.1, swing: 0.55, goal: 14, time: 180, glitchEvery: 12, glitchPower: 4.5 },
  hard: { swingSpeed: 2.6, swing: 0.65, goal: 18, time: 180, glitchEvery: 10, glitchPower: 5 },
};
export const VERSUS_TIME = 120;
export const GLITCH = { warn: 2, shake: 1.2, hz: 5 };

// Default colours (the platform's theme and seat colours replace these).
export const COLORS = { background: '#05010f', line: '#7d8cff', cpu: '#ffe600', text: '#f4f2ff', wire: '#ff2bd6' };
