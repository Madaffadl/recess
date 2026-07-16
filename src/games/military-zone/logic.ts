export const MILITARY_ZONE_ID = 'military-zone';
export const GRID_SIZE = 10;

export const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
export const ROW_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

export type ShipId = 'carrier' | 'battleship' | 'destroyer' | 'submarine' | 'patrol';
export type Orient = 'H' | 'V';
export type ShotResult = 'hit' | 'miss';
export type ShotCell = ShotResult | null;

export type ShipDef = {
  id: ShipId;
  name: string;
  size: number;
};

export const SHIPS: ShipDef[] = [
  { id: 'carrier',    name: 'Carrier',     size: 5 },
  { id: 'battleship', name: 'Battleship',  size: 4 },
  { id: 'destroyer',  name: 'Destroyer',   size: 3 },
  { id: 'submarine',  name: 'Submarine',   size: 3 },
  { id: 'patrol',     name: 'Patrol Boat', size: 2 },
];

export type PlacedShip = {
  id: ShipId;
  player: number;
  r: number;
  c: number;
  size: number;
  orient: Orient;
  sunk: boolean;
};

export type PendingShip = {
  id: ShipId;
  size: number;
  r: number;
  c: number;
  orient: Orient;
};

export type BattleshipGame = {
  phase: 'placement' | 'battle' | 'finished';
  ready: Record<string, boolean>;
  eliminated: Record<string, boolean>;
  ships: PlacedShip[];
  shots: Record<string, Record<string, ShotCell[][]>>;
  lastShot: {
    by: number;
    target: number;
    r: number;
    c: number;
    result: ShotResult;
    sunkId?: string;
    eliminatedPlayer?: number;
  } | null;
};

export type MilitaryZoneSeat = { id: string; handle: string } | null;

export type MilitaryZoneState = {
  players: Record<string, MilitaryZoneSeat>;
  hostId: string;
  numPlayers: 2 | 3 | 4;
  turn: number;
  startTurn: number;
  winner: number | null;
  moveCount: number;
  game: BattleshipGame;
};

export type MilitaryZoneSessionRow = {
  id: string;
  room_key: string;
  game_id: string;
  state: MilitaryZoneState;
  status: 'waiting' | 'active' | 'finished';
};

export function mergeIncomingShots(
  shots: Record<string, Record<string, ShotCell[][]>>,
  targetPlayer: number,
  numPlayers: number,
): ShotCell[][] {
  const merged = emptyShots();
  const targetKey = String(targetPlayer);
  for (let shooter = 1; shooter <= numPlayers; shooter++) {
    if (shooter === targetPlayer) continue;
    const grid = shots[String(shooter)]?.[targetKey];
    if (!grid) continue;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (grid[r]?.[c]) merged[r][c] = grid[r][c];
      }
    }
  }
  return merged;
}

export function shipCells(
  r: number, c: number, size: number, orient: Orient
): [number, number][] {
  const cells: [number, number][] = [];
  for (let i = 0; i < size; i++) {
    cells.push(orient === 'H' ? [r, c + i] : [r + i, c]);
  }
  return cells;
}

export function isValidPlacement(
  r: number, c: number, size: number, orient: Orient,
  existing: PendingShip[]
): boolean {
  const cells = shipCells(r, c, size, orient);
  for (const [cr, cc] of cells) {
    if (cr < 0 || cr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) return false;
  }
  const occupied = new Set<string>();
  for (const s of existing) {
    for (const [sr, sc] of shipCells(s.r, s.c, s.size, s.orient)) {
      occupied.add(`${sr},${sc}`);
    }
  }
  for (const [cr, cc] of cells) {
    if (occupied.has(`${cr},${cc}`)) return false;
  }
  return true;
}

export function buildOccupiedSet(ships: (PlacedShip | PendingShip)[]): Set<string> {
  const s = new Set<string>();
  for (const ship of ships) {
    for (const [r, c] of shipCells(ship.r, ship.c, ship.size, ship.orient)) {
      s.add(`${r},${c}`);
    }
  }
  return s;
}

export function emptyShots(): ShotCell[][] {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

// Randomly fill unplaced ships onto the grid
export function autoPlace(existing: PendingShip[]): PendingShip[] {
  const result = [...existing];
  const remaining = SHIPS.filter((s) => !result.some((p) => p.id === s.id));
  for (const ship of remaining) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 400) {
      const r = Math.floor(Math.random() * GRID_SIZE);
      const c = Math.floor(Math.random() * GRID_SIZE);
      const orient: Orient = Math.random() < 0.5 ? "H" : "V";
      if (isValidPlacement(r, c, ship.size, orient, result)) {
        result.push({ id: ship.id, size: ship.size, r, c, orient });
        placed = true;
      }
      attempts++;
    }
  }
  return result;
}
