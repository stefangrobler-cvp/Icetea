// Hazard Storm's description for the platform: who can play, how, and what the phones show.
// Plain data only, so the platform can read it without running the game.

export const manifest = {
  contract: 1,
  id: 'hazard-storm',
  name: 'Hazard Storm',
  icon: '⚡',
  version: '1.0.0',
  ages: '4+',
  matchLength: '1–3 min',
  players: { min: 1, max: 4 },
  modes: [
    { id: 'team', icon: '🧒🧒⚡🤖', label: 'Team v storm', sides: ['team', 'cpu'], computer: 'cpu', players: { min: 1, max: 4 } },
    { id: 'versus', icon: '🧒💥🧒', label: 'Last one standing', sides: ['p1', 'p2', 'p3', 'p4'], players: { min: 2, max: 4 } },
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
    play: [
      { control: 'tap', id: 'dash', label: '💨' },
      { control: 'swipe', id: 'move', direction: 'horizontal' },
    ],
  },
  howTo: [
    { icon: '👉', text: 'Swipe left and right to dodge' },
    { icon: '💨', text: 'Dash to zip through danger' },
    { icon: '🔋', text: 'Grab batteries. Survive the storm!' },
  ],
};
