// Soccer's description for the platform: who can play, how, and what the phones show.
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

const defence = { control: 'swipe', id: 'def', label: '🛡️', look: 'rod' };
const attack = { control: 'swipe', id: 'att', label: '⚽', look: 'rod' };

export const manifest = {
  contract: 1,
  id: 'soccer',
  name: 'Soccer',
  icon: '⚽',
  version: '1.0.0',
  ages: '5+',
  matchLength: '3–5 min',
  players: { min: 1, max: 2 },
  modes: [
    { id: 'versus', icon: '🧒⚡🧒', label: '1 v 1', sides: ['left', 'right'], players: { min: 2, max: 2 } },
    { id: 'team', icon: '🧒🧒⚡🤖', label: 'Team v computer', sides: ['left', 'right'], computer: 'right', players: { min: 1, max: 2 } },
  ],
  options: [difficulty],
  // The phone switches layout during the game: two rods (in the same left/right
  // order as on the big screen), one rod when two kids share a team, and the
  // aiming circle for a kick-off.
  layouts: {
    'both-left': [defence, attack],
    'both-right': [attack, defence],
    defence: [defence],
    attack: [attack],
    kickoff: [{ control: 'aim', id: 'kick', label: '⚽' }],
  },
  howTo: [
    { icon: '👍', text: 'One thumb defends 🛡️, one attacks ⚽' },
    { icon: '🎯', text: 'Kick-off: slide round the circle, let go to kick' },
    { icon: '🏆', text: 'First to 7 goals wins' },
  ],
};
