"""
Seed demo operators + guilds + deployments via Supabase admin API.

Run from project root:
    python scripts/seed_demo.py

Requires .wrangler/supabase-service to exist (service-role key).

All seed users have email prefix "seed-" so they can be cleaned up with
the companion `scripts/wipe_demo.py` script.
"""
import os, sys, json, pathlib, urllib.request, urllib.error, random, time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = pathlib.Path(__file__).resolve().parent.parent
SVC = (ROOT / ".wrangler" / "supabase-service").read_text().strip()
PROJECT = "tccpzvmzkimvkjrzgsrs"
URL = f"https://{PROJECT}.supabase.co"
H = {
    "apikey": SVC,
    "Authorization": f"Bearer {SVC}",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 nro-seed/0.1",
}

# ====================================================================
# DEMO OPERATORS — realistic builder personas across the US.
# ====================================================================
OPERATORS = [
    {"handle": "ghostwire",   "display": "Ghost Wire",     "city": "Los Angeles",  "state": "CA", "lat": 34.0522, "lng": -118.2437, "tagline": "Edge-deployed AI tooling.", "rank": "OPERATOR",  "xp": 420,  "followers": 8400,  "active_users": 1200, "socials": {"link_x": "@ghostwire", "link_github": "ghostwire"}},
    {"handle": "nullstack",   "display": "Null Stack",     "city": "New York",     "state": "NY", "lat": 40.7128, "lng": -74.0060,  "tagline": "Postgres-on-the-edge enjoyer.",                    "rank": "ARCHITECT", "xp": 1450, "followers": 22000, "active_users": 3400, "socials": {"link_x": "@nullstack", "link_github": "nullstack", "link_site": "https://nullstack.dev"}},
    {"handle": "cyberforge",  "display": "Cyber Forge",    "city": "Chicago",      "state": "IL", "lat": 41.8781, "lng": -87.6298,  "tagline": "Worker-native everything.",                        "rank": "OPERATOR",  "xp": 680,  "followers": 5600,  "active_users": 900,  "socials": {"link_x": "@cyberforge"}},
    {"handle": "signalbloom", "display": "Signal Bloom",   "city": "Austin",       "state": "TX", "lat": 30.2672, "lng": -97.7431,  "tagline": "Shipping creator-economy primitives.",             "rank": "INITIATE",  "xp": 75,   "followers": 1100,  "active_users": 80,   "socials": {"link_x": "@signalbloom", "link_youtube": "@signalbloom"}},
    {"handle": "stormcaster", "display": "Storm Caster",   "city": "Seattle",      "state": "WA", "lat": 47.6062, "lng": -122.3321, "tagline": "ex-FAANG. building tactical OS for indie ops.",    "rank": "COMMANDER", "xp": 4200, "followers": 95000, "active_users": 18000,"socials": {"link_x": "@stormcaster", "link_github": "stormcaster", "link_linkedin": "stormcaster"}},
    {"handle": "neonpoet",    "display": "Neon Poet",      "city": "Miami",        "state": "FL", "lat": 25.7617, "lng": -80.1918,  "tagline": "Brutalist UI + clean infra.",                     "rank": "OPERATOR",  "xp": 540,  "followers": 6800,  "active_users": 410,  "socials": {"link_x": "@neonpoet", "link_instagram": "@neon.poet"}},
    {"handle": "oracleforge", "display": "Oracle Forge",   "city": "Atlanta",      "state": "GA", "lat": 33.7490, "lng": -84.3880,  "tagline": "Realtime systems. Postgres MVP.",                  "rank": "ARCHITECT", "xp": 1820, "followers": 14000, "active_users": 2700, "socials": {"link_x": "@oracleforge", "link_github": "oracleforge"}},
]

