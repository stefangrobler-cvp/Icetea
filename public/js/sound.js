// Retro sounds made on the fly with the Web Audio API (no sound files needed).
// Browsers only allow sound after a tap, so call unlock() from a tap handler.

let ctx = null;
let master = null;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  // iOS needs a sound to actually play inside the tap to fully unlock.
  beep(1, 0.01, 'sine', 0.0001);
}

function beep(freq, duration, type = 'square', volume = 0.25, when = 0, slideTo = null) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function noise(duration, volume, when = 0, filterFreq = 1500) {
  if (!ctx) return;
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
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

export const sounds = {
  // Harder swipes give a higher, brighter hit.
  paddle: (power = 0) => beep(500 + power * 260, 0.08, 'square', 0.22 + power * 0.08),
  wall: () => beep(260, 0.06),
  point: () => beep(330, 0.35, 'square', 0.25, 0, 110),
  tick: () => beep(660, 0.1, 'square', 0.18),
  go: () => beep(990, 0.18, 'square', 0.2),
  // Soccer
  kick(power = 0) {
    beep(150 + power * 60, 0.12, 'sine', 0.5, 0, 60);
    beep(900 + power * 400, 0.03, 'square', 0.1 + power * 0.08); // the "tock" of the boot
  },
  thud: () => beep(110, 0.1, 'sine', 0.4, 0, 70),
  post: () => { beep(1400, 0.35, 'triangle', 0.2, 0, 1300); beep(2100, 0.25, 'triangle', 0.1); },
  whistle() {
    beep(2200, 0.18, 'square', 0.08);
    beep(2400, 0.32, 'square', 0.08, 0.2);
  },
  cheer() {
    noise(1.3, 0.35, 0.05, 1800);
    noise(1.1, 0.2, 0.1, 3200);
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.14, 'square', 0.15, i * 0.08));
  },
  win() {
    noise(2.5, 0.35, 0, 2000);
    const tune = [523, 659, 784, 1047, 784, 1047];
    tune.forEach((f, i) => beep(f, i === tune.length - 1 ? 0.6 : 0.18, 'square', 0.2, i * 0.18));
  },
};
