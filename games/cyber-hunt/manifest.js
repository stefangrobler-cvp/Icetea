// Cyber Hunt's description for the platform: who can play, how, and what the phones show.
// Plain data only, so the platform can read it without running the game.

export const manifest = {
  contract: 1,
  id: 'cyber-hunt',
  name: 'Cyber Hunt',
  icon: '🔍',
  version: '1.0.0',
  ages: '4+',
  matchLength: '2–4 min',
  players: { min: 1, max: 4 },
  modes: [
    { id: 'team', icon: '🧒🧒⚡🤖', label: 'Team v scanner', sides: ['team', 'cpu'], computer: 'cpu', players: { min: 1, max: 4 } },
    { id: 'race', icon: '🧒⚡🧒', label: 'Spotting race', sides: ['p1', 'p2', 'p3', 'p4'], players: { min: 2, max: 4 } },
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
    pick: [{ control: 'pads', id: 'zone', pads: 4 }],
    hunt: [{ control: 'pointer', id: 'cursor', label: '🔍' }],
  },
  howTo: [
    { icon: '🟦', text: 'Tap the colour where you see it' },
    { icon: '👆', text: 'Slide to move your lens, tap to tag' },
    { icon: '✨', text: 'Find the glitchy ones!' },
  ],
};
