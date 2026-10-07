// Tiny synthesized sound effects (no audio files). Must be unlocked by a user gesture on iOS.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
export let muted = false;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function noiseBuffer(dur: number) {
  const c = ctx!;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, filterFreq: number, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

/** vol is 0..1, scaled by distance at the call site. */
export const sfx = {
  bang: (vol = 1) => {
    noise(0.5, 0.9 * vol, 1800);
    tone(90, 0.3, 'sine', 0.6 * vol, 40);
  },
  shotgun: (vol = 1) => {
    noise(0.35, 1 * vol, 2500);
    noise(0.25, 0.5 * vol, 900, 0.05);
  },
  twang: (vol = 1) => tone(320, 0.25, 'triangle', 0.3 * vol, 140),
  whoosh: () => noise(0.2, 0.15, 3000),
  hit: () => {
    tone(400, 0.15, 'square', 0.25, 120);
    tone(200, 0.3, 'sawtooth', 0.15, 60, 0.05);
  },
  chomp: () => {
    tone(600, 0.06, 'square', 0.15, 300);
    tone(500, 0.06, 'square', 0.15, 250, 0.08);
  },
  boing: () => tone(180, 0.35, 'sine', 0.35, 720),
  boop: () => {
    tone(880, 0.08, 'sine', 0.3);
    tone(1320, 0.12, 'sine', 0.25, undefined, 0.08);
  },
  alert: () => {
    tone(700, 0.08, 'square', 0.12);
    tone(1000, 0.12, 'square', 0.12, undefined, 0.09);
  },
  sniff: () => {
    noise(0.12, 0.2, 5000);
    noise(0.12, 0.2, 5000, 0.16);
    noise(0.2, 0.25, 5000, 0.32);
  },
  roar: () => {
    tone(110, 0.9, 'sawtooth', 0.4, 60);
    noise(0.9, 0.3, 600);
  },
  fart: () => {
    tone(90, 0.6, 'sawtooth', 0.3, 50);
    noise(0.6, 0.15, 400);
  },
  quack: () => {
    tone(520, 0.12, 'sawtooth', 0.2, 380);
    tone(520, 0.14, 'sawtooth', 0.2, 360, 0.18);
  },
  hum: (vol = 1) => tone(140, 0.2, 'sawtooth', 0.05 * vol, 160),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.25, undefined, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.15, undefined, i * 0.22)),
  click: () => tone(1200, 0.04, 'square', 0.08),
  rescue: () => [660, 880].forEach((f, i) => tone(f, 0.15, 'triangle', 0.2, undefined, i * 0.1)),
};
