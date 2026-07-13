markdown_content = """# Gunjin Shōgi (Military Shogi) — Game Module Specification

This document details the gameplay, UI design, and backend rules matrix for implementing **Gunjin Shōgi** within the lounge platform registry (`src/games/registry.ts`). This game perfectly leverages server-authoritative RPC validation (`game_move`) paired with ephemeral Realtime Broadcasts for handling hidden state and the "fog-of-war" referee mechanics.

---

## 🎮 1. Gameplay Overview

Gunjin Shōgi is a classic two-player game of **imperfect information, strategy, and deception**. 

1. **Setup Phase:** Both players are presented with their half of the board. They secretly arrange their army of pieces (representing military ranks, specialists, and structural traps). The arrangement is hidden from the opponent—the opponent only sees blank tokens.
2. **Marching Phase:** Players alternate turns moving one piece at a time across valid grid lines to infiltrate enemy lines.
3. **Engagements (The Automated Referee):** When a player moves a piece onto an occupied enemy tile, a battle occurs. The **Supabase database acts as the secret referee**:
   - The `game_move` RPC evaluates the two hidden ranks.
   - The losing piece is removed from the Postgres state.
   - The winning piece survives on the tile, but **its true identity is never revealed to the losing player**.
4. **Victory Conditions:** A player wins instantly by:
   - Successfully occupying the opponent's **Headquarters (HQ)** tile with an eligible combat piece.
   - Eliminating all of the opponent's movable pieces, leaving them with no valid turns.

---

## 🎨 2. UI Design & Layout Integration

🎖️ Gunjin Shōgi: Visual Identity & ConceptDesign Paradigm: Modern Tactical / War Room Minimalism. A mix of crisp military UI overlays (radar grids, coordinate crosshairs) combined with rugged texture indicators (matte metals, stencil text layouts).The Psychological Vibe: Suspenseful, classified, and high-stakes. The theme should make players feel like they are looking at top-secret operations maps where a single wrong move triggers an ambush.🎨 Palette Breakdown (Hex Codes)Layer ElementColor NameHex CodeVisual Purpose / DescriptionPrimary BaseTrench Black#0F110CThe main absolute background. Deep, ink-dark matte surface.Surface ElementOutpost Drab#1B1E16Game board background, chat boxes, and control panel surfaces.Accent PrimaryTactical Olive#5D6B54Active player piece borders, path indicators, and ready buttons.Accent SecondaryIntel Amber#E2A032Highlights selected tiles, valid move tracks, and turn countdown timers.Alert/ClashSignal Orange#D75A38Used exclusively for combat engagement animations, explosions, and defeat triggers.Text PrimaryParchment Stencil#ECEAD9Off-white, low-strain tactical text for headers and status readouts.Text MutedClassified Grey#555C4EGrid coordinates ($A1, B3$), unrevealed tokens, and timestamp logs.🧱 UI Component Styling Guide1. The Game Pieces (Tokens)Instead of standard circular web chips, pieces should look like tactile, heavy rectangular blocks or military tags.Your Army: Dark iron backgrounds (#1B1E16) bounded by an active #5D6B54 border. The rank icons are stamped in #ECEAD9 (e.g., a crisp minimalist icon of a tank or dagger).The Enemy Army: Shrouded and unidentifiable. They feature a clean, low-opacity stencil crosshair or padlock stamped in #555C4E. No rank information is visible.Status Changes: When a piece is selected to move, its border pulses with glowing #E2A032 (Intel Amber).2. The Board Matrix (The War Map)The board grid doesn't use simple white panel borders. It is rendered like a topographic deployment zone.Grid Lines: Thin, semi-transparent dashed lines using #1B1E16 or dark olive.No-Man's-Land (The River Divider): A distinct horizontal section separating the two territories, accented with faded hazard-stripe patterns or a thick double border using #5D6B54.Headquarters (HQ Tiles): Two structural bracket targets styled onto the back row using the amber accent (#E2A032) to draw immediate focus to the win-condition target.3. Combat Broadcast FeedbackWhen your server-authoritative RPC executes a conflict resolution, the UI channels the raw data into an immediate theatrical event:The target grid square flashes intensely with #D75A38 (Signal Orange).A localized CRT-style static or radar sweeping vector overlay appears on the screen for 400ms.The losing piece's opacity sweeps down to zero, leaving behind either an empty tile or the unrevealed enemy token that defended its position.

### Board Layout Schema
### Component Design Elements
* **The Grid Canvas:** A 7x8 or 6x8 matrix matching the application's clean contrast borders.
* **Piece Visibility States:**
  * **Your Pieces:** Fully illuminated with clear icons and rank badges (e.g., *General*, *Spy*, *Landmine*).
  * **Opponent Pieces:** Muted, dark tokens marked with a subtle military crest or a cryptic marker (`?`), indicating presence but concealing identity.
* **Clash Feedback (Broadcast):** When an engagement occurs, the clients receive an ephemeral `Broadcast` payload triggering a brief localized combat animation (e.g., crosshairs or a smoke effect) over the target tile before updating to the post-battle state.

---

## 📜 3. Core Rules Matrix

To implement this securely in the backend, the Postgres functions must evaluate constraints based on piece hierarchy and movement properties.

### A. Piece Ranks & Abilities
Each player commands a set composition of pieces, each with strict operational constraints:

| Piece Name | Movement Range | Special Attributes |
| :--- | :--- | :--- |
| **General (High Command)** | 1 step (All directions) | Highest combat power; vulnerable *only* to the Spy. |
| **Officers / Infantry** | 1 step (All directions) | Standard combat tiers (Major, Captain, Lieutenant). |
| **Tank / Cavalry** | Up to 2 steps (Forward only) | Fast frontline attacker. |
| **Engineer (Sapper)** | Infinite straight steps | Can move along designated pathways/tracks indefinitely until blocked. Defuses Landmines. |
| **Spy** | 1 step (All directions) | Weakest rank, but instantly eliminates the highest enemy **General**. |
| **Landmine** | **Immobile (0 steps)** | Hidden trap. Mutually destroys any attacking unit except Engineers. |
| **Headquarters (HQ)** | **Immobile (0 steps)** | The final objective target flag. Placed on back-row base tiles. |

### B. Battle Resolution (RPC Referee Logic)
When an attack is registered via `game_move`, the database determines the outcome using the following internal precedence table:

[ Attacking Rank ] vs [ Defending Rank ]
│
├── Attacker > Defender   ──> Attacker wins. Target tile updated; defender deleted.
├── Attacker < Defender   ──> Defender wins. Attacker piece deleted.
├── Attacker == Defender  ──> Mutual Destruction. Both pieces deleted from board.
│
└── SPECIAL ENCOUNTERS:
├── Any Rank + Landmine  ──> Both pieces destroyed (except Engineer).
├── Engineer + Landmine  ──> Landmine cleared. Engineer occupies tile safely.
└── Spy + General        ──> General assassinated. Spy occupies tile safely.

### C. HQ Capture Rules
* The HQ flag is defenseless but can only be captured by a **mobile combat piece** (e.g., General, Major, Captain).
* Stationary pieces (Mines) or auxiliary/specialist units (Spies, Engineers) cannot capture the HQ; moving them into the HQ slot will result in an invalid move or unit loss depending on configuration preference.

---

## 🛠️ 4. Client Registry Integration (`src/games/registry.ts`)

To plug the game cleanly into the existing modular architecture:

```typescript
export const GunjinShogiModule: GameModule = {
  id: 'gunjin_shogi',
  name: 'Gunjin Shōgi',
  minParticipants: 2,
  maxParticipants: 2,
  initialState: () => ({
    board: Array(56).fill(null), // 7x8 grid positions
    phase: 'setup',             // 'setup' | 'playing' | 'finished'
    turn: null,
    winner: null,
  }),
  // Complements server-authoritative RPC endpoints
};
```