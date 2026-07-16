// WebAudio synthesis — no audio files. Same lazy-singleton pattern as
// word-snake/sounds.ts so the game stays a single tab with zero assets.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx() as AudioContext;
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

/** Celebratory ascending arpeggio when someone guesses correctly. */
export function playCorrect() {
  tone(523, "sine", 0.16, 0.20, 0);     // C5
  tone(659, "sine", 0.16, 0.18, 0.09);  // E5
  tone(784, "sine", 0.30, 0.20, 0.18);  // G5
}

/** Countdown tick for the final seconds — alternating pitch. */
export function playTick(timeLeft: number) {
  const isOdd = timeLeft % 2 === 1;
  tone(isOdd ? 900 : 680, "square", 0.06, 0.13);
}

/** Bright two-note cue when it becomes YOUR turn to draw. */
export function playYourTurn() {
  tone(587, "triangle", 0.16, 0.20, 0);    // D5
  tone(880, "triangle", 0.26, 0.18, 0.12); // A5
}

/** Soft descending chime at round end. */
export function playRoundEnd() {
  tone(659, "sine", 0.18, 0.16, 0);     // E5
  tone(494, "sine", 0.28, 0.14, 0.12);  // B4
}

/** Subtle click when picking a word / tool. */
export function playPick() {
  tone(440, "triangle", 0.05, 0.10);
}

/** Rising fanfare when the game finishes. */
export function playFanfare() {
  tone(523, "triangle", 0.18, 0.18, 0);    // C5
  tone(659, "triangle", 0.18, 0.18, 0.12); // E5
  tone(784, "triangle", 0.18, 0.18, 0.24); // G5
  tone(1047, "triangle", 0.4, 0.20, 0.36); // C6
}
