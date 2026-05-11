import { createClient } from "@/lib/supabase/server";
import { Panel, PanelHeader } from "@/components/hud/panel";
import { ProjectsManager } from "@/app/command/projects/projects-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("operator_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div>
        <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--color-glow)]">
          // PROJECTS
        </div>
        <h1
          className="mt-2 font-display text-3xl font-bold leading-tight"
          style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
        >
          Project registry.
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-dim)]">
          Group your deployments under named operations. Public on your dossier.
        </p>
      </div>

      <Panel className="mt-6" corners>
        <PanelHeader label="// REGISTRY" />
        <ProjectsManager initial={projects ?? []} />
      </Panel>
    </main>
  );
}
