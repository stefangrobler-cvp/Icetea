// The platform's look. Games read these through host.theme instead of choosing
// their own colours, so a family theme (forest, space...) can re-skin every game later.

export const THEMES = {
  neon: {
    id: 'neon',
    background: '#05010f',
    line: '#7d8cff',
    ball: '#ffffff',
    text: '#f4f2ff',
    cpu: '#ffe600', // the computer player
    seats: { 1: '#00f0ff', 2: '#ff2bd6', 3: '#39ff7a', 4: '#ff9f1c' }, // each phone's colour
  },
};

export const DEFAULT_THEME = THEMES.neon;
