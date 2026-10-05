// Synth Sequence's description for the platform: who can play, how, and what the phones show.
// Plain data only, so the platform can read it without running the game.

export const manifest = {
  contract: 1,
  id: 'synth-sequence',
  name: 'Synth Sequence',
  icon: '🎹',
  version: '1.0.0',
  ages: '4+',
  matchLength: '2–4 min',
  players: { min: 1, max: 4 },
  modes: [
    { id: 'team', icon: '🧒🧒⚡🤖', label: 'Team relay', sides: ['team', 'cpu'], computer: 'cpu', players: { min: 1, max: 4 } },
    { id: 'versus', icon: '🧒⚡🧒', label: 'Last one standing', sides: ['p1', 'p2', 'p3', 'p4'], players: { min: 2, max: 4 } },
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
    play: [{ control: 'pads', id: 'pads', pads: 4 }],
  },
  howTo: [
    { icon: '👀', text: 'Watch and listen to the lights' },
    { icon: '🎹', text: 'Play them back on your pads' },
    { icon: '🎵', text: 'Each round adds one more!' },
  ],
};
