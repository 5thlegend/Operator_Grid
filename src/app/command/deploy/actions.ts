"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DeploymentKind } from "@/lib/types";

export async function createDeployment(input: {
  kind: DeploymentKind;
  title: string;
  description?: string;
  url?: string;
  project_id?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const title = input.title.trim().slice(0, 120);
  if (title.length < 2) return { error: "Title too short." };

  const { data, error } = await supabase
    .from("deployments")
    .insert({
      operator_id: user.id,
      kind: input.kind,
      title,
      description: input.description?.trim().slice(0, 1000) || null,
      url: input.url?.trim() || null,
      project_id: input.project_id || null,
    })
    .select("id, operator_id")
    .single();

  if (error) return { error: error.message };

  const { data: op } = await supabase
    .from("operators")
    .select("handle")
    .eq("id", user.id)
    .single();

  revalidatePath("/grid");
  revalidatePath(`/u/${op?.handle}`);
  revalidatePath("/command");
  revalidatePath("/");

  return { id: data.id, handle: op?.handle };
}
