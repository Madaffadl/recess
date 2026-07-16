"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Anchor,
  Check,
  Copy,
  HelpCircle,
  Loader2,
  RotateCw,
  Shuffle,
  Swords,
  Target,
  Trophy,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

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
import type { GameBoardProps } from "../types";
import {
  COL_LABELS,
  GRID_SIZE,
  MILITARY_ZONE_ID,
  ROW_LABELS,
  SHIPS,
  autoPlace,
  buildOccupiedSet,
  emptyShots,
  isValidPlacement,
  mergeIncomingShots,
  shipCells,
  type BattleshipGame,
  type MilitaryZoneSeat,
  type Orient,
  type PendingShip,
  type PlacedShip,
  type ShipId,
  type ShotCell,
} from "./logic";
import { useMilitaryZoneGame } from "./use-military-zone-game";
import {
  playDefeat,
  playFire,
  playHit,
  playMiss,
  playPing,
  playPlace,
  playSunk,
  playUnplace,
  playVictory,
} from "./sounds";

// ─── Theme ───────────────────────────────────────────────────────────────────
const T = {
  // Layout
  pageBg:    "bg-[#EEF4FA]",
  surface:   "bg-white",
  border:    "border-[#D0DCEA]",
  // Grid cells
  cellMine:  "#BDD9F0",     // soft sky-blue — MY FLEET
  cellEnemy: "#DDE3EA",     // soft cool-gray — ENEMY WATERS
  cellShip:  "#8AB8D8",     // darker blue for occupied cells
  cellHit:   "#FCE6EF",     // blush-pink cell background on hit
  cellSunk:  "#F5CEDF",     // deeper blush for sunk cells
  // Markers
  hit:       "#E03068",     // vivid pink-red
  miss:      "#8EA4B8",     // muted blue-gray
  // Player accents
  p1:        "#E03068",     // pink — player 1
  p2:        "#3D6FA0",     // steel blue — player 2
  p3:        "#2E8B57",     // sea green — player 3
  p4:        "#B8860B",     // dark goldenrod — player 4
  // Text
  text:      "text-[#1A2D3D]",
  textVal:   "#1A2D3D",
  muted:     "text-[#7090A8]",
  mutedVal:  "#7090A8",
} as const;

const PLAYER_COLORS: Record<number, string> = {
  1: T.p1,
  2: T.p2,
  3: T.p3,
  4: T.p4,
};

const SHIP_FILTER: Record<number, string> = {
  1: "drop-shadow(0 2px 4px rgba(224, 48, 104, 0.30)) drop-shadow(0 1px 2px rgba(0,0,0,0.18))",
  2: "hue-rotate(25deg) brightness(0.88) drop-shadow(0 2px 4px rgba(61, 111, 160, 0.35)) drop-shadow(0 1px 2px rgba(0,0,0,0.18))",
  3: "hue-rotate(90deg) brightness(0.85) drop-shadow(0 2px 4px rgba(46, 139, 87, 0.35)) drop-shadow(0 1px 2px rgba(0,0,0,0.18))",
  4: "hue-rotate(200deg) brightness(0.9) drop-shadow(0 2px 4px rgba(184, 134, 11, 0.35)) drop-shadow(0 1px 2px rgba(0,0,0,0.18))",
};

const CELL_SIZE  = 30;
const LABEL_SIZE = 18;
const TOTAL      = LABEL_SIZE + GRID_SIZE * CELL_SIZE; // 318 px

function cellTop(r: number)  { return LABEL_SIZE + r * CELL_SIZE; }
function cellLeft(c: number) { return LABEL_SIZE + c * CELL_SIZE; }

function shipImgStyle(
  r: number, c: number, size: number, orient: Orient, player?: number, opacity = 0.92
): React.CSSProperties {
  return {
    position:        "absolute",
    top:             cellTop(r) + 2,
    left:            orient === "H" ? cellLeft(c) + 2 : cellLeft(c) + CELL_SIZE - 2,
    width:           size * CELL_SIZE - 4,
    height:          CELL_SIZE - 4,
    transformOrigin: "top left",
    transform:       orient === "V" ? "rotate(90deg)" : "none",
    pointerEvents:   "none",
    userSelect:      "none",
    zIndex:          2,
    opacity,
    filter:          player ? SHIP_FILTER[player] : undefined,
    transition:      "opacity 0.3s, filter 0.3s",
  };
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("font-mono text-xs", T.border, T.muted)}
      onClick={() => {
        navigator.clipboard?.writeText(window.location.href).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      <span translate="no">{copied ? "Copied!" : "Copy invite link"}</span>
    </Button>
  );
}

function SeatChip({
  player, handle, you, active, eliminated,
}: { player: number; handle?: string; you: boolean; active: boolean; eliminated?: boolean }) {
  const accent = PLAYER_COLORS[player] ?? T.p1;
  return (
    <span
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-1.5 font-mono transition-all",
        active ? "bg-white border-[#C8D8E8]" : "border-transparent bg-transparent",
        eliminated && "opacity-40"
      )}
      style={active ? { boxShadow: `0 0 0 2px ${accent}22, 0 1px 4px rgba(0,0,0,0.06)` } : {}}
    >
      <span
        className="size-2.5 rounded-full transition-colors"
        style={{ background: active ? accent : "#C0CDD8" }}
      />
      <span
        className={cn("max-w-[8rem] truncate text-[12px]", T.text)}
        style={eliminated ? { textDecoration: "line-through" } : {}}
      >
        {handle ?? "—"}
      </span>
      {you && <span className={cn("text-[10px]", T.muted)}>(you)</span>}
      <span className={cn("text-[10px]", T.muted)}>P{player}</span>
    </span>
  );
}

function HowToPlayDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn("rounded-lg border p-1.5 transition-colors hover:bg-[#EEF4FA]", T.border, T.muted)}
          aria-label="How to play"
        >
          <HelpCircle className="size-4" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-white border-[#D0DCEA] text-[#1A2D3D]">
        <DialogHeader>
          <DialogTitle className="font-mono tracking-widest text-[#1A2D3D]">
            ⚓ HOW TO PLAY — TACTICAL GRID STRIKE
          </DialogTitle>
          <p className="text-xs font-mono" style={{ color: T.mutedVal }}>
            Naval strategy · sink all 5 enemy ships to win
          </p>
        </DialogHeader>

        <Tabs defaultValue="ships">
          <TabsList className="w-full bg-[#EEF4FA] border border-[#D0DCEA]">
            <TabsTrigger value="ships" className="flex-1 font-mono text-xs tracking-wider data-[state=active]:bg-white data-[state=active]:text-[#1A2D3D]">
              FLEET
            </TabsTrigger>
            <TabsTrigger value="rules" className="flex-1 font-mono text-xs tracking-wider data-[state=active]:bg-white data-[state=active]:text-[#1A2D3D]">
              RULES
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ships" className="mt-4 space-y-3">
            <p className="text-[11px] font-mono" style={{ color: T.mutedVal }}>
              Each side commands 5 ships on a 10×10 grid.
              P1 ships have a <span style={{ color: T.p1 }}>pink</span> glow;
              P2 ships have a <span style={{ color: T.p2 }}>blue</span> glow.
            </p>
            <div className="rounded-lg border border-[#D0DCEA] overflow-hidden">
              <div className="grid grid-cols-[1fr_3rem_3rem] gap-2 px-3 py-2 bg-[#EEF4FA] text-[9px] font-mono tracking-widest border-b border-[#D0DCEA]" style={{ color: T.mutedVal }}>
                <span>VESSEL</span>
                <span className="text-center">×</span>
                <span className="text-center">CELLS</span>
              </div>
              {SHIPS.map(({ id, name, size }, i) => (
                <div
                  key={id}
                  className={cn(
                    "grid grid-cols-[1fr_3rem_3rem] gap-2 px-3 py-2.5 items-center border-b border-[#D0DCEA]/40 last:border-0",
                    i % 2 === 0 ? "bg-white" : "bg-[#F5F9FC]"
                  )}
                >
                  <span className="text-xs font-mono text-[#1A2D3D]">{name}</span>
                  <span className="text-center text-xs font-mono" style={{ color: T.mutedVal }}>1</span>
                  <span className="text-center text-xs font-mono font-semibold" style={{ color: T.p2 }}>{size}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="rules" className="mt-4 space-y-5">
            {[
              {
                title: "PHASE 1 — FLEET PLACEMENT",
                items: [
                  "Place all 5 ships anywhere on your 10×10 grid.",
                  "Click a ship in the tray → click a grid cell to place it.",
                  "Press R or the rotate button to toggle horizontal / vertical.",
                  "Click an already-placed ship on the grid to pick it up.",
                  "Use Auto-Place to randomly fill remaining ships.",
                  "Press DEPLOY FLEET when all 5 are placed.",
                ],
              },
              {
                title: "PHASE 2 — BATTLE",
                items: [
                  "Players alternate firing shots at the enemy grid.",
                  "Click any unrevealed cell in ENEMY WATERS on your turn.",
                  "● HIT — your shot struck an enemy vessel.",
                  "● MISS — your shot landed in open water.",
                  "When all cells of a ship are hit, it is SUNK and its hull appears.",
                  "You have 10 seconds per turn — auto-fire triggers if time runs out.",
                  "First to sink all 5 enemy ships wins.",
                ],
              },
            ].map(({ title, items }) => (
              <section key={title}>
                <h3 className="font-mono text-[10px] tracking-widest mb-2" style={{ color: T.p2 }}>
                  {title}
                </h3>
                <ul className="space-y-1">
                  {items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-xs" style={{ color: `${T.textVal}99` }}>
                      <span className="mt-0.5 shrink-0" style={{ color: "#C8D8E8" }}>›</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Grid ────────────────────────────────────────────────────────────────────

type GridMode = "placement" | "mine" | "enemy";

interface GridProps {
  mode: GridMode;
  ships?: (PlacedShip | PendingShip)[];
  ghost?: PendingShip | null;
  ghostValid?: boolean;
  shots?: ShotCell[][];
  interactive?: boolean;
  onCellClick?: (r: number, c: number) => void;
  onCellHover?: (r: number | null, c: number | null) => void;
  highlightCells?: Set<string>;
  flashCell?: { r: number; c: number } | null;
  shipPlayer?: number;
}

function BattleGrid({
  mode, ships = [], ghost, ghostValid = true, shots,
  interactive = false, onCellClick, onCellHover,
  highlightCells, flashCell, shipPlayer,
}: GridProps) {
  const occupied  = useMemo(() => buildOccupiedSet(ships), [ships]);

  const ghostCells = useMemo(() =>
    ghost
      ? new Set(shipCells(ghost.r, ghost.c, ghost.size, ghost.orient).map(([r, c]) => `${r},${c}`))
      : new Set<string>(),
    [ghost]
  );

  const sunkCells = useMemo(() => {
    const s = new Set<string>();
    for (const ship of ships) {
      if ("sunk" in ship && ship.sunk) {
        for (const [r, c] of shipCells(ship.r, ship.c, ship.size, ship.orient)) s.add(`${r},${c}`);
      }
    }
    return s;
  }, [ships]);

  const baseBg = mode === "enemy" ? T.cellEnemy : T.cellMine;

  return (
    <div className="relative select-none" style={{ width: TOTAL, height: TOTAL }}>

      {/* Column labels A–J */}
      {COL_LABELS.map((label, c) => (
        <div
          key={c}
          className={cn("absolute flex items-center justify-center text-[10px] font-mono", T.muted)}
          style={{ top: 2, left: cellLeft(c), width: CELL_SIZE, height: LABEL_SIZE - 2 }}
        >
          {label}
        </div>
      ))}

      {/* Row labels 1–10 */}
      {ROW_LABELS.map((label, r) => (
        <div
          key={r}
          className={cn("absolute flex items-center justify-center text-[10px] font-mono", T.muted)}
          style={{ top: cellTop(r), left: 2, width: LABEL_SIZE - 2, height: CELL_SIZE }}
        >
          {label}
        </div>
      ))}

      {/* Cells */}
      {Array.from({ length: GRID_SIZE }, (_, r) =>
        Array.from({ length: GRID_SIZE }, (_, c) => {
          const key         = `${r},${c}`;
          const shot        = shots?.[r]?.[c] ?? null;
          const isOccupied  = occupied.has(key);
          const isGhost     = ghostCells.has(key);
          const isSunk      = sunkCells.has(key);
          const isHit       = shot === "hit";
          const isMiss      = shot === "miss";
          const isHighlight = highlightCells?.has(key);
          const isFlash     = flashCell?.r === r && flashCell?.c === c;
          const canTarget   = interactive && mode === "enemy" && !shot;

          let bg: string = baseBg;
          if (isOccupied && (mode === "mine" || mode === "placement")) bg = T.cellShip;
          if (isSunk && mode === "enemy") bg = T.cellSunk;
          if (isHit)   bg = T.cellHit;
          if (isGhost) bg = ghostValid ? "#C0EDD8" : "#FAD0DC";

          let borderColor = mode === "enemy" ? "#C4CDD8" : "#9ABCD4";
          if (isOccupied && (mode === "mine" || mode === "placement")) borderColor = "#68A4CC";
          if (isGhost)              borderColor = ghostValid ? "#2AAA78" : T.hit;
          if (isHighlight && canTarget) borderColor = T.p2;
          if (isHit)   borderColor = T.hit;
          if (isMiss)  borderColor = "#A8B8C8";
          if (isSunk)  borderColor = `${T.hit}88`;

          return (
            <div
              key={key}
              className={cn("absolute border", canTarget && "cursor-crosshair")}
              style={{
                top: cellTop(r), left: cellLeft(c),
                width: CELL_SIZE, height: CELL_SIZE,
                background: bg, borderColor,
                transition: "background 0.12s, border-color 0.12s",
              }}
              onClick={() => interactive && onCellClick?.(r, c)}
              onMouseEnter={() => onCellHover?.(r, c)}
              onMouseLeave={() => onCellHover?.(null, null)}
            >
              {/* Flash on latest shot */}
              <AnimatePresence>
                {isFlash && (
                  <motion.div
                    key="flash"
                    initial={{ opacity: 0.6 }}
                    animate={{ opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.65 }}
                    className="absolute inset-0 z-20 pointer-events-none"
                    style={{ background: isHit ? T.hit : T.miss }}
                  />
                )}
              </AnimatePresence>

              {/* Hit — filled pink circle */}
              {isHit && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center z-10"
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22 }}
                >
                  <div className="rounded-full" style={{ width: 14, height: 14, background: T.hit }} />
                </motion.div>
              )}

              {/* Miss — filled gray circle */}
              {isMiss && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center z-10"
                  initial={{ scale: 0.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.28 }}
                >
                  <div className="rounded-full" style={{ width: 12, height: 12, background: T.miss }} />
                </motion.div>
              )}

              {/* Targeting crosshair */}
              {canTarget && isHighlight && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <Target className="size-3.5" style={{ color: T.p2 }} />
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Ghost preview */}
      {ghost && (
        <img
          src={`/military-zone/${ghost.id}.svg`}
          alt={ghost.id}
          style={{
            ...shipImgStyle(ghost.r, ghost.c, ghost.size, ghost.orient, undefined, ghostValid ? 0.55 : 0.35),
            filter: ghostValid
              ? `${SHIP_FILTER[shipPlayer ?? 1]} opacity(0.65)`
              : "hue-rotate(330deg) saturate(1.5) opacity(0.45)",
          }}
        />
      )}

      {/* Ship SVG overlays */}
      {ships.map((ship) => {
        const isSunk = "sunk" in ship && ship.sunk;
        const player = "player" in ship ? ship.player : (shipPlayer ?? 1);
        const filter = isSunk
          ? `${SHIP_FILTER[player]} grayscale(0.55) opacity(0.55)`
          : SHIP_FILTER[player];
        return (
          <img
            key={ship.id}
            src={`/military-zone/${ship.id}.svg`}
            alt={ship.id}
            style={{ ...shipImgStyle(ship.r, ship.c, ship.size, ship.orient, player, isSunk ? 0.5 : 0.92), filter }}
          />
        );
      })}
    </div>
  );
}

// ─── Ship list (replaces HP-bar row) ─────────────────────────────────────────

function ShipList({
  sunkShips,
  label,
}: {
  sunkShips: PlacedShip[];
  label: "SHIPYARD" | "GRAVEYARD";
}) {
  return (
    <div className="w-full max-w-[318px]">
      <p className="text-[9px] font-mono tracking-widest mb-2" style={{ color: T.mutedVal }}>
        {label}
      </p>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
        {SHIPS.map((def) => {
          const isSunk = sunkShips.some((s) => s.id === def.id);
          return (
            <div key={def.id} className="flex items-center gap-1.5">
              <span
                className="shrink-0 size-1.5 rounded-full"
                style={{ background: isSunk ? T.hit : "#B8C8D8" }}
              />
              <span
                className="text-[11px] font-mono"
                style={{
                  color:          isSunk ? T.hit : T.textVal,
                  textDecoration: isSunk ? "line-through" : "none",
                  opacity:        isSunk ? 0.7 : 1,
                }}
              >
                {def.name} ({def.size})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Placement phase ──────────────────────────────────────────────────────────

function PlacementPhase({
  myRole, busy, alreadyReady, readyCount, totalPlayers, onDeploy,
}: {
  myRole: number;
  busy: boolean;
  alreadyReady: boolean;
  readyCount: number;
  totalPlayers: number;
  onDeploy: (ships: PendingShip[]) => void;
}) {
  const [placed,   setPlaced]   = useState<PendingShip[]>([]);
  const [selected, setSelected] = useState<ShipId | null>(null);
  const [orient,   setOrient]   = useState<Orient>("H");
  const [hover,    setHover]    = useState<{ r: number; c: number } | null>(null);

  const remaining   = SHIPS.filter((s) => !placed.some((p) => p.id === s.id));
  const selectedDef = SHIPS.find((s) => s.id === selected) ?? null;
  const allPlaced   = remaining.length === 0;

  const ghost = useMemo<PendingShip | null>(() => {
    if (!selected || !hover || !selectedDef) return null;
    return { id: selected, size: selectedDef.size, r: hover.r, c: hover.c, orient };
  }, [selected, hover, selectedDef, orient]);

  const ghostValid = useMemo(() => {
    if (!ghost) return true;
    return isValidPlacement(ghost.r, ghost.c, ghost.size, ghost.orient, placed);
  }, [ghost, placed]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "r" || e.key === "R") setOrient((o) => (o === "H" ? "V" : "H"));
      if (e.key === "Escape")              setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleCellClick(r: number, c: number) {
    const clickKey = `${r},${c}`;
    const hit = placed.find((s) =>
      shipCells(s.r, s.c, s.size, s.orient).some(([sr, sc]) => `${sr},${sc}` === clickKey)
    );
    if (hit) {
      setPlaced((prev) => prev.filter((s) => s.id !== hit.id));
      setSelected(hit.id);
      playUnplace();
      return;
    }
    if (!selected || !selectedDef) return;
    if (!isValidPlacement(r, c, selectedDef.size, orient, placed)) return;
    setPlaced((prev) => [...prev, { id: selected, size: selectedDef.size, r, c, orient }]);
    setSelected(null);
    playPlace();
  }

  function handleAutoPlace() {
    setPlaced((prev) => autoPlace(prev));
    setSelected(null);
    playPlace();
  }

  if (alreadyReady) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className={cn("flex items-center gap-2 rounded-lg border px-4 py-2 bg-white", T.border)}>
          <Anchor className="size-4" style={{ color: T.p1 }} />
          <p className={cn("text-sm font-mono", T.text)}>
            Fleet deployed — {readyCount}/{totalPlayers} commanders ready…
          </p>
        </div>
        <BattleGrid mode="placement" ships={placed} shipPlayer={myRole} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOrient((o) => (o === "H" ? "V" : "H"))}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono transition-colors bg-white hover:bg-[#EEF4FA]",
            T.border, T.muted
          )}
        >
          <RotateCw className="size-3" />
          {orient === "H" ? "HORIZ" : "VERT"} <span className="opacity-40">(R)</span>
        </button>

        <button
          type="button"
          onClick={handleAutoPlace}
          disabled={allPlaced}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono transition-colors",
            allPlaced
              ? "opacity-30 cursor-default border-[#D0DCEA]"
              : cn("bg-white hover:bg-[#EEF4FA]", T.border, T.muted)
          )}
        >
          <Shuffle className="size-3" />
          AUTO-PLACE
        </button>

        <span className={cn("text-xs font-mono", T.muted)}>
          {remaining.length > 0 ? `${remaining.length} remaining` : "All placed ✓"}
        </span>
      </div>

      {/* Grid */}
      <BattleGrid
        mode="placement"
        ships={placed}
        ghost={ghost}
        ghostValid={ghostValid}
        interactive
        shipPlayer={myRole}
        onCellClick={handleCellClick}
        onCellHover={(r, c) => setHover(r !== null && c !== null ? { r, c } : null)}
      />

      {/* Ship tray */}
      <div className={cn("w-full rounded-xl border p-3 bg-white", T.border)}>
        <p className={cn("mb-2 text-[10px] tracking-widest font-mono", T.muted)}>
          SELECT A SHIP TO PLACE
        </p>
        <div className="flex flex-wrap gap-2">
          {SHIPS.map((ship) => {
            const isPlaced   = placed.some((p) => p.id === ship.id);
            const isSelected = selected === ship.id;
            return (
              <button
                key={ship.id}
                type="button"
                disabled={isPlaced}
                onClick={() => setSelected((prev) => (prev === ship.id ? null : ship.id))}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-mono transition-all",
                  isPlaced
                    ? "opacity-30 cursor-default border-[#D0DCEA]"
                    : isSelected
                    ? "bg-[#FDF0F4] border-[#E03068] text-[#E03068]"
                    : cn("bg-white", T.border, T.muted, "hover:bg-[#EEF4FA] hover:text-[#1A2D3D]")
                )}
                style={isSelected ? { boxShadow: `0 0 0 2px ${T.p1}18` } : {}}
              >
                <span
                  className="size-2 rounded-sm"
                  style={{ background: isPlaced ? "#C8D8E8" : isSelected ? T.p1 : "#1A3F6F" }}
                />
                <span>{ship.name}</span>
                <span className="opacity-40">×{ship.size}</span>
              </button>
            );
          })}
        </div>

        {selected && selectedDef && (
          <p className={cn("mt-2 text-[10px] font-mono", T.muted)}>
            <span style={{ color: T.p1 }}>{selectedDef.name}</span> selected —
            click the grid to place · click placed ship to remove · R to rotate
          </p>
        )}
      </div>

      {/* Deploy */}
      <Button
        disabled={!allPlaced || busy}
        onClick={() => onDeploy(placed)}
        className="w-full font-mono tracking-widest text-white"
        style={allPlaced ? { background: T.p1 } : { background: "#D0DCEA", color: "#7090A8" }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Anchor className="size-4" />}
        {allPlaced ? "DEPLOY FLEET" : `PLACE ALL 5 SHIPS  (${placed.length} / 5)`}
      </Button>
    </div>
  );
}

// ─── Battle phase ─────────────────────────────────────────────────────────────

const TURN_SECONDS = 10;

function BattlePhase({
  myRole, game, myTurn, activeTurn, numPlayers, onFire, players,
}: {
  myRole:     number;
  game:       BattleshipGame;
  myTurn:     boolean;
  activeTurn: number;
  numPlayers: number;
  onFire:     (r: number, c: number, target: number) => void;
  players:    Record<string, MilitaryZoneSeat>;
}) {
  const activePlayers = useMemo(() =>
    Array.from({ length: numPlayers }, (_, i) => i + 1)
      .filter((p) => p !== myRole && !(game.eliminated?.[String(p)] ?? false)),
    [numPlayers, myRole, game.eliminated]
  );

  const [selectedTarget, setSelectedTarget] = useState<number>(
    () => activePlayers[0] ?? (myRole === 1 ? 2 : 1)
  );

  // Auto-switch target when it gets eliminated
  useEffect(() => {
    if (!activePlayers.includes(selectedTarget) && activePlayers.length > 0) {
      setSelectedTarget(activePlayers[0]);
    }
  }, [activePlayers, selectedTarget]);

  const myShips     = game.ships.filter((s) => s.player === myRole);
  const enemyShips  = game.ships.filter((s) => s.player === selectedTarget && s.sunk);
  // Shared attack grid: all non-target players' shots merged (same view for every attacker)
  const sharedShots = mergeIncomingShots(game.shots ?? {}, selectedTarget, numPlayers);
  const oppShots    = mergeIncomingShots(game.shots ?? {}, myRole, numPlayers);

  // SFX + flash on new shot
  const lastShotRef = useRef(game.lastShot);
  const [flashCell, setFlashCell] = useState<{ r: number; c: number } | null>(null);
  const selectedTargetRef = useRef(selectedTarget);
  selectedTargetRef.current = selectedTarget;

  useEffect(() => {
    if (!game.lastShot || game.lastShot === lastShotRef.current) return;
    lastShotRef.current = game.lastShot;
    const { r, c, result, sunkId, by, target } = game.lastShot;
    if (sunkId)                playSunk();
    else if (result === "hit") playHit();
    else                       playMiss();
    // Flash only when I fired at my currently-viewed target
    if (by === myRole && target === selectedTargetRef.current) {
      setFlashCell({ r, c });
      setTimeout(() => setFlashCell(null), 800);
    }
  }, [game.lastShot, myRole]);

  // Hover + sonar ping
  const [hoverCell, setHoverCell] = useState<{ r: number; c: number } | null>(null);
  const lastPingRef = useRef(0);

  function handleHover(r: number | null, c: number | null) {
    if (r === null || c === null) { setHoverCell(null); return; }
    setHoverCell({ r, c });
    if (!sharedShots[r]?.[c] && myTurn) {
      const now = Date.now();
      if (now - lastPingRef.current > 130) { playPing(); lastPingRef.current = now; }
    }
  }

  const highlightCells = useMemo(() => {
    if (!hoverCell || !myTurn) return undefined;
    const { r, c } = hoverCell;
    if (sharedShots[r]?.[c]) return undefined;
    return new Set([`${r},${c}`]);
  }, [hoverCell, myTurn, sharedShots]);

  function handleFire(r: number, c: number) {
    if (!myTurn || sharedShots[r]?.[c]) return;
    playFire();
    onFire(r, c, selectedTarget);
  }

  // Stats — aggregate across all attackers on selectedTarget
  const hits      = sharedShots.flat().filter((s) => s === "hit").length;
  const misses    = sharedShots.flat().filter((s) => s === "miss").length;
  const sunkCount = game.ships.filter((s) => s.player === selectedTarget && s.sunk).length;

  // ── Countdown ──────────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);
  const autoFiredRef = useRef(false);

  useEffect(() => {
    setTimeLeft(TURN_SECONDS);
    autoFiredRef.current = false;
  }, [activeTurn]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft]);

  const myShotsRef = useRef(sharedShots);
  myShotsRef.current = sharedShots;
  const activePlayersRef = useRef(activePlayers);
  activePlayersRef.current = activePlayers;

  useEffect(() => {
    if (timeLeft > 0 || !myTurn || autoFiredRef.current) return;
    autoFiredRef.current = true;
    const target = activePlayersRef.current.includes(selectedTargetRef.current)
      ? selectedTargetRef.current
      : activePlayersRef.current[0];
    if (target === undefined) return;
    const available: [number, number][] = [];
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (!myShotsRef.current[r]?.[c]) available.push([r, c]);
    if (available.length > 0) {
      const [r, c] = available[Math.floor(Math.random() * available.length)];
      playFire();
      onFire(r, c, target);
    }
  }, [timeLeft, myTurn, onFire]);

  const timerPct    = (timeLeft / TURN_SECONDS) * 100;
  const timerColor  = timeLeft > 6 ? T.p2 : timeLeft > 3 ? "#D4882A" : T.p1;
  const timerUrgent = timeLeft <= 3;
  // Carousel constants — all cards stay in DOM; depth drives position
  const PEEK_X     = 15;
  const PEEK_Y     = 35;
  const CARD_W     = TOTAL + 18;
  const CARD_H     = TOTAL + 45;   // header (~29px) + grid-container padding (16px)
  const allTargets = activePlayers;
  const numBack    = Math.min(allTargets.length - 1, 2);
  const activeIdx  = allTargets.indexOf(selectedTarget);

  return (
    <div className="flex flex-col items-center gap-4 w-full">

      {/* Stats row */}
      <div className={cn("flex items-center gap-6 rounded-xl border px-6 py-2.5 bg-white", T.border)}>
        <Stat label="HITS"   value={hits}             color={T.hit} />
        <Divider />
        <Stat label="MISSES" value={misses}            color={T.mutedVal} />
        <Divider />
        <Stat label="SUNK"   value={`${sunkCount}/5`} color={T.p2} />
      </div>

      {/* Countdown bar */}
      <div className={cn("w-full max-w-[318px] rounded-xl border px-3 py-2.5 bg-white", T.border)}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-mono tracking-widest" style={{ color: T.mutedVal }}>
            {myTurn ? "YOUR TURN" : `${players[String(activeTurn)]?.handle ?? `P${activeTurn}`} (P${activeTurn})'S TURN`}
          </span>
          <motion.span
            key={timeLeft}
            initial={{ scale: timerUrgent ? 1.35 : 1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.14 }}
            className="text-[12px] font-mono font-bold tabular-nums"
            style={{ color: timerColor }}
          >
            {timeLeft}s
          </motion.span>
        </div>
        <div className="h-2 w-full rounded-full overflow-hidden bg-[#EEF4FA]">
          <motion.div
            className="h-full rounded-full"
            style={{ background: timerColor }}
            animate={{ width: `${timerPct}%`, background: timerColor }}
            transition={{ duration: 0.9, ease: "linear" }}
          />
        </div>
        {timerUrgent && myTurn && (
          <p className="mt-1.5 text-[9px] font-mono tracking-widest text-center animate-pulse" style={{ color: timerColor }}>
            AUTO-FIRE IN {timeLeft}s
          </p>
        )}
      </div>

      {/* Target selector (shown for 3+ players only) */}
      {numPlayers > 2 && (
        <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-2 bg-white", T.border)}>
          <span className="text-[9px] font-mono tracking-widest shrink-0" style={{ color: T.mutedVal }}>
            TARGET:
          </span>
          <div className="flex gap-2 flex-wrap">
            {activePlayers.map((p) => {
              const pHandle = players[String(p)]?.handle ?? `P${p}`;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedTarget(p)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-mono transition-all",
                    T.text,
                    selectedTarget === p
                      ? "bg-white"
                      : "border-transparent bg-transparent opacity-50 hover:opacity-80"
                  )}
                  style={selectedTarget === p ? {
                    borderColor: PLAYER_COLORS[p],
                    boxShadow:   `0 0 0 2px ${PLAYER_COLORS[p]}22`,
                  } : {}}
                >
                  <span className="size-2 rounded-full" style={{ background: PLAYER_COLORS[p] }} />
                  <span className="max-w-[7rem] truncate">{pHandle}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Dual grids */}
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">

        {/* MY FLEET */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-full rounded-t-xl px-3 py-1.5 text-center font-mono text-[11px] tracking-widest text-white"
            style={{ background: PLAYER_COLORS[myRole] ?? T.p1 }}
          >
            YOUR FLEET · P{myRole}
          </div>
          <div className={cn("rounded-b-xl border border-t-0 p-2 bg-white", T.border)}>
            <BattleGrid mode="mine" ships={myShips} shots={oppShots} shipPlayer={myRole} />
          </div>
          <ShipList sunkShips={myShips.filter((s) => s.sunk)} label="SHIPYARD" />
        </div>

        {/* ENEMY WATERS — true carousel: all cards always in DOM */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="relative"
            style={{ width: CARD_W, minHeight: CARD_H + numBack * PEEK_Y }}
          >
            {allTargets.map((p) => {
              const pIdx     = allTargets.indexOf(p);
              const depth    = (pIdx - activeIdx + allTargets.length) % allTargets.length;
              const isActive = depth === 0;
              const pColor   = PLAYER_COLORS[p] ?? T.p2;
              const pHandle  = players[String(p)]?.handle ?? `P${p}`;
              const pShots   = isActive ? sharedShots : mergeIncomingShots(game.shots ?? {}, p, numPlayers);
              const pSunk    = isActive ? enemyShips  : game.ships.filter((s) => s.player === p && s.sunk);
              return (
                <motion.div
                  key={p}
                  className="absolute overflow-hidden rounded-xl"
                  animate={{
                    x:       depth * PEEK_X,
                    y:       depth * PEEK_Y,
                    scale:   1 - depth * 0.06,
                    opacity: isActive ? 1 : 0.55 - (depth - 1) * 0.10,
                  }}
                  transition={{ type: "spring", stiffness: 320, damping: 26 }}
                  style={{
                    width:  CARD_W,
                    zIndex: allTargets.length - depth,
                    cursor: isActive ? "default" : "pointer",
                  }}
                  onClick={isActive ? undefined : () => setSelectedTarget(p)}
                >
                  <div
                    className="px-3 py-1.5 text-center font-mono text-[11px] tracking-widest text-white transition-colors duration-300"
                    style={{ background: isActive && myTurn ? T.p1 : pColor }}
                  >
                    {isActive && myTurn
                      ? `▸ FIRE AT ${pHandle}`
                      : `${pHandle}'s Waters`}
                  </div>
                  <div
                    className="border border-t-0 p-2 bg-white"
                    style={{
                      borderColor:   isActive && myTurn ? T.p1 : "#D0DCEA",
                      boxShadow:     isActive && myTurn ? `0 0 0 2px ${T.p1}22` : "none",
                      pointerEvents: isActive ? "auto" : "none",
                    }}
                  >
                    <BattleGrid
                      mode="enemy"
                      ships={pSunk}
                      shots={pShots}
                      interactive={isActive && myTurn}
                      highlightCells={isActive ? highlightCells : undefined}
                      flashCell={isActive ? flashCell : undefined}
                      shipPlayer={p}
                      onCellClick={isActive ? handleFire : undefined}
                      onCellHover={isActive ? handleHover : undefined}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
          <ShipList sunkShips={enemyShips} label="GRAVEYARD" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-mono font-bold leading-none" style={{ color }}>{value}</p>
      <p className="text-[9px] font-mono tracking-widest mt-0.5" style={{ color: T.mutedVal }}>{label}</p>
    </div>
  );
}
function Divider() {
  return <div className="h-6 w-px bg-[#D0DCEA]" />;
}

// ─── Main board ───────────────────────────────────────────────────────────────

export function MilitaryZoneBoard({ roomKey, handle }: GameBoardProps) {
  const { session, myRole, ready, busy, error, join, move, rematch } =
    useMilitaryZoneGame({ roomKey, handle });

  const [numPlayersChoice, setNumPlayersChoice] = useState<2 | 3 | 4>(2);

  const state      = session?.state;
  const status     = session?.status;
  const game       = state?.game;
  const phase      = game?.phase ?? "placement";
  const numPlayers = state?.numPlayers ?? numPlayersChoice;

  const isSpectator = Boolean(session) && myRole === null;
  const isMyTurn    = status === "active" && myRole !== null && state?.turn === myRole;
  const myReady     = myRole ? (game?.ready?.[String(myRole)] ?? false) : false;
  const inPlacement = phase === "placement" && status === "active";
  const inBattle    = phase === "battle"    && status === "active";

  const readyCount   = game ? Object.values(game.ready).filter(Boolean).length : 0;
  const filledSeats  = state ? Object.values(state.players).filter(Boolean).length : 0;

  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === status) return;
    prevStatus.current = status;
    if (status === "finished" && state?.winner && myRole) {
      if (state.winner === myRole) playVictory();
      else                          playDefeat();
    }
  }, [status, state?.winner, myRole]);

  async function handleDeploy(ships: PendingShip[]) {
    await move({ type: "place", ships });
  }
  async function handleFire(r: number, c: number, target: number) {
    await move({ type: "fire", r, c, target });
  }

  // Banner message
  let banner: React.ReactNode = null;
  if (!session) {
    banner = "Open a naval engagement and challenge a coworker.";
  } else if (status === "waiting") {
    const remaining = numPlayers - filledSeats;
    banner = myRole !== null
      ? `Waiting for ${remaining} more player${remaining !== 1 ? "s" : ""}…`
      : "A battle is waiting — join as a commander.";
  } else if (inPlacement) {
    banner = myReady
      ? <span className={T.text}>Fleet deployed — {readyCount}/{numPlayers} commanders ready.</span>
      : <span className={T.text}>Deploy your fleet before the battle begins.</span>;
  } else if (inBattle) {
    if (game?.lastShot?.eliminatedPlayer) {
      const elimHandle = state?.players[String(game.lastShot.eliminatedPlayer)]?.handle;
      banner = <span style={{ color: T.hit }}>{elimHandle ?? `P${game.lastShot.eliminatedPlayer}`} eliminated!</span>;
    } else if (game?.lastShot?.sunkId) {
      const ship = SHIPS.find((s) => s.id === game.lastShot?.sunkId);
      const byMe = game.lastShot.by === myRole;
      banner = <span style={{ color: T.hit }}>{byMe ? "You sank" : `P${game.lastShot.by} sank`} the {ship?.name ?? game.lastShot.sunkId}!</span>;
    } else {
      const turnHandle = state?.players[String(state?.turn)]?.handle;
      banner = isMyTurn
        ? <span style={{ color: T.p1 }}>Your turn — select a target in Enemy Waters.</span>
        : <span className={T.text}>Waiting for <span style={{ color: T.p2 }}>{turnHandle ?? `P${state?.turn}`}</span>…</span>;
    }
  } else if (status === "finished" && state?.winner) {
    const won = myRole === state.winner;
    banner = won
      ? <span style={{ color: T.p1 }}>Victory! All enemy ships sunk. ⚓</span>
      : <span className={T.text}>{state.players[String(state.winner)]?.handle ?? `P${state.winner}`} wins the engagement.</span>;
  }

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl border shadow-sm bg-white", T.border)}>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#D0DCEA] px-4 py-3 bg-[#F5F9FC]">
        <div className="flex items-center gap-2">
          <Anchor className="size-4" style={{ color: T.p1 }} />
          <h2 className={cn("font-mono text-[15px] font-semibold tracking-tight", T.text)}>
            Tactical Grid Strike
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {status === "finished" && (
            <span className={cn("flex items-center gap-1.5 rounded-lg border px-2 py-1", T.border)}>
              <Trophy className="size-3" style={{ color: T.p1 }} />
              <span className={cn("text-[10px] font-mono tracking-widest", T.muted)}>BATTLE OVER</span>
            </span>
          )}
          {inBattle && (
            <span className={cn("text-[10px] font-mono tracking-widest", T.muted)}>
              SALVO {state?.moveCount ?? 0}
            </span>
          )}
          <HowToPlayDialog />
        </div>
      </div>

      {/* Players row — dynamic for N players */}
      <div className="flex items-center justify-center gap-2 px-4 pt-3 flex-wrap">
        {Array.from({ length: numPlayers }, (_, i) => i + 1).map((p, idx) => (
          <Fragment key={p}>
            {idx > 0 && <span className={cn("text-xs", T.muted)}>vs</span>}
            <SeatChip
              player={p}
              handle={state?.players[String(p)]?.handle}
              you={myRole === p}
              active={status === "active" && state?.turn === p}
              eliminated={game?.eliminated?.[String(p)] ?? false}
            />
          </Fragment>
        ))}
      </div>

      {/* Banner */}
      <p className={cn("px-4 pt-2 pb-1 text-center text-[13px] font-mono", T.muted)}>{banner}</p>

      {error && (
        <p className="px-4 pb-1 text-center text-xs font-mono" style={{ color: T.hit }}>⚠ {error}</p>
      )}

      {/* Game area */}
      <div className={cn("flex flex-col items-center p-4", T.pageBg)}>
        {!ready ? (
          <div className={cn("flex items-center gap-2 text-sm py-8", T.muted)}>
            <Loader2 className="size-4 animate-spin" />
            <span className="font-mono">Loading…</span>
          </div>

        ) : !session ? (
          <div className="py-8 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2">
              {([2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNumPlayersChoice(n)}
                  className={cn(
                    "w-12 h-10 rounded-lg border font-mono text-sm transition-all",
                    numPlayersChoice === n
                      ? "text-white"
                      : cn("bg-white", T.border, T.muted, "hover:bg-[#EEF4FA]")
                  )}
                  style={numPlayersChoice === n ? { background: T.p1, borderColor: T.p1 } : {}}
                >
                  {n}P
                </button>
              ))}
            </div>
            <Button
              onClick={() => join(numPlayersChoice)}
              disabled={busy}
              className="font-mono tracking-widest text-white"
              style={{ background: T.p1 }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Swords />}
              START ENGAGEMENT
            </Button>
          </div>

        ) : status === "waiting" ? (
          <div className="py-8 flex flex-col items-center gap-3">
            {myRole === null ? (
              <Button
                onClick={() => join()}
                disabled={busy}
                className="font-mono tracking-widest text-white"
                style={{ background: T.p1 }}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Swords />}
                JOIN ENGAGEMENT
              </Button>
            ) : (
              <CopyLinkButton />
            )}
          </div>

        ) : inPlacement && myRole !== null ? (
          <PlacementPhase
            myRole={myRole}
            busy={busy}
            alreadyReady={myReady}
            readyCount={readyCount}
            totalPlayers={numPlayers}
            onDeploy={handleDeploy}
          />

        ) : inBattle && myRole !== null && game ? (
          <BattlePhase
            myRole={myRole}
            game={game}
            myTurn={isMyTurn}
            activeTurn={state?.turn ?? 1}
            numPlayers={numPlayers}
            onFire={handleFire}
            players={state?.players ?? {}}
          />

        ) : busy && myRole === null ? (
          <div className={cn("flex items-center gap-2 text-sm py-8", T.muted)}>
            <Loader2 className="size-4 animate-spin" />
            <span className="font-mono">Joining…</span>
          </div>

        ) : status === "finished" && game ? (
          <BattlePhase
            myRole={myRole ?? 1}
            game={game}
            myTurn={false}
            activeTurn={1}
            numPlayers={numPlayers}
            onFire={() => {}}
            players={state?.players ?? {}}
          />

        ) : null}
      </div>

      {/* Footer */}
      <div className="flex flex-col items-center gap-2 border-t border-[#D0DCEA] p-4 bg-[#F5F9FC]">
        {status === "finished" && myRole !== null && (
          <Button
            onClick={rematch}
            disabled={busy}
            className="font-mono tracking-widest text-white"
            style={{ background: T.p1 }}
          >
            <Swords />
            REMATCH
          </Button>
        )}
        {isSpectator && !busy && (
          <span className={cn("text-[10px] font-mono tracking-widest", T.muted)}>OBSERVING</span>
        )}
      </div>
    </div>
  );
}
