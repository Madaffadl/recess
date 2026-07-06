# Recess — Development Roadmap to Production Launch

> **Your enemy is not missing features. It's the empty room.**
> A "digital break room" you enter alone is dead on arrival. This roadmap optimizes for one thing above all: **reaching "it feels alive" as early and cheaply as possible, then concentrating real humans into the same place at the same time.** Features are secondary to presence.

Three release milestones (not six); the six phases feed them:

| Milestone | After Phase | Ships | Validates |
|---|---|---|---|
| **A — "It's Alive"** (closed beta) | 2 | Anonymous lounge + presence + room chat, **no game** | Will office workers show up on a break and talk? |
| **B — "Play Together"** (public beta) | 4 | One game (Connect Four) inside rooms | Does a shared activity create repeat visits? |
| **C — Public Launch** | 6 | Hardened, moderated, monitored | Can it survive strangers and scale? |

You can start learning at **Milestone A in ~6–8 weeks** with no game built.

Stack note: the repo already runs **Next.js 16 + React 19 + Tailwind v4 + Radix (shadcn-style)**, not Next 15. Stay there.

---

## 1. Product Vision

**Short term:** the fastest, lowest-friction way for coworkers to take a break *together* — open a tab, and within 10 seconds you're chatting or playing with someone. No download, no signup, no meeting invite.

**Long term:** Recess becomes the **ambient social layer for the workday**. The wedge is B2C-viral (one employee drops a room link in Slack); the durable business is **B2B team/culture plans**. "Discord for office break time" is the hook; **"the culture tool People-teams adopt because employees already use it"** is the moat.

**Recess is NOT** a productivity tool, a Slack/Teams competitor, a social network with profiles/feeds, or a full games platform. It is *downtime, made social.*

---

## 2. MVP Definition

The smallest thing that tests **"coworkers will return to a shared break space."**

### ✅ In scope
- **Anonymous identity** — random handle + avatar, persisted per-browser via Supabase anonymous session. No email/password/profile.
- **Global Anonymous Lounge** — realtime chat, live online count, presence, typing.
- **Rooms** — create, join (link/code), leave; public list + private (code); capacity; per-room presence + chat.
- **One game — Connect Four** — 2-player, server-authoritative, inside a room.
- **Discover page** — browse games; only Connect Four playable, rest "Coming soon".
- **Lean moderation** — rate limits, profanity blocklist, slow mode, report, admin kill-switch.
- **Instrumentation** — PostHog, Sentry, Vercel, Better Stack.

### ❌ Out of scope for MVP
Accounts/login/cross-device identity · profiles · multiple games / game framework · org spaces · SSO · voice/video · friends/DMs/follows · gamification · notifications · mobile apps · payments/premium · persistent chat history & search · AI moderation · i18n · light theme.

**Rule:** if it doesn't help someone show up, feel others are there, or come back tomorrow — it's not MVP.

---

## 3. Development Phases

**Velocity assumption:** 2-week sprints; build capacity ≈ **20 pts/sprint**, rising to **~24** once the Game Dev joins (Phase 3).
**Critical path:** Phase 1 overlaps Phase 2; Phase 5 (instrumentation) pulled forward and continuous.

### Phase 1 — Frontend Foundation & Design System
- **Goal:** turn "mostly-done UI" into a production-grade, data-ready frontend + formal design system + clean data seam.
- **Deliverables:** all screens complete & navigable; documented tokens/components; typed **data-access layer** (`lib/api`) mock today → Supabase tomorrow; loading/empty/error states; responsive + a11y.
- **Dependencies:** none. **Effort:** ~2 sprints.
- **Risks:** design gold-plating; unused components. **Mitigation:** freeze scope to existing pages.
- **Success:** mock→real only changes `lib/api`.

### Phase 2 — Realtime Infrastructure ("It's Alive") → **Milestone A**
- **Goal:** make Recess feel occupied.
- **Deliverables:** anonymous session bootstrap; global lounge channel (presence + online count + broadcast chat + typing); per-room chat; reconnect/backoff; **ephemeral messages** (Broadcast) + recent buffer.
- **Dependencies:** Phase 1 data layer; Supabase project. **Effort:** ~2 sprints.
- **Risks:** cost of persisting messages; global-channel hotspot. **Mitigation:** ephemeral-first (§6), rate limits day one.
- **Success:** 20 concurrent testers → accurate presence, <500ms delivery, typing, graceful reconnect. **Ship closed beta to 1–3 teams.**

