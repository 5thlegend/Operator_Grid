import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { GridOverlay } from "@/components/grid-overlay";
import { Panel, PanelHeader } from "@/components/hud/panel";
import { LoginForm } from "@/app/login/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; sent?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const params = await searchParams;
  if (user) redirect(params.next ?? "/command");

  return (
    <div className="relative min-h-screen">
      <GridOverlay />
      <div className="relative z-10">
        <Nav />
        <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-20">
          <div>
            <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--color-glow)]">
              // ENLISTMENT TERMINAL
            </div>
            <h1
              className="mt-3 font-display text-4xl font-bold leading-tight"
              style={{ fontFamily: "var(--font-space), system-ui, sans-serif" }}
            >
              Identify yourself,<br />
              <span className="text-[var(--color-glow)]">operator.</span>
            </h1>
            <p className="mt-3 text-sm text-[var(--color-text-dim)]">
              We send a single-use sign-in link to your email. No passwords. No theatrics.
            </p>
          </div>

          <Panel corners>
            <PanelHeader label="// AUTH · MAGIC LINK" />
            <div className="p-5">
              {params.error && (
                <div className="mb-4 border border-[var(--color-danger)]/40 bg-red-500/5 px-3 py-2 font-mono text-xs text-[var(--color-danger)]">
                  AUTH FAILED. RETRY.
                </div>
              )}
              {params.sent && (
                <div className="mb-4 border border-[var(--color-glow)]/40 bg-[var(--color-glow-soft)] px-3 py-2 font-mono text-xs text-[var(--color-glow)]">
                  TRANSMISSION SENT. CHECK YOUR INBOX.
                </div>
              )}
              <LoginForm next={params.next} />
            </div>
          </Panel>

          <Link
            href="/"
            className="font-mono text-[10px] tracking-widest text-[var(--color-text-mute)] hover:text-[var(--color-text-dim)]"
          >
            ← BACK TO BASE
          </Link>
        </main>
      </div>
    </div>
  );
}
