// NRO Operator Core — SPA app, loaded as a module from the Cloudflare Worker.
import { h, render } from "https://esm.sh/preact@10.24.3";
import { useState, useEffect, useRef, useCallback, useMemo } from "https://esm.sh/preact@10.24.3/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const html = htm.bind(h);
const ENV = window.__NRO_ENV || {};
const SITE = ENV.SITE_URL || location.origin;

// ====================================================================
// SUPABASE
// ====================================================================
const supaConfigured = !!(ENV.SUPABASE_URL && ENV.SUPABASE_URL.startsWith("https://") && !ENV.SUPABASE_URL.includes("placeholder"));
const mapboxConfigured = !!(ENV.MAPBOX_TOKEN && ENV.MAPBOX_TOKEN.startsWith("pk.") && !ENV.MAPBOX_TOKEN.includes("placeholder"));

// createClient validates URL strictly — pass a valid-format stub so module
// init never throws when secrets aren't set; every call is gated on supaConfigured.
const supa = createClient(
  supaConfigured ? ENV.SUPABASE_URL : "https://stub.supabase.co",
  supaConfigured ? ENV.SUPABASE_ANON_KEY : "stub_anon_key_placeholder_value_long_enough_to_pass_jwt_format_check_xxxxxxxxxxxxxxxxxx",
  { auth: { persistSession: true, autoRefreshToken: true, storageKey: "nro-auth" } },
);

// ====================================================================
// DOMAIN
// ====================================================================
const RANKS = [
  { name: "INITIATE", min: 0 },
  { name: "OPERATOR", min: 250 },
  { name: "ARCHITECT", min: 1000 },
  { name: "COMMANDER", min: 3000 },
  { name: "SOVEREIGN", min: 8000 },
];
const XP = { iteration: 10, ship: 25, milestone: 50, launch: 100 };
const KIND_COLOR = { iteration: "#7dd3fc", ship: "#67e8f9", milestone: "#a78bfa", launch: "#fbbf24" };
const KIND_LABEL = { iteration: "Iteration", ship: "Ship", milestone: "Milestone", launch: "Launch" };
const KIND_DESC = {
  iteration: "Small forward step. Daily progress.",
  ship: "Real feature in production.",
  milestone: "A meaningful arc closed.",
  launch: "Public release. The world sees it.",
};
const rankFromXp = (xp) => {
  let r = "INITIATE";
  for (const t of RANKS) if (xp >= t.min) r = t.name;
  return r;
};
const rankFill = { INITIATE: "#7dd3fc", OPERATOR: "#67e8f9", ARCHITECT: "#67e8f9", COMMANDER: "#fcd34d", SOVEREIGN: "#fbbf24" };
const signalScore = ({ momentum=0, followers=0, active_users=0, deployments=0 }) => {
  const raw = momentum*0.4 + followers*0.2 + active_users*0.3 + deployments*0.1;
  if (raw <= 0) return 0;
  return Math.min(10, 2.5 * Math.log10(raw + 1));
};
const influenceKm = ({ momentum=0, followers=0, active_users=0, deployments=0 }) => {
  const raw = momentum*0.4 + followers*0.2 + active_users*0.3 + deployments*0.1;
  return 60 + Math.min(900, Math.log10(raw + 1) * 220);
};
const fallbackGeo = (seed="") => {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const lng = -125 + (Math.abs(h) % 4500) / 100;
  const lat = 26 + (Math.abs(h >> 6) % 2000) / 100;
  return { lat, lng };
};
async function geocodeUS(query) {
  if (!ENV.MAPBOX_TOKEN || ENV.MAPBOX_TOKEN.includes("placeholder")) return null;
  const q = query.trim();
  if (q.length < 2) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000); // hard 5s cap
  try {
    const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=us&types=place,address,poi,neighborhood&limit=1&access_token=${ENV.MAPBOX_TOKEN}`, { signal: ctrl.signal });
    if (!r.ok) return null;
    const data = await r.json();
    const f = data.features?.[0];
    if (!f) return null;
    const [lng, lat] = f.center;
    return { lat, lng, place_name: f.place_name };
  } catch (e) {
    console.warn("[NRO:geocode] failed:", e?.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Generic timeout wrapper for any promise. Force into a real Promise first so
// thenables (Supabase query builders) get a proper Promise wrapper.
function withTimeout(promise, ms, label = "operation") {
  const p = Promise.resolve().then(() => promise);
  return Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
  ]);
}

// Direct fetch to Supabase REST — bypasses the supa client's query builder
// which can have edge cases with timeout wrappers. Uses the live access
// token from the auth session. Returns {ok, error, data}.
async function authToken({ refreshIfNeeded = true } = {}) {
  let token = null;
  try {
    let { data: { session } } = await supa.auth.getSession();
    // If session is missing or near-expiry (<60s left), refresh proactively.
    if (refreshIfNeeded) {
      const expiresAt = session?.expires_at || 0;
      const nowSec = Math.floor(Date.now() / 1000);
      if (!session?.access_token || (expiresAt && expiresAt - nowSec < 60)) {
        try {
          const { data, error } = await supa.auth.refreshSession();
          if (error) console.warn("[NRO:authToken] refresh failed:", error.message);
          session = data?.session || session;
        } catch (e) {
          console.warn("[NRO:authToken] refresh threw:", e?.message);
        }
      }
    }
    if (session?.access_token) token = session.access_token;
  } catch (e) {
    console.warn("[NRO:authToken] getSession threw:", e?.message);
  }
  // Anon fallback only for unauthed reads — write callers should detect null token and surface.
  return token || ENV.SUPABASE_ANON_KEY;
}
async function supaRest({ method, path, body, signal, prefer, requireAuth = false }) {
  if (!supaConfigured) return { ok: false, error: "Supabase not configured." };
  const token = await authToken();
  if (requireAuth && (!token || token === ENV.SUPABASE_ANON_KEY)) {
    return { ok: false, error: "SESSION EXPIRED · sign out and back in." };
  }
  const res = await fetch(`${ENV.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "apikey": ENV.SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer": prefer || "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j.message || j.hint || j.error || JSON.stringify(j).slice(0, 240); } catch {}
    // Friendly RLS hint
    if (res.status === 401 || (typeof detail === "string" && detail.toLowerCase().includes("row-level security"))) {
      return { ok: false, error: `Auth refused · ${detail || "session may have expired"}` };
    }
    return { ok: false, error: `HTTP ${res.status}${detail ? " — " + detail : ""}` };
  }
  let data = null;
  try { const j = await res.json(); data = Array.isArray(j) ? (j[0] || null) : j; } catch {}
  return { ok: true, data };
}
async function patchOperator(updated, userId, signal) {
  return supaRest({ method: "PATCH", path: `operators?id=eq.${encodeURIComponent(userId)}`, body: updated, signal, requireAuth: true });
}
async function insertOperator(row, signal) {
  return supaRest({ method: "POST", path: "operators", body: row, signal, requireAuth: true });
}
async function insertDeployment(row, signal) {
  return supaRest({ method: "POST", path: "deployments?select=id", body: row, signal, requireAuth: true });
}
async function insertProject(row, signal) {
  return supaRest({ method: "POST", path: "projects", body: row, signal, requireAuth: true });
}
async function deleteProject(id, userId, signal) {
  return supaRest({ method: "DELETE", path: `projects?id=eq.${encodeURIComponent(id)}&operator_id=eq.${encodeURIComponent(userId)}`, body: undefined, signal, prefer: "return=minimal", requireAuth: true });
}

