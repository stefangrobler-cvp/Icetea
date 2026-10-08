// Block Stacker's sounds, made on the fly with Web Audio (no sound files).
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

  function rumble(duration, volume, cutoff = 220, rise = 0) {
    if (!ctx || !out) return;
    const t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    // rise: seconds to swell in (a gust of wind), otherwise it starts loud (a thump).
    gain.gain.setValueAtTime(rise ? 0.0001 : volume, t);
    if (rise) gain.gain.exponentialRampToValueAtTime(volume, t + rise);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
  }

  return {
    tick: () => beep(660, 0.1, 'square', 0.18),
    go: () => beep(990, 0.18, 'square', 0.2),
    turn: () => beep(740, 0.07, 'triangle', 0.15),
    drop: () => beep(900, 0.22, 'triangle', 0.18, 0, 300),
    land: (power = 0.5) => { beep(120 + power * 80, 0.12, 'square', 0.18 + power * 0.12); rumble(0.12, 0.2 * power); },
    lost: () => beep(420, 0.35, 'triangle', 0.14, 0, 200), // a soft "boing", not a fail sound
    perfect: () => [784, 988, 1319].forEach((f, i) => beep(f, 0.12, 'square', 0.13, 0.05 + i * 0.07)),
    warn: () => { beep(880, 0.16, 'square', 0.2); beep(660, 0.16, 'square', 0.2, 0.22); beep(880, 0.16, 'square', 0.2, 0.44); },
    quake: () => { rumble(1.4, 0.5); beep(60, 1.1, 'sawtooth', 0.12); },
    wind: () => { rumble(1.6, 0.35, 900, 0.6); beep(300, 1.4, 'sine', 0.05, 0, 520); },
    turn90: () => beep(1200, 0.06, 'triangle', 0.12, 0, 1500),
    send: () => beep(400, 0.3, 'square', 0.14, 0, 1200),
    win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.16, 'square', 0.16, i * 0.09)),
    lose: () => [392, 330, 262].forEach((f, i) => beep(f, 0.22, 'square', 0.15, i * 0.16)),
  };
}
