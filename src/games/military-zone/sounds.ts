// All sounds synthesized via Web Audio API — no audio files.
// AudioContext is created lazily on first call (satisfies browser autoplay policy).

let _ctx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === "suspended") void _ctx.resume();
  return _ctx;
}

// Fire / shoot: sine sweep 800→200 Hz
export function playFire(): void {
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.15);
    gain.gain.setValueAtTime(0.25, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.2);
  } catch { /* ignore */ }
}

// Hit explosion: white noise through lowpass 2000→200 Hz
export function playHit(): void {
  try {
    const c = ctx();
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.5), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2000, c.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.4);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.7, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start();
  } catch { /* ignore */ }
}

// Miss splash: sine 180→80 Hz, soft water impact
export function playMiss(): void {
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.3);
    gain.gain.setValueAtTime(0.12, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.35);
  } catch { /* ignore */ }
}

// Ship sunk: 3 staggered minor-chord oscillators with slight echo
export function playSunk(): void {
  try {
    const c = ctx();
    const notes = [220, 261.63, 329.63]; // A3, C4, E4
    const delay = c.createDelay(0.5);
    delay.delayTime.value = 0.25;
    const feedGain = c.createGain();
    feedGain.gain.value = 0.18;
    delay.connect(feedGain);
    feedGain.connect(delay);
    delay.connect(c.destination);
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = c.currentTime + i * 0.08;
      gain.gain.setValueAtTime(0.28, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.85);
      osc.connect(gain);
      gain.connect(c.destination);
      gain.connect(delay);
      osc.start(start);
      osc.stop(start + 0.85);
    });
  } catch { /* ignore */ }
}

// Victory fanfare: root → fifth → octave
export function playVictory(): void {
  try {
    const c = ctx();
    const notes = [261.63, 392, 523.25]; // C4, G4, C5
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc.detune.value = 6;
      const start = c.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0.28, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(start);
      osc.stop(start + 0.28);
    });
  } catch { /* ignore */ }
}

// Defeat: two descending oscillators through lowpass
export function playDefeat(): void {
  try {
    const c = ctx();
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    filter.connect(c.destination);
    [220, 164.81].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = c.currentTime + i * 0.45;
      gain.gain.setValueAtTime(0.22, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(start);
      osc.stop(start + 0.42);
    });
  } catch { /* ignore */ }
}

// SONAR hover ping: 1200 Hz very brief & subtle
export function playPing(): void {
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.04, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.05);
  } catch { /* ignore */ }
}

// Ship placed: short ascending click
export function playPlace(): void {
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(380, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(560, c.currentTime + 0.06);
    gain.gain.setValueAtTime(0.08, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.08);
  } catch { /* ignore */ }
}

// Ship removed from grid: short descending click
export function playUnplace(): void {
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(400, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(240, c.currentTime + 0.07);
    gain.gain.setValueAtTime(0.07, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.09);
  } catch { /* ignore */ }
}