### Phase 3 — The One Game: Connect Four
- **Goal:** validate a shared *activity* drives engagement, at minimum effort.
- **Deliverables:** server-authoritative Connect Four (match in room, alternating turns, server-validated moves + win/draw, rematch); spectator; state in Postgres via realtime.
- **Dependencies:** Phase 2 realtime; **Game Dev joins.** **Effort:** ~1.5–2 sprints.
- **Risks:** scope-creep into "games platform"; desync. **Mitigation:** hardcode one game, server authoritative.
- **Success:** two strangers finish a game, no desync/cheat; rematch rate measurable.

**→ Why Connect Four (analysis):**

| Candidate | Effort | Fun/retention | Anti-cheat | Verdict |
|---|---|---|---|---|
| Tic-Tac-Toe | Trivial | **Too low** — near-always draws | Trivial | ❌ **False negative** on retention |
| **Connect Four** | Trivial–Low | Good — zero learning, enough depth, sparks banter | Trivial (7×6 state, server-checked) | ✅ **Recommended** |
| Word Guess | Medium | Good, group-friendly | Medium | ⚠️ Fast-follow |
| Draw Together | **High** | **Highest/most viral** | Harder + image moderation | ⚠️ Second game |

**Recommendation: Connect Four** — as cheap to build as TTT but deep enough to replay (tests retention instead of poisoning it). Turn-based = no latency/physics engine (ideal for Supabase Realtime); tiny state = trivial server validation & anti-cheat.

### Phase 4 — Room System (+ Game Integration) → **Milestone B**
- **Goal:** rooms become the social container; the game lives inside.
- **Deliverables:** create/join/leave; public directory (live counts); private via unguessable code; **shareable invite links** (viral unit); host controls (start/kick); capacity + idle auto-expiry.
- **Dependencies:** Phases 2 & 3. **Effort:** ~2 sprints.
- **Risks:** room-state races; orphaned rooms. **Mitigation:** DB constraints + `expires_at` job.
- **Success:** create room → share in Slack → coworkers join & play <60s. **Ship public beta.**

### Phase 5 — Beta Instrumentation (continuous from Phase 2)
- **Goal:** turn usage into learning.
- **Deliverables:** PostHog (funnels, D1/D7 retention, replay), Sentry, Vercel Speed Insights, feedback widget + surveys, uptime.
- **Effort:** ~1 sprint net-new. **Risks:** flying blind if deferred; PII in replays. **Mitigation:** integrate early; mask inputs.
- **Success:** answer "do users come back tomorrow?" with data.

### Phase 6 — Production Hardening → **Milestone C**
- **Goal:** survive strangers, abuse, load.
- **Deliverables:** rate limiting (session+IP); Turnstile on session/room creation; profanity filter + slow mode; report→auto-mute; minimal mod dashboard + kill-switch/shadow-ban; RLS audit; alerting/on-call; staging + rollback; ToS/Privacy; load test.
- **Dependencies:** all prior. **Effort:** ~2 sprints.
- **Risks:** abuse ruining first impressions; connection floods. **Mitigation:** §7.
- **Success:** passes abuse red-team + load test; mean-time-to-mute <1 min.

---

## 4. Sprint Planning

Priorities: **P0** milestone-blocking · **P1** important · **P2** nice-to-have (cut first). Points = Fibonacci.

### Phase 1
**Sprint 1 — Data seam & screens** *(≈20 pts)* — typed `lib/api` (P0,5) · room detail + create + empty/loading/error (P0,5) · extract reusable components (P1,3) · responsive + a11y (P1,5) · route/nav audit (P0,2).
**Sprint 2 — Design system + Supabase groundwork** *(≈20 pts)* — document tokens/components (P1,5) · provision Supabase + CI + Vercel previews (P0,3) · anonymous session bootstrap (P0,5) · schema v1 + RLS skeleton (P0,5) · PostHog/Sentry SDKs (P1,2).

### Phase 2 → Milestone A
**Sprint 3 — Lounge realtime** *(≈20 pts)* — presence + online count (P0,5) · Broadcast chat + recent buffer (P0,8) · typing (P0,3) · reconnect/backoff + optimistic send (P0,5).
**Sprint 4 — Room chat + beta prep** *(≈18 pts)* — per-room chat + presence (P0,5) · basic rate limiting (P0,5) · PostHog core events (P0,3) · closed-beta onboarding + "3pm recess" (P1,3) · feedback widget (P1,2).

