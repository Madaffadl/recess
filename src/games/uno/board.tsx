"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Swords } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { closeRoom, leaveRoom } from "@/lib/api/rooms";
import { useGameSession } from "../use-game-session";
import { GameReadyPanel } from "../game-ready-panel";
import type { GameBoardProps } from "../types";
import { UNO_ID, canPlayCard, parseCard, type CardColor, type UnoGame } from "./logic";

const COLOR_DOT: Record<string, string> = {
  red: "bg-red-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  yellow: "bg-yellow-400",
};

const COLOR_LABEL: Record<string, string> = {
  red: "Red",
  green: "Green",
  blue: "Blue",
  yellow: "Yellow",
};

const CARD_BG: Record<string, string> = {
  red: "bg-red-500/15    border-red-500/40    text-red-300",
  green: "bg-green-600/15  border-green-500/40  text-green-300",
  blue: "bg-blue-500/15   border-blue-500/40   text-blue-300",
  yellow: "bg-yellow-400/15 border-yellow-400/40 text-yellow-300",
};

const COLOR_GLOW: Record<string, string> = {
  red: "shadow-[0_0_28px_rgba(239,68,68,0.70),0_6px_18px_rgba(0,0,0,0.50)]",
  green: "shadow-[0_0_28px_rgba(34,197,94,0.60),0_6px_18px_rgba(0,0,0,0.50)]",
  blue: "shadow-[0_0_28px_rgba(59,130,246,0.70),0_6px_18px_rgba(0,0,0,0.50)]",
  yellow: "shadow-[0_0_28px_rgba(250,204,21,0.65),0_6px_18px_rgba(0,0,0,0.50)]",
};

const CARD_HEX: Record<string, string> = {
  red: "#d5342b",
  green: "#2ea24a",
  blue: "#1f6fd6",
  yellow: "#e9b21a",
};

const SEAT_COLOR_CLASSES: { avatar: string; ring: string; dot: string }[] = [
  {
    avatar: "bg-amber-500/20  border-amber-500/50  text-amber-200",
    ring: "ring-amber-400/70",
    dot: "bg-amber-400",
  },
  {
    avatar: "bg-red-500/20    border-red-500/40    text-red-300",
    ring: "ring-red-400/70",
    dot: "bg-red-400",
  },
  {
    avatar: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300",
    ring: "ring-emerald-400/70",
    dot: "bg-emerald-400",
  },
  {
    avatar: "bg-rose-500/20   border-rose-500/40   text-rose-300",
    ring: "ring-rose-400/70",
    dot: "bg-rose-400",
  },
  {
    avatar: "bg-violet-500/20 border-violet-500/40 text-violet-300",
    ring: "ring-violet-400/70",
    dot: "bg-violet-400",
  },
  {
    avatar: "bg-cyan-500/20   border-cyan-500/40   text-cyan-300",
    ring: "ring-cyan-400/70",
    dot: "bg-cyan-400",
  },
];

const SEAT_AVATAR_GRADIENTS: string[] = [
  "linear-gradient(160deg,#c98a10,#f0a01a)",
  "linear-gradient(160deg,#8f3f3f,#c75c5c)",
  "linear-gradient(160deg,#2b6c4a,#3f9e6a)",
  "linear-gradient(160deg,#4b3f8f,#7a5cc7)",
  "linear-gradient(160deg,#2b6cc9,#173f7a)",
  "linear-gradient(160deg,#3f6b8f,#5c9cc7)",
];

type ConfettiShard = {
  left: string;
  width: string;
  height: string;
  bg: string;
  radius: string;
  dx: string;
  rot: string;
  duration: string;
  delay: string;
};
type Sparkle = {
  left: string;
  top: string;
  size: string;
  duration: string;
  delay: string;
};

function playCardSound(type: "play" | "draw") {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Both sounds are card friction (gesekan kertas) — differ only in duration & envelope shape
    const dur = type === "play" ? 0.13 : 0.22;
    const sampleCount = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buf.getChannelData(0);

    for (let i = 0; i < sampleCount; i++) {
      const t = i / sampleCount;
      // Envelope: quick attack, smooth decay — mimics card sliding past another card
      const env = type === "play"
        ? Math.pow(Math.sin(t * Math.PI), 1.5)          // symmetric bell, slightly weighted front
        : t < 0.15 ? t / 0.15 : Math.pow(1 - (t - 0.15) / 0.85, 1.8); // fast attack, long tail
      data[i] = (Math.random() * 2 - 1) * env;
    }

    // Layer 1 — mid friction body (paper-on-paper character)
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = type === "play" ? 1800 : 1200;
    f1.Q.value = 0.5;

    // Layer 2 — high scrape shimmer
    const f2 = ctx.createBiquadFilter();
    f2.type = "highshelf";
    f2.frequency.value = 4000;
    f2.gain.value = 6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(type === "play" ? 0.7 : 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(f1);
    f1.connect(f2);
    f2.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.onended = () => ctx.close();
  } catch {
    // AudioContext not supported
  }
}

function getCardDisplay(card: string): { corner: string; center: string } {
  if (card === "W") return { corner: "W", center: "W" };
  if (card === "WD4") return { corner: "+4", center: "+4" };
  const suffix = card.slice(1);
  if (suffix === "S") return { corner: "⊘", center: "⊘" };
  if (suffix === "R") return { corner: "↺", center: "↺" };
  if (suffix === "D2") return { corner: "+2", center: "+2" };
  const n = parseInt(suffix, 10);
  const s = isNaN(n) ? card : String(n);
  return { corner: s, center: s };
}

function PlayerSlot({
  seat,
  handle,
  cardCount,
  isTurn,
  unoDeclared,
  isMe,
}: {
  seat: number;
  handle: string;
  cardCount: number;
  isTurn: boolean;
  unoDeclared: boolean;
  isMe: boolean;
}) {
  const initials = handle.slice(0, 2).toUpperCase();
  const gradient = SEAT_AVATAR_GRADIENTS[(seat - 1) % SEAT_AVATAR_GRADIENTS.length]!;
  const avatarSize = isMe ? 70 : 60;
  const avatarRadius = isMe ? 14 : 13;
  const nametagBg = isMe
    ? "linear-gradient(90deg,#e9b21a,#c98a10)"
    : "linear-gradient(90deg,#2e78d6,#1c5bb0)";
  const nametagColor = isMe ? "#3a2600" : "#fff";
  const avatarShadow = isTurn
    ? "0 0 0 3px #ffd23f, 0 0 24px rgba(255,210,63,.85), inset 0 0 0 2px rgba(255,255,255,.25)"
    : "0 4px 10px rgba(0,0,0,.45), inset 0 0 0 2px rgba(255,255,255,.25)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <div
        style={{
          background: nametagBg,
          color: nametagColor,
          padding: "2px 12px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 800,
          boxShadow: "0 2px 6px rgba(0,0,0,.45)",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {handle}
        {unoDeclared && (
          <span
            style={{
              background: "rgba(0,0,0,0.28)",
              color: "#ffd23f",
              borderRadius: 4,
              padding: "0 4px",
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.04em",
            }}
          >
            UNO
          </span>
        )}
      </div>
      <div
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: avatarRadius,
          background: gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(avatarSize * 0.35),
          fontWeight: 900,
          color: "#fff",
          letterSpacing: "0.04em",
          boxShadow: avatarShadow,
          transform: isTurn ? "scale(1.06)" : "scale(1)",
          transition: "box-shadow .3s, transform .3s",
        }}
      >
        {initials}
      </div>
      <div
        style={{
          background: "#fff",
          color: "#000",
          fontWeight: 900,
          minWidth: isMe ? 26 : 24,
          height: isMe ? 28 : 26,
          padding: "0 8px",
          borderRadius: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 5px rgba(0,0,0,.4)",
          fontSize: 13,
        }}
      >
        {cardCount}
      </div>
    </div>
  );
}

