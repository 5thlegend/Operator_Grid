# NRO ↔ NROS Federation Manifest

> How `nextrealm-operators.dankpenta.workers.dev` (this repo) federates with `nextrealmos.pages.dev` (`NROS_KERNEL`).

## 🛡 Sovereign Realm Directive (LOCKED)

> **Operator Grid is being federated into NROS. Do NOT rebuild Operator Grid. Do NOT convert it into NROS.**
>
> Operator Grid remains sovereign and acts as:
> - civilization surface layer
> - public signal network
> - operator visibility system
> - influence map
> - deployment visualization layer
>
> Integrate ONLY:
> 1. Federation SDK
> 2. Universal operator auth
> 3. Event emission hooks
> 4. XP synchronization
> 5. Mission synchronization
> 6. Realm registration
>
> Do NOT alter the tactical identity or core architecture.
> Operator Grid consumes NROS infrastructure while remaining an independent realm.

This directive supersedes the earlier "Federation (Option A)" vs "Sub-mount" vs "Merge" discussion. Federation is chosen, sovereignty is preserved.

## Status of the 6 integration items

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Federation SDK | ✅ LIVE | `worker/nros.js` — `makeNros(env)` factory + `nrosMirrorOperator` + `nrosCheckCallsign` proxies in `worker/worker.js`. |
| 2 | Universal operator auth | ✅ LIVE | Every OG signup mirrors to NROS via `POST /api/federation/operators` (callsign + email_hash). Real-time availability across realms via `GET /api/federation/operators/check`. Login UI surfaces "ONE CALLSIGN · FEDERATION-WIDE". |
| 3 | Event emission hooks | ✅ LIVE | `worker/app.js` `TX.*` shapes + `broadcastNros()` + `/api/nros/broadcast` Worker proxy. Wired on onboarding/deploy/rank-up/guild-forge. |
| 4 | XP synchronization | ⚠️ partial | Embedded in `MISSION_COMPLETED` metadata. Need explicit `xp.award()` call too. |
| 5 | Mission synchronization | ❌ pending | NROS has `missions` table; NRO needs a consumer + `MISSION_ACCEPTED` event. |
| 6 | Realm registration | ✅ LIVE | NRO registered as realm `nro-operator-core` (id `3cafbc13-9347-4304-8c22-d376787c3830`, status ACTIVE) on `nextrealmos.pages.dev`. `NROS_API_KEY` set as Worker secret. |

---

## TL;DR

NROS_KERNEL is the **canonical Next Realm OS** — Next.js 15 dashboard at `nextrealmos.pages.dev` with auth, operator profiles, ranks, **squads** (= our guilds), **missions** (= our deployments, kinda), workflows, transmissions, **realms** (federation table), and an AI provider abstraction (Anthropic/OpenAI/Cloudflare).

NRO is a **cinematic visualization layer** for the operator network — Signal Map, live deployment ticker, share-card permalinks, AI advisor, gaming-grade UI — shipped as a single Cloudflare Worker SPA for speed.

The cleanest fit: **NRO registers itself as a Realm in NROS via `@nros/sdk`**, uses the canonical NROS identity (callsigns + ranks + auth), and broadcasts transmissions back. NROS already designed for this exact pattern.

---

## Schema concept mapping

