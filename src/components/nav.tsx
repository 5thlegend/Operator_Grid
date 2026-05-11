import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { cn } from "@/lib/utils";

export async function Nav({ variant = "public" }: { variant?: "public" | "command" }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let handle: string | null = null;
  if (user) {
    const { data } = await supabase.from("operators").select("handle").eq("id", user.id).maybeSingle();
    handle = data?.handle ?? null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[var(--color-bg)]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="grid h-7 w-7 place-items-center border border-[var(--color-glow)]/60 text-[var(--color-glow)] font-mono text-[11px] tracking-widest group-hover:bg-[var(--color-glow-soft)] transition-colors">
              {APP_NAME}
            </span>
            <span className="hidden sm:inline font-mono text-xs text-[var(--color-text-dim)]">
              OPERATOR CORE <span className="text-[var(--color-text-mute)]">{APP_VERSION}</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/grid">Grid</NavLink>
            {variant === "command" && <NavLink href="/command">Deck</NavLink>}
            {variant === "command" && <NavLink href="/command/deploy">Deploy</NavLink>}
            {variant === "command" && <NavLink href="/command/projects">Projects</NavLink>}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {handle ? (
            <>
              <Link
                href={`/u/${handle}`}
                className="font-mono text-xs text-[var(--color-text-dim)] hover:text-[var(--color-glow)] transition-colors"
              >
                @{handle}
              </Link>
              {variant !== "command" && (
                <Link
                  href="/command"
                  className="rounded-none border border-[var(--color-glow)]/60 bg-[var(--color-glow-soft)] px-3 py-1.5 font-mono text-[11px] tracking-widest text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20"
                >
                  COMMAND
                </Link>
              )}
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-none border border-[var(--color-glow)]/60 bg-[var(--color-glow-soft)] px-3 py-1.5 font-mono text-[11px] tracking-widest text-[var(--color-glow)] hover:bg-[var(--color-glow)]/20"
            >
              ENLIST
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "px-3 py-1.5 font-mono text-[11px] tracking-widest uppercase",
        "text-[var(--color-text-dim)] hover:text-[var(--color-glow)] transition-colors",
      )}
    >
      {children}
    </Link>
  );
}
