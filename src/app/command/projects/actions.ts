"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Project, ProjectStatus } from "@/lib/types";

const SLUG_RE = /^[a-z0-9-]{2,40}$/;

export async function createProject(input: {
  name: string;
  slug: string;
  tagline?: string;
  stack: string[];
  status: ProjectStatus;
  link_live?: string;
  link_repo?: string;
}): Promise<{ project?: Project; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return { error: "Slug: 2–40 chars, lowercase, dashes." };

  const { data, error } = await supabase
    .from("projects")
    .insert({
      operator_id: user.id,
      name: input.name.trim().slice(0, 60),
      slug,
      tagline: input.tagline?.trim().slice(0, 140) || null,
      stack: input.stack.slice(0, 12),
      status: input.status,
      link_live: input.link_live?.trim() || null,
      link_repo: input.link_repo?.trim() || null,
    })
    .select("*")
    .single();

  if (error) return { error: error.message };

  const { data: op } = await supabase.from("operators").select("handle").eq("id", user.id).single();
  revalidatePath(`/u/${op?.handle}`);
  revalidatePath("/command");
  revalidatePath("/command/projects");

  return { project: data as Project };
}

export async function deleteProject(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("projects").delete().eq("id", id).eq("operator_id", user.id);
  if (error) return { error: error.message };

  const { data: op } = await supabase.from("operators").select("handle").eq("id", user.id).single();
  revalidatePath(`/u/${op?.handle}`);
  revalidatePath("/command/projects");
  return {};
}