# ====================================================================
# DEMO GUILDS
# ====================================================================
GUILDS = [
    {"slug": "next-realm",    "name": "NEXT REALM",          "tagline": "Founders shipping the operator OS.",       "description": "Original NRO faction. Builders who treat shipping as their craft.",  "sigil": "◈", "color": "#67e8f9", "founder_handle": "generaldank", "members": ["generaldank", "nullstack", "stormcaster", "ghostwire"]},
    {"slug": "the-architects","name": "THE ARCHITECTS",      "tagline": "Systems thinkers. Edge runtimes only.",    "description": "Operators forging realtime infrastructure for the next wave.",       "sigil": "⬢", "color": "#a78bfa", "founder_handle": "oracleforge",  "members": ["oracleforge", "cyberforge", "neonpoet"]},
]

# signalbloom intentionally left solo (no guild) so the UI shows a free agent.

# ====================================================================
# DEMO DEPLOYMENT TITLES
# ====================================================================
DEPLOY_BANK = [
    ("iteration", "Tuned the signal-score curve to reward streaks"),
    ("iteration", "Refactored the Mapbox marker layer for batched rendering"),
    ("iteration", "Polished the deployment-form keyboard navigation"),
    ("iteration", "Added a streak-loss warning banner"),
    ("ship",      "Shipped multi-tenant routing for the Worker"),
    ("ship",      "Shipped the Postgres edge-cache layer"),
    ("ship",      "Shipped guild-territory polygons on the Signal Map"),
    ("ship",      "Shipped magic-link 45s resend cooldown"),
    ("ship",      "Shipped the AI Tactical Assessment endpoint"),
    ("milestone", "Closed Q1 — first 100 operators onboarded"),
    ("milestone", "10k MAU across the operator network"),
    ("milestone", "Two guilds at 5+ members each"),
    ("launch",    "Launched v0.1 of the Operator Grid"),
    ("launch",    "Launched the federated transmissions API"),
]

# ====================================================================
# API CLIENT
# ====================================================================
def req(method, path, body=None, headers=None):
    h = dict(H); h.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            t = resp.read().decode()
            return resp.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()[:400]
        return e.code, body_text

def admin_req(method, path, body=None):
    """Supabase Admin Auth API."""
    return req(method, path, body, headers={})

# ====================================================================
# SEED
# ====================================================================
_users_cache = None
def _all_users():
    """Page through all auth users. Cached after first call within a run."""
    global _users_cache
    if _users_cache is not None: return _users_cache
    all_users = []
    page = 1
    while True:
        st, data = admin_req("GET", f"/auth/v1/admin/users?page={page}&per_page=100")
        if st != 200 or not isinstance(data, dict): break
        chunk = data.get("users", [])
        all_users.extend(chunk)
        if len(chunk) < 100: break
        page += 1
        if page > 20: break
    _users_cache = all_users
    return all_users

def upsert_auth_user(email, password):
    """Create or fetch an auth.users row. Returns user id."""
    # 1. Try create (will 422 if exists). NOTE: ?email= query string does NOT
    #    filter the admin users list — it's ignored. So we never look up that way.
    st, data = admin_req("POST", "/auth/v1/admin/users", {
        "email": email, "password": password, "email_confirm": True,
        "user_metadata": {"seed": True},
    })
    if st in (200, 201) and isinstance(data, dict) and data.get("id"):
        return data["id"]
    # 2. Already exists — fall back to listing all users and matching email.
    for u in _all_users():
        if (u.get("email") or "").lower() == email.lower():
            return u["id"]
    raise RuntimeError(f"upsert_auth_user({email}): {st} {data}")

def upsert_operator(op):
    email = f"seed-{op['handle']}@nro.test"
    password = f"seed-pw-{op['handle']}-x9q3"
    uid = upsert_auth_user(email, password)
    row = {
        "id": uid, "handle": op["handle"], "display_name": op["display"],
        "tagline": op["tagline"], "city": op["city"], "state": op["state"],
        "lat": op["lat"], "lng": op["lng"],
        "rank": op["rank"], "xp": op["xp"],
        "followers": op["followers"], "active_users": op["active_users"],
        **op.get("socials", {}),
    }
    # Use on_conflict=handle so we never accidentally overwrite a different
    # operator's id-based row. handle has a unique index.
    status, data = req("POST", "/rest/v1/operators?on_conflict=handle", row, headers={"Prefer": "resolution=merge-duplicates,return=representation"})
    if status not in (200, 201):
        print(f"  ✗ {op['handle']}: {status} {data}")
        return None
    print(f"  ✓ @{op['handle']:14} {op['display']:20} {op['city']}, {op['state']}  rank={op['rank']:9} xp={op['xp']}  id={uid[:8]}…")
    return uid