export function UnoBoard({ roomKey, handle, participants, isHost, onCloseRoom }: GameBoardProps) {
  const router = useRouter();
  const {
    session,
    myRole,
    ready,
    busy,
    error,
    join,
    move,
    drawCard,
    declareUno,
    setReady,
    startGame,
    rematch,
  } = useGameSession<UnoGame>({ roomKey, gameId: UNO_ID, handle });

  const [drawing, setDrawing] = useState(false);
  const [noPlayableOpen, setNoPlayableOpen] = useState(false);
  const [forcedDrawOpen, setForcedDrawOpen] = useState(false);
  const [pendingWild, setPendingWild] = useState<string | null>(null);
  const [victoryOpen, setVictoryOpen] = useState(false);
  const [showUnoPop, setShowUnoPop] = useState(false);
  const prevUnoDeclaredRef = useRef<1 | 2 | null>(null);
  const [shards, setShards] = useState<ConfettiShard[]>([]);
  const [sparks, setSparks] = useState<Sparkle[]>([]);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const [isDealing, setIsDealing] = useState(false);
  const [dealtCount, setDealtCount] = useState(0);
  const prevStatusRef2 = useRef<string | null>(null);

  useEffect(() => {
    const palette = ["#ffd23f", "#e8532a", "#d5342b", "#f0a01a", "#ffe6b0", "#c22018", "#ff8a3d"];
    const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]!;
    setShards(
      Array.from({ length: 60 }, () => {
        const isRound = Math.random() > 0.7;
        const isStreamer = !isRound && Math.random() > 0.5;
        const w = 4 + Math.random() * 10;
        const h = isStreamer ? w * (3 + Math.random() * 3) : w * (1.2 + Math.random());
        const dur = 6 + Math.random() * 9;
        return {
          left: `${Math.random() * 100}%`,
          width: `${w}px`,
          height: `${h}px`,
          bg: pick(palette),
          radius: isRound ? "50%" : isStreamer ? "6px" : "2px",
          dx: `${Math.random() * 220 - 110}px`,
          rot: `${Math.random() * 1080 - 540}deg`,
          duration: `${dur}s`,
          delay: `${-Math.random() * dur}s`,
        };
      }),
    );
    setSparks(
      Array.from({ length: 35 }, () => {
        const sz = 6 + Math.random() * 14;
        const dur = 1.4 + Math.random() * 2.6;
        return {
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          size: `${sz}px`,
          duration: `${dur}s`,
          delay: `${-Math.random() * dur}s`,
        };
      }),
    );
  }, []);

  const handleDraw = useCallback(async () => {
    playCardSound("draw");
    setDrawing(true);
    await drawCard();
    setNoPlayableOpen(false);
    setForcedDrawOpen(false);
    setDrawing(false);
  }, [drawCard]);

  const handleWildColor = useCallback(
    (color: CardColor) => {
      if (!pendingWild) return;
      const card = pendingWild;
      setPendingWild(null);
      move({ type: "play_card", card, chosenColor: color });
    },
    [pendingWild, move],
  );

  const handleCardClick = useCallback(
    (card: string) => {
      playCardSound("play");
      const p = parseCard(card);
      if (p?.type === "wild" || p?.type === "wild_draw_four") {
        setPendingWild(card);
      } else {
        move({ type: "play_card", card });
      }
    },
    [move],
  );

  const handleBackToRooms = useCallback(async () => {
    if (isHost) {
      onCloseRoom?.();
      await closeRoom(roomKey);
    } else {
      await leaveRoom(roomKey);
    }
    router.push("/rooms");
  }, [isHost, roomKey, router, onCloseRoom]);

  const didJoinRef = useRef(false);
  useEffect(() => {
    if (!ready || didJoinRef.current) return;
    didJoinRef.current = true;
    void join();
  }, [ready, join]);

  const state = session?.state;
  const game = state?.game ?? null;
  const status = session?.status;
  const seatKey = myRole !== null ? (String(myRole) as "1" | "2") : null;
  const isMyTurn = !!state && state.turn === myRole;
  const pendingDrawCount = game?.pendingDraw ?? 0;

  useEffect(() => {
    if (status === "finished" || !isMyTurn || !game) {
      setForcedDrawOpen(false);
      setPendingWild(null);
      return;
    }
    setForcedDrawOpen(game.pendingDraw > 0);
  }, [status, isMyTurn, game]);

  useEffect(() => {
    if (
      status === "finished" ||
      !isMyTurn ||
      !game ||
      game.drawnThisTurn ||
      game.pendingDraw > 0
    ) {
      setNoPlayableOpen(false);
      return;
    }
    const hand = seatKey ? (game.hands[seatKey] ?? []) : [];
    const hasPlayable = hand.some((c) =>
      canPlayCard(c, game.currentColor, game.currentType, game.currentValue),
    );
    if (!hasPlayable) setNoPlayableOpen(true);
  }, [status, isMyTurn, game, seatKey]);

  useEffect(() => {
    if (status === "finished") setVictoryOpen(true);
  }, [status]);

  useEffect(() => {
    if (prevStatusRef2.current === "waiting" && status === "active") {
      setIsDealing(true);
      setDealtCount(0);
      const t = setTimeout(() => setIsDealing(false), 14 * 130 + 500);
      prevStatusRef2.current = status ?? null;
      return () => clearTimeout(t);
    }
    prevStatusRef2.current = status ?? null;
  }, [status]);

  useEffect(() => {
    if (!isDealing) { setDealtCount(0); return; }
    let count = 0;
    const delay = setTimeout(() => {
      const iv = setInterval(() => {
        count += 1;
        setDealtCount(count);
        if (count >= 7) clearInterval(iv);
      }, 260);
      return () => clearInterval(iv);
    }, 350);
    return () => clearTimeout(delay);
  }, [isDealing]);

  useEffect(() => {
    if (status === "active") {
      if (!bgMusicRef.current) {
        bgMusicRef.current = new Audio("/assets/uno/uno-gameplay.mp3");
        bgMusicRef.current.loop = true;
        bgMusicRef.current.volume = 0.5;
      }
      bgMusicRef.current.play().catch(() => {});
    } else {
      bgMusicRef.current?.pause();
      if (bgMusicRef.current) bgMusicRef.current.currentTime = 0;
    }
    return () => {
      bgMusicRef.current?.pause();
    };
  }, [status]);

  useEffect(() => {
    const cur = game?.unoDeclared ?? null;
    if (cur !== null && cur !== prevUnoDeclaredRef.current) {
      setShowUnoPop(true);
      const t = setTimeout(() => setShowUnoPop(false), 1500);
      prevUnoDeclaredRef.current = cur;
      return () => clearTimeout(t);
    }
    if (cur === null) prevUnoDeclaredRef.current = null;
  }, [game?.unoDeclared]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-amber-900/30 bg-[#120a04] p-10">
        <Loader2 className="size-6 animate-spin text-amber-600" />
      </div>
    );
  }

  const topCard = game?.discardPile[0] ?? null;
  const topParsed = topCard ? parseCard(topCard) : null;
  const currentColor = game?.currentColor ?? null;
  const oppKey = (myRole === 1 ? "2" : "1") as "1" | "2";
  const oppCount = game?.hands[oppKey]?.length ?? 0;
  const myHand = seatKey && game ? (game.hands[seatKey] ?? []) : [];
  const turnSeat = state ? (String(state.turn) as "1" | "2") : null;
  const turnHandle = turnSeat ? state?.players[turnSeat]?.handle : null;

  const iWon =
    status === "finished" && state !== undefined && state.winner === myRole;
  const winnerSeat: "1" | "2" | null =
    status === "finished" &&
    state !== undefined &&
    state.winner != null &&
    state.winner !== 0
      ? (String(state.winner) as "1" | "2")
      : null;
  const winnerName =
    winnerSeat !== null
      ? (state?.players[winnerSeat]?.handle ?? "Opponent")
      : null;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden rounded-2xl border border-amber-900/40 bg-[#120a04] shadow-2xl shadow-black/60">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-amber-800/30 bg-gradient-to-r from-[#1c0e06] to-[#251408] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="text-base leading-none">🎴</span>
          <h2 className="font-display text-base font-bold tracking-tight text-amber-100">
            UNO
          </h2>
          <span className="rounded border border-amber-800/40 bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600/80">
            Saloon
          </span>
        </div>

        {currentColor && (
          <div className="flex items-center gap-2 rounded-full border border-amber-700/40 bg-amber-950/60 px-3 py-1.5">
            <span
              className={cn(
                "size-2.5 animate-pulse rounded-full transition-colors duration-500",
                COLOR_DOT[currentColor] ?? "bg-amber-700",
              )}
            />
            <span className="text-[11px] font-semibold text-amber-200/80">
              {COLOR_LABEL[currentColor] ?? currentColor}
            </span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 flex-col overflow-hidden min-h-0 lg:flex-row">
        <div className="flex flex-1 flex-col gap-2 px-5 pt-4 pb-0 min-h-0">
          {/* No session */}
          {!session && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <p className="text-sm text-amber-700/70">No active game session.</p>
              <Button onClick={join} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Swords />}
                Start UNO
              </Button>
            </div>
          )}

          {/* Finished */}
          {session && status === "finished" && state && (
            <div className="py-8 text-center">
              {state.winner === myRole ? (
                <p className="font-display text-lg font-semibold text-amber-200">
                  You win! 🎉
                </p>
              ) : (
                <p className="font-display text-lg font-semibold">
                  <span className="text-amber-200">
                    {state.players[String(state.winner) as "1" | "2"]?.handle ??
                      "Opponent"}
                  </span>{" "}
                  wins
                </p>
              )}
            </div>
          )}

          {/* Waiting — generic Ready lobby */}
          {session && status === "waiting" && (
            <GameReadyPanel
              players={session.state.players}
              ready={session.state.ready}
              myRole={myRole}
              busy={busy}
              onReady={(v) => setReady(v)}
              onJoin={join}
              onStart={startGame}
              gameLabel="UNO"
              participants={participants}
              myHandle={handle}
              isHost={isHost}
            />
          )}

          {/* Active play — 3D perspective table */}
          {session && status === "active" && (
            <>
              <div className="relative min-h-0 flex-1 rounded-xl overflow-hidden">
                {/* Flat FX layer — owns overflow:hidden so 3D scene is unaffected */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
                  {/* Layer 1: conic sunburst base */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "conic-gradient(from 0deg at 50% 42%, #b81c14 0 12deg, #d13020 12deg 24deg, #b81c14 24deg 36deg, #d13020 36deg 48deg, #b81c14 48deg 60deg, #d13020 60deg 72deg, #b81c14 72deg 84deg, #d13020 84deg 96deg, #b81c14 96deg 108deg, #d13020 108deg 120deg, #b81c14 120deg 132deg, #d13020 132deg 144deg, #b81c14 144deg 156deg, #d13020 156deg 168deg, #b81c14 168deg 180deg, #d13020 180deg 192deg, #b81c14 192deg 204deg, #d13020 204deg 216deg, #b81c14 216deg 228deg, #d13020 228deg 240deg, #b81c14 240deg 252deg, #d13020 252deg 264deg, #b81c14 264deg 276deg, #d13020 276deg 288deg, #b81c14 288deg 300deg, #d13020 300deg 312deg, #b81c14 312deg 324deg, #d13020 324deg 336deg, #b81c14 336deg 348deg, #d13020 348deg 360deg)",
                    }}
                  />
                  {/* Layer 2: radial soft-light overlay */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "radial-gradient(circle at 50% 42%, rgba(255,190,120,.95) 0%, rgba(232,90,40,.9) 22%, rgba(176,28,20,.96) 52%, #5c0d08 100%)",
                      mixBlendMode: "soft-light",
                    }}
                  />
                  {/* Layer 3: spinning golden spokes */}
                  <div
                    style={{
                      position: "absolute",
                      top: "42%",
                      left: "50%",
                      width: "180vmax",
                      height: "180vmax",
                      transform: "translate(-50%,-50%)",
                      opacity: 0.12,
                      background:
                        "conic-gradient(from 0deg, transparent 0 8deg, rgba(255,240,210,.9) 9deg, transparent 10deg 26deg, rgba(255,240,210,.7) 27deg, transparent 28deg 44deg, rgba(255,240,210,.9) 45deg, transparent 46deg 62deg, rgba(255,240,210,.7) 63deg, transparent 64deg 80deg, rgba(255,240,210,.9) 81deg, transparent 82deg 98deg, rgba(255,240,210,.7) 99deg, transparent 100deg 116deg, rgba(255,240,210,.9) 117deg, transparent 118deg 134deg, rgba(255,240,210,.7) 135deg, transparent 136deg 152deg, rgba(255,240,210,.9) 153deg, transparent 154deg 170deg, rgba(255,240,210,.7) 171deg, transparent 172deg 188deg, rgba(255,240,210,.9) 189deg, transparent 190deg 206deg, rgba(255,240,210,.7) 207deg, transparent 208deg 224deg, rgba(255,240,210,.9) 225deg, transparent 226deg 242deg, rgba(255,240,210,.7) 243deg, transparent 244deg 260deg, rgba(255,240,210,.9) 261deg, transparent 262deg 278deg, rgba(255,240,210,.7) 279deg, transparent 280deg 296deg, rgba(255,240,210,.9) 297deg, transparent 298deg 314deg, rgba(255,240,210,.7) 315deg, transparent 316deg 332deg, rgba(255,240,210,.9) 333deg, transparent 334deg 350deg, rgba(255,240,210,.7) 351deg, transparent 352deg)",
                      animation: "uno-spin 60s linear infinite",
                    }}
                  />
                  {/* Layer 4: breathing glow */}
                  <div
                    style={{
                      position: "absolute",
                      inset: "-25%",
                      background:
                        "radial-gradient(circle at 50% 42%, rgba(255,225,160,.4), rgba(255,150,80,.12) 45%, transparent 62%)",
                      animation: "uno-breathe 5.5s ease-in-out infinite",
                    }}
                  />
                  {/* Layer 5: screen-blend hue glow */}
                  <div
                    style={{
                      position: "absolute",
                      inset: "-30%",
                      background:
                        "radial-gradient(circle at 50% 45%, rgba(255,120,40,.35), transparent 55%)",
                      mixBlendMode: "screen",
                      animation: "uno-hue 9s ease-in-out infinite",
                    }}
                  />
                  {/* Confetti shards */}
                  {shards.map((s, i) => (
                    <div
                      key={i}
                      style={
                        {
                          position: "absolute",
                          left: s.left,
                          top: "-5%",
                          width: s.width,
                          height: s.height,
                          background: s.bg,
                          borderRadius: s.radius,
                          animation: `uno-drift ${s.duration} linear ${s.delay} infinite`,
                          "--dx": s.dx,
                          "--rot": s.rot,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                  {/* Sparkles */}
                  {sparks.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        left: s.left,
                        top: s.top,
                        width: s.size,
                        height: s.size,
                        borderRadius: "50%",
                        background:
                          "radial-gradient(circle, #fff 0%, #ffe9a8 40%, transparent 70%)",
                        animation: `uno-twinkle ${s.duration} ease-in-out ${s.delay} infinite`,
                      }}
                    />
                  ))}
                </div>

                {/* Stage — perspective container */}
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: "76%",
                    height: "86%",
                    transformOrigin: "50% 50%",
                    transform:
                      "translate(-50%, -50%) perspective(1350px) rotateX(56deg)",
                    transformStyle: "preserve-3d",
                  }}
                >
                  {/* Arena surface — glowing oval ring */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "50%",
                      background:
                        "radial-gradient(ellipse at 50% 45%, rgba(255,235,190,.30), rgba(210,60,30,.15) 55%, transparent 72%)",
                      boxShadow:
                        "inset 0 0 0 4px rgba(255,220,160,.5), inset 0 0 90px rgba(255,170,80,.35), 0 0 120px rgba(255,140,60,.25)",
                    }}
                  />

                  {/* Starburst */}
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "52%",
                      width: 440,
                      height: 440,
                      transform: "translate(-50%, -50%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    {/* Spinning rays with radial mask */}
                    <div
                      style={
                        {
                          position: "absolute",
                          inset: 0,
                          borderRadius: "50%",
                          background:
                            "conic-gradient(from 0deg, transparent 0 5deg, rgba(255,240,200,.5) 6deg, transparent 7deg 17deg, rgba(255,240,200,.4) 18deg, transparent 19deg 29deg, rgba(255,240,200,.5) 30deg, transparent 31deg 41deg, rgba(255,240,200,.4) 42deg, transparent 43deg 53deg, rgba(255,240,200,.5) 54deg, transparent 55deg 65deg, rgba(255,240,200,.4) 66deg, transparent 67deg 77deg, rgba(255,240,200,.5) 78deg, transparent 79deg 89deg, rgba(255,240,200,.4) 90deg, transparent 91deg 101deg, rgba(255,240,200,.5) 102deg, transparent 103deg 113deg, rgba(255,240,200,.4) 114deg, transparent 115deg 125deg, rgba(255,240,200,.5) 126deg, transparent 127deg 137deg, rgba(255,240,200,.4) 138deg, transparent 139deg 149deg, rgba(255,240,200,.5) 150deg, transparent 151deg 161deg, rgba(255,240,200,.4) 162deg, transparent 163deg 173deg, rgba(255,240,200,.5) 174deg, transparent 175deg 185deg, rgba(255,240,200,.4) 186deg, transparent 187deg 197deg, rgba(255,240,200,.5) 198deg, transparent 199deg 209deg, rgba(255,240,200,.4) 210deg, transparent 211deg 221deg, rgba(255,240,200,.5) 222deg, transparent 223deg 233deg, rgba(255,240,200,.4) 234deg, transparent 235deg 245deg, rgba(255,240,200,.5) 246deg, transparent 247deg 257deg, rgba(255,240,200,.4) 258deg, transparent 259deg 269deg, rgba(255,240,200,.5) 270deg, transparent 271deg 281deg, rgba(255,240,200,.4) 282deg, transparent 283deg 293deg, rgba(255,240,200,.5) 294deg, transparent 295deg 305deg, rgba(255,240,200,.4) 306deg, transparent 307deg 317deg, rgba(255,240,200,.5) 318deg, transparent 319deg 329deg, rgba(255,240,200,.4) 330deg, transparent 331deg 341deg, rgba(255,240,200,.5) 342deg, transparent 343deg 353deg, rgba(255,240,200,.4) 354deg, transparent 355deg)",
                          WebkitMaskImage:
                            "radial-gradient(circle,#000 28%,transparent 70%)",
                          maskImage:
                            "radial-gradient(circle,#000 28%,transparent 70%)",
                          animation: "uno-spin 24s linear infinite",
                        } as React.CSSProperties
                      }
                    />
                    {/* Golden star shape — no children so clipPath doesn't cut text */}
                    <div
                      style={{
                        position: "absolute",
                        width: 220,
                        height: 220,
                        background:
                          "radial-gradient(circle,#ffd23f,#f0a01a 60%,#d97316)",
                        clipPath:
                          "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)",
                        filter: "drop-shadow(0 0 20px rgba(255,180,60,.8))",
                      }}
                    />
                    {/* UNO text sits on top of star, outside clipPath */}
                    <span
                      style={{
                        position: "relative",
                        fontStyle: "italic",
                        fontWeight: 900,
                        fontSize: 62,
                        color: "#ffd23f",
                        WebkitTextStroke: "4px #7a3b00",
                        textShadow: "3px 3px 0 rgba(0,0,0,.35)",
                        letterSpacing: "-2px",
                        lineHeight: 1,
                        zIndex: 1,
                      }}
                    >
                      UNO
                    </span>
                  </div>

                  {/* Opponent face-down fan — fanned from top so cards point toward table center */}
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "8%",
                      transform: "translate(-50%, 0%) rotateX(-28deg)",
                      transformOrigin: "50% 0%",
                      transformStyle: "preserve-3d",
                    }}
                  >
                    {(() => {
                      const effectiveOpp = isDealing ? Math.min(dealtCount, oppCount) : oppCount;
                      const n = Math.max(
                        Math.min(effectiveOpp, 5),
                        effectiveOpp > 0 ? 1 : 0,
                      );
                      const spread = 13;
                      const start = -((n - 1) / 2) * spread;
                      return Array.from({ length: n }, (_, i) => (
                        <div
                          key={i}
                          style={{
                            position: "absolute",
                            width: 72,
                            height: 104,
                            left: 0,
                            top: 0,
                            marginLeft: -36,
                            transform: `rotate(${start + i * spread}deg)`,
                            transformOrigin: "50% 0%",
                            borderRadius: 10,
                            background: "linear-gradient(135deg,#1c1c1c,#000)",
                            border: "2px solid #fff",
                            boxShadow: "0 3px 10px rgba(0,0,0,0.65)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              inset: "8px",
                              borderRadius: "50%/44%",
                              transform: "rotate(-22deg)",
                              background: "#d5342b",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <span
                              style={{
                                transform: "rotate(22deg)",
                                fontStyle: "italic",
                                fontWeight: 900,
                                fontSize: 11,
                                color: "#fff",
                                letterSpacing: "-0.02em",
                                textShadow: "1px 1px 0 rgba(0,0,0,.35)",
                              }}
                            >
                              UNO
                            </span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Draw pile */}
                  {(() => {
                    const mustDraw = isMyTurn && (noPlayableOpen || forcedDrawOpen);
                    const canClick = isMyTurn && !busy && !drawing && (
                      mustDraw || ((game?.pendingDraw ?? 0) === 0 && !game?.drawnThisTurn)
                    );
                    return (
                      <button
                        type="button"
                        onClick={canClick ? handleDraw : undefined}
                        disabled={!canClick || drawing}
                        style={{
                          position: "absolute",
                          left: "38%",
                          top: "66%",
                          transform: "translate(-50%, -100%) rotateX(-28deg)",
                          transformOrigin: "50% 100%",
                          transformStyle: "preserve-3d",
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: canClick ? "pointer" : "default",
                          animation: mustDraw ? "uno-pile-attract 0.9s ease-in-out infinite" : undefined,
                        }}
                      >
                        {/* Floating label when must draw */}
                        {mustDraw && (
                          <div style={{
                            position: "absolute",
                            bottom: "110%",
                            left: "50%",
                            transform: "translateX(-50%)",
                            background: forcedDrawOpen ? "#ef4444" : "#f59e0b",
                            color: "#fff",
                            borderRadius: 8,
                            padding: "5px 12px",
                            fontSize: 12,
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                            boxShadow: "0 3px 12px rgba(0,0,0,0.5)",
                            pointerEvents: "none",
                            letterSpacing: "0.02em",
                          }}>
                            {forcedDrawOpen
                              ? `Ambil ${pendingDrawCount} kartu!`
                              : "Ambil kartu!"}
                          </div>
                        )}
                        <div style={{ position: "relative", width: 72, height: 104 }}>
                          {/* Cast shadow */}
                          <div style={{
                            position: "absolute",
                            width: 72,
                            height: 104,
                            top: 10,
                            left: 7,
                            borderRadius: 10,
                            background: "rgba(0,0,0,0.55)",
                            filter: "blur(5px)",
                          }} />
                          {/* Card pile layers — deepest to shallowest */}
                          {[5, 4, 3, 2, 1].map((d) => (
                            <div key={d} style={{
                              position: "absolute",
                              width: 72,
                              height: 104,
                              top: d * 1.8,
                              left: d * 1.3,
                              borderRadius: 10,
                              background: "linear-gradient(135deg,#1c1c1c,#000)",
                              border: `2px solid rgba(255,255,255,${0.18 + (5 - d) * 0.06})`,
                            }} />
                          ))}
                          {/* Top card back — interactive */}
                          <div style={{
                            position: "absolute",
                            width: 72,
                            height: 104,
                            top: 0,
                            left: 0,
                            borderRadius: 10,
                            background: "linear-gradient(135deg,#1c1c1c,#000)",
                            border: mustDraw ? "2px solid #ffd23f" : "2px solid #fff",
                            boxShadow: mustDraw
                              ? "0 0 0 3px rgba(255,210,63,0.6), 0 4px 20px rgba(0,0,0,0.75)"
                              : "0 4px 14px rgba(0,0,0,0.75)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            overflow: "hidden",
                          }}>
                            <div style={{
                              position: "absolute",
                              inset: "8px",
                              borderRadius: "50%/44%",
                              transform: "rotate(-22deg)",
                              background: "#d5342b",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                              <span style={{
                                fontStyle: "italic",
                                fontWeight: 900,
                                fontSize: 17,
                                color: "#fff",
                                letterSpacing: "-0.02em",
                                textShadow: "1px 1px 0 rgba(0,0,0,.35)",
                              }}>UNO</span>
                            </div>
                          </div>
                        </div>
                        <span style={{
                          display: "block",
                          marginTop: 4,
                          fontSize: 9,
                          color: "rgba(255,255,255,0.45)",
                          textAlign: "center",
                          letterSpacing: "0.04em",
                        }}>
                          {game?.drawPile.length ?? 0}
                        </span>
                      </button>
                    );
                  })()}

                  {/* Discard pile */}
                  <div
                    style={{
                      position: "absolute",
                      left: "62%",
                      top: "66%",
                      transform: "translate(-50%, -100%) rotateX(-56deg)",
                      transformOrigin: "50% 100%",
                      transformStyle: "preserve-3d",
                    }}
                  >
                    {topCard ? (
                      (() => {
                        const discDisplay = getCardDisplay(topCard);
                        const isWild = !topParsed?.color;
                        const cardHex = topParsed?.color
                          ? (CARD_HEX[topParsed.color] ?? null)
                          : null;
                        return (
                          <div
                            className={
                              topParsed?.color
                                ? COLOR_GLOW[topParsed.color]
                                : "shadow-2xl"
                            }
                            style={{
                              width: 72,
                              height: 104,
                              borderRadius: 10,
                              background: isWild
                                ? "linear-gradient(135deg,#111,#000)"
                                : (cardHex ?? "#888"),
                              border: "2px solid #fff",
                              position: "relative",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              overflow: "hidden",
                            }}
                          >
                            {/* Oval */}
                            <div
                              style={{
                                position: "absolute",
                                inset: "8px",
                                borderRadius: "50%/44%",
                                transform: "rotate(-22deg)",
                                background: isWild
                                  ? "conic-gradient(#d5342b 0 90deg, #1f6fd6 90deg 180deg, #2ea24a 180deg 270deg, #e9b21a 270deg 360deg)"
                                  : "rgba(255,255,255,0.88)",
                                boxShadow: isWild
                                  ? "inset 0 0 0 3px #fff"
                                  : undefined,
                              }}
                            />
                            {/* Corner TL */}
                            <span
                              style={{
                                position: "absolute",
                                top: 4,
                                left: 5,
                                zIndex: 2,
                                fontWeight: 900,
                                fontSize: 12,
                                color: "#fff",
                                lineHeight: 1,
                              }}
                            >
                              {discDisplay.corner}
                            </span>
                            {/* Center value */}
                            <span
                              style={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                zIndex: 2,
                                fontWeight: 900,
                                fontSize: 30,
                                color: isWild ? "#fff" : (cardHex ?? "#fff"),
                                lineHeight: 1,
                              }}
                            >
                              {discDisplay.center}
                            </span>
                            {/* Corner BR */}
                            <span
                              style={{
                                position: "absolute",
                                bottom: 4,
                                right: 5,
                                zIndex: 2,
                                fontWeight: 900,
                                fontSize: 12,
                                color: "#fff",
                                lineHeight: 1,
                                transform: "rotate(180deg)",
                              }}
                            >
                              {discDisplay.corner}
                            </span>
                          </div>
                        );
                      })()
                    ) : (
                      <div
                        style={{
                          width: 72,
                          height: 104,
                          borderRadius: 10,
                          border: "2px dashed rgba(255,255,255,0.15)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span
                          style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}
                        >
                          Empty
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Opponent HUD — outside 3D stage, always faces camera */}
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 45,
                  }}
                >
                  <PlayerSlot
                    seat={Number(oppKey)}
                    handle={state?.players[oppKey]?.handle ?? "Opponent"}
                    cardCount={oppCount}
                    isTurn={!isMyTurn && !!game}
                    unoDeclared={game?.unoDeclared === Number(oppKey)}
                    isMe={false}
                  />
                </div>

                {/* Player HUD — outside 3D stage, always faces camera */}
                {seatKey && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 10,
                      left: 12,
                      zIndex: 45,
                    }}
                  >
                    <PlayerSlot
                      seat={myRole ?? 1}
                      handle={handle}
                      cardCount={myHand.length}
                      isTurn={isMyTurn}
                      unoDeclared={game?.unoDeclared === myRole}
                      isMe={true}
                    />
                  </div>
                )}

                {/* Current colour badge — bottom right */}
                {currentColor && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 10,
                      right: 12,
                      zIndex: 45,
                    }}
                  >
                    <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 shadow-lg backdrop-blur-sm">
                      <span
                        className={cn(
                          "size-2.5 animate-pulse rounded-full",
                          COLOR_DOT[currentColor] ?? "bg-amber-700",
                        )}
                      />
                      <span className="text-[11px] font-semibold text-white/80">
                        {COLOR_LABEL[currentColor] ?? currentColor}
                      </span>
                    </div>
                  </div>
                )}

                {/* Card dealing animation — alternates between opponent (up) and player (down) */}
                {isDealing && (
                  <div style={{ position: "absolute", inset: 0, zIndex: 55, pointerEvents: "none" }}>
                    {Array.from({ length: 14 }, (_, i) => {
                      const cardIdx = Math.floor(i / 2);
                      const isOpponent = i % 2 === 0;
                      const offset = cardIdx - 3;
                      return (
                        <div
                          key={i}
                          style={{
                            position: "absolute",
                            left: "43%",
                            top: "44%",
                            width: 72,
                            height: 104,
                            marginLeft: -36,
                            marginTop: -52,
                            borderRadius: 10,
                            background: "linear-gradient(135deg,#1c1c1c,#000)",
                            border: "2px solid #fff",
                            overflow: "hidden",
                            boxShadow: "0 4px 14px rgba(0,0,0,0.6)",
                            animation: `uno-deal 0.42s ease-in ${i * 0.13}s forwards`,
                            ["--deal-x" as string]: `${offset * (isOpponent ? 18 : 26)}px`,
                            ["--deal-y" as string]: isOpponent ? "-155px" : "170px",
                            ["--deal-r" as string]: `${offset * (isOpponent ? 3 : 4)}deg`,
                          }}
                        >
                          <div style={{
                            position: "absolute",
                            inset: "8px",
                            borderRadius: "50%/44%",
                            transform: "rotate(-22deg)",
                            background: "#d5342b",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}>
                            <span style={{
                              fontStyle: "italic",
                              fontWeight: 900,
                              fontSize: 17,
                              color: "#fff",
                              letterSpacing: "-0.02em",
                              textShadow: "1px 1px 0 rgba(0,0,0,.35)",
                            }}>UNO</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* UNO! pop animation */}
                {showUnoPop && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 50,
                      pointerEvents: "none",
                    }}
                  >
                    <span
                      style={{
                        fontStyle: "italic",
                        fontWeight: 900,
                        fontSize: 80,
                        color: "#ffd23f",
                        WebkitTextStroke: "4px #7a3b00",
                        filter: "drop-shadow(0 0 28px rgba(255,200,60,.85))",
                        animation: "unopop 1.5s ease-out forwards",
                        lineHeight: 1,
                      }}
                    >
                      UNO!
                    </span>
                  </div>
                )}

                {/* Hand overlay — faces camera, overlays bottom of stage */}
                {seatKey && game && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      zIndex: 48,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      paddingBottom: 10,
                    }}
                  >
                    {/* UNO / pass turn — above fan */}
                    {((myRole !== null && myHand.length === 1) ||
                      (isMyTurn && game.drawnThisTurn)) && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        {myRole !== null &&
                          myHand.length === 1 &&
                          (game.unoDeclared === myRole ? (
                            <span className="rounded-full border-2 border-green-400 bg-green-500 px-4 py-1.5 text-xs font-black text-white shadow-[0_0_16px_rgba(34,197,94,0.70)] backdrop-blur-sm">
                              UNO declared ✓
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={declareUno}
                              className="flex flex-col items-center gap-0.5 rounded-2xl border-2 border-yellow-300 bg-yellow-400 px-5 py-2 shadow-[0_0_20px_rgba(250,204,21,0.80)] transition-all hover:bg-yellow-300 hover:shadow-[0_0_32px_rgba(250,204,21,1)] active:scale-95"
                              style={{ animation: "uno-breathe 1.2s ease-in-out infinite" }}
                            >
                              <span className="text-sm font-black text-zinc-900 leading-none">UNO!</span>
                              <span className="text-[9px] font-bold text-zinc-800 leading-none tracking-wide">Tekan sekarang!</span>
                            </button>
                          ))}
                        {isMyTurn && game.drawnThisTurn && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => move({ type: "noop" })}
                            className="rounded-xl border border-white/20 bg-black/50 px-3 py-1.5 text-xs text-amber-200/80 backdrop-blur-sm transition-colors hover:text-amber-100 disabled:opacity-50"
                          >
                            Pass turn
                          </button>
                        )}
                      </div>
                    )}

                    {/* Hand — horizontal row */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        height: 115,
                        width: "100%",
                        overflowX: "visible",
                      }}
                    >
                      {(isDealing ? myHand.slice(0, dealtCount) : myHand).map((card, idx) => {
                        const p = parseCard(card);
                        const playable =
                          isMyTurn &&
                          !busy &&
                          game.pendingDraw === 0 &&
                          (game.drawnThisTurn
                            ? idx === myHand.length - 1 &&
                              canPlayCard(
                                card,
                                game.currentColor,
                                game.currentType,
                                game.currentValue,
                              )
                            : canPlayCard(
                                card,
                                game.currentColor,
                                game.currentType,
                                game.currentValue,
                              ));
                        const display = getCardDisplay(card);
                        const isWildCard = !p?.color;
                        const cardBgHex = p?.color
                          ? (CARD_HEX[p.color] ?? null)
                          : null;
                        const overlapPx = Math.min(28, Math.max(10, 72 - Math.floor(320 / Math.max(myHand.length, 1))));
                        return (
                          <button
                            key={`${card}-${idx}`}
                            type="button"
                            disabled={!playable}
                            onClick={() => handleCardClick(card)}
                            className={cn(
                              "uno-hand-card select-none overflow-hidden border-2 shadow-lg transition-[opacity,filter,transform] duration-150",
                              playable
                                ? "cursor-pointer focus:outline-none focus-visible:outline-none active:brightness-125"
                                : "cursor-not-allowed opacity-35",
                            )}
                            style={{
                              flexShrink: 0,
                              position: "relative",
                              width: 72,
                              height: 104,
                              borderRadius: 10,
                              borderColor: "#fff",
                              background: isWildCard
                                ? "linear-gradient(135deg,#111,#000)"
                                : (cardBgHex ?? "#888"),
                              marginLeft: idx === 0 ? 0 : -overlapPx,
                              zIndex: idx + 1,
                              animation: isDealing ? "uno-card-in 0.22s ease-out" : undefined,
                            }}
                          >
                            {/* Oval */}
                            <div
                              style={{
                                position: "absolute",
                                inset: "8px",
                                borderRadius: "50%/44%",
                                transform: "rotate(-22deg)",
                                background: isWildCard
                                  ? "conic-gradient(#d5342b 0 90deg, #1f6fd6 90deg 180deg, #2ea24a 180deg 270deg, #e9b21a 270deg 360deg)"
                                  : "rgba(255,255,255,0.88)",
                                boxShadow: isWildCard
                                  ? "inset 0 0 0 3px #fff"
                                  : undefined,
                              }}
                            />
                            {/* Corner TL */}
                            <span
                              style={{
                                position: "absolute",
                                top: 4,
                                left: 5,
                                zIndex: 2,
                                fontWeight: 900,
                                fontSize: 10,
                                color: "#fff",
                                lineHeight: 1,
                                WebkitTextStroke: ".5px rgba(0,0,0,.3)",
                              }}
                            >
                              {display.corner}
                            </span>
                            {/* Center value */}
                            <span
                              style={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                zIndex: 2,
                                fontWeight: 900,
                                fontSize: 34,
                                color: isWildCard ? "#fff" : (cardBgHex ?? "#fff"),
                                lineHeight: 1,
                              }}
                            >
                              {display.center}
                            </span>
                            {/* Corner BR */}
                            <span
                              style={{
                                position: "absolute",
                                bottom: 4,
                                right: 5,
                                zIndex: 2,
                                fontWeight: 900,
                                fontSize: 10,
                                color: "#fff",
                                lineHeight: 1,
                                transform: "rotate(180deg)",
                                WebkitTextStroke: ".5px rgba(0,0,0,.3)",
                              }}
                            >
                              {display.corner}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {/* end 3D stage */}

              {/* Turn banner */}
              <div
                className={cn(
                  "shrink-0 rounded-xl border px-4 py-1.5 text-center transition-all duration-300",
                  isMyTurn
                    ? "border-amber-600/50 bg-amber-950/40 shadow-[0_0_20px_rgba(180,83,9,0.15)]"
                    : "border-amber-900/30 bg-[#1a0d04]/60",
                )}
              >
                {(() => {
                  if (!game?.lastEvent) return null;
                  const { type, seat } = game.lastEvent;
                  const actor =
                    state?.players[String(seat) as "1" | "2"]?.handle ??
                    "Someone";
                  const chosenLabel = game.lastEvent.chosenColor
                    ? ` → ${COLOR_LABEL[game.lastEvent.chosenColor] ?? game.lastEvent.chosenColor}`
                    : "";
                  const label =
                    type === "skip"
                      ? `${actor} played Skip`
                      : type === "reverse"
                        ? `${actor} played Reverse`
                        : type === "draw_two"
                          ? `${actor} played Draw Two`
                          : type === "wild"
                            ? `${actor} played Wild${chosenLabel}`
                            : type === "wild_draw_four"
                              ? `${actor} played Wild Draw Four${chosenLabel}`
                              : type === "draw_card"
                                ? `${actor} drew a card`
                                : null;
                  if (!label) return null;
                  return (
                    <p className="mb-1 text-[11px] text-amber-700/70">{label}</p>
                  );
                })()}
                <p className="text-sm">
                  {isMyTurn ? (
                    <span className="font-bold tracking-wide text-amber-200">
                      Your turn
                    </span>
                  ) : (
                    <span className="text-amber-700/70">
                      Waiting for{" "}
                      <span className="font-medium text-amber-300/80">
                        {turnHandle ?? "opponent"}
                      </span>
                      …
                    </span>
                  )}
                </p>
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        {/* end main column */}

        {/* ── Sidebar — wooden panel ── */}
        <aside className="hidden w-full shrink-0 flex-col divide-y divide-amber-900/25 border-t border-amber-900/25 bg-[#150c05] sm:flex lg:w-56 lg:border-l lg:border-t-0 lg:border-amber-900/25">
          {/* 1 · Room */}
          <section className="p-3.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700/70">
              Room
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <code className="rounded border border-amber-800/30 bg-amber-900/20 px-2 py-0.5 font-mono text-xs text-amber-200">
                {roomKey}
              </code>
              {isHost && (
                <span className="rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                  HOST
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-amber-700/60">
              {participants?.length ?? 0} participant
              {(participants?.length ?? 0) !== 1 ? "s" : ""}
            </p>
          </section>

          {/* 2 · Players */}
          <section className="p-3.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700/70">
              Players
            </p>
            <div className="flex flex-col gap-2">
              {(["1", "2"] as const).map((s) => {
                const player = session?.state?.players[s];
                if (!player) return null;
                const seatNum = Number(s);
                const colors =
                  SEAT_COLOR_CLASSES[(seatNum - 1) % SEAT_COLOR_CLASSES.length]!;
                const isMe = String(myRole) === s;
                const isTurn =
                  String(state?.turn) === s && status === "active";
                const hasUno = game?.unoDeclared === seatNum;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full shadow-sm",
                        colors.dot,
                      )}
                    />
                    <span
                      className={cn(
                        "flex-1 truncate text-xs",
                        isTurn
                          ? "font-semibold text-amber-100"
                          : "text-amber-200/70",
                      )}
                    >
                      {player.handle}
                    </span>
                    {hasUno && (
                      <span className="shrink-0 rounded-full border border-yellow-400/40 bg-yellow-400/15 px-1.5 py-0.5 text-[9px] font-black leading-none text-yellow-300">
                        UNO
                      </span>
                    )}
                    {isMe && (
                      <span className="shrink-0 rounded border border-amber-800/30 bg-amber-900/20 px-1 py-0.5 text-[9px] font-medium leading-none text-amber-600/70">
                        you
                      </span>
                    )}
                    {isTurn && (
                      <span className="size-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.65)]" />
                    )}
                  </div>
                );
              })}
              {!session && (
                <p className="text-[10px] text-amber-700/60">
                  Waiting for players…
                </p>
              )}
            </div>
          </section>

          {/* 3 · Game Info */}
          <section className="p-3.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700/70">
              Game
            </p>
            {game ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-amber-700/60">Colour</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        COLOR_DOT[game.currentColor] ?? "bg-amber-700",
                      )}
                    />
                    <span className="text-[10px] text-amber-200">
                      {COLOR_LABEL[game.currentColor] ?? game.currentColor}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-amber-700/60">
                    Direction
                  </span>
                  <span className="text-[10px] text-amber-200">
                    {game.direction === 1 ? "↻ Clockwise" : "↺ Counter"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-amber-700/60">
                    Draw pile
                  </span>
                  <span className="tabular-nums text-[10px] text-amber-200">
                    {game.drawPile.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-amber-700/60">Discard</span>
                  <span className="tabular-nums text-[10px] text-amber-200">
                    {game.discardPile.length}
                  </span>
                </div>
                {game.pendingDraw > 0 && (
                  <div className="mt-0.5 rounded-lg border border-red-500/25 bg-red-500/15 px-2 py-1.5">
                    <p className="text-[10px] font-semibold text-red-400">
                      +{game.pendingDraw} cards pending
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-amber-700/60">No game active</p>
            )}
          </section>

          {/* 4 · Last Event */}
          <section className="p-3.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700/70">
              Last Event
            </p>
            {(() => {
              const evt = game?.lastEvent;
              if (!evt || !game) {
                return (
                  <p className="text-[10px] text-amber-700/60">
                    No events yet
                  </p>
                );
              }
              const { type, seat, card, chosenColor, drewCards } = evt;
              const actor =
                state?.players[String(seat) as "1" | "2"]?.handle ?? "Someone";
              const parsed = card ? parseCard(card) : null;
              const label =
                type === "game_start"
                  ? "Game started"
                  : type === "play_card"
                    ? `${actor} played`
                    : type === "skip"
                      ? `${actor} played Skip`
                      : type === "reverse"
                        ? `${actor} played Reverse`
                        : type === "draw_two"
                          ? `${actor} played Draw Two`
                          : type === "wild"
                            ? `${actor} played Wild`
                            : type === "wild_draw_four"
                              ? `${actor} played WD4`
                              : type === "draw_card"
                                ? `${actor} drew a card`
                                : type;
              return (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-amber-200">{label}</p>
                  {card && (
                    <span
                      className={cn(
                        "inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold",
                        parsed?.color
                          ? CARD_BG[parsed.color]
                          : "border-amber-800/30 bg-amber-900/20 text-amber-200",
                      )}
                    >
                      {card}
                    </span>
                  )}
                  {chosenColor && (
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          COLOR_DOT[chosenColor],
                        )}
                      />
                      <span className="text-[10px] text-amber-700/60">
                        {COLOR_LABEL[chosenColor]}
                      </span>
                    </div>
                  )}
                  {drewCards.length > 0 && (
                    <p className="text-[10px] text-amber-700/60">
                      {drewCards.length} card{drewCards.length !== 1 ? "s" : ""}{" "}
                      drawn
                    </p>
                  )}
                </div>
              );
            })()}
          </section>
        </aside>
      </div>
      {/* end content row */}

      {/* ── Wild colour picker ── */}
      <Dialog
        open={pendingWild !== null}
        onOpenChange={(open) => {
          if (!open && !drawing) setPendingWild(null);
        }}
      >
        <DialogContent className="gap-0 overflow-hidden rounded-3xl border-border/60 bg-background/80 p-0 shadow-2xl backdrop-blur-xl sm:max-w-xs">
          <div className="flex flex-col gap-4 p-5">
            <div>
              <DialogTitle className="font-display text-lg font-bold">
                Choose a colour
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted">
                Pick the colour to continue with.
              </DialogDescription>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {(["red", "green", "blue", "yellow"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={drawing}
                  onClick={() => handleWildColor(c)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border p-3.5 text-sm font-medium transition-all",
                    "hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
                    CARD_BG[c],
                  )}
                >
                  <span className={cn("size-2.5 rounded-full", COLOR_DOT[c])} />
                  {COLOR_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Victory / defeat modal ── */}
      <Dialog open={victoryOpen} onOpenChange={setVictoryOpen}>
        <DialogContent className="gap-0 overflow-hidden rounded-3xl border-border/60 bg-background/80 p-0 shadow-2xl backdrop-blur-xl sm:max-w-sm">
          {iWon ? (
            <div className="relative flex flex-col items-center gap-5 overflow-hidden px-6 pb-8 pt-9">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-72 w-72 animate-pulse rounded-full bg-yellow-400/10 blur-3xl" />
              </div>

              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-[7%]  top-[5%]  size-3   rotate-12   rounded-sm  bg-red-400/70    animate-pulse [animation-delay:0.0s]" />
                <div className="absolute left-[22%] top-[2%]  size-2   rotate-45   rounded-sm  bg-red-500/60    animate-pulse [animation-delay:1.4s]" />
                <div className="absolute left-[38%] top-[4%]  size-2.5            rounded-full bg-yellow-400/80  animate-pulse [animation-delay:0.3s]" />
                <div className="absolute left-[60%] top-[3%]  size-2  -rotate-25  rounded-sm  bg-amber-300/75  animate-pulse [animation-delay:1.0s]" />
                <div className="absolute right-[18%] top-[7%] size-2   rotate-12  rounded-sm  bg-yellow-300/70 animate-pulse [animation-delay:0.9s]" />
                <div className="absolute right-[7%]  top-[5%] size-3  -rotate-12  rounded-sm  bg-orange-400/65 animate-pulse [animation-delay:0.5s]" />
                <div className="absolute left-[10%] top-[18%] size-2   rotate-30  rounded-sm  bg-green-400/65  animate-pulse [animation-delay:0.6s]" />
                <div className="absolute right-[9%] top-[15%] size-2.5 rotate-45             bg-green-500/60  animate-pulse [animation-delay:1.2s]" />
                <div className="absolute left-[4%]  top-[40%] size-2   rotate-45             bg-blue-400/70   animate-pulse [animation-delay:0.4s]" />
                <div className="absolute right-[5%] top-[32%] size-2  -rotate-12 rounded-full bg-blue-500/60  animate-pulse [animation-delay:1.5s]" />
                <div className="absolute left-[28%] top-[1%]  size-1.5            rounded-full bg-pink-400/80   animate-pulse [animation-delay:1.8s]" />
                <div className="absolute right-[33%] top-[6%] size-2   rotate-20  rounded-sm  bg-fuchsia-400/65 animate-pulse [animation-delay:0.2s]" />
                <div className="absolute bottom-[18%] left-[5%]  size-2.5 -rotate-12 rounded-sm bg-cyan-400/60  animate-pulse [animation-delay:0.7s]" />
                <div className="absolute bottom-[22%] right-[7%] size-2   rotate-45 rounded-sm bg-violet-400/65 animate-pulse [animation-delay:1.1s]" />
                <div className="absolute bottom-[10%] left-[24%] size-1.5           rounded-full bg-yellow-400/75 animate-pulse [animation-delay:1.6s]" />
                <div className="absolute bottom-[7%]  right-[21%] size-2  rotate-12 rounded-sm bg-red-400/60   animate-pulse [animation-delay:0.5s]" />
              </div>

              <div className="relative z-10 animate-bounce text-6xl leading-none select-none">
                🏆
              </div>

              <div className="relative z-10 text-center">
                <DialogTitle className="font-display text-4xl font-black leading-tight tracking-tight">
                  <span className="bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-400 bg-clip-text text-transparent">
                    You Win!
                  </span>
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm text-muted">
                  Congratulations,{" "}
                  <span className="font-bold text-foreground">{handle}</span>!
                  Well played.
                </DialogDescription>
              </div>

              <div
                className="relative z-10 flex items-end justify-center"
                style={{ height: 72 }}
              >
                {(
                  [
                    { bg: "bg-red-600", x: -36, rotate: -18 },
                    { bg: "bg-yellow-400", x: -12, rotate: -6 },
                    { bg: "bg-green-600", x: 12, rotate: 6 },
                    { bg: "bg-blue-700", x: 36, rotate: 18 },
                  ] as const
                ).map(({ bg, x, rotate }, i) => (
                  <div
                    key={i}
                    className={cn(
                      "absolute h-16 w-10 overflow-hidden rounded-xl border-2 border-white/75 shadow-lg",
                      bg,
                    )}
                    style={{
                      transform: `translateX(${x}px) rotate(${rotate}deg)`,
                      transformOrigin: "bottom center",
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/25" />
                  </div>
                ))}
              </div>

              <div className="relative z-10 flex w-full flex-col gap-2.5 pt-1">
                <Button
                  onClick={() => {
                    setVictoryOpen(false);
                    void rematch();
                  }}
                  className="h-12 w-full rounded-xl bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 font-bold text-zinc-900 shadow-none transition-all hover:brightness-110 hover:shadow-lg hover:shadow-amber-400/30 active:scale-[0.97]"
                >
                  Play Again
                </Button>
                <button
                  type="button"
                  onClick={() => void handleBackToRooms()}
                  className="text-sm text-muted transition-colors hover:text-foreground"
                >
                  Back to Game Room
                </button>
              </div>
            </div>
          ) : (
            <div className="relative flex flex-col items-center gap-5 overflow-hidden px-6 pb-8 pt-9">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-48 w-48 animate-pulse rounded-full bg-violet-500/10 blur-3xl" />
              </div>

              <div className="relative z-10 text-5xl leading-none select-none">
                😔
              </div>

              <div className="relative z-10 text-center">
                <DialogTitle className="font-display text-3xl font-black text-foreground">
                  {winnerName ?? "Opponent"} wins!
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm text-muted">
                  Better luck next time.
                </DialogDescription>
              </div>

              <div className="relative z-10 flex w-full flex-col gap-2.5">
                <Button
                  onClick={() => {
                    setVictoryOpen(false);
                    void rematch();
                  }}
                  className="h-12 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 font-semibold text-white shadow-none transition-all hover:brightness-110 hover:shadow-lg hover:shadow-violet-500/30 active:scale-[0.97]"
                >
                  Play Again
                </Button>
                <button
                  type="button"
                  onClick={() => void handleBackToRooms()}
                  className="text-sm text-muted transition-colors hover:text-foreground"
                >
                  Back to Game Room
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
