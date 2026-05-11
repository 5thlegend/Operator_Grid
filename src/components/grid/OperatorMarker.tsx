"use client";

import Link from "next/link";
import { useGrid, type MapOperator } from "@/lib/store/grid";
import { nodeRadiusPx } from "@/lib/signal";

const RANK_FILL: Record<MapOperator["rank"], string> = {
  INITIATE: "#7dd3fc",
  OPERATOR: "#67e8f9",
  ARCHITECT: "#67e8f9",
  COMMANDER: "#fcd34d",
  SOVEREIGN: "#fbbf24",
};

export function OperatorMarker({ op }: { op: MapOperator }) {
  const setHovered = useGrid((s) => s.setHovered);
  const setSelected = useGrid((s) => s.setSelected);
  const isCommander = op.rank === "COMMANDER" || op.rank === "SOVEREIGN";
  const r = nodeRadiusPx(op.rank, op.signal_score);
  const color = RANK_FILL[op.rank];

  return (
    <Link
      href={`/u/${op.handle}`}
      onMouseEnter={() => setHovered(op.id)}
      onMouseLeave={() => setHovered(null)}
      onClick={(e) => {
        // open dossier on click but allow modifier-click to multi-select feel
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          setSelected(op.id);
        }
      }}
      className="group relative block"
      style={{ width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r }}
      aria-label={`@${op.handle}`}
    >
      {/* outer pulse ring */}
      <span
        className="absolute inset-0 rounded-full opacity-60"
        style={{
          background: `radial-gradient(circle, ${color}55 0%, transparent 65%)`,
          animation: `nro-marker-pulse ${isCommander ? "1.6s" : "2.4s"} ease-in-out infinite`,
        }}
      />
      {/* core dot */}
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: Math.max(6, r * 0.55),
          height: Math.max(6, r * 0.55),
          background: color,
          boxShadow: `0 0 ${r}px ${color}, 0 0 ${r * 0.4}px ${color}`,
        }}
      />
      {/* hairline ring */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          border: `1px solid ${color}aa`,
          opacity: 0.85,
        }}
      />
      {/* hover label */}
      <span
        className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] tracking-widest opacity-0 transition-opacity group-hover:opacity-100"
        style={{ color }}
      >
        @{op.handle}
      </span>

      <style jsx>{`
        @keyframes nro-marker-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.18); opacity: 0.85; }
        }
      `}</style>
    </Link>
  );
}
