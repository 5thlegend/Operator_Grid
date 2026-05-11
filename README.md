# NRO · Operator Core + Signal Map v0.1

The first two operational slices of the **Next Realm Operating System** — an operator dossier and a cinematic tactical influence map for the operator network.

> Builders don't post. Operators deploy.

This is **NRO**: command-center UI, ranked operator grid, live deployment radar pings on a fullscreen Mapbox war map, public dossiers with shareable HUD cards, rank-up cinematic overlays. Designed to evolve past IndiePage into a *living tactical face* for the Next Realm operator civilization.

## Two modules in this build

### 1. Operator Core
- Public dossiers at `/u/[handle]` with rank, XP, momentum, streak, projects, deployment log
- Magic-link auth → onboarding (callsign + city) → command deck
- Log deployments by kind (iteration / ship / milestone / launch) with weighted XP
- Project registry per operator
- HUD-styled OG images for every profile and deployment

### 2. Signal Map
- `/grid` is a **fullscreen tactical Mapbox map** (`dark-v11` style + grid + scanlines + vignette)
- Operator nodes pulse and glow, sized by **Signal Score** (0–10), tier-tinted (cyan ↑ gold for COMMANDER+)
- **Influence radius** glow rings projected per operator
- **Realtime radar-ping deployment pulses** colored by kind (cyan/cyan/violet/gold)
- **Left tactical feed** streams `[DEPLOY]` `[ASCENSION]` `[SIGNAL]` events live
- **Right rankings panel** sorted by Signal Score
- **Top command header** + **bottom telemetry bar** (UTC clock, network XP, top signal)
- **Rank Ascension overlay** — full-screen Framer burst when an operator levels up
- List-view fallback at `/grid/list` for low-bandwidth or no-token scenarios

---

## What it is

- **Operator Dossiers** at `/u/[handle]` — public profile, deployment log, project registry, rank progression
- **The Grid** at `/grid` — momentum-ranked leaderboard (XP earned in last 14 days, half-life decay) + live global deployment feed
- **Command Deck** at `/command` — private dashboard to log deployments, manage projects, edit dossier
- **Five-tier rank system**: INITIATE → OPERATOR → ARCHITECT → COMMANDER → SOVEREIGN
- **Four deployment kinds** with weighted XP: iteration (10), ship (25), milestone (50), launch (100)
- **Streak counter** — consecutive-day deployment streak shown on every profile
- **Cinematic OG cards** — every profile and deployment generates a HUD-style share image
- **Live realtime ticker** via Supabase Realtime — the network's pulse on every page that matters

## Stack

- **Next.js 16** (App Router, server actions)
- **React 19**
- **Tailwind v4** (CSS-first config in `globals.css`)
- **Supabase** — auth (magic link), Postgres, Realtime, Storage
- **Mapbox GL** via `react-map-gl/mapbox` — Signal Map renderer
- **Zustand** — client store for the live grid (operators, pulses, feed, ascension)
- **Cloudflare Pages** via `@opennextjs/cloudflare`
- **TypeScript** strict
- **Lucide** + **Motion** (Framer)

Deploys to **`nextrealm-operators.pages.dev`**.

> ⚠ **Project must live OUTSIDE OneDrive.** OneDrive's file watcher deadlocks `npm install` (ENOTEMPTY rmdir). Keep this repo at `C:\dev\NextRealmOperators` or any non-synced path on Windows.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Supabase

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Copy your project URL and anon key to `.env.local`:

```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
```

3. Open the Supabase **SQL Editor** and run, in order:
   - [`supabase/schema.sql`](supabase/schema.sql) — base tables, enums, RLS, XP trigger, realtime publication
   - [`supabase/schema_signal_map.sql`](supabase/schema_signal_map.sql) — Signal Map columns, ascensions table, signal-score function, extended trigger
4. In **Authentication → URL Configuration**, set:
   - Site URL: `http://localhost:3000` (local) or `https://nextrealm-operators.pages.dev` (prod)
   - Redirect URLs: add both
5. (Optional) In **Authentication → Email Templates**, customize the magic-link email subject to match the NRO tone.

### 2b. Mapbox (Signal Map)

