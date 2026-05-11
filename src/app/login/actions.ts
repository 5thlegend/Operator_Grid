"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/utils";

export async function sendMagicLink(email: string, next?: string) {
  const supabase = await createClient();
  const cleaned = email.trim().toLowerCase();
  if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return { error: "Invalid email address." };
  }

  const callbackUrl = new URL("/auth/callback", siteUrl());
  if (next) callbackUrl.searchParams.set("next", next);

  const { error } = await supabase.auth.signInWithOtp({
    email: cleaned,
    options: {
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) return { error: error.message };
  redirect("/login?sent=1" + (next ? `&next=${encodeURIComponent(next)}` : ""));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
