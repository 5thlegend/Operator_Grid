// NRO Operator Core — single-Worker SPA.
// Serves the cinematic app HTML with env vars injected at runtime.
// Run alongside Supabase + Mapbox for full functionality.

const RAW_HTML = __APP_HTML__;
const RAW_JS = __APP_JS__;

const SECURITY_HEADERS = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=()",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // OG image — simple SVG-based card so we don't ship a font/canvas runtime.
    if (path.startsWith("/api/og/operator/")) {
      const handle = decodeURIComponent(path.slice("/api/og/operator/".length));
      return ogOperator(handle, env);
    }
    if (path.startsWith("/api/og/deployment/")) {
      const id = decodeURIComponent(path.slice("/api/og/deployment/".length));
      return ogDeployment(id, env);
    }

    // app bundle
    if (path === "/app.js") {
      return new Response(RAW_JS, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=300",
          ...SECURITY_HEADERS,
        },
      });
    }

    // robots & basics
    if (path === "/robots.txt") return text("User-agent: *\nAllow: /\nSitemap: " + url.origin + "/sitemap.xml\n");
    if (path === "/favicon.ico") return new Response(null, { status: 204 });
    if (path === "/favicon.svg") return new Response(FAVICON_SVG, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });

    // every other route: hand to the SPA (it owns routing client-side)
    const html = RAW_HTML
      .replace("__SUPABASE_URL__", env.NEXT_PUBLIC_SUPABASE_URL || "")
      .replace("__SUPABASE_ANON_KEY__", env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "")
      .replace("__MAPBOX_TOKEN__", env.NEXT_PUBLIC_MAPBOX_TOKEN || "")
      .replace("__SITE_URL__", env.NEXT_PUBLIC_SITE_URL || url.origin);

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60",
        ...SECURITY_HEADERS,
      },
    });
  },
};

function text(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0a0a0a"/><rect x="6" y="6" width="52" height="52" fill="none" stroke="#67e8f9" stroke-width="2"/><text x="50%" y="58%" text-anchor="middle" fill="#67e8f9" font-family="monospace" font-size="22" font-weight="700">NRO</text></svg>`;

async function ogOperator(handle, env) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL) return ogStub("NRO · OPERATOR DOSSIER");
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/operators?handle=eq.${encodeURIComponent(handle.toLowerCase())}&select=handle,display_name,tagline,rank,xp,momentum,signal_score,streak_days`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
  });
  const arr = await r.json().catch(() => []);
  const o = arr?.[0];
  if (!o) return ogStub("OPERATOR NOT FOUND");
  return svgImage(operatorCard(o));
}

async function ogDeployment(id, env) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL) return ogStub("NRO · DEPLOYMENT");
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/deployments?id=eq.${encodeURIComponent(id)}&select=kind,title,description,xp_awarded,operator:operators!inner(handle,display_name,rank)`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
  });
  const arr = await r.json().catch(() => []);
  const d = arr?.[0];
  if (!d) return ogStub("DEPLOYMENT NOT FOUND");
  return svgImage(deploymentCard(d));
}

function ogStub(label) {
  return svgImage(`
    <rect width="1200" height="630" fill="#0a0a0a"/>
    ${gridBg()}
    <text x="50%" y="50%" text-anchor="middle" fill="#5a5a64" font-family="monospace" font-size="34" letter-spacing="6">${escapeXml(label)}</text>
    ${corners()}`);
}

function operatorCard(o) {
  const high = o.rank === "SOVEREIGN" || o.rank === "COMMANDER";
  const accent = high ? "#fbbf24" : "#67e8f9";
  return `
    <rect width="1200" height="630" fill="#0a0a0a"/>
    ${gridBg()}
    <g font-family="monospace" fill="#67e8f9" font-size="18" letter-spacing="5">
      <circle cx="68" cy="86" r="6" fill="#67e8f9"/>
      <text x="84" y="93">NRO · OPERATOR DOSSIER</text>
    </g>
    <text x="56" y="220" fill="#e6e6ea" font-family="Inter, sans-serif" font-size="80" font-weight="700" letter-spacing="-2">${escapeXml(truncate(o.display_name, 28))}</text>
    <text x="56" y="270" fill="#9a9aa3" font-family="monospace" font-size="30">@${escapeXml(truncate(o.handle, 30))}</text>
    ${o.tagline ? `<text x="56" y="335" fill="#c5c5cc" font-family="Inter, sans-serif" font-size="28">${escapeXml(truncate(o.tagline, 64))}</text>` : ""}
    ${statBox(56, 460, "// RANK", o.rank, accent, true, high)}
    ${statBox(330, 460, "MOMENTUM · 14D", String(o.momentum ?? 0), "#67e8f9", false)}
    ${statBox(620, 460, "TOTAL XP", String(o.xp ?? 0), "#e6e6ea", false)}
    ${statBox(870, 460, "STREAK", `${o.streak_days ?? 0}d`, "#e6e6ea", false)}
    <text x="56" y="588" fill="#5a5a64" font-family="monospace" font-size="16" letter-spacing="5">NEXTREALM-OPERATORS.DANKPENTA.WORKERS.DEV</text>
    ${corners(accent)}`;
}

