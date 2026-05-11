import { ImageResponse } from "next/og";
import { createServerClient } from "@supabase/ssr";

export const runtime = "edge";
export const contentType = "image/png";

const W = 1200;
const H = 630;

export async function GET(_req: Request, ctx: { params: Promise<{ handle: string }> }) {
  const { handle } = await ctx.params;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
  const { data: op } = await supabase
    .from("operators")
    .select("handle, display_name, tagline, rank, xp, momentum, streak_days")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();

  if (!op) {
    return new ImageResponse(<NotFound />, { width: W, height: H });
  }

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
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#67e8f9", fontFamily: "monospace", fontSize: 16, letterSpacing: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: "#67e8f9" }} />
          NRO · OPERATOR DOSSIER
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 28, gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1, letterSpacing: -2, fontFamily: "Inter, sans-serif" }}>
              {op.display_name}
            </div>
          </div>
          <div style={{ fontSize: 28, color: "#9a9aa3", fontFamily: "monospace" }}>@{op.handle}</div>
          {op.tagline && (
            <div style={{ marginTop: 12, fontSize: 26, color: "#c5c5cc", maxWidth: 1000, lineHeight: 1.35 }}>
              {op.tagline}
            </div>
          )}
        </div>

        <div style={{ marginTop: "auto", display: "flex", gap: 18 }}>
          <RankCard rank={op.rank} />
          <Stat label="MOMENTUM · 14D" value={String(op.momentum)} accent />
          <Stat label="TOTAL XP" value={String(op.xp)} />
          <Stat label="STREAK" value={`${op.streak_days}d`} />
        </div>

        <div style={{ position: "absolute", bottom: 24, right: 56, fontFamily: "monospace", fontSize: 14, color: "#5a5a64", letterSpacing: 4 }}>
          NEXTREALM-OPERATORS.PAGES.DEV
        </div>

        <Corners />
      </div>
    ),
    { width: W, height: H },
  );
}

function RankCard({ rank }: { rank: string }) {
  const isHigh = rank === "COMMANDER" || rank === "SOVEREIGN";
  const accent = isHigh ? "#fbbf24" : "#67e8f9";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "16px 22px",
        border: `1px solid ${accent}88`,
        background: `${accent}1f`,
        boxShadow: `0 0 60px -20px ${accent}`,
      }}
    >
      <div style={{ fontFamily: "monospace", fontSize: 12, letterSpacing: 4, color: "#9a9aa3" }}>// RANK</div>
      <div style={{ fontFamily: "monospace", fontSize: 28, letterSpacing: 4, color: accent }}>{rank}</div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "16px 22px",
        border: "1px solid #26262e",
        background: "#11111466",
      }}
    >
      <div style={{ fontFamily: "monospace", fontSize: 12, letterSpacing: 4, color: "#9a9aa3" }}>{label}</div>
      <div style={{ fontFamily: "monospace", fontSize: 32, color: accent ? "#67e8f9" : "#e6e6ea" }}>{value}</div>
    </div>
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

function Corners() {
  const c = { position: "absolute" as const, width: 18, height: 18, border: "1px solid #67e8f9", opacity: 0.55 };
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
      // OPERATOR NOT FOUND
    </div>
  );
}
