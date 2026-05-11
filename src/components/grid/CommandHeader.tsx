"use client";

import Link from "next/link";
import { Radio, Maximize2 } from "lucide-react";
import { useGrid } from "@/lib/store/grid";
import { APP_NAME } from "@/lib/constants";

export function CommandHeader() {
  const operators = useGrid((s) => s.operators);
  const pulses = useGrid((s) => s.pulses);
  const opCount = Object.keys(operators).length;
  const liveCount = pulses.length;

  return (
    <div className="pointer-events-auto flex items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-bg)]/85 backdrop-blur-md px-4 py-2">
      <Link href="/" className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center border border-[var(--color-glow)]/60 text-[var(--color-glow)] font-mono text-[11px] tracking-widest">
          {APP_NAME}
        </span>
        <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-glow)]">SIGNAL MAP · v0.1</span>
      </Link>
      <span className="hidden md:inline font-mono text-[10px] tracking-widest text-[var(--color-text-mute)]">
        // SECTOR USA · CONTINENTAL
      </span>
      <div className="ml-auto flex items-center gap-4 font-mono text-[10px] tracking-widest">
        <span className="inline-flex items-center gap-1.5 text-[var(--color-glow)]">
          <Radio className="h-3 w-3 nro-pulse" />
          {liveCount} ACTIVE PULSES
        </span>
        <span className="text-[var(--color-text-dim)]">{opCount} OPERATORS</span>
        <Link href="/grid/list" className="inline-flex items-center gap-1 text-[var(--color-text-mute)] hover:text-[var(--color-glow)]">
          <Maximize2 className="h-3 w-3" /> LIST
        </Link>
        <Link href="/command" className="border border-[var(--color-glow)]/60 bg-[var(--color-glow-soft)] px-3 py-1 text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20">
          COMMAND
        </Link>
      </div>
    </div>
  );
}
