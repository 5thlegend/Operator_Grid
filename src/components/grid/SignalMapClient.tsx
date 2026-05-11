"use client";

import { useEffect } from "react";
import { useGrid, type MapOperator, type FeedItem } from "@/lib/store/grid";
import { SignalMap } from "@/components/grid/SignalMap";
import { TacticalFeed } from "@/components/grid/TacticalFeed";
import { RankingsPanel } from "@/components/grid/RankingsPanel";
import { CommandHeader } from "@/components/grid/CommandHeader";
import { TelemetryBar } from "@/components/grid/TelemetryBar";
import { GridRealtimeBridge } from "@/components/grid/GridRealtimeBridge";
import { RankAscensionOverlay } from "@/components/grid/RankAscensionOverlay";

export function SignalMapClient({
  operators,
  initialFeed,
}: {
  operators: MapOperator[];
  initialFeed: FeedItem[];
}) {
  const setOperators = useGrid((s) => s.setOperators);
  const pushFeed = useGrid((s) => s.pushFeed);

  useEffect(() => {
    setOperators(operators);
    // hydrate initial feed in chronological order so newest ends up first
    const sorted = [...initialFeed].sort((a, b) => a.at - b.at);
    sorted.forEach(pushFeed);
  }, [operators, initialFeed, setOperators, pushFeed]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--color-bg)]">
      <CommandHeader />
      <div className="grid flex-1 grid-cols-[260px_minmax(0,1fr)_280px] overflow-hidden">
        <TacticalFeed />
        <div className="relative">
          <SignalMap />
        </div>
        <RankingsPanel />
      </div>
      <TelemetryBar />
      <GridRealtimeBridge />
      <RankAscensionOverlay />
    </div>
  );
}
