# 🎮 Recess

**Take a break. Stay connected.**

Recess is the digital break room for coworkers — one calm place to play quick
multiplayer games, drop into rooms, and chat anonymously during downtime.

The interface is **~70% modern SaaS, ~30% retro nostalgia** — think
_Linear · Notion · Arc · Discord_ with subtle retro personality expressed
through typography, not stickers.

## ✨ Design principles

- **Quiet, mature UI** — flat cards, generous whitespace, no floating decor or
  neon explosions.
- **Minimal color** — amber is reserved for the primary CTA and active nav;
  green is only for status. Everything else is neutral.
- **Retro through typography** — a pixel wordmark with a blinking terminal
  cursor, monospace "terminal" status badges, and a vintage amber/green palette.

## 🗺 Pages

| Route            | What it does                                                            |
| ---------------- | ----------------------------------------------------------------------- |
| `/`              | Hero, a single clean dashboard preview, and the **Anonymous Lounge**    |
| `/discover`      | Browse games — search, category filters, popular / new / recently played |
| `/rooms`         | The main hangout — create, filter (public/private + category), and join rooms |
| `/rooms/[id]`    | Room detail — participants, live chat, and activity feed                |
| `/about`         | Story, mission, why it exists, FAQ, and a contact form                  |

Recess is built around three pillars — **Games, Rooms, and Anonymous Chat**.
Rooms are the main place coworkers interact.

**Anonymous Lounge** (the highlight): a messenger-style chat (WhatsApp / Discord
/ Slack feel) — left/right bubbles, consecutive-message grouping, a live typing
indicator, subtle timestamps, an online count, and a composer with an emoji
picker, enter-to-send, an auto-growing textarea, and a character limit. The same
chat powers each room. Everything is interactive; game engines and auth are
intentionally mocked.

## 🧱 Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack) + React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui-style components (Radix primitives: dialog, accordion, tabs, …)
- [Motion](https://motion.dev) (Framer Motion) for restrained animation
- [lucide-react](https://lucide.dev) icons

## 🎨 Palette

| Token       | Value                   |
| ----------- | ----------------------- |
| Background  | `#0B0D12`               |
| Card        | `#12151D`               |
| Border      | `rgba(255,255,255,0.08)`|
| Primary     | `#F59E0B` (amber)       |
| Accent      | `#22C55E` (green)       |
| Text        | `#F8FAFC` / `#94A3B8`   |

## 🚀 Getting started

```bash
npm install
npm run dev      # http://localhost:3000

npm run build    # production build
npm start        # serve the production build
```

## 🗂 Structure

```
src/
├── app/
│   ├── layout.tsx            # fonts, metadata, shared shell (nav + footer)
│   ├── page.tsx              # homepage (65/35 grid)
│   ├── globals.css           # design tokens + quiet utilities
│   ├── discover/page.tsx
│   ├── rooms/                # rooms-context, list page, [id] detail
│   └── about/page.tsx
├── components/
│   ├── navbar.tsx            # sticky, route-aware
│   ├── hero.tsx              # headline + CTAs + dashboard preview
│   ├── dashboard-preview.tsx # single Arc-style preview card
│   ├── anonymous-lounge.tsx  # ⭐ the always-on anonymous chat sidebar
│   ├── chat-message.tsx · chat-composer.tsx  # messenger-style chat pieces
│   ├── game-card.tsx · room-card.tsx · page-shell.tsx · logo.tsx …
│   └── ui/                   # shadcn/ui base components
├── hooks/use-count-up.ts
└── lib/{data.ts, utils.ts}   # mock data + cn()
```

> All content is mock/client-side data — the chat, counters, and rooms are
> functional simulations, with no backend required.
