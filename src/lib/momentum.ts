import type { Deployment } from "@/lib/types";

const WINDOW_DAYS = 14;
const HALF_LIFE_DAYS = 7;

// Decay-weighted momentum score for client-side previews.
// Server-of-record value is computed by Postgres (recompute_momentum).
export function computeMomentum(deployments: Pick<Deployment, "created_at" | "xp_awarded">[]): number {
  const now = Date.now();
  const cutoff = now - WINDOW_DAYS * 86_400_000;
  let score = 0;
  for (const d of deployments) {
    const t = new Date(d.created_at).getTime();
    if (t < cutoff) continue;
    const ageDays = (now - t) / 86_400_000;
    const weight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    score += d.xp_awarded * weight;
  }
  return Math.round(score);
}
