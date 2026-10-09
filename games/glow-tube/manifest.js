// Glow Tube's description for the platform: who can play, how, and what the phones show.
// Plain data only, so the platform can read it without running the game.

export const manifest = {
  contract: 1,
  id: 'glow-tube',
  name: 'Glow Tube',
  icon: '🛹',
  version: '0.1.0',
  ages: '4+',
  matchLength: '1–2 min',
  players: { min: 1, max: 4 },
  modes: [
    { id: 'race', icon: '🧒💎🧒', label: 'Crystal race', sides: ['p1', 'p2', 'p3', 'p4'], players: { min: 2, max: 4 } },
    { id: 'team', icon: '🧒🧒⚡🤖', label: 'Team v computer', sides: ['team', 'cpu'], computer: 'cpu', players: { min: 1, max: 4 } },
  ],
  options: [
    {
      id: 'steer',
      label: 'Steer',
      choices: [
        { id: 'tilt', icon: '📲', label: 'Tilt' },
        { id: 'slide', icon: '👆', label: 'Slide' },
      ],
      default: 'tilt',
      changeWhilePaused: true,
    },
    {
      id: 'difficulty',
      label: 'Difficulty',
      choices: [
        { id: 'easy', icon: '🐢', label: 'Easy' },
        { id: 'medium', icon: '🐇', label: 'Medium' },
        { id: 'hard', icon: '🚀', label: 'Hard' },
      ],
      default: 'easy',
    },
  ],
  // Tilt the phone to carve across the tube, or slide a thumb along a big rail
  // (phones without a motion sensor always get the rail).
  layouts: {
    tilt: [{ control: 'tilt', id: 'steer' }],
    slide: [{ control: 'tilt', id: 'steer', mode: 'slide' }],
  },
  howTo: [
    { icon: '📲', text: 'Tilt (or slide) to ride up the walls' },
    { icon: '💎', text: 'Catch the crystals in your colour' },
    { icon: '🏁', text: 'Most crystals at the finish wins' },
  ],
};
