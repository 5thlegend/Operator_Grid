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
  try {
    const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=us&types=place,region&limit=1&access_token=${ENV.MAPBOX_TOKEN}`);
    if (!r.ok) return null;
    const data = await r.json();
    const f = data.features?.[0];
    if (!f) return null;
    const [lng, lat] = f.center;
    return { lat, lng, place_name: f.place_name };
  } catch { return null; }
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
  const { data } = await supa.from("operators").select("*").eq("id", userId).maybeSingle();
  return data;
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
  const [stats, setStats] = useState({ operators: 0, deployments: 0 });
  const [top, setTop] = useState([]);
  useEffect(() => {
    if (!supaConfigured) return;
    Promise.all([
      supa.from("operators").select("*", { count: "exact", head: true }),
      supa.from("deployments").select("*", { count: "exact", head: true }),
      supa.from("operators").select("id,handle,display_name,avatar_url,rank,xp,momentum,signal_score,streak_days").order("momentum", { ascending: false }).limit(5),
    ]).then(([o, d, t]) => {
      setStats({ operators: o.count || 0, deployments: d.count || 0 });
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
        <div class="panel-head"><span class="lbl">// LIVE NETWORK STATUS</span><span class="hint">REAL-TIME</span></div>
        <div class="stats-row">
          <${Stat} label="Operators" value=${stats.operators} accent="glow" />
          <${Stat} label="Deployments" value=${stats.deployments} accent="glow" />
          <${Stat} label="Sectors" value="01" hint="OPERATOR CORE v0.1" />
          <${Stat} label="Realm" value="NEXT" accent="gold" hint="// EXPANDING" />
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
  return html`<footer class="footer"><div class="inner"><div>NEXT REALM INTERACTIVE · OPERATOR CORE v0.1</div><${Link} href="/grid" style="color:var(--dim)">ENTER THE GRID →</${Link}></div></footer>`;
}

// ====================================================================
// LOGIN
// ====================================================================
function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function submit(e) {
    e.preventDefault(); setErr(null); setBusy(true);
    if (!supaConfigured) { setErr("Supabase not configured yet."); setBusy(false); return; }
    const { error } = await supa.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: SITE + "/auth/callback" } });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  }
  return html`
    <${Nav} />
    <main class="container center">
      <span class="tag">// ENLISTMENT TERMINAL</span>
      <h1 style="font-family:var(--display);font-size:44px;font-weight:700;line-height:1.05;margin:16px 0 12px">Identify yourself,<br/><span class="glow">operator.</span></h1>
      <p style="color:var(--dim);font-size:14px;margin:0 0 24px">We send a single-use sign-in link to your email. No passwords. No theatrics.</p>
      <${Panel} corners=${true}>
        <div class="panel-head"><span class="lbl">// AUTH · MAGIC LINK</span></div>
        <form onSubmit=${submit} style="padding:20px">
          ${err ? html`<div style="margin-bottom:14px;padding:8px 12px;border:1px solid rgba(248,113,113,.4);background:rgba(248,113,113,.05);font-family:var(--mono);font-size:11px;color:var(--danger)">${err.toUpperCase()}</div>` : null}
          ${sent ? html`<div style="margin-bottom:14px;padding:8px 12px;border:1px solid rgba(103,232,249,.4);background:var(--glowsoft);font-family:var(--mono);font-size:11px;color:var(--glow)">TRANSMISSION SENT. CHECK YOUR INBOX.</div>` : null}
          <label class="field"><span class="lbl">Operator Email</span><input class="input" type="email" required autoFocus value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="callsign@signal.net"/></label>
          <button class="btn btn-primary btn-block" disabled=${busy} type="submit">${busy ? "TRANSMITTING…" : "SEND SIGN-IN LINK"}</button>
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
    e.preventDefault(); setErr(null); setBusy(true);
    if (!/^[a-z0-9_]{2,24}$/.test(handle)) { setErr("Callsign: 2–24 chars, lowercase, numbers, underscore."); setBusy(false); return; }
    let lat = null, lng = null;
    if (city.trim()) {
      const geo = await geocodeUS([city, state].filter(Boolean).join(", "));
      if (geo) { lat = geo.lat; lng = geo.lng; }
    }
    if (lat == null) { const fb = fallbackGeo(handle); lat = fb.lat; lng = fb.lng; }
    const { error } = await supa.from("operators").insert({
      id: a.user.id, handle: handle.toLowerCase(), display_name: name.trim().slice(0, 48) || handle,
      tagline: tagline.trim().slice(0, 120) || null, city: city.trim() || null, state: state.trim().toUpperCase() || null,
      lat, lng,
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    auth.set({ operator: await loadOperator(a.user.id) });
    navigate("/command");
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
  if (!a.operator) return html`<${Nav} /><main class="container center"><span class="tag">// LOADING DECK…</span></main>`;
  const op = a.operator;
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
          <button class="btn" onClick=${async () => { await supa.auth.signOut(); navigate("/"); }}>SIGN OUT</button>
        </div>
      </div>
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
    e.preventDefault(); setBusy(true); setErr(null);
    const { data, error } = await supa.from("deployments").insert({ operator_id: a.user.id, kind, title: title.trim(), description: desc.trim() || null, url: url.trim() || null }).select("id").single();
    if (error) { setErr(error.message); setBusy(false); return; }
    auth.set({ operator: await loadOperator(a.user.id) });
    navigate(`/u/${a.operator.handle}/d/${data.id}`);
  }
  if (!a.operator) return html`<${Nav} /><main class="container center"><span class="tag">// LOADING…</span></main>`;
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
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [avatar, setAvatar] = useState("");
  const [linkSite, setLinkSite] = useState("");
  const [linkX, setLinkX] = useState("");
  const [linkGh, setLinkGh] = useState("");
  const [current, setCurrent] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!a.loading && !a.user) navigate("/login");
    if (!a.loading && a.user && !a.operator) navigate("/onboarding");
  }, [a.loading, a.user, a.operator]);
  useEffect(() => {
    if (!op) return;
    setName(op.display_name || ""); setTagline(op.tagline || ""); setBio(op.bio || "");
    setLocation(op.location || ""); setCity(op.city || ""); setState(op.state || "");
    setAvatar(op.avatar_url || ""); setLinkSite(op.link_site || ""); setLinkX(op.link_x || "");
    setLinkGh(op.link_github || ""); setCurrent(op.current_project || "");
  }, [op?.id]);
  async function submit(e) {
    e.preventDefault(); setMsg(null); setBusy(true);
    if (!name.trim()) { setMsg({ type: "err", text: "DISPLAY NAME REQUIRED." }); setBusy(false); return; }
    let lat = op.lat, lng = op.lng;
    const newCity = city.trim() || null;
    const newState = state.trim().toUpperCase() || null;
    if (newCity && (newCity !== op.city || newState !== op.state)) {
      const geo = await geocodeUS([newCity, newState].filter(Boolean).join(", "));
      if (geo) { lat = geo.lat; lng = geo.lng; }
    } else if (!newCity) { lat = null; lng = null; }
    const { error } = await supa.from("operators").update({
      display_name: name.trim().slice(0, 48),
      tagline: tagline.trim().slice(0, 120) || null,
      bio: bio.trim().slice(0, 600) || null,
      location: location.trim().slice(0, 48) || null,
      city: newCity, state: newState, lat, lng,
      avatar_url: avatar.trim().slice(0, 300) || null,
      link_site: linkSite.trim().slice(0, 200) || null,
      link_x: linkX.trim().slice(0, 60) || null,
      link_github: linkGh.trim().slice(0, 60) || null,
      current_project: current.trim().slice(0, 60) || null,
    }).eq("id", a.user.id);
    setBusy(false);
    if (error) { setMsg({ type: "err", text: error.message.toUpperCase() }); return; }
    auth.set({ operator: await loadOperator(a.user.id) });
    setMsg({ type: "ok", text: "DOSSIER UPDATED." });
  }
  if (!op) return html`<${Nav} /><main class="container center"><span class="tag">// LOADING…</span></main>`;
  return html`
    <${Nav} variant="command" />
    <main class="container" style="max-width:720px;padding:40px 24px">
      <span class="tag">// EDIT DOSSIER</span>
      <h1 style="font-family:var(--display);font-size:32px;font-weight:700;margin:8px 0 8px">Tune your callsign.</h1>
      <p style="color:var(--dim);margin:0 0 24px">Handle is permanent. Everything else can be re-tuned.</p>
      <${Panel} corners=${true}>
        <div class="panel-head"><span class="lbl">// PROFILE</span></div>
        <form onSubmit=${submit} style="padding:20px">
          <div style="border:1px solid var(--line);background:rgba(0,0,0,.3);padding:10px 12px;font-family:var(--mono);font-size:10px;color:var(--mute);margin-bottom:16px">CALLSIGN <span style="color:var(--glow)">@${op.handle}</span> · IMMUTABLE</div>
          <label class="field"><span class="lbl">Display Name</span><input class="input" required value=${name} onInput=${e => setName(e.target.value)} maxLength=${48}/></label>
          <label class="field"><span class="lbl">Tagline</span><input class="input" value=${tagline} onInput=${e => setTagline(e.target.value)} maxLength=${120}/></label>
          <label class="field"><span class="lbl">Bio</span><textarea class="textarea" value=${bio} onInput=${e => setBio(e.target.value)} maxLength=${600} rows="4"/></label>
          <div style="display:grid;grid-template-columns:2fr 1fr 2fr;gap:12px">
            <label class="field"><span class="lbl">City</span><input class="input" value=${city} onInput=${e => setCity(e.target.value)} maxLength=${48} placeholder="Los Angeles"/></label>
            <label class="field"><span class="lbl">State</span><input class="input" style="text-transform:uppercase;font-family:var(--mono)" value=${state} onInput=${e => setState(e.target.value.toUpperCase().slice(0,2))} maxLength=${2}/></label>
            <label class="field"><span class="lbl">Location (display)</span><input class="input" value=${location} onInput=${e => setLocation(e.target.value)} maxLength=${48} placeholder="Pacific NW"/></label>
          </div>
          <label class="field"><span class="lbl">Current Project</span><input class="input" value=${current} onInput=${e => setCurrent(e.target.value)} maxLength=${60}/></label>
          <label class="field"><span class="lbl">Avatar URL</span><input class="input" value=${avatar} onInput=${e => setAvatar(e.target.value)} maxLength=${300}/></label>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <label class="field"><span class="lbl">Site</span><input class="input" value=${linkSite} onInput=${e => setLinkSite(e.target.value)} placeholder="https://"/></label>
            <label class="field"><span class="lbl">X / Twitter</span><input class="input" value=${linkX} onInput=${e => setLinkX(e.target.value)} placeholder="@handle"/></label>
            <label class="field"><span class="lbl">GitHub</span><input class="input" value=${linkGh} onInput=${e => setLinkGh(e.target.value)} placeholder="username"/></label>
          </div>
          ${msg ? html`<p style=${`font-family:var(--mono);font-size:11px;margin:8px 0;color:${msg.type === 'ok' ? 'var(--glow)' : 'var(--danger)'}`}>${msg.text}</p>` : null}
          <button class="btn btn-primary btn-block" type="submit" disabled=${busy}>${busy ? "SAVING…" : "SAVE DOSSIER"}</button>
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
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState("");
  const [status, setStatus] = useState("active");
  const [stack, setStack] = useState([]);
  const [linkLive, setLinkLive] = useState("");
  const [linkRepo, setLinkRepo] = useState("");
  useEffect(() => {
    if (!a.loading && !a.user) navigate("/login");
    if (!a.loading && a.user && !a.operator) navigate("/onboarding");
  }, [a.loading, a.user, a.operator]);
  useEffect(() => {
    if (!a.user) return;
    supa.from("projects").select("*").eq("operator_id", a.user.id).order("created_at", { ascending: false }).then(({ data }) => {
      setProjects(data || []);
      setShowForm((data || []).length === 0);
    });
  }, [a.user?.id]);
  function reset() { setName(""); setSlug(""); setTagline(""); setStack([]); setStatus("active"); setLinkLive(""); setLinkRepo(""); }
  async function submit(e) {
    e.preventDefault(); setErr(null); setBusy(true);
    const sl = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40);
    if (!/^[a-z0-9-]{2,40}$/.test(sl)) { setErr("SLUG: 2–40 chars, lowercase, dashes."); setBusy(false); return; }
    const { data, error } = await supa.from("projects").insert({
      operator_id: a.user.id, name: name.trim().slice(0, 60), slug: sl,
      tagline: tagline.trim().slice(0, 140) || null, status, stack: stack.slice(0, 12),
      link_live: linkLive.trim() || null, link_repo: linkRepo.trim() || null,
    }).select("*").single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setProjects(p => [data, ...p]); setShowForm(false); reset();
  }
  async function del(id, projName) {
    if (!confirm(`Delete project ${projName}? Deployments will be unlinked.`)) return;
    const { error } = await supa.from("projects").delete().eq("id", id).eq("operator_id", a.user.id);
    if (!error) setProjects(p => p.filter(x => x.id !== id));
  }
  if (!a.operator) return html`<${Nav} /><main class="container center"><span class="tag">// LOADING…</span></main>`;
  return html`
    <${Nav} variant="command" />
    <main class="container" style="max-width:840px;padding:40px 24px">
      <span class="tag">// PROJECTS</span>
      <h1 style="font-family:var(--display);font-size:32px;font-weight:700;margin:8px 0 8px">Project registry.</h1>
      <p style="color:var(--dim);margin:0 0 24px">Group your deployments under named operations. Public on your dossier.</p>
      <${Panel} corners=${true}>
        <div class="panel-head"><span class="lbl">// REGISTRY</span></div>
        <div style="padding:20px">
          ${projects.map(p => html`<div key=${p.id} style="display:flex;align-items:start;gap:14px;border:1px solid var(--line);background:rgba(17,17,20,.6);padding:14px;margin-bottom:10px">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="font-family:var(--display);font-size:17px">${p.name}</span><span style="font-family:var(--mono);font-size:9px;letter-spacing:2px;color:var(--mute);text-transform:uppercase">${p.status}</span></div>
              ${p.tagline ? html`<p style="color:var(--dim);margin:6px 0 0;font-size:13px">${p.tagline}</p>` : null}
              ${p.stack?.length ? html`<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:4px">${p.stack.map(s => html`<span style="border:1px solid var(--line2);padding:2px 8px;font-family:var(--mono);font-size:9px;color:var(--dim)">${s}</span>`)}</div>` : null}
            </div>
            <button onClick=${() => del(p.id, p.name)} style="background:none;border:none;cursor:pointer;color:var(--mute);font-size:18px" title="Delete">✕</button>
          </div>`)}
          ${projects.length === 0 && !showForm ? html`<div style="border:1px solid var(--line2);background:rgba(0,0,0,.3);padding:32px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--mute)">NO PROJECTS YET.</div>` : null}
          ${!showForm ? html`<button class="btn btn-glow" onClick=${() => setShowForm(true)} style="margin-top:10px">+ NEW PROJECT</button>`
            : html`<form onSubmit=${submit} style="border:1px solid var(--line);background:rgba(0,0,0,.3);padding:18px;margin-top:10px">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                  <label class="field"><span class="lbl">Name</span><input class="input" required value=${name} onInput=${e => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g,"-").slice(0,40)); }} maxLength=${60}/></label>
                  <label class="field"><span class="lbl">Slug (lowercase-dashes)</span><input class="input" style="font-family:var(--mono)" required value=${slug} onInput=${e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g,"-").slice(0,40))} maxLength=${40}/></label>
                </div>
                <label class="field"><span class="lbl">Tagline</span><input class="input" value=${tagline} onInput=${e => setTagline(e.target.value)} maxLength=${140}/></label>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
                  <label class="field"><span class="lbl">Status</span><select class="select" value=${status} onChange=${e => setStatus(e.target.value)}><option value="active">active</option><option value="launched">launched</option><option value="archived">archived</option></select></label>
                  <label class="field"><span class="lbl">Live URL</span><input class="input" type="url" value=${linkLive} onInput=${e => setLinkLive(e.target.value)} placeholder="https://"/></label>
                  <label class="field"><span class="lbl">Repo URL</span><input class="input" type="url" value=${linkRepo} onInput=${e => setLinkRepo(e.target.value)} placeholder="https://github.com/..."/></label>
                </div>
                <div class="field"><span class="lbl">Stack (click to toggle)</span>
                  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${STACK_OPTIONS.map(s => { const on = stack.includes(s); return html`<button type="button" key=${s} onClick=${() => setStack(arr => on ? arr.filter(x => x !== s) : [...arr, s])} style=${`border:1px solid ${on ? 'var(--glow)' : 'var(--line2)'};background:${on ? 'var(--glowsoft)' : 'transparent'};padding:4px 10px;font-family:var(--mono);font-size:10px;color:${on ? 'var(--glow)' : 'var(--dim)'};cursor:pointer`}>${s}</button>`; })}</div>
                </div>
                ${err ? html`<p style="font-family:var(--mono);font-size:11px;color:var(--danger)">${err}</p>` : null}
                <div style="display:flex;gap:10px;align-items:center"><button class="btn btn-primary" type="submit" disabled=${busy || !name || !slug}>${busy ? "SAVING…" : "SAVE PROJECT"}</button><button type="button" class="btn" onClick=${() => { setShowForm(false); reset(); }}>CANCEL</button></div>
              </form>`}
        </div>
      </${Panel}>
    </main>`;
}

