// Hazard Storm's sounds, made on the fly with Web Audio (no sound files).
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

  function crackle(duration, volume, freq = 1200) {
    if (!ctx || !out) return;
    const t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
  }

  return {
    tick: () => beep(660, 0.1, 'square', 0.18),
    go: () => beep(990, 0.18, 'square', 0.2),
    warn: (kind) => beep(kind === 'beam' ? 520 : kind === 'ball' ? 700 : 880, 0.07, 'triangle', 0.1),
    beam: () => { beep(160, 0.6, 'sawtooth', 0.12, 0, 90); crackle(0.6, 0.12, 2400); },
    smash: () => crackle(0.15, 0.15, 900),
    boing: () => beep(220, 0.15, 'sine', 0.2, 0, 440),
    dash: () => beep(400, 0.18, 'triangle', 0.2, 0, 1400),
    bump: () => beep(180, 0.08, 'square', 0.22),
    hit: () => { beep(300, 0.3, 'sawtooth', 0.2, 0, 80); crackle(0.25, 0.2, 600); },
    battery: () => [660, 880, 1320].forEach((f, i) => beep(f, 0.08, 'square', 0.14, i * 0.06)),
    out: () => [392, 294, 196].forEach((f, i) => beep(f, 0.2, 'square', 0.15, i * 0.15)),
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.16, 'square', 0.16, i * 0.09)),
    lose: () => [392, 330, 262].forEach((f, i) => beep(f, 0.22, 'square', 0.15, i * 0.16)),
  };
}
