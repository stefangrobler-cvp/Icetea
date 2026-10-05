// __NAME__'s sounds, made on the fly with Web Audio (no sound files).
// Playing into `audio.output` means the platform's mute button works.

export function makeSounds(audio) {
  const ctx = audio?.context;
  const out = audio?.output;

  function beep(freq, duration, type = 'square', volume = 0.2, slideTo = null) {
    if (!ctx || !out) return;
    const t = ctx.currentTime;
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
    catch: () => beep(880, 0.1, 'square', 0.2, 1320),
    miss: () => beep(300, 0.3, 'square', 0.2, 120),
  };
}
