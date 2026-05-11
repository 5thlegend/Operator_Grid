import Link from "next/link";
import { Flame, MapPinned } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { GridOverlay } from "@/components/grid-overlay";
import { Panel, PanelHeader } from "@/components/hud/panel";
import { OperatorAvatar } from "@/components/operator-avatar";
import { RankBadge } from "@/components/rank-badge";
import { DeploymentCard } from "@/components/deployment-card";
import { ActivityTicker } from "@/components/activity-ticker";
import { GRID_LIMIT, FEED_LIMIT } from "@/lib/constants";
import type { DeploymentWithOperator } from "@/lib/types";

export const revalidate = 20;
export const metadata = { title: "Grid · List" };

export default async function GridListPage() {
  const supabase = await createClient();

  const [{ data: operators }, { data: feed }, { data: tickerRaw }] = await Promise.all([
    supabase
      .from("operators")
      .select("id, handle, display_name, avatar_url, tagline, rank, xp, momentum, signal_score, streak_days, city, state")
      .order("signal_score", { ascending: false })
      .order("momentum", { ascending: false })
      .limit(GRID_LIMIT),
    supabase
      .from("deployments")
      .select(`
        id, operator_id, project_id, kind, title, description, url, screenshot_url, xp_awarded, created_at,
        operator:operators!inner(id, handle, display_name, avatar_url, rank),
        project:projects(id, slug, name)
      `)
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT),
    supabase
      .from("deployments")
      .select("id, kind, title, created_at, operator:operators!inner(handle, display_name)")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const tickerItems = (tickerRaw ?? []).map((r: { id: string; kind: string; title: string; created_at: string; operator: { handle: string; display_name: string } | { handle: string; display_name: string }[] }) => {
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

  const feedNorm: DeploymentWithOperator[] = (feed ?? []).map((d: {
    id: string; operator_id: string; project_id: string | null; kind: string; title: string;
    description: string | null; url: string | null; screenshot_url: string | null;
    xp_awarded: number; created_at: string;
    operator: { id: string; handle: string; display_name: string; avatar_url: string | null; rank: string }
      | { id: string; handle: string; display_name: string; avatar_url: string | null; rank: string }[];
    project: { id: string; slug: string; name: string } | { id: string; slug: string; name: string }[] | null;
  }) => ({
    id: d.id,
    operator_id: d.operator_id,
    project_id: d.project_id,
    kind: d.kind as DeploymentWithOperator["kind"],
    title: d.title,
    description: d.description,
    url: d.url,
    screenshot_url: d.screenshot_url,
    xp_awarded: d.xp_awarded,
    created_at: d.created_at,
    operator: (Array.isArray(d.operator) ? d.operator[0] : d.operator) as DeploymentWithOperator["operator"],
    project: (Array.isArray(d.project) ? d.project[0] ?? null : d.project) as DeploymentWithOperator["project"],
  }));

  return (
    <div className="relative min-h-screen">
      <GridOverlay />
      <div className="relative z-10">
        <Nav />
        <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--color-glow)]">
                // SECTOR 01 · LIST VIEW
              </div>
              <h1
                className="mt-2 font-display text-4xl font-bold leading-tight"
                style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
              >
                The Grid · List.
              </h1>
              <p className="mt-2 text-sm text-[var(--color-text-dim)]">
                Tabular view of every operator, ranked by Signal Score. Live feed below.
              </p>
            </div>
            <Link
              href="/grid"
              className="inline-flex items-center gap-2 border border-[var(--color-glow)]/60 bg-[var(--color-glow-soft)] px-3 py-2 font-mono text-[10px] tracking-widest text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20"
            >
              <MapPinned className="h-3 w-3" /> SIGNAL MAP
            </Link>
          </div>

          <Panel className="mb-8">
            <div className="px-4 py-3">
              <ActivityTicker initial={tickerItems} />
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <Panel>
              <PanelHeader label="// SIGNAL LADDER" hint={`TOP ${GRID_LIMIT}`} />
              <div className="divide-y divide-[var(--color-line)]">
                {(operators ?? []).length === 0 && <Empty text="NO OPERATORS YET. ENLIST TO TAKE POSITION 01." />}
                {(operators ?? []).map((o, i) => (
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
                        {o.streak_days > 0 && (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-amber-300">
                            <Flame className="h-3 w-3" />{o.streak_days}d
                          </span>
                        )}
                        {o.city && (
                          <span className="font-mono text-[10px] text-[var(--color-text-mute)]">
                            {o.city}{o.state ? `, ${o.state}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg text-[var(--color-glow)] tabular-nums">
                        {Number(o.signal_score ?? 0).toFixed(1)}
                      </div>
                      <div className="font-mono text-[9px] tracking-widest text-[var(--color-text-mute)]">SIGNAL</div>
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>

            <Panel>
              <PanelHeader label="// LIVE DEPLOYMENT FEED" hint="REAL-TIME" />
              <div className="divide-y divide-[var(--color-line)]">
                {feedNorm.length === 0 && <Empty text="NO DEPLOYMENTS YET. THE GRID AWAITS A SIGNAL." />}
                {feedNorm.map((d) => <DeploymentCard key={d.id} d={d} />)}
              </div>
            </Panel>
          </div>
        </main>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-16 text-center font-mono text-xs text-[var(--color-text-mute)]">{text}</div>;
}
