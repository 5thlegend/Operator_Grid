import type { RankTier } from "@/lib/types";
import { progressToNext, nextRank } from "@/lib/ranks";
import { RankBadge } from "@/components/rank-badge";

export function RankProgress({ rank, xp }: { rank: RankTier; xp: number }) {
  const { pct, remaining } = progressToNext(xp, rank);
  const next = nextRank(rank);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <RankBadge rank={rank} size="md" />
        {next ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-mute)]">
            → {next.rank} · {remaining} XP TO GO
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-gold)]">
            APEX TIER REACHED
          </span>
        )}
      </div>
      <div className="h-1 w-full overflow-hidden bg-[var(--color-surface-3)]">
        <div
          className="h-full bg-gradient-to-r from-[var(--color-glow)] to-[var(--color-gold)] transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