// ====================================================================
// OPERATOR DOSSIER
// ====================================================================
function Dossier({ handle, deploymentId }) {
  const [op, setOp] = useState(null);
  const [deps, setDeps] = useState([]);
  const [projects, setProjects] = useState([]);
  const [notfound, setNF] = useState(false);
  useEffect(() => {
    setOp(null); setNF(false);
    supa.from("operators").select("*").eq("handle", handle.toLowerCase()).maybeSingle().then(async ({ data }) => {
      if (!data) { setNF(true); return; }
      setOp(data);
      const [d, p] = await Promise.all([
        supa.from("deployments").select("*").eq("operator_id", data.id).order("created_at", { ascending: false }),
        supa.from("projects").select("*").eq("operator_id", data.id).order("created_at", { ascending: false }),
      ]);
      setDeps(d.data || []); setProjects(p.data || []);
    });
  }, [handle]);
  if (notfound) return html`<${Nav} /><main class="container center"><span class="tag">// SIGNAL LOST · 404</span><h1 style="font-family:var(--display);font-size:42px;margin:14px 0">Out of range.</h1><p style="color:var(--dim)">No operator at that callsign.</p><${Link} href="/grid" class="btn btn-primary" style="margin-top:16px">ENTER THE GRID →</${Link}></main>`;
  if (!op) return html`<${Nav} /><main class="container center"><span class="tag">// FETCHING DOSSIER…</span></main>`;

  if (deploymentId) {
    const d = deps.find(x => x.id === deploymentId);
    return html`<${Nav} /><${DeploymentDetail} op=${op} d=${d} />`;
  }
  return html`
    <${Nav} />
    <main class="container" style="padding:40px 24px;max-width:1024px">
      <${Panel} corners=${true} glow=${true}>
        <div class="panel-head"><span class="lbl">// OPERATOR DOSSIER</span><span class="hint">ENLISTED ${new Date(op.created_at).toISOString().slice(0,10)}</span></div>
        <div style="display:grid;grid-template-columns:auto 1fr auto;gap:24px;padding:24px;align-items:start">
          <${Avatar} op=${op} size=${96} />
          <div>
            <div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:14px">
              <h1 style="font-family:var(--display);font-size:30px;font-weight:700;margin:0">${op.display_name}</h1>
              <span style="font-family:var(--mono);font-size:13px;color:var(--mute)">@${op.handle}</span>
            </div>
            ${op.tagline ? html`<p style="margin:8px 0 0;color:var(--dim);font-size:15px">${op.tagline}</p>` : null}
            <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:14px;font-family:var(--mono);font-size:11px;color:var(--mute)">
              ${op.city ? html`<span>📍 ${op.city}${op.state ? `, ${op.state}` : ""}</span>` : null}
              ${op.link_site ? html`<a href=${op.link_site} target="_blank" style="color:var(--dim)">🌐 ${prettyHost(op.link_site)}</a>` : null}
              ${op.link_x ? html`<a href=${op.link_x.startsWith("http") ? op.link_x : `https://x.com/${op.link_x.replace(/^@/,"")}`} target="_blank" style="color:var(--dim)">𝕏 ${op.link_x.replace(/^@/,"")}</a>` : null}
              ${op.link_github ? html`<a href=${op.link_github.startsWith("http") ? op.link_github : `https://github.com/${op.link_github}`} target="_blank" style="color:var(--dim)">⌥ ${op.link_github.split("/").pop()}</a>` : null}
            </div>
            ${op.bio ? html`<p style="margin-top:16px;color:var(--dim);font-size:14px;line-height:1.6;max-width:60ch">${op.bio}</p>` : null}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:14px">
            <${RankBadge} rank=${op.rank} size="lg" />
            <${Stat} label="Momentum" value=${op.momentum} accent="glow" hint="14D" />
          </div>
        </div>
        <div class="stats-row" style="border-top:1px solid var(--line)">
          <${Stat} label="Signal Score" value=${Number(op.signal_score||0).toFixed(1)} accent="glow" hint="0–10" />
          <${Stat} label="Total XP" value=${op.xp} />
          <${Stat} label="Deployments" value=${deps.length} />
          <${Stat} label="Streak" value=${`${op.streak_days}d`} hint="CONSECUTIVE" />
        </div>
        <div style="padding:18px;border-top:1px solid var(--line)"><${RankProgress} rank=${op.rank} xp=${op.xp} /></div>
      </${Panel}>

      ${projects.length > 0 ? html`<${Panel} style="margin-top:24px">
        <div class="panel-head"><span class="lbl">// PROJECTS</span><span class="hint">${projects.length} ACTIVE</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1px;background:var(--line)">
          ${projects.map(p => html`<div style="padding:16px;background:var(--surface)">
            <div style="display:flex;justify-content:space-between;align-items:start"><h3 style="font-family:var(--display);font-size:17px;margin:0">${p.name}</h3><span style="font-family:var(--mono);font-size:9px;letter-spacing:2px;color:var(--mute);text-transform:uppercase">${p.status}</span></div>
            ${p.tagline ? html`<p style="color:var(--dim);font-size:13px;margin:6px 0 0">${p.tagline}</p>` : null}
            ${p.stack?.length ? html`<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:4px">${p.stack.map(s => html`<span style="border:1px solid var(--line2);background:rgba(0,0,0,.4);padding:2px 8px;font-family:var(--mono);font-size:9px;color:var(--dim)">${s}</span>`)}</div>` : null}
          </div>`)}
        </div>
      </${Panel}>` : null}

      <${Panel} style="margin-top:24px">
        <div class="panel-head"><span class="lbl">// DEPLOYMENT LOG</span><span class="hint">${deps.length} TOTAL</span></div>
        ${deps.length === 0 ? html`<div style="padding:48px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--mute)">NO DEPLOYMENTS LOGGED.</div>`
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
          <div class="lbl" style="margin-bottom:8px">// BROADCAST</div>
          <div style="border:1px solid var(--line2);background:rgba(0,0,0,.4);padding:12px;font-family:var(--mono);font-size:12px;color:var(--dim);white-space:pre-wrap">${broadcast}</div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="btn" onClick=${() => { navigator.clipboard.writeText(broadcast); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>${copied ? "COPIED" : "COPY POST"}</button>
            <a class="btn btn-glow" href=${`https://x.com/intent/tweet?text=${encodeURIComponent(broadcast)}`} target="_blank">POST TO X</a>
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
      supa.from("operators").select("id,handle,display_name,avatar_url,rank,xp,momentum,signal_score,followers,active_users,streak_days,city,state,lat,lng"),
      supa.from("deployments").select("id,operator_id,kind,title,created_at,operator:operators!inner(handle,city)").order("created_at", { ascending: false }).limit(20),
    ]).then(([o, f]) => {
      const map = {};
      (o.data || []).forEach(op => { const fb = fallbackGeo(op.handle); map[op.id] = { ...op, lat: op.lat ?? fb.lat, lng: op.lng ?? fb.lng, signal_score: Number(op.signal_score||0) }; });
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
      map.on("load", () => { setReady(true); });
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
        ${!mapboxConfigured ? html`<div style="position:absolute;inset:0;z-index:5;background:var(--bg);display:grid;place-items:center;text-align:center;padding:24px">
          <div><span class="tag" style="color:#fbbf24">// SIGNAL MAP · OFFLINE</span>
          <h2 style="font-family:var(--display);font-size:28px;margin:14px 0 8px">Mapbox token missing.</h2>
          <p style="color:var(--dim);max-width:40ch">Add <code style="color:var(--glow);font-family:var(--mono)">NEXT_PUBLIC_MAPBOX_TOKEN</code> to bring the tactical map online.</p></div>
        </div>` : null}
        <!-- markers overlay -->
        ${ready && mapRef.current ? html`<div style="position:absolute;inset:0;pointer-events:none;z-index:3">
          ${opList.map(o => {
            const p = projectPoint(o.lng, o.lat); if (!p) return null;
            const color = rankFill[o.rank] || "#67e8f9";
            const r = 6 + Math.min(20, o.signal_score * 2.5) + (o.rank === "SOVEREIGN" ? 8 : o.rank === "COMMANDER" ? 5 : o.rank === "ARCHITECT" ? 2 : 0);
            return html`<a href=${`/u/${o.handle}`} key=${o.id} class="marker"
                  onMouseEnter=${() => setTT({ op: o, x: p.x + 18, y: p.y - 8 })} onMouseLeave=${() => setTT(null)}
                  onClick=${(e) => { e.preventDefault(); navigate(`/u/${o.handle}`); }}
                  style=${`left:${p.x - r}px;top:${p.y - r}px;width:${r*2}px;height:${r*2}px;pointer-events:auto`}>
              <span class="pulse" style=${`background:radial-gradient(circle, ${color}55 0%, transparent 65%);animation:pulse ${o.rank === "COMMANDER" || o.rank === "SOVEREIGN" ? "1.6s" : "2.4s"} infinite`}></span>
              <span class="core" style=${`width:${Math.max(6, r*0.55)}px;height:${Math.max(6, r*0.55)}px;background:${color};box-shadow:0 0 ${r}px ${color}, 0 0 ${r*0.4}px ${color}`}></span>
              <span class="ring" style=${`border-color:${color}aa`}></span>
              <span class="label" style=${`color:${color}`}>@${o.handle}</span>
            </a>`;
          })}
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

render(h(App, {}), document.getElementById("app"));
