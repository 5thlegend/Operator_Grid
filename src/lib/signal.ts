// Signal Map formulas. Mirror of Postgres functions in supabase/schema_signal_map.sql.
// Use these for client-side previews and rendering decisions; the server-of-record values
// come from Postgres triggers.

import type { DeploymentKind, RankTier } from "@/lib/types";

export const PULSE_STRENGTH: Record<DeploymentKind, number> = {
  iteration: 1,
  ship: 2,
  milestone: 3,
  launch: 4,
};

export const EVENT_COLOR: Record<DeploymentKind, string> = {
  iteration: "#7dd3fc",
  ship: "#67e8f9",
  milestone: "#a78bfa",
  launch: "#fbbf24",
};

// Operator influence — drives the soft territory radius rendered around each node.
// Returns kilometers (rendered as a circle layer).
export function influenceKm(input: {
  momentum: number;
  followers: number;
  active_users: number;
  deployments: number;
}): number {
  const raw =
    input.momentum * 0.4 +
    input.followers * 0.2 +
    input.active_users * 0.3 +
    input.deployments * 0.1;
  // Map raw → kilometers. Hard-floor + log compression so even tiny ops show on the map.
  const km = 60 + Math.min(900, Math.log10(raw + 1) * 220);
  return km;
}

// Public Signal Score (0..10).
export function signalScore(input: {
  momentum: number;
  followers: number;
  active_users: number;
  deployments: number;
}): number {
  const raw =
    input.momentum * 0.4 +
    input.followers * 0.2 +
    input.active_users * 0.3 +
    input.deployments * 0.1;
  if (raw <= 0) return 0;
  return Math.min(10, 2.5 * Math.log10(raw + 1));
}

// Node radius in pixels at the current zoom — purely visual.
export function nodeRadiusPx(rank: RankTier, signal: number): number {
  const base = 6 + Math.min(20, signal * 2.5);
  if (rank === "SOVEREIGN") return base + 8;
  if (rank === "COMMANDER") return base + 5;
  if (rank === "ARCHITECT") return base + 2;
  return base;
}

// Center of the contiguous USA — initial map view.
export const USA_VIEW = {
  longitude: -98.5795,
  latitude: 39.8283,
  zoom: 3.6,
};

// Tiny built-in geocode for the most common US states/regions so onboarding
// doesn't require an API call when the user enters "City, ST".
// For unmatched inputs we deterministically scatter coords across the country
// so map nodes still appear (better than a single dogpile in Kansas).
export function fallbackGeo(seed: string): { lat: number; lng: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const lng = -125 + (Math.abs(h) % 4500) / 100; // -125..-80
  const lat = 26 + (Math.abs(h >> 6) % 2000) / 100; // 26..46
  return { lat, lng };
}
