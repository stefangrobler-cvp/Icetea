// Cyber Hunt's numbers in one place. World units: the screen is 1600 x 900, y grows down.

export const WORLD = { width: 1600, height: 900 };
export const CITY = { left: 40, top: 150, right: 1560, bottom: 880 }; // where things wander

// The four coloured quarters, in pad order: cyan, pink, yellow, green.
export const QUAD_COLORS = ['#00f0ff', '#ff2bd6', '#ffe600', '#39ff7a'];
export const REACH = 0.12; // a cursor can reach this share past its quarter's edges

export const ICON = 58; // size of the wandering things
export const POOL = ['🐱', '🐶', '🤖', '👻', '⭐', '🚗', '🐸', '🍩', '🎈', '🐙', '🚀', '🍕'];

// Help for younger players: a bigger lens and tagging reach, and a gentle pull towards targets.
export const BOOST = { hit: [62, 86, 110], lens: [100, 125, 150], magnet: [0, 0.3, 0.5] };

export const COUNTDOWN = 3;
export const INTRO = 2.2; // seconds showing what to find
export const ROUND_END = 1.4;
export const FREEZE = 1; // seconds a wrong tag freezes your cursor
export const PENALTY = 4; // team mode: a wrong tag brings the scan this many seconds closer
export const TEAM_ROUNDS = 3;
export const RACE_TO = 5;
export const MAX_ROUNDS = 12; // race: stop here if nobody reached the target (most points wins)

// targets: glitched ones to find per round; twins: normal look-alikes; others: other things;
// speed: how fast things wander; time: team mode's whole scan, in seconds.
export const DIFFICULTIES = {
  easy: { targets: 3, twins: 2, others: 12, speed: 22, time: 150 },
  medium: { targets: 3, twins: 4, others: 18, speed: 38, time: 120 },
  hard: { targets: 4, twins: 6, others: 24, speed: 55, time: 100 },
};

export const COLORS = { background: '#05010f', line: '#7d8cff', cpu: '#ff3b5c', text: '#f4f2ff' };