function deploymentCard(d) {
  const op = Array.isArray(d.operator) ? d.operator[0] : d.operator;
  const KIND_C = { iteration: "#a1a1aa", ship: "#67e8f9", milestone: "#a78bfa", launch: "#fbbf24" };
  const accent = KIND_C[d.kind] || "#67e8f9";
  return `
    <rect width="1200" height="630" fill="#0a0a0a"/>
    ${gridBg()}
    <g font-family="monospace" font-size="17" letter-spacing="5">
      <rect x="56" y="56" width="190" height="36" fill="${accent}1a" stroke="${accent}88"/>
      <text x="151" y="80" text-anchor="middle" fill="${accent}">${escapeXml(d.kind.toUpperCase())}</text>
      <text x="266" y="80" fill="#67e8f9">+${({iteration:10,ship:25,milestone:50,launch:100}[d.kind]||0)} XP</text>
      <text x="1144" y="80" text-anchor="end" fill="#5a5a64">NRO · DEPLOYMENT RECORD</text>
    </g>
    <text x="56" y="200" fill="#e6e6ea" font-family="Inter, sans-serif" font-size="64" font-weight="700" letter-spacing="-1.5">${escapeXml(truncate(d.title, 36))}</text>
    ${d.description ? `<foreignObject x="56" y="240" width="1080" height="160">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter,sans-serif;font-size:24px;color:#c5c5cc;line-height:1.4">${escapeXml(truncate(d.description, 180))}</div>
    </foreignObject>` : ""}
    <rect x="56" y="510" width="56" height="56" fill="#16161b" stroke="#34343e"/>
    <text x="84" y="548" text-anchor="middle" fill="#9a9aa3" font-family="monospace" font-size="24">${escapeXml((op?.display_name?.[0] || "?").toUpperCase())}</text>
    <text x="130" y="540" fill="#e6e6ea" font-family="Inter, sans-serif" font-size="26" font-weight="600">${escapeXml(truncate(op?.display_name || "", 26))}</text>
    <text x="130" y="568" fill="#9a9aa3" font-family="monospace" font-size="16">@${escapeXml(op?.handle || "")} · ${escapeXml(op?.rank || "")}</text>
    <text x="1144" y="568" text-anchor="end" fill="#5a5a64" font-family="monospace" font-size="16" letter-spacing="4">NEXTREALM-OPERATORS.DANKPENTA.WORKERS.DEV</text>
    ${corners(accent)}`;
}

function statBox(x, y, label, value, color, isRank, glow) {
  const fill = isRank ? `${color}1f` : "#11111466";
  const stroke = isRank ? `${color}88` : "#26262e";
  return `<g>
    <rect x="${x}" y="${y}" width="240" height="92" fill="${fill}" stroke="${stroke}"/>
    <text x="${x+22}" y="${y+30}" fill="#9a9aa3" font-family="monospace" font-size="14" letter-spacing="4">${escapeXml(label)}</text>
    <text x="${x+22}" y="${y+72}" fill="${color}" font-family="monospace" font-size="${isRank ? 30 : 32}" letter-spacing="${isRank ? 4 : 0}">${escapeXml(value)}</text>
  </g>`;
}

function gridBg() {
  return `<defs>
    <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M56 0H0V56" stroke="#ffffff" stroke-opacity="0.18" fill="none"/></pattern>
    <radialGradient id="glow" cx="50%" cy="0%" r="80%"><stop offset="0%" stop-color="#67e8f9" stop-opacity="0.2"/><stop offset="100%" stop-color="#67e8f9" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#grid)" opacity="0.5"/>
  <rect width="1200" height="630" fill="url(#glow)"/>`;
}

function corners(color = "#67e8f9") {
  return `<g stroke="${color}" stroke-opacity="0.55" fill="none">
    <path d="M24 24 L24 42 M24 24 L42 24"/>
    <path d="M1176 24 L1176 42 M1176 24 L1158 24"/>
    <path d="M24 606 L24 588 M24 606 L42 606"/>
    <path d="M1176 606 L1176 588 M1176 606 L1158 606"/>
  </g>`;
}

function escapeXml(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function truncate(s, n) { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

function svgImage(body) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" width="1200" height="630" viewBox="0 0 1200 630">${body}</svg>`;
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
