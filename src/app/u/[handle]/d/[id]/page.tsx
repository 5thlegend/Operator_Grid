import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { GridOverlay } from "@/components/grid-overlay";
import { Panel, PanelHeader } from "@/components/hud/panel";
import { OperatorAvatar } from "@/components/operator-avatar";
import { RankBadge } from "@/components/rank-badge";
import { KindBadge } from "@/components/kind-badge";
import { ShareButton } from "@/components/share-button";
import { relativeTime, siteUrl } from "@/lib/utils";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; id: string }>;
}) {
  const { handle, id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("deployments")
    .select("title, description, operator:operators!inner(handle, display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { title: "Deployment not found" };
  const op = Array.isArray(data.operator) ? data.operator[0] : data.operator;
  return {
    title: `${data.title} · @${op.handle}`,
    description: data.description ?? `Deployment by ${op.display_name} (@${op.handle}) on NRO.`,
    openGraph: {
      images: [`${siteUrl()}/api/og/deployment/${id}`],
    },
    twitter: {
      card: "summary_large_image",
      images: [`${siteUrl()}/api/og/deployment/${id}`],
    },
  };
}

export default async function DeploymentPage({
  params,
}: {
  params: Promise<{ handle: string; id: string }>;
}) {
  const { handle, id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("deployments")
    .select(`
      id, kind, title, description, url, screenshot_url, xp_awarded, created_at,
      operator:operators!inner(id, handle, display_name, avatar_url, rank, tagline),
      project:projects(id, slug, name)
    `)
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const op = Array.isArray(data.operator) ? data.operator[0] : data.operator;
  const proj = Array.isArray(data.project) ? data.project[0] : data.project;
  if (op.handle !== handle.toLowerCase()) notFound();

  const url = `${siteUrl()}/u/${op.handle}/d/${data.id}`;
  const shareText = `${data.title} — by @${op.handle} on NRO`;

  return (
    <div className="relative min-h-screen">
      <GridOverlay />
      <div className="relative z-10">
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <Link
            href={`/u/${op.handle}`}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-[var(--color-text-mute)] hover:text-[var(--color-glow)]"
          >
            <ArrowLeft className="h-3 w-3" /> @{op.handle} DOSSIER
          </Link>

          <Panel corners glow className="mt-4">
            <PanelHeader
              label="// DEPLOYMENT RECORD"
              hint={new Date(data.created_at).toISOString().replace("T", " ").slice(0, 16) + " UTC"}
            />
            <div className="p-6">
              <div className="flex items-center gap-3">
                <Link href={`/u/${op.handle}`}>
                  <OperatorAvatar operator={op} size={48} />
                </Link>
                <div>
                  <Link href={`/u/${op.handle}`} className="font-display text-lg text-[var(--color-text)] hover:text-[var(--color-glow)]" style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}>
                    {op.display_name}
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[var(--color-text-mute)]">@{op.handle}</span>
                    <RankBadge rank={op.rank} size="sm" />
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <KindBadge kind={data.kind as "iteration" | "ship" | "milestone" | "launch"} />
                  <span className="font-mono text-xs text-[var(--color-glow)]">+{data.xp_awarded} XP</span>
                </div>
              </div>

              <h1
                className="mt-6 font-display text-3xl font-bold leading-tight text-[var(--color-text)]"
                style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
              >
                {data.title}
              </h1>

              {data.description && (
                <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-[var(--color-text-dim)]">
                  {data.description}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-4 font-mono text-xs text-[var(--color-text-mute)]">
                <span>{relativeTime(data.created_at)}</span>
                {proj && <span>· {proj.name}</span>}
                {data.url && (
                  <a
                    href={data.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--color-glow)] hover:underline"
                  >
                    OPEN <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
              </div>

              <div className="mt-8 border-t border-[var(--color-line)] pt-6">
                <ShareButton url={url} text={shareText} kind={data.kind} title={data.title} handle={op.handle} />
              </div>
            </div>
          </Panel>
        </main>
      </div>
    </div>
  );
}