// ====================================================================
// FEDERATION HOOKS — fire-and-forget broadcasts to NROS via /api/nros/broadcast.
// Worker holds the API key; SPA never sees it. No-op when NROS_API_KEY isn't set.
// ====================================================================
function broadcastNros(payload) {
  if (!payload) return;
  // Detached promise — never blocks the UI, swallows all errors.
  fetch("/api/nros/broadcast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}
const TX = {
  onboarding: (op) => ({
    kind: "OPERATOR_JOINED", realm_slug: "operator-grid",
    title: `${op.display_name} enlisted as @${op.handle}`,
    operator_callsign: op.handle,
    metadata: { city: op.city || null, state: op.state || null, lat: op.lat || null, lng: op.lng || null, recruited_by: op.recruited_by || null },
  }),
  deployment: (op, d) => ({
    kind: "MISSION_COMPLETED", realm_slug: "operator-grid",
    title: `${(d.kind || "deploy").toUpperCase()} · ${d.title}`,
    operator_callsign: op.handle,
    metadata: { deployment_id: d.id, kind: d.kind, xp_awarded: d.xp_awarded, url: d.url || null, signal_score_after: op.signal_score, momentum_after: op.momentum, streak_days: op.streak_days },
  }),
  // Explicit XP synchronization — federation hook #4. Fired alongside
  // MISSION_COMPLETED so NROS's canonical xp_logs stay in sync.
  xpAwarded: (op, delta, reason) => ({
    kind: "XP_AWARDED", realm_slug: "operator-grid",
    title: `+${delta} XP · ${reason || "deployment"}`,
    operator_callsign: op.handle,
    metadata: { delta, total_xp_after: op.xp, source: "operator-grid", reason: reason || "deployment" },
  }),
  rankUp: (op, fromRank, toRank) => ({
    kind: "RANK_CHANGED", realm_slug: "operator-grid",
    title: `${op.display_name || op.handle} ascended to ${toRank}`,
    operator_callsign: op.handle,
    metadata: { from_rank: fromRank, to_rank: toRank, at_xp: op.xp },
  }),
  guildForged: (op, g) => ({
    kind: "CUSTOM", realm_slug: "operator-grid",
    title: `${op.display_name || op.handle} forged guild ${g.sigil || "◈"} ${g.name}`,
    operator_callsign: op.handle,
    metadata: { event: "GUILD_FORGED", guild_id: g.id, guild_slug: g.slug, sigil: g.sigil, color: g.color },
  }),
  // Federation hook #5 — fired when an operator accepts a mission delivered
  // by NROS. Mission consumer is stubbed until NROS_API_KEY is set.
  missionAccepted: (op, mission) => ({
    kind: "CUSTOM", realm_slug: "operator-grid",
    title: `${op.display_name || op.handle} accepted "${mission.title}"`,
    operator_callsign: op.handle,
    metadata: { event: "MISSION_ACCEPTED", mission_id: mission.id, xp_reward: mission.xp_reward, difficulty: mission.difficulty },
  }),
};
async function insertGuild(row, signal) {
  return supaRest({ method: "POST", path: "guilds", body: row, signal, requireAuth: true });
}
async function patchGuild(updated, guildId, signal) {
  return supaRest({ method: "PATCH", path: `guilds?id=eq.${encodeURIComponent(guildId)}`, body: updated, signal, requireAuth: true });
}
async function joinGuild(guildId, userId, role, signal) {
  return supaRest({ method: "POST", path: "guild_members", body: { guild_id: guildId, operator_id: userId, role: role || "member" }, signal, requireAuth: true });
}
async function leaveGuild(userId, signal) {
  return supaRest({ method: "DELETE", path: `guild_members?operator_id=eq.${encodeURIComponent(userId)}`, body: undefined, signal, prefer: "return=minimal", requireAuth: true });
}

// ====================================================================
// GUILD COLOR PALETTE + SIGILS
// ====================================================================
const GUILD_COLORS = [
  { hex: "#67e8f9", name: "Cyan" },
  { hex: "#a78bfa", name: "Violet" },
  { hex: "#fbbf24", name: "Gold" },
  { hex: "#34d399", name: "Emerald" },
  { hex: "#f87171", name: "Crimson" },
  { hex: "#f59e0b", name: "Amber" },
  { hex: "#38bdf8", name: "Sky" },
  { hex: "#f472b6", name: "Rose" },
  { hex: "#a3e635", name: "Lime" },
  { hex: "#fb923c", name: "Orange" },
  { hex: "#818cf8", name: "Indigo" },
  { hex: "#22d3ee", name: "Teal" },
];
const GUILD_SIGILS = ["◈", "◆", "▲", "⬢", "◎", "★", "✦", "✺", "⚝", "☰", "⛓", "⌬"];

// ====================================================================
// SOCIAL NORMALIZATION + ICONS
// ====================================================================
const SOCIALS = [
  { key: "link_site",       label: "Website",     icon: "globe",      placeholder: "https://yoursite.com",    toUrl: (v) => /^https?:/.test(v) ? v : "https://" + v, toLabel: (v) => { try { return new URL(/^https?:/.test(v) ? v : "https://" + v).host.replace(/^www\./, ""); } catch { return v; } } },
  { key: "link_x",          label: "X / Twitter", icon: "x",          placeholder: "@handle",                  toUrl: (v) => /^https?:/.test(v) ? v : `https://x.com/${v.replace(/^@/, "")}`, toLabel: (v) => "@" + v.replace(/^@/, "").replace(/^https?:.*\//, "") },
  { key: "link_github",     label: "GitHub",      icon: "github",     placeholder: "username",                 toUrl: (v) => /^https?:/.test(v) ? v : `https://github.com/${v.replace(/^@/, "")}`, toLabel: (v) => v.replace(/^https?:\/\/(?:www\.)?github\.com\//, "").replace(/^@/, "") },
  { key: "link_youtube",    label: "YouTube",     icon: "youtube",    placeholder: "@channel or full URL",     toUrl: (v) => /^https?:/.test(v) ? v : `https://youtube.com/${v.startsWith("@") ? v : "@" + v}`, toLabel: (v) => v.startsWith("@") ? v : "@" + v.replace(/^https?:.*[\/@]/, "") },
  { key: "link_tiktok",     label: "TikTok",      icon: "tiktok",     placeholder: "@handle",                  toUrl: (v) => /^https?:/.test(v) ? v : `https://tiktok.com/@${v.replace(/^@/, "")}`, toLabel: (v) => "@" + v.replace(/^@/, "").replace(/^https?:.*@/, "") },
  { key: "link_instagram",  label: "Instagram",   icon: "instagram",  placeholder: "@handle",                  toUrl: (v) => /^https?:/.test(v) ? v : `https://instagram.com/${v.replace(/^@/, "")}`, toLabel: (v) => "@" + v.replace(/^@/, "").replace(/^https?:.*\//, "") },
  { key: "link_linkedin",   label: "LinkedIn",    icon: "linkedin",   placeholder: "username or full URL",     toUrl: (v) => /^https?:/.test(v) ? v : `https://linkedin.com/in/${v.replace(/^@/, "")}`, toLabel: (v) => v.replace(/^https?:\/\/(?:www\.)?linkedin\.com\/in\//, "").replace(/\/$/, "") },
  { key: "link_farcaster",  label: "Farcaster",   icon: "farcaster",  placeholder: "@handle (Warpcast)",       toUrl: (v) => /^https?:/.test(v) ? v : `https://warpcast.com/${v.replace(/^@/, "")}`, toLabel: (v) => "@" + v.replace(/^@/, "").replace(/^https?:.*\//, "") },
  { key: "link_discord",    label: "Discord",     icon: "discord",    placeholder: "username (or invite URL)", toUrl: (v) => /^https?:/.test(v) ? v : `https://discord.com/users/${v.replace(/^@/, "")}`, toLabel: (v) => "@" + v.replace(/^@/, "").replace(/^https?:.*\//, "") },
  { key: "link_producthunt",label: "Product Hunt",icon: "ph",         placeholder: "@username",                toUrl: (v) => /^https?:/.test(v) ? v : `https://producthunt.com/@${v.replace(/^@/, "")}`, toLabel: (v) => "@" + v.replace(/^@/, "").replace(/^https?:.*@/, "") },
  { key: "link_substack",   label: "Substack",    icon: "substack",   placeholder: "yoursub.substack.com",     toUrl: (v) => /^https?:/.test(v) ? v : `https://${v}`, toLabel: (v) => v.replace(/^https?:\/\//, "").replace(/^www\./, "") },
  { key: "link_telegram",   label: "Telegram",    icon: "telegram",   placeholder: "@username",                toUrl: (v) => /^https?:/.test(v) ? v : `https://t.me/${v.replace(/^@/, "")}`, toLabel: (v) => "@" + v.replace(/^@/, "").replace(/^https?:.*\//, "") },
];

function SocialGlyph({ icon }) {
  const G = {
    globe:     html`<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6.5"/><ellipse cx="8" cy="8" rx="2.5" ry="6.5"/><line x1="1.5" y1="8" x2="14.5" y2="8"/></svg>`,
    x:         html`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18.244 2H21.5l-7.6 8.69L23 22h-7.05l-5.516-7.246L4.118 22H.86l8.13-9.293L1 2h7.21l4.99 6.6L18.244 2Zm-2.46 18h2.078L7.318 4H5.16l10.624 16Z"/></svg>`,
    github:    html`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 .5C5.6.5.5 5.6.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.4-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.3.8 1 .8 2v3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.6 18.4.5 12 .5Z"/></svg>`,
    youtube:   html`<svg viewBox="0 0 24 24" width="16" height="14" fill="currentColor"><path d="M23 7c-.3-1-1-1.8-2-2.1-1.8-.5-9-.5-9-.5s-7.2 0-9 .5C2 4.7 1.3 5.5 1 6.5.5 8.3.5 12 .5 12s0 3.7.5 5.5c.3 1 1 1.8 2 2.1 1.8.5 9 .5 9 .5s7.2 0 9-.5c1-.3 1.7-1.1 2-2.1.5-1.8.5-5.5.5-5.5s0-3.7-.5-5.5ZM9.7 15.5v-7L15.6 12l-5.9 3.5Z"/></svg>`,
    tiktok:    html`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.6 5.8a4.5 4.5 0 0 1-2.7-1c-.8-.7-1.3-1.6-1.4-2.6V2h-3.4v12.7a2.6 2.6 0 0 1-2.6 2.5 2.6 2.6 0 0 1-2.6-2.6 2.6 2.6 0 0 1 3-2.6V8.6a5.9 5.9 0 0 0-5.6 9 5.9 5.9 0 0 0 10-4.2V8a7.8 7.8 0 0 0 5.3 1.9V6.5h-.1Z"/></svg>`,
    instagram: html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>`,
    linkedin:  html`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5ZM0 8h5v16H0V8Zm7.5 0H12v2.2c.6-1 2-2.4 4.5-2.4 4.8 0 5.5 3 5.5 6.9V24h-5v-7.5c0-1.8 0-4.2-2.6-4.2-2.6 0-3 2-3 4V24h-4.4V8Z"/></svg>`,
    farcaster: html`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M5 3h14v2h-2v14h2v2h-7v-2h2v-6h-4v6h2v2H5v-2h2V5H5V3Z"/></svg>`,
    discord:   html`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20 4.4A18 18 0 0 0 16 3.3l-.2.5a14 14 0 0 0-7.6 0L8 3.3A18 18 0 0 0 4 4.4 19 19 0 0 0 .8 17.6 18 18 0 0 0 6.4 20l1-1.7a12 12 0 0 1-2-1l.5-.4a13 13 0 0 0 11.2 0l.5.4a12 12 0 0 1-2 1l1 1.7a18 18 0 0 0 5.6-2.4A19 19 0 0 0 20 4.4Zm-12 11c-1 0-1.8-1-1.8-2.2 0-1.2.8-2.2 1.8-2.2 1 0 1.8 1 1.8 2.2 0 1.2-.8 2.2-1.8 2.2Zm8 0c-1 0-1.8-1-1.8-2.2 0-1.2.8-2.2 1.8-2.2 1 0 1.8 1 1.8 2.2 0 1.2-.8 2.2-1.8 2.2Z"/></svg>`,
    ph:        html`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1.2 11.5H10v3.5H8V7h5.2c1.8 0 3.3 1.5 3.3 3.3 0 1.7-1.5 3.2-3.3 3.2Zm0-4.5H10v3h3.2c.8 0 1.5-.7 1.5-1.5S14 9 13.2 9Z"/></svg>`,
    substack:  html`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M22 7H2V4h20v3Zm0 4H2v3h20v-3ZM2 22l10-5 10 5V15H2v7Z"/></svg>`,
    telegram:  html`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42Z"/></svg>`,
  };
  return G[icon] || G.globe;
}
const STACK_OPTIONS = [
  "Next.js", "React", "Tailwind", "Supabase", "Cloudflare", "Postgres",
  "Drizzle", "Prisma", "tRPC", "Vercel", "Hono", "Bun", "Node",
  "Python", "FastAPI", "Django", "Go", "Rust", "Swift", "Kotlin",
  "Three.js", "WebXR", "Stripe", "OpenAI", "Anthropic",
];
const relTime = (d) => {
  if (!d) return "—";
  const t = typeof d === "string" ? new Date(d).getTime() : d;
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s/86400)}d ago`;
  if (s < 31536000) return `${Math.floor(s/2592000)}mo ago`;
  return `${Math.floor(s/31536000)}y ago`;
};
const prettyHost = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };

// ====================================================================
// ROUTER
// ====================================================================
function useRoute() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    window.addEventListener("nro:navigate", (e) => setPath(e.detail));
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}
function navigate(to) {
  if (to === location.pathname) return;
  history.pushState({}, "", to);
  window.dispatchEvent(new CustomEvent("nro:navigate", { detail: to }));
  window.scrollTo(0, 0);
}
function Link({ href, children, class: cls, onClick }) {
  return html`<a href=${href} class=${cls} onClick=${(e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    onClick && onClick();
    navigate(href);
  }}>${children}</a>`;
}

// ====================================================================
// AUTH STATE (global signal-ish)
// ====================================================================
const auth = {
  user: null,
  operator: null,
  loading: true,
  listeners: new Set(),
  set(state) { Object.assign(this, state); this.listeners.forEach(fn => fn()); },
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
};
async function loadOperator(userId) {
  if (!supaConfigured || !userId) return null;
  try {
    // Pull operator + guild affiliation (max 1 via unique constraint) in one round-trip.
    const { data, error } = await supa.from("operators").select("*, guild_members(role, joined_at, guild:guilds(*))").eq("id", userId).maybeSingle();
    if (error) { console.warn("loadOperator:", error.message); return null; }
    if (!data) return null;
    // Flatten: data.guild = {...} or null
    const member = (data.guild_members || [])[0];
    data.guild = member?.guild || null;
    data.guild_role = member?.role || null;
    delete data.guild_members;
    return data;
  } catch (e) {
    console.warn("loadOperator threw:", e?.message || e);
    return null;
  }
}
async function bootAuth() {
  if (!supaConfigured) { auth.set({ loading: false }); return; }
  const { data: { user } } = await supa.auth.getUser();
  const operator = user ? await loadOperator(user.id) : null;
  auth.set({ user, operator, loading: false });
  supa.auth.onAuthStateChange(async (_evt, session) => {
    const u = session?.user ?? null;
    const op = u ? await loadOperator(u.id) : null;
    auth.set({ user: u, operator: op });
  });
}
function useAuth() {
  const [, force] = useState(0);
  useEffect(() => auth.on(() => force(n => n + 1)), []);
  return auth;
}

// ====================================================================
// SHARED UI
// ====================================================================
function Nav({ variant = "public" }) {
  const a = useAuth();
  const handle = a.operator?.handle;
  return html`
    ${!supaConfigured ? html`<div style="background:rgba(252,211,77,.08);border-bottom:1px solid rgba(252,211,77,.3);padding:6px 24px;font-family:var(--mono);font-size:10px;letter-spacing:2px;color:#fbbf24;text-align:center">// CONFIG PENDING · SUPABASE + MAPBOX SECRETS NOT SET · DATA + AUTH OFFLINE</div>` : null}
    <header class="nav">
      <div class="nav-inner">
        <${Link} href="/" class="brand">
          <span class="brand-mark">NRO</span>
          <span class="brand-text">OPERATOR CORE <span class="v">v0.1</span></span>
        </${Link}>
        <${Link} href="/grid" class="nav-link">Grid</${Link}>
        <${Link} href="/guilds" class="nav-link">Guilds</${Link}>
        ${variant === "command" ? html`
          <${Link} href="/command" class="nav-link">Deck</${Link}>
          <${Link} href="/command/deploy" class="nav-link">Deploy</${Link}>
        ` : null}
        <div class="spacer"></div>
        ${handle ? html`
          <${Link} href=${`/u/${handle}`} class="nav-link">@${handle}</${Link}>
          ${variant !== "command" ? html`<${Link} href="/command" class="btn btn-glow">COMMAND</${Link}>` : null}
        ` : html`<${Link} href="/login" class="btn btn-glow">ENLIST</${Link}>`}
      </div>
    </header>`;
}

// ====================================================================
// WALL OF WORK · portfolio helpers + card component
// ====================================================================
const MONETIZATION_LABELS = {
  subscription: { label: "Subscription", color: "#67e8f9", pillBg: "rgba(103,232,249,.1)", pillBorder: "rgba(103,232,249,.5)" },
  lifetime:     { label: "Lifetime",     color: "#a78bfa", pillBg: "rgba(167,139,250,.1)", pillBorder: "rgba(167,139,250,.5)" },
  whitelabel:   { label: "White-label",  color: "#f59e0b", pillBg: "rgba(245,158,11,.1)",  pillBorder: "rgba(245,158,11,.5)" },
  acquired:     { label: "Acquired",     color: "#fbbf24", pillBg: "rgba(251,191,36,.1)",  pillBorder: "rgba(251,191,36,.6)" },
  open_source:  { label: "Open Source",  color: "#34d399", pillBg: "rgba(52,211,153,.1)",  pillBorder: "rgba(52,211,153,.5)" },
  free:         { label: "Free",         color: "#9a9aa3", pillBg: "rgba(154,154,163,.1)", pillBorder: "rgba(154,154,163,.4)" },
};
function fmtMoney(cents) {
  if (!cents || cents <= 0) return "—";
  const n = cents / 100;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}
function fmtUsers(n) {
  if (!n || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}
function WorkCard({ p }) {
  const mon = MONETIZATION_LABELS[p.monetization] || MONETIZATION_LABELS.free;
  const cover = p.cover_url || null;
  const showMrr = p.mrr_cents > 0;
  const showArr = !showMrr && p.arr_cents > 0;
  const showLifetime = !showMrr && !showArr && p.last_sale_cents > 0;
  const revLabel = showMrr ? "MRR" : showArr ? "ARR" : showLifetime ? "SOLD" : "REV";
  const revValue = showMrr ? fmtMoney(p.mrr_cents) : showArr ? fmtMoney(p.arr_cents) : showLifetime ? fmtMoney(p.last_sale_cents) : "—";
  const usersValue = fmtUsers(p.users_count);
  const goldRev = p.monetization === 'acquired' || p.monetization === 'whitelabel';
  // High-revenue cards get a gold accent halo. Threshold: $50k+ in any flavor.
  const totalRevCents = (p.mrr_cents || 0) + (p.arr_cents || 0) + (p.last_sale_cents || 0);
  const highRev = totalRevCents >= 5_000_000; // $50,000+
  return html`<article class=${`work-card ${highRev ? 'high-rev' : ''}`}>
    <div class="cover" style=${cover ? `background-image:url(${cover})` : ""}>
      <span class="status-pill" style=${`color:${mon.color};border-color:${mon.pillBorder};background:${mon.pillBg}`}>${mon.label}</span>
    </div>
    <div class="body">
      <h3>${p.name}</h3>
      ${p.tagline ? html`<div class="tagline">${p.tagline}</div>` : null}
      ${p.stack?.length ? html`<div class="stack">${p.stack.slice(0, 6).map(s => html`<span key=${s}>${s}</span>`)}</div>` : null}
    </div>
    <div class="stats">
      <div><div class="lbl">${revLabel}</div><div class=${`val ${goldRev ? 'gold' : ''} ${revValue === '—' ? 'dim' : ''}`}>${revValue}</div></div>
      <div><div class="lbl">Users</div><div class=${`val ${usersValue === '—' ? 'dim' : ''}`}>${usersValue}</div></div>
      <div><div class="lbl">Status</div><div class="val dim" style="text-transform:uppercase;font-size:11px">${p.status}</div></div>
    </div>
    ${(p.link_live || p.link_repo || p.buyer) ? html`<div class="links">
      ${p.link_live ? html`<a href=${p.link_live} target="_blank" rel="noopener noreferrer">↗ LIVE</a>` : null}
      ${p.link_repo ? html`<a href=${p.link_repo} target="_blank" rel="noopener noreferrer">⌥ REPO</a>` : null}
      ${p.buyer ? html`<span style="margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--mute);letter-spacing:1.5px">→ ${p.buyer}</span>` : null}
    </div>` : null}
  </article>`;
}

// Cold-arrival CTA for unauthed visitors landing on a public operator/guild
// page from social media. The dossier IS the landing page → conversion hook.
function ColdArrivalBanner({ op, guild }) {
  const target = op ? `@${op.handle}` : guild ? `${guild.sigil || "◈"} ${guild.name}` : "this operator";
  const enlistHref = op ? `/r/${op.handle}` : "/login";
  return html`<div style="margin-bottom:20px;padding:16px 20px;border:1px solid rgba(103,232,249,.4);background:linear-gradient(180deg, rgba(103,232,249,.07), rgba(10,10,10,.85));backdrop-filter:blur(8px);display:flex;flex-wrap:wrap;align-items:center;gap:14px;box-shadow:0 0 32px -10px rgba(103,232,249,.55)">
    <div style="flex:1;min-width:260px">
      <div style="font-family:var(--mono);font-size:10px;letter-spacing:3px;color:var(--glow);margin-bottom:4px">// COLD ARRIVAL · NRO INTELLIGENCE NETWORK</div>
      <div style="font-family:var(--display);font-size:20px;font-weight:600;color:var(--text);line-height:1.25">${target} is on the Grid. ${op ? "You could be next to them." : "You could join them."}</div>
    </div>
    <${Link} href=${enlistHref} class="btn btn-primary">ENLIST ${op ? `· VIA @${op.handle}` : ""}<span>→</span></${Link}>
  </div>`;
}

// Inline-SVG glyphs per rank tier. Used in operator markers on the Signal Map.
function RankGlyph({ rank }) {
  switch (rank) {
    case "SOVEREIGN":
      // Crown over hex — apex
      return html`<svg viewBox="0 0 24 24" fill="currentColor" style="filter:drop-shadow(0 0 6px currentColor)">
        <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="currentColor" opacity="0.95"/>
        <path d="M6 8 L9 5 L12 9 L15 5 L18 8 L18 11 L6 11 Z" fill="rgba(10,10,10,.65)"/>
        <circle cx="9" cy="6" r="0.8" fill="currentColor"/>
        <circle cx="12" cy="9.5" r="0.8" fill="currentColor"/>
        <circle cx="15" cy="6" r="0.8" fill="currentColor"/>
      </svg>`;
    case "COMMANDER":
      // Filled shield with chevron
      return html`<svg viewBox="0 0 24 24" fill="currentColor" style="filter:drop-shadow(0 0 5px currentColor)">
        <path d="M12 2 L21 5 L21 12 C21 17 17 21 12 22 C7 21 3 17 3 12 L3 5 Z" fill="currentColor" opacity="0.92"/>
        <path d="M7 10 L12 6 L17 10 L17 13 L12 9 L7 13 Z" fill="rgba(10,10,10,.7)"/>
      </svg>`;
    case "ARCHITECT":
      // Filled diamond
      return html`<svg viewBox="0 0 24 24" fill="currentColor" style="filter:drop-shadow(0 0 4px currentColor)">
        <polygon points="12,2 22,12 12,22 2,12" fill="currentColor" opacity="0.92"/>
        <polygon points="12,7 17,12 12,17 7,12" fill="rgba(10,10,10,.55)"/>
      </svg>`;
    case "OPERATOR":
      // Filled hexagon
      return html`<svg viewBox="0 0 24 24" fill="currentColor" style="filter:drop-shadow(0 0 3px currentColor)">
        <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="currentColor" opacity="0.9"/>
        <polygon points="12,7 17,9.5 17,14.5 12,17 7,14.5 7,9.5" fill="rgba(10,10,10,.55)"/>
      </svg>`;
    default:
      // INITIATE — thin ring
      return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" opacity="0.9"/>
        <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
      </svg>`;
  }
}

// Cinematic skeleton placeholders — used while async data is in-flight.
// Mirrors the layout each page will have once loaded so layout doesn't pop.
function DossierSkeleton() {
  return html`<${Nav}/>
    <main class="container" style="padding:40px 24px;max-width:1024px">
      <${Panel} corners=${true}>
        <div class="panel-head"><span class="lbl">// LOADING DOSSIER</span><span class="hint">SCANNING TELEMETRY…</span></div>
        <div class="dossier-skeleton">
          <div class="skel skel-tile ds-avatar" style="aspect-ratio:1"></div>
          <div class="ds-body">
            <div class="skel skel-bar" style="width:55%"></div>
            <div class="skel skel-line" style="width:35%"></div>
            <div class="skel skel-line" style="width:80%"></div>
          </div>
          <div class="skel skel-bar" style="width:110px"></div>
        </div>
        <div class="stats-row" style="border-top:1px solid var(--line)">
          ${[0,1,2,3,4].map(i => html`<div class="stat skel-stat" key=${i}><div class="skel skel-line"></div><div class="skel skel-line"></div></div>`)}
        </div>
      </${Panel}>
    </main>`;
}
function CommandSkeleton() {
  return html`<${Nav} variant="command"/>
    <main class="container" style="padding:40px 24px;max-width:1024px">
      <div style="margin-bottom:28px">
        <div class="skel skel-line" style="width:160px;margin-bottom:8px"></div>
        <div class="skel skel-bar" style="width:55%"></div>
      </div>
      <${Panel} corners=${true} glow=${true}>
        <div class="panel-head"><span class="lbl">// LOADING DECK</span><span class="hint">SCANNING TELEMETRY…</span></div>
        <div class="dossier-skeleton">
          <div class="skel skel-tile ds-avatar" style="aspect-ratio:1;width:80px;height:80px"></div>
          <div class="ds-body" style="gap:14px">
            <div class="skel skel-bar" style="width:200px"></div>
            <div class="skel skel-line" style="width:100%"></div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:6px">
              ${[0,1,2,3].map(i => html`<div key=${i}><div class="skel skel-line" style="width:60%;margin-bottom:6px"></div><div class="skel skel-line" style="height:18px;width:80%"></div></div>`)}
            </div>
          </div>
        </div>
      </${Panel}>
    </main>`;
}
function GuildSkeleton() {
  return html`<${Nav}/>
    <main class="container" style="padding:40px 24px;max-width:1024px">
      <${Panel} corners=${true}>
        <div class="panel-head"><span class="lbl">// LOADING GUILD</span><span class="hint">SCANNING FACTION…</span></div>
        <div class="dossier-skeleton">
          <div class="skel" style="width:96px;height:96px"></div>
          <div class="ds-body">
            <div class="skel skel-bar" style="width:240px"></div>
            <div class="skel skel-line" style="width:120px"></div>
            <div class="skel skel-line" style="width:80%"></div>
          </div>
          <div class="skel skel-bar" style="width:100px"></div>
        </div>
        <div class="stats-row" style="border-top:1px solid var(--line)">
          ${[0,1,2,3].map(i => html`<div class="stat skel-stat" key=${i}><div class="skel skel-line"></div><div class="skel skel-line"></div></div>`)}
        </div>
      </${Panel}>
    </main>`;
}

function GuildBadge({ guild, size = "md" }) {
  if (!guild) return null;
  const padding = size === "sm" ? "2px 8px" : "4px 12px";
  const fontSize = size === "sm" ? 10 : 11;
  return html`<${Link} href=${`/guild/${guild.slug}`} style=${`display:inline-flex;align-items:center;gap:6px;padding:${padding};border:1px solid ${guild.color}66;background:${guild.color}14;color:${guild.color};font-family:var(--mono);font-size:${fontSize}px;letter-spacing:2px;text-decoration:none;text-transform:uppercase;box-shadow:0 0 18px -6px ${guild.color}`}>
    <span style="font-size:13px">${guild.sigil || "◈"}</span>${guild.name}
  </${Link}>`;
}

function RankBadge({ rank, size }) {
  const cls = `rank-badge rank-${rank}` + (size === "lg" ? " rank-lg" : "");
  return html`<span class=${cls} style=${size === "lg" ? "padding:6px 14px;font-size:11px" : ""}><span class="pip"></span>${rank}</span>`;
}
function KindBadge({ kind }) {
  return html`<span class=${`kind-badge kind-${kind}`}>${KIND_LABEL[kind] || kind}</span>`;
}
function Avatar({ op, size = 36 }) {
  const initial = (op?.display_name?.[0] || op?.handle?.[0] || "?").toUpperCase();
  return html`<div class="avatar ring" style=${`width:${size}px;height:${size}px;font-size:${Math.floor(size*0.42)}px;color:var(--dim);font-family:var(--mono)`}>
    ${op?.avatar_url ? html`<img src=${op.avatar_url} style=${`width:${size}px;height:${size}px;object-fit:cover`}/>` : initial}
  </div>`;
}
function Panel({ corners, glow, class: cls = "", children, style }) {
  return html`<div class=${`panel ${corners ? "corners" : ""} ${glow ? "glow" : ""} ${cls}`} style=${style}>${children}</div>`;
}
function Stat({ label, value, accent, hint }) {
  return html`<div class="stat"><span class="lbl">${label}</span><span class=${`val ${accent || ""}`}>${value}</span>${hint ? html`<span class="hint">${hint}</span>` : null}</div>`;
}

// Animated count-up for numeric stats. Visible from-0 roll-up on first render.
// Defaults: 900ms duration, ease-out cubic. Falls back to instant for non-numeric.
function CountUp({ to, durationMs = 900, format }) {
  const target = Number(to) || 0;
  const [v, setV] = useState(0);
  const startRef = useRef(null);
  useEffect(() => {
    if (typeof to !== "number" && isNaN(Number(to))) { setV(target); return; }
    startRef.current = null;
    let raf;
    const tick = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setV(target);
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [target, durationMs]);
  if (format) return html`<span>${format(v)}</span>`;
  // Integer rendering with thousands separator
  return html`<span>${Math.round(v).toLocaleString()}</span>`;
}
function RankProgress({ rank, xp }) {
  const i = RANKS.findIndex(t => t.name === rank);
  const cur = RANKS[i] || RANKS[0];
  const nxt = RANKS[i + 1];
  const pct = nxt ? Math.max(0, Math.min(100, Math.round(((xp - cur.min) / (nxt.min - cur.min)) * 100))) : 100;
  return html`
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <${RankBadge} rank=${rank} />
        <span style="font-family:var(--mono);font-size:10px;letter-spacing:2px;color:${nxt ? 'var(--mute)' : 'var(--gold)'}">
          ${nxt ? `→ ${nxt.name} · ${nxt.min - xp} XP TO GO` : 'APEX TIER'}
        </span>
      </div>
      <div class="progress"><div class="bar" style=${`width:${pct}%`}></div></div>
    </div>`;
}

// ====================================================================
// LIVE TICKER
// ====================================================================
function useLiveTicker(initial = []) {
  const [items, setItems] = useState(initial);
  useEffect(() => {
    if (!supaConfigured) return;
    let ignore = false;
    supa.from("deployments").select("id,kind,title,created_at,operator:operators!inner(handle,display_name)").order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (!ignore && data) setItems(data.map(normalizeTicker)); });
    const ch = supa.channel("nro:ticker").on("postgres_changes", { event: "INSERT", schema: "public", table: "deployments" }, async (payload) => {
      const r = payload.new;
      const { data: op } = await supa.from("operators").select("handle,display_name").eq("id", r.operator_id).maybeSingle();
      if (!op) return;
      setItems(prev => [{ id: r.id, kind: r.kind, title: r.title, created_at: r.created_at, handle: op.handle }, ...prev].slice(0, 30));
    }).subscribe();
    return () => { ignore = true; supa.removeChannel(ch); };
  }, []);
  return items;
}
const normalizeTicker = (r) => ({
  id: r.id, kind: r.kind, title: r.title, created_at: r.created_at,
  handle: Array.isArray(r.operator) ? r.operator[0]?.handle : r.operator?.handle,
});
function ActivityTicker() {
  const items = useLiveTicker();
  if (!items.length) return html`<div style="font-family:var(--mono);font-size:11px;color:var(--mute)"><span class="dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--mute);margin-right:8px"></span>AWAITING FIRST DEPLOYMENT</div>`;
  const stream = [...items, ...items];
  return html`
    <div class="marquee-wrap">
      <div class="marquee">
        ${stream.map((it, i) => html`<span key=${i} style="display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px">
          <span class="dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--glow);animation:pulse 1.6s infinite"></span>
          <span style="color:var(--glow)">${(KIND_LABEL[it.kind] || it.kind).toUpperCase()}</span>
          <span style="color:var(--mute)">·</span>
          <span style="color:var(--dim)">@${it.handle}</span>
          <span style="color:var(--mute)">·</span>
          <span style="color:var(--text)">${it.title}</span>
          <span style="color:var(--mute)">·</span>
          <span style="color:var(--mute)">${relTime(it.created_at)}</span>
        </span>`)}
      </div>
    </div>`;
}

// ====================================================================
// LANDING
// ====================================================================
function Landing() {
  const [stats, setStats] = useState({ operators: 0, deployments: 0, guilds: 0, shipsThisWeek: 0, totalMrrCents: 0, totalUsers: 0 });
  const [top, setTop] = useState([]);
  useEffect(() => {
    if (!supaConfigured) return;
    const sinceWeek = new Date(Date.now() - 7 * 86400000).toISOString();
    Promise.all([
      supa.from("operators").select("*", { count: "exact", head: true }),
      supa.from("deployments").select("*", { count: "exact", head: true }),
      supa.from("operators").select("id,handle,display_name,avatar_url,rank,xp,momentum,signal_score,streak_days").order("momentum", { ascending: false }).limit(5),
      supa.from("guilds").select("*", { count: "exact", head: true }),
      supa.from("deployments").select("*", { count: "exact", head: true }).gte("created_at", sinceWeek),
      supa.from("projects").select("mrr_cents,arr_cents,last_sale_cents,users_count"),
    ]).then(([o, d, t, g, w, pj]) => {
      let totalMrrCents = 0, totalUsers = 0;
      for (const p of (pj.data || [])) {
        // Combine: monthly equivalent of all revenue forms
        totalMrrCents += (p.mrr_cents || 0) + Math.floor((p.arr_cents || 0) / 12) + (p.last_sale_cents || 0);
        totalUsers += (p.users_count || 0);
      }
      setStats({ operators: o.count || 0, deployments: d.count || 0, guilds: g.count || 0, shipsThisWeek: w.count || 0, totalMrrCents, totalUsers });
      setTop(t.data || []);
    });
  }, []);
  return html`
    <${Nav} />
    <main class="container hero" style="padding-top:96px">
      <span class="tag"><span class="dot"></span>// SIGNAL ACTIVE · NEXT REALM OPERATORS</span>
      <h1>Builders don't post.<br/><span class="glow">Operators deploy.</span></h1>
      <p>NRO is the operator dossier for builders who ship. Log every deployment, climb the rank ladder, lead the Grid. Your build-in-public timeline becomes a live military record — not a feed of likes.</p>
      <div class="hero-cta">
        <${Link} href="/login" class="btn btn-primary">ENLIST AS OPERATOR <span>→</span></${Link}>
        <${Link} href="/grid" class="btn">SURVEY THE GRID</${Link}>
      </div>
      <${Panel} corners=${true}>
        <div class="panel-head"><span class="lbl">// NETWORK PULSE · LIVE</span><span class="hint">PUBLIC INTELLIGENCE LAYER</span></div>
        <div class="stats-row">
          <${Stat} label="Operators" value=${html`<${CountUp} to=${stats.operators}/>`} accent="glow" />
          <${Stat} label="Guilds" value=${html`<${CountUp} to=${stats.guilds}/>`} accent="glow" />
          <${Stat} label="Deployments" value=${html`<${CountUp} to=${stats.deployments}/>`} accent="glow" />
          <${Stat} label="Ships · 7D" value=${html`<${CountUp} to=${stats.shipsThisWeek}/>`} hint="LAST WEEK" />
          <${Stat} label="Tracked Rev" value=${html`<${CountUp} to=${stats.totalMrrCents} format=${fmtMoney}/>`} accent="gold" hint="MONTHLY EQUIV" />
          <${Stat} label="Reach" value=${html`<${CountUp} to=${stats.totalUsers} format=${fmtUsers}/>`} hint="USERS COMBINED" />
        </div>
        <div style="border-top:1px solid var(--line);padding:12px 16px"><${ActivityTicker} /></div>
      </${Panel}>

      <section class="doctrine">
        ${[
          ["Earn the rank.", "INITIATE → OPERATOR → ARCHITECT → COMMANDER → SOVEREIGN. Every deployment moves the dial. No paid tiers."],
          ["Momentum beats hype.", "The Grid sorts by activity in the last 14 days, not lifetime points. Ship today or fall."],
          ["Public record.", "Every deployment is a permalink with a HUD card. Built to be shared. Forged to compound."],
        ].map(([t, p]) => html`
          <${Panel} class="card">
            <span style="font-family:var(--mono);font-size:10px;letter-spacing:3px;color:var(--glow)">// DOCTRINE</span>
            <h3>${t}</h3>
            <p>${p}</p>
          </${Panel}>
        `)}
      </section>

      <section style="margin-top:64px">
        <${Panel}>
          <div class="panel-head"><span class="lbl">// TOP MOMENTUM · 14D</span><${Link} href="/grid" class="hint" style="color:var(--glow);text-decoration:none">VIEW ALL →</${Link}></div>
          ${top.length === 0 ? html`<div style="padding:48px 16px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--mute)">AWAITING FIRST OPERATORS · BE THE FIRST CALLSIGN.</div>`
            : top.map((o, i) => html`
              <${Link} href=${`/u/${o.handle}`} class="row" key=${o.id}>
                <span class="rank-num">${String(i+1).padStart(2,"0")}</span>
                <${Avatar} op=${o} size=${36} />
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:8px"><span class="name">${o.display_name}</span><span class="handle">@${o.handle}</span></div>
                  <div class="meta"><${RankBadge} rank=${o.rank} /><span class="handle">${o.xp} XP</span></div>
                </div>
                <div class="right"><div class="num">${o.momentum}</div><div class="sub">MOMENTUM</div></div>
              </${Link}>
            `)}
        </${Panel}>
      </section>
    </main>
    <${Footer} />`;
}

function Footer() {
  return html`<footer class="footer"><div class="inner">
    <div>NEXT REALM INTERACTIVE · OPERATOR CORE v0.1</div>
    <div style="display:flex;gap:14px">
      <${Link} href="/privacy" style="color:var(--mute)">PRIVACY</${Link}>
      <${Link} href="/terms" style="color:var(--mute)">TERMS</${Link}>
      <${Link} href="/grid" style="color:var(--dim)">ENTER THE GRID →</${Link}>
    </div>
  </div></footer>`;
}

// ====================================================================
// LOGIN
// ====================================================================
function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  // Capture ?via=handle into sessionStorage so it survives the magic-link round-trip.
  // Onboarding reads this and writes recruited_by on operator insert.
  const via = useMemo(() => {
    try {
      const url = new URL(location.href);
      const v = url.searchParams.get("via");
      if (v && /^[a-z0-9_]{2,24}$/i.test(v)) {
        sessionStorage.setItem("nro:via", v.toLowerCase());
        return v.toLowerCase();
      }
      return sessionStorage.getItem("nro:via");
    } catch { return null; }
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  async function submit(e) {
    e.preventDefault();
    if (busy || cooldown > 0) return;
    setErr(null); setBusy(true);
    if (!supaConfigured) { setErr("Supabase not configured yet."); setBusy(false); return; }
    try {
      const { error } = await supa.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: SITE + "/auth/callback" } });
      if (error) throw error;
      setSent(true);
      setCooldown(45);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally { setBusy(false); }
  }
  return html`
    <${Nav} />
    <main class="container center">
      <span class="tag">// ENLISTMENT TERMINAL</span>
      <h1 style="font-family:var(--display);font-size:44px;font-weight:700;line-height:1.05;margin:16px 0 12px">Identify yourself,<br/><span class="glow">operator.</span></h1>
      ${via ? html`<div style="margin:0 0 18px;padding:10px 14px;border:1px solid rgba(103,232,249,.4);background:var(--glowsoft);font-family:var(--mono);font-size:11px;color:var(--glow);letter-spacing:1.5px">
        // RECRUITED BY <${Link} href=${`/u/${via}`} style="color:var(--glow);text-decoration:underline">@${via}</${Link}>
      </div>` : null}
      <p style="color:var(--dim);font-size:14px;margin:0 0 24px">We send a single-use sign-in link to your email. No passwords. No theatrics.</p>
      <${Panel} corners=${true}>
        <div class="panel-head"><span class="lbl">// AUTH · MAGIC LINK</span></div>
        <form onSubmit=${submit} style="padding:20px">
          ${err ? html`<div style="margin-bottom:14px;padding:8px 12px;border:1px solid rgba(248,113,113,.4);background:rgba(248,113,113,.05);font-family:var(--mono);font-size:11px;color:var(--danger)">${err.toUpperCase()}</div>` : null}
          ${sent ? html`<div style="margin-bottom:14px;padding:8px 12px;border:1px solid rgba(103,232,249,.4);background:var(--glowsoft);font-family:var(--mono);font-size:11px;color:var(--glow);display:flex;justify-content:space-between;align-items:center">
            <span>TRANSMISSION SENT · CHECK YOUR INBOX</span>
            ${cooldown > 0 ? html`<span style="color:var(--mute)">RESEND IN ${cooldown}s</span>` : html`<button class="btn" style="padding:2px 8px;font-size:9px" onClick=${submit}>RESEND</button>`}
          </div>` : null}
          <label class="field"><span class="lbl">Operator Email</span><input class="input" type="email" required autoFocus value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="callsign@signal.net"/></label>
          <button class="btn btn-primary btn-block" disabled=${busy || cooldown > 0} type="submit">${busy ? "TRANSMITTING…" : cooldown > 0 ? `WAIT ${cooldown}s` : "SEND SIGN-IN LINK"}</button>
        </form>
      </${Panel}>
      <${Link} href="/" style="display:block;margin-top:16px;font-family:var(--mono);font-size:10px;color:var(--mute);letter-spacing:3px">← BACK TO BASE</${Link}>
    </main>`;
}

// ====================================================================
// ONBOARDING
// ====================================================================
function Onboarding() {
  const a = useAuth();
  const [handle, setHandle] = useState("");
  const [name, setName] = useState(a.user?.email?.split("@")[0] || "");
  const [tagline, setTagline] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!a.loading && !a.user) navigate("/login"); if (!a.loading && a.operator) navigate("/command"); }, [a.loading, a.user, a.operator]);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr(null); setBusy(true);
    try {
      if (!/^[a-z0-9_]{2,24}$/.test(handle)) throw new Error("CALLSIGN: 2–24 chars, lowercase, numbers, underscore.");
      let lat = null, lng = null;
      if (city.trim()) {
        const geo = await geocodeUS([city, state].filter(Boolean).join(", "));
        if (geo) { lat = geo.lat; lng = geo.lng; }
      }
      if (lat == null) { const fb = fallbackGeo(handle); lat = fb.lat; lng = fb.lng; }

      // Recruit attribution — read sessionStorage (set by Login from ?via=).
      // Look up the recruiter operator id; ignore silently if not found.
      let recruitedBy = null;
      try {
        const via = sessionStorage.getItem("nro:via");
        if (via && /^[a-z0-9_]{2,24}$/.test(via)) {
          const { data } = await supa.from("operators").select("id").eq("handle", via).maybeSingle();
          if (data?.id && data.id !== a.user.id) recruitedBy = data.id;
        }
      } catch {}

      const row = {
        id: a.user.id, handle: handle.toLowerCase(), display_name: name.trim().slice(0, 48) || handle,
        tagline: tagline.trim().slice(0, 120) || null, city: city.trim() || null, state: state.trim().toUpperCase() || null,
        lat, lng, recruited_by: recruitedBy,
      };
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 20000);
      let res;
      try { res = await insertOperator(row, ac.signal); } finally { clearTimeout(timer); }
      if (!res.ok) throw new Error(res.error || "Insert failed.");
      const finalOp = res.data || { ...row, rank: "INITIATE", xp: 0, momentum: 0, signal_score: 0, streak_days: 0, followers: 0, active_users: 0, recruit_count: 0, created_at: new Date().toISOString() };
      auth.set({ operator: finalOp });
      try { sessionStorage.removeItem("nro:via"); } catch {}
      broadcastNros(TX.onboarding(finalOp));
      loadOperator(a.user.id).then(fresh => { if (fresh) auth.set({ operator: fresh }); });
      navigate("/command");
    } catch (e) {
      console.error("[NRO:onboarding] failed:", e);
      setErr(String(e?.message || e));
      setBusy(false);
    }
  }
  if (a.loading || !a.user) return html`<${Nav} /><main class="container center"><span class="tag">// INITIALIZING…</span></main>`;
  return html`
    <${Nav} />
    <main class="container" style="max-width:680px;padding:64px 24px">
      <span class="tag">// INITIATION SEQUENCE</span>
      <h1 style="font-family:var(--display);font-size:40px;font-weight:700;margin:14px 0 8px">Forge your callsign.</h1>
      <p style="color:var(--dim);margin:0 0 24px">You start at <span style="color:var(--glow);font-family:var(--mono)">INITIATE</span>. Your handle is permanent. Choose with intent.</p>
      <${Panel} corners=${true}>
        <div class="panel-head"><span class="lbl">// OPERATOR DOSSIER · NEW</span></div>
        <form onSubmit=${submit} style="padding:20px">
          <label class="field"><span class="lbl">Callsign</span>
            <div style="display:flex;align-items:stretch;border:1px solid var(--line2);background:rgba(0,0,0,.4)">
              <span style="padding:0 12px;display:flex;align-items:center;font-family:var(--mono);color:var(--mute)">@</span>
              <input class="input" style="border:0;background:transparent" required value=${handle} onInput=${(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} maxLength=${24} placeholder="ghost_signal"/>
            </div>
          </label>
          <label class="field"><span class="lbl">Display Name</span><input class="input" required value=${name} onInput=${(e) => setName(e.target.value)} maxLength=${48}/></label>
          <label class="field"><span class="lbl">Tagline</span><input class="input" value=${tagline} onInput=${(e) => setTagline(e.target.value)} maxLength=${120} placeholder="Forging cinematic systems for indie operators."/></label>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px">
            <label class="field"><span class="lbl">City</span><input class="input" value=${city} onInput=${(e) => setCity(e.target.value)} maxLength=${48} placeholder="Los Angeles"/></label>
            <label class="field"><span class="lbl">State</span><input class="input" style="text-transform:uppercase;font-family:var(--mono)" value=${state} onInput=${(e) => setState(e.target.value.toUpperCase().slice(0,2))} maxLength=${2} placeholder="CA"/></label>
          </div>
          ${err ? html`<p style="font-family:var(--mono);font-size:11px;color:var(--danger);margin:8px 0">${err}</p>` : null}
          <button class="btn btn-primary btn-block" type="submit" disabled=${busy || handle.length < 2}>${busy ? "FORGING DOSSIER…" : "INITIATE"}</button>
        </form>
      </${Panel}>
    </main>`;
}

// ====================================================================
// AUTH CALLBACK (Supabase OTP redirect)
// ====================================================================
function AuthCallback() {
  useEffect(() => {
    (async () => {
      const url = new URL(location.href);
      const code = url.searchParams.get("code");
      const next = url.searchParams.get("next") || "/command";
      if (code) await supa.auth.exchangeCodeForSession(code);
      const { data: { user } } = await supa.auth.getUser();
      const op = user ? await loadOperator(user.id) : null;
      auth.set({ user, operator: op, loading: false });
      navigate(op ? next : "/onboarding");
    })();
  }, []);
  return html`<${Nav} /><main class="container center"><span class="tag">// AUTHENTICATING…</span></main>`;
}

// ====================================================================
// COMMAND DECK
// ====================================================================
function Command() {
  const a = useAuth();
  const [deps, setDeps] = useState([]);
  const [projects, setProjects] = useState([]);
  useEffect(() => { if (!a.loading && !a.user) navigate("/login"); if (!a.loading && a.user && !a.operator) navigate("/onboarding"); }, [a.loading, a.user, a.operator]);
  useEffect(() => {
    if (!a.user) return;
    supa.from("deployments").select("*").eq("operator_id", a.user.id).order("created_at", { ascending: false }).limit(8).then(({ data }) => setDeps(data || []));
    supa.from("projects").select("*").eq("operator_id", a.user.id).order("created_at", { ascending: false }).then(({ data }) => setProjects(data || []));
  }, [a.user?.id]);
  if (!a.operator) return html`<${CommandSkeleton}/>`;
  const op = a.operator;
  // streak risk: last deployment was yesterday or earlier today still counts; older = streak about to die
  const lastTs = op.last_deployment_at ? new Date(op.last_deployment_at).getTime() : null;
  const hoursSince = lastTs ? Math.floor((Date.now() - lastTs) / 3_600_000) : 999;
  const streakAtRisk = op.streak_days > 0 && hoursSince > 24 && hoursSince < 48;
  const streakBroken = op.streak_days === 0 && (lastTs ? hoursSince > 24 : false);
  const daysSinceLast = lastTs ? Math.floor(hoursSince / 24) : 999;
  return html`
    <${Nav} variant="command" />
    <main class="container" style="padding:40px 24px;max-width:1024px">
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;margin-bottom:32px">
        <div>
          <span class="tag">// COMMAND DECK</span>
          <h1 style="font-family:var(--display);font-size:32px;font-weight:700;margin:8px 0 0">Welcome back, <span class="glow">${op.display_name}</span>.</h1>
        </div>
        <div style="display:flex;align-items:center;gap:14px">
          <${Link} href=${`/u/${op.handle}`} style="font-family:var(--mono);font-size:10px;letter-spacing:2px;color:var(--dim)">VIEW PUBLIC DOSSIER ↗</${Link}>
          <button class="btn" aria-label="Sign out" onClick=${async () => { await supa.auth.signOut(); navigate("/"); }}>SIGN OUT</button>
        </div>
      </div>
      ${streakAtRisk ? html`<div style="margin-bottom:16px;border:1px solid rgba(252,211,77,.5);background:rgba(252,211,77,.06);padding:10px 16px;display:flex;align-items:center;gap:12px">
        <span style="font-family:var(--mono);font-size:11px;color:#fbbf24;letter-spacing:2px">⚠ STREAK AT RISK</span>
        <span style="font-size:13px;color:var(--text)">Your ${op.streak_days}-day streak ends in ${48 - hoursSince}h. Log an iteration today to keep it.</span>
        <${Link} href="/command/deploy" class="btn btn-glow" style="margin-left:auto">DEPLOY NOW</${Link}>
      </div>` : null}
      <${Panel} corners=${true} glow=${true}>
        <div class="panel-head"><span class="lbl">// OPERATOR STATUS</span></div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:24px;padding:24px;align-items:start">
          <${Avatar} op=${op} size=${80} />
          <div style="display:flex;flex-direction:column;gap:14px">
            <div style="display:flex;align-items:center;gap:12px"><${RankBadge} rank=${op.rank} size="lg"/><span style="font-family:var(--mono);font-size:12px;color:var(--mute)">@${op.handle}</span></div>
            <${RankProgress} rank=${op.rank} xp=${op.xp} />
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
              <${Stat} label="XP" value=${op.xp} accent="glow" />
              <${Stat} label="Momentum" value=${op.momentum} accent="glow" hint="14D" />
              <${Stat} label="Streak" value=${op.streak_days} hint="DAYS" />
              <${Stat} label="Signal" value=${Number(op.signal_score || 0).toFixed(1)} accent="glow" hint="0–10" />
            </div>
          </div>
        </div>
      </${Panel}>

      <${AICoach} op=${op} deps=${deps} daysSinceLast=${daysSinceLast} />
      <${ShareDossier} op=${op} />
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:24px">
        <${ActionCard} href="/command/deploy" label="LOG DEPLOYMENT" hint="Stamp the record. Earn XP." accent=${true} />
        <${ActionCard} href="/command/projects" label="PROJECTS" hint=${`${projects.length} on file`} />
        <${ActionCard} href="/command/profile" label="EDIT DOSSIER" hint="Tune your callsign" />
      </div>
      <${Panel} style="margin-top:32px">
        <div class="panel-head"><span class="lbl">// RECENT DEPLOYMENTS</span><${Link} href=${`/u/${op.handle}`} style="font-family:var(--mono);font-size:10px;color:var(--glow);letter-spacing:2px">FULL LOG →</${Link}></div>
        ${deps.length === 0 ? html`<div style="padding:48px 16px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--mute)">NO DEPLOYMENTS YET. <${Link} href="/command/deploy" style="color:var(--glow)">LOG ONE.</${Link}></div>`
          : deps.map(d => html`<${Link} href=${`/u/${op.handle}/d/${d.id}`} class="feed-item" key=${d.id} style="display:block">
              <div style="display:flex;align-items:start;gap:14px">
                <div style="width:96px;flex-shrink:0;padding-top:2px"><${KindBadge} kind=${d.kind} /></div>
                <div style="flex:1">
                  <div style="font-family:var(--display);font-size:16px">${d.title}</div>
                  <div style="margin-top:4px;font-family:var(--mono);font-size:10px;color:var(--mute)"><span style="color:var(--glow)">+${d.xp_awarded} XP</span> · ${relTime(d.created_at)}</div>
                </div>
              </div>
            </${Link}>`)}
      </${Panel}>
    </main>`;
}
function AICoach({ op, deps, daysSinceLast }) {
  const [text, setText] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const firstTime = (deps || []).length === 0 && (op.xp || 0) === 0;
  async function fetchAdvice() {
    setBusy(true); setErr(null); setText(null);
    const last = deps?.[0];
    const deps30 = (deps || []).filter(d => Date.now() - new Date(d.created_at).getTime() < 30 * 86400000).length;
    try {
      const r = await fetch("/api/ai/coach", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operator: {
          handle: op.handle, display_name: op.display_name, rank: op.rank,
          xp: op.xp, momentum: op.momentum, signal_score: op.signal_score,
          streak_days: op.streak_days, deployments_30d: deps30,
          days_since_last: daysSinceLast, last_kind: last?.kind || "—",
          current_project: op.current_project || "—",
        }}),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setText(data.text || "Signal received. Standby.");
    } catch (e) {
      setErr(String(e?.message || e).toUpperCase());
    } finally { setBusy(false); }
  }
  // First-time operators get a deterministic onboarding briefing instead
  // of an AI call (model would hallucinate intel on a zero-data profile).
  useEffect(() => {
    if (firstTime) {
      setText(`Welcome to the Grid, @${op.handle}. Your dossier is live and broadcasting on signal score 0.0.\nLog your first deployment to stamp the record — iteration takes 10 seconds and earns 10 XP.`);
      return;
    }
    fetchAdvice();
  }, []);
  const lines = (text || "").split("\n").map(s => s.trim()).filter(Boolean);
  return html`<${Panel} corners=${true} style="margin-top:24px">
    <div class="panel-head"><span class="lbl">// TACTICAL ADVISOR · AI</span><button onClick=${fetchAdvice} disabled=${busy} class="btn" style="padding:4px 10px;font-size:10px">${busy ? "QUERYING…" : "RE-QUERY"}</button></div>
    <div style="padding:20px;display:flex;gap:16px;align-items:flex-start">
      <div style="flex-shrink:0;width:42px;height:42px;border:1px solid var(--glow);background:var(--glowsoft);display:grid;place-items:center;font-family:var(--mono);font-size:11px;letter-spacing:2px;color:var(--glow)">AI</div>
      <div style="flex:1;min-width:0">
        ${busy && !text ? html`<div style="font-family:var(--mono);font-size:11px;color:var(--mute);letter-spacing:2px"><span class="dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--glow);margin-right:8px;animation:pulse 1.6s infinite"></span>SCANNING TELEMETRY…</div>` : null}
        ${err ? html`<div style="font-family:var(--mono);font-size:11px;color:var(--danger)">// ADVISOR OFFLINE: ${err}</div>` : null}
        ${lines[0] ? html`<div style="font-family:var(--display);font-size:18px;line-height:1.4;color:var(--text)">${lines[0]}</div>` : null}
        ${lines[1] ? html`<div style="margin-top:8px;font-size:14px;line-height:1.55;color:var(--dim)">${lines[1]}</div>` : null}
        ${lines.length === 0 && !busy && !err ? html`<div style="color:var(--mute);font-size:13px">Press RE-QUERY for advisor briefing.</div>` : null}
      </div>
    </div>
  </${Panel}>`;
}

function ShareDossier({ op }) {
  const [copied, setCopied] = useState(false);
  const url = `${SITE}/r/${op.handle}`;
  const dossier = `${SITE}/u/${op.handle}`;
  const tweet = `building in public. all my deploys + revenue on the operator grid\n\nfollow my pings here: ${url}`;
  function copy(v) { navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1800); }
  return html`<${Panel} corners=${true} style="margin-top:24px">
    <div class="panel-head"><span class="lbl">// RECRUIT URL · COLD-ARRIVAL ENGINE</span><span class="hint">${op.recruit_count || 0} ENLISTED VIA YOU</span></div>
    <div style="padding:18px;display:flex;flex-direction:column;gap:12px">
      <div style="font-size:13px;color:var(--dim);line-height:1.5">Drop this link in your X bio, GitHub README, newsletter sig — every click lands on your dossier with a clear ENLIST CTA and credits you on signup. <b style="color:var(--glow)">+50 momentum</b> each time a recruit hits OPERATOR rank.</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:stretch">
        <div style="flex:1;min-width:240px;display:flex;align-items:center;padding:10px 14px;border:1px solid var(--line2);background:rgba(0,0,0,.4);font-family:var(--mono);font-size:13px;color:var(--glow);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${url.replace(/^https?:\/\//, "")}</div>
        <button class="btn" onClick=${() => copy(url)}>${copied ? "COPIED" : "COPY LINK"}</button>
        <a class="btn btn-glow" target="_blank" rel="noopener noreferrer" href=${`https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}`}>POST TO X</a>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;font-family:var(--mono);font-size:10px;color:var(--mute);letter-spacing:1.5px">
        <span>// PUBLIC DOSSIER: <a href=${dossier} target="_blank" rel="noopener noreferrer" style="color:var(--dim)">${dossier.replace(/^https?:\/\//, "")}</a></span>
      </div>
    </div>
  </${Panel}>`;
}

function ActionCard({ href, label, hint, accent }) {
  return html`<${Link} href=${href} class=${`panel ${accent ? '' : ''}`} style=${`display:flex;align-items:center;justify-content:space-between;padding:18px;border:1px solid ${accent ? 'rgba(103,232,249,.6)' : 'var(--line)'};transition:.15s`}>
    <div>
      <div style=${`font-family:var(--mono);font-size:11px;letter-spacing:3px;color:${accent ? 'var(--glow)' : 'var(--dim)'}`}>${label}</div>
      <div style="margin-top:6px;color:var(--dim);font-size:13px">${hint}</div>
    </div>
    <span style=${`font-size:18px;color:${accent ? 'var(--glow)' : 'var(--mute)'}`}>→</span>
  </${Link}>`;
}

// ====================================================================
// DEPLOY FORM
// ====================================================================
function Deploy() {
  const a = useAuth();
  const [kind, setKind] = useState("iteration");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { if (!a.loading && !a.user) navigate("/login"); }, [a.loading, a.user]);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 20000);
      let res;
      try {
        res = await insertDeployment({ operator_id: a.user.id, kind, title: title.trim(), description: desc.trim() || null, url: url.trim() || null }, ac.signal);
      } finally { clearTimeout(timer); }
      if (!res.ok) throw new Error(res.error || "Deploy failed.");
      const id = res.data?.id;
      if (!id) throw new Error("Server didn't return deployment id");
      // Refresh operator stats + detect rank-up for federation broadcast.
      const prevRank = a.operator?.rank;
      loadOperator(a.user.id).then(fresh => {
        if (!fresh) return;
        auth.set({ operator: fresh });
        const xpDelta = XP[kind] || 0;
        broadcastNros(TX.deployment(fresh, { id, kind, title: title.trim(), url: url.trim() || null, xp_awarded: xpDelta }));
        broadcastNros(TX.xpAwarded(fresh, xpDelta, `${kind}: ${title.trim().slice(0, 80)}`));
        if (prevRank && fresh.rank && prevRank !== fresh.rank) {
          broadcastNros(TX.rankUp(fresh, prevRank, fresh.rank));
        }
      });
      navigate(`/u/${a.operator.handle}/d/${id}`);
    } catch (e) {
      console.error("[NRO:deploy] failed:", e);
      setErr(String(e?.message || e));
      setBusy(false);
    }
  }
  if (!a.operator) return html`<${CommandSkeleton}/>`;
  return html`
    <${Nav} variant="command" />
    <main class="container" style="max-width:720px;padding:40px 24px">
      <span class="tag">// STAMP THE RECORD</span>
      <h1 style="font-family:var(--display);font-size:32px;font-weight:700;margin:8px 0 8px">Log a deployment.</h1>
      <p style="color:var(--dim);margin:0 0 24px">One row added to your live record. XP awarded by kind. Streak ticks if it's a new day.</p>
      <${Panel} corners=${true}>
        <div class="panel-head"><span class="lbl">// DEPLOYMENT INTAKE</span></div>
        <form onSubmit=${submit} style="padding:20px">
          <div style="margin-bottom:18px"><span class="lbl" style="display:block;margin-bottom:8px">Kind</span>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
              ${Object.keys(XP).map(k => html`<button type="button" key=${k} onClick=${() => setKind(k)} class="panel" style=${`padding:12px;text-align:left;background:${kind === k ? 'var(--glowsoft)' : 'rgba(17,17,20,.4)'};border-color:${kind === k ? 'var(--glow)' : 'var(--line)'};cursor:pointer`}>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><${KindBadge} kind=${k} /><span style="font-family:var(--mono);font-size:10px;color:var(--glow)">+${XP[k]} XP</span></div>
                <div style="font-size:11px;color:var(--dim);line-height:1.4">${KIND_DESC[k]}</div>
              </button>`)}
            </div>
          </div>
          <label class="field"><span class="lbl">Title</span><input class="input" required value=${title} onInput=${(e) => setTitle(e.target.value)} maxLength=${120} placeholder=${`Shipped ${kind}: ...`}/></label>
          <label class="field"><span class="lbl">Description</span><textarea class="textarea" value=${desc} onInput=${(e) => setDesc(e.target.value)} maxLength=${1000} rows="4"/></label>
          <label class="field"><span class="lbl">Link</span><input class="input" type="url" value=${url} onInput=${(e) => setUrl(e.target.value)} placeholder="https://"/></label>
          ${err ? html`<p style="font-family:var(--mono);font-size:11px;color:var(--danger)">${err}</p>` : null}
          <button class="btn btn-primary btn-block" type="submit" disabled=${busy || title.length < 2}>${busy ? "STAMPING…" : `LOG ${kind.toUpperCase()} · +${XP[kind]} XP`}</button>
        </form>
      </${Panel}>
    </main>`;
}

// ====================================================================
// PROFILE EDIT (dossier)
// ====================================================================
function Profile() {
  const a = useAuth();
  const op = a.operator;
  // Single state object — fewer setState chains = fewer re-render races
  const [f, setF] = useState({
    display_name: "", tagline: "", bio: "", location: "",
    city: "", state: "", avatar_url: "", current_project: "",
    followers: 0, active_users: 0,
    link_site: "", link_x: "", link_github: "",
    link_youtube: "", link_tiktok: "", link_instagram: "",
    link_linkedin: "", link_farcaster: "", link_discord: "",
    link_producthunt: "", link_substack: "", link_telegram: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showSocials, setShowSocials] = useState(false);
  const update = (k, v) => setF(s => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!a.loading && !a.user) navigate("/login");
    if (!a.loading && a.user && !a.operator) navigate("/onboarding");
  }, [a.loading, a.user, a.operator]);

  // Populate fields on operator hydrate. Watches op?.id so it doesn't clobber edits.
  useEffect(() => {
    if (!op) return;
    setF({
      display_name: op.display_name || "",
      tagline: op.tagline || "",
      bio: op.bio || "",
      location: op.location || "",
      city: op.city || "",
      state: op.state || "",
      avatar_url: op.avatar_url || "",
      current_project: op.current_project || "",
      followers: op.followers || 0,
      active_users: op.active_users || 0,
      link_site: op.link_site || "",
      link_x: op.link_x || "",
      link_github: op.link_github || "",
      link_youtube: op.link_youtube || "",
      link_tiktok: op.link_tiktok || "",
      link_instagram: op.link_instagram || "",
      link_linkedin: op.link_linkedin || "",
      link_farcaster: op.link_farcaster || "",
      link_discord: op.link_discord || "",
      link_producthunt: op.link_producthunt || "",
      link_substack: op.link_substack || "",
      link_telegram: op.link_telegram || "",
    });
  }, [op?.id]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;                // hard guard against double-submit
    setMsg(null);
    setBusy(true);

    try {
      if (!f.display_name.trim()) throw new Error("DISPLAY NAME REQUIRED.");

      // Geocode only if city changed and is non-empty — bounded to 5s by geocodeUS.
      let lat = op.lat, lng = op.lng;
      const newCity = f.city.trim() || null;
      const newState = f.state.trim().toUpperCase() || null;
      if (newCity && (newCity !== op.city || newState !== op.state)) {
        const geo = await geocodeUS([newCity, newState].filter(Boolean).join(", "));
        if (geo) { lat = geo.lat; lng = geo.lng; }
      } else if (!newCity) { lat = null; lng = null; }

      const nullable = (v, max) => { const s = (v ?? "").trim(); return s ? s.slice(0, max) : null; };
      const updated = {
        display_name: f.display_name.trim().slice(0, 48),
        tagline: nullable(f.tagline, 120),
        bio: nullable(f.bio, 600),
        location: nullable(f.location, 48),
        city: newCity, state: newState, lat, lng,
        avatar_url: nullable(f.avatar_url, 300),
        current_project: nullable(f.current_project, 60),
        followers: Math.max(0, Math.min(999999999, Number(f.followers) || 0)),
        active_users: Math.max(0, Math.min(999999999, Number(f.active_users) || 0)),
        link_site: nullable(f.link_site, 200),
        link_x: nullable(f.link_x, 60),
        link_github: nullable(f.link_github, 60),
        link_youtube: nullable(f.link_youtube, 200),
        link_tiktok: nullable(f.link_tiktok, 60),
        link_instagram: nullable(f.link_instagram, 60),
        link_linkedin: nullable(f.link_linkedin, 200),
        link_farcaster: nullable(f.link_farcaster, 60),
        link_discord: nullable(f.link_discord, 200),
        link_producthunt: nullable(f.link_producthunt, 60),
        link_substack: nullable(f.link_substack, 200),
        link_telegram: nullable(f.link_telegram, 60),
      };

      // Direct PATCH with 25s AbortController — gives slow networks room
      // while still preventing forever-hangs.
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 25000);
      let res;
      try {
        res = await patchOperator(updated, a.user.id, ac.signal);
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(res.error || "Update failed.");

      // Use fresh row from server if we got one back, else merge locally.
      const next = res.data ? { ...op, ...res.data } : { ...op, ...updated };
      auth.set({ operator: next });

      setMsg({ type: "ok", text: "DOSSIER UPDATED · RETURNING TO COMMAND…" });
      setTimeout(() => navigate("/command"), 800);
      // busy stays true through redirect so user can't double-fire
    } catch (err) {
      console.error("[NRO:profile-save] failed:", err);
      setMsg({ type: "err", text: String(err?.message || err).toUpperCase() });
      setBusy(false);
    }
  }

  if (!op) return html`<${CommandSkeleton}/>`;
  return html`
    <${Nav} variant="command" />
    <main class="container" style="max-width:760px;padding:40px 24px">
      <span class="tag">// EDIT DOSSIER</span>
      <h1 style="font-family:var(--display);font-size:32px;font-weight:700;margin:8px 0 8px">Tune your callsign.</h1>
      <p style="color:var(--dim);margin:0 0 24px">Handle is permanent. Everything else can be re-tuned.</p>
      <${Panel} corners=${true}>
        <div class="panel-head"><span class="lbl">// PROFILE</span></div>
        <form onSubmit=${submit} style="padding:20px">
          <fieldset disabled=${busy} style="border:0;padding:0;margin:0">
            <div style="border:1px solid var(--line);background:rgba(0,0,0,.3);padding:10px 12px;font-family:var(--mono);font-size:10px;color:var(--mute);margin-bottom:16px">CALLSIGN <span style="color:var(--glow)">@${op.handle}</span> · IMMUTABLE</div>

            <label class="field"><span class="lbl">Display Name</span><input class="input" required value=${f.display_name} onInput=${e => update("display_name", e.target.value)} maxLength=${48}/></label>
            <label class="field"><span class="lbl">Tagline</span><input class="input" value=${f.tagline} onInput=${e => update("tagline", e.target.value)} maxLength=${120}/></label>
            <label class="field"><span class="lbl">Bio</span><textarea class="textarea" value=${f.bio} onInput=${e => update("bio", e.target.value)} maxLength=${600} rows="4"/></label>
            <div style="display:grid;grid-template-columns:2fr 1fr 2fr;gap:12px">
              <label class="field"><span class="lbl">City</span><input class="input" value=${f.city} onInput=${e => update("city", e.target.value)} maxLength=${48} placeholder="Pasadena"/></label>
              <label class="field"><span class="lbl">State</span><input class="input" style="text-transform:uppercase;font-family:var(--mono)" value=${f.state} onInput=${e => update("state", e.target.value.toUpperCase().slice(0,2))} maxLength=${2} placeholder="CA"/></label>
              <label class="field"><span class="lbl">Location (display)</span><input class="input" value=${f.location} onInput=${e => update("location", e.target.value)} maxLength=${48} placeholder="Sector 2182 · Loma Vista"/></label>
            </div>
            <label class="field"><span class="lbl">Current Project</span><input class="input" value=${f.current_project} onInput=${e => update("current_project", e.target.value)} maxLength=${60}/></label>
            <label class="field"><span class="lbl">Avatar URL</span><input class="input" value=${f.avatar_url} onInput=${e => update("avatar_url", e.target.value)} maxLength=${300}/></label>

            <div style="border-top:1px solid var(--line);padding-top:18px;margin-top:18px">
              <div class="lbl" style="margin-bottom:10px">// INFLUENCE METRICS · MANUAL</div>
              <p style="margin:0 0 10px;font-size:12px;color:var(--mute);line-height:1.5">These feed directly into your Signal Score and the size of your territory on the Grid. Sum across all channels.</p>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <label class="field" style="margin-bottom:0"><span class="lbl">Total Followers</span><input class="input" type="number" min="0" value=${f.followers} onInput=${e => update("followers", e.target.value)} placeholder="0"/></label>
                <label class="field" style="margin-bottom:0"><span class="lbl">Active Users (Your Products)</span><input class="input" type="number" min="0" value=${f.active_users} onInput=${e => update("active_users", e.target.value)} placeholder="0"/></label>
              </div>
            </div>

            <div style="border-top:1px solid var(--line);padding-top:18px;margin-top:18px">
              <div class="lbl" style="margin-bottom:10px">// FACTION AFFILIATION</div>
              ${op.guild ? html`<div style="display:flex;justify-content:space-between;align-items:center;border:1px solid var(--line2);background:rgba(0,0,0,.3);padding:12px">
                <${GuildBadge} guild=${op.guild}/>
                <${Link} href="/command/guild" style="font-family:var(--mono);font-size:10px;color:var(--glow);letter-spacing:2px">MANAGE →</${Link}>
              </div>` : html`<div style="display:flex;justify-content:space-between;align-items:center;border:1px solid var(--line2);background:rgba(0,0,0,.3);padding:12px">
                <span style="font-family:var(--mono);font-size:11px;color:var(--mute)">UNALLIED · NO GUILD</span>
                <${Link} href="/guilds" style="font-family:var(--mono);font-size:10px;color:var(--glow);letter-spacing:2px">BROWSE GUILDS →</${Link}>
              </div>`}
            </div>

            <div style="border-top:1px solid var(--line);padding-top:18px;margin-top:18px">
              <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onClick=${() => setShowSocials(s => !s)}>
                <span class="lbl">// SOCIAL NETWORK (12 PLATFORMS)</span>
                <span style="font-family:var(--mono);font-size:11px;color:var(--glow)">${showSocials ? "▾ HIDE" : "▸ EXPAND"}</span>
              </div>
              ${showSocials ? html`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:14px">
                ${SOCIALS.map(s => html`<label class="field" key=${s.key} style="margin-bottom:0">
                  <span class="lbl" style="display:flex;align-items:center;gap:6px;color:var(--dim)"><span style="color:var(--glow);display:inline-flex"><${SocialGlyph} icon=${s.icon}/></span>${s.label}</span>
                  <input class="input" value=${f[s.key]} onInput=${e => update(s.key, e.target.value)} placeholder=${s.placeholder} maxLength=${200}/>
                </label>`)}
              </div>` : null}
            </div>

            ${msg ? html`<p style=${`font-family:var(--mono);font-size:11px;margin:14px 0;color:${msg.type === 'ok' ? 'var(--glow)' : 'var(--danger)'}`}>${msg.type === 'err' ? '// ERROR · ' : ''}${msg.text}</p>` : null}
            <button class="btn btn-primary btn-block" type="submit" disabled=${busy} style="margin-top:14px">${busy ? "SAVING…" : "SAVE DOSSIER"}</button>
          </fieldset>
        </form>
      </${Panel}>
    </main>`;
}

// ====================================================================
// PROJECTS MANAGER
// ====================================================================
function Projects() {
  const a = useAuth();
  const [projects, setProjects] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({
    name: "", slug: "", tagline: "", status: "active", stack: [],
    link_live: "", link_repo: "", cover_url: "",
    monetization: "free", mrr: "", arr: "", last_sale: "",
    users_count: "", buyer: "", featured: true,
  });
  const u = (k, v) => setF(s => ({ ...s, [k]: v }));
  useEffect(() => {
    if (!a.loading && !a.user) navigate("/login");
    if (!a.loading && a.user && !a.operator) navigate("/onboarding");
  }, [a.loading, a.user, a.operator]);
  useEffect(() => {
    if (!a.user) return;
    supa.from("projects").select("*").eq("operator_id", a.user.id).order("featured", { ascending: false }).order("mrr_cents", { ascending: false }).then(({ data }) => {
      setProjects(data || []);
      setShowForm((data || []).length === 0);
    });
  }, [a.user?.id]);
  function reset() {
    setF({ name: "", slug: "", tagline: "", status: "active", stack: [],
      link_live: "", link_repo: "", cover_url: "",
      monetization: "free", mrr: "", arr: "", last_sale: "",
      users_count: "", buyer: "", featured: true });
  }
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr(null); setBusy(true);
    try {
      const sl = f.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40);
      if (!/^[a-z0-9-]{2,40}$/.test(sl)) throw new Error("SLUG: 2–40 chars, lowercase, dashes.");
      if (!f.name.trim()) throw new Error("NAME REQUIRED.");
      const toCents = (v) => { const n = parseFloat(v); return isFinite(n) && n >= 0 ? Math.round(n * 100) : 0; };
      const row = {
        operator_id: a.user.id,
        name: f.name.trim().slice(0, 60),
        slug: sl,
        tagline: f.tagline.trim().slice(0, 140) || null,
        status: f.status,
        stack: f.stack.slice(0, 12),
        link_live: f.link_live.trim() || null,
        link_repo: f.link_repo.trim() || null,
        cover_url: f.cover_url.trim() || null,
        monetization: f.monetization,
        mrr_cents: toCents(f.mrr),
        arr_cents: toCents(f.arr),
        last_sale_cents: toCents(f.last_sale),
        users_count: Math.max(0, parseInt(f.users_count) || 0),
        buyer: f.buyer.trim() || null,
        featured: !!f.featured,
      };
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 20000);
      let res;
      try { res = await insertProject(row, ac.signal); } finally { clearTimeout(timer); }
      if (!res.ok) throw new Error(res.error || "Insert failed.");
      const fresh = res.data || row;
      setProjects(p => [fresh, ...p]); setShowForm(false); reset();
    } catch (e) {
      console.error("[NRO:project-save] failed:", e);
      setErr(String(e?.message || e));
    } finally { setBusy(false); }
  }
  async function del(id, projName) {
    if (!confirm(`Delete project ${projName}? Deployments will be unlinked.`)) return;
    try {
      const res = await deleteProject(id, a.user.id);
      if (!res.ok) throw new Error(res.error || "Delete failed.");
      setProjects(p => p.filter(x => x.id !== id));
    } catch (e) {
      console.error("[NRO:project-del]", e);
      alert("Delete failed · " + (e?.message || e));
    }
  }
  if (!a.operator) return html`<${CommandSkeleton}/>`;
  return html`
    <${Nav} variant="command" />
    <main class="container" style="max-width:960px;padding:40px 24px">
      <span class="tag">// WALL OF WORK</span>
      <h1 style="font-family:var(--display);font-size:32px;font-weight:700;margin:8px 0 8px">Your portfolio.</h1>
      <p style="color:var(--dim);margin:0 0 24px">Every product you've shipped, sold, white-labeled, or acquired. Public on your dossier.</p>

      ${projects.length > 0 ? html`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-bottom:24px">
        ${projects.map(p => html`<div key=${p.id} style="position:relative">
          <${WorkCard} p=${p}/>
          <button onClick=${() => del(p.id, p.name)} aria-label=${`Delete ${p.name}`} title=${`Delete ${p.name}`} style="position:absolute;top:6px;right:6px;z-index:3;width:24px;height:24px;border:1px solid var(--line2);background:rgba(10,10,10,.85);color:var(--mute);cursor:pointer;font-size:14px;line-height:0">✕</button>
        </div>`)}
      </div>` : null}

      <${Panel} corners=${true}>
        <div class="panel-head"><span class="lbl">// ${showForm ? "ADD WORK" : "EXPAND PORTFOLIO"}</span>${!showForm ? html`<button class="btn btn-glow" style="padding:4px 12px;font-size:10px" onClick=${() => setShowForm(true)}>+ NEW PROJECT</button>` : null}</div>
        ${showForm ? html`<form onSubmit=${submit} style="padding:20px">
          <fieldset disabled=${busy} style="border:0;padding:0;margin:0">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <label class="field"><span class="lbl">Name</span><input class="input" required value=${f.name} onInput=${e => { u("name", e.target.value); if (!f.slug) u("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40)); }} maxLength=${60}/></label>
              <label class="field"><span class="lbl">Slug (lowercase-dashes)</span><input class="input" style="font-family:var(--mono)" required value=${f.slug} onInput=${e => u("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40))} maxLength=${40}/></label>
            </div>
            <label class="field"><span class="lbl">Tagline</span><input class="input" value=${f.tagline} onInput=${e => u("tagline", e.target.value)} maxLength=${140} placeholder="One line. What this is."/></label>
            <label class="field"><span class="lbl">Cover Image URL</span><input class="input" value=${f.cover_url} onInput=${e => u("cover_url", e.target.value)} placeholder="https://image.url (16:9 looks best)"/></label>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
              <label class="field"><span class="lbl">Status</span><select class="select" value=${f.status} onChange=${e => u("status", e.target.value)}><option value="active">Active</option><option value="launched">Launched</option><option value="archived">Archived</option></select></label>
              <label class="field"><span class="lbl">Live URL</span><input class="input" type="url" value=${f.link_live} onInput=${e => u("link_live", e.target.value)} placeholder="https://"/></label>
              <label class="field"><span class="lbl">Repo URL</span><input class="input" type="url" value=${f.link_repo} onInput=${e => u("link_repo", e.target.value)} placeholder="https://github.com/..."/></label>
            </div>

            <div style="border-top:1px solid var(--line);padding-top:16px;margin-top:8px">
              <div class="lbl" style="margin-bottom:10px">// MONETIZATION & METRICS</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <label class="field"><span class="lbl">Monetization</span>
                  <select class="select" value=${f.monetization} onChange=${e => u("monetization", e.target.value)}>
                    <option value="free">Free / No revenue</option>
                    <option value="subscription">Subscription (MRR/ARR)</option>
                    <option value="lifetime">Lifetime sales</option>
                    <option value="whitelabel">White-label (licensed)</option>
                    <option value="acquired">Acquired / sold</option>
                    <option value="open_source">Open Source</option>
                  </select>
                </label>
                <label class="field"><span class="lbl">Users</span><input class="input" type="number" min="0" value=${f.users_count} onInput=${e => u("users_count", e.target.value)} placeholder="0"/></label>
              </div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
                <label class="field"><span class="lbl">MRR ($)</span><input class="input" type="number" min="0" step="any" value=${f.mrr} onInput=${e => u("mrr", e.target.value)} placeholder="0"/></label>
                <label class="field"><span class="lbl">ARR ($)</span><input class="input" type="number" min="0" step="any" value=${f.arr} onInput=${e => u("arr", e.target.value)} placeholder="0"/></label>
                <label class="field"><span class="lbl">${f.monetization === 'acquired' ? 'Sale Price ($)' : f.monetization === 'whitelabel' ? 'License Fee ($)' : 'Last Sale ($)'}</span><input class="input" type="number" min="0" step="any" value=${f.last_sale} onInput=${e => u("last_sale", e.target.value)} placeholder="0"/></label>
              </div>
              ${(f.monetization === 'whitelabel' || f.monetization === 'acquired') ? html`<label class="field"><span class="lbl">Buyer / Licensee</span><input class="input" value=${f.buyer} onInput=${e => u("buyer", e.target.value)} placeholder="Company name or operator"/></label>` : null}
              <label style="display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;color:var(--dim);letter-spacing:2px;cursor:pointer"><input type="checkbox" checked=${f.featured} onChange=${e => u("featured", e.target.checked)}/> FEATURED ON DOSSIER</label>
            </div>

            <div class="field" style="margin-top:14px"><span class="lbl">Stack (click to toggle)</span>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${STACK_OPTIONS.map(s => { const on = f.stack.includes(s); return html`<button type="button" key=${s} onClick=${() => u("stack", on ? f.stack.filter(x => x !== s) : [...f.stack, s])} style=${`border:1px solid ${on ? 'var(--glow)' : 'var(--line2)'};background:${on ? 'var(--glowsoft)' : 'transparent'};padding:4px 10px;font-family:var(--mono);font-size:10px;color:${on ? 'var(--glow)' : 'var(--dim)'};cursor:pointer`}>${s}</button>`; })}</div>
            </div>
            ${err ? html`<p style="font-family:var(--mono);font-size:11px;color:var(--danger)">${err}</p>` : null}
            <div style="display:flex;gap:10px;align-items:center;margin-top:14px"><button class="btn btn-primary" type="submit" disabled=${busy || !f.name || !f.slug}>${busy ? "SAVING…" : "SAVE PROJECT"}</button><button type="button" class="btn" onClick=${() => { setShowForm(false); reset(); }}>CANCEL</button></div>
          </fieldset>
        </form>` : null}
      </${Panel}>
    </main>`;
}

// ====================================================================
// OPERATOR DOSSIER
// ====================================================================
function Dossier({ handle, deploymentId }) {
  const a = useAuth();
  const [op, setOp] = useState(null);
  const [deps, setDeps] = useState([]);
  const [projects, setProjects] = useState([]);
  const [notfound, setNF] = useState(false);
  useEffect(() => {
    setOp(null); setNF(false);
    // Two-step fetch: PostgREST won't self-join via FK constraint name, so we
    // resolve the recruiter in a second targeted query if present.
    supa.from("operators").select("*, guild_members(role, guild:guilds(*))").eq("handle", handle.toLowerCase()).maybeSingle().then(async ({ data, error }) => {
      if (error) { console.error("[NRO:dossier] fetch failed:", error.message); setNF(true); return; }
      if (!data) { setNF(true); return; }
      const m = (data.guild_members || [])[0];
      data.guild = m?.guild || null;
      data.guild_role = m?.role || null;
      delete data.guild_members;
      // Resolve recruiter if any (separate query — self-FK doesn't embed)
      if (data.recruited_by) {
        try {
          const { data: r } = await supa.from("operators").select("handle, display_name, rank").eq("id", data.recruited_by).maybeSingle();
          if (r) data.recruited_by_op = r;
        } catch (e) { console.warn("[NRO:dossier] recruiter lookup failed:", e?.message); }
      }
      setOp(data);
      const [d, p] = await Promise.all([
        supa.from("deployments").select("*").eq("operator_id", data.id).order("created_at", { ascending: false }),
        supa.from("projects").select("*").eq("operator_id", data.id).order("created_at", { ascending: false }),
      ]);
      setDeps(d.data || []); setProjects(p.data || []);
    });
  }, [handle]);
  if (notfound) return html`<${Nav} /><main class="container center"><span class="tag">// SIGNAL LOST · 404</span><h1 style="font-family:var(--display);font-size:42px;margin:14px 0">Out of range.</h1><p style="color:var(--dim)">No operator at that callsign.</p><${Link} href="/grid" class="btn btn-primary" style="margin-top:16px">ENTER THE GRID →</${Link}></main>`;
  if (!op) return html`<${DossierSkeleton}/>`;

  if (deploymentId) {
    const d = deps.find(x => x.id === deploymentId);
    return html`<${Nav} /><${DeploymentDetail} op=${op} d=${d} />`;
  }
  return html`
    <${Nav} />
    <main class="container" style="padding:40px 24px;max-width:1024px">
      ${!a.user ? html`<${ColdArrivalBanner} op=${op}/>` : null}
      <${Panel} corners=${true} glow=${true}>
        <div class="panel-head"><span class="lbl">// OPERATOR DOSSIER</span><span class="hint">ENLISTED ${new Date(op.created_at).toISOString().slice(0,10)}</span></div>
        <div style="display:grid;grid-template-columns:auto 1fr auto;gap:24px;padding:24px;align-items:start">
          <${Avatar} op=${op} size=${96} />
          <div>
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px">
              <h1 style="font-family:var(--display);font-size:30px;font-weight:700;margin:0">${op.display_name}</h1>
              <span style="font-family:var(--mono);font-size:13px;color:var(--mute)">@${op.handle}</span>
              ${op.guild ? html`<${GuildBadge} guild=${op.guild}/>` : null}
            </div>
            ${op.tagline ? html`<p style="margin:8px 0 0;color:var(--dim);font-size:15px">${op.tagline}</p>` : null}
            <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;font-family:var(--mono);font-size:11px">
              ${op.location ? html`<span style="color:var(--glow);border:1px solid rgba(103,232,249,.3);background:rgba(103,232,249,.05);padding:3px 10px">${op.location}</span>` : null}
              ${op.city ? html`<span style="color:var(--mute);border:1px solid var(--line2);padding:3px 10px">📍 ${op.city}${op.state ? `, ${op.state}` : ""}</span>` : null}
            </div>
            ${op.bio ? html`<p style="margin-top:16px;color:var(--dim);font-size:14px;line-height:1.6;max-width:60ch">${op.bio}</p>` : null}
            <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:6px">
              ${SOCIALS.filter(s => op[s.key]).map(s => html`<a key=${s.key} href=${s.toUrl(op[s.key])} target="_blank" rel="noopener noreferrer" title=${s.label} aria-label=${`${s.label} · ${s.toLabel(op[s.key])}`}
                style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line2);background:rgba(17,17,20,.6);color:var(--dim);padding:5px 10px;font-family:var(--mono);font-size:11px;transition:.15s;text-decoration:none"
                onMouseEnter=${(e) => { e.currentTarget.style.borderColor = 'var(--glow)'; e.currentTarget.style.color = 'var(--glow)'; }}
                onMouseLeave=${(e) => { e.currentTarget.style.borderColor = 'var(--line2)'; e.currentTarget.style.color = 'var(--dim)'; }}>
                <${SocialGlyph} icon=${s.icon}/>
                ${s.toLabel(op[s.key])}
              </a>`)}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:14px">
            <${RankBadge} rank=${op.rank} size="lg" />
            <${Stat} label="Momentum" value=${op.momentum} accent="glow" hint="14D" />
          </div>
        </div>
        ${(() => {
          // Aggregate revenue across all portfolio projects.
          // Monthly equivalent: MRR + ARR/12 + lifetime-sales counted once.
          const monthlyCents = projects.reduce((s, p) => s + (p.mrr_cents || 0) + Math.floor((p.arr_cents || 0) / 12), 0);
          const lifetimeCents = projects.reduce((s, p) => s + (p.last_sale_cents || 0), 0);
          const totalUsers = projects.reduce((s, p) => s + (p.users_count || 0), 0);
          const showRevenue = monthlyCents > 0 || lifetimeCents > 0;
          const totalRevDisplay = monthlyCents > 0
            ? fmtMoney(monthlyCents)
            : lifetimeCents > 0
            ? fmtMoney(lifetimeCents)
            : "—";
          const revHint = monthlyCents > 0 ? "/MO EQUIV" : lifetimeCents > 0 ? "LIFETIME SALES" : "";
          return html`<div class="stats-row" style="border-top:1px solid var(--line)">
            <${Stat} label="Signal Score" value=${Number(op.signal_score||0).toFixed(1)} accent="glow" hint="0–10" />
            <${Stat} label="Total XP" value=${html`<${CountUp} to=${op.xp}/>`} />
            <${Stat} label="Deployments" value=${html`<${CountUp} to=${deps.length}/>`} />
            <${Stat} label="Streak" value=${op.streak_days > 0 ? html`<span class="streak-flame">${op.streak_days}d</span>` : `${op.streak_days}d`} hint="CONSECUTIVE" />
            <${Stat} label="Recruits" value=${html`<${CountUp} to=${op.recruit_count || 0}/>`} accent="glow" hint="OPERATORS ENLISTED" />
            ${showRevenue ? html`<${Stat} label="Tracked Revenue" value=${html`<${CountUp} to=${monthlyCents > 0 ? monthlyCents : lifetimeCents} format=${fmtMoney}/>`} accent="gold" hint=${revHint} />` : null}
            ${totalUsers > 0 ? html`<${Stat} label="Total Users" value=${html`<${CountUp} to=${totalUsers} format=${fmtUsers}/>`} accent="glow" hint="ACROSS PROJECTS" />` : null}
          </div>`;
        })()}
        ${op.recruited_by_op ? html`<div style="padding:10px 18px;border-top:1px solid var(--line);font-family:var(--mono);font-size:11px;color:var(--mute);letter-spacing:2px">RECRUITED BY <${Link} href=${`/u/${op.recruited_by_op.handle}`} style="color:var(--glow);text-decoration:underline">@${op.recruited_by_op.handle}</${Link}></div>` : null}
        <div style="padding:18px;border-top:1px solid var(--line)"><${RankProgress} rank=${op.rank} xp=${op.xp} /></div>
      </${Panel}>

      ${projects.length > 0 ? html`<${Panel} style="margin-top:24px">
        <div class="panel-head"><span class="lbl">// WALL OF WORK</span><span class="hint">${projects.length} ${projects.length === 1 ? "PROJECT" : "PROJECTS"}</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;padding:18px">
          ${projects.slice().sort((a, b) => {
            // Featured first, then by revenue, then by users
            if ((b.featured ? 1 : 0) !== (a.featured ? 1 : 0)) return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
            const ar = (a.mrr_cents || 0) * 12 + (a.arr_cents || 0) + (a.last_sale_cents || 0);
            const br = (b.mrr_cents || 0) * 12 + (b.arr_cents || 0) + (b.last_sale_cents || 0);
            if (br !== ar) return br - ar;
            return (b.users_count || 0) - (a.users_count || 0);
          }).map(p => html`<${WorkCard} key=${p.id} p=${p}/>`)}
        </div>
      </${Panel}>` : null}

      ${projects.length === 0 && a.user?.id === op.id ? html`<${Panel} style="margin-top:24px">
        <div class="panel-head"><span class="lbl">// WALL OF WORK</span><span class="hint">EMPTY</span></div>
        <div style="padding:36px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px">
          <div style="font-family:var(--display);font-size:20px;color:var(--text)">Stack what you've shipped.</div>
          <div style="color:var(--dim);font-size:13px;max-width:48ch;line-height:1.55">Every product you've launched, white-labeled, or sold lifetime belongs here. Tracked revenue feeds your Signal Score and lights up your dossier for cold visitors.</div>
          <${Link} href="/command/projects" class="btn btn-primary">+ ADD FIRST PROJECT</${Link}>
        </div>
      </${Panel}>` : null}

      <${Panel} style="margin-top:24px">
        <div class="panel-head"><span class="lbl">// DEPLOYMENT LOG</span><span class="hint">${deps.length} TOTAL</span></div>
        ${deps.length === 0 ? html`<div style="padding:36px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px">
            <div style="font-family:var(--display);font-size:20px;color:var(--text)">${a.user?.id === op.id ? "Stamp the record." : "Awaiting first signal."}</div>
            <div style="color:var(--dim);font-size:13px;max-width:48ch;line-height:1.55">${a.user?.id === op.id ? "Every iteration, ship, milestone, or launch becomes a public permalink. First one earns 10 XP minimum and starts your streak." : `@${op.handle} hasn't logged a deployment yet. When they do, it'll appear here as a permalink with a HUD share card.`}</div>
            ${a.user?.id === op.id ? html`<${Link} href="/command/deploy" class="btn btn-primary">+ LOG FIRST DEPLOYMENT</${Link}>` : null}
          </div>`
          : deps.map(d => html`<${Link} href=${`/u/${op.handle}/d/${d.id}`} class="feed-item" style="display:block">
              <div style="display:flex;align-items:start;gap:14px"><div style="width:96px"><${KindBadge} kind=${d.kind} /></div>
                <div style="flex:1"><div style="font-family:var(--display);font-size:16px">${d.title}</div>
                ${d.description ? html`<div class="desc">${d.description.length > 160 ? d.description.slice(0,160) + "…" : d.description}</div>` : null}
                <div style="margin-top:6px;font-family:var(--mono);font-size:10px;color:var(--mute)"><span style="color:var(--glow)">+${d.xp_awarded} XP</span> · ${relTime(d.created_at)}</div>
              </div></div>
            </${Link}>`)}
      </${Panel}>
    </main>`;
}

function DeploymentDetail({ op, d }) {
  if (!d) return html`<main class="container center"><span class="tag">// 404</span><h1>Deployment not found.</h1></main>`;
  const url = `${SITE}/u/${op.handle}/d/${d.id}`;
  const broadcast = `🛰  ${KIND_LABEL[d.kind].toUpperCase()} — ${d.title}\n\n@${op.handle} · NRO\n${url}`;
  const [copied, setCopied] = useState(false);
  const [assess, setAssess] = useState(null);
  const [assessBusy, setAssessBusy] = useState(false);
  const [assessErr, setAssessErr] = useState(null);

  // AI assessment — cached in localStorage so repeat views don't burn tokens
  useEffect(() => {
    const cacheKey = `nro:assess:${d.id}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { setAssess(JSON.parse(cached)); return; }
    } catch {}
    setAssessBusy(true);
    fetch("/api/ai/assess", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ deployment: {
        id: d.id, kind: d.kind, title: d.title, description: d.description, url: d.url,
        handle: op.handle, rank: op.rank, xp_awarded: d.xp_awarded, streak_days: op.streak_days,
      }}),
    }).then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setAssess(data);
      try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
    }).catch(e => setAssessErr(String(e?.message || e).toUpperCase()))
    .finally(() => setAssessBusy(false));
  }, [d.id]);

  const lines = (assess?.text || "").split("\n").map(s => s.trim()).filter(Boolean);
  return html`<main class="container" style="max-width:720px;padding:40px 24px">
    <${Link} href=${`/u/${op.handle}`} style="font-family:var(--mono);font-size:10px;color:var(--mute);letter-spacing:3px">← @${op.handle} DOSSIER</${Link}>
    <${Panel} corners=${true} glow=${true} style="margin-top:14px">
      <div class="panel-head"><span class="lbl">// DEPLOYMENT RECORD</span><span class="hint">${new Date(d.created_at).toISOString().slice(0,16).replace("T"," ")} UTC</span></div>
      <div style="padding:24px">
        <div style="display:flex;align-items:center;gap:14px"><${Avatar} op=${op} size=${48} />
          <div><div style="font-family:var(--display);font-size:18px">${op.display_name}</div><div style="display:flex;gap:8px;align-items:center"><span style="font-family:var(--mono);font-size:11px;color:var(--mute)">@${op.handle}</span><${RankBadge} rank=${op.rank} /></div></div>
          <div style="margin-left:auto;display:flex;align-items:center;gap:10px"><${KindBadge} kind=${d.kind} /><span style="font-family:var(--mono);font-size:11px;color:var(--glow)">+${d.xp_awarded} XP</span></div>
        </div>
        <h1 style="font-family:var(--display);font-size:30px;font-weight:700;margin:24px 0 0;line-height:1.2">${d.title}</h1>
        ${d.description ? html`<p style="white-space:pre-wrap;margin:14px 0 0;color:var(--dim);font-size:15px;line-height:1.6">${d.description}</p>` : null}
        <div style="margin-top:24px;display:flex;flex-wrap:wrap;gap:14px;font-family:var(--mono);font-size:11px;color:var(--mute)">
          <span>${relTime(d.created_at)}</span>
          ${d.url ? html`<a href=${d.url} target="_blank" style="color:var(--glow)">OPEN ↗</a>` : null}
        </div>
        <div style="margin-top:24px;padding-top:24px;border-top:1px solid var(--line)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div class="lbl">// TACTICAL ASSESSMENT · AI</div>
            <button class="btn" style="padding:3px 9px;font-size:9px" disabled=${assessBusy} onClick=${() => {
              try { localStorage.removeItem(`nro:assess:${d.id}`); } catch {}
              setAssess(null); setAssessErr(null); setAssessBusy(true);
              fetch("/api/ai/assess", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deployment: { id: d.id, kind: d.kind, title: d.title, description: d.description, url: d.url, handle: op.handle, rank: op.rank, xp_awarded: d.xp_awarded, streak_days: op.streak_days }})})
                .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setAssess(data); try { localStorage.setItem(`nro:assess:${d.id}`, JSON.stringify(data)); } catch {} })
                .catch(e => setAssessErr(String(e?.message || e).toUpperCase()))
                .finally(() => setAssessBusy(false));
            }}>${assessBusy ? "..." : "RE-ASSESS"}</button>
          </div>
          <div style="display:flex;gap:14px;align-items:flex-start;border:1px solid var(--line);background:rgba(17,17,20,.6);padding:14px">
            <div style="flex-shrink:0;width:38px;height:38px;border:1px solid var(--glow);background:var(--glowsoft);display:grid;place-items:center;font-family:var(--mono);font-size:10px;letter-spacing:2px;color:var(--glow)">AI</div>
            <div style="flex:1;min-width:0">
              ${assessBusy && !assess ? html`<div style="font-family:var(--mono);font-size:11px;color:var(--mute);letter-spacing:2px"><span class="dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--glow);margin-right:8px;animation:pulse 1.6s infinite"></span>ASSESSING DEPLOYMENT…</div>` : null}
              ${assessErr ? html`<div style="font-family:var(--mono);font-size:11px;color:var(--danger)">// AI OFFLINE: ${assessErr}</div>` : null}
              ${lines[0] ? html`<div style="font-family:var(--display);font-size:16px;line-height:1.45;color:var(--text)">${lines[0]}</div>` : null}
              ${lines[1] ? html`<div style="margin-top:6px;font-size:13px;line-height:1.55;color:var(--dim)">${lines[1]}</div>` : null}
            </div>
          </div>
        </div>
        <div style="margin-top:24px;padding-top:24px;border-top:1px solid var(--line)">
          <div class="lbl" style="margin-bottom:8px">// BROADCAST</div>
          <div style="border:1px solid var(--line2);background:rgba(0,0,0,.4);padding:12px;font-family:var(--mono);font-size:12px;color:var(--dim);white-space:pre-wrap">${broadcast}</div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn" onClick=${() => { navigator.clipboard.writeText(broadcast); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>${copied ? "COPIED" : "COPY POST"}</button>
            <a class="btn btn-glow" href=${`https://x.com/intent/tweet?text=${encodeURIComponent(broadcast)}`} target="_blank" rel="noopener noreferrer">POST TO X</a>
          </div>
        </div>
      </div>
    </${Panel}>
  </main>`;
}

// ====================================================================
// GRID LIST (fallback for no Mapbox)
// ====================================================================
function GridList() {
  const [ops, setOps] = useState([]);
  const [feed, setFeed] = useState([]);
  useEffect(() => {
    if (!supaConfigured) return;
    Promise.all([
      supa.from("operators").select("id,handle,display_name,avatar_url,tagline,rank,xp,momentum,signal_score,streak_days,city,state").order("signal_score", { ascending: false }).order("momentum", { ascending: false }).limit(50),
      supa.from("deployments").select("id,operator_id,kind,title,description,url,xp_awarded,created_at,operator:operators!inner(handle,display_name,avatar_url,rank)").order("created_at", { ascending: false }).limit(30),
    ]).then(([o, f]) => { setOps(o.data || []); setFeed(f.data || []); });
  }, []);
  return html`<${Nav} />
    <main class="container" style="padding:40px 24px">
      <div style="display:flex;justify-content:space-between;align-items:end;margin-bottom:24px"><div><span class="tag">// SECTOR 01 · LIST VIEW</span><h1 style="font-family:var(--display);font-size:38px;font-weight:700;margin:8px 0 8px">The Grid · List.</h1><p style="color:var(--dim);margin:0">Ranked by Signal Score. Map at <${Link} href="/grid" style="color:var(--glow)">/grid</${Link}>.</p></div></div>
      <${Panel} style="margin-bottom:24px"><div style="padding:12px 16px"><${ActivityTicker}/></div></${Panel}>
      <div class="grid-two">
        <${Panel}>
          <div class="panel-head"><span class="lbl">// SIGNAL LADDER</span><span class="hint">TOP ${ops.length}</span></div>
          ${ops.length === 0 ? html`<div style="padding:64px 16px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--mute)">NO OPERATORS YET. ENLIST TO TAKE POSITION 01.</div>`
            : ops.map((o, i) => html`<${Link} href=${`/u/${o.handle}`} class="row" key=${o.id}>
                <span class="rank-num">${String(i+1).padStart(2,"0")}</span><${Avatar} op=${o} size=${36}/>
                <div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px"><span class="name">${o.display_name}</span><span class="handle">@${o.handle}</span></div>
                <div class="meta"><${RankBadge} rank=${o.rank}/><span class="handle">${o.xp} XP</span>${o.streak_days > 0 ? html`<span style="font-family:var(--mono);font-size:10px;color:#fbbf24">🔥 ${o.streak_days}d</span>` : null}</div></div>
                <div class="right"><div class="num">${Number(o.signal_score||0).toFixed(1)}</div><div class="sub">SIGNAL</div></div>
              </${Link}>`)}
        </${Panel}>
        <${Panel}>
          <div class="panel-head"><span class="lbl">// LIVE DEPLOYMENT FEED</span><span class="hint">REAL-TIME</span></div>
          ${feed.length === 0 ? html`<div style="padding:64px 16px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--mute)">NO DEPLOYMENTS YET. THE GRID AWAITS A SIGNAL.</div>`
            : feed.map(d => { const op = Array.isArray(d.operator) ? d.operator[0] : d.operator; return html`<${Link} href=${`/u/${op.handle}/d/${d.id}`} class="feed-item" style="display:block">
                <div style="display:flex;align-items:start;gap:12px"><${Avatar} op=${op} size=${36}/>
                  <div style="flex:1;min-width:0"><div class="row1"><span class="h">@${op.handle}</span><span class="at">${relTime(d.created_at)}</span></div>
                  <div style="margin-top:6px;display:flex;align-items:center;gap:8px"><${KindBadge} kind=${d.kind}/><span style="font-family:var(--mono);font-size:10px;color:var(--glow)">+${d.xp_awarded} XP</span></div>
                  <div class="title">${d.title}</div>
                  ${d.description ? html`<div class="desc">${d.description.length > 140 ? d.description.slice(0,140)+"…" : d.description}</div>` : null}</div>
                </div></${Link}>`; })}
        </${Panel}>
      </div>
    </main>`;
}

// ====================================================================
// SIGNAL MAP
// ====================================================================
function SignalMap() {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const [ops, setOps] = useState({});
  const [pulses, setPulses] = useState([]);
  const [feed, setFeed] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [tt, setTT] = useState(null);
  const [asc, setAsc] = useState(null);
  const [ready, setReady] = useState(false);

  // initial load
  useEffect(() => {
    if (!supaConfigured) return;
    Promise.all([
      supa.from("operators").select("id,handle,display_name,avatar_url,rank,xp,momentum,signal_score,followers,active_users,streak_days,city,state,lat,lng, guild_members(guild:guilds(id,slug,name,color,sigil))"),
      supa.from("deployments").select("id,operator_id,kind,title,created_at,operator:operators!inner(handle,city)").order("created_at", { ascending: false }).limit(20),
    ]).then(([o, f]) => {
      const map = {};
      (o.data || []).forEach(op => {
        const fb = fallbackGeo(op.handle);
        const m = (op.guild_members || [])[0];
        map[op.id] = { ...op, lat: op.lat ?? fb.lat, lng: op.lng ?? fb.lng, signal_score: Number(op.signal_score||0), guild: m?.guild || null };
        delete map[op.id].guild_members;
      });
      setOps(map);
      setFeed((f.data || []).map(r => { const op = Array.isArray(r.operator) ? r.operator[0] : r.operator; return { kind: "deploy", id: r.id, handle: op.handle, title: r.title, deployKind: r.kind, at: new Date(r.created_at).getTime(), city: op?.city }; }));
    });
  }, []);

  // Mapbox setup
  useEffect(() => {
    if (!mapboxConfigured) return;
    (async () => {
      const { default: mapboxgl } = await import("https://esm.sh/mapbox-gl@3.9.4");
      mapboxgl.accessToken = ENV.MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/mapbox/dark-v11",
        center: [-98.5795, 39.8283],
        zoom: 3.6,
        attributionControl: false,
        cooperativeGestures: true,
      });
      map.on("load", () => {
        setReady(true);
        // zoom to signed-in operator's location when state hydrates
        const me = auth.operator;
        if (me?.lat != null && me?.lng != null) {
          setTimeout(() => map.flyTo({ center: [me.lng, me.lat], zoom: 6, duration: 1800, essential: true }), 600);
        }
      });
      mapRef.current = map;
    })();
    return () => { mapRef.current?.remove(); };
  }, []);

  // realtime
  useEffect(() => {
    if (!supaConfigured) return;
    const c1 = supa.channel("nro:map:deploys").on("postgres_changes", { event: "INSERT", schema: "public", table: "deployments" }, async (p) => {
      const r = p.new;
      let op = ops[r.operator_id];
      if (!op) {
        const { data } = await supa.from("operators").select("id,handle,display_name,avatar_url,rank,xp,momentum,signal_score,city,state,lat,lng").eq("id", r.operator_id).maybeSingle();
        if (!data) return;
        const fb = fallbackGeo(data.handle);
        op = { ...data, lat: data.lat ?? fb.lat, lng: data.lng ?? fb.lng, signal_score: Number(data.signal_score||0) };
        setOps(prev => ({ ...prev, [op.id]: op }));
      }
      const pulse = { id: r.id + "-" + Date.now(), lat: op.lat, lng: op.lng, color: KIND_COLOR[r.kind] || "#67e8f9", strength: ({iteration:1,ship:2,milestone:3,launch:4})[r.kind] || 1, startedAt: Date.now() };
      setPulses(prev => [...prev.filter(x => Date.now() - x.startedAt < 6500), pulse]);
      setFeed(prev => [{ kind: "deploy", id: r.id, handle: op.handle, title: r.title, deployKind: r.kind, at: Date.now(), city: op.city }, ...prev].slice(0, 60));
    }).subscribe();
    const c2 = supa.channel("nro:map:ops").on("postgres_changes", { event: "UPDATE", schema: "public", table: "operators" }, (p) => {
      const o = p.new; const fb = fallbackGeo(o.handle);
      setOps(prev => ({ ...prev, [o.id]: { ...o, lat: o.lat ?? fb.lat, lng: o.lng ?? fb.lng, signal_score: Number(o.signal_score||0) } }));
    }).subscribe();
    const c3 = supa.channel("nro:map:asc").on("postgres_changes", { event: "INSERT", schema: "public", table: "ascensions" }, async (p) => {
      const r = p.new;
      const { data } = await supa.from("operators").select("handle,display_name").eq("id", r.operator_id).maybeSingle();
      if (!data) return;
      setAsc({ id: r.id, handle: data.handle, display_name: data.display_name, to_rank: r.to_rank });
      setFeed(prev => [{ kind: "ascension", id: r.id, handle: data.handle, to_rank: r.to_rank, at: Date.now() }, ...prev].slice(0, 60));
      setTimeout(() => setAsc(null), 5400);
    }).subscribe();
    return () => { supa.removeChannel(c1); supa.removeChannel(c2); supa.removeChannel(c3); };
  }, [Object.keys(ops).length]);

  // reap stale pulses
  useEffect(() => { const t = setInterval(() => setPulses(p => p.filter(x => Date.now() - x.startedAt < 6500)), 1000); return () => clearInterval(t); }, []);

  // project markers on map move
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    const fn = () => setTick(n => n + 1);
    m.on("move", fn); m.on("zoom", fn);
    return () => { m.off("move", fn); m.off("zoom", fn); };
  }, [ready]);

  const opList = Object.values(ops);
  const ranked = [...opList].sort((a, b) => (b.signal_score - a.signal_score) || (b.momentum - a.momentum));

  // Group operators by guild for the territory layer (Mapbox-side rendering).
  const guildClusters = useMemo(() => {
    const by = {};
    for (const o of opList) {
      if (!o.guild || o.lat == null || o.lng == null) continue;
      const g = o.guild;
      if (!by[g.id]) by[g.id] = { guild: g, members: [], pts: [] };
      by[g.id].members.push(o);
      by[g.id].pts.push([o.lng, o.lat]);
    }
    return Object.values(by).map(c => {
      const hull = convexHull(c.pts);
      const buffered = bufferHull(hull, 1.05);
      const polygon = (c.pts.length >= 3 && buffered.length >= 3) ? [...buffered, buffered[0]] : null;
      const lat = c.pts.reduce((s, p) => s + p[1], 0) / c.pts.length;
      const lng = c.pts.reduce((s, p) => s + p[0], 0) / c.pts.length;
      return { guild: c.guild, members: c.members, polygon, lat, lng };
    });
  }, [opList]);

  // --- convex hull helpers (Andrew's monotone chain) ---
  function convexHull(points) {
    const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length <= 1) return sorted;
    const cross = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
    const lower = [];
    for (const p of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }
  function bufferHull(hull, scale) {
    if (hull.length === 0) return hull;
    const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
    const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
    return hull.map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale]);
  }

  // Paint guild territory polygons + connection lines (supply-route web).
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return;
    // Convex-hull polygons — hugs the member perimeter (3+ members needed).
    const features = guildClusters
      .filter(c => c.polygon)
      .map(c => ({
        type: "Feature",
        properties: { id: c.guild.id, color: c.guild.color, name: c.guild.name, sigil: c.guild.sigil, count: c.members.length },
        geometry: { type: "Polygon", coordinates: [c.polygon] },
      }));
    const polyData = { type: "FeatureCollection", features };

    // Connection lines: full mesh between same-guild members. Two-layer render
    // (thin core + soft glow) so allied operators feel networked across territory.
    const lineFeatures = [];
    for (const c of guildClusters) {
      const ms = c.members.filter(o => o.lat != null && o.lng != null);
      for (let i = 0; i < ms.length; i++) {
        for (let j = i + 1; j < ms.length; j++) {
          lineFeatures.push({
            type: "Feature",
            properties: { color: c.guild.color, guild: c.guild.slug },
            geometry: { type: "LineString", coordinates: [[ms[i].lng, ms[i].lat], [ms[j].lng, ms[j].lat]] },
          });
        }
      }
    }
    const lineData = { type: "FeatureCollection", features: lineFeatures };

    const sid = "guild-territory";
    const sidLines = "guild-connections";
    if (m.getSource(sid)) {
      m.getSource(sid).setData(polyData);
    } else {
      m.addSource(sid, { type: "geojson", data: polyData });
      m.addLayer({
        id: "guild-territory-fill", source: sid, type: "fill",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.07 },
      });
      m.addLayer({
        id: "guild-territory-line", source: sid, type: "line",
        paint: { "line-color": ["get", "color"], "line-opacity": 0.45, "line-width": 1.2, "line-dasharray": [3, 3] },
      });
    }
    if (m.getSource(sidLines)) {
      m.getSource(sidLines).setData(lineData);
    } else {
      m.addSource(sidLines, { type: "geojson", data: lineData });
      m.addLayer({
        id: "guild-connections-glow", source: sidLines, type: "line",
        paint: { "line-color": ["get", "color"], "line-opacity": 0.13, "line-width": 5, "line-blur": 3 },
      });
      m.addLayer({
        id: "guild-connections-line", source: sidLines, type: "line",
        paint: { "line-color": ["get", "color"], "line-opacity": 0.40, "line-width": 1, "line-blur": 0.5 },
      });
    }
  }, [guildClusters, ready]);

  function projectPoint(lng, lat) {
    const m = mapRef.current; if (!m) return null;
    return m.project([lng, lat]);
  }

  return html`
    <div class="map-app">
      <div class="header">
        <${Link} href="/" style="display:flex;align-items:center;gap:10px"><span class="brand-mark">NRO</span><span class="brand-text">SIGNAL MAP · v0.1</span></${Link}>
        <span class="brand-text" style="opacity:.6">// SECTOR USA · CONTINENTAL</span>
        <div style="flex:1"></div>
        <span style="font-family:var(--mono);font-size:10px;letter-spacing:2px;color:var(--glow)"><span class="dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--glow);margin-right:6px;animation:pulse 1.6s infinite"></span>${pulses.length} ACTIVE PULSES</span>
        <span style="font-family:var(--mono);font-size:10px;letter-spacing:2px;color:var(--dim);margin-left:14px">${opList.length} OPERATORS</span>
        <${Link} href="/grid/list" class="btn" style="margin-left:14px">LIST</${Link}>
      </div>

      <div class="feed">
        <div class="panel-head"><span class="lbl">// TACTICAL FEED</span><span class="hint" style="color:var(--glow)"><span class="dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--glow);margin-right:4px;animation:pulse 1.6s infinite"></span>LIVE</span></div>
        ${feed.length === 0 ? html`<div style="padding:24px 14px;font-family:var(--mono);font-size:10px;color:var(--mute)">// STANDING BY · NO SIGNALS</div>`
          : feed.map(it => html`<div style="padding:12px 14px;border-bottom:1px solid var(--line)" key=${it.id}>
              ${it.kind === "deploy" ? html`<div style="display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10px;letter-spacing:2px">
                <span style="color:${KIND_COLOR[it.deployKind]}">[${it.deployKind.toUpperCase()}]</span><span style="margin-left:auto;color:var(--mute)">${relTime(it.at)}</span>
              </div>
              <div style="font-size:12px;color:var(--text);margin-top:6px;line-height:1.3">${it.title}</div>
              <div style="font-family:var(--mono);font-size:10px;color:var(--mute);margin-top:4px">@${it.handle}${it.city ? ` · ${it.city}` : ""}</div>`
              : html`<div style="border:1px solid rgba(252,211,77,.4);background:rgba(252,211,77,.05);padding:6px 8px">
                <div style="display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10px;color:#fbbf24;letter-spacing:2px"><span>↑</span>[ASCENSION]<span style="margin-left:auto;color:var(--mute)">${relTime(it.at)}</span></div>
                <div style="font-size:12px;color:var(--text);margin-top:4px">@${it.handle} → <span style="font-family:var(--mono);color:#fbbf24">${it.to_rank}</span></div>
              </div>`}
            </div>`)}
      </div>

      <div class="mapwrap">
        <div id="map"></div>
        ${guildClusters.length > 0 ? html`<div style="position:absolute;top:18px;left:50%;transform:translateX(-50%);z-index:6;display:flex;gap:10px;flex-wrap:wrap;justify-content:center;max-width:96%;pointer-events:auto">
          ${guildClusters.slice().sort((a,b) => b.members.reduce((s,m)=>s+(m.signal_score||0),0) - a.members.reduce((s,m)=>s+(m.signal_score||0),0)).map(c => {
            const totalSignal = c.members.reduce((s,m) => s + (m.signal_score || 0), 0);
            const totalMomentum = c.members.reduce((s,m) => s + (m.momentum || 0), 0);
            return html`<${Link} key=${c.guild.id} href=${`/guild/${c.guild.slug}`} class="faction-chip" style=${`--g:${c.guild.color}`}>
              <span class="fc-sigil">${c.guild.sigil}</span>
              <span class="fc-body">
                <span class="fc-name">${c.guild.name}</span>
                <span class="fc-stats">
                  <span><b>${c.members.length}</b> OPS</span>
                  <span class="fc-sep">·</span>
                  <span>S <b>${totalSignal.toFixed(1)}</b></span>
                  <span class="fc-sep">·</span>
                  <span>M <b>${totalMomentum}</b></span>
                </span>
              </span>
            </${Link}>`;
          })}
        </div>` : null}
        ${!mapboxConfigured ? html`<div style="position:absolute;inset:0;z-index:5;background:var(--bg);display:grid;place-items:center;text-align:center;padding:24px">
          <div><span class="tag" style="color:#fbbf24">// SIGNAL MAP · OFFLINE</span>
          <h2 style="font-family:var(--display);font-size:28px;margin:14px 0 8px">Mapbox token missing.</h2>
          <p style="color:var(--dim);max-width:40ch">Add <code style="color:var(--glow);font-family:var(--mono)">NEXT_PUBLIC_MAPBOX_TOKEN</code> to bring the tactical map online.</p></div>
        </div>` : null}
        ${mapboxConfigured && opList.length === 0 ? html`<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:5;text-align:center;border:1px solid rgba(103,232,249,.4);background:rgba(10,10,10,.85);padding:28px 36px;backdrop-filter:blur(8px);box-shadow:0 0 64px -12px rgba(103,232,249,.5)">
          <span class="tag">// EMPTY SECTOR</span>
          <h2 style="font-family:var(--display);font-size:28px;margin:12px 0 6px">The Grid awaits.</h2>
          <p style="color:var(--dim);max-width:36ch;font-size:13px;margin:0 0 14px">No operators have enlisted yet. Be the first callsign on the network.</p>
          <${Link} href="/login" class="btn btn-glow">ENLIST · BE #01</${Link}>
        </div>` : null}
        <!-- markers overlay -->
        ${ready && mapRef.current ? html`<div style="position:absolute;inset:0;pointer-events:none;z-index:3">
          ${(() => {
            // Top-3 operators by signal_score always show their handle label (war-map leaderboard at a glance).
            const topIds = new Set(opList.slice().sort((a,b) => (b.signal_score||0)-(a.signal_score||0)).slice(0,3).map(o => o.id));
            return opList.map(o => {
              const p = projectPoint(o.lng, o.lat); if (!p) return null;
              const color = o.guild?.color || rankFill[o.rank] || "#67e8f9";
              const r = 12 + Math.min(18, (o.signal_score||0) * 2.2) + (o.rank === "SOVEREIGN" ? 8 : o.rank === "COMMANDER" ? 5 : o.rank === "ARCHITECT" ? 2 : 0);
              const glyphSize = Math.max(14, r * 0.78);
              const persistent = topIds.has(o.id);
              return html`<a href=${`/u/${o.handle}`} key=${o.id} class=${`marker ${persistent ? 'marker-top' : ''}`}
                    onMouseEnter=${() => setTT({ op: o, x: p.x + 18, y: p.y - 8 })} onMouseLeave=${() => setTT(null)}
                    onClick=${(e) => { e.preventDefault(); navigate(`/u/${o.handle}`); }}
                    style=${`left:${p.x - r}px;top:${p.y - r}px;width:${r*2}px;height:${r*2}px;pointer-events:auto`}>
                <span class="pulse" style=${`background:radial-gradient(circle, ${color}55 0%, transparent 65%);animation:pulse ${o.rank === "COMMANDER" || o.rank === "SOVEREIGN" ? "1.6s" : "2.4s"} infinite`}></span>
                <span class="ring" style=${`border-color:${color}aa`}></span>
                <span class="glyph" style=${`position:absolute;left:50%;top:50%;width:${glyphSize}px;height:${glyphSize}px;transform:translate(-50%,-50%);color:${color}`}>
                  <${RankGlyph} rank=${o.rank} />
                </span>
                <span class="label" style=${`color:${color}`}>@${o.handle}${persistent ? html` · <span style="color:var(--mute);font-size:9px">S ${Number(o.signal_score||0).toFixed(1)}</span>` : ""}</span>
              </a>`;
            });
          })()}
          ${pulses.map(p => { const proj = projectPoint(p.lng, p.lat); if (!proj) return null; const age = Date.now() - p.startedAt; const base = 60 + p.strength * 40;
            return [0,1,2].map(i => { const delay = i * 700; const off = age - delay; if (off < 0) return null;
              const t = Math.min(1, off / (6000 - delay)); const scale = 0.2 + t * 1.2; const opacity = (1 - t) * 0.85;
              return html`<span key=${p.id + "-" + i} class="pulse-ring" style=${`left:${proj.x}px;top:${proj.y}px;width:${base}px;height:${base}px;border-color:${p.color};transform:translate(-50%,-50%) scale(${scale});opacity:${opacity};box-shadow:0 0 ${24*t}px ${p.color}`}></span>`;
            });
          })}
        </div>` : null}
        ${tt ? html`<div class="tt" style=${`left:${tt.x}px;top:${tt.y}px`}>
          <div class="tt-head">// OPERATOR PROFILE <${RankBadge} rank=${tt.op.rank}/></div>
          <div class="tt-name">${tt.op.display_name}</div>
          <div class="tt-handle">@${tt.op.handle}${tt.op.city ? ` · ${tt.op.city}${tt.op.state ? ", " + tt.op.state : ""}` : ""}</div>
          <div class="tt-grid">
            <div><span>SIGNAL</span><span class="va">${Number(tt.op.signal_score).toFixed(1)}</span></div>
            <div><span>MOMENTUM</span><span class="va">${tt.op.momentum}</span></div>
            <div><span>XP</span><span class="v">${tt.op.xp}</span></div>
            <div><span>STREAK</span><span class="v">${tt.op.streak_days}d</span></div>
            <div><span>RANK</span><span class="v">${tt.op.rank}</span></div>
          </div>
        </div>` : null}
      </div>

      <div class="ranks">
        <div class="panel-head"><span class="lbl">// RANKINGS · SIGNAL</span><${Link} href="/grid/list" style="font-family:var(--mono);font-size:9px;color:var(--mute);letter-spacing:2px">FULL LIST →</${Link}></div>
        ${ranked.slice(0, 30).map((o, i) => html`<${Link} href=${`/u/${o.handle}`} class="row" key=${o.id} onMouseEnter=${() => setTT({ op: o, x: 100, y: 100 + i*48 })} onMouseLeave=${() => setTT(null)}>
          <span class="rank-num">${String(i+1).padStart(2,"0")}</span><${Avatar} op=${o} size=${28}/>
          <div style="flex:1;min-width:0"><div style="font-family:var(--mono);font-size:12px;overflow:hidden;text-overflow:ellipsis">@${o.handle}</div><div style="display:flex;gap:6px;align-items:center;margin-top:2px"><${RankBadge} rank=${o.rank}/>${o.streak_days > 0 ? html`<span style="font-family:var(--mono);font-size:9px;color:#fbbf24">🔥${o.streak_days}</span>` : null}</div></div>
          <div style="text-align:right"><div style="font-family:var(--mono);font-size:13px;color:var(--glow)">${o.signal_score.toFixed(1)}</div><div style="font-family:var(--mono);font-size:8px;letter-spacing:2px;color:var(--mute)">SIGNAL</div></div>
        </${Link}>`)}
      </div>

      <div class="telemetry">
        <span>UTC <span style="color:var(--text);font-variant-numeric:tabular-nums">${new Date().toISOString().slice(11,19)}Z</span></span>
        <span>NETWORK XP · 14D <span class="glow">${opList.reduce((a,b) => a + (b.momentum||0), 0)}</span></span>
        <span>TOP SIGNAL <span class="glow">${(opList.reduce((a,b) => Math.max(a, b.signal_score||0), 0)).toFixed(1)}</span></span>
        <span>STATUS <span style="color:var(--text)">ALL CLEAR</span></span>
        <span style="margin-left:auto;color:var(--glow)">${feed[0] ? `// LAST: ${feed[0].kind === "deploy" ? `${feed[0].deployKind?.toUpperCase()} · @${feed[0].handle} · ${feed[0].title}` : `ASCENSION · @${feed[0].handle} → ${feed[0].to_rank}`}` : "// AWAITING SIGNAL"}</span>
      </div>

      ${asc ? html`<div class="asc-overlay">
        <div class="asc-burst"></div>
        <div class="asc-card">
          <span class="tag">// ASCENSION DETECTED</span>
          <div class="name">${asc.display_name}</div>
          <div style="font-family:var(--mono);font-size:12px;color:var(--mute)">@${asc.handle}</div>
          <div class="lbl">RANK ELEVATED</div>
          <div class="rank" style=${`color:${rankFill[asc.to_rank]}`}>${asc.to_rank}</div>
        </div>
      </div>` : null}
    </div>`;
}

// ====================================================================
// COMMAND PALETTE (Cmd+K / Ctrl+K)
// ====================================================================
const STATIC_TARGETS = [
  { kind: "route", title: "Landing", sub: "/", icon: "△", href: "/" },
  { kind: "route", title: "The Grid", sub: "Signal Map · /grid", icon: "◎", href: "/grid" },
  { kind: "route", title: "Grid List", sub: "Rankings + Feed · /grid/list", icon: "▤", href: "/grid/list" },
  { kind: "route", title: "Command Deck", sub: "/command", icon: "▣", href: "/command", auth: true },
  { kind: "route", title: "Log Deployment", sub: "/command/deploy", icon: "↑", href: "/command/deploy", auth: true },
  { kind: "route", title: "Projects", sub: "/command/projects", icon: "□", href: "/command/projects", auth: true },
  { kind: "route", title: "Edit Dossier", sub: "/command/profile", icon: "◷", href: "/command/profile", auth: true },
  { kind: "route", title: "Guilds", sub: "Faction Registry · /guilds", icon: "◈", href: "/guilds" },
  { kind: "route", title: "Forge / Manage Guild", sub: "/command/guild", icon: "◆", href: "/command/guild", auth: true },
  { kind: "route", title: "Privacy", sub: "/privacy", icon: "⊙", href: "/privacy" },
  { kind: "route", title: "Terms", sub: "/terms", icon: "⊙", href: "/terms" },
];

function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const a = useAuth();
  const inputRef = useRef(null);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  // Search operators when there's a query
  useEffect(() => {
    if (!open || !q.trim() || !supaConfigured) { setResults([]); return; }
    let ignore = false;
    const search = q.trim().toLowerCase();
    supa.from("operators")
      .select("handle,display_name,avatar_url,rank,signal_score,city,state")
      .or(`handle.ilike.%${search}%,display_name.ilike.%${search}%`)
      .order("signal_score", { ascending: false })
      .limit(8)
      .then(({ data }) => { if (!ignore) setResults(data || []); });
    return () => { ignore = true; };
  }, [q, open]);

  // routes filtered by query
  const filtered = q.trim()
    ? STATIC_TARGETS.filter(t => (!t.auth || a.user) && (t.title.toLowerCase().includes(q.toLowerCase()) || t.sub.toLowerCase().includes(q.toLowerCase())))
    : STATIC_TARGETS.filter(t => !t.auth || a.user);

  const ops = (results || []).map(o => ({ kind: "operator", op: o, href: `/u/${o.handle}` }));
  const all = [...ops, ...filtered];
  const max = all.length;

  const go = useCallback((item) => {
    if (!item) return;
    onClose();
    setTimeout(() => navigate(item.href), 10);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(max - 1, i + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); go(all[active]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, active, max, all, go, onClose]);

  // reset active when results change
  useEffect(() => { setActive(0); }, [q, results.length]);

  if (!open) return null;

  return html`<div class="cmdk-overlay" onClick=${(e) => { if (e.target.classList.contains("cmdk-overlay")) onClose(); }}>
    <div class="cmdk">
      <div class="cmdk-head">
        <span class="label">// COMMAND</span>
        <span class="hint">↑↓ TO NAVIGATE · ↵ TO JUMP · ESC TO CLOSE</span>
      </div>
      <input ref=${inputRef} class="cmdk-input" value=${q} onInput=${e => setQ(e.target.value)} placeholder="search operators or jump to route…"/>
      <div class="cmdk-results">
        ${ops.length > 0 ? html`<div class="cmdk-section-label">// OPERATORS</div>` : null}
        ${ops.map((it, i) => html`<button key=${`op-${it.op.handle}`} class=${`cmdk-item ${active === i ? 'active' : ''}`} onMouseEnter=${() => setActive(i)} onClick=${() => go(it)}>
          <${Avatar} op=${it.op} size=${28} />
          <div><div class="title">${it.op.display_name}</div><div class="sub">@${it.op.handle}${it.op.city ? ` · ${it.op.city}${it.op.state ? ", " + it.op.state : ""}` : ""}</div></div>
          <div class="right">${Number(it.op.signal_score || 0).toFixed(1)} · ${it.op.rank}</div>
        </button>`)}
        ${filtered.length > 0 ? html`<div class="cmdk-section-label">// JUMP TO</div>` : null}
        ${filtered.map((it, i) => { const idx = ops.length + i; return html`<button key=${`rt-${it.href}`} class=${`cmdk-item ${active === idx ? 'active' : ''}`} onMouseEnter=${() => setActive(idx)} onClick=${() => go(it)}>
          <span class="glyph">${it.icon}</span>
          <div><div class="title">${it.title}</div><div class="sub">${it.sub}</div></div>
          <div class="right">↵</div>
        </button>`; })}
        ${max === 0 ? html`<div class="cmdk-empty">// NO MATCHES</div>` : null}
      </div>
    </div>
  </div>`;
}

// ====================================================================
// GUILDS — list, dossier, manage
// ====================================================================
function Guilds() {
  const [guilds, setGuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!supaConfigured) { setLoading(false); return; }
    supa.from("guilds").select("*, members:guild_members(operator:operators(handle, display_name, signal_score, momentum, rank, avatar_url, lat, lng))").then(({ data }) => {
      const enriched = (data || []).map(g => {
        const ops = (g.members || []).map(m => m.operator).filter(Boolean);
        const sigSum = ops.reduce((a, o) => a + Number(o.signal_score || 0), 0);
        const momSum = ops.reduce((a, o) => a + Number(o.momentum || 0), 0);
        return { ...g, ops, member_count: ops.length, total_signal: sigSum, total_momentum: momSum };
      }).sort((a, b) => b.total_signal - a.total_signal);
      setGuilds(enriched);
      setLoading(false);
    });
  }, []);
  return html`<${Nav} />
    <main class="container" style="padding:40px 24px;max-width:1024px">
      <div style="display:flex;justify-content:space-between;align-items:end;gap:14px;margin-bottom:24px">
        <div>
          <span class="tag">// FACTIONS · GUILD REGISTRY</span>
          <h1 style="font-family:var(--display);font-size:38px;font-weight:700;margin:8px 0 8px">The Guilds.</h1>
          <p style="color:var(--dim);margin:0">Operators band together as guilds. Combined signal forms territory.</p>
        </div>
        <${Link} href="/command/guild" class="btn btn-glow">FORGE GUILD</${Link}>
      </div>
      <${Panel}>
        <div class="panel-head"><span class="lbl">// SIGNAL-RANKED</span><span class="hint">${guilds.length} GUILDS</span></div>
        ${loading ? html`<div style="padding:48px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--mute)">// SCANNING…</div>`
          : guilds.length === 0 ? html`<div style="padding:64px 16px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--mute)">// NO GUILDS YET · BE THE FIRST FOUNDER</div>`
          : guilds.map((g, i) => html`<${Link} href=${`/guild/${g.slug}`} class="row" key=${g.id}>
              <span class="rank-num">${String(i+1).padStart(2,"0")}</span>
              <span style="width:42px;height:42px;display:grid;place-items:center;border:1px solid ${g.color}66;background:${g.color}14;color:${g.color};font-size:18px">${g.sigil || "◈"}</span>
              <div style="flex:1;min-width:0">
                <div style="font-family:var(--display);font-size:18px">${g.name}</div>
                <div style="display:flex;gap:10px;align-items:center;margin-top:4px;color:var(--mute);font-family:var(--mono);font-size:11px">
                  <span style="color:${g.color}">${g.member_count} ${g.member_count === 1 ? "OPERATOR" : "OPERATORS"}</span>
                  ${g.tagline ? html`<span>· ${g.tagline}</span>` : null}
                </div>
              </div>
              <div style="text-align:right;display:flex;gap:18px">
                <div><div style="font-family:var(--mono);font-size:18px;color:${g.color};text-shadow:0 0 12px ${g.color}66">${g.total_signal.toFixed(1)}</div><div style="font-family:var(--mono);font-size:8px;color:var(--mute);letter-spacing:2px">SIGNAL</div></div>
                <div><div style="font-family:var(--mono);font-size:18px;color:var(--text)">${g.total_momentum}</div><div style="font-family:var(--mono);font-size:8px;color:var(--mute);letter-spacing:2px">MOMENTUM</div></div>
              </div>
            </${Link}>`)}
      </${Panel}>
    </main>
    <${Footer} />`;
}

function GuildDossier({ slug }) {
  const [g, setG] = useState(null);
  const [notfound, setNF] = useState(false);
  const [members, setMembers] = useState([]);
  const a = useAuth();
  useEffect(() => {
    setG(null); setNF(false); setMembers([]);
    supa.from("guilds").select("*, founder:operators!founder_id(handle, display_name, rank)").eq("slug", slug.toLowerCase()).maybeSingle().then(({ data }) => {
      if (!data) { setNF(true); return; }
      setG(data);
      supa.from("guild_members").select("role, joined_at, operator:operators(*)").eq("guild_id", data.id).then(({ data: ms }) => {
        const sorted = (ms || []).sort((x, y) => Number(y.operator?.signal_score || 0) - Number(x.operator?.signal_score || 0));
        setMembers(sorted);
      });
    });
  }, [slug]);
  if (notfound) return html`<${Nav}/><main class="container center"><span class="tag">// SIGNAL LOST · 404</span><h1 style="font-family:var(--display);font-size:42px;margin:14px 0">No such guild.</h1><${Link} href="/guilds" class="btn btn-primary" style="margin-top:16px">BACK TO REGISTRY →</${Link}></main>`;
  if (!g) return html`<${GuildSkeleton}/>`;
  const totalSignal = members.reduce((a, m) => a + Number(m.operator?.signal_score || 0), 0);
  const totalMomentum = members.reduce((a, m) => a + Number(m.operator?.momentum || 0), 0);
  const totalDeps = members.reduce((a, m) => a + 0, 0); // could fetch in second query
  const founder = Array.isArray(g.founder) ? g.founder[0] : g.founder;
  const meIsMember = !!a.operator?.guild && a.operator.guild.id === g.id;
  const meIsFounder = a.user?.id === g.founder_id;
  return html`<${Nav}/>
    <main class="container" style="padding:40px 24px;max-width:1024px">
      ${!a.user ? html`<${ColdArrivalBanner} guild=${g}/>` : null}
      <${Panel} corners=${true} style=${`box-shadow:0 0 64px -16px ${g.color}80`}>
        <div class="panel-head"><span class="lbl">// GUILD DOSSIER</span><span class="hint">FORGED ${new Date(g.created_at).toISOString().slice(0,10)}</span></div>
        <div style="display:grid;grid-template-columns:auto 1fr auto;gap:24px;padding:24px;align-items:start">
          <span style=${`width:96px;height:96px;display:grid;place-items:center;border:1px solid ${g.color};background:${g.color}1f;color:${g.color};font-size:48px;box-shadow:0 0 42px -8px ${g.color}`}>${g.sigil || "◈"}</span>
          <div>
            <h1 style="font-family:var(--display);font-size:36px;font-weight:700;margin:0">${g.name}</h1>
            <div style="font-family:var(--mono);font-size:12px;color:var(--mute);margin-top:4px">@${g.slug}</div>
            ${g.tagline ? html`<p style="margin:12px 0 0;color:var(--dim);font-size:15px">${g.tagline}</p>` : null}
            ${g.description ? html`<p style="margin-top:14px;color:var(--dim);font-size:14px;line-height:1.6;max-width:60ch">${g.description}</p>` : null}
            ${founder ? html`<div style="margin-top:14px;font-family:var(--mono);font-size:11px;color:var(--mute)">FOUNDER: <${Link} href=${`/u/${founder.handle}`} style="color:${g.color}">${founder.display_name} · ${founder.rank}</${Link}></div>` : null}
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${a.operator && !meIsMember ? html`<button class="btn btn-glow" onClick=${async () => {
              if (a.operator.guild) { if (!confirm(`Leave ${a.operator.guild.name} to join ${g.name}?`)) return; await leaveGuild(a.user.id); }
              const r = await joinGuild(g.id, a.user.id, "member");
              if (r.ok) { loadOperator(a.user.id).then(fresh => { if (fresh) auth.set({ operator: fresh }); }); setMembers(m => [...m, { role: "member", joined_at: new Date().toISOString(), operator: a.operator }]); } else alert(r.error);
            }}>JOIN GUILD</button>` : null}
            ${meIsMember && !meIsFounder ? html`<button class="btn" onClick=${async () => { if (!confirm(`Leave ${g.name}?`)) return; const r = await leaveGuild(a.user.id); if (r.ok) { loadOperator(a.user.id).then(fresh => { if (fresh) auth.set({ operator: fresh }); }); setMembers(m => m.filter(x => x.operator?.id !== a.user.id)); } }}>LEAVE GUILD</button>` : null}
            ${meIsFounder ? html`<${Link} href="/command/guild" class="btn">MANAGE</${Link}>` : null}
          </div>
        </div>
        <div class="stats-row" style="border-top:1px solid var(--line)">
          <${Stat} label="Combined Signal" value=${totalSignal.toFixed(1)} accent="glow" />
          <${Stat} label="Combined Momentum" value=${totalMomentum} accent="glow" hint="14D" />
          <${Stat} label="Members" value=${members.length} />
          <${Stat} label="Sigil" value=${g.sigil || "◈"} />
        </div>
      </${Panel}>
      <${Panel} style="margin-top:24px">
        <div class="panel-head"><span class="lbl">// MEMBER ROSTER</span><span class="hint">${members.length}</span></div>
        ${members.length === 0 ? html`<div style="padding:48px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--mute)">// NO MEMBERS YET</div>`
          : members.map((m, i) => { const o = m.operator || {}; return html`<${Link} href=${`/u/${o.handle}`} class="row" key=${o.id}>
            <span class="rank-num">${String(i+1).padStart(2,"0")}</span><${Avatar} op=${o} size=${36}/>
            <div style="flex:1;min-width:0">
              <div style="display:flex;gap:8px;align-items:center"><span class="name">${o.display_name}</span><span class="handle">@${o.handle}</span></div>
              <div class="meta"><${RankBadge} rank=${o.rank}/><span class="handle" style="text-transform:uppercase">${m.role}</span></div>
            </div>
            <div class="right"><div class="num" style=${`color:${g.color}`}>${Number(o.signal_score || 0).toFixed(1)}</div><div class="sub">SIGNAL</div></div>
          </${Link}>`; })}
      </${Panel}>
    </main>
    <${Footer}/>`;
}

function CommandGuild() {
  const a = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(GUILD_COLORS[0].hex);
  const [sigil, setSigil] = useState(GUILD_SIGILS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { if (!a.loading && !a.user) navigate("/login"); if (!a.loading && a.user && !a.operator) navigate("/onboarding"); }, [a.loading, a.user, a.operator]);
  // pre-fill if user is founder of existing guild
  useEffect(() => {
    const g = a.operator?.guild;
    if (g && a.user?.id === g.founder_id) {
      setName(g.name || ""); setSlug(g.slug || ""); setTagline(g.tagline || ""); setDescription(g.description || ""); setColor(g.color || GUILD_COLORS[0].hex); setSigil(g.sigil || GUILD_SIGILS[0]);
    }
  }, [a.operator?.guild?.id]);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const sl = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40);
      if (!/^[a-z0-9-]{2,40}$/.test(sl)) throw new Error("SLUG: 2–40 chars, lowercase, dashes.");
      if (!name.trim()) throw new Error("NAME REQUIRED.");
      const payload = {
        slug: sl, name: name.trim().slice(0, 60),
        tagline: tagline.trim().slice(0, 140) || null,
        description: description.trim().slice(0, 800) || null,
        color, sigil,
        founder_id: a.user.id,
      };
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 20000);
      let res;
      const existing = a.operator?.guild;
      const isFounder = existing && a.user.id === existing.founder_id;
      try {
        res = isFounder
          ? await patchGuild(payload, existing.id, ac.signal)
          : await insertGuild(payload, ac.signal);
      } finally { clearTimeout(timer); }
      if (!res.ok) throw new Error(res.error || "Operation failed.");
      // For new guild: auto-join founder as member + broadcast forge event.
      if (!isFounder && res.data?.id) {
        await joinGuild(res.data.id, a.user.id, "founder", null);
        broadcastNros(TX.guildForged(a.operator, res.data));
      }
      loadOperator(a.user.id).then(fresh => { if (fresh) auth.set({ operator: fresh }); });
      navigate(`/guild/${sl}`);
    } catch (e) {
      console.error("[NRO:guild]", e);
      setErr(String(e?.message || e));
      setBusy(false);
    }
  }
  if (!a.operator) return html`<${CommandSkeleton}/>`;
  const existing = a.operator.guild;
  const isFounder = existing && a.user.id === existing.founder_id;
  const isMember = existing && !isFounder;
  return html`<${Nav} variant="command"/>
    <main class="container" style="max-width:760px;padding:40px 24px">
      <span class="tag">// FACTION CONTROL</span>
      <h1 style="font-family:var(--display);font-size:32px;font-weight:700;margin:8px 0 8px">${isFounder ? "Govern your guild." : isMember ? "Allied." : "Forge a guild."}</h1>
      <p style="color:var(--dim);margin:0 0 24px">${isFounder ? "Edit faction parameters. Members will see updates instantly." : isMember ? `Currently allied with ${existing.name}. Leave to forge your own.` : "Combined signal forms territory. Operators rally under your sigil."}</p>
      ${isMember ? html`
        <${Panel} corners=${true}>
          <div class="panel-head"><span class="lbl">// CURRENT ALLIANCE</span></div>
          <div style="padding:20px;text-align:center">
            <${GuildBadge} guild=${existing}/>
            <div style="margin-top:14px;display:flex;gap:8px;justify-content:center">
              <${Link} href=${`/guild/${existing.slug}`} class="btn">VIEW DOSSIER</${Link}>
              <button class="btn" onClick=${async () => { if (!confirm(`Leave ${existing.name}?`)) return; const r = await leaveGuild(a.user.id); if (r.ok) { loadOperator(a.user.id).then(fresh => { if (fresh) auth.set({ operator: fresh }); }); navigate("/guilds"); } }}>LEAVE</button>
            </div>
          </div>
        </${Panel}>` : html`
        <${Panel} corners=${true}>
          <div class="panel-head"><span class="lbl">// ${isFounder ? "EDIT GUILD" : "FORGE GUILD"}</span></div>
          <form onSubmit=${submit} style="padding:20px">
            <fieldset disabled=${busy} style="border:0;padding:0;margin:0">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <label class="field"><span class="lbl">Name</span><input class="input" required value=${name} onInput=${e => { setName(e.target.value); if (!slug || !isFounder) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40)); }} maxLength=${60}/></label>
                <label class="field"><span class="lbl">Slug</span><input class="input" required value=${slug} onInput=${e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40))} maxLength=${40} disabled=${isFounder} style="font-family:var(--mono)"/></label>
              </div>
              <label class="field"><span class="lbl">Tagline</span><input class="input" value=${tagline} onInput=${e => setTagline(e.target.value)} maxLength=${140} placeholder="One line. What you stand for."/></label>
              <label class="field"><span class="lbl">Description</span><textarea class="textarea" value=${description} onInput=${e => setDescription(e.target.value)} maxLength=${800} rows="4"/></label>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                <div>
                  <span class="lbl" style="display:block;margin-bottom:6px">Guild Color</span>
                  <div style="display:flex;flex-wrap:wrap;gap:6px">
                    ${GUILD_COLORS.map(c => html`<button type="button" key=${c.hex} onClick=${() => setColor(c.hex)} title=${c.name} style=${`width:30px;height:30px;border:2px solid ${color === c.hex ? c.hex : 'transparent'};background:${c.hex}40;cursor:pointer;display:grid;place-items:center;color:${c.hex};font-size:14px`}>${color === c.hex ? '✓' : ''}</button>`)}
                  </div>
                </div>
                <div>
                  <span class="lbl" style="display:block;margin-bottom:6px">Sigil</span>
                  <div style="display:flex;flex-wrap:wrap;gap:6px">
                    ${GUILD_SIGILS.map(s => html`<button type="button" key=${s} onClick=${() => setSigil(s)} style=${`width:30px;height:30px;border:1px solid ${sigil === s ? color : 'var(--line2)'};background:${sigil === s ? color + '20' : 'rgba(0,0,0,.3)'};cursor:pointer;color:${sigil === s ? color : 'var(--dim)'};font-size:16px`}>${s}</button>`)}
                  </div>
                </div>
              </div>
              <div style="margin-top:18px;padding:14px;border:1px solid var(--line);background:rgba(0,0,0,.3);text-align:center">
                <div class="lbl">// PREVIEW</div>
                <div style="margin-top:8px"><${GuildBadge} guild=${{ slug: slug || 'preview', name: name || 'GUILD NAME', sigil, color }}/></div>
              </div>
              ${err ? html`<p style="font-family:var(--mono);font-size:11px;color:var(--danger);margin:10px 0">${err}</p>` : null}
              <button class="btn btn-primary btn-block" type="submit" disabled=${busy || !name || !slug} style="margin-top:14px">${busy ? "FORGING…" : (isFounder ? "SAVE CHANGES" : "FORGE GUILD")}</button>
            </fieldset>
          </form>
        </${Panel}>
      `}
    </main>`;
}

// ====================================================================
// PRIVACY / TERMS
// ====================================================================
function Privacy() {
  return html`<${Nav} />
    <main class="container" style="max-width:760px;padding:48px 24px;color:var(--dim);font-size:14px;line-height:1.7">
      <span class="tag">// PRIVACY POLICY</span>
      <h1 style="font-family:var(--display);font-size:36px;color:var(--text);margin:8px 0 24px">Operator privacy.</h1>
      <p>NRO collects the bare minimum required to run the operator network. We never sell your data.</p>
      <h2 style="font-family:var(--display);font-size:18px;color:var(--text);margin-top:24px">What we store</h2>
      <ul style="padding-left:20px">
        <li><b>Email</b> — used only to send sign-in magic links via Supabase Auth.</li>
        <li><b>Callsign + display name + tagline + bio</b> — publicly visible on your dossier.</li>
        <li><b>City/state</b> (optional) — used to place your pin on the Signal Map. Stored as text + geocoded latitude/longitude.</li>
        <li><b>Deployment log entries</b> — title, description, link, kind, timestamp. Public.</li>
        <li><b>XP / momentum / signal score / streak</b> — derived metrics, public.</li>
      </ul>
      <h2 style="font-family:var(--display);font-size:18px;color:var(--text);margin-top:24px">What we don't</h2>
      <ul style="padding-left:20px">
        <li>No third-party analytics tracking your individual movements across the site.</li>
        <li>No passwords (we use magic-link auth).</li>
        <li>No payment data.</li>
        <li>No precise GPS — only the city you typed.</li>
      </ul>
      <h2 style="font-family:var(--display);font-size:18px;color:var(--text);margin-top:24px">Third parties</h2>
      <ul style="padding-left:20px">
        <li><b>Cloudflare</b> hosts the Worker + handles edge logging (request metadata only).</li>
        <li><b>Supabase</b> stores your dossier + auth.</li>
        <li><b>Mapbox</b> serves the Signal Map tiles — they receive your IP when loading the map.</li>
      </ul>
      <h2 style="font-family:var(--display);font-size:18px;color:var(--text);margin-top:24px">Delete your dossier</h2>
      <p>Email the network operator and we'll wipe your operator + all deployments + projects within 7 days. Public copies in cached previews may persist for a few weeks.</p>
      <p style="margin-top:32px;font-family:var(--mono);font-size:11px;color:var(--mute)">Last updated: 2026-05-11</p>
      <${Link} href="/" class="btn" style="margin-top:24px">← BACK TO BASE</${Link}>
    </main>
    <${Footer} />`;
}

function Terms() {
  return html`<${Nav} />
    <main class="container" style="max-width:760px;padding:48px 24px;color:var(--dim);font-size:14px;line-height:1.7">
      <span class="tag">// TERMS OF SERVICE</span>
      <h1 style="font-family:var(--display);font-size:36px;color:var(--text);margin:8px 0 24px">Operator code.</h1>
      <p>By enlisting, you agree to the following short list.</p>
      <h2 style="font-family:var(--display);font-size:18px;color:var(--text);margin-top:24px">The code</h2>
      <ol style="padding-left:20px">
        <li>Your deployments are real. Don't log fake work to game XP.</li>
        <li>One operator per person. Multi-accounting gets you stripped of rank.</li>
        <li>No harassment, no targeted attacks, no slurs. Tactical voice only.</li>
        <li>Don't impersonate other operators. Callsigns are immutable for a reason.</li>
        <li>Your dossier content (title, bio, projects, deployments) is yours; the network can show it publicly.</li>
        <li>If you break the code, your dossier can be deactivated without warning.</li>
      </ol>
      <h2 style="font-family:var(--display);font-size:18px;color:var(--text);margin-top:24px">Service availability</h2>
      <p>NRO is provided as-is during v0.1. Outages, rank resets, and breaking changes may happen as the system evolves toward Next Realm OS.</p>
      <h2 style="font-family:var(--display);font-size:18px;color:var(--text);margin-top:24px">Liability</h2>
      <p>NRO is not responsible for any consequences (career, social, mental) of climbing the rank ladder too fast.</p>
      <p style="margin-top:32px;font-family:var(--mono);font-size:11px;color:var(--mute)">Last updated: 2026-05-11</p>
      <${Link} href="/" class="btn" style="margin-top:24px">← BACK TO BASE</${Link}>
    </main>
    <${Footer} />`;
}

// ====================================================================
// ROOT
// ====================================================================
function App() {
  const path = useRoute();
  const a = useAuth();
  useEffect(() => { bootAuth(); }, []);

  // Route table — pages render even without Supabase (empty states + config banner)
  if (path === "/") return html`<${Landing}/>`;
  if (path === "/login") return html`<${Login}/>`;
  if (path === "/onboarding") return html`<${Onboarding}/>`;
  if (path === "/auth/callback") return html`<${AuthCallback}/>`;
  if (path === "/grid") return mapboxConfigured ? html`<${SignalMap}/>` : html`<${GridList}/>`;
  if (path === "/grid/list") return html`<${GridList}/>`;
  if (path === "/command") return html`<${Command}/>`;
  if (path === "/command/deploy") return html`<${Deploy}/>`;
  if (path === "/command/profile") return html`<${Profile}/>`;
  if (path === "/command/projects") return html`<${Projects}/>`;
  if (path === "/command/guild") return html`<${CommandGuild}/>`;
  if (path === "/guilds") return html`<${Guilds}/>`;
  if (path === "/privacy") return html`<${Privacy}/>`;
  if (path === "/terms") return html`<${Terms}/>`;

  const gm = path.match(/^\/guild\/([^/]+)\/?$/);
  if (gm) return html`<${GuildDossier} slug=${gm[1]}/>`;

  // ROOT — gets wrapped with command palette regardless of route
  /* see below */

  // /u/[handle] and /u/[handle]/d/[id]
  const um = path.match(/^\/u\/([^/]+)(?:\/d\/([^/]+))?$/);
  if (um) return html`<${Dossier} handle=${um[1]} deploymentId=${um[2]}/>`;

  return html`<${Nav}/>
    <main class="container center">
      <span class="tag">// SIGNAL LOST · 404</span>
      <h1 style="font-family:var(--display);font-size:48px;margin:14px 0 8px">Out of range.</h1>
      <p style="color:var(--dim)">The coordinates you transmitted return null.</p>
      <${Link} href="/grid" class="btn btn-primary" style="margin-top:14px">ENTER THE GRID →</${Link}>
    </main>`;
}

// fade + remove boot loader so the transition feels intentional
const _boot = document.getElementById("boot");
if (_boot) {
  _boot.style.opacity = "0";
  setTimeout(() => _boot.remove(), 380);
}

// Wrap the root to render the Command Palette overlay on every route.
function Root() {
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setPalette(p => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return html`<${App}/><${CommandPalette} open=${palette} onClose=${() => setPalette(false)} />`;
}

// global error capture so render failures show something instead of black screen
window.addEventListener("error", (e) => {
  const app = document.getElementById("app");
  if (!app || app.children.length > 0) return;
  app.innerHTML = `<main style="max-width:600px;margin:120px auto;padding:24px;color:#9a9aa3;font-family:Inter,sans-serif;text-align:center">
    <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#f87171;letter-spacing:4px">// SIGNAL LOST · RUNTIME FAULT</div>
    <h1 style="font-family:'Space Grotesk',sans-serif;font-size:32px;margin:14px 0;color:#e6e6ea">Operator Core failed to boot.</h1>
    <p>${e.message ? e.message.replace(/[<>]/g, "") : "Unknown error"}</p>
    <p style="margin-top:24px"><button onclick="location.reload()" style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:3px;color:#67e8f9;background:rgba(103,232,249,.1);border:1px solid #67e8f9;padding:10px 24px;cursor:pointer">RETRY</button></p>
  </main>`;
});

render(h(Root, {}), document.getElementById("app"));
