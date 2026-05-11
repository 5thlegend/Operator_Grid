import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
  glow = false,
  corners = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  corners?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative border border-[var(--color-line)] bg-[var(--color-surface)]/70 backdrop-blur-sm",
        glow && "shadow-[0_0_42px_-22px_rgba(103,232,249,0.6)]",
        corners && "nro-corners",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  label,
  hint,
  right,
  className,
}: {
  label: string;
  hint?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2.5",
        className,
      )}
    >
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-glow)]">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[10px] tracking-widest text-[var(--color-text-mute)]">
            {hint}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}
