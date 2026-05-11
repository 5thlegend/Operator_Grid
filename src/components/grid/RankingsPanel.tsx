"use client";

import Link from "next/link";
import { Flame } from "lucide-react";
import { useGrid } from "@/lib/store/grid";
import { OperatorAvatar } from "@/components/operator-avatar";
import { RankBadge } from "@/components/rank-badge";

export function RankingsPanel() {
  const operators = useGrid((s) => s.operators);
  const setHovered = useGrid((s) => s.setHovered);
  const list = Object.values(operators)
    .sort((a, b) => b.signal_score - a.signal_score || b.momentum - a.momentum)
    .slice(0, 30);

  return (
    <div className="flex h-full flex-col border-l border-[var(--color-line)] bg-[var(--color-bg)]/80 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-glow)]">// RANKINGS · SIGNAL</div>
        <Link
          href="/grid/list"
          className="font-mono text-[9px] tracking-widest text-[var(--color-text-mute)] hover:text-[var(--color-glow)]"
        >
          FULL LIST →
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        {list.length === 0 && (
          <div className="px-3 py-6 font-mono text-[10px] text-[var(--color-text-mute)]">
            // NO OPERATORS DETECTED
          </div>
        )}
        <ol className="divide-y divide-[var(--color-line)]/60">
          {list.map((o, i) => (
            <li key={o.id}>
              <Link
                href={`/u/${o.handle}`}
                onMouseEnter={() => setHovered(o.id)}
                onMouseLeave={() => setHovered(null)}
                className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <span className="w-6 font-mono text-[10px] text-[var(--color-text-mute)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <OperatorAvatar operator={o} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs text-[var(--color-text)]">@{o.handle}</div>
                  <div className="flex items-center gap-2">
                    <RankBadge rank={o.rank} size="sm" />
                    {o.streak_days > 0 && (
                      <span className="inline-flex items-center gap-0.5 font-mono text-[9px] text-amber-300">
                        <Flame className="h-2.5 w-2.5" />
                        {o.streak_days}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm tabular-nums text-[var(--color-glow)]">
                    {o.signal_score.toFixed(1)}
                  </div>
                  <div className="font-mono text-[8px] tracking-widest text-[var(--color-text-mute)]">SIGNAL</div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
