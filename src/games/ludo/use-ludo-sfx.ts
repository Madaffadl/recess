"use client";

import { useEffect, useRef } from "react";
import type { LudoSessionRow } from "./logic";

// ── Singleton AudioContext ─────────────────────────────────────────────────────

let _ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    _ctx = new Ctor();
  }
  if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

// ── Primitive synth helpers ────────────────────────────────────────────────────

function tone(
  c: AudioContext,
  freq: number,
  type: OscillatorType,
  startOffset: number,
  dur: number,
  peak: number,
): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  const t = c.currentTime + startOffset;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function sweep(
  c: AudioContext,
  freqA: number,
  freqB: number,
  type: OscillatorType,
  startOffset: number,
  dur: number,
  peak: number,
): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  const t = c.currentTime + startOffset;
  osc.type = type;
  osc.frequency.setValueAtTime(freqA, t);
  osc.frequency.exponentialRampToValueAtTime(freqB, t + dur);
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// ── Named sounds ──────────────────────────────────────────────────────────────

function sfxMove(): void {
  const c = ac();
  if (!c) return;
  // Woody knock: short square burst + low sine thud
  tone(c, 380, "square", 0,     0.07, 0.18);
  tone(c, 240, "sine",   0.008, 0.10, 0.13);
}

function sfxRoll(): void {
  const c = ac();
  if (!c) return;
  // Rapid pitch flickers → tumbling dice feel
  [0, 0.028, 0.056, 0.084, 0.112].forEach((offset, i) =>
    tone(c, 290 + (i % 3) * 75, "square", offset, 0.038, 0.08),
  );
}

function sfxCapture(): void {
  const c = ac();
  if (!c) return;
  // Downward sawtooth sweep → dramatic "sent home"
  sweep(c, 490, 85, "sawtooth", 0,    0.26, 0.25);
  tone(c, 110, "sine",          0.02, 0.22, 0.14);
}

function sfxHome(): void {
  const c = ac();
  if (!c) return;
  // Ascending two-tone reward ping (E5 → A5)
  tone(c, 659, "sine", 0,    0.28, 0.22);
  tone(c, 880, "sine", 0.14, 0.32, 0.20);
}

function sfxWin(): void {
  const c = ac();
  if (!c) return;
  // Rising 4-note arpeggio (C5-E5-G5-C6)
  [523, 659, 784, 1047].forEach((f, i) =>
    tone(c, f, "sine", i * 0.11, 0.38, 0.22),
  );
}

function sfxYourTurn(): void {
  const c = ac();
  if (!c) return;
  // Gentle ascending two-tone ping (C5 → E5)
  tone(c, 523, "sine", 0,    0.22, 0.18);
  tone(c, 659, "sine", 0.13, 0.28, 0.16);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useLudoSfx({
  session,
  myTurn,
  dice,
}: {
  session: LudoSessionRow | null;
  myTurn: boolean;
  dice: number | null;
}): void {
  // Sentinels: null / undefined = "not yet seen a real value — skip first render"
  const prevMoveCount = useRef<number | null>(null);
  const prevDice      = useRef<number | null | undefined>(undefined);
  const prevNeedRoll  = useRef<boolean | undefined>(undefined);

  // Pre-warm AudioContext on mount so it's ready when sounds are first needed.
  useEffect(() => { ac(); }, []);

  // ── Pawn move / capture / home / win ──────────────────────────────────────
  useEffect(() => {
    const moveCount = session?.state?.moveCount;
    const lastEvent = session?.state?.lastEvent;
    if (moveCount == null) return;

    if (prevMoveCount.current === null) {
      // First load — seed without playing.
      prevMoveCount.current = moveCount;
      return;
    }
    if (moveCount > prevMoveCount.current) {
      if      (lastEvent === "win")      sfxWin();
      else if (lastEvent === "home")     sfxHome();
      else if (lastEvent === "captured") sfxCapture();
      else                               sfxMove();
    }
    prevMoveCount.current = moveCount;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.state?.moveCount, session?.state?.lastEvent]);

  // ── Die rolled (null → number transition) ─────────────────────────────────
  useEffect(() => {
    if (prevDice.current === undefined) {
      prevDice.current = dice;
      return;
    }
    if (prevDice.current === null && dice !== null) sfxRoll();
    prevDice.current = dice;
  }, [dice]);

  // ── Your turn chime (needRoll false → true edge) ──────────────────────────
  const needRoll = myTurn && dice === null;
  useEffect(() => {
    if (prevNeedRoll.current === undefined) {
      prevNeedRoll.current = needRoll;
      return;
    }
    if (needRoll && !prevNeedRoll.current) sfxYourTurn();
    prevNeedRoll.current = needRoll;
  }, [needRoll]);
}
