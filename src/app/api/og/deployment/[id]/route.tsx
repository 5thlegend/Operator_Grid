import { ImageResponse } from "next/og";
import { createServerClient } from "@supabase/ssr";

export const runtime = "edge";
export const contentType = "image/png";

const W = 1200;
const H = 630;

const KIND_LABEL: Record<string, string> = {
  iteration: "ITERATION",
  ship: "SHIP",
  milestone: "MILESTONE",
  launch: "LAUNCH",
};

const KIND_COLOR: Record<string, string> = {
  iteration: "#a1a1aa",
  ship: "#67e8f9",
  milestone: "#a78bfa",
  launch: "#fbbf24",
};

const XP: Record<string, number> = { iteration: 10, ship: 25, milestone: 50, launch: 100 };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );

  const { data } = await supabase
    .from("deployments")
    .select("kind, title, description, created_at, operator:operators!inner(handle, display_name, rank)")
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    return new ImageResponse(<NotFound />, { width: W, height: H });
  }

  const op = Array.isArray(data.operator) ? data.operator[0] : data.operator;
  const accent = KIND_COLOR[data.kind] ?? "#67e8f9";

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          background: "#0a0a0a",
          color: "#e6e6ea",
          fontFamily: "Inter, sans-serif",
          padding: 56,
          position: "relative",
        }}
      >
        <BgGrid />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              padding: "6px 14px",
              border: `1px solid ${accent}88`,
              background: `${accent}1a`,
              color: accent,
              fontFamily: "monospace",
              fontSize: 14,
              letterSpacing: 4,
            }}
          >
            {KIND_LABEL[data.kind]}
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 14, letterSpacing: 4, color: "#67e8f9" }}>
            +{XP[data.kind]} XP
          </div>
          <div style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 14, letterSpacing: 4, color: "#5a5a64" }}>
            NRO · DEPLOYMENT RECORD
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -1.5,
            maxWidth: 1080,
          }}
        >
          {data.title.length > 110 ? data.title.slice(0, 108) + "…" : data.title}
        </div>

        {data.description && (
          <div style={{ marginTop: 22, fontSize: 24, color: "#c5c5cc", maxWidth: 1080, lineHeight: 1.4 }}>
            {data.description.length > 180 ? data.description.slice(0, 178) + "…" : data.description}
          </div>
        )}

        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 56, height: 56,
              border: "1px solid #34343e",
              background: "#16161b",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "monospace", fontSize: 22, color: "#9a9aa3",
            }}
          >
            {op.display_name[0]?.toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 26, fontWeight: 600 }}>{op.display_name}</div>
            <div style={{ fontFamily: "monospace", fontSize: 16, color: "#9a9aa3" }}>@{op.handle} · {op.rank}</div>
          </div>
          <div
            style={{
              marginLeft: "auto",
              fontFamily: "monospace",
              fontSize: 14,
              color: "#5a5a64",
              letterSpacing: 4,
            }}
          >
            NEXTREALM-OPERATORS.PAGES.DEV
          </div>
        </div>

        <Corners color={accent} />
      </div>
    ),
    { width: W, height: H },
  );
}

function BgGrid() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex" }}>
      <svg width={W} height={H} style={{ opacity: 0.18 }}>
        <defs>
          <pattern id="g" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M56 0H0V56" stroke="#ffffff" strokeOpacity="0.18" fill="none" />
          </pattern>
          <radialGradient id="r" cx="50%" cy="0%" r="80%">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#g)" />
        <rect width={W} height={H} fill="url(#r)" />
      </svg>
    </div>
  );
}

function Corners({ color = "#67e8f9" }: { color?: string }) {
  const c = { position: "absolute" as const, width: 18, height: 18, border: `1px solid ${color}`, opacity: 0.55 };
  return (
    <>
      <div style={{ ...c, top: 24, left: 24, borderRight: 0, borderBottom: 0 }} />
      <div style={{ ...c, top: 24, right: 24, borderLeft: 0, borderBottom: 0 }} />
      <div style={{ ...c, bottom: 24, left: 24, borderRight: 0, borderTop: 0 }} />
      <div style={{ ...c, bottom: 24, right: 24, borderLeft: 0, borderTop: 0 }} />
    </>
  );
}

function NotFound() {
  return (
    <div style={{ width: W, height: H, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", color: "#5a5a64", fontFamily: "monospace", fontSize: 32, letterSpacing: 6 }}>
      // DEPLOYMENT NOT FOUND
    </div>
  );
}
