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

    // AI Operator Coach — Cloudflare Workers AI (free tier, no new key).
    if (path === "/api/ai/coach" && request.method === "POST") {
      return aiCoach(request, env);
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
    if (path === "/robots.txt") return text("User-agent: *\nAllow: /\nDisallow: /command/\nDisallow: /auth/\nSitemap: " + url.origin + "/sitemap.xml\n");
    if (path === "/sitemap.xml") return sitemap(env, url.origin);
    if (path === "/favicon.ico") return new Response(null, { status: 204 });
    if (path === "/favicon.svg") return new Response(FAVICON_SVG, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });

    // every other route: hand to the SPA. Inject per-route OG/meta tags
    // so crawlers (Twitter/Discord/Slack/GBot) see real titles + cards.
    const meta = await routeMeta(path, url.origin, env);

    let html = RAW_HTML
      .replace("__SUPABASE_URL__", env.NEXT_PUBLIC_SUPABASE_URL || "")
      .replace("__SUPABASE_ANON_KEY__", env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "")
      .replace("__MAPBOX_TOKEN__", env.NEXT_PUBLIC_MAPBOX_TOKEN || "")
      .replace("__SITE_URL__", env.NEXT_PUBLIC_SITE_URL || url.origin);

    // swap title + og tags
    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
      .replace(/<meta name="description"[^/]*\/>/, `<meta name="description" content="${escapeHtml(meta.description)}"/>`)
      .replace(/<meta property="og:title"[^/]*\/>/, `<meta property="og:title" content="${escapeHtml(meta.title)}"/>`)
      .replace(/<meta property="og:description"[^/]*\/>/, `<meta property="og:description" content="${escapeHtml(meta.description)}"/>`);

    // append additional tags before </head>
    const extra = `
<meta property="og:url" content="${escapeHtml(url.origin + path)}"/>
<meta property="og:image" content="${escapeHtml(meta.image)}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${escapeHtml(meta.title)}"/>
<meta name="twitter:description" content="${escapeHtml(meta.description)}"/>
<meta name="twitter:image" content="${escapeHtml(meta.image)}"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<link rel="canonical" href="${escapeHtml(url.origin + path)}"/>`;
    html = html.replace("</head>", extra + "\n</head>");

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": meta.cache,
        ...SECURITY_HEADERS,
      },
    });
  },
};

