import Link from "next/link";
import { ArrowRight, Rocket, Folder, User, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Panel, PanelHeader } from "@/components/hud/panel";
import { Stat } from "@/components/hud/stat";
import { OperatorAvatar } from "@/components/operator-avatar";
import { RankBadge } from "@/components/rank-badge";
import { RankProgress } from "@/components/rank-progress";
import { KindBadge } from "@/components/kind-badge";
import { signOut } from "@/app/login/actions";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Command Deck" };

export default async function CommandPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: op } = await supabase.from("operators").select("*").eq("id", user.id).single();
  const [{ data: deployments }, { data: projects }, { count: depCount }] = await Promise.all([
    supabase.from("deployments").select("*").eq("operator_id", user.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("projects").select("*").eq("operator_id", user.id).order("created_at", { ascending: false }),
    supabase.from("deployments").select("*", { count: "exact", head: true }).eq("operator_id", user.id),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* GREETING */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--color-glow)]">
            // COMMAND DECK
          </div>
          <h1
            className="mt-2 font-display text-3xl font-bold leading-tight"
            style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
          >
            Welcome back, <span className="text-[var(--color-glow)]">{op.display_name}</span>.
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/u/${op.handle}`}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-[var(--color-text-dim)] hover:text-[var(--color-glow)]"
          >
            VIEW PUBLIC DOSSIER <ExternalLink className="h-3 w-3" />
          </Link>
          <form action={signOut}>
            <button type="submit" className="font-mono text-[10px] tracking-widest text-[var(--color-text-mute)] hover:text-[var(--color-danger)]">
              SIGN OUT
            </button>
          </form>
        </div>
      </div>

      {/* STATUS PANEL */}
      <Panel corners glow>
        <PanelHeader label="// OPERATOR STATUS" />
        <div className="grid gap-6 p-6 md:grid-cols-[auto_minmax(0,1fr)]">
          <OperatorAvatar operator={op} size={80} className="ring-2" />
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <RankBadge rank={op.rank} size="lg" />
              <span className="font-mono text-xs text-[var(--color-text-mute)]">@{op.handle}</span>
            </div>
            <RankProgress rank={op.rank} xp={op.xp} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="XP" value={op.xp} accent="glow" />
              <Stat label="Momentum" value={op.momentum} accent="glow" hint="14D" />
              <Stat label="Streak" value={op.streak_days} hint="DAYS" />
              <Stat label="Deployments" value={depCount ?? 0} />
            </div>
          </div>
        </div>
      </Panel>

      {/* QUICK ACTIONS */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <ActionCard
          href="/command/deploy"
          icon={<Rocket className="h-5 w-5" />}
          label="LOG DEPLOYMENT"
          hint="Stamp the record. Earn XP."
          accent
        />
        <ActionCard
          href="/command/projects"
          icon={<Folder className="h-5 w-5" />}
          label="PROJECTS"
          hint={`${projects?.length ?? 0} on file`}
        />
        <ActionCard
          href="/command/profile"
          icon={<User className="h-5 w-5" />}
          label="EDIT DOSSIER"
          hint="Tune your callsign"
        />
      </div>

      {/* RECENT */}
      <Panel className="mt-8">
        <PanelHeader
          label="// RECENT DEPLOYMENTS"
          right={
            <Link
              href={`/u/${op.handle}`}
              className="font-mono text-[10px] tracking-widest text-[var(--color-glow)] hover:underline"
            >
              FULL LOG →
            </Link>
          }
        />
        <div className="divide-y divide-[var(--color-line)]">
          {(deployments ?? []).length === 0 && (
            <div className="px-4 py-12 text-center font-mono text-xs text-[var(--color-text-mute)]">
              NO DEPLOYMENTS YET. <Link href="/command/deploy" className="text-[var(--color-glow)] hover:underline">LOG ONE.</Link>
            </div>
          )}
          {(deployments ?? []).map((d) => (
            <Link
              key={d.id}
              href={`/u/${op.handle}/d/${d.id}`}
              className="block p-4 transition-colors hover:bg-[var(--color-surface-2)]"
            >
              <div className="flex items-start gap-3">
                <div className="w-24 shrink-0 pt-0.5">
                  <KindBadge kind={d.kind} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-display text-base text-[var(--color-text)]" style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}>
                    {d.title}
                  </h4>
                  <div className="mt-1 flex items-center gap-3 font-mono text-[10px] text-[var(--color-text-mute)]">
                    <span className="text-[var(--color-glow)]">+{d.xp_awarded} XP</span>
                    <span>{relativeTime(d.created_at)}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Panel>
    </main>
  );
}

function ActionCard({
  href,
  icon,
  label,
  hint,
  accent = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "group flex items-center justify-between border bg-[var(--color-surface)]/70 p-5 transition-colors " +
        (accent
          ? "border-[var(--color-glow)]/60 hover:bg-[var(--color-glow-soft)]"
          : "border-[var(--color-line)] hover:border-[var(--color-text-dim)]")
      }
    >
      <div>
        <div className={"flex items-center gap-2 " + (accent ? "text-[var(--color-glow)]" : "text-[var(--color-text-dim)]")}>
          {icon}
          <span className="font-mono text-[11px] tracking-[0.2em]">{label}</span>
        </div>
        <p className="mt-2 text-sm text-[var(--color-text-dim)]">{hint}</p>
      </div>
      <ArrowRight className={"h-4 w-4 transition-transform group-hover:translate-x-1 " + (accent ? "text-[var(--color-glow)]" : "text-[var(--color-text-mute)]")} />
    </Link>
  );
}
