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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import type { GameBoardProps, Player } from "../types";
import { useGameSession } from "../use-game-session";
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
  shipCells,
  type BattleshipGame,
  type Orient,
  type PendingShip,
  type PlacedShip,
  type ShipId,
  type ShotCell,
} from "./logic";
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
  bg:       "bg-[#050F1C]",
  surface:  "bg-[#091828]",
  border:   "border-[#0F3050]",
  cellWater:"#0A2035",
  cellHover:"#0E3055",
  shipHull: "#1A4070",
  hit:      "#E8401C",
  miss:     "#0A4070",
  radar:    "#00E59A",
  text:     "text-[#8FBCD4]",
  textVal:  "#8FBCD4",
  muted:    "text-[#2A6090]",
  mutedVal: "#2A6090",
  // Player accent colors
  p1:       "#00E59A",   // radar green
  p2:       "#E88C20",   // amber-orange
} as const;

// CSS filter to tint ship SVG images by player
// SVGs are drawn in ~H210° navy blue; hue-rotate shifts them into player color
const SHIP_FILTER: Record<1 | 2, string> = {
  1: "drop-shadow(0 0 3px rgba(0, 229, 154, 0.55))",                               // P1: cyan glow
  2: "hue-rotate(180deg) saturate(1.6) brightness(1.25) drop-shadow(0 0 3px rgba(232, 140, 32, 0.6))", // P2: amber
};

const CELL_SIZE   = 30;
const LABEL_SIZE  = 18;
const TOTAL       = LABEL_SIZE + GRID_SIZE * CELL_SIZE; // 318 px

function cellTop(r: number)  { return LABEL_SIZE + r * CELL_SIZE; }
function cellLeft(c: number) { return LABEL_SIZE + c * CELL_SIZE; }

