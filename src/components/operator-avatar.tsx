import Image from "next/image";
import type { Operator } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RANK_RING } from "@/lib/ranks";

export function OperatorAvatar({
  operator,
  size = 40,
  className,
}: {
  operator: Pick<Operator, "handle" | "display_name" | "avatar_url" | "rank">;
  size?: number;
  className?: string;
}) {
  const initial = (operator.display_name?.[0] ?? operator.handle[0] ?? "?").toUpperCase();

  return (
    <div
      className={cn(
        "relative shrink-0 ring-1 grid place-items-center bg-[var(--color-surface-2)] overflow-hidden",
        RANK_RING[operator.rank],
        className,
      )}
      style={{ width: size, height: size }}
    >
      {operator.avatar_url ? (
        <Image
          src={operator.avatar_url}
          alt={operator.handle}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        <span
          className="font-mono text-[var(--color-text-dim)]"
          style={{ fontSize: size * 0.42 }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
