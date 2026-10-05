// Makes the game's retro sounds on the fly with the Web Audio API (no sound files).
// `audio` comes from the platform: { context, output }. Playing into `output`
// means the platform's mute button works for this game too.

export function makeSounds(audio) {
  const ctx = audio?.context;
  const out = audio?.output;

  function beep(freq, duration, type = 'square', volume = 0.25, when = 0, slideTo = null) {
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

  function noise(duration, volume, when = 0, filterFreq = 1500) {
    if (!ctx || !out) return;
    const t = ctx.currentTime + when;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.15);
    // Wobble the volume a little so it sounds like a crowd rather than static.
    for (let i = 1; i < duration * 8; i++) {
      gain.gain.linearRampToValueAtTime(volume * (0.6 + Math.random() * 0.4), t + i / 8);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
  }

  const cheer = () => {
    noise(1.3, 0.35, 0.05, 1800);
    noise(1.1, 0.2, 0.1, 3200);
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.14, 'square', 0.15, i * 0.08));
  };

  const whistle = () => {
    beep(2200, 0.18, 'square', 0.08);
    beep(2400, 0.32, 'square', 0.08, 0.2);
  };

  return {
    kick(power = 0) {
      beep(150 + power * 60, 0.12, 'sine', 0.5, 0, 60);
      beep(900 + power * 400, 0.03, 'square', 0.1 + power * 0.08); // the "tock" of the boot
    },
    thud: () => beep(110, 0.1, 'sine', 0.4, 0, 70),
    post: () => { beep(1400, 0.35, 'triangle', 0.2, 0, 1300); beep(2100, 0.25, 'triangle', 0.1); },
    tick: () => beep(660, 0.1, 'square', 0.18),
    go: () => beep(990, 0.18, 'square', 0.2),
    whistle,
    cheer,
  };
}