function shipImgStyle(
  r: number, c: number, size: number, orient: Orient, player?: 1 | 2, opacity = 0.9
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  const accent = player === 1 ? T.p1 : T.p2;
  return (
    <span
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono transition-all",
        active ? "border-[#0F3050]" : "border-[#091828]"
      )}
      style={active ? { background: "#091828", boxShadow: `0 0 8px ${accent}30` } : {}}
    >
      <span
        className="size-2.5 rounded-full transition-colors"
        style={{ background: active ? accent : "#1A3A5C" }}
      />
      <span className={cn("max-w-[8rem] truncate text-[12px]", T.text)}>
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
          className={cn(
            "rounded-lg border p-1.5 transition-colors hover:bg-[#091828]",
            T.border, T.muted
          )}
          aria-label="How to play"
        >
          <HelpCircle className="size-4" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-[#050F1C] border-[#0F3050] text-[#8FBCD4]">
        <DialogHeader>
          <DialogTitle className="font-mono tracking-widest text-[#8FBCD4]">
            ⚓ HOW TO PLAY — TACTICAL GRID STRIKE
          </DialogTitle>
          <p className="text-xs text-[#2A6090] font-mono">
            Naval strategy · sink all 5 enemy ships to win
          </p>
        </DialogHeader>

        <Tabs defaultValue="ships">
          <TabsList className="w-full bg-[#091828] border border-[#0F3050]">
            <TabsTrigger value="ships" className="flex-1 font-mono text-xs tracking-wider data-[state=active]:bg-[#0F3050] data-[state=active]:text-[#8FBCD4]">
              FLEET
            </TabsTrigger>
            <TabsTrigger value="rules" className="flex-1 font-mono text-xs tracking-wider data-[state=active]:bg-[#0F3050] data-[state=active]:text-[#8FBCD4]">
              RULES
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ships" className="mt-4 space-y-3">
            <p className="text-[11px] text-[#2A6090] font-mono">
              Each side commands 5 ships hidden on a 10×10 grid.
              P1 ships glow <span style={{ color: T.p1 }}>green</span>;
              P2 ships glow <span style={{ color: T.p2 }}>amber</span>.
            </p>
            <div className="rounded-lg border border-[#0F3050] overflow-hidden">
              <div className="grid grid-cols-[1fr_3rem_3rem] gap-2 px-3 py-2 bg-[#091828] text-[9px] font-mono tracking-widest text-[#2A6090] border-b border-[#0F3050]/40">
                <span>VESSEL</span>
                <span className="text-center">×</span>
                <span className="text-center">CELLS</span>
              </div>
              {SHIPS.map(({ id, name, size }, i) => (
                <div
                  key={id}
                  className={cn(
                    "grid grid-cols-[1fr_3rem_3rem] gap-2 px-3 py-2.5 items-center",
                    "border-b border-[#0F3050]/20 last:border-0",
                    i % 2 === 0 ? "bg-[#050F1C]" : "bg-[#091828]/40"
                  )}
                >
                  <span className="text-xs font-mono text-[#8FBCD4]">{name}</span>
                  <span className="text-center text-xs font-mono text-[#2A6090]">1</span>
                  <span className="text-center text-xs font-mono" style={{ color: T.radar }}>{size}</span>
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
                  "Press DEPLOY FLEET when all 5 are placed. Both players place simultaneously.",
                ],
              },
              {
                title: "PHASE 2 — BATTLE",
                items: [
                  "Players alternate firing shots at the enemy grid.",
                  "Click any unrevealed cell in ENEMY WATERS on your turn.",
                  "🔴 HIT — your shot struck an enemy vessel.",
                  "○  MISS — your shot landed in open water.",
                  "When all cells of a ship are hit, it is SUNK and its hull is revealed.",
                  "First to sink all 5 enemy ships wins.",
                ],
              },
            ].map(({ title, items }) => (
              <section key={title}>
                <h3 className="font-mono text-[10px] tracking-widest mb-2" style={{ color: T.radar }}>
                  {title}
                </h3>
                <ul className="space-y-1">
                  {items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-xs text-[#8FBCD4]/80">
                      <span className="text-[#0F3050] mt-0.5 shrink-0">›</span>
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
  // Player whose ships we're rendering (for tint)
  shipPlayer?: 1 | 2;
}

function BattleGrid({
  mode,
  ships = [],
  ghost,
  ghostValid = true,
  shots,
  interactive = false,
  onCellClick,
  onCellHover,
  highlightCells,
  flashCell,
  shipPlayer,
}: GridProps) {
  const occupied = useMemo(() => buildOccupiedSet(ships), [ships]);

  const ghostCells = useMemo(
    () =>
      ghost
        ? new Set(
            shipCells(ghost.r, ghost.c, ghost.size, ghost.orient).map(
              ([r, c]) => `${r},${c}`
            )
          )
        : new Set<string>(),
    [ghost]
  );

  const sunkCells = useMemo(() => {
    const s = new Set<string>();
    for (const ship of ships) {
      if ("sunk" in ship && ship.sunk) {
        for (const [r, c] of shipCells(ship.r, ship.c, ship.size, ship.orient)) {
          s.add(`${r},${c}`);
        }
      }
    }
    return s;
  }, [ships]);

  return (
    <div className="relative select-none" style={{ width: TOTAL, height: TOTAL }}>

      {/* Column labels (A–J) */}
      {COL_LABELS.map((label, c) => (
        <div
          key={c}
          className={cn("absolute flex items-center justify-center text-[10px] font-mono", T.muted)}
          style={{ top: 2, left: cellLeft(c), width: CELL_SIZE, height: LABEL_SIZE - 2 }}
        >
          {label}
        </div>
      ))}

      {/* Row labels (1–10) */}
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
          const key      = `${r},${c}`;
          const shot     = shots?.[r]?.[c] ?? null;
          const isOccupied  = occupied.has(key);
          const isGhost     = ghostCells.has(key);
          const isSunk      = sunkCells.has(key);
          const isHit       = shot === "hit";
          const isMiss      = shot === "miss";
          const isHighlight = highlightCells?.has(key);
          const isFlash     = flashCell?.r === r && flashCell?.c === c;
          const canTarget   = interactive && mode === "enemy" && !shot;

          let bg: string = T.cellWater;
          if (isOccupied && (mode === "mine" || mode === "placement")) bg = T.shipHull;
          if (isSunk && mode === "enemy") bg = "#1E100A";
          if (isHit)  bg = "#2A0C08";
          if (isGhost) bg = ghostValid ? "#0A2840" : "#2A0808";

          let borderColor = "#0A2235";
          if (isOccupied && (mode === "mine" || mode === "placement")) borderColor = "#1E5090";
          if (isGhost)    borderColor = ghostValid ? T.radar : T.hit;
          if (isHighlight && canTarget) borderColor = T.radar;
          if (isHit)   borderColor = T.hit;
          if (isMiss)  borderColor = "#0A3A60";
          if (isSunk)  borderColor = "#3A1A08";

          return (
            <div
              key={key}
              className={cn(
                "absolute border",
                canTarget && "cursor-crosshair"
              )}
              style={{
                top: cellTop(r),
                left: cellLeft(c),
                width: CELL_SIZE,
                height: CELL_SIZE,
                background: bg,
                borderColor,
                transition: "background 0.12s, border-color 0.12s",
              }}
              onClick={() => interactive && onCellClick?.(r, c)}
              onMouseEnter={() => onCellHover?.(r, c)}
              onMouseLeave={() => onCellHover?.(null, null)}
            >
              {/* Shot flash */}
              <AnimatePresence>
                {isFlash && (
                  <motion.div
                    key="flash"
                    initial={{ opacity: 0.85 }}
                    animate={{ opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.65 }}
                    className="absolute inset-0 z-20 pointer-events-none"
                    style={{ background: isHit ? T.hit : "#0A6090" }}
                  />
                )}
              </AnimatePresence>

              {/* Hit marker — animated in */}
              {isHit && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center z-10"
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <div className="relative w-4 h-4">
                    <div className="absolute rounded-sm" style={{ width: 14, height: 2.5, background: T.hit, top: "50%", left: "50%", transform: "translate(-50%,-50%) rotate(45deg)" }} />
                    <div className="absolute rounded-sm" style={{ width: 14, height: 2.5, background: T.hit, top: "50%", left: "50%", transform: "translate(-50%,-50%) rotate(-45deg)" }} />
                  </div>
                </motion.div>
              )}

              {/* Miss marker — animated in */}
              {isMiss && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center z-10"
                  initial={{ scale: 0.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 0.65 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="rounded-full border-2" style={{ width: 14, height: 14, borderColor: "#1A6090" }} />
                </motion.div>
              )}

              {/* Targeting reticle on hover */}
              {canTarget && isHighlight && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <Target className="size-3.5 animate-pulse" style={{ color: T.radar }} />
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
            ...shipImgStyle(ghost.r, ghost.c, ghost.size, ghost.orient, undefined, ghostValid ? 0.5 : 0.3),
            filter: ghostValid ? `${SHIP_FILTER[shipPlayer ?? 1]} opacity(0.6)` : "hue-rotate(330deg) saturate(2) opacity(0.5)",
          }}
        />
      )}

      {/* Ship SVG overlays */}
      {ships.map((ship) => {
        const isSunk   = "sunk" in ship && ship.sunk;
        const player   = "player" in ship ? (ship.player as 1 | 2) : (shipPlayer ?? 1);
        const filter   = isSunk
          ? `${SHIP_FILTER[player]} grayscale(0.5)`
          : SHIP_FILTER[player];
        return (
          <img
            key={ship.id}
            src={`/military-zone/${ship.id}.svg`}
            alt={ship.id}
            style={{
              ...shipImgStyle(ship.r, ship.c, ship.size, ship.orient, player, isSunk ? 0.45 : 0.9),
              filter,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Placement phase ──────────────────────────────────────────────────────────

function PlacementPhase({
  myRole,
  busy,
  alreadyReady,
  onDeploy,
}: {
  myRole: Player;
  busy: boolean;
  alreadyReady: boolean;
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

  // R key → rotate; Escape → deselect
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "r" || e.key === "R")      setOrient((o) => (o === "H" ? "V" : "H"));
      if (e.key === "Escape")                   setSelected(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleCellClick(r: number, c: number) {
    const clickKey = `${r},${c}`;
    // Click existing placed ship → pick up
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

  // Show placed fleet in read-only while waiting
  if (alreadyReady) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className={cn("flex items-center gap-2 rounded-lg border px-4 py-2", T.surface, T.border)}>
          <Anchor className="size-4" style={{ color: T.radar }} />
          <p className={cn("text-sm font-mono", T.text)}>Fleet deployed — awaiting opponent…</p>
        </div>
        <BattleGrid mode="placement" ships={placed} shipPlayer={myRole} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Rotation + auto-place controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOrient((o) => (o === "H" ? "V" : "H"))}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono transition-colors",
            T.border, T.muted, "hover:bg-[#091828]"
          )}
        >
          <RotateCw className="size-3" />
          {orient === "H" ? "HORIZ" : "VERT"} <span className="opacity-50">(R)</span>
        </button>

        <button
          type="button"
          onClick={handleAutoPlace}
          disabled={allPlaced}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono transition-colors",
            allPlaced ? "opacity-30 cursor-default border-[#091828]" : cn(T.border, T.muted, "hover:bg-[#091828]")
          )}
        >
          <Shuffle className="size-3" />
          AUTO-PLACE
        </button>

        <span className={cn("text-xs font-mono", T.muted)}>
          {remaining.length > 0
            ? `${remaining.length} left`
            : "All placed ✓"}
        </span>
      </div>

      {/* Placement grid */}
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
      <div className={cn("w-full rounded-lg border p-3", T.surface, T.border)}>
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
                    ? "opacity-30 cursor-default border-[#091828]"
                    : isSelected
                    ? "border-[#00E59A] text-[#00E59A]"
                    : cn(T.border, T.muted, "hover:border-[#8FBCD4]/30 hover:text-[#8FBCD4]")
                )}
                style={isSelected ? { boxShadow: `0 0 8px ${T.radar}40` } : {}}
              >
                <span
                  className="size-2 rounded-sm"
                  style={{
                    background: isPlaced ? "#1A3A5C" : isSelected ? T.radar : T.shipHull,
                  }}
                />
                <span>{ship.name}</span>
                <span className="opacity-40">×{ship.size}</span>
              </button>
            );
          })}
        </div>

        {selected && selectedDef && (
          <p className={cn("mt-2 text-[10px] font-mono", T.muted)}>
            <span style={{ color: T.radar }}>{selectedDef.name}</span> selected —
            click the grid to place · click placed ship to remove · R to rotate
          </p>
        )}
      </div>

      {/* Deploy */}
      <Button
        disabled={!allPlaced || busy}
        onClick={() => onDeploy(placed)}
        className="w-full font-mono tracking-widest text-[#050F1C]"
        style={allPlaced ? { background: T.radar } : { opacity: 0.4 }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Anchor className="size-4" />}
        {allPlaced ? "DEPLOY FLEET" : `PLACE ALL 5 SHIPS  (${placed.length} / 5)`}
      </Button>
    </div>
  );
}

