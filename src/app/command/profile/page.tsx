import { createClient } from "@/lib/supabase/server";
import { Panel, PanelHeader } from "@/components/hud/panel";
import { ProfileForm } from "@/app/command/profile/profile-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit Dossier" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: op } = await supabase.from("operators").select("*").eq("id", user.id).single();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div>
        <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--color-glow)]">
          // EDIT DOSSIER
        </div>
        <h1
          className="mt-2 font-display text-3xl font-bold leading-tight"
          style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
        >
          Tune your callsign.
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-dim)]">
          Handle is permanent. Everything else can be re-tuned.
        </p>
      </div>

      <Panel className="mt-6" corners>
        <PanelHeader label="// PROFILE" />
        <ProfileForm operator={op} />
      </Panel>
    </main>
  );
}
