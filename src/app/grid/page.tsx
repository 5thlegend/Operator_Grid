import { createClient } from "@/lib/supabase/server";
import { SignalMapClient } from "@/components/grid/SignalMapClient";
import type { MapOperator, FeedItem } from "@/lib/store/grid";
import { fallbackGeo } from "@/lib/signal";
import type { DeploymentKind, RankTier } from "@/lib/types";

export const revalidate = 15;
export const metadata = { title: "Signal Map" };

export default async function GridPage() {
  const supabase = await createClient();

  const [{ data: ops }, { data: deps }, { data: ascs }] = await Promise.all([
    supabase
      .from("operators")
      .select("id, handle, display_name, avatar_url, rank, xp, momentum, signal_score, followers, active_users, streak_days, city, state, lat, lng"),
    supabase
      .from("deployments")
      .select("id, operator_id, kind, title, created_at, operator:operators!inner(handle, city)")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("ascensions")
      .select("id, operator_id, to_rank, created_at, operator:operators!inner(handle)")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  // attach deployment counts per operator
  const counts: Record<string, number> = {};
  const { data: countsRaw } = await supabase
    .from("deployments")
    .select("operator_id");
  for (const r of countsRaw ?? []) counts[r.operator_id] = (counts[r.operator_id] ?? 0) + 1;

  const operators: MapOperator[] = (ops ?? []).map((o: {
    id: string; handle: string; display_name: string; avatar_url: string | null;
    rank: string; xp: number; momentum: number; signal_score: number | string | null;
    followers: number | null; active_users: number | null; streak_days: number;
    city: string | null; state: string | null; lat: number | null; lng: number | null;
  }) => {
    const fallback = fallbackGeo(o.handle);
    return {
      id: o.id,
      handle: o.handle,
      display_name: o.display_name,
      avatar_url: o.avatar_url,
      rank: o.rank as RankTier,
      xp: o.xp,
      momentum: o.momentum,
      signal_score: Number(o.signal_score ?? 0),
      followers: o.followers ?? 0,
      active_users: o.active_users ?? 0,
      streak_days: o.streak_days,
      city: o.city,
      state: o.state,
      lat: o.lat ?? fallback.lat,
      lng: o.lng ?? fallback.lng,
      deployments_total: counts[o.id] ?? 0,
    };
  });

  const initialFeed: FeedItem[] = [];
  for (const d of deps ?? []) {
    const op = Array.isArray(d.operator) ? d.operator[0] : d.operator;
    initialFeed.push({
      kind: "deploy",
      id: d.id,
      handle: op.handle,
      title: d.title,
      deployKind: d.kind as DeploymentKind,
      city: op?.city ?? null,
      at: new Date(d.created_at).getTime(),
    });
  }
  for (const a of ascs ?? []) {
    const op = Array.isArray(a.operator) ? a.operator[0] : a.operator;
    initialFeed.push({
      kind: "ascension",
      id: a.id,
      handle: op.handle,
      to_rank: a.to_rank as RankTier,
      at: new Date(a.created_at).getTime(),
    });
  }

  return <SignalMapClient operators={operators} initialFeed={initialFeed} />;
}
