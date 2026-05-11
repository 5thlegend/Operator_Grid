import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { GridOverlay } from "@/components/grid-overlay";
import { Panel, PanelHeader } from "@/components/hud/panel";
import { OnboardingForm } from "@/app/onboarding/onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing } = await supabase
    .from("operators")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) redirect("/command");

  return (
    <div className="relative min-h-screen">
      <GridOverlay />
      <div className="relative z-10">
        <Nav />
        <main className="mx-auto max-w-2xl px-4 py-16">
          <div>
            <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--color-glow)]">
              // INITIATION SEQUENCE
            </div>
            <h1
              className="mt-3 font-display text-4xl font-bold"
              style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
            >
              Forge your callsign.
            </h1>
            <p className="mt-3 text-sm text-[var(--color-text-dim)]">
              You start at <span className="text-[var(--color-glow)] font-mono">INITIATE</span>.
              Your handle is permanent. Choose with intent.
            </p>
          </div>
          <Panel className="mt-8" corners>
            <PanelHeader label="// OPERATOR DOSSIER · NEW" />
            <OnboardingForm email={user.email ?? ""} />
          </Panel>
        </main>
      </div>
    </div>
  );
}
