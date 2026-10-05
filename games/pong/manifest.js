// Pong's description for the platform: who can play, how, and what the phones show.
// Plain data only, so the platform can read it without running the game.

const difficulty = {
  id: 'difficulty',
  label: 'Difficulty',
  choices: [
    { id: 'easy', icon: '🐢', label: 'Easy' },
    { id: 'medium', icon: '🐇', label: 'Medium' },
    { id: 'hard', icon: '🚀', label: 'Hard' },
  ],
  default: 'easy',
  changeWhilePaused: true,
};

export const manifest = {
  contract: 1,
  id: 'pong',
  name: 'Pong',
  icon: '🏓',
  version: '1.0.0',
  ages: '4+',
  matchLength: '2–5 min',
  players: { min: 1, max: 2 },
  modes: [
    { id: 'versus', icon: '🧒⚡🧒', label: '1 v 1', sides: ['left', 'right'], players: { min: 2, max: 2 } },
    { id: 'team', icon: '🧒🧒⚡🤖', label: 'Team v computer', sides: ['left', 'right'], computer: 'right', players: { min: 1, max: 2 } },
  ],
  options: [difficulty],
  layouts: {
    play: [{ control: 'swipe', id: 'paddle', look: 'bar' }],
  },
  howTo: [
    { icon: '👆', text: 'Swipe up and down to move your paddle' },
    { icon: '🌀', text: 'Swipe as you hit to curve the ball' },
    { icon: '🏆', text: 'First to 7 wins' },
  ],
};
