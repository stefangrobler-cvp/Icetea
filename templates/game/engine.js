// __NAME__'s rules: plain logic with no drawing, sound or browser code, so it can be
// tested on its own (test/__ID__.test.js) and reused on other screens later.
// Positions are 0..1 across and down the screen.

export const PHASE = { PLAYING: 'playing', OVER: 'over' };

export const SETTINGS = {
  toWin: 10, // stars to catch
  toLose: 5, // stars that get away
  catcherSize: 0.14, // catcher height, as a share of the screen
  boost: [1, 1.35, 1.7], // bigger catcher for players who chose help
  difficulty: {
    easy: { speed: 0.18, every: 1.6 },
    medium: { speed: 0.26, every: 1.2 },
    hard: { speed: 0.36, every: 0.9 },
  },
};

export class Engine {
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.difficulty = 'easy';
    this.paused = false;
    this.state = { phase: PHASE.OVER, catchers: {}, stars: [], caught: 0, missed: 0, winner: null };
  }

  setDifficulty(id) {
    if (SETTINGS.difficulty[id]) this.difficulty = id;
  }

  /** players: [{ seat, boost }] */
  startMatch(players) {
    this.state = { phase: PHASE.PLAYING, catchers: {}, stars: [], caught: 0, missed: 0, winner: null, spawnIn: 0.8 };
    for (const p of players) this.addPlayer(p.seat, p.boost);
  }

  addPlayer(seat, boost = 0) {
    const seats = [...Object.keys(this.state.catchers).map(Number), seat].sort((a, b) => a - b);
    const size = SETTINGS.catcherSize * (SETTINGS.boost[boost] || 1);
    this.state.catchers[seat] = { y: 0.5, size };
    // Spread the catchers across the left part of the screen, one column each.
    seats.forEach((s, i) => { this.state.catchers[s].x = 0.12 + i * 0.08; });
  }

  /** value 0 (top) .. 1 (bottom) from the swipe control */
  move(seat, value) {
    const c = this.state.catchers[seat];
    // Keep the whole catcher on screen.
    if (c) c.y = c.size / 2 + Math.min(1, Math.max(0, value)) * (1 - c.size);
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  /** Advance dt seconds. Returns events: { type: 'catch', seat } | { type: 'miss' } | { type: 'win', winner } */
  step(dt) {
    const s = this.state;
    const events = [];
    if (this.paused || s.phase !== PHASE.PLAYING) return events;
    const { speed, every } = SETTINGS.difficulty[this.difficulty];

    s.spawnIn -= dt;
    if (s.spawnIn <= 0) {
      s.spawnIn = every;
      s.stars.push({ x: 1.02, y: 0.1 + this.rng() * 0.8 });
    }

    for (const star of s.stars) {
      const before = star.x;
      star.x -= speed * dt;
      for (const [seat, c] of Object.entries(s.catchers)) {
        if (before >= c.x && star.x < c.x && Math.abs(star.y - c.y) < c.size / 2) {
          star.done = true;
          s.caught += 1;
          events.push({ type: 'catch', seat: Number(seat) });
          break;
        }
      }
      if (!star.done && star.x < -0.02) {
        star.done = true;
        s.missed += 1;
        events.push({ type: 'miss' });
      }
    }
    s.stars = s.stars.filter((st) => !st.done);

    if (s.caught >= SETTINGS.toWin || s.missed >= SETTINGS.toLose) {
      s.phase = PHASE.OVER;
      s.winner = s.caught >= SETTINGS.toWin ? 'team' : 'cpu';
      events.push({ type: 'win', winner: s.winner });
    }
    return events;
  }
}
