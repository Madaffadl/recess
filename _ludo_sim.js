// Faithful JS mirror of the Ludo SQL logic (0023 + 0024) to hunt turn/move bugs.
function tokenTarget(p, dice) {
  if (p === 0) return dice === 6 ? 1 : -1;
  if (p >= 1 && p <= 56) return p + dice <= 57 ? p + dice : -1;
  return -1;
}
const OFF = [0, 13, 26, 39];
function absIdx(color, p) {
  return p >= 1 && p <= 51 ? (OFF[color] + p - 1) % 52 : -1;
}
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function roll(s, dice) {
  if (s.dice !== null) throw new Error("already rolled");
  s.dice = dice; // never advances
}
function anyMovable(cur, dice) {
  return cur.tokens.some((p) => tokenTarget(p, dice) >= 0);
}
function move(s, token) {
  const turn = s.turnIndex;
  const cur = s.players[turn];
  const dice = s.dice;
  const target = tokenTarget(cur.tokens[token], dice);
  if (target < 0) throw new Error("illegal");
  cur.tokens[token] = target;
  if (target >= 1 && target <= 51) {
    const a = absIdx(cur.color, target);
    if (!SAFE.has(a)) {
      for (let pi = 0; pi < s.players.length; pi++) {
        if (pi === turn) continue;
        const pc = s.players[pi].color;
        for (let ti = 0; ti < 4; ti++) {
          const q = s.players[pi].tokens[ti];
          if (q >= 1 && q <= 51 && absIdx(pc, q) === a) s.players[pi].tokens[ti] = 0;
        }
      }
    }
  }
  if (cur.tokens.every((t) => t === 57)) {
    s.winner = turn;
    return;
  }
  const n = s.players.length;
  s.turnIndex = dice === 6 ? turn : (turn + 1) % n;
  s.dice = null;
}
function pass(s) {
  const cur = s.players[s.turnIndex];
  if (anyMovable(cur, s.dice)) throw new Error("you have a legal move");
  s.turnIndex = (s.turnIndex + 1) % s.players.length;
  s.dice = null;
}

// ── Fuzz: play random games; assert the invariant that a player only ever
// passes when they truly have no legal move, and flag "pass while holding a
// ring token" (which should be impossible).
function newGame(n) {
  return {
    players: Array.from({ length: n }, (_, i) => ({ color: i, tokens: [0, 0, 0, 0] })),
    turnIndex: 0,
    dice: null,
    winner: null,
  };
}

let passWithRing = 0;
let games = 0;
for (let g = 0; g < 20000; g++) {
  const n = 2 + (g % 3); // 2,3,4 players
  const s = newGame(n);
  let steps = 0;
  while (s.winner === null && steps < 4000) {
    steps++;
    const d = 1 + Math.floor(Math.random() * 6);
    roll(s, d);
    const cur = s.players[s.turnIndex];
    if (anyMovable(cur, s.dice)) {
      // pick a random legal token (mimic a player choosing)
      const legal = [0, 1, 2, 3].filter((t) => tokenTarget(cur.tokens[t], s.dice) >= 0);
      move(s, legal[Math.floor(Math.random() * legal.length)]);
    } else {
      // auto-pass path — check the invariant first
      const hasRing = cur.tokens.some((p) => p >= 1 && p <= 51);
      if (hasRing) {
        passWithRing++;
        console.log("BUG: pass while holding ring token", JSON.stringify(cur), "dice", s.dice);
      }
      pass(s);
    }
  }
  games++;
}
console.log(`games=${games}  passWithRing=${passWithRing}`);
