"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useGrid } from "@/lib/store/grid";
import { RANK_COLOR } from "@/lib/ranks";

export function RankAscensionOverlay() {
  const ascension = useGrid((s) => s.ascension);
  const setAscension = useGrid((s) => s.setAscension);

  useEffect(() => {
    if (!ascension) return;
    const t = setTimeout(() => setAscension(null), 5400);
    return () => clearTimeout(t);
  }, [ascension, setAscension]);

  return (
    <AnimatePresence>
      {ascension && (
        <motion.div
          key={ascension.id}
          className="pointer-events-none fixed inset-0 z-50 grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* dim backdrop */}
          <div className="absolute inset-0 bg-black/70" />
          {/* radial burst */}
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeOut" }}
            className="absolute h-[42vmin] w-[42vmin] rounded-full"
            style={{
              background: `radial-gradient(circle, ${ascension.to_rank === "SOVEREIGN" || ascension.to_rank === "COMMANDER" ? "#fbbf24" : "#67e8f9"}55, transparent 70%)`,
            }}
          />
          {/* card */}
          <motion.div
            initial={{ y: 30, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="relative max-w-md border border-[var(--color-glow)] bg-[var(--color-bg)]/95 px-10 py-8 text-center shadow-[0_0_120px_-10px_rgba(103,232,249,0.6)]"
          >
            <div className="font-mono text-[10px] tracking-[0.4em] text-[var(--color-glow)]">
              // ASCENSION DETECTED
            </div>
            <div
              className="mt-4 font-display text-3xl font-bold leading-tight"
              style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
            >
              {ascension.display_name}
            </div>
            <div className="font-mono text-xs text-[var(--color-text-mute)]">@{ascension.handle}</div>
            <div className="mt-6 font-mono text-[10px] tracking-widest text-[var(--color-text-dim)]">
              RANK ELEVATED
            </div>
            <div className={`mt-1 font-mono text-4xl tracking-[0.3em] ${RANK_COLOR[ascension.to_rank]}`}>
              {ascension.to_rank}
            </div>
            <CornerBrackets />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CornerBrackets() {
  const c = "absolute h-3 w-3 border-[var(--color-glow)]";
  return (
    <>
      <span className={`${c} top-1 left-1 border-t border-l`} />
      <span className={`${c} top-1 right-1 border-t border-r`} />
      <span className={`${c} bottom-1 left-1 border-b border-l`} />
      <span className={`${c} bottom-1 right-1 border-b border-r`} />
    </>
  );
}
