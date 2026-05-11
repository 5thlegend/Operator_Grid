import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  hint,
  accent = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: "default" | "glow" | "gold";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--color-text-mute)]">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-2xl tabular-nums",
          accent === "glow" && "text-[var(--color-glow)] nro-glow-text",
          accent === "gold" && "text-[var(--color-gold)]",
          accent === "default" && "text-[var(--color-text)]",
        )}
      >
        {value}
      </span>
      {hint && (
        <span className="font-mono text-[10px] text-[var(--color-text-dim)]">{hint}</span>
      )}
    </div>
  );
}
