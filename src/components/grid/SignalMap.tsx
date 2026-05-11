"use client";

import { useEffect, useMemo, useRef } from "react";
import Map, { MapRef, Source, Layer, Marker } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useGrid } from "@/lib/store/grid";
import { OperatorMarker } from "@/components/grid/OperatorMarker";
import { DeploymentPulses } from "@/components/grid/DeploymentPulses";
import { SectorTooltip } from "@/components/grid/SectorTooltip";
import { USA_VIEW, influenceKm } from "@/lib/signal";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const TACTICAL_STYLE = "mapbox://styles/mapbox/dark-v11";

export function SignalMap() {
  const ref = useRef<MapRef>(null);
  const operators = useGrid((s) => s.operators);
  const setHovered = useGrid((s) => s.setHovered);

  const operatorList = useMemo(() => Object.values(operators), [operators]);

  // GeoJSON source for the influence-radius glow layer.
  const influenceGeoJson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: operatorList
      .filter((o) => o.lat != null && o.lng != null)
      .map((o) => ({
        type: "Feature" as const,
        properties: {
          id: o.id,
          rank: o.rank,
          intensity: Math.min(
            1,
            influenceKm({
              momentum: o.momentum,
              followers: o.followers,
              active_users: o.active_users,
              deployments: o.deployments_total,
            }) / 800,
          ),
        },
        geometry: { type: "Point" as const, coordinates: [o.lng, o.lat] },
      })),
  }), [operatorList]);

  // Reap stale pulses on a tick.
  const reap = useGrid((s) => s.reapPulses);
  useEffect(() => {
    const t = setInterval(reap, 1000);
    return () => clearInterval(t);
  }, [reap]);

  if (!MAPBOX_TOKEN) {
    return <NoToken />;
  }

  return (
    <div className="relative h-full w-full">
      <Map
        ref={ref}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={USA_VIEW}
        mapStyle={TACTICAL_STYLE}
        attributionControl={false}
        logoPosition="bottom-left"
        cooperativeGestures
        onClick={() => setHovered(null)}
      >
        {/* INFLUENCE RADIUS — soft radial glow per operator */}
        <Source id="influence" type="geojson" data={influenceGeoJson}>
          <Layer
            id="influence-glow"
            type="circle"
            paint={{
              "circle-radius": [
                "interpolate", ["linear"], ["zoom"],
                3, ["+", 30, ["*", 90, ["get", "intensity"]]],
                6, ["+", 60, ["*", 180, ["get", "intensity"]]],
                10, ["+", 120, ["*", 300, ["get", "intensity"]]],
              ],
              "circle-color": [
                "match", ["get", "rank"],
                "SOVEREIGN", "#fbbf24",
                "COMMANDER", "#fcd34d",
                "ARCHITECT", "#67e8f9",
                "OPERATOR", "#67e8f9",
                /* INITIATE */ "#7dd3fc",
              ],
              "circle-opacity": 0.06,
              "circle-blur": 1,
              "circle-stroke-color": [
                "match", ["get", "rank"],
                "SOVEREIGN", "#fbbf24",
                "COMMANDER", "#fcd34d",
                "#67e8f9",
              ],
              "circle-stroke-width": 0.5,
              "circle-stroke-opacity": 0.18,
            }}
          />
        </Source>

        {/* OPERATOR MARKERS */}
        {operatorList.map((o) =>
          o.lat != null && o.lng != null ? (
            <Marker key={o.id} longitude={o.lng} latitude={o.lat} anchor="center">
              <OperatorMarker op={o} />
            </Marker>
          ) : null,
        )}

        {/* RADAR-PING DEPLOYMENT PULSES */}
        <DeploymentPulses mapRef={ref} />
      </Map>

      {/* HOVER TOOLTIP */}
      <SectorTooltip mapRef={ref} />

      {/* HUD OVERLAYS — outside the map for crisp pixels */}
      <div className="pointer-events-none absolute inset-0 nro-grid-fine opacity-25" />
      <div className="pointer-events-none absolute inset-0 nro-scan opacity-60" />
      <Vignette />
    </div>
  );
}

function Vignette() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(ellipse 90% 80% at 50% 50%, transparent 60%, rgba(10,10,10,0.85) 100%)",
      }}
    />
  );
}

function NoToken() {
  return (
    <div className="grid h-full place-items-center bg-[#0a0a0a] text-center px-6">
      <div>
        <div className="font-mono text-[10px] tracking-[0.3em] text-amber-300">
          // SIGNAL MAP · OFFLINE
        </div>
        <h2 className="mt-2 font-mono text-2xl text-[var(--color-text)]">NEXT_PUBLIC_MAPBOX_TOKEN missing.</h2>
        <p className="mt-3 max-w-md text-sm text-[var(--color-text-dim)]">
          Add a Mapbox public token to <code className="font-mono text-[var(--color-glow)]">.env.local</code> to bring the tactical map online.
        </p>
      </div>
    </div>
  );
}
