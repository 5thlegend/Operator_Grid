import type { DeploymentKind } from "@/lib/types";
import { KIND_LABEL } from "@/lib/xp";
import { cn } from "@/lib/utils";

const STYLE: Record<DeploymentKind, string> = {
  iteration: "border-zinc-600/60 bg-zinc-900/50 text-zinc-300",
  ship: "border-cyan-400/50 bg-cyan-500/10 text-cyan-200",
  milestone: "border-violet-400/50 bg-violet-500/10 text-violet-200",
  launch: "border-amber-400/60 bg-amber-500/10 text-amber-200 shadow-[0_0_28px_-6px_rgba(252,211,77,0.6)]",
};

export function KindBadge({ kind, className }: { kind: DeploymentKind; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] tracking-[0.16em] uppercase",
        STYLE[kind],
        className,
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}