### Phase 3 (Game Dev joins, velocity ≈24)
**Sprint 5 — Connect Four core** *(≈21 pts)* — state model + server-validated moves via RPC (P0,8) · realtime propagation (P0,5) · board UI + turn/timer + win/draw (P0,5) · game funnel (P1,3).
**Sprint 6 — Polish & spectate** *(≈18 pts)* — rematch + game-over + disconnect handling (P0,8) · spectator (P2,5) · anti-cheat review (P0,3) · playtest + tuning (P1,2).

### Phase 4 → Milestone B
**Sprint 7 — Room lifecycle** *(≈22 pts)* — create/join/leave + capacity + race-safe joins (P0,8) · public directory + live counts (P0,5) · private rooms + codes (P0,5) · idle auto-expiry job (P1,3).
**Sprint 8 — Invites + game-in-room** *(≈20 pts)* — shareable invite links + join-by-link (P0,8) · launch Connect Four from room + host start (P0,5) · host kick (P1,3) · public-beta polish + share-to-Slack copy (P1,4).

### Phase 5
**Sprint 9 — Close the loop** *(≈16 pts)* — retention dashboards D1/D7 + funnels + masked replay (P0,5) · Sentry perf tracing (P0,3) · in-app surveys (P1,3) · Vercel Speed Insights + Supabase alerts (P1,2) · weekly learning review (P0,3).

### Phase 6 → Milestone C
**Sprint 10 — Abuse & moderation** *(≈22 pts)* — Turnstile + IP/session rate limits (P0,8) · blocklist + slow mode + caps (P0,5) · report→auto-mute + shadow-ban (P0,5) · minimal mod dashboard + kill-switch (P0,4).
**Sprint 11 — Launch readiness** *(≈20 pts)* — RLS audit + pen-test + secret hygiene (P0,5) · load test + fix hotspots (P0,8) · staging + rollback + on-call alerting (P0,5) · ToS/Privacy + abuse contact (P0,2).

**Calendar:** ~11 sprints ≈ 22 weeks worst-case. Optimize for **milestones, not the calendar** — closed beta (~week 8) is where real learning starts.

---

## 5. Database Planning

**Principle:** persist as little as possible. **Presence & lounge chat are ephemeral** (Realtime memory, not Postgres).

| Entity | Key fields | Notes |
|---|---|---|
| **profile** (anon) | `id`(=auth.uid), `handle`, `avatar_seed`, `created_at`, `last_seen_at` | Anonymous Supabase user. |
| **room** | `id`, `code`(unique), `name`, `game_type`, `visibility`, `host_id→profile`, `capacity`, `status`, `created_at`, `expires_at` | Directory filters public+open. |
| **room_member** | `room_id→room`, `profile_id→profile`, `role`, `joined_at` | *Optional* — start Presence-only. |
| **game_session** | `id`, `room_id→room`, `game_type`, `state`(jsonb), `status`, `winner_id→profile`, `started_at`, `ended_at` | **Source of truth.** |
| **game_move** | `id`, `game_session_id→game_session`, `profile_id→profile`, `ply`, `move`(jsonb), `created_at` | Optional; audit/anti-cheat/replay. |
| **report** | `id`, `target_type`, `target_ref`, `reporter_id→profile`, `reason`, `created_at`, `status` | Moderation. |
| **feedback** | `id`, `profile_id→profile`, `rating`, `message`, `context`(jsonb), `created_at` | Complements PostHog. |
| **moderation_action** | `id`, `actor`, `profile_id`, `action`, `until`, `reason`, `created_at` | Enforced at write + realtime. |

**Relationships:** `profile 1—* room`; `profile 1—* game_session`; `room 1—* game_session`; `game_session 1—* game_move`; `profile 1—* report/feedback/moderation_action`.

**NOT tables:** presence/online count/typing (Realtime Presence); lounge chat (Broadcast); analytics (PostHog).

**RLS:** default-deny; game writes only via `SECURITY DEFINER` RPC (clients never write `game_session.state`).

---

## 6. Realtime Architecture

| Concern | Mechanism | Decision |
|---|---|---|
| **Presence** | **Realtime Presence** | Ephemeral, auto-cleaned. Never in Postgres. |
| **Chat** | **Broadcast** | Ephemeral, low-latency, **no DB hit**. Small recent-message buffer. Cheaper + less moderation liability. |
| **Game state** | **Postgres (authoritative) + Postgres Changes** | Move → RPC/Edge Fn validates → writes state → subscribers update. Clients render only from server state. |

**Room sync:** one channel per room (presence+chat); game via Postgres Changes on `game_session`; host actions via RPC.
**Scalability:** Broadcast > Postgres Changes for chat; global lounge is a hotspot (MVP one channel, plan sharding); edge rate-limit before Realtime; cap concurrent connections; idempotent reconnect re-syncs game state from Postgres.

