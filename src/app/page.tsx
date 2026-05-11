import Link from "next/link";
import { ArrowRight, Crosshair, Activity, Trophy, Zap, Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { GridOverlay } from "@/components/grid-overlay";
import { Panel, PanelHeader } from "@/components/hud/panel";
import { Stat } from "@/components/hud/stat";
import { ActivityTicker } from "@/components/activity-ticker";
import { RankBadge } from "@/components/rank-badge";
import { OperatorAvatar } from "@/components/operator-avatar";
import { formatNumber } from "@/lib/utils";
import { APP_FULL_NAME } from "@/lib/constants";

export const revalidate = 30;

export default async function HomePage() {
  const supabase = await createClient();

  const [
    { count: operatorCount },
    { count: deploymentCount },
    { data: recent },
    { data: top },
  ] = await Promise.all([
    supabase.from("operators").select("*", { count: "exact", head: true }),
    supabase.from("deployments").select("*", { count: "exact", head: true }),
    supabase
      .from("deployments")
      .select("id, kind, title, created_at, operator:operators!inner(handle, display_name)")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("operators")
      .select("id, handle, display_name, avatar_url, rank, xp, momentum")
      .order("momentum", { ascending: false })
      .limit(5),
  ]);

  const tickerItems = (recent ?? []).map((r: { id: string; kind: string; title: string; created_at: string; operator: { handle: string; display_name: string } | { handle: string; display_name: string }[] }) => {
    const op = Array.isArray(r.operator) ? r.operator[0] : r.operator;
    return {
      id: r.id,
      handle: op.handle,
      display_name: op.display_name,
      kind: r.kind as "iteration" | "ship" | "milestone" | "launch",
      title: r.title,
      created_at: r.created_at,
    };
  });

  return (
    <div className="relative min-h-screen">
      <GridOverlay />
      <div className="relative z-10">
        <Nav />

        {/* HERO */}
        <section className="relative mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-24">
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-[var(--color-glow)]">
            <Radio className="h-3 w-3 nro-pulse" />
            <span>// SIGNAL ACTIVE</span>
            <span className="text-[var(--color-text-mute)]">·</span>
            <span className="text-[var(--color-text-dim)]">{APP_FULL_NAME}</span>
          </div>

          <h1
            className="mt-6 max-w-4xl font-display text-5xl sm:text-7xl font-bold leading-[0.95] tracking-tight"
            style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
          >
            Builders don't post.
            <br />
            <span className="text-[var(--color-glow)] nro-glow-text">Operators deploy.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[var(--color-text-dim)] leading-relaxed">
            NRO is the operator dossier for builders who ship. Log every deployment, climb the rank
            ladder, lead the Grid. Your build-in-public timeline becomes a live military record —
            not a feed of likes.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 border border-[var(--color-glow)] bg-[var(--color-glow-soft)] px-6 py-3 font-mono text-xs tracking-[0.2em] text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20 transition-colors"
            >
              ENLIST AS OPERATOR
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/grid"
              className="inline-flex items-center gap-2 border border-[var(--color-line-strong)] px-6 py-3 font-mono text-xs tracking-[0.2em] text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:border-[var(--color-text-dim)] transition-colors"
            >
              SURVEY THE GRID
            </Link>
          </div>

          {/* LIVE STATS */}
          <Panel className="mt-12" corners>
            <PanelHeader label="// LIVE NETWORK STATUS" hint="REAL-TIME" />
            <div className="grid grid-cols-2 gap-px bg-[var(--color-line)] sm:grid-cols-4">
              <div className="bg-[var(--color-surface)] p-4">
                <Stat label="Operators" value={formatNumber(operatorCount ?? 0)} accent="glow" />
              </div>
              <div className="bg-[var(--color-surface)] p-4">
                <Stat label="Deployments" value={formatNumber(deploymentCount ?? 0)} accent="glow" />
              </div>
              <div className="bg-[var(--color-surface)] p-4">
                <Stat label="Sectors" value="01" hint="OPERATOR CORE v0.1" />
              </div>
              <div className="bg-[var(--color-surface)] p-4">
                <Stat label="Realm" value="NEXT" accent="gold" hint="// EXPANDING" />
              </div>
            </div>
            <div className="border-t border-[var(--color-line)] px-4 py-3">
              <ActivityTicker initial={tickerItems} />
            </div>
          </Panel>
        </section>

        {/* MANIFESTO */}
        <section className="relative mx-auto mt-24 max-w-7xl px-4 sm:px-6">
          <div className="grid gap-6 md:grid-cols-3">
            <ManifestoCard
              icon={<Crosshair className="h-5 w-5" />}
              title="Earn the rank."
              body="INITIATE → OPERATOR → ARCHITECT → COMMANDER → SOVEREIGN. Every deployment moves the dial. No paid tiers."
            />
            <ManifestoCard
              icon={<Activity className="h-5 w-5" />}
              title="Momentum beats hype."
              body="The Grid sorts by activity in the last 14 days, not lifetime points. Ship today or fall."
            />
            <ManifestoCard
              icon={<Trophy className="h-5 w-5" />}
              title="Public record."
              body="Every deployment is a permalink with a HUD card. Built to be shared. Forged to compound."
            />
          </div>
        </section>

        {/* TOP OPERATORS */}
        <section className="relative mx-auto mt-24 max-w-7xl px-4 sm:px-6">
          <Panel>
            <PanelHeader
              label="// TOP MOMENTUM · 14D"
              right={
                <Link
                  href="/grid"
                  className="font-mono text-[10px] tracking-widest text-[var(--color-glow)] hover:underline"
                >
                  VIEW ALL →
                </Link>
              }
            />
            <div className="divide-y divide-[var(--color-line)]">
              {(top ?? []).length === 0 && (
                <div className="px-4 py-10 text-center font-mono text-xs text-[var(--color-text-mute)]">
                  AWAITING FIRST OPERATORS · BE THE FIRST CALLSIGN.
                </div>
              )}
              {(top ?? []).map((o, i) => (
                <Link
                  key={o.id}
                  href={`/u/${o.handle}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <span className="w-8 font-mono text-xs text-[var(--color-text-mute)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <OperatorAvatar operator={o} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-display text-base text-[var(--color-text)]">{o.display_name}</span>
                      <span className="font-mono text-xs text-[var(--color-text-mute)]">@{o.handle}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <RankBadge rank={o.rank} size="sm" />
                      <span className="font-mono text-[10px] text-[var(--color-text-dim)]">{o.xp} XP</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg text-[var(--color-glow)] tabular-nums">
                      {o.momentum}
                    </div>
                    <div className="font-mono text-[9px] tracking-widest text-[var(--color-text-mute)]">MOMENTUM</div>
                  </div>
                </Link>
              ))}
            </div>
          </Panel>
        </section>

        <footer className="mx-auto mt-32 max-w-7xl px-4 pb-12 sm:px-6">
          <div className="nro-divider mb-6" />
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="font-mono text-[10px] tracking-widest text-[var(--color-text-mute)]">
              NEXT REALM INTERACTIVE · OPERATOR CORE v0.1
            </div>
            <Link href="/grid" className="font-mono text-[10px] tracking-widest text-[var(--color-text-dim)] hover:text-[var(--color-glow)]">
              ENTER THE GRID →
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ManifestoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Panel className="p-6">
      <div className="flex items-center gap-2 text-[var(--color-glow)]">
        {icon}
        <span className="font-mono text-[10px] tracking-[0.2em]">// DOCTRINE</span>
      </div>
      <h3 className="mt-4 font-display text-2xl text-[var(--color-text)]" style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}>{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-dim)]">{body}</p>
      <Zap className="absolute bottom-3 right-3 h-3 w-3 text-[var(--color-line-strong)]" />
    </Panel>
  );
}
