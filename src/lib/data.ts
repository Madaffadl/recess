import {
  Globe2,
  Grid3x3,
  Layers,
  Palette,
  Type,
  Brain,
  Dice5,
  Puzzle,
  HelpCircle,
  Keyboard,
  CircleDot,
  Worm,
  Shield,
  type LucideIcon,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Games                                                             */
/* ------------------------------------------------------------------ */

export const GAME_CATEGORIES = [
  "All",
  "Trivia",
  "Puzzle",
  "Word",
  "Creative",
  "Cards",
  "Casual",
] as const;

export type GameCategory = (typeof GAME_CATEGORIES)[number];

export type SpotlightConfig = {
  theme: {
    bg: string;
    border: string;
    accent: string;
    accentText?: string;
    heading: string;
    body: string;
    pillBg: string;
    pillBorder: string;
    pillText: string;
    footerText: string;
    footerBorder: string;
  };
  badges?: string[];
  cta: string;
  href: string;
  tagline: string;
  description?: string;
};

export type Game = {
  id: string;
  name: string;
  category: Exclude<GameCategory, "All">;
  players: number;
  emoji: string;
  icon: LucideIcon;
  isNew?: boolean;
  blurb: string;
  spotlight?: SpotlightConfig;
};

export const GAMES: Game[] = [
  {
    id: "uno",
    name: "UNO",
    category: "Cards",
    players: 0,
    emoji: "🃏",
    icon: Layers,
    isNew: true,
    blurb: "Match colors and numbers, play action cards, and be the first to empty your hand.",
  },
  {
    id: "connect-four",
    name: "Connect Four",
    category: "Casual",
    players: 64,
    emoji: "🔴",
    icon: CircleDot,
    isNew: true,
    blurb: "Drop, line up four, and outsmart a coworker. The first live game.",
  },
  {
    id: "word-snake",
    name: "Word Snake",
    category: "Word",
    players: 0,
    emoji: "🐍",
    icon: Worm,
    isNew: true,
    blurb: "Chain words, outsmart coworkers. One letter at a time.",
  },
  {
    id: "military-zone",
    name: "Military Zone",
    category: "Puzzle",
    players: 0,
    emoji: "🎖️",
    icon: Shield,
    isNew: true,
    blurb: "Place your fleet in secret, then hunt down every enemy ship before they find yours.",
    spotlight: {
      theme: {
        bg: "#050F1C",
        border: "#0F3050",
        accent: "#00E59A",
        accentText: "#050F1C",
        heading: "#8FBCD4",
        body: "#2A6090",
        pillBg: "#091828",
        pillBorder: "#0F3050",
        pillText: "#8FBCD4",
        footerText: "#2A6090",
        footerBorder: "#0F3050",
      },
      badges: ["CARRIER", "BATTLESHIP", "DESTROYER", "SUBMARINE", "PATROL"],
      cta: "DEPLOY →",
      href: "/rooms?game=military-zone",
      tagline: "NAVAL STRATEGY · 2 PLAYERS · LIVE MULTIPLAYER · 10s PER SALVO",
      description:
        "A two-player naval strategy game. Hide your fleet on a 10×10 grid, then hunt down every enemy vessel before they find yours. 10 seconds per salvo — no hesitation allowed.",
    },
  },
  {
    id: "geo-challenge",
    name: "Geo Challenge",
    category: "Trivia",
    players: 128,
    emoji: "🌎",
    icon: Globe2,
    isNew: true,
    blurb: "Explore real street view, then drop a pin. Score by how close you guess.",
  },
  {
    id: "draw-together",
    name: "Draw Together",
    category: "Creative",
    players: 213,
    emoji: "🎨",
    icon: Palette,
    isNew: true,
    blurb: "Sketch, guess, and laugh. No art skills required.",
  },
  {
    id: "ludo",
    name: "Ludo",
    category: "Casual",
    players: 0,
    emoji: "🎲",
    icon: Dice5,
    isNew: true,
    blurb: "Roll the die, race four tokens home, and send rivals back to start. 2–4 players.",
    spotlight: {
      theme: {
        bg: "#0d2a1c",
        border: "#1b5e3a",
        accent: "#e7b23f",
        accentText: "#0d2a1c",
        heading: "#a8e6c0",
        body: "#2d7a4f",
        pillBg: "#0a1f14",
        pillBorder: "#1b5e3a",
        pillText: "#a8e6c0",
        footerText: "#2d7a4f",
        footerBorder: "#1b5e3a",
      },
      badges: ["RED", "GREEN", "YELLOW", "BLUE"],
      cta: "ROLL DICE →",
      href: "/rooms?game=ludo",
      tagline: "CLASSIC BOARD GAME · 2–4 PLAYERS · LIVE MULTIPLAYER · DICE & STRATEGY",
      description:
        "Roll the die, race all four tokens from yard to home, and send rivals back to start. Land on a 6 to move out of base and earn an extra turn. Last team standing wins.",
    },
  },
  {
    id: "sudoku-arena",
    name: "Sudoku Arena",
    category: "Puzzle",
    players: 86,
    emoji: "🔢",
    icon: Grid3x3,
    blurb: "Race the grid. Classic logic against live opponents.",
  },
  {
    id: "word-clash",
    name: "Word Clash",
    category: "Word",
    players: 154,
    emoji: "🔤",
    icon: Type,
    blurb: "Build longer words faster than your coworkers.",
  },
  {
    id: "memory-battle",
    name: "Memory Battle",
    category: "Cards",
    players: 61,
    emoji: "🧠",
    icon: Brain,
    isNew: true,
    blurb: "Flip, match, and remember. Best of three wins.",
  },
  {
    id: "dice-royale",
    name: "Dice Royale",
    category: "Casual",
    players: 97,
    emoji: "🎲",
    icon: Dice5,
    blurb: "Push your luck in quick, friendly dice duels.",
  },
  {
    id: "trivia-night",
    name: "Trivia Night",
    category: "Trivia",
    players: 142,
    emoji: "❓",
    icon: HelpCircle,
    blurb: "Team trivia across pop culture, tech, and history.",
  },
  {
    id: "puzzle-rush",
    name: "Puzzle Rush",
    category: "Puzzle",
    players: 73,
    emoji: "🧩",
    icon: Puzzle,
    isNew: true,
    blurb: "Solve as many puzzles as you can before the clock.",
  },
  {
    id: "type-racer",
    name: "Type Racer",
    category: "Casual",
    players: 118,
    emoji: "⌨️",
    icon: Keyboard,
    blurb: "Sprint to the finish line, one keystroke at a time.",
  },
];

export const POPULAR_GAMES = [...GAMES].sort((a, b) => b.players - a.players);
export const NEW_GAMES = GAMES.filter((g) => g.isNew);
/** The most recently added game that has a spotlight config. */
export const SPOTLIGHT_GAME = GAMES.filter((g) => g.spotlight).at(-1) ?? null;
export const RECENTLY_PLAYED = [
  "military-zone",
  "geo-challenge",
  "draw-together",
  "word-clash",
  "dice-royale",
]
  .map((id) => GAMES.find((g) => g.id === id))
  .filter((g): g is Game => Boolean(g));

/* ------------------------------------------------------------------ */
/*  Rooms — the main place coworkers interact                         */
/* ------------------------------------------------------------------ */

export type RoomStatus = "live" | "filling up" | "open" | "closed";

export type Room = {
  id: string;
  title: string;
  /** Which game this room plays — looked up in the game registry. */
  gameId: string;
  gameName: string;
  gameEmoji: string;
  host: string;
  participants: string[];
  capacity: number;
  visibility: "public" | "private";
  category: Exclude<GameCategory, "All">;
  status: RoomStatus;
  /** Shareable invite code. Present on DB rooms; absent on mock rooms. */
  inviteCode?: string;
  /** Live occupancy from DB. Falls back to participants.length for mock rooms. */
  currentCount?: number;
  /** Stable auth id of the room's creator; drives host-only controls. */
  hostId?: string;
};

export const ROOMS: Room[] = [
  {
    id: "connect-four-corner",
    title: "Connect Four Corner",
    gameId: "connect-four",
    gameName: "Connect Four",
    gameEmoji: "🔴",
    host: "CoffeeWizard",
    participants: ["CoffeeWizard", "Nadia"],
    capacity: 2,
    visibility: "public",
    category: "Casual",
    status: "open",
  },
  {
    id: "four-in-a-row-lunch",
    title: "Four in a Row @ Lunch",
    gameId: "connect-four",
    gameName: "Connect Four",
    gameEmoji: "🔴",
    host: "SnackGremlin",
    participants: ["SnackGremlin"],
    capacity: 2,
    visibility: "public",
    category: "Casual",
    status: "open",
  },
  {
    id: "coffee-break-trivia",
    title: "Coffee Break Trivia",
    gameId: "trivia-night",
    gameName: "Trivia Night",
    gameEmoji: "☕",
    host: "CoffeeWizard",
    participants: [
      "CoffeeWizard",
      "Nadia",
      "Leo",
      "Mia",
      "InboxZero",
      "TabHoarder",
      "Kevin",
      "Sarah",
    ],
    capacity: 10,
    visibility: "public",
    category: "Trivia",
    status: "live",
  },
  {
    id: "geo-challenge-id",
    title: "Geo Challenge Indonesia",
    gameId: "geo-challenge",
    gameName: "Geo Challenge",
    gameEmoji: "🌎",
    host: "TabHoarder",
    participants: ["TabHoarder", "SilentIntern", "Rendra", "Tara", "Bima"],
    capacity: 8,
    visibility: "public",
    category: "Trivia",
    status: "filling up",
  },
  {
    id: "lunch-doodles",
    title: "Lunch Doodles",
    gameId: "draw-together",
    gameName: "Draw Together",
    gameEmoji: "🎨",
    host: "LunchBreakHero",
    participants: [
      "LunchBreakHero",
      "PixelPusher",
      "Mia",
      "Leo",
      "Bima",
      "Aisha",
      "DeskPlantDad",
      "Tara",
      "Nadia",
      "Kevin",
      "Sarah",
      "Daffa",
    ],
    capacity: 16,
    visibility: "public",
    category: "Creative",
    status: "live",
  },
  {
    id: "ludo-lounge",
    title: "Ludo Lounge",
    gameId: "ludo",
    gameName: "Ludo",
    gameEmoji: "🎲",
    host: "SnackGremlin",
    participants: ["SnackGremlin", "Nadia"],
    capacity: 4,
    visibility: "public",
    category: "Casual",
    status: "open",
  },
  {
    id: "sudoku-sprint",
    title: "Sudoku Sprint",
    gameId: "sudoku-arena",
    gameName: "Sudoku Arena",
    gameEmoji: "🔢",
    host: "SilentIntern",
    participants: ["SilentIntern", "SpreadsheetSage", "QuietQuitter"],
    capacity: 6,
    visibility: "public",
    category: "Puzzle",
    status: "open",
  },
  {
    id: "slump-club",
    title: "3PM Slump Club",
    gameId: "dice-royale",
    gameName: "Dice Royale",
    gameEmoji: "🎲",
    host: "MeetingSurvivor",
    participants: [
      "MeetingSurvivor",
      "SnackGremlin",
      "Kevin",
      "Rendra",
      "Mia",
      "InboxZero",
    ],
    capacity: 8,
    visibility: "public",
    category: "Casual",
    status: "filling up",
  },
  {
    id: "design-only",
    title: "Design Team Only",
    gameId: "word-clash",
    gameName: "Word Clash",
    gameEmoji: "🔤",
    host: "PixelPusher",
    participants: ["PixelPusher", "Tara", "DeskPlantDad", "Aisha"],
    capacity: 6,
    visibility: "private",
    category: "Word",
    status: "live",
  },
  {
    id: "memory-masters",
    title: "Memory Masters",
    gameId: "memory-battle",
    gameName: "Memory Battle",
    gameEmoji: "🧠",
    host: "KeyboardNinja",
    participants: ["KeyboardNinja", "InboxZero", "QuietQuitter", "Sarah"],
    capacity: 6,
    visibility: "private",
    category: "Cards",
    status: "open",
  },
  {
    id: "type-racer-lunch",
    title: "Type Racer Lunch",
    gameId: "type-racer",
    gameName: "Type Racer",
    gameEmoji: "⌨️",
    host: "SnackGremlin",
    participants: [
      "SnackGremlin",
      "Daffa",
      "Rendra",
      "Leo",
      "Nadia",
      "Bima",
      "Tara",
    ],
    capacity: 10,
    visibility: "public",
    category: "Casual",
    status: "filling up",
  },
];

/* ------------------------------------------------------------------ */
/*  Activity (dashboard preview + room detail)                        */
/* ------------------------------------------------------------------ */

export type ActivityItem = {
  id: string;
  user: string;
  action: string;
  target: string;
};

export const ACTIVITY_SEED: ActivityItem[] = [
  { id: "a1", user: "Sarah", action: "solved Sudoku in", target: "2:41" },
  { id: "a2", user: "Daffa", action: "joined", target: "Draw Together" },
  { id: "a3", user: "Kevin", action: "won a round of", target: "Word Clash" },
];

/* ------------------------------------------------------------------ */
/*  Anonymous Lounge — chat                                           */
/* ------------------------------------------------------------------ */

export type ChatMessage = {
  id: string;
  user: string;
  text: string;
  time?: string;
  self?: boolean;
};

export const CHAT_SEED: ChatMessage[] = [
  {
    id: "m1",
    user: "KeyboardNinja",
    text: "morning all ☕ who's around today?",
    time: "12:02 PM",
  },
  {
    id: "m2",
    user: "CoffeeWizard",
    text: "Anyone starting a room?",
    time: "12:05 PM",
  },
  {
    id: "m3",
    user: "CoffeeWizard",
    text: "I've got 20 mins before my next call",
    time: "12:05 PM",
  },
  {
    id: "m4",
    user: "SilentIntern",
    text: "Need 2 more players for Geo Challenge.",
    time: "12:09 PM",
  },
  {
    id: "m5",
    user: "DeskPlantDad",
    text: "starting a Draw Together room in 5 ⏳",
    time: "12:12 PM",
  },
  {
    id: "m6",
    user: "LunchBreakHero",
    text: "45 mins until freedom.",
    time: "12:14 PM",
  },
  {
    id: "m7",
    user: "TabHoarder",
    text: "gg, that last trivia round was rough 😅",
    time: "12:17 PM",
  },
  {
    id: "m8",
    user: "SpreadsheetSage",
    text: "Down for a quick round after this call.",
    time: "12:19 PM",
  },
];

export const CHAT_USERS = [
  "CoffeeWizard",
  "KeyboardNinja",
  "LunchBreakHero",
  "SilentIntern",
  "MeetingSurvivor",
  "DeskPlantDad",
  "SpreadsheetSage",
  "PixelPusher",
  "TabHoarder",
  "SnackGremlin",
  "InboxZero",
  "QuietQuitter",
];

/** Pick a random display handle from the CHAT_USERS pool. */
export function randomHandle(): string {
  return CHAT_USERS[Math.floor(Math.random() * CHAT_USERS.length)];
}

export const CHAT_LINES = [
  "anyone up for a quick round?",
  "coffee break, brb",
  "who's in for Geo Challenge?",
  "need 1 more for Draw Together",
  "starting a room in 5",
  "back-to-back meetings today, send help",
  "lunch then games?",
  "gg everyone, that was close",
  "quiet afternoon — perfect for a match",
  "someone teach me Sudoku pls",
  "45 mins until freedom",
  "joining the slump club room",
];

/* ------------------------------------------------------------------ */
/*  About — FAQ                                                       */
/* ------------------------------------------------------------------ */

export const FAQS = [
  {
    q: "What exactly is Recess?",
    a: "Recess is a shared break room for coworkers. When you have downtime, you can drop into quick multiplayer games, join rooms, and chat anonymously — all in one place, right in your browser.",
  },
  {
    q: "Is the lounge really anonymous?",
    a: "Yes. In the Anonymous Lounge you're given a random handle like CoffeeWizard. Coworkers see the handle, not your name — so it's easy to be social without the pressure of your job title.",
  },
  {
    q: "Do I need to download or install anything?",
    a: "No. Recess runs entirely in the browser. Open a tab, jump into a room, and close it when your break is over.",
  },
  {
    q: "Does it work for remote and hybrid teams?",
    a: "Absolutely. Recess is designed for distributed teams — it gives remote coworkers the same casual, low-stakes hangout that an in-office break room would.",
  },
  {
    q: "How much does Recess cost?",
    a: "Recess is free for individuals to try. Team plans with admin controls and private rooms are coming soon.",
  },
  {
    q: "Can we add it to Slack or self-host?",
    a: "A Slack presence integration and self-hosting options are on the roadmap. Reach out below and we'll keep you posted.",
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Initials from a username, e.g. "CoffeeWizard" -> "CW", "Daffa" -> "DA". */
export function initials(name: string): string {
  const caps = name.replace(/[^A-Za-z]/g, "").match(/[A-Z]/g);
  if (caps && caps.length >= 2) return (caps[0] + caps[1]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Current wall-clock time as a short label, e.g. "3:47 PM" (client-only). */
export function timeLabel(date: Date = new Date()): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
