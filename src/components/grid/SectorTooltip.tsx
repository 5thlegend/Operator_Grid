"use client";

import { useEffect, useState, type RefObject } from "react";
import type { MapRef } from "react-map-gl/mapbox";
import { useGrid } from "@/lib/store/grid";
import { RankBadge } from "@/components/rank-badge";

export function SectorTooltip({ mapRef }: { mapRef: RefObject<MapRef | null> }) {
  const operators = useGrid((s) => s.operators);
  const hovered = useGrid((s) => s.hovered);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!hovered) { setPos(null); return; }
    const map = mapRef.current?.getMap();
    const op = operators[hovered];
    if (!map || !op || op.lat == null || op.lng == null) { setPos(null); return; }
    const tick = () => {
      const p = map.project([op.lng, op.lat]);
      setPos({ x: p.x, y: p.y });
    };
    tick();
    map.on("move", tick);
    map.on("zoom", tick);
    return () => {
      map.off("move", tick);
      map.off("zoom", tick);
    };
  }, [hovered, operators, mapRef]);

  if (!hovered || !pos) return null;
  const op = operators[hovered];
  if (!op) return null;

  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{ left: pos.x + 18, top: pos.y - 8 }}
    >
      <div className="relative w-[260px] border border-[var(--color-glow)]/40 bg-[var(--color-bg)]/95 backdrop-blur-md p-3 shadow-[0_0_42px_-12px_rgba(103,232,249,0.6)]">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] tracking-[0.18em] text-[var(--color-glow)]">
            // OPERATOR PROFILE
          </div>
          <RankBadge rank={op.rank} size="sm" />
        </div>
        <div className="mt-2 font-display text-lg leading-tight text-[var(--color-text)]" style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}>
          {op.display_name}
        </div>
        <div className="font-mono text-[10px] text-[var(--color-text-mute)]">
          @{op.handle}{op.city ? ` · ${op.city}${op.state ? ", " + op.state : ""}` : ""}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-mono">
          <Row label="SIGNAL" value={op.signal_score.toFixed(1)} accent />
          <Row label="MOMENTUM" value={String(op.momentum)} accent />
          <Row label="XP" value={String(op.xp)} />
          <Row label="STREAK" value={`${op.streak_days}d`} />
          <Row label="DEPLOYS" value={String(op.deployments_total)} />
          <Row label="FOLLOWERS" value={String(op.followers)} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-[var(--color-line)]/60 pb-1">
      <span className="text-[var(--color-text-mute)]">{label}</span>
      <span className={accent ? "text-[var(--color-glow)] tabular-nums" : "text-[var(--color-text)] tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