def upsert_guild(g, by_handle):
    founder_id = by_handle.get(g["founder_handle"])
    if not founder_id:
        print(f"  ✗ guild {g['slug']}: founder @{g['founder_handle']} not found")
        return None
    payload = {"slug": g["slug"], "name": g["name"], "tagline": g["tagline"], "description": g["description"], "sigil": g["sigil"], "color": g["color"], "founder_id": founder_id}
    status, data = req("POST", "/rest/v1/guilds?on_conflict=slug", payload, headers={"Prefer": "resolution=merge-duplicates,return=representation"})
    if status not in (200, 201):
        status, data = req("PATCH", f"/rest/v1/guilds?slug=eq.{g['slug']}", payload, headers={"Prefer": "return=representation"})
    if status not in (200, 201):
        print(f"  ✗ guild {g['slug']}: {status} {data}")
        return None
    gid = (data[0] if isinstance(data, list) else data)["id"]
    print(f"  ✓ {g['sigil']} {g['name']:24}  {g['color']}  founder=@{g['founder_handle']}")
    # Members — make first one founder, rest member
    for i, mh in enumerate(g["members"]):
        op_id = by_handle.get(mh)
        if not op_id: continue
        role = "founder" if mh == g["founder_handle"] else "member"
        # leave existing memberships first (one guild per op)
        req("DELETE", f"/rest/v1/guild_members?operator_id=eq.{op_id}", headers={"Prefer": "return=minimal"})
        st, d = req("POST", "/rest/v1/guild_members", {"guild_id": gid, "operator_id": op_id, "role": role}, headers={"Prefer": "return=minimal"})
        if st not in (200, 201): print(f"    ✗ join @{mh}: {st} {d}")
        else: print(f"    + @{mh} → {role}")
    return gid

