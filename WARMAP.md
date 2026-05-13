# NRO Signal Map · War-Map Evolution Roadmap (v2 — Scale Edition)

User references:
- **Call of Duty: Vanguard Front Battle** — territory control, troop counts per region, faction bar, strategic-territories panel
- **Axis & Allies world board** — unit pieces per region, supply routes, central turn-state wheel
- **Dispensary map (2026-05)** — categorized markers (cyan vs gold-cart "premium"), density-rich but legible, geographic context preserved
- **Square Enix / Nexon war maps** — heraldic faction banners, multi-layer toggles, hierarchical zoom, time-state visualization

Design constraint: must scale from 9 operators (today) → 1000+ (target) → 100,000+ (long-game) without turning into spaghetti.

---

## Tier 0 — Shipped (live at `/grid` now)

- ✅ Mapbox dark tactical base (`dark-v11`) + grid overlay + scanline veil + vignette
- ✅ **Rank-glyph operator markers** (INITIATE ring → OPERATOR hex → ARCHITECT diamond → COMMANDER shield → SOVEREIGN crown)
- ✅ Marker size scales with `signal_score`; baseline floor so zero-signal INITIATEs are still readable
- ✅ Persistent handle labels on top-3 by signal (war-map leaderboard at a glance)
- ✅ **Guild territory polygons** via convex hull of member positions, 5% outward buffer
- ✅ **Guild connection web** — full mesh between same-guild operators, glow + core line pair
- ✅ **Faction banners** at guild centroids — Mapbox symbol layer rendering `sigil  NAME  ·  count`, halo'd against base
- ✅ **Faction summary chips** top-center — gradient pills with stacked stats
- ✅ **Featured-operator badge** — small gold `$` overlay top-right of any operator with featured projects earning $50k+ combined (echoes user's "premium dispensary" gold-cart icons)
- ✅ **Layer Control rail** top-left — toggle OPS / FACTIONS / LINKS / PULSES / HEAT
- ✅ **Activity heatmap layer** (toggleable) — Mapbox heatmap of last-7-day deployments weighted by `pulse_strength`, gradient cyan→violet→gold→red
- ✅ **Spotlight mode** — click any operator → flyTo + dim non-allied + show stats card
- ✅ **Realtime radar-ping pulses** colored by deployment kind
- ✅ **Rank Ascension cinematic overlay** (full-screen burst on rank-up)
- ✅ Side panels: left tactical feed, right rankings, bottom telemetry, top command header
- ✅ Loading curtain + cinematic empty states with CTAs

---

## Tier 1 — Density (kicks in around 30 operators)

### Marker clustering
Beyond ~30 markers the map blurs together. Implement zoom-based clustering:
- **Zoom < 4**: only faction banners + heatmap visible. Individual operators hidden.
- **Zoom 4–6**: cluster operators into grid cells (~1° lat/lng). Each cluster = a single badge showing count + dominant guild color. Click expands.
- **Zoom 6–8**: smaller cells (~0.25°). Mixed clusters + individuals.
- **Zoom > 8**: individual operators, all rank-glyphs visible.

Implementation: lightweight grid-bucket algorithm client-side (no need for Supercluster at our scale tier). Mapbox 3.x has `cluster: true` on GeoJSON sources but markers are DOM not GL — we'd write our own.

### Marker variants
Visual encoding levels (echoes the dispensary reference's icon+color+cart-overlay vocabulary):
- **Base color** = guild color (or rank fallback)
- **Glyph shape** = rank tier
- **Size** = signal score
- **Featured badge** = ≥$50k featured-project revenue (✅ shipped)
- **NEW: SOVEREIGN crown halo** = animated rotating sigil ring around the operator's glyph
- **NEW: Streak ember** = subtle gold tendril emerging from the marker for streak ≥ 7d
- **NEW: Active-now indicator** = pulse ring around operators who deployed in last 60min

### LOD (Level Of Detail) for connection lines
At 1000 ops the full-mesh guild web becomes 10,000+ lines. Strategy:
- Only render lines between operators in the **viewport** + a 20% padding ring
- Above 50 lines per guild, switch to "spoke from centroid" mode (every member connects to guild center)
- Above 200 lines, hide individual lines and rely on territory polygon + banner

---

## Tier 2 — Strategic surfaces

### Sector grid overlay
Divide the contiguous USA into ~24 hex/region sectors (e.g. `A-1` through `D-7`). Reference Axis & Allies board's index labels.

For each sector compute:
- Operator count
- Dominant guild (highest combined signal of ops inside)
- Sector tint = dominant guild color at 4% opacity (neutral when empty)

Implementation: Mapbox `fill-extrusion` layer with one polygon per sector. Hover → tooltip shows sector code + ops + dominant guild + recent deploys.

### Strategic territories panel (right rail)
CoD-style persistent UI on the right of the map:

```
// STRATEGIC OBJECTIVES
SECTOR A-1 · BAY AREA
  +10% momentum bonus     CONTROL: ◈ NEXT REALM
SECTOR M-3 · MANHATTAN
  +7% follower boost      CONTROL: contested
SECTOR Q-7 · AUSTIN HUB
  +5% recruitment         CONTROL: ⬢ ARCHITECTS
```

Click → flies the map to that sector + highlights its boundary.

### Territory takeover dynamics
For each sector, the guild with the highest combined signal "controls" that sector. Visual:
- Controlled sector outline becomes thick + solid in the controlling guild's color
- Sector fill bumps to 12% opacity in guild color
- "Capture pulse" animation when control changes (radar ring from sector centroid)
- Daily/weekly "battle resolution" tick recomputes controls; emits `[TERRITORY] NEXT REALM captured Sector A-3 from THE ARCHITECTS` to the tactical feed

### Battle Mode toggle
Direct port of the Call of Duty Vanguard reference. A `// BATTLE MODE` button in the command header that:
- Switches base style from `dark-v11` to `satellite-streets-v12` with heavy terrain tint + grain filter
- Operator markers become unit-piece icons (chess-style)
- Connection lines become animated dashes flowing in direction of "supply" (highest-signal member → others)
- One-click flip back to standard tactical view

---

## Tier 3 — Time + intelligence

### Time scrubber (bottom edge)
A draggable timeline along the bottom of the map showing the past 30 days. Drag to replay network history — operators appear, deployments fire, ranks ascend in order. End at "now" to live-tail. Pause/play controls. Speed multiplier.

Implementation: pre-fetch all `deployments` + `ascensions` ordered by `created_at` once, then replay client-side. Mapbox handles position interpolation.

### Mini-map (bottom-right corner)
Small overview of the entire USA showing your current viewport as a rectangle. Click anywhere → main map flies there. Useful when zoomed in.

### AI-driven sector intelligence
Cloudflare Workers AI (already wired for AI Coach + AI Assess) generates per-sector intel briefs:
- *"Sector M-3 heating up — 14 ships in 7 days, 3 from THE ARCHITECTS"*
- *"NEXT REALM territory in Pacific Northwest now indefensible — only 1 active operator vs ARCHITECTS' 4"*
- *"@stormcaster on streak day 18, momentum trending +52% MoM — flag for COMMANDER ascension watch"*

Briefs surface in the tactical feed every ~6 hours OR on-demand via a "QUERY INTEL" button in the strategic territories panel.

### Mission objective markers
When NROS federates and exposes its `missions` table to NRO:
- Active missions appear as hexagonal beacon markers at their geographic context (or floating if global)
- Color: T1=cyan, T2=violet, T3=gold, T4=crimson, T5=white
- Click → mission card with brief, XP reward, accept button
- Accept fires `MISSION_ACCEPTED` transmission back to NROS

---

## Tier 4 — Network effects

### Recruit lineage rendering
When an operator is spotlighted, render a glowing trace line back to their `recruited_by` operator (the recruiter). Cascade visible — `@a recruited @b who recruited @c`. The genealogy tree on the map.

### Project user-flow lines
Render thin glowing trails from a project's HQ marker to user concentrations (when project users are also operators on the grid). E.g. Sentinel OS (Seattle, $1.85M MRR) → faint lines to every Sentinel customer that's also an NRO operator.

### Public Intelligence Layer indicators
Every cold visitor to `/grid` sees:
- A pulse counter top-right: `+3 OPERATORS ONLINE NOW`
- Last 5 deployments scrolling across the bottom right above the telemetry bar
- "JOIN THE GRID" sticky CTA in the corner (auto-hides for authed)

---

## Tier 5 — World-scale

When NRO graduates from USA to global:
- Multi-continent base map
- Hexagonal tile system (H3 from Uber) for sector grid worldwide
- Time-zone band overlay showing where operators are currently active (UTC+1 ↔ +14)
- Localized faction colors by region (e.g. Asia-Pacific factions get distinct palette range)
- Continental capitals as objective markers
- Trade routes between continents drawn as great-circle arcs

---

## Recommended next commit

Tier 1 **marker clustering** is the biggest scale unlock. Once any single city has > 8 operators, the current rendering tangles. Building a 60-line grid-bucket clusterer + an "expand cluster" interaction would carry us to 1000+ operators cleanly. ETA: 2 hours of focused work, no schema changes.

After that, **Tier 2 sector grid** + **Tier 2 territory takeover** are the highest-impact game-mechanic adds. They make the map an actual strategy surface where operators' geographic choices matter.

---

*Update this file whenever the war-map gets new layers.*
