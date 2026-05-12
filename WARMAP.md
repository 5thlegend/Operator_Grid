# NRO Signal Map · War-Map Evolution Roadmap

Inspired by user references:
- **Call of Duty: Vanguard Front Battle** (territory control, troop counts per region, faction summary bar, strategic territories panel with mills/forges/castles)
- **Axis & Allies-style hex/region war board** (detailed unit positions, supply routes, regional borders, central turn-state wheel)

## Shipped already (live now)

- ✅ Mapbox dark tactical base layer (`dark-v11`) + grid overlay + scanline veil + vignette
- ✅ Operator nodes — pulse + glow ring + center dot, sized by `signal_score + rank`, colored by `guild.color` when allied
- ✅ Guild territory polygons — soft fill (7% opacity) + dashed stroke (45%) in guild color
- ✅ **Guild connection lines (supply-route web)** — full mesh between same-guild operators, 1px core + 5px blurred glow per line
- ✅ **Faction summary bar** — top-center HUD chips with sigil + name + Σsignal + Σmomentum + member count
- ✅ Realtime radar-ping deployment pulses (color by deployment kind)
- ✅ Left tactical feed ([DEPLOY] [ASCENSION] [SIGNAL] events)
- ✅ Right rankings panel (signal-sorted)
- ✅ Bottom telemetry bar (UTC clock, network XP, top signal, last event)
- ✅ Rank Ascension cinematic overlay (full-screen burst on rank-up)
- ✅ Cinematic empty-state when zero operators
- ✅ 8 seed operators + 2 guilds populating the map

## Phase 1 — Rank-glyph markers (1-2 hrs)

Replace the generic "pulse + dot + ring" with a rank-shape glyph:

| Rank | Shape |
|---|---|
| INITIATE | Faint outline circle |
| OPERATOR | Filled hexagon |
| ARCHITECT | Filled diamond + halo |
| COMMANDER | Filled shield outline |
| SOVEREIGN | Hex + crown + double-ring |

Inline SVG inside each `<Marker>`. Guild color drives outer halo; rank color drives the glyph fill.

## Phase 2 — Sector grid overlay (3-4 hrs)

Divide the contiguous USA into ~25 hex/sector regions (`A-1` through `D-7`). For each:
- Number of operators inside
- Dominant guild (highest combined signal)
- Sector tint = dominant guild color at 4% opacity

Mapbox fill layer with one polygon per sector. Hover → tooltip with sector code + ops + dominant guild.

3-5 sectors are **strategic territories** with bonus signal multipliers — operators inside earn 10% momentum bonus.

## Phase 3 — Territory takeover dynamics (4-6 hrs)

The guild with the highest combined signal in a sector "controls" it:
- Sector outline → thick + solid in guild color
- Fill → 12% opacity in guild color
- Capture pulse animation on control change
- `[TERRITORY] NEXT REALM captured Sector A-3 from THE ARCHITECTS` events

## Phase 4 — Strategic objectives panel (~2 hrs)

Right-side persistent UI like CoD's:
```
// STRATEGIC OBJECTIVES
SECTOR A-1 · BAY AREA       +10% momentum     CONTROL: ◈ NEXT REALM
SECTOR M-3 · MANHATTAN      +7% follower      CONTROL: contested
SECTOR Q-7 · AUSTIN HUB     +5% recruitment   CONTROL: ⬢ ARCHITECTS
```

Click → fly map to sector + highlight boundary.

## Phase 5 — Time-of-day fog (~1 hr)

Subtle CSS gradient tinted by UTC hour. Day = wash, night = deep blue. Adds "world ticks" feel.

## Phase 6 — Battle Mode toggle (~3-4 hrs)

`// BATTLE MODE` button in header swaps map style from `dark-v11` to `satellite-streets-v12` with terrain tint + grain filter. Operator markers become unit pieces. Connection lines animate as flowing supply dashes. Closest direct port of the CoD Vanguard reference.

## Phase 7 — HUD card on marker click (~2 hrs)

Click an operator marker → opens a HUD overlay panel on the map showing avatar, rank, guild, last 3 deployments, mini-stats. ENGAGE button → dossier. FORM ALLIANCE button → invite to your guild if you're a founder.

## Phase 8 — Deployment heatmap layer (~1-2 hrs)

Mapbox `heatmap` rendering all deployments from last 7 days, weighted by `pulse_strength`. Hotter regions = more shipping activity. Visualizes momentum as physical heat across the country.

---

## Out of scope for the war-map track

- 3D terrain pitch — fights marker legibility
- Animated unit figurines — too literal, fights cinematic minimalism
- Interactive day/night cycle — Phase 5 fog is enough
- Global map — defer until USA-focused v0.1 saturates

## Recommended order

**Phase 1 → 8 → 2 → 3 → 4** is the optimal sequence:

1. Rank glyphs (immediate cinematic delta, low effort)
2. Heatmap (gives spatial intensity without new schema)
3. Sector grid (introduces the gaming spatial layer)
4. Territory takeover (gameplay loop emerges)
5. Strategic objectives panel (closes the loop with rewards)

Phase 6 (Battle Mode) is the visual climax — save it as the "Demo Day" reveal.

---

*Update this file whenever the war-map gets new layers.*