SEED_PROJECTS = [
    # ghostwire
    ("ghostwire",  "edge-broadcast", "Edge Broadcast",     "1-click realtime fanout across CF Workers", "subscription", 240000, None, None, 1240, ["Cloudflare","Hono","Postgres"], "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80", True),
    ("ghostwire",  "tilt-pad",       "Tilt Pad",           "Side-project monetization toolkit",         "lifetime",     None,   None, 4900, 380,  ["Next.js","Stripe","Supabase"], None, True),
    # nullstack
    ("nullstack",  "stack-edge",     "Stack Edge",         "Postgres-on-the-edge platform",             "subscription", 840000, None, None, 3400, ["Postgres","Cloudflare","Hono"], None, True),
    ("nullstack",  "fork-script",    "Fork Script",        "Open-source migration toolkit",             "open_source",  None,   None, None, 8200, ["TypeScript","CLI"], None, False),
    # cyberforge
    ("cyberforge", "worker-uplink",  "Worker Uplink",      "Bidirectional WS for CF Workers",           "subscription", 95000,  None, None, 540,  ["Cloudflare","WebSockets"], None, True),
    ("cyberforge", "core-cdn",       "Core CDN",           "White-labeled cache layer for indie SaaS",  "whitelabel",   None,   None, 2400000, 6,    ["Cloudflare","Workers"], None, True),
    # signalbloom
    ("signalbloom","first-thousand", "First Thousand",     "Newsletter growth tactics, free",           "free",         None,   None, None, 82,   ["Substack"], None, True),
    # stormcaster
    ("stormcaster","sentinel-os",    "Sentinel OS",        "Tactical command terminal for solo founders","subscription",1850000,None,None,17400, ["Next.js","Postgres","OpenAI"], "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80", True),
    ("stormcaster","ghostfeed",      "Ghostfeed",          "Acquired by Substack 2025",                 "acquired",     None,   None, 425000000, 0,    ["Postgres","Stripe"], None, True),
    ("stormcaster","brutal-ui",      "Brutal UI",          "Component library, open source",            "open_source",  None,   None, None, 18000,["Tailwind","React"], None, False),
    # neonpoet
    ("neonpoet",   "neon-stripe",    "Neon Stripe",        "Themed Stripe checkout templates",          "lifetime",     None,   None, 14900, 410, ["Stripe","Next.js"], None, True),
    ("neonpoet",   "city-blocks",    "City Blocks",        "Brutalist landing-page kit",                "lifetime",     None,   None, 7900, 220, ["Tailwind","HTML"], None, False),
    # oracleforge
    ("oracleforge","oracle-rt",      "Oracle Realtime",    "Realtime postgres sync for edge runtimes",  "subscription", 1240000, None, None, 2680, ["Postgres","Cloudflare"], None, True),
    ("oracleforge","prophecy-kit",   "Prophecy Kit",       "AI-assisted system-design toolkit",         "lifetime",     None,   None, 24900, 540, ["OpenAI","Next.js"], None, True),
    ("oracleforge","mvp-zero",       "MVP Zero",           "White-labeled MVP starter, sold per-tenant", "whitelabel",   None,   None, 600000, 11,   ["Next.js","Supabase"], None, False),
]
def seed_projects(by_handle):
    placed = 0
    for handle, slug, name, tagline, monetization, mrr_cents, arr_cents, last_sale, users, stack, cover, featured in SEED_PROJECTS:
        op_id = by_handle.get(handle)
        if not op_id: continue
        row = {
            "operator_id": op_id, "slug": slug, "name": name, "tagline": tagline,
            "status": "launched" if monetization in ("acquired", "whitelabel") else "active",
            "stack": stack, "cover_url": cover, "monetization": monetization,
            "mrr_cents": mrr_cents or 0, "arr_cents": arr_cents or 0, "last_sale_cents": last_sale or 0,
            "users_count": users or 0, "featured": featured,
            "link_live": f"https://{slug}.example.com",
        }
        st, d = req("POST", "/rest/v1/projects?on_conflict=operator_id,slug", row, headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
        if st in (200, 201, 204): placed += 1
        else: print(f"    ✗ project {handle}/{slug}: {st} {d}")
    print(f"  placed {placed} portfolio projects across {len({p[0] for p in SEED_PROJECTS})} operators")

def seed_deployments(by_handle):
    print()
    handles = list(by_handle.keys())
    placed = 0
    now = time.time()
    for handle in handles:
        if handle == "generaldank": continue  # don't seed deployments under the real user
        op_id = by_handle[handle]
        # 2-4 deployments per operator, varied
        n = random.randint(2, 4)
        for i in range(n):
            kind, title = random.choice(DEPLOY_BANK)
            # spread across last 0-12 days
            offset_sec = random.randint(0, 12 * 86400)
            created_at = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(now - offset_sec))
            row = {
                "operator_id": op_id, "kind": kind,
                "title": title,
                "description": f"Seed deployment for @{handle}.",
                "created_at": created_at,
            }
            st, d = req("POST", "/rest/v1/deployments", row, headers={"Prefer": "return=minimal"})
            if st in (200, 201): placed += 1
            else: print(f"    ✗ deploy @{handle}: {st} {d}")
    print(f"  placed {placed} deployments across {len(handles)-1} seed operators")

def main():
    random.seed(42)
    print("=== SEEDING OPERATORS ===")
    by_handle = {}
    for op in OPERATORS:
        uid = upsert_operator(op)
        if uid: by_handle[op["handle"]] = uid
    # also resolve real user generaldank for guild membership
    status, data = req("GET", "/rest/v1/operators?handle=eq.generaldank&select=id")
    if data: by_handle["generaldank"] = data[0]["id"]

    print("\n=== SEEDING GUILDS ===")
    for g in GUILDS:
        upsert_guild(g, by_handle)

    print("\n=== SEEDING PROJECTS (Wall of Work) ===")
    seed_projects(by_handle)

    print("\n=== SEEDING DEPLOYMENTS ===")
    seed_deployments(by_handle)

    print("\n✓ Done. Reload /grid to see the network breathe.")

if __name__ == "__main__":
    main()