// ----- per-route meta lookup ---------------------------------------
async function routeMeta(path, origin, env) {
  const SB = env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const DEFAULT = {
    title: "NRO · Operator Core",
    description: "Builders don't post. Operators deploy. — Next Realm Operators",
    image: origin + "/api/og/operator/_default",
    cache: "public, max-age=60",
  };

  if (!SB || !KEY) return DEFAULT;

  // /u/[handle]/d/[id]
  const md = path.match(/^\/u\/([^/]+)\/d\/([0-9a-f-]+)\/?$/i);
  if (md) {
    try {
      const r = await fetch(`${SB}/rest/v1/deployments?id=eq.${encodeURIComponent(md[2])}&select=kind,title,description,operator:operators!inner(handle,display_name)`, { headers, cf: { cacheTtl: 30 } });
      const arr = await r.json();
      const d = arr?.[0];
      if (d) {
        const op = Array.isArray(d.operator) ? d.operator[0] : d.operator;
        return {
          title: `${d.title} · @${op.handle} · NRO`,
          description: (d.description ? d.description.slice(0, 160) : `${d.kind.toUpperCase()} deployment by ${op.display_name} on the Next Realm Operator Grid.`),
          image: origin + `/api/og/deployment/${encodeURIComponent(md[2])}`,
          cache: "public, max-age=120, s-maxage=120",
        };
      }
    } catch {}
  }

  // /u/[handle]
  const mu = path.match(/^\/u\/([^/]+)\/?$/);
  if (mu) {
    try {
      const r = await fetch(`${SB}/rest/v1/operators?handle=eq.${encodeURIComponent(mu[1].toLowerCase())}&select=handle,display_name,tagline,rank,signal_score,xp,momentum,streak_days`, { headers, cf: { cacheTtl: 30 } });
      const arr = await r.json();
      const o = arr?.[0];
      if (o) {
        const score = Number(o.signal_score || 0).toFixed(1);
        const stats = `${o.rank} · Signal ${score} · ${o.xp} XP · ${o.streak_days}d streak`;
        return {
          title: `${o.display_name} (@${o.handle}) · NRO`,
          description: o.tagline ? o.tagline : `Operator dossier on the Next Realm Grid — ${stats}.`,
          image: origin + `/api/og/operator/${encodeURIComponent(mu[1])}`,
          cache: "public, max-age=60, s-maxage=60",
        };
      }
    } catch {}
  }

  // /grid
  if (path === "/grid" || path === "/grid/list") {
    return {
      title: "The Grid · NRO",
      description: "Live tactical influence map of the Next Realm Operator network. Realtime deployment pulses, ranked by Signal Score.",
      image: origin + "/api/og/grid",
      cache: "public, max-age=60",
    };
  }

  // /login
  if (path === "/login") {
    return {
      title: "Enlist · NRO",
      description: "Enlist as an Operator on the Next Realm Grid. Single-use magic link, no passwords.",
      image: origin + "/api/og/operator/_default",
      cache: "public, max-age=300",
    };
  }

  return DEFAULT;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ----- sitemap ------------------------------------------------------
async function sitemap(env, origin) {
  const SB = env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const urls = [
    { loc: origin + "/", priority: "1.0", changefreq: "hourly" },
    { loc: origin + "/grid", priority: "0.9", changefreq: "always" },
    { loc: origin + "/grid/list", priority: "0.6", changefreq: "hourly" },
    { loc: origin + "/login", priority: "0.5", changefreq: "yearly" },
  ];
  try {
    const opsRes = await fetch(`${SB}/rest/v1/operators?select=handle,updated_at&order=updated_at.desc&limit=2000`, { headers, cf: { cacheTtl: 300 } });
    const ops = await opsRes.json();
    for (const o of (ops || [])) {
      urls.push({ loc: `${origin}/u/${encodeURIComponent(o.handle)}`, lastmod: o.updated_at, priority: "0.7", changefreq: "daily" });
    }
    const depRes = await fetch(`${SB}/rest/v1/deployments?select=id,created_at&order=created_at.desc&limit=5000`, { headers, cf: { cacheTtl: 300 } });
    const deps = await depRes.json();
    for (const d of (deps || [])) {
      // we don't have the operator handle inline, skip lastmod URL for deployments since it requires a join.
      // Crawlers will discover them via dossier pages anyway.
    }
  } catch {}

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300" } });
}

function text(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0a0a0a"/><g stroke="#67e8f9" stroke-width="1.5" fill="none" opacity="0.8"><path d="M8 8 L18 8 M8 8 L8 18"/><path d="M56 8 L46 8 M56 8 L56 18"/><path d="M8 56 L18 56 M8 56 L8 46"/><path d="M56 56 L46 56 M56 56 L56 46"/></g><circle cx="32" cy="32" r="10" fill="none" stroke="#67e8f9" stroke-width="1.5" opacity="0.4"/><circle cx="32" cy="32" r="4" fill="#67e8f9"/><text x="50%" y="84%" text-anchor="middle" fill="#67e8f9" font-family="monospace" font-size="9" font-weight="700" letter-spacing="2">NRO</text></svg>`;

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

// ====================================================================
// AI Operator Coach (free, runs on Cloudflare Workers AI)
// ====================================================================
async function aiCoach(request, env) {
  if (!env.AI) {
    return jsonResponse({ error: "Workers AI binding not configured" }, 503);
  }
  let body = {};
  try { body = await request.json(); } catch {}
  const op = body.operator || {};
  if (!op.handle) return jsonResponse({ error: "operator required" }, 400);

  // Construct context — keeps token cost minimal, hides any data the client
  // shouldn't have already known. Anti-hallucination via tight system prompt.
  const ctx = {
    handle: String(op.handle).slice(0, 32),
    display_name: String(op.display_name || op.handle).slice(0, 48),
    rank: String(op.rank || "INITIATE"),
    xp: Number(op.xp || 0),
    momentum: Number(op.momentum || 0),
    signal_score: Number(op.signal_score || 0),
    streak_days: Number(op.streak_days || 0),
    deployments_30d: Number(op.deployments_30d || 0),
    days_since_last: Number(op.days_since_last ?? 999),
    last_kind: String(op.last_kind || "—").slice(0, 16),
    current_project: String(op.current_project || "—").slice(0, 64),
  };

  const system = `You are NRO's tactical AI advisor — a cinematic mythic-tech operator coach. You speak in short, punchy military-ops prose. No corporate fluff, no "great job!", no exclamation points unless something is genuinely critical. Use callsign-style references. Recommendations are concrete actions, not vibes. Output exactly two lines:

LINE 1: A one-sentence tactical read of the operator's state (≤16 words).
LINE 2: One concrete action to take today (≤22 words).

No headers, no bullet points, no markdown, no emoji. Two lines, period.`;

  const user = `Operator state:
- callsign: @${ctx.handle} (${ctx.display_name})
- rank: ${ctx.rank} · XP: ${ctx.xp} · signal score: ${ctx.signal_score.toFixed(1)}/10
- momentum (14d XP): ${ctx.momentum}
- current streak: ${ctx.streak_days} days
- days since last deployment: ${ctx.days_since_last === 999 ? "never deployed" : ctx.days_since_last}
- last deployment kind: ${ctx.last_kind}
- deployments in last 30 days: ${ctx.deployments_30d}
- active project: ${ctx.current_project}

Give a tactical read + today's action.`;

  try {
    const res = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });
    const text = (res?.response || "").trim();
    return jsonResponse({ text, operator: ctx.handle, generated_at: new Date().toISOString() });
  } catch (e) {
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...SECURITY_HEADERS,
    },
  });
}
