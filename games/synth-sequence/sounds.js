// Synth Sequence's sounds: 80s synth notes made on the fly with Web Audio.
// Playing into `audio.output` means the platform's mute button works.

import { PADS } from './config.js';

export function makeSounds(audio) {
  const ctx = audio?.context;
  const out = audio?.output;

  // A warm synth voice: two slightly detuned saw waves through a closing filter.
  function synth(freq, duration, volume = 0.16, when = 0) {
    if (!ctx || !out) return;
    const t = ctx.currentTime + when;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(8000, freq * 8), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.5), t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
    gain.gain.setValueAtTime(volume, t + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    filter.connect(gain).connect(out);
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.detune.setValueAtTime(detune, t);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    }
  }

  function beep(freq, duration, type = 'square', volume = 0.18, when = 0) {
    if (!ctx || !out) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    pad: (i, duration = 0.4) => {
      const notes = PADS[i]?.notes || [];
      for (const f of notes) synth(f, duration, notes.length > 1 ? 0.1 : 0.16);
    },
    tick: () => beep(660, 0.1, 'square', 0.16),
    listen: () => beep(440, 0.12, 'triangle', 0.14),
    yourTurn: () => { beep(660, 0.08, 'triangle', 0.14); beep(990, 0.12, 'triangle', 0.14, 0.09); },
    oops: () => { beep(150, 0.4, 'sawtooth', 0.16); beep(155, 0.4, 'sawtooth', 0.12); },
    good: () => [523, 659, 784, 1047].forEach((f, i) => synth(f, 0.18, 0.1, i * 0.08)),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => synth(f, 0.3, 0.12, i * 0.1)),
    lose: () => [392, 330, 262].forEach((f, i) => synth(f, 0.35, 0.12, i * 0.18)),
  };
}
