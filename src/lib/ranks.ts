import type { RankTier } from "@/lib/types";

// Keep in sync with supabase/schema.sql rank_for_xp().
export const RANK_THRESHOLDS: { rank: RankTier; min: number }[] = [
  { rank: "INITIATE", min: 0 },
  { rank: "OPERATOR", min: 250 },
  { rank: "ARCHITECT", min: 1000 },
  { rank: "COMMANDER", min: 3000 },
  { rank: "SOVEREIGN", min: 8000 },
];

export function rankForXp(xp: number): RankTier {
  let current: RankTier = "INITIATE";
  for (const t of RANK_THRESHOLDS) {
    if (xp >= t.min) current = t.rank;
  }
  return current;
}

export function nextRank(rank: RankTier): { rank: RankTier; min: number } | null {
  const idx = RANK_THRESHOLDS.findIndex((t) => t.rank === rank);
  if (idx === -1 || idx === RANK_THRESHOLDS.length - 1) return null;
  return RANK_THRESHOLDS[idx + 1];
}

export function progressToNext(xp: number, rank: RankTier): { pct: number; remaining: number; nextMin: number | null } {
  const next = nextRank(rank);
  const current = RANK_THRESHOLDS.find((t) => t.rank === rank)!;
  if (!next) return { pct: 100, remaining: 0, nextMin: null };
  const span = next.min - current.min;
  const into = xp - current.min;
  return {
    pct: Math.max(0, Math.min(100, Math.round((into / span) * 100))),
    remaining: Math.max(0, next.min - xp),
    nextMin: next.min,
  };
}

export const RANK_COLOR: Record<RankTier, string> = {
  INITIATE: "text-zinc-400",
  OPERATOR: "text-cyan-300",
  ARCHITECT: "text-cyan-200",
  COMMANDER: "text-amber-300",
  SOVEREIGN: "text-amber-200",
};

export const RANK_GLOW: Record<RankTier, string> = {
  INITIATE: "shadow-[0_0_18px_-4px_rgba(161,161,170,0.45)]",
  OPERATOR: "shadow-[0_0_22px_-4px_rgba(103,232,249,0.55)]",
  ARCHITECT: "shadow-[0_0_28px_-4px_rgba(103,232,249,0.7)]",
  COMMANDER: "shadow-[0_0_32px_-4px_rgba(252,211,77,0.7)]",
  SOVEREIGN: "shadow-[0_0_42px_-2px_rgba(252,211,77,0.85)]",
};

export const RANK_RING: Record<RankTier, string> = {
  INITIATE: "ring-zinc-700/60",
  OPERATOR: "ring-cyan-400/40",
  ARCHITECT: "ring-cyan-300/60",
  COMMANDER: "ring-amber-300/60",
  SOVEREIGN: "ring-amber-200/80",
};