// ─── Battle phase ─────────────────────────────────────────────────────────────

function BattlePhase({
  myRole,
  game,
  myTurn,
  onFire,
}: {
  myRole: Player;
  game: BattleshipGame;
  myTurn: boolean;
  onFire: (r: number, c: number) => void;
}) {
  const opponent = myRole === 1 ? 2 : 1;

  const myShips     = game.ships.filter((s) => s.player === myRole);
  // Only show enemy ships if they're sunk
  const enemyShips  = game.ships.filter((s) => s.player === opponent && s.sunk);

  const myShots  = game.shots?.[String(myRole)]  ?? emptyShots();
  const oppShots = game.shots?.[String(opponent)] ?? emptyShots();

  // Track lastShot to trigger SFX and flash
  const lastShotRef = useRef(game.lastShot);
  const [flashCell, setFlashCell] = useState<{ r: number; c: number } | null>(null);

  useEffect(() => {
    if (!game.lastShot || game.lastShot === lastShotRef.current) return;
    lastShotRef.current = game.lastShot;
    const { r, c, result, sunkId } = game.lastShot;
    setFlashCell({ r, c });
    setTimeout(() => setFlashCell(null), 800);

    if (sunkId)            playSunk();
    else if (result === "hit")  playHit();
    else                        playMiss();
  }, [game.lastShot]);

  // Hover cell for targeting
  const [hoverCell, setHoverCell] = useState<{ r: number; c: number } | null>(null);
  const lastPingRef = useRef(0);

  function handleHover(r: number | null, c: number | null) {
    if (r === null || c === null) { setHoverCell(null); return; }
    setHoverCell({ r, c });
    const shot = myShots[r]?.[c];
    if (!shot && myTurn) {
      const now = Date.now();
      if (now - lastPingRef.current > 130) {
        playPing();
        lastPingRef.current = now;
      }
    }
  }

  const highlightCells = useMemo(() => {
    if (!hoverCell || !myTurn) return undefined;
    const { r, c } = hoverCell;
    if (myShots[r]?.[c]) return undefined;
    return new Set([`${r},${c}`]);
  }, [hoverCell, myTurn, myShots]);

  function handleFire(r: number, c: number) {
    if (!myTurn || myShots[r]?.[c]) return;
    playFire();
    onFire(r, c);
  }

  // Stats
  const hits      = myShots.flat().filter((s) => s === "hit").length;
  const misses    = myShots.flat().filter((s) => s === "miss").length;
  const sunkCount = game.ships.filter((s) => s.player === opponent && s.sunk).length;

  return (
    <div className="flex flex-col items-center gap-5 w-full">

      {/* Stats */}
      <div className={cn("flex items-center gap-5 rounded-lg border px-5 py-2.5", T.surface, T.border)}>
        <Stat label="HITS"   value={hits}        color={T.hit} />
        <Divider />
        <Stat label="MISSES" value={misses}       color={T.textVal} />
        <Divider />
        <Stat label="SUNK"   value={`${sunkCount}/5`} color={T.radar} />
      </div>

      {/* Grids */}
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-8">

        {/* My fleet */}
        <div className="flex flex-col items-center gap-2">
          <p className={cn("text-[10px] font-mono tracking-widest", T.muted)}>
            MY FLEET · P{myRole}
          </p>
          <div className={cn("rounded-xl border p-2", T.surface, T.border)}>
            <BattleGrid
              mode="mine"
              ships={myShips}
              shots={oppShots}
              shipPlayer={myRole}
            />
          </div>
          {/* Own fleet HP bars */}
          <ShipHpRow ships={myShips} shots={oppShots} label="my" />
        </div>

        {/* Enemy waters */}
        <div className="flex flex-col items-center gap-2">
          <motion.p
            animate={{ opacity: myTurn ? 1 : 0.5 }}
            className="text-[10px] font-mono tracking-widest"
            style={{ color: myTurn ? T.radar : T.mutedVal }}
          >
            {myTurn ? "▸ ENEMY WATERS — FIRE" : "ENEMY WATERS"}
          </motion.p>
          <div
            className={cn("rounded-xl border p-2", T.surface)}
            style={{
              borderColor: myTurn ? T.radar : "#0F3050",
              boxShadow: myTurn ? `0 0 12px ${T.radar}25` : "none",
              transition: "border-color 0.3s, box-shadow 0.3s",
            }}
          >
            <BattleGrid
              mode="enemy"
              ships={enemyShips}
              shots={myShots}
              interactive={myTurn}
              highlightCells={highlightCells}
              flashCell={flashCell}
              shipPlayer={opponent as 1 | 2}
              onCellClick={handleFire}
              onCellHover={handleHover}
            />
          </div>
          {/* Enemy fleet HP proxy */}
          <ShipHpRow ships={game.ships.filter(s => s.player === opponent)} shots={myShots} label="enemy" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-mono font-bold leading-none" style={{ color }}>{value}</p>
      <p className={cn("text-[9px] font-mono tracking-widest mt-0.5", T.muted)}>{label}</p>
    </div>
  );
}
function Divider() {
  return <div className="h-6 w-px bg-[#0F3050]" />;
}

