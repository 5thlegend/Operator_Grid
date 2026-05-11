"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { geocodeUS } from "@/lib/geocode";

const HANDLE_RE = /^[a-z0-9_]{2,24}$/;
const RESERVED = new Set([
  "admin", "api", "auth", "command", "grid", "login", "logout",
  "onboarding", "u", "user", "users", "settings", "dashboard",
  "next", "realm", "nro", "operator", "operators", "feed", "deploy",
  "projects", "about", "help", "support", "system", "root",
]);

export async function createOperator({
  handle,
  display_name,
  tagline,
  city,
  state,
}: {
  handle: string;
  display_name: string;
  tagline?: string;
  city?: string;
  state?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const cleanHandle = handle.trim().toLowerCase();
  if (!HANDLE_RE.test(cleanHandle)) {
    return { error: "Callsign: 2–24 chars, lowercase, numbers, underscore." };
  }
  if (RESERVED.has(cleanHandle)) {
    return { error: "Callsign reserved. Try another." };
  }

  const { data: existing } = await supabase
    .from("operators")
    .select("id")
    .eq("handle", cleanHandle)
    .maybeSingle();
  if (existing) return { error: "Callsign already in use." };

  const cleanCity = city?.trim().slice(0, 48) || null;
  const cleanState = state?.trim().toUpperCase().slice(0, 2) || null;

  let lat: number | null = null;
  let lng: number | null = null;
  if (cleanCity) {
    const geo = await geocodeUS([cleanCity, cleanState].filter(Boolean).join(", "));
    if (geo) { lat = geo.lat; lng = geo.lng; }
  }

  const { error } = await supabase.from("operators").insert({
    id: user.id,
    handle: cleanHandle,
    display_name: display_name.trim().slice(0, 48) || cleanHandle,
    tagline: tagline?.trim().slice(0, 120) || null,
    city: cleanCity,
    state: cleanState,
    lat,
    lng,
  });
  if (error) return { error: error.message };

  redirect("/command");
}