---

## 7. Security Plan

Anonymity is the magic **and** the biggest existential risk. First-class but lean.

| Risk | Vectors | Solutions (MVP) |
|---|---|---|
| **Anonymous abuse** | Harassment, NSFW, hate, instant ban-evasion | Persistent anon token + IP fingerprint; slow mode; report→**auto-mute at threshold**; shadow-ban; kill-switch; consider Turnstile-gating the global lounge. |
| **Spam/flooding** | Message/link spam, connection floods, bots | Rate limits (per session+IP); **Turnstile** on session/room creation; duplicate + length caps; edge throttling. |
| **Cheating** | Forged moves, illegal state | **Server-authoritative** RPC validation; clients can't write state; audit trail. |
| **Moderation gaps** | Missed reports, burnout | Minimal mod dashboard (one-click mute/ban/lock); automated thresholds first line. |
| **Data/legal** | IP is PII; UGC | Default-deny RLS; ephemeral chat minimizes UGC; ToS/Privacy; masked replay; defer Draw Together (image moderation). |
| **Workplace trust** | Doxxing/leaks in anonymous space | Clear norms on entry; no persistent history; steer social to self-selected rooms. |

**Non-negotiable before public traffic:** RLS everywhere, Turnstile on creation, rate limits live, kill-switch tested, blocklist+report+auto-mute working.

---

## 8. Production Readiness Checklist

**Security & abuse:** RLS default-deny; game writes via validated RPC only · Turnstile on session+room creation · rate limiting (session+IP) · blocklist + slow mode + caps · report→auto-mute + shadow-ban + kill-switch tested · secrets in env; dependency scan.
**Reliability & performance:** load test at target concurrency · realtime reconnection verified + game re-syncs from DB · idle-room cleanup running · Vercel + Supabase alerts + uptime/status page · staging + rollback.
**Observability:** Sentry (frontend + serverless) + release tagging · PostHog funnels + D1/D7 + masked replay · dashboards (concurrency, error rate, p95, retention).
**Product & legal:** empty/loading/error states + mobile pass · onboarding communicates "how to feel alive" · ToS, Privacy, cookie/PII notice, abuse contact · launch comms + a concentration event.

---

## 9. Future Roadmap (post-launch, by business impact)

1. **Office Communities / Team Spaces** *(highest impact — first)* — private/persistent/branded per-company spaces + team invites. Fixes cold-start **and** unlocks B2B revenue. First justified use of light auth (magic link/SSO).
2. **Additional Games** *(highest retention)* — build game framework (after one game works) + **Draw Together** + Word Guess.
3. **Gamification** *(engagement multiplier)* — streaks, light leaderboards, seasonal events. After games exist.
4. **Premium SaaS** *(revenue — last)* — team plans: admin/moderation, branded rooms, culture analytics, SSO. Monetize the org, not the individual.

> Team Spaces leads (fixes cold-start + unlocks revenue). Games drive retention. Gamification amplifies. Premium harvests.

---

## 10. Founder Recommendations (brutally practical)

**❌ Don't build yet:** accounts/auth/profiles · "games platform"/engine before one game works · multiple games/matchmaking/ELO/voice/video/mobile/notifications/friends/DMs/payments/i18n/AI moderation · persistent chat history.

**🎭 Distractions:** design gold-plating · microservices / custom realtime infra (**Supabase is enough**) · over-modeling the DB · SEO perfection before the loop is fun · a "dream moderation console" instead of rate-limits+blocklist+kill-switch.

**☠️ What can kill it:**
1. **The empty room (cold-start)** — the #1 killer; engineer concentration of presence.
2. **Toxicity on first contact** — ship rate-limits+report+kill-switch before public traffic.
3. **Workplace blocking / cultural risk** — position as a team break/culture tool; bottoms-up.
4. **No retention loop** — instrument D1/D7 from day one.
5. **Over-building before learning.**

**🚀 Prioritize for adoption:**
1. **The 10-second "alive" moment** — land → see people online → be in a conversation.
2. **Zero-friction entry** — no signup, ever, for MVP.
3. **The shareable room link = your viral loop.** Make sharing & joining effortless.
4. **Beat cold-start with a scheduled ritual** — a daily "3 PM Recess"; seed early sessions with your own team.
5. **Land teams, not users.** One enthusiastic 20-person team daily > 2,000 one-time visitors.

**One sentence to run the company by:** *Get one real team to show up together on their break, feel it's alive, and come back tomorrow — then build outward from that.*
