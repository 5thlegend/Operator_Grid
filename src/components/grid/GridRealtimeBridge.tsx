"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useGrid } from "@/lib/store/grid";
import { EVENT_COLOR, PULSE_STRENGTH, fallbackGeo } from "@/lib/signal";
import type { DeploymentKind, RankTier } from "@/lib/types";

// Subscribes to deployments + ascensions and pushes events into the grid store.
// Mount once from SignalMapClient. We read store via getState() inside handlers
// so the realtime channels are not torn down/re-subscribed on every render.
export function GridRealtimeBridge() {
  useEffect(() => {
    const supabase = createClient();

    const dep = supabase
      .channel("nro:grid:deployments")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deployments" },
        async (payload) => {
          const row = payload.new as {
            id: string; operator_id: string; kind: DeploymentKind; title: string;
            xp_awarded: number; created_at: string;
          };

          const store = useGrid.getState();
          let op = store.operators[row.operator_id];
          if (!op) {
            const { data } = await supabase
              .from("operators")
              .select("id, handle, display_name, avatar_url, rank, xp, momentum, signal_score, followers, active_users, streak_days, city, state, lat, lng")
              .eq("id", row.operator_id)
              .maybeSingle();
            if (!data) return;
            const fallback = fallbackGeo(data.handle);
            op = {
              id: data.id,
              handle: data.handle,
              display_name: data.display_name,
              avatar_url: data.avatar_url,
              rank: data.rank as RankTier,
              xp: data.xp,
              momentum: data.momentum,
              signal_score: Number(data.signal_score ?? 0),
              followers: data.followers ?? 0,
              active_users: data.active_users ?? 0,
              streak_days: data.streak_days,
              city: data.city,
              state: data.state,
              lat: data.lat ?? fallback.lat,
              lng: data.lng ?? fallback.lng,
              deployments_total: 0,
            };
            store.upsertOperator(op);
          }

          store.addPulse({
            id: `${row.id}-${Date.now()}`,
            operatorId: op.id,
            lat: op.lat,
            lng: op.lng,
            kind: row.kind,
            color: EVENT_COLOR[row.kind],
            strength: PULSE_STRENGTH[row.kind],
            title: row.title,
            handle: op.handle,
            startedAt: Date.now(),
          });

          store.pushFeed({
            kind: "deploy",
            id: row.id,
            handle: op.handle,
            title: row.title,
            deployKind: row.kind,
            city: op.city,
            at: Date.now(),
          });
        },
      )
      .subscribe();

    const ops = supabase
      .channel("nro:grid:operators")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "operators" },
        (payload) => {
          const row = payload.new as {
            id: string; handle: string; display_name: string; avatar_url: string | null;
            rank: RankTier; xp: number; momentum: number; signal_score: number;
            followers: number; active_users: number; streak_days: number;
            city: string | null; state: string | null; lat: number | null; lng: number | null;
          };
          const store = useGrid.getState();
          const existing = store.operators[row.id];
          const fallback = fallbackGeo(row.handle);
          store.upsertOperator({
            id: row.id,
            handle: row.handle,
            display_name: row.display_name,
            avatar_url: row.avatar_url,
            rank: row.rank,
            xp: row.xp,
            momentum: row.momentum,
            signal_score: Number(row.signal_score ?? 0),
            followers: row.followers ?? 0,
            active_users: row.active_users ?? 0,
            streak_days: row.streak_days,
            city: row.city,
            state: row.state,
            lat: row.lat ?? fallback.lat,
            lng: row.lng ?? fallback.lng,
            deployments_total: existing?.deployments_total ?? 0,
          });
        },
      )
      .subscribe();

    const asc = supabase
      .channel("nro:grid:ascensions")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ascensions" },
        async (payload) => {
          const row = payload.new as { id: string; operator_id: string; to_rank: RankTier; created_at: string };
          const { data } = await supabase
            .from("operators").select("handle, display_name").eq("id", row.operator_id).maybeSingle();
          if (!data) return;
          const store = useGrid.getState();
          store.setAscension({
            id: row.id,
            operator_id: row.operator_id,
            handle: data.handle,
            display_name: data.display_name,
            to_rank: row.to_rank,
            at: Date.now(),
          });
          store.pushFeed({
            kind: "ascension",
            id: row.id,
            handle: data.handle,
            to_rank: row.to_rank,
            at: Date.now(),
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dep);
      supabase.removeChannel(ops);
      supabase.removeChannel(asc);
    };
  }, []);

  return null;
}
