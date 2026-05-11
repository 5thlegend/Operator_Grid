"use client";

import { useEffect, useState, type RefObject } from "react";
import type { MapRef } from "react-map-gl/mapbox";
import { useGrid } from "@/lib/store/grid";

const DURATION_MS = 6000;
const RING_COUNT = 3;

export function DeploymentPulses({ mapRef }: { mapRef: RefObject<MapRef | null> }) {
  const pulses = useGrid((s) => s.pulses);
  const [, force] = useState(0);

  // re-project on map move/zoom
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const tick = () => force((n) => n + 1);
    map.on("move", tick);
    map.on("zoom", tick);
    return () => {
      map.off("move", tick);
      map.off("zoom", tick);
    };
  }, [mapRef]);

  const map = mapRef.current?.getMap();
  if (!map) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {pulses.map((p) => {
        const proj = map.project([p.lng, p.lat]);
        const age = Date.now() - p.startedAt;
        if (age > DURATION_MS) return null;
        const baseSize = 60 + p.strength * 40;

        return (
          <div
            key={p.id}
            className="absolute"
            style={{ left: proj.x, top: proj.y, transform: "translate(-50%, -50%)" }}
          >
            {Array.from({ length: RING_COUNT }).map((_, i) => {
              const delay = i * 700;
              const offset = age - delay;
              if (offset < 0) return null;
              const t = Math.min(1, offset / (DURATION_MS - delay));
              const scale = 0.2 + t * 1.2;
              const opacity = (1 - t) * 0.85;
              return (
                <span
                  key={i}
                  className="absolute left-0 top-0 rounded-full"
                  style={{
                    width: baseSize,
                    height: baseSize,
                    marginLeft: -baseSize / 2,
                    marginTop: -baseSize / 2,
                    border: `1px solid ${p.color}`,
                    boxShadow: `0 0 ${24 * t}px ${p.color}`,
                    transform: `scale(${scale})`,
                    opacity,
                    transition: "none",
                  }}
                />
              );
            })}
            {/* center burst */}
            <span
              className="absolute left-0 top-0 h-3 w-3 rounded-full"
              style={{
                marginLeft: -6,
                marginTop: -6,
                background: p.color,
                boxShadow: `0 0 18px ${p.color}`,
                opacity: Math.max(0, 1 - age / 1500),
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
