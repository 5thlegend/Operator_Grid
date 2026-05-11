"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { KIND_LABEL } from "@/lib/xp";
import { relativeTime } from "@/lib/utils";

type TickerItem = {
  id: string;
  handle: string;
  display_name: string;
  kind: "iteration" | "ship" | "milestone" | "launch";
  title: string;
  created_at: string;
};

export function ActivityTicker({ initial }: { initial: TickerItem[] }) {
  const [items, setItems] = useState<TickerItem[]>(initial);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("nro:deployments:ticker")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deployments" },
        async (payload) => {
          const row = payload.new as { id: string; operator_id: string; kind: TickerItem["kind"]; title: string; created_at: string };
          const { data: op } = await supabase
            .from("operators")
            .select("handle, display_name")
            .eq("id", row.operator_id)
            .maybeSingle();
          if (!op) return;
          setItems((prev) => [
            { id: row.id, handle: op.handle, display_name: op.display_name, kind: row.kind, title: row.title, created_at: row.created_at },
            ...prev,
          ].slice(0, 30));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--color-text-mute)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-mute)]" />
        AWAITING FIRST DEPLOYMENT
      </div>
    );
  }

  // duplicate for seamless marquee loop
  const stream = [...items, ...items];

  return (
    <div className="relative w-full overflow-hidden">
      <div className="flex gap-8 nro-marquee whitespace-nowrap">
        {stream.map((it, i) => (
          <span key={`${it.id}-${i}`} className="inline-flex items-center gap-2 font-mono text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-glow)] nro-pulse" />
            <span className="text-[var(--color-glow)]">{KIND_LABEL[it.kind].toUpperCase()}</span>
            <span className="text-[var(--color-text-mute)]">·</span>
            <span className="text-[var(--color-text-dim)]">@{it.handle}</span>
            <span className="text-[var(--color-text-mute)]">·</span>
            <span className="text-[var(--color-text)]">{it.title}</span>
            <span className="text-[var(--color-text-mute)]">·</span>
            <span className="text-[var(--color-text-mute)]">{relativeTime(it.created_at)}</span>
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[var(--color-bg)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[var(--color-bg)] to-transparent" />
    </div>
  );
}
