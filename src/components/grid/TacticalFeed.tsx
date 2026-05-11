"use client";

import { useGrid } from "@/lib/store/grid";
import { Rocket, ArrowUp, Activity } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { EVENT_COLOR } from "@/lib/signal";
import type { DeploymentKind } from "@/lib/types";

export function TacticalFeed() {
  const feed = useGrid((s) => s.feed);

  return (
    <div className="flex h-full flex-col border-r border-[var(--color-line)] bg-[var(--color-bg)]/80 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-glow)]">// TACTICAL FEED</div>
        <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-widest text-[var(--color-text-mute)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-glow)] nro-pulse" />
          LIVE
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {feed.length === 0 && (
          <div className="px-3 py-6 font-mono text-[10px] text-[var(--color-text-mute)]">
            // STANDING BY · NO SIGNALS
          </div>
        )}
        <ol className="divide-y divide-[var(--color-line)]/60">
          {feed.map((item) => (
            <li key={item.id} className="px-3 py-2.5">
              {item.kind === "deploy" && (
                <DeployRow
                  handle={item.handle}
                  title={item.title}
                  k={item.deployKind}
                  city={item.city ?? null}
                  at={item.at}
                />
              )}
              {item.kind === "ascension" && (
                <AscRow handle={item.handle} to={item.to_rank} at={item.at} />
              )}
              {item.kind === "signal" && (
                <SignalRow handle={item.handle} delta={item.delta} at={item.at} />
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function DeployRow({ handle, title, k, city, at }: { handle: string; title: string; k: DeploymentKind; city: string | null; at: number }) {
  const color = EVENT_COLOR[k];
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em]">
        <Rocket className="h-3 w-3" style={{ color }} />
        <span style={{ color }}>[{k.toUpperCase()}]</span>
        <span className="ml-auto text-[var(--color-text-mute)]">{relativeTime(new Date(at))}</span>
      </div>
      <div className="text-xs leading-snug text-[var(--color-text)]">
        {title}
      </div>
      <div className="font-mono text-[10px] text-[var(--color-text-mute)]">
        @{handle}{city ? ` · ${city}` : ""}
      </div>
    </div>
  );
}

function AscRow({ handle, to, at }: { handle: string; to: string; at: number }) {
  return (
    <div className="space-y-1 rounded-sm border border-amber-300/40 bg-amber-500/5 px-2 py-1">
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-amber-300">
        <ArrowUp className="h-3 w-3" />
        [ASCENSION]
        <span className="ml-auto text-[var(--color-text-mute)]">{relativeTime(new Date(at))}</span>
      </div>
      <div className="text-xs text-[var(--color-text)]">
        @{handle} → <span className="font-mono text-amber-300">{to}</span>
      </div>
    </div>
  );
}

function SignalRow({ handle, delta, at }: { handle: string; delta: number; at: number }) {
  const positive = delta >= 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-[var(--color-glow)]">
        <Activity className="h-3 w-3" />
        [SIGNAL]
        <span className="ml-auto text-[var(--color-text-mute)]">{relativeTime(new Date(at))}</span>
      </div>
      <div className="text-xs text-[var(--color-text)]">
        @{handle} <span className={positive ? "text-[var(--color-glow)]" : "text-[var(--color-danger)]"}>{positive ? "+" : ""}{delta}%</span> momentum
      </div>
    </div>
  );
}
