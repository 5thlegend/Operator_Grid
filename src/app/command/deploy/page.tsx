import { createClient } from "@/lib/supabase/server";
import { Panel, PanelHeader } from "@/components/hud/panel";
import { DeployForm } from "@/app/command/deploy/deploy-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log Deployment" };

export default async function DeployPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, slug")
    .eq("operator_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div>
        <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--color-glow)]">
          // STAMP THE RECORD
        </div>
        <h1
          className="mt-2 font-display text-3xl font-bold leading-tight"
          style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
        >
          Log a deployment.
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-dim)]">
          One row added to your live record. XP awarded by kind. Streak ticks if it's a new day.
        </p>
      </div>

      <Panel className="mt-6" corners>
        <PanelHeader label="// DEPLOYMENT INTAKE" />
        <DeployForm projects={projects ?? []} />
      </Panel>
    </main>
  );
}
