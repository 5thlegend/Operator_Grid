import type { DeploymentKind } from "@/lib/types";

// Single source of truth — keep in sync with supabase/schema.sql xp_for_kind().
export const XP_TABLE: Record<DeploymentKind, number> = {
  iteration: 10,
  ship: 25,
  milestone: 50,
  launch: 100,
};

export function xpForKind(kind: DeploymentKind): number {
  return XP_TABLE[kind];
}

export const KIND_LABEL: Record<DeploymentKind, string> = {
  iteration: "Iteration",
  ship: "Ship",
  milestone: "Milestone",
  launch: "Launch",
};

export const KIND_DESCRIPTION: Record<DeploymentKind, string> = {
  iteration: "Small forward step. Daily progress.",
  ship: "Real feature in production.",
  milestone: "A meaningful arc closed.",
  launch: "Public release. The world sees it.",
};
