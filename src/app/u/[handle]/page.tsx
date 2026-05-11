import { notFound } from "next/navigation";
import Link from "next/link";
import { Flame, MapPin, Globe, Github, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { GridOverlay } from "@/components/grid-overlay";
import { Panel, PanelHeader } from "@/components/hud/panel";
import { Stat } from "@/components/hud/stat";
import { OperatorAvatar } from "@/components/operator-avatar";
import { RankBadge } from "@/components/rank-badge";
import { RankProgress } from "@/components/rank-progress";
import { KindBadge } from "@/components/kind-badge";
import { relativeTime, siteUrl } from "@/lib/utils";

export const revalidate = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const supabase = await createClient();
  const { data: op } = await supabase
    .from("operators")
    .select("handle, display_name, tagline, rank")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (!op) return { title: "Operator not found" };
  return {
    title: `${op.display_name} · @${op.handle}`,
    description: op.tagline ?? `${op.display_name} is a ${op.rank} on the Next Realm Operator Grid.`,
    openGraph: {
      images: [`${siteUrl()}/api/og/operator/${op.handle}`],
    },
    twitter: {
      card: "summary_large_image",
      images: [`${siteUrl()}/api/og/operator/${op.handle}`],
    },
  };
}

export default async function OperatorPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle: rawHandle } = await params;
  const handle = rawHandle.toLowerCase();
  const supabase = await createClient();

  const { data: operator } = await supabase
    .from("operators")
    .select("*")
    .eq("handle", handle)
    .maybeSingle();

  if (!operator) notFound();

  const [{ data: deployments }, { data: projects }, { count: depCount }] = await Promise.all([
    supabase
      .from("deployments")
      .select("*, project:projects(id, slug, name)")
      .eq("operator_id", operator.id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("projects")
      .select("*")
      .eq("operator_id", operator.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("deployments")
      .select("*", { count: "exact", head: true })
      .eq("operator_id", operator.id),
  ]);

  return (
    <div className="relative min-h-screen">
      <GridOverlay />
      <div className="relative z-10">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          {/* DOSSIER HEADER */}
          <Panel corners glow>
            <PanelHeader
              label="// OPERATOR DOSSIER"
              hint={`ENLISTED ${new Date(operator.created_at).toISOString().slice(0, 10)}`}
            />
            <div className="grid gap-6 p-6 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
              <OperatorAvatar operator={operator} size={96} className="ring-2" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h1
                    className="font-display text-3xl font-bold leading-tight text-[var(--color-text)]"
                    style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
                  >
                    {operator.display_name}
                  </h1>
                  <span className="font-mono text-sm text-[var(--color-text-mute)]">@{operator.handle}</span>
                </div>
                {operator.tagline && (
                  <p className="mt-2 text-base text-[var(--color-text-dim)]">{operator.tagline}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-mute)]">
                  {operator.location && (
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      <MapPin className="h-3 w-3" /> {operator.location}
                    </span>
                  )}
                  {operator.link_site && (
                    <ExtLink href={operator.link_site} icon={<Globe className="h-3 w-3" />}>
                      {prettyHost(operator.link_site)}
                    </ExtLink>
                  )}
                  {operator.link_x && (
                    <ExtLink href={normalizeX(operator.link_x)} icon={<XIcon />}>
                      {operator.link_x.replace(/^@/, "")}
                    </ExtLink>
                  )}
                  {operator.link_github && (
                    <ExtLink href={normalizeGh(operator.link_github)} icon={<Github className="h-3 w-3" />}>
                      {operator.link_github.split("/").pop()}
                    </ExtLink>
                  )}
                </div>
                {operator.bio && (
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--color-text-dim)]">
                    {operator.bio}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-3">
                <RankBadge rank={operator.rank} size="lg" />
                <Stat label="Momentum" value={operator.momentum} accent="glow" hint="14D · DECAY" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px border-t border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-5">
              <div className="bg-[var(--color-surface)] p-4">
                <Stat
                  label="Signal Score"
                  value={Number(operator.signal_score ?? 0).toFixed(1)}
                  accent="glow"
                  hint="0–10"
                />
              </div>
              <div className="bg-[var(--color-surface)] p-4">
                <Stat label="Total XP" value={operator.xp} />
              </div>
              <div className="bg-[var(--color-surface)] p-4">
                <Stat label="Deployments" value={depCount ?? 0} />
              </div>
              <div className="bg-[var(--color-surface)] p-4">
                <Stat
                  label="Streak"
                  value={
                    <span className="inline-flex items-center gap-2">
                      {operator.streak_days}
                      {operator.streak_days > 0 && <Flame className="h-4 w-4 text-amber-400" />}
                    </span>
                  }
                  hint="CONSECUTIVE DAYS"
                />
              </div>
              <div className="bg-[var(--color-surface)] p-4">
                <Stat label="Projects" value={projects?.length ?? 0} />
              </div>
            </div>
            <div className="border-t border-[var(--color-line)] p-4">
              <RankProgress rank={operator.rank} xp={operator.xp} />
            </div>
          </Panel>

          {/* PROJECTS */}
          {projects && projects.length > 0 && (
            <Panel className="mt-8">
              <PanelHeader label="// PROJECTS" hint={`${projects.length} ACTIVE`} />
              <div className="grid gap-px bg-[var(--color-line)] sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((p) => (
                  <div key={p.id} id={p.slug} className="bg-[var(--color-surface)] p-4">
                    <div className="flex items-start justify-between">
                      <h3 className="font-display text-lg text-[var(--color-text)]" style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}>
                        {p.name}
                      </h3>
                      <span className="font-mono text-[9px] tracking-widest uppercase text-[var(--color-text-mute)]">
                        {p.status}
                      </span>
                    </div>
                    {p.tagline && <p className="mt-1 text-sm text-[var(--color-text-dim)]">{p.tagline}</p>}
                    {p.stack.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {p.stack.map((s) => (
                          <span
                            key={s}
                            className="border border-[var(--color-line-strong)] bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-text-dim)]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-3 text-[10px] font-mono">
                      {p.link_live && (
                        <ExtLink href={p.link_live} icon={<ExternalLink className="h-3 w-3" />}>
                          LIVE
                        </ExtLink>
                      )}
                      {p.link_repo && (
                        <ExtLink href={p.link_repo} icon={<Github className="h-3 w-3" />}>
                          REPO
                        </ExtLink>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* DEPLOYMENT LOG */}
          <Panel className="mt-8">
            <PanelHeader label="// DEPLOYMENT LOG" hint={`${depCount ?? 0} TOTAL`} />
            <div className="divide-y divide-[var(--color-line)]">
              {(deployments ?? []).length === 0 && (
                <div className="px-4 py-12 text-center font-mono text-xs text-[var(--color-text-mute)]">
                  NO DEPLOYMENTS LOGGED. THE RECORD STARTS WITH ONE.
                </div>
              )}
              {(deployments ?? []).map((d: {
                id: string; kind: string; title: string; description: string | null;
                url: string | null; xp_awarded: number; created_at: string;
                project: { slug: string; name: string } | { slug: string; name: string }[] | null;
              }) => {
                const proj = Array.isArray(d.project) ? d.project[0] : d.project;
                return (
                  <Link
                    key={d.id}
                    href={`/u/${operator.handle}/d/${d.id}`}
                    className="block p-4 transition-colors hover:bg-[var(--color-surface-2)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-24 shrink-0 pt-0.5">
                        <KindBadge kind={d.kind as "iteration" | "ship" | "milestone" | "launch"} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-display text-base text-[var(--color-text)] group-hover:text-[var(--color-glow)]" style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}>
                          {d.title}
                        </h4>
                        {d.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-[var(--color-text-dim)]">{d.description}</p>
                        )}
                        <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-[var(--color-text-mute)]">
                          <span className="text-[var(--color-glow)]">+{d.xp_awarded} XP</span>
                          <span>{relativeTime(d.created_at)}</span>
                          {proj && <span>· {proj.name}</span>}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Panel>
        </main>
      </div>
    </div>
  );
}

function ExtLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[var(--color-text-dim)] hover:text-[var(--color-glow)]"
    >
      {icon}
      {children}
    </a>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current">
      <path d="M18.244 2H21.5l-7.6 8.69L23 22h-7.05l-5.516-7.246L4.118 22H.86l8.13-9.293L1 2h7.21l4.99 6.6L18.244 2Zm-2.46 18h2.078L7.318 4H5.16l10.624 16Z" />
    </svg>
  );
}

function prettyHost(url: string) {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
}
function normalizeX(s: string) {
  if (s.startsWith("http")) return s;
  return `https://x.com/${s.replace(/^@/, "")}`;
}
function normalizeGh(s: string) {
  if (s.startsWith("http")) return s;
  return `https://github.com/${s}`;
}
