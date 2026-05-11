export function GridOverlay({ scan = true }: { scan?: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 nro-grid opacity-60" />
      <div className="absolute inset-0 nro-grid-fine opacity-40" />
      {scan && (
        <div className="absolute inset-0 nro-scan" />
      )}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-glow)]/40 to-transparent" />
    </div>
  );
}
