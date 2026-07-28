export const UNO_ID = "uno";

export type CardColor = "red" | "green" | "blue" | "yellow";
export type CardType =
  | "number"
  | "skip"
  | "reverse"
  | "draw_two"
  | "wild"
  | "wild_draw_four";

export type UnoGame = {
  /** Remaining deck — index 0 is the next card to draw. */
  drawPile: string[];
  /** Play history — index 0 is the most recently played card. */
  discardPile: string[];
  /** Active color (may differ from discard[0] after a Wild). */
  currentColor: CardColor;
  currentType: CardType;
  /** Null for all non-number card types. */
  currentValue: number | null;
  /** Each player's hand, keyed by seat number as a string ("1", "2", …). */
  hands: Record<string, string[]>;
  /** 1 = clockwise, -1 = counter-clockwise. */
  direction: 1 | -1;
  /** Accumulated draw penalty waiting for the next player to resolve. */
  pendingDraw: number;
  /** Last action — used by the board for display only, not for game logic. */
  lastEvent: {
    seat: number;
    type: string;
    card: string | null;
    chosenColor: CardColor | null;
    drewCards: string[];
  };
  /**
   * Written by game_draw. true = player drew a playable card and turn is
   * kept; a second draw is blocked server-side. Absent after _uno_apply_move
   * rebuilds game state — game_draw reads it via coalesce so absence = false.
   */
  drawnThisTurn?: boolean;
  /** Seat number that has declared UNO, or null. Set by game_uno_declare. */
  unoDeclared: number | null;
};

export type ParsedCard = {
  color: CardColor | null;
  type: CardType;
  value: number | null;
};

/** Client-side mirror of the SQL _uno_parse_card helper. */
export function parseCard(card: string): ParsedCard | null {
  if (card === "W")   return { color: null, type: "wild",           value: null };
  if (card === "WD4") return { color: null, type: "wild_draw_four", value: null };

  const colorMap: Record<string, CardColor> = {
    R: "red", G: "green", B: "blue", Y: "yellow",
  };
  const color = colorMap[card[0]];
  if (!color) return null;

  const suffix = card.slice(1);
  if (suffix === "S")  return { color, type: "skip",     value: null };
  if (suffix === "R")  return { color, type: "reverse",  value: null };
  if (suffix === "D2") return { color, type: "draw_two", value: null };

  const value = parseInt(suffix, 10);
  if (isNaN(value)) return null;
  return { color, type: "number", value };
}

/** Returns true if card can legally be played given the current discard top. */
export function canPlayCard(
  card: string,
  currentColor: CardColor,
  currentType: CardType,
  currentValue: number | null,
): boolean {
  const parsed = parseCard(card);
  if (!parsed) return false;

  // Wild and Wild Draw Four are always playable
  if (parsed.type === "wild" || parsed.type === "wild_draw_four") return true;

  // All coloured cards: same colour always works
  if (parsed.color === currentColor) return true;

  // Same number (any colour)
  if (parsed.type === "number") {
    return currentType === "number" && currentValue !== null && parsed.value === currentValue;
  }

  // Same action type: Skip-on-Skip, Reverse-on-Reverse, Draw-Two-on-Draw-Two
  return parsed.type === currentType;
}
