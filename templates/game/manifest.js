// __NAME__'s description for the platform: who can play, how, and what the phones show.
// Plain data only, so the platform can read it without running the game.
// Starter: everyone catches stars together against the computer. Replace with the real game.

export const manifest = {
  contract: 1,
  id: '__ID__',
  name: '__NAME__',
  icon: '__ICON__',
  version: '0.1.0',
  ages: '4+',
  matchLength: '1–3 min',
  players: { min: 1, max: 4 },
  modes: [
    { id: 'team', icon: '🧒🧒⚡🤖', label: 'Team v computer', sides: ['team', 'cpu'], computer: 'cpu', players: { min: 1, max: 4 } },
  ],
  options: [
    {
      id: 'difficulty',
      label: 'Difficulty',
      choices: [
        { id: 'easy', icon: '🐢', label: 'Easy' },
        { id: 'medium', icon: '🐇', label: 'Medium' },
        { id: 'hard', icon: '🚀', label: 'Hard' },
      ],
      default: 'easy',
      changeWhilePaused: true,
    },
  ],
  layouts: {
    play: [{ control: 'swipe', id: 'move', look: 'bar' }],
  },
  howTo: [
    { icon: '👆', text: 'Swipe up and down to move' },
    { icon: '⭐', text: 'Catch the stars together' },
    { icon: '🏆', text: 'Catch 10 before 5 get away' },
  ],
};
