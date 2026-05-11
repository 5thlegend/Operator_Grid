"use client";

import { useEffect, useState } from "react";
import { useGrid } from "@/lib/store/grid";

export function TelemetryBar() {
  const operators = useGrid((s) => s.operators);
  const feed = useGrid((s) => s.feed);
  const [time, setTime] = useState<string>(() => isoMin(new Date()));

  useEffect(() => {
    const t = setInterval(() => setTime(isoMin(new Date())), 1000);
    return () => clearInterval(t);
  }, []);

  const ops = Object.values(operators);
  const totalMomentum = ops.reduce((a, b) => a + b.momentum, 0);
  const topSignal = ops.reduce((a, b) => Math.max(a, b.signal_score), 0);
  const last = feed[0];

  return (
    <div className="pointer-events-auto flex items-center gap-6 border-t border-[var(--color-line)] bg-[var(--color-bg)]/85 backdrop-blur-md px-4 py-2 font-mono text-[10px] tracking-widest text-[var(--color-text-dim)]">
      <Cell label="UTC" value={time} />
      <Cell label="NETWORK XP · 14D" value={String(totalMomentum)} accent />
      <Cell label="TOP SIGNAL" value={topSignal.toFixed(1)} accent />
      <Cell label="STATUS" value="ALL CLEAR" />
      <div className="ml-auto truncate">
        {last
          ? <span className="text-[var(--color-glow)]">// LAST: <span className="text-[var(--color-text)]">{describe(last)}</span></span>
          : <span className="text-[var(--color-text-mute)]">// AWAITING SIGNAL</span>}
      </div>
    </div>
  );
}

function Cell({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-[var(--color-text-mute)]">{label}</span>
      <span className={accent ? "text-[var(--color-glow)] tabular-nums" : "text-[var(--color-text)] tabular-nums"}>{value}</span>
    </span>
  );
}

function isoMin(d: Date) {
  return d.toISOString().slice(11, 19) + "Z";
}

function describe(item: import("@/lib/store/grid").FeedItem) {
  if (item.kind === "deploy") return `${item.deployKind.toUpperCase()} · @${item.handle} · ${item.title}`;
  if (item.kind === "ascension") return `ASCENSION · @${item.handle} → ${item.to_rank}`;
  return `SIGNAL · @${item.handle} ${item.delta >= 0 ? "+" : ""}${item.delta}%`;
}
