import type { RankTier } from "@/lib/types";
import { RANK_COLOR, RANK_GLOW, RANK_RING } from "@/lib/ranks";
import { cn } from "@/lib/utils";

export function RankBadge({
  rank,
  size = "md",
  className,
}: {
  rank: RankTier;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "px-1.5 py-0.5 text-[9px]",
    md: "px-2 py-1 text-[10px]",
    lg: "px-3 py-1.5 text-xs",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border bg-black/30 font-mono tracking-[0.18em] uppercase",
        sizes[size],
        RANK_COLOR[rank],
        RANK_RING[rank],
        "ring-1",
        RANK_GLOW[rank],
        className,
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full bg-current nro-pulse")} />
      {rank}
    </span>
  );
}