| NRO (this repo)                       | NROS_KERNEL (parent)                  | Canonical owner |
|---|---|---|
| `operators` table                     | `operator_profiles` table              | **NROS**        |
| `operators.handle`                    | `operator_profiles.callsign` (citext)  | **NROS**        |
| `operators.rank` (5 tiers)            | `operator_profiles.rank_id` → `ranks` table (6 tiers) | **NROS** |
| `operators.xp`                        | `operator_profiles.xp` + `xp_logs`     | **NROS**        |
| `operators.{momentum, signal_score, streak_days}` | NEW — added to operator_profiles by NRO | **NRO contributes** |
| `operators.{lat, lng, city, state, location}` | NEW — geo fields              | **NRO contributes** |
| `operators.link_{site,x,github,youtube,tiktok,instagram,linkedin,discord,farcaster,producthunt,substack,telegram}` | NEW — 12 social columns | **NRO contributes** |
| `guilds` table                        | `squads` table                         | **NROS**        |
| `guild_members` table                 | `squad_members` table                  | **NROS**        |
| `guilds.color, sigil`                 | `squads.banner_url, motto` (mostly different fields) | **NRO contributes color + sigil** |
| `deployments` table                   | Closest analog: `mission_progress` events; or a new `operator_activity` log | **NROS** (new table needed) |
| `projects` table                      | NEW — operator-owned product registry  | **NROS** (new table needed) |
| `ascensions` table                    | Derivable from `xp_logs` + rank tier transitions | **NROS** (derive) |
| `xp_log` (NRO's audit table)          | `xp_logs` (NROS canonical)             | **NROS**        |

### Rank tier reconciliation

**NRO ships 5 tiers:** INITIATE → OPERATOR → ARCHITECT → COMMANDER → SOVEREIGN
**NROS ships 6 tiers:** INITIATE → OPERATOR → **VANGUARD** → ARCHITECT → **WARDEN** → SOVEREIGN

**Recommendation:** Migrate NRO to the 6-tier system. Adds two intermediate tiers (VANGUARD between OPERATOR and ARCHITECT, WARDEN between ARCHITECT and SOVEREIGN). XP thresholds remap cleanly:

```
INITIATE   0
OPERATOR   250
VANGUARD   600   ← new
ARCHITECT  1500
WARDEN     5000  ← new (renames NRO's COMMANDER)
SOVEREIGN  12000
```

Change set in NRO: `src/lib/ranks.ts` + `worker/app.js` `RANKS` const + Postgres `rank_for_xp()` function (in `schema.sql`). One commit.

---

## Three integration strategies

### Option A — **Federation (recommended)** 🟢

NRO stays at its own URL. It registers as a Realm in NROS. Communicates via `@nros/sdk`. NROS remains the source of truth for identity + XP.

**Pros:**
- Zero downtime, both apps keep their URLs
- NROS's `realms` table + `@nros/sdk` were literally designed for this
- Independent deploy cycles
- NRO's CF Worker stays fast (no Next.js dependency)
- Federation pattern scales — when you launch a 3rd Next Realm app (Holy Za, Sanctum 0, etc.), it plugs in the same way

**How:**
1. In NROS, register a new Realm:
   ```
   slug: "operator-grid"
   name: "Operator Grid"
   base_url: "https://nextrealm-operators.dankpenta.workers.dev"
   owner_operator_id: <your NROS profile id>
   ```
2. NROS issues an API key for this realm.
3. NRO worker imports `@nros/sdk` (or implements its fetch shape directly — it's edge-safe by design).
4. NRO broadcasts events back to NROS:
   - On deploy: `nros.transmissions.push({ kind: "MISSION_COMPLETED", title: <deployment title>, operator_callsign: <handle>, metadata: { kind, xp_awarded, signal_score } })`
   - On rank-up: `nros.transmissions.push({ kind: "RANK_CHANGED", ... })`
   - On guild create: `nros.transmissions.push({ kind: "CUSTOM", title: "Guild forged", metadata: { sigil, color } })`
5. NROS awards canonical XP via `nros.xp.award({ callsign, delta, reason })`.
6. NRO's auth: accept the same Supabase auth.users session — both apps point at the SAME Supabase project. Single sign-on for free.
7. Top nav of each app cross-links the other.

**Migration window:** A few days. No data migration required; NRO's local tables (`operators`, `guilds`, etc.) become a *projection* of NROS state. Long-term, NRO drops its own tables and reads/writes through NROS REST.

### Option B — **Sub-mount (medium)** 🟡

NROS adds `/grid` and `/u/[handle]` and `/guild/[slug]` routes that proxy to the NRO Worker. NROS becomes the host page; NRO renders inside.

**Pros:** Single domain. SEO consolidates.
**Cons:** Cross-origin friction (iframe or proxy). NRO loses control of its own routing. Cloudflare proxy adds latency.

Not recommended unless you decide nextrealmos.pages.dev MUST own the URL.

### Option C — **Merge (heavy)** 🔴

Port NRO's UI into NROS's Next.js codebase. Delete this repo.

**Pros:** Single codebase.
**Cons:** Loses NRO's Worker speed and CDN delivery. Months of re-engineering. NRO's Preact-via-CDN architecture doesn't map to NROS's React 19 SSR. Big tax.

Not recommended.

---

## Recommended path: **Option A** in 4 phases

### Phase 1 — Schema reconciliation (1-2 hrs)
**Goal:** Make NRO's data shape compatible with NROS's expectations.

- [ ] Update NRO's `rank` enum + thresholds to NROS's 6-tier system
- [ ] Rename NRO's `guilds` → `squads` (or add an alias view)
- [ ] Add `nros_realm_id` and `nros_synced_at` columns to NRO's `operators` table
- [ ] Document that NRO's `handle` ≡ NROS's `callsign`

### Phase 2 — Realm registration + SDK wiring (2-3 hrs)
**Goal:** NRO can talk to NROS.

- [ ] Register NRO as a realm via NROS dashboard or `realms` insert
- [ ] Store the issued API key as Worker secret: `NROS_API_KEY`
- [ ] Store NROS coordination URL: `NROS_BASE_URL=https://nextrealmos.pages.dev`
- [ ] Embed `@nros/sdk` (vendored, since it's edge-safe) at `worker/nros.js`
- [ ] On every NRO write (deploy, rank-up, guild-create), fire-and-forget a transmission to NROS

### Phase 3 — Shared identity (1 hr)
**Goal:** Sign in once, present everywhere.

- [ ] Both apps point at the same Supabase project (already true — single tenant)
- [ ] On NRO's `/login`, the Supabase JWT carries `auth.uid()` that NROS also recognizes
- [ ] First-time NRO signups call `nros.operators.upsert({ callsign, ... })` so they appear in the canonical NROS leaderboard
- [ ] If a user already exists in NROS, NRO mirrors their callsign + rank instead of generating a new one

### Phase 4 — Cross-app navigation (30 min)
**Goal:** Operators feel one ecosystem.

- [ ] Add `// NROS DASHBOARD ↗` chip in NRO's nav, links to `nextrealmos.pages.dev/operator`
- [ ] In NROS, the operator profile page links out to `nextrealm-operators.dankpenta.workers.dev/u/[callsign]` ("View on Operator Grid")
- [ ] In NROS, the squad page links out to `/guild/[slug]` on NRO
- [ ] Shared favicon family + color tokens so the user's brain reads them as one product

---

## Architectural decisions that survived analysis

These NRO design choices fit NROS cleanly — no changes needed:

- **Cloudflare Worker SPA** for NRO — runs on the same Cloudflare account as `nextrealmos.pages.dev`. Edge-collocated. Free.
- **Single-file Preact + esm.sh** — fast, zero build, no maintenance burden when NROS rebuilds.
- **Supabase as backing store** — already the canonical NROS DB. NRO just uses subset tables.
- **Mapbox for tactical map** — NROS has no map; NRO can be *the* map UI for the whole ecosystem.
- **Workers AI for the Coach** — same provider abstraction NROS uses (`ai_provider` enum already includes 'cloudflare' in NROS).

## NRO additions that NROS should adopt

These NRO concepts don't exist in NROS yet but are GOOD additions:

- **Signal Score** (0-10 normalized) — beats raw XP for public-facing rankings
- **Momentum** (14-day decayed XP) — recency-weighted, prevents stale leaders
- **Streak system** — daily-deployment counter, addictive
- **Influence radius on map** — gives operators visual real estate
- **12-platform social fields** — way beyond NROS's current avatar-only profile
- **Guild color + sigil** — NROS's squads only have `banner_url + motto`; color + sigil are much more shareable
- **Per-route OG cards rendered as SVG** in the Worker — zero-dep share previews

Schema PRs to NROS:
```sql
-- Add to NROS operator_profiles
alter table operator_profiles
  add column momentum integer not null default 0,
  add column signal_score numeric(6,2) not null default 0,
  add column streak_days integer not null default 0,
  add column lat double precision,
  add column lng double precision,
  add column city text,
  add column state text,
  add column link_x text,
  add column link_youtube text,
  -- ... 12 social columns
  ;

-- Add to NROS squads
alter table squads
  add column color text default '#7c5cff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  add column sigil text default '◈';
```

---

## What to do tomorrow

1. **Decide.** Federation (Option A) is the recommendation. Confirm or redirect.
2. If confirmed:
   - Run NROS dashboard → register `operator-grid` as a realm
   - Drop the resulting API key into chat
   - I wire `@nros/sdk` into the Worker, push the four event types (`OPERATOR_JOINED`, `MISSION_COMPLETED`/deploy, `RANK_CHANGED`, custom `GUILD_FORGED`), and add the cross-nav chip
   - Total time: ~3 hours of my driving

3. If you want NRO to **subsume** NROS instead (i.e. NRO becomes the primary, NROS gets retired or absorbed):
   - Different conversation — that's a "rebrand the canonical OS" decision, not an integration decision

---

## Files in this repo that map to NROS

| NRO file | NROS analog | Action on integration |
|---|---|---|
| `supabase/schema.sql` | `supabase/migrations/0001_kernel_init.sql` | Merge — NRO's additions become a migration in NROS |
| `supabase/schema_signal_map.sql` | none yet | New NROS migration `0004_signal_map.sql` |
| `supabase/schema_guilds.sql` | NROS already has squads — drop, send a migration that adds `color` + `sigil` to NROS squads instead |
| `worker/app.js` | n/a | Stays as the Operator Grid SPA |
| `worker/worker.js` | n/a | Stays as the Worker |
| `src/` (legacy Next.js implementation) | This is what NROS would absorb if we ever do Option C | Archive, don't sync |

---

*This document is the contract for how NRO plugs into NROS. Update on every architectural change.*
