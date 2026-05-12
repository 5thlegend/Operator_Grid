/**
 * NROS federation client — fire-and-forget transmission + XP push.
 *
 * Operator Grid is a sovereign realm in the NROS federation. This client
 * pushes events to the central coordination layer without blocking the
 * realm's own writes.
 *
 * env.NROS_API_KEY  → bearer token issued by NROS at realm registration
 * env.NROS_BASE_URL → https://nextrealmos.pages.dev
 */

type Env = { NROS_API_KEY?: string; NROS_BASE_URL?: string };

function getEnv(): Env {
  return {
    NROS_API_KEY: process.env.NROS_API_KEY,
    NROS_BASE_URL: process.env.NROS_BASE_URL ?? "https://nextrealmos.pages.dev",
  };
}

async function nrosFetch(path: string, body: unknown): Promise<void> {
  const env = getEnv();
  if (!env.NROS_API_KEY) return; // not configured — silently skip
  try {
    await fetch(`${env.NROS_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NROS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      // Fire-and-forget; don't let federation latency block our own writes.
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    // Federation must never break the realm. Log + continue.
    console.warn("[nros] federation call failed:", (err as Error).message);
  }
}

export async function pushTransmission(input: {
  kind:
    | "OPERATOR_JOINED"
    | "XP_AWARDED"
    | "RANK_CHANGED"
    | "ACHIEVEMENT_UNLOCKED"
    | "MISSION_COMPLETED"
    | "WORKFLOW_FORGED"
    | "CUSTOM";
  title: string;
  body?: string;
  callsign?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  return nrosFetch("/api/federation/transmissions", input);
}

export async function awardXp(input: {
  callsign: string;
  delta: number;
  reason: string;
  source_id?: string;
  emit_transmission?: boolean;
}): Promise<void> {
  return nrosFetch("/api/federation/xp", input);
}

/** Convenience: fire transmission + XP for a single deployment event. */
export async function pushDeploymentEvent(input: {
  callsign: string;
  kind: "iteration" | "ship" | "milestone" | "launch";
  title: string;
  deploymentId: string;
  url?: string | null;
}): Promise<void> {
  const xpMap: Record<typeof input.kind, number> = {
    iteration: 10,
    ship: 25,
    milestone: 50,
    launch: 100,
  };
  const txKind: Record<typeof input.kind, "CUSTOM" | "MISSION_COMPLETED" | "WORKFLOW_FORGED"> = {
    iteration: "CUSTOM",
    ship: "CUSTOM",
    milestone: "MISSION_COMPLETED",
    launch: "WORKFLOW_FORGED",
  };
  await Promise.allSettled([
    awardXp({
      callsign: input.callsign,
      delta: xpMap[input.kind],
      reason: `${input.kind}: ${input.title}`,
      source_id: input.deploymentId,
      emit_transmission: false, // we'll push our own richer transmission below
    }),
    pushTransmission({
      kind: txKind[input.kind],
      title: `${input.callsign} ${input.kind === "launch" ? "launched" : input.kind === "milestone" ? "hit milestone" : input.kind === "ship" ? "shipped" : "iterated"}: ${input.title}`,
      callsign: input.callsign,
      metadata: { kind: input.kind, deployment_id: input.deploymentId, url: input.url ?? null },
    }),
  ]);
}