1. Create a free account at [mapbox.com](https://account.mapbox.com/).
2. Copy your **public** access token to `.env.local`:

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
```

The token only needs `mapbox.places` (geocode) + `mapbox.tiles` (style) scopes. Without a token, `/grid` shows an offline notice and `/grid/list` still works.

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Deploy to Cloudflare Pages

```bash
npm run deploy
```

This runs `opennextjs-cloudflare build` then `opennextjs-cloudflare deploy`. First-time setup needs `wrangler login`.

For production, set environment variables in the Cloudflare Pages dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL=https://nextrealm-operators.pages.dev`

---

## Architecture

### Routes

| Route | Purpose |
|---|---|
| `/` | Landing — hero, manifesto, live ticker, top-momentum operators |
| `/login` | Magic-link sign-in |
| `/auth/callback` | Supabase OAuth/magic-link callback |
| `/onboarding` | Forge callsign + initial dossier |
| `/grid` | **Signal Map** — fullscreen tactical map with realtime pulses |
| `/grid/list` | Rankings + feed list view (no Mapbox required) |
| `/u/[handle]` | Public operator dossier |
| `/u/[handle]/d/[id]` | Deployment permalink with broadcast tools |
| `/command` | Private command deck |
| `/command/deploy` | Log a new deployment |
| `/command/projects` | Project registry CRUD |
| `/command/profile` | Edit dossier |
| `/api/og/operator/[handle]` | Generated OG image for profile |
| `/api/og/deployment/[id]` | Generated OG image for deployment |

### Data model

- **`operators`** — 1:1 with `auth.users`. Handle is permanent. Tracks `xp`, `momentum`, `streak_days`, `last_deployment_at`, `rank`.
- **`projects`** — Owned by an operator. Slug unique per operator.
- **`deployments`** — The build-in-public log. `kind` determines XP. Optionally linked to a project.
- **`xp_log`** — Audit trail of every XP delta.

### Triggers

`on_deployment_insert` fires before insert: stamps `xp_awarded` from kind, updates operator's `xp`, recomputes rank, increments or resets streak, updates `last_deployment_at`. Records an `xp_log` row.

`on_deployment_after_insert` recomputes momentum (sum of XP from deployments in last 14 days).

### Momentum

Two flavors:
- **Stored** — server of record. Sum of `xp_awarded` from last 14 days. Updated on every deployment.
- **Decay-weighted (client preview)** — `src/lib/momentum.ts` computes a half-life-decayed score for previews. Not persisted.

### RLS

All tables: public read, owner-only write. The XP-awarding trigger runs `security definer` so writes via the trigger bypass RLS for the system tables it touches.

---

## Folder layout

```
src/
├─ app/
│  ├─ page.tsx                      Landing
│  ├─ globals.css                   Tailwind v4 theme
│  ├─ layout.tsx                    Root layout, fonts
│  ├─ login/                        Magic-link auth
│  ├─ auth/callback/route.ts        Supabase callback
│  ├─ onboarding/                   First-time dossier
│  ├─ grid/                         Public leaderboard + feed
│  ├─ u/[handle]/                   Public operator dossier
│  │  └─ d/[id]/                    Deployment permalink
│  ├─ command/                      Private command deck
│  │  ├─ deploy/
│  │  ├─ projects/
│  │  └─ profile/
│  └─ api/og/                       OG image generation
│     ├─ operator/[handle]/
│     └─ deployment/[id]/
├─ components/
│  ├─ hud/                          Panel, Stat (HUD primitives)
│  ├─ nav.tsx
│  ├─ grid-overlay.tsx
│  ├─ rank-badge.tsx
│  ├─ kind-badge.tsx
│  ├─ rank-progress.tsx
│  ├─ operator-avatar.tsx
│  ├─ deployment-card.tsx
│  ├─ activity-ticker.tsx
│  └─ share-button.tsx
├─ lib/
│  ├─ db.ts                         Supabase Database type
│  ├─ types.ts                      Domain types
│  ├─ supabase/                     Browser/server/middleware clients
│  ├─ xp.ts                         XP table — single source w/ schema.sql
│  ├─ ranks.ts                      Rank tiers, thresholds, colors
│  ├─ momentum.ts                   Decay-weighted score (preview)
│  ├─ utils.ts
│  └─ constants.ts
└─ middleware.ts                    Auth gate for /command, /onboarding
```

---

## Design language

- **Black/graphite/steel** base. Subtle glow accents.
- **Arctic cyan `#67e8f9`** primary signal.
- **Gold `#fbbf24`** reserved for COMMANDER / SOVEREIGN tiers — earned, not given.
- **Space Grotesk** display, **JetBrains Mono** for stats and HUD labels, **Inter** for body.
- HUD elements: hairline corner brackets, scanline veil, grid overlay, monospace stat blocks.
- Inspired by Linear, Arc, Destiny UI, Cyberpunk terminals, and elite military command software. Zero generic SaaS feel.

---

## Integration with the Next Realm OS

This module is a **standalone slice** but designed to plug into the larger Next Realm Operating System later:

- All operator data lives in Supabase under a clean schema — easy to import/sync.
- No tight couplings; every cross-module concern goes through Supabase.
- Realtime channels are namespaced (`nro:deployments:ticker`) so other modules can subscribe.
- `@/lib/db.ts` is the canonical type surface and can be re-exported by the parent OS.

---

## Roadmap (post v0.1)

- **Signal Routes** — animated relationship/collab lines between operator nodes
- **Sector aggregation** — city-rollup tooltips at low zoom (e.g. "Los Angeles · 18 ops · 42 deploys today")
- **Audio architecture** for ascension events
- **Auto-generated ascension share cards**
- Operator codename verification (X / GitHub link claim)
- Project deployment timelines (per-project filtered feed)
- Webhook intake (`/api/intake`) — log deployments from CI on every push
- Quests + sigils (limited-time XP events)
- Voice-of-the-network — daily best-deployment digest
- Folding the Operator Core into the full **Next Realm OS** harness

---

NEXT REALM INTERACTIVE · OPERATOR CORE v0.1
