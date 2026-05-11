"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geocodeUS } from "@/lib/geocode";

export async function updateProfile(input: {
  display_name: string;
  tagline?: string;
  bio?: string;
  location?: string;
  city?: string;
  state?: string;
  avatar_url?: string;
  link_site?: string;
  link_x?: string;
  link_github?: string;
  current_project?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const display = input.display_name.trim().slice(0, 48);
  if (display.length < 1) return { error: "Display name required." };

  const newCity = nullable(input.city, 48);
  const newState = input.state ? input.state.trim().toUpperCase().slice(0, 2) || null : null;

  // re-geocode only when city/state changed
  const { data: current } = await supabase
    .from("operators")
    .select("city, state, lat, lng")
    .eq("id", user.id)
    .single();

  let lat = current?.lat ?? null;
  let lng = current?.lng ?? null;
  if (newCity && (newCity !== current?.city || newState !== current?.state)) {
    const geo = await geocodeUS([newCity, newState].filter(Boolean).join(", "));
    if (geo) { lat = geo.lat; lng = geo.lng; }
  } else if (!newCity) {
    lat = null;
    lng = null;
  }

  const { error } = await supabase
    .from("operators")
    .update({
      display_name: display,
      tagline: nullable(input.tagline, 120),
      bio: nullable(input.bio, 600),
      location: nullable(input.location, 48),
      city: newCity,
      state: newState,
      lat,
      lng,
      avatar_url: nullable(input.avatar_url, 300),
      link_site: nullable(input.link_site, 200),
      link_x: nullable(input.link_x, 60),
      link_github: nullable(input.link_github, 60),
      current_project: nullable(input.current_project, 60),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  const { data: op } = await supabase.from("operators").select("handle").eq("id", user.id).single();
  revalidatePath(`/u/${op?.handle}`);
  revalidatePath("/command");
  revalidatePath("/command/profile");
  return {};
}

function nullable(s: string | undefined | null, max: number): string | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  return v.slice(0, max);
}
