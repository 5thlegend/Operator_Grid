import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { DeploymentWithOperator } from "@/lib/types";
import { OperatorAvatar } from "@/components/operator-avatar";
import { KindBadge } from "@/components/kind-badge";
import { relativeTime } from "@/lib/utils";

export function DeploymentCard({ d }: { d: DeploymentWithOperator }) {
  return (
    <article className="group relative border border-[var(--color-line)] bg-[var(--color-surface)]/60 transition-colors hover:border-[var(--color-glow)]/50">
      <div className="flex items-start gap-3 p-4">
        <Link href={`/u/${d.operator.handle}`} className="shrink-0">
          <OperatorAvatar operator={d.operator} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <Link
              href={`/u/${d.operator.handle}`}
              className="font-mono text-[var(--color-text)] hover:text-[var(--color-glow)]"
            >
              @{d.operator.handle}
            </Link>
            {d.project && (
              <>
                <span className="text-[var(--color-text-mute)]">/</span>
                <Link
                  href={`/u/${d.operator.handle}#${d.project.slug}`}
                  className="font-mono text-[var(--color-text-dim)] hover:text-[var(--color-glow)]"
                >
                  {d.project.name}
                </Link>
              </>
            )}
            <span className="ml-auto font-mono text-[10px] text-[var(--color-text-mute)]">
              {relativeTime(d.created_at)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <KindBadge kind={d.kind} />
            <span className="font-mono text-[10px] text-[var(--color-glow)]">
              +{d.xp_awarded} XP
            </span>
          </div>
          <Link
            href={`/u/${d.operator.handle}/d/${d.id}`}
            className="mt-3 block font-display text-lg leading-snug text-[var(--color-text)] hover:text-[var(--color-glow)]"
            style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
          >
            {d.title}
          </Link>
          {d.description && (
            <p className="mt-1.5 line-clamp-2 text-sm text-[var(--color-text-dim)]">
              {d.description}
            </p>
          )}
          {d.url && (
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-[var(--color-glow)] hover:underline"
            >
              {prettyHost(d.url)} <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function prettyHost(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
