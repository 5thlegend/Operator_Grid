"""
Wipe demo seed data. Deletes any operator whose auth.users email starts with `seed-`.
Cascades remove their deployments, projects, guild memberships, and ascensions.

Run from project root:
    python scripts/wipe_demo.py
"""
import json, pathlib, urllib.request, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = pathlib.Path(__file__).resolve().parent.parent
SVC = (ROOT / ".wrangler" / "supabase-service").read_text().strip()
URL = "https://tccpzvmzkimvkjrzgsrs.supabase.co"
H = {"apikey": SVC, "Authorization": f"Bearer {SVC}", "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 nro-seed/0.1"}

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + path, data=data, method=method, headers=H)
    with urllib.request.urlopen(r, timeout=30) as resp:
        t = resp.read().decode()
        return resp.status, (json.loads(t) if t else None)

# List seed users
status, data = req("GET", "/auth/v1/admin/users?per_page=200")
users = data.get("users", []) if isinstance(data, dict) else []
seeds = [u for u in users if (u.get("email") or "").startswith("seed-")]
print(f"found {len(seeds)} seed users — deleting...")

for u in seeds:
    try:
        req("DELETE", f"/auth/v1/admin/users/{u['id']}")
        print(f"  ✓ deleted {u.get('email')}")
    except Exception as e:
        print(f"  ✗ {u.get('email')}: {e}")

# Clean up guilds founded by deleted users (FK cascades handle most of this)
# Plus orphaned demo guilds in case founder cascade removed them.
for slug in ("next-realm", "the-architects"):
    try:
        req("DELETE", f"/rest/v1/guilds?slug=eq.{slug}")
        print(f"  ✓ guild '{slug}' removed (if existed)")
    except Exception:
        pass

print("\n✓ Wipe complete.")
