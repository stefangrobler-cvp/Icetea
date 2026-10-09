// Glow Tube's sounds, made on the fly with Web Audio (no sound files).
// Playing into `audio.output` means the platform's mute button works.

export function makeSounds(audio) {
  const ctx = audio?.context;
  const out = audio?.output;

  function beep(freq, duration, type = 'square', volume = 0.2, slideTo = null, when = 0) {
    if (!ctx || !out) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // A crystal chime that climbs a little with every catch in a row.
  let streak = 0;
  let lastCatch = 0;
  const notes = [784, 880, 988, 1047, 1175, 1319];

  return {
    tick: () => beep(660, 0.1, 'square', 0.18),
    go: () => beep(990, 0.25, 'square', 0.2, 1320),
    catch: () => {
      const now = ctx?.currentTime ?? 0;
      streak = now - lastCatch < 1.2 ? Math.min(streak + 1, notes.length - 1) : 0;
      lastCatch = now;
      beep(notes[streak], 0.09, 'triangle', 0.16, notes[streak] * 1.5);
    },
    tumble: () => beep(380, 0.4, 'triangle', 0.16, 140), // a soft wobble, not a fail sound
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.16, 'square', 0.16, null, i * 0.09)),
    lose: () => [392, 330, 262].forEach((f, i) => beep(f, 0.22, 'square', 0.14, null, i * 0.16)),
  };
}
