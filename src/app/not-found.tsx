import Link from "next/link";
import { Nav } from "@/components/nav";
import { GridOverlay } from "@/components/grid-overlay";

export default function NotFound() {
  return (
    <div className="relative min-h-screen">
      <GridOverlay />
      <div className="relative z-10">
        <Nav />
        <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-32">
          <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--color-glow)]">
            // SIGNAL LOST · 404
          </div>
          <h1
            className="font-display text-5xl font-bold leading-tight"
            style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
          >
            Out of range.
          </h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            The coordinates you transmitted return null. The operator, deployment, or sector does
            not exist.
          </p>
          <Link
            href="/grid"
            className="mt-2 inline-flex items-center gap-2 border border-[var(--color-glow)]/60 bg-[var(--color-glow-soft)] px-4 py-2 font-mono text-[11px] tracking-widest text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20"
          >
            ENTER THE GRID →
          </Link>
        </main>
      </div>
    </div>
  );
}
