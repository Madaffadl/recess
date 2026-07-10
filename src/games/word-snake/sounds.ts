let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx() as AudioContext;
    // Resume if suspended by browser autoplay policy
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  type: OscillatorType,
  durationSec: number,
  peakGain: number,
  delayFromNow = 0,
) {
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime + delayFromNow;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peakGain, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);

  osc.start(t);
  osc.stop(t + durationSec + 0.02);
}

/**
 * Alternating tick / tock for the last 3 seconds of a turn.
 * Pass the current timeLeft value; odd = higher "tick", even = lower "tock".
 */
export function playTick(timeLeft: number) {
  const isOdd = timeLeft % 2 === 1;
  tone(isOdd ? 900 : 680, "square", 0.07, 0.16);
}

/** Two-note ascending chime when a word is accepted. */
export function playAccept() {
  tone(523, "sine", 0.18, 0.22, 0);     // C5
  tone(784, "sine", 0.22, 0.18, 0.13);  // G5
}

/** Short descending buzz when a word is rejected. */
export function playReject() {
  tone(220, "sawtooth", 0.13, 0.26, 0);
  tone(165, "sawtooth", 0.13, 0.20, 0.09);
}
