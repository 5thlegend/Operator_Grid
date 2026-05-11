import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { GridOverlay } from "@/components/grid-overlay";

export default async function CommandLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/command");

  const { data: op } = await supabase
    .from("operators")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!op) redirect("/onboarding");

  return (
    <div className="relative min-h-screen">
      <GridOverlay />
      <div className="relative z-10">
        <Nav variant="command" />
        {children}
      </div>
    </div>
  );
}
