export const MILITARY_ZONE_ID = 'military-zone';

export const COLS = 7;
export const ROWS = 8;
export const CELLS = COLS * ROWS; // 56

export type PieceRank =
  | 'general' | 'major' | 'captain' | 'lieutenant'
  | 'tank' | 'engineer' | 'spy' | 'landmine' | 'hq';

export type Piece = {
  id: string;
  rank: PieceRank;
  player: 1 | 2;
  pos: number; // 0-55, row-major: pos = row*7 + col
};

export type BattleResult = 'attacker_wins' | 'defender_wins' | 'mutual_destruction';

export type MilitaryZoneGame = {
  pieces: Piece[];
  phase: 'setup' | 'playing' | 'finished';
  setupDone: [boolean, boolean];
  lastBattle: { pos: number; result: BattleResult } | null;
};

// 15 pieces per player
export const PIECE_DEFS = [
  { rank: 'general'    as PieceRank, count: 1, label: 'General',    abbr: 'GEN' },
  { rank: 'major'      as PieceRank, count: 1, label: 'Major',      abbr: 'MAJ' },
  { rank: 'captain'    as PieceRank, count: 2, label: 'Captain',    abbr: 'CPT' },
  { rank: 'lieutenant' as PieceRank, count: 3, label: 'Lieutenant', abbr: 'LT'  },
  { rank: 'tank'       as PieceRank, count: 2, label: 'Tank',       abbr: 'TNK' },
  { rank: 'engineer'   as PieceRank, count: 1, label: 'Engineer',   abbr: 'ENG' },
  { rank: 'spy'        as PieceRank, count: 1, label: 'Spy',        abbr: 'SPY' },
  { rank: 'landmine'   as PieceRank, count: 3, label: 'Landmine',   abbr: '☠'   },
  { rank: 'hq'         as PieceRank, count: 1, label: 'HQ',         abbr: 'HQ'  },
];

export const RANK_ABBR: Record<PieceRank, string> = {
  general: 'GEN', major: 'MAJ', captain: 'CPT', lieutenant: 'LT',
  tank: 'TNK', engineer: 'ENG', spy: 'SPY', landmine: '☠', hq: 'HQ',
};

export const RANK_LABEL: Record<PieceRank, string> = {
  general: 'General', major: 'Major', captain: 'Captain', lieutenant: 'Lieutenant',
  tank: 'Tank', engineer: 'Engineer', spy: 'Spy', landmine: 'Landmine', hq: 'HQ',
};

export type SetupEntry = { id: string; rank: PieceRank; pos: number | null };

export function generateSetupPieces(player: 1 | 2): SetupEntry[] {
  const out: SetupEntry[] = [];
  for (const def of PIECE_DEFS) {
    for (let i = 0; i < def.count; i++) {
      out.push({ id: `p${player}_${def.rank}_${i}`, rank: def.rank, pos: null });
    }
  }
  return out;
}

export function posToRowCol(pos: number): [number, number] {
  return [Math.floor(pos / COLS), pos % COLS];
}

export function rowColToPos(row: number, col: number): number {
  return row * COLS + col;
}

// P1 territory rows 4-7 (pos 28-55); P2 territory rows 0-3 (pos 0-27)
export function inTerritory(pos: number, player: 1 | 2): boolean {
  return player === 1 ? pos >= 28 : pos <= 27;
}

export function getValidMoves(piece: Piece, allPieces: Piece[]): number[] {
  const { rank, pos, player } = piece;
  if (rank === 'landmine' || rank === 'hq') return [];

  const [row, col] = posToRowCol(pos);
  const allySet = new Set(allPieces.filter(p => p.player === player).map(p => p.pos));
  const enemySet = new Set(allPieces.filter(p => p.player !== player).map(p => p.pos));
  const allSet = new Set(allPieces.map(p => p.pos));

  const valid: number[] = [];
  const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  if (['general', 'major', 'captain', 'lieutenant', 'spy'].includes(rank)) {
    for (const [dr, dc] of dirs) {
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const npos = rowColToPos(nr, nc);
      if (!allySet.has(npos)) valid.push(npos);
    }
  } else if (rank === 'tank') {
    const fwd = player === 1 ? -1 : 1;
    const r1 = row + fwd;
    if (r1 >= 0 && r1 < ROWS) {
      const pos1 = rowColToPos(r1, col);
      if (!allySet.has(pos1)) valid.push(pos1);
      if (!allSet.has(pos1)) {
        const r2 = row + fwd * 2;
        if (r2 >= 0 && r2 < ROWS) {
          const pos2 = rowColToPos(r2, col);
          if (!allySet.has(pos2)) valid.push(pos2);
        }
      }
    }
  } else if (rank === 'engineer') {
    for (const [dr, dc] of dirs) {
      for (let step = 1; step <= 7; step++) {
        const nr = row + dr * step, nc = col + dc * step;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
        const npos = rowColToPos(nr, nc);
        if (allySet.has(npos)) break;
        valid.push(npos);
        if (enemySet.has(npos)) break;
      }
    }
  }

  return valid;
}
