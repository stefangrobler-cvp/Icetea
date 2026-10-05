// Synth Sequence's numbers in one place. World units: the screen is 1600 x 900.

export const WORLD = { width: 1600, height: 900 };

// The four pads, in pad order: cyan low note, pink middle note, yellow high note, green chord.
export const PADS = [
  { color: '#00f0ff', notes: [130.81] }, // C3
  { color: '#ff2bd6', notes: [329.63] }, // E4
  { color: '#ffe600', notes: [783.99] }, // G5
  { color: '#39ff7a', notes: [261.63, 329.63, 392.0] }, // C major chord
];

export const COUNTDOWN = 3;
export const HEARTS = 3;
export const START_LENGTH = 2;
export const GAP = 0.18; // seconds of silence between notes when the screen plays
export const RESULT = 1.3; // seconds to show "well done" / "oops" before the next playback
export const MAX_LENGTH = 24; // last one standing: stop here (most hearts wins)

// Help for younger players: after this many seconds without pressing, that player's
// phone lights the right pad (null = no hint).
export const HINT_AFTER = [null, 3, 1.5];

// note: seconds each note lights up at the start (gets quicker as the pattern grows,
// down to `fastest`); goal: team mode beats the computer's best by reaching this length;
// wait: seconds you can wait before a note counts as a mistake; mirror: phones light up
// with the screen during playback.
export const DIFFICULTIES = {
  easy: { note: 0.62, fastest: 0.4, goal: 5, wait: 10, mirror: true },
  medium: { note: 0.5, fastest: 0.3, goal: 8, wait: 7, mirror: false },
  hard: { note: 0.42, fastest: 0.22, goal: 11, wait: 5, mirror: false },
};

export const COLORS = { background: '#05010f', line: '#7d8cff', cpu: '#ffe600', text: '#f4f2ff' };
