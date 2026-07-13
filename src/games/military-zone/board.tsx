"use client";

import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  Check,
  ChevronUp,
  Copy,
  Crosshair,
  Crown,
  Eye,
  Flag,
  HelpCircle,
  Loader2,
  Lock,
  Shield,
  Star,
  Swords,
  Trophy,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useGameSession } from "../use-game-session";
import type { GameBoardProps, Player } from "../types";
import {
  MILITARY_ZONE_ID,
  COLS,
  ROWS,
  PIECE_DEFS,
  RANK_ABBR,
  RANK_LABEL,
  generateSetupPieces,
  getValidMoves,
  inTerritory,
  rowColToPos,
  type MilitaryZoneGame,
  type Piece,
  type PieceRank,
  type SetupEntry,
} from "./logic";

// ──────────────────────────────────────────────────────────────
// Theme tokens
// ──────────────────────────────────────────────────────────────
const MZ = {
  bg:      "bg-[#0F110C]",
  surface: "bg-[#1B1E16]",
  border:  "border-[#5D6B54]",
  amber:   "text-[#E2A032]",
  orange:  "text-[#D75A38]",
  text:    "text-[#ECEAD9]",
  muted:   "text-[#555C4E]",
} as const;

// ──────────────────────────────────────────────────────────────
// Piece icons + colours
// ──────────────────────────────────────────────────────────────
const RANK_ICON: Record<PieceRank, LucideIcon> = {
  general:    Crown,
  major:      Star,
  captain:    Crosshair,
  lieutenant: ChevronUp,
  tank:       Zap,
  engineer:   Wrench,
  spy:        Eye,
  landmine:   AlertTriangle,
  hq:         Flag,
};

const RANK_COLOUR: Record<PieceRank, string> = {
  general:    "text-[#E2A032]",
  major:      "text-[#ECEAD9]",
  captain:    "text-[#ECEAD9]",
  lieutenant: "text-[#ECEAD9]",
  tank:       "text-[#5D6B54]",
  engineer:   "text-[#5D6B54]",
  spy:        "text-[#D75A38]",
  landmine:   "text-[#555C4E]",
  hq:         "text-[#E2A032]",
};

function PieceIcon({
  rank,
  className,
}: {
  rank: PieceRank;
  className?: string;
}) {
  const Icon = RANK_ICON[rank];
  return <Icon className={cn("size-3.5 shrink-0", className)} />;
}

// ──────────────────────────────────────────────────────────────
// Walkthrough dialog
// ──────────────────────────────────────────────────────────────
const PIECE_ROWS: Array<{
  rank: PieceRank;
  count: number;
  move: string;
  special: string;
}> = [
  { rank: "general",    count: 1, move: "1 step — any direction",       special: "Loses only to the Spy" },
  { rank: "major",      count: 1, move: "1 step — any direction",       special: "—" },
  { rank: "captain",    count: 2, move: "1 step — any direction",       special: "—" },
  { rank: "lieutenant", count: 3, move: "1 step — any direction",       special: "—" },
  { rank: "tank",       count: 2, move: "Up to 2 steps forward",        special: "Cannot jump over pieces" },
  { rank: "engineer",   count: 1, move: "Unlimited steps in a line",    special: "Safely defuses Landmines" },
  { rank: "spy",        count: 1, move: "1 step — any direction",       special: "Eliminates the General" },
  { rank: "landmine",   count: 3, move: "Immobile — cannot move",       special: "Destroys every attacker (except Engineer)" },
  { rank: "hq",         count: 1, move: "Immobile — cannot move",       special: "Capturing it wins the game" },
];

function WalkthroughDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded-lg border p-1.5 transition-colors hover:bg-[#1B1E16]",
            MZ.border, MZ.muted
          )}
          aria-label="How to play"
        >
          <HelpCircle className="size-4" />
        </button>
      </DialogTrigger>

      <DialogContent
        className={cn(
          "max-w-lg max-h-[85vh] overflow-y-auto",
          "bg-[#0F110C] border-[#5D6B54] text-[#ECEAD9]"
        )}
      >
        <DialogHeader>
          <DialogTitle className="font-mono tracking-widest text-[#ECEAD9]">
            🎖️ HOW TO PLAY — GUNJIN SHŌGI
          </DialogTitle>
          <p className="text-xs text-[#555C4E] font-mono">
            Hidden-information two-player strategy · 15 pieces per side
          </p>
        </DialogHeader>

        <Tabs defaultValue="forces">
          <TabsList className="w-full bg-[#1B1E16] border border-[#5D6B54]">
            <TabsTrigger value="forces" className="flex-1 font-mono text-xs tracking-wider data-[state=active]:bg-[#5D6B54]/40 data-[state=active]:text-[#ECEAD9]">
              FORCES
            </TabsTrigger>
            <TabsTrigger value="rules" className="flex-1 font-mono text-xs tracking-wider data-[state=active]:bg-[#5D6B54]/40 data-[state=active]:text-[#ECEAD9]">
              RULES
            </TabsTrigger>
          </TabsList>

          {/* ── FORCES TAB ── */}
          <TabsContent value="forces" className="mt-4 space-y-2">
            <p className="text-[11px] text-[#555C4E] font-mono">
              Each piece is hidden from your opponent until combat reveals it.
            </p>

            <div className="rounded-lg border border-[#5D6B54]/40 overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[2rem_1fr_3.5rem_1fr] gap-2 px-3 py-2 bg-[#1B1E16] text-[9px] font-mono tracking-widest text-[#555C4E] border-b border-[#5D6B54]/30">
                <span />
                <span>PIECE</span>
                <span>QTY</span>
                <span>MOVEMENT</span>
              </div>

              {PIECE_ROWS.map(({ rank, count, move, special }, i) => (
                <div
                  key={rank}
                  className={cn(
                    "grid grid-cols-[2rem_1fr_3.5rem_1fr] gap-2 px-3 py-2.5 items-start",
                    "border-b border-[#5D6B54]/20 last:border-0",
                    i % 2 === 0 ? "bg-[#0F110C]" : "bg-[#1B1E16]/40"
                  )}
                >
                  {/* Icon */}
                  <div className={cn("flex items-center justify-center pt-0.5", RANK_COLOUR[rank])}>
                    <PieceIcon rank={rank} className="size-4" />
                  </div>

                  {/* Name + special */}
                  <div>
                    <p className={cn("text-xs font-mono font-semibold", RANK_COLOUR[rank])}>
                      {RANK_LABEL[rank]}
                    </p>
                    {special !== "—" && (
                      <p className="text-[10px] text-[#555C4E] mt-0.5">{special}</p>
                    )}
                  </div>

                  {/* Count */}
                  <span className="text-[11px] font-mono text-[#555C4E] pt-0.5">×{count}</span>

                  {/* Movement */}
                  <p className="text-[10px] text-[#ECEAD9]/70 pt-0.5">{move}</p>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-[#555C4E] font-mono pt-1">
              TOTAL: 15 pieces · P1 deploys rows 5–8 · P2 deploys rows 1–4
            </p>
          </TabsContent>

          {/* ── RULES TAB ── */}
          <TabsContent value="rules" className="mt-4 space-y-5">

            {/* Setup */}
            <section>
              <h3 className="font-mono text-[10px] tracking-widest text-[#E2A032] mb-2">
                PHASE 1 — SETUP
              </h3>
              <ul className="space-y-1 text-xs text-[#ECEAD9]/80">
                <li className="flex gap-2"><span className="text-[#5D6B54]">›</span> Each player secretly arranges all 15 pieces anywhere in their half of the board.</li>
                <li className="flex gap-2"><span className="text-[#5D6B54]">›</span> The opponent sees your piece positions but <em>not</em> their identities (shown as <Lock className="inline size-3 mx-0.5" />).</li>
                <li className="flex gap-2"><span className="text-[#5D6B54]">›</span> Click a piece in the tray → click an empty square to place it. Click a placed piece to return it to the tray.</li>
                <li className="flex gap-2"><span className="text-[#5D6B54]">›</span> Press <strong className="text-[#ECEAD9]">DEPLOY FORCES</strong> when all 15 are placed.</li>
              </ul>
            </section>

            {/* Movement */}
            <section>
              <h3 className="font-mono text-[10px] tracking-widest text-[#E2A032] mb-2">
                PHASE 2 — MOVEMENT
              </h3>
              <ul className="space-y-1 text-xs text-[#ECEAD9]/80">
                <li className="flex gap-2"><span className="text-[#5D6B54]">›</span> Players alternate turns, moving one piece per turn.</li>
                <li className="flex gap-2"><span className="text-[#5D6B54]">›</span> Pieces move <strong className="text-[#ECEAD9]">orthogonally only</strong> (no diagonals).</li>
                <li className="flex gap-2"><span className="text-[#5D6B54]">›</span> A piece cannot move onto a square occupied by a friendly piece.</li>
                <li className="flex gap-2"><span className="text-[#5D6B54]">›</span> Moving onto an enemy square triggers combat.</li>
              </ul>
            </section>

            {/* Combat */}
            <section>
              <h3 className="font-mono text-[10px] tracking-widest text-[#E2A032] mb-2">
                COMBAT RESOLUTION
              </h3>
              <div className="rounded-lg border border-[#5D6B54]/40 overflow-hidden text-xs">
                {[
                  { scenario: "Higher rank attacks lower",   result: "Attacker wins · defender removed" },
                  { scenario: "Lower rank attacks higher",   result: "Defender wins · attacker removed" },
                  { scenario: "Equal ranks clash",           result: "Both pieces destroyed" },
                  { scenario: "Spy attacks General",         result: "Spy wins · General eliminated" },
                  { scenario: "Any piece steps on Landmine", result: "Both destroyed" },
                  { scenario: "Engineer steps on Landmine",  result: "Engineer wins · mine cleared" },
                  { scenario: "Combat piece captures HQ",    result: "Immediate victory ✓" },
                ].map(({ scenario, result }, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3 px-3 py-2 border-b border-[#5D6B54]/20 last:border-0",
                      i % 2 === 0 ? "bg-[#0F110C]" : "bg-[#1B1E16]/40"
                    )}
                  >
                    <span className="text-[#ECEAD9]/70 flex-1">{scenario}</span>
                    <span className="text-[#5D6B54] shrink-0 text-right">{result}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-[#555C4E]">
                Combat rank: General › Major › Captain › Lieutenant › Tank › Engineer › Spy
              </p>
            </section>

            {/* Win */}
            <section>
              <h3 className="font-mono text-[10px] tracking-widest text-[#E2A032] mb-2">
                VICTORY CONDITIONS
              </h3>
              <div className="space-y-2">
                <div className="flex gap-3 rounded-lg border border-[#E2A032]/30 bg-[#E2A032]/5 p-3">
                  <Flag className="size-4 text-[#E2A032] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-[#E2A032]">Capture the HQ</p>
                    <p className="text-[11px] text-[#ECEAD9]/70 mt-0.5">
                      Move any combat piece (General, Major, Captain, Lieutenant, or Tank) onto the enemy HQ square. Spy and Engineer <em>cannot</em> capture HQ.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-lg border border-[#5D6B54]/40 bg-[#5D6B54]/5 p-3">
                  <Swords className="size-4 text-[#5D6B54] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-[#ECEAD9]">Eliminate all mobile forces</p>
                    <p className="text-[11px] text-[#ECEAD9]/70 mt-0.5">
                      If your opponent has no movable pieces left (only immobile Landmines or HQ remain), you win automatically.
                    </p>
                  </div>
                </div>
              </div>
            </section>

          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────
// Copy link button
// ──────────────────────────────────────────────────────────────
function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        navigator.clipboard?.writeText(window.location.href).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
    >
      {copied ? <Check /> : <Copy />}
      <span translate="no">{copied ? "Copied!" : "Copy invite link"}</span>
    </Button>
  );
}

// ──────────────────────────────────────────────────────────────
// Setup phase UI
// ──────────────────────────────────────────────────────────────
function SetupPhase({
  myRole,
  busy,
  onDeploy,
}: {
  myRole: Player;
  busy: boolean;
  onDeploy: (pieces: Array<{ id: string; rank: PieceRank; pos: number }>) => void;
}) {
  const [entries, setEntries] = useState<SetupEntry[]>(() =>
    generateSetupPieces(myRole)
  );
  const [selected, setSelected] = useState<string | null>(null);

  const unplaced = entries.filter(e => e.pos === null);
  const placed   = entries.filter(e => e.pos !== null);
  const allPlaced = unplaced.length === 0;

  const placedPosMap = useMemo(() => {
    const m = new Map<number, SetupEntry>();
    for (const e of placed) if (e.pos !== null) m.set(e.pos, e);
    return m;
  }, [placed]);

  function handleCellClick(pos: number) {
    if (!inTerritory(pos, myRole)) return;
    const existing = placedPosMap.get(pos);
    if (existing) {
      setEntries(prev => prev.map(e => e.id === existing.id ? { ...e, pos: null } : e));
      setSelected(null);
      return;
    }
    if (!selected) return;
    setEntries(prev => prev.map(e => e.id === selected ? { ...e, pos } : e));
    setSelected(null);
  }

  const displayRows = myRole === 2
    ? Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i)
    : Array.from({ length: ROWS }, (_, i) => i);

  const selectedEntry = selected
    ? entries.find(e => e.id === selected) ?? null
    : null;

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Board */}
      <div className="flex justify-center">
        <div className={cn("rounded-lg border p-2", MZ.surface, MZ.border)}>
          <div className="flex flex-col gap-0.5">
            {displayRows.map(row => (
              <div key={row}>
                {/* River divider */}
                {((myRole === 1 && row === 3) || (myRole === 2 && row === 4)) && (
                  <div className="my-0.5 border-t-2 border-dashed border-[#5D6B54]/40" />
                )}
                <div className="flex gap-0.5">
                  {Array.from({ length: COLS }, (_, col) => {
                    const pos = rowColToPos(row, col);
                    const isMine  = inTerritory(pos, myRole);
                    const entry   = placedPosMap.get(pos);

                    return (
                      <button
                        key={col}
                        type="button"
                        disabled={!isMine}
                        onClick={() => handleCellClick(pos)}
                        className={cn(
                          "relative size-9 rounded border flex items-center justify-center transition-all overflow-hidden",
                          isMine
                            ? selected
                              ? "cursor-pointer border-[#E2A032]/40 bg-[#1B1E16] hover:bg-[#E2A032]/20"
                              : "cursor-pointer border-[#5D6B54]/60 bg-[#1B1E16] hover:bg-[#5D6B54]/20"
                            : "cursor-default border-[#1B1E16] bg-[#0F110C] opacity-25",
                          entry && "border-[#5D6B54] bg-[#1B1E16]",
                          entry && entry.id === selected && "border-[#E2A032] shadow-[0_0_6px_rgba(226,160,50,0.5)]"
                        )}
                      >
                        {entry ? (
                          <PieceIcon rank={entry.rank} className={RANK_COLOUR[entry.rank]} />
                        ) : isMine && selected ? (
                          <span className="text-[#E2A032]/30 text-[9px] font-mono">+</span>
                        ) : isMine ? (
                          <span className="text-[#5D6B54]/30 text-[9px] font-mono">·</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className={cn("mt-1 text-center text-[9px] tracking-widest font-mono", MZ.muted)}>
            ── NO MAN&apos;S LAND ──
          </p>
        </div>
      </div>

      {/* Context tip */}
      {selectedEntry && (
        <div className={cn("flex items-center gap-2.5 rounded-lg border p-2.5", MZ.border, MZ.surface)}>
          <PieceIcon rank={selectedEntry.rank} className={cn("size-5", RANK_COLOUR[selectedEntry.rank])} />
          <div className="min-w-0">
            <p className={cn("text-xs font-mono font-semibold", RANK_COLOUR[selectedEntry.rank])}>
              {RANK_LABEL[selectedEntry.rank]} selected
            </p>
            <p className={cn("text-[10px]", MZ.muted)}>
              Click a square in your territory to place it
            </p>
          </div>
        </div>
      )}

      {/* Piece tray */}
      <div className={cn("rounded-lg border p-3", MZ.surface, MZ.border)}>
        <p className={cn("mb-2.5 text-[10px] tracking-widest font-mono", MZ.muted)}>
          AVAILABLE — {unplaced.length} undeployed
        </p>
        <div className="flex flex-wrap gap-2">
          {PIECE_DEFS.map(def => {
            const trayItems = entries.filter(e => e.rank === def.rank && e.pos === null);
            return trayItems.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(prev => prev === item.id ? null : item.id)}
                title={RANK_LABEL[def.rank]}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-2.5 py-2 transition-all min-w-[3rem]",
                  MZ.surface,
                  selected === item.id
                    ? "border-[#E2A032] shadow-[0_0_8px_rgba(226,160,50,0.35)]"
                    : cn(MZ.border, "hover:border-[#ECEAD9]/30")
                )}
              >
                <PieceIcon rank={def.rank} className={cn("size-4", RANK_COLOUR[def.rank])} />
                <span className={cn("text-[9px] font-mono leading-none", RANK_COLOUR[def.rank])}>
                  {RANK_ABBR[def.rank]}
                </span>
              </button>
            ));
          })}
          {unplaced.length === 0 && (
            <span className={cn("text-xs font-mono py-1", MZ.muted)}>All forces deployed ✓</span>
          )}
        </div>
      </div>

      {/* Deploy */}
      <Button
        disabled={!allPlaced || busy}
        onClick={() => {
          const ready = entries.filter(e => e.pos !== null) as Array<SetupEntry & { pos: number }>;
          onDeploy(ready.map(e => ({ id: e.id, rank: e.rank, pos: e.pos })));
        }}
        className={cn(
          "w-full font-mono tracking-widest",
          allPlaced
            ? "bg-[#5D6B54] hover:bg-[#5D6B54]/80 text-[#ECEAD9]"
            : "opacity-40 cursor-not-allowed"
        )}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Shield className="size-4" />}
        {allPlaced
          ? "DEPLOY FORCES"
          : `PLACE ALL 15 PIECES  (${placed.length} / 15)`}
      </Button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Playing board cell
// ──────────────────────────────────────────────────────────────
function BoardCell({
  piece,
  myRole,
  isSelected,
  isValidMove,
  isBattleFlash,
  onClick,
}: {
  pos: number;
  piece: Piece | null;
  myRole: Player | null;
  isSelected: boolean;
  isValidMove: boolean;
  isBattleFlash: boolean;
  onClick: () => void;
}) {
  const isOwn = Boolean(piece && myRole && piece.player === myRole);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative size-9 rounded border flex items-center justify-center transition-all overflow-hidden",
        "border-[#1B1E16] bg-[#0F110C]",
        piece && "border-[#5D6B54]/40 bg-[#1B1E16]",
        isSelected && "border-[#E2A032] shadow-[0_0_8px_rgba(226,160,50,0.5)]",
        isValidMove && !piece && "border-[#E2A032]/50 bg-[#E2A032]/10 cursor-pointer",
        isValidMove && piece && "border-[#D75A38]/60 cursor-pointer",
        isOwn && !isSelected && "hover:border-[#E2A032]/40 cursor-pointer",
        !isOwn && !isValidMove && "cursor-default",
      )}
    >
      {/* Battle flash */}
      <AnimatePresence>
        {isBattleFlash && (
          <motion.div
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 bg-[#D75A38] z-10 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Valid move dot */}
      {isValidMove && !piece && (
        <div className="size-2 rounded-full bg-[#E2A032]/50" />
      )}

      {/* Piece */}
      {piece && (
        <span className={cn("relative z-0 flex items-center justify-center")}>
          {isOwn ? (
            <PieceIcon rank={piece.rank} className={RANK_COLOUR[piece.rank]} />
          ) : (
            <Lock className="size-3 text-[#555C4E]/70" />
          )}
        </span>
      )}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────
// Seat chip
// ──────────────────────────────────────────────────────────────
function SeatChip({
  player,
  handle,
  you,
  active,
}: {
  player: Player;
  handle?: string;
  you: boolean;
  active: boolean;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono transition-colors",
        active ? "border-[#5D6B54] bg-[#1B1E16]" : "border-[#1B1E16]"
      )}
    >
      <span
        className={cn(
          "size-2.5 rounded-full",
          player === 1 ? "bg-[#5D6B54]" : "bg-[#E2A032]"
        )}
      />
      <span className={cn("max-w-[8rem] truncate text-[12px]", MZ.text)}>
        {handle ?? "—"}
      </span>
      {you && <span className={cn("text-[10px]", MZ.muted)}>(you)</span>}
      <span className={cn("text-[10px]", MZ.muted)}>P{player}</span>
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Main board
// ──────────────────────────────────────────────────────────────
export function MilitaryZoneBoard({ roomKey, handle }: GameBoardProps) {
  const { session, myRole, ready, busy, error, join, move, rematch } =
    useGameSession<MilitaryZoneGame>({ roomKey, gameId: MILITARY_ZONE_ID, handle });

  const state  = session?.state;
  const status = session?.status;
  const game   = state?.game;
  const phase  = game?.phase ?? "setup";
  const pieces = game?.pieces ?? [];

  const seat1 = state?.players["1"] ?? null;
  const seat2 = state?.players["2"] ?? null;
  const isSpectator   = Boolean(session) && myRole === null;
  const isMyTurn      = status === "active" && myRole !== null && state?.turn === myRole;
  const isMySetupTurn = phase === "setup"   && isMyTurn;
  const isMyPlayTurn  = phase === "playing" && isMyTurn;

  const [selectedId,     setSelectedId]     = useState<string | null>(null);
  const [battleFlashPos, setBattleFlashPos] = useState<number | null>(null);

  const selectedPiece = useMemo(
    () => (selectedId ? pieces.find(p => p.id === selectedId) ?? null : null),
    [selectedId, pieces]
  );

  const validMoves = useMemo(
    () => (selectedPiece ? getValidMoves(selectedPiece, pieces) : []),
    [selectedPiece, pieces]
  );

  // Flash on battle
  const prevLastBattle = useRef<MilitaryZoneGame["lastBattle"]>(null);
  useEffect(() => {
    if (!game?.lastBattle) return;
    if (game.lastBattle === prevLastBattle.current) return;
    prevLastBattle.current = game.lastBattle;
    setBattleFlashPos(game.lastBattle.pos);
    const t = setTimeout(() => setBattleFlashPos(null), 700);
    return () => clearTimeout(t);
  }, [game?.lastBattle]);

  // Clear selection on turn change
  useEffect(() => { setSelectedId(null); }, [state?.turn, phase]);

  function handleCellClick(pos: number) {
    if (!isMyPlayTurn) return;
    const piece = pieces.find(p => p.pos === pos) ?? null;

    if (selectedId) {
      if (validMoves.includes(pos)) {
        move({ type: "move", id: selectedId, to: pos });
        setSelectedId(null);
        return;
      }
      if (piece && myRole && piece.player === myRole) { setSelectedId(piece.id); return; }
      setSelectedId(null);
      return;
    }
    if (piece && myRole && piece.player === myRole) setSelectedId(piece.id);
  }

  const displayRows = myRole === 2
    ? Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i)
    : Array.from({ length: ROWS }, (_, i) => i);

  const pieceByPos = useMemo(() => {
    const m = new Map<number, Piece>();
    for (const p of pieces) m.set(p.pos, p);
    return m;
  }, [pieces]);

  // Banner
  let banner: React.ReactNode = null;
  if (!session) {
    banner = "Start a mission and challenge a coworker.";
  } else if (status === "waiting") {
    banner = myRole === 1
      ? "Waiting for an opponent to join…"
      : "A game is waiting — join as the second player.";
  } else if (status === "active") {
    if (phase === "setup") {
      const deployingHandle = state?.players[String(state.turn) as "1" | "2"]?.handle;
      banner = isMySetupTurn
        ? <span className={MZ.text}>Arrange your forces, then press DEPLOY.</span>
        : <span>Waiting for <span className={MZ.text}>{deployingHandle ?? "opponent"}</span> to deploy…</span>;
    } else if (phase === "playing") {
      const turnHandle = state?.players[String(state?.turn) as "1" | "2"]?.handle;
      banner = isMyPlayTurn
        ? <span className={MZ.text}>Your turn — select a piece to move</span>
        : <span>Waiting for <span className={MZ.text}>{turnHandle ?? "opponent"}</span></span>;
    }
  } else if (status === "finished" && state?.winner) {
    const won = myRole === state.winner;
    banner = won
      ? <span className={MZ.text}>Victory! Your forces prevailed. 🎖️</span>
      : <span><span className={MZ.text}>{state.players[String(state.winner) as "1" | "2"]?.handle}</span> wins the engagement.</span>;
  }

  // Shared board renderer
  function renderBoard(interactive: boolean) {
    return (
      <div className={cn("rounded-lg border p-2", MZ.surface, MZ.border)}>
        <div className="flex flex-col gap-0.5">
          {displayRows.map(row => (
            <div key={row}>
              {((myRole === 1 && row === 3) || (myRole === 2 && row === 4) || (!myRole && row === 3)) && (
                <div className="my-0.5 border-t-2 border-dashed border-[#5D6B54]/40" />
              )}
              <div className="flex gap-0.5">
                {Array.from({ length: COLS }, (_, col) => {
                  const pos   = rowColToPos(row, col);
                  const piece = pieceByPos.get(pos) ?? null;
                  return (
                    <BoardCell
                      key={col}
                      pos={pos}
                      piece={piece}
                      myRole={myRole}
                      isSelected={!!selectedId && piece?.id === selectedId}
                      isValidMove={interactive && validMoves.includes(pos)}
                      isBattleFlash={battleFlashPos === pos}
                      onClick={() => interactive && handleCellClick(pos)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {phase === "playing" && myRole !== null && interactive && (
          <p className={cn("mt-2 text-center text-[9px] font-mono tracking-widest", MZ.muted)}>
            YOUR FORCES SHOWN — ENEMY POSITIONS CLASSIFIED
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl border glass", MZ.border)}>
      {/* Header */}
      <div className={cn("flex items-center justify-between border-b p-4", MZ.border)}>
        <div className="flex items-center gap-2">
          <Shield className={cn("size-4", MZ.amber)} />
          <h2 className={cn("font-display text-[15px] font-semibold tracking-tight font-mono", MZ.text)}>
            Gunjin Shōgi
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {status === "finished" && (
            <span className={cn("flex items-center gap-1.5 rounded-lg border px-2 py-1", MZ.border)}>
              <Trophy className={cn("size-3", MZ.amber)} />
              <span className={cn("text-[10px] font-mono tracking-widest", MZ.muted)}>MISSION OVER</span>
            </span>
          )}
          {phase === "playing" && status === "active" && (
            <span className={cn("text-[10px] font-mono tracking-widest", MZ.muted)}>
              MOVE {state?.moveCount ?? 0}
            </span>
          )}
          <WalkthroughDialog />
        </div>
      </div>

      {/* Players */}
      <div className="flex items-center justify-center gap-3 px-4 pt-4">
        <SeatChip player={1} handle={seat1?.handle} you={myRole === 1} active={status === "active" && state?.turn === 1} />
        <span className={cn("text-xs", MZ.muted)}>vs</span>
        <SeatChip player={2} handle={seat2?.handle} you={myRole === 2} active={status === "active" && state?.turn === 2} />
      </div>

      {/* Banner */}
      <p className={cn("px-4 pt-3 text-center text-[13px] font-mono", MZ.muted)}>
        {banner}
      </p>

      {error && (
        <p className={cn("px-4 pt-1 text-center text-xs font-mono", MZ.orange)}>⚠ {error}</p>
      )}

      {/* Game area */}
      <div className="flex flex-col items-center p-4">
        {!ready ? (
          <div className={cn("flex items-center gap-2 text-sm py-8", MZ.muted)}>
            <Loader2 className="size-4 animate-spin" />
            <span className="font-mono">Loading…</span>
          </div>

        ) : !session ? (
          <div className="py-8">
            <Button
              onClick={join}
              disabled={busy}
              className="bg-[#5D6B54] hover:bg-[#5D6B54]/80 text-[#ECEAD9] font-mono tracking-widest"
            >
              {busy ? <Loader2 className="animate-spin" /> : <Swords />}
              START MISSION
            </Button>
          </div>

        ) : status === "waiting" ? (
          <div className="py-8 flex flex-col items-center gap-3">
            {myRole === null ? (
              <Button
                onClick={join}
                disabled={busy}
                className="bg-[#5D6B54] hover:bg-[#5D6B54]/80 text-[#ECEAD9] font-mono tracking-widest"
              >
                {busy ? <Loader2 className="animate-spin" /> : <Swords />}
                JOIN MISSION
              </Button>
            ) : (
              <CopyLinkButton />
            )}
          </div>

        ) : isMySetupTurn ? (
          <SetupPhase
            myRole={myRole!}
            busy={busy}
            onDeploy={pieceList => move({ type: "setup", pieces: pieceList })}
          />

        ) : (phase === "setup" || phase === "playing") && status === "active" ? (
          renderBoard(phase === "playing")

        ) : status === "finished" ? (
          renderBoard(false)

        ) : null}
      </div>

      {/* Footer */}
      <div className={cn("flex flex-col items-center gap-2 border-t p-4", MZ.border)}>
        {status === "finished" && myRole !== null && (
          <Button
            onClick={rematch}
            disabled={busy}
            className="bg-[#5D6B54] hover:bg-[#5D6B54]/80 text-[#ECEAD9] font-mono tracking-widest"
          >
            <Swords />
            REMATCH
          </Button>
        )}
        {isSpectator && (
          <span className={cn("text-[10px] font-mono tracking-widest", MZ.muted)}>OBSERVING</span>
        )}
      </div>
    </div>
  );
}
