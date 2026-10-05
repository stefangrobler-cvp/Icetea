// Cyber Hunt's sounds, made on the fly with Web Audio (no sound files).
// Playing into `audio.output` means the platform's mute button works.

export function makeSounds(audio) {
  const ctx = audio?.context;
  const out = audio?.output;

  function beep(freq, duration, type = 'square', volume = 0.2, when = 0, slideTo = null) {
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

  return {
    tick: () => beep(660, 0.1, 'square', 0.18),
    round: () => [440, 660, 880].forEach((f, i) => beep(f, 0.12, 'triangle', 0.16, i * 0.08)),
    go: () => beep(990, 0.18, 'square', 0.2),
    pick: () => beep(520, 0.06, 'triangle', 0.14),
    found: () => [784, 988, 1319, 1568].forEach((f, i) => beep(f, 0.1, 'square', 0.14, i * 0.05)),
    wrong: () => { beep(140, 0.35, 'sawtooth', 0.18); beep(147, 0.35, 'sawtooth', 0.12); },
    miss: () => beep(300, 0.05, 'triangle', 0.08),
    alarm: () => { beep(880, 0.12, 'square', 0.12); beep(660, 0.12, 'square', 0.12, 0.15); },
    roundDone: () => [523, 784, 1047].forEach((f, i) => beep(f, 0.16, 'triangle', 0.16, i * 0.1)),
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.16, 'square', 0.16, i * 0.09)),
    lose: () => [392, 330, 262].forEach((f, i) => beep(f, 0.22, 'square', 0.15, i * 0.16)),
  };
}
