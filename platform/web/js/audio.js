// The platform's sound: one Web Audio context shared with the games (through
// host.audio), a mute switch that covers every game, and the results fanfare.
// Browsers only allow sound after a tap, so unlock() is called from a tap.

let ctx = null;
let master = null;
let muted = false;
try { muted = localStorage.getItem('fgp.muted') === '1'; } catch { /* private mode */ }

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  // iOS needs a sound to actually play inside the tap to fully unlock.
  beep(1, 0.01, 'sine', 0.0001);
}

/** What a game gets as host.audio. */
export function gameAudio() {
  return ctx ? { context: ctx, output: master } : null;
}

export const isMuted = () => muted;

export function setMuted(on) {
  muted = on;
  try { localStorage.setItem('fgp.muted', on ? '1' : '0'); } catch { /* private mode */ }
  if (master) master.gain.value = on ? 0 : 0.5;
}

function beep(freq, duration, type = 'square', volume = 0.25, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Fanfare for the results screen. */
export function fanfare() {
  const tune = [523, 659, 784, 1047, 784, 1047];
  tune.forEach((f, i) => beep(f, i === tune.length - 1 ? 0.6 : 0.18, 'square', 0.2, i * 0.18));
}