// HP bars showing how many cells each ship has remaining
function ShipHpRow({
  ships,
  shots,
  label,
}: {
  ships: (PlacedShip | PendingShip)[];
  shots: ShotCell[][];
  label: "my" | "enemy";
}) {
  return (
    <div className="flex gap-1 flex-wrap justify-center max-w-[318px]">
      {SHIPS.map((def) => {
        const ship = ships.find((s) => s.id === def.id);
        const cells = ship ? shipCells(ship.r, ship.c, ship.size, ship.orient) : [];
        const hitCount = cells.filter(([r, c]) => shots[r]?.[c] === "hit").length;
        const sunk = "sunk" in (ship ?? {}) && (ship as PlacedShip).sunk;
        const totalCells = def.size;

        return (
          <div key={def.id} className="flex flex-col items-center gap-0.5">
            <div className="flex gap-0.5">
              {Array.from({ length: totalCells }, (_, i) => {
                const isHit = i < hitCount;
                return (
                  <div
                    key={i}
                    className="rounded-sm"
                    style={{
                      width: 6, height: 10,
                      background: sunk ? T.hit :
                        isHit ? T.hit :
                        ship ? "#1A4070" : "#0A2035",
                      opacity: sunk ? 0.5 : 1,
                      transition: "background 0.3s",
                    }}
                  />
                );
              })}
            </div>
            <span className="text-[8px] font-mono" style={{ color: sunk ? T.hit : T.mutedVal }}>
              {def.id.slice(0, 3).toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main board ───────────────────────────────────────────────────────────────

export function MilitaryZoneBoard({ roomKey, handle }: GameBoardProps) {
  const { session, myRole, ready, busy, error, join, move, rematch } =
    useGameSession<BattleshipGame>({ roomKey, gameId: MILITARY_ZONE_ID, handle });

  const state  = session?.state;
  const status = session?.status;
  const game   = state?.game;
  const phase  = game?.phase ?? "placement";

  const seat1 = state?.players["1"] ?? null;
  const seat2 = state?.players["2"] ?? null;

  const isSpectator = Boolean(session) && myRole === null;
  const isMyTurn    = status === "active" && myRole !== null && state?.turn === myRole;
  const myReady     = myRole ? (game?.ready?.[String(myRole)] ?? false) : false;
  const inPlacement = phase === "placement" && status === "active";
  const inBattle    = phase === "battle"    && status === "active";

  // Victory / defeat SFX — fires once when game transitions to finished
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
  async function handleFire(r: number, c: number) {
    await move({ type: "fire", r, c });
  }

  // Banner
  let banner: React.ReactNode = null;
  if (!session) {
    banner = "Open a naval engagement and challenge a coworker.";
  } else if (status === "waiting") {
    banner = myRole === 1
      ? "Waiting for an opponent to join the battle…"
      : "A battle is waiting — join as the second commander.";
  } else if (inPlacement) {
    banner = myReady
      ? <span className={T.text}>Fleet deployed — awaiting enemy fleet.</span>
      : <span className={T.text}>Deploy your fleet before the battle begins.</span>;
  } else if (inBattle) {
    if (game?.lastShot?.sunkId) {
      const ship = SHIPS.find((s) => s.id === game.lastShot?.sunkId);
      const byMe = game.lastShot.by === myRole;
      banner = (
        <span style={{ color: T.hit }}>
          {byMe ? "You sank" : "Enemy sank"} the {ship?.name ?? game.lastShot.sunkId}!
        </span>
      );
    } else {
      const turnHandle = state?.players[String(state?.turn) as "1" | "2"]?.handle;
      banner = isMyTurn
        ? <span style={{ color: T.radar }}>Your turn — select a target in Enemy Waters.</span>
        : <span className={T.text}>Waiting for <span className={T.text}>{turnHandle ?? "opponent"}</span>…</span>;
    }
  } else if (status === "finished" && state?.winner) {
    const won = myRole === state.winner;
    banner = won
      ? <span style={{ color: T.radar }}>Victory! All enemy ships sunk. ⚓</span>
      : <span className={T.text}>{state.players[String(state.winner) as "1" | "2"]?.handle} wins the engagement.</span>;
  }

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl border glass", T.border)}>

      {/* Header */}
      <div className={cn("flex items-center justify-between border-b p-4", T.border)}>
        <div className="flex items-center gap-2">
          <Anchor className="size-4" style={{ color: T.radar }} />
          <h2 className={cn("font-mono text-[15px] font-semibold tracking-tight", T.text)}>
            Tactical Grid Strike
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {status === "finished" && (
            <span className={cn("flex items-center gap-1.5 rounded-lg border px-2 py-1", T.border)}>
              <Trophy className="size-3" style={{ color: T.radar }} />
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

      {/* Players */}
      <div className="flex items-center justify-center gap-3 px-4 pt-4">
        <SeatChip player={1} handle={seat1?.handle} you={myRole === 1} active={status === "active" && state?.turn === 1} />
        <span className={cn("text-xs", T.muted)}>vs</span>
        <SeatChip player={2} handle={seat2?.handle} you={myRole === 2} active={status === "active" && state?.turn === 2} />
      </div>

      {/* Banner */}
      <p className={cn("px-4 pt-3 pb-1 text-center text-[13px] font-mono", T.muted)}>
        {banner}
      </p>

      {error && (
        <p className="px-4 pb-1 text-center text-xs font-mono" style={{ color: T.hit }}>
          ⚠ {error}
        </p>
      )}

      {/* Game area */}
      <div className="flex flex-col items-center p-4">
        {!ready ? (
          <div className={cn("flex items-center gap-2 text-sm py-8", T.muted)}>
            <Loader2 className="size-4 animate-spin" />
            <span className="font-mono">Loading…</span>
          </div>

        ) : !session ? (
          <div className="py-8">
            <Button
              onClick={join}
              disabled={busy}
              className="font-mono tracking-widest text-[#050F1C]"
              style={{ background: T.radar }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Swords />}
              START ENGAGEMENT
            </Button>
          </div>

        ) : status === "waiting" ? (
          <div className="py-8 flex flex-col items-center gap-3">
            {myRole === null ? (
              <Button
                onClick={join}
                disabled={busy}
                className="font-mono tracking-widest text-[#050F1C]"
                style={{ background: T.radar }}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Swords />}
                JOIN ENGAGEMENT
              </Button>
            ) : (
              <CopyLinkButton />
            )}
          </div>

        ) : inPlacement ? (
          <PlacementPhase
            myRole={myRole!}
            busy={busy}
            alreadyReady={myReady}
            onDeploy={handleDeploy}
          />

        ) : inBattle && myRole !== null && game ? (
          <BattlePhase
            myRole={myRole}
            game={game}
            myTurn={isMyTurn}
            onFire={handleFire}
          />

        ) : status === "finished" && game ? (
          <BattlePhase
            myRole={myRole ?? 1}
            game={game}
            myTurn={false}
            onFire={() => {}}
          />

        ) : null}
      </div>

      {/* Footer */}
      <div className={cn("flex flex-col items-center gap-2 border-t p-4", T.border)}>
        {status === "finished" && myRole !== null && (
          <Button
            onClick={rematch}
            disabled={busy}
            className="font-mono tracking-widest text-[#050F1C]"
            style={{ background: T.radar }}
          >
            <Swords />
            REMATCH
          </Button>
        )}
        {isSpectator && (
          <span className={cn("text-[10px] font-mono tracking-widest", T.muted)}>OBSERVING</span>
        )}
      </div>
    </div>
  );
}
