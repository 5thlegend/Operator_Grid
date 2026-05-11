# Deploying NRO to Cloudflare

Two paths. **Path A is fastest.** Path B is for when you want CLI control.

---

## Path A · Cloudflare Workers Builds (recommended, ~10 minutes)

Cloudflare clones your GitHub repo, runs the build on their Linux infra, deploys the Worker. Zero local-install pain.

### 1. Push to GitHub

```bash
cd C:\dev\NextRealmOperators

# Create the GitHub repo first at https://github.com/new
# Suggested name: nextrealm-operators (private or public — your call)

git remote add origin https://github.com/YOUR_USERNAME/nextrealm-operators.git
git branch -M main
git push -u origin main
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. **SQL Editor** → paste & run [`supabase/schema.sql`](supabase/schema.sql) → then [`supabase/schema_signal_map.sql`](supabase/schema_signal_map.sql).
3. **Project Settings → API** → copy the **Project URL** and **anon public** key.
4. **Authentication → URL Configuration**:
   - Site URL: `https://nextrealm-operators.YOUR_SUBDOMAIN.workers.dev` (you'll get this URL after first deploy — come back and update)
   - Redirect URLs: add the same URL + `http://localhost:3000` for local dev

### 3. Get a Mapbox token

1. Sign up at [account.mapbox.com](https://account.mapbox.com/).
2. **Tokens** → create a public token (`pk.…`) restricted to scopes: `mapbox.places`, `mapbox.tiles`, `mapbox.styles`.

### 4. Connect to Cloudflare

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Import a repository** → select `nextrealm-operators`.
2. Choose framework: **Next.js (OpenNext)**.
3. **Build configuration**:
   - **Build command:** `npx opennextjs-cloudflare build`
   - **Deploy command:** `npx wrangler deploy`
   - **Root directory:** leave blank
4. **Environment variables** (add these for Production AND Preview):

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci…` |
   | `NEXT_PUBLIC_MAPBOX_TOKEN` | `pk.eyJ1Ijoi…` |
   | `NEXT_PUBLIC_SITE_URL` | (will be the workers.dev URL CF assigns) |

5. Click **Save and Deploy**. First build takes ~3–5 minutes.

### 5. Wire up the URL

Once the first deploy lands, Cloudflare gives you a URL like `nextrealm-operators.YOUR_ACCOUNT.workers.dev`.

1. Update `NEXT_PUBLIC_SITE_URL` in CF dashboard to that URL.
2. Update Supabase **Site URL** + **Redirect URLs** to the same.
3. Trigger a rebuild (or push any commit).

You're live. 🛰

### Custom domain (optional)

In Workers Builds → **Settings → Triggers → Custom Domains** → add `nextrealm-operators.pages.dev` or your own domain.

---

## Path B · Local CLI deploy

Use when you want to push from your machine directly (skipping GitHub).

### One-time
```bash
cd C:\dev\NextRealmOperators
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / MAPBOX_TOKEN / SITE_URL
npx wrangler login
```

### Every deploy
```bash
npm install --legacy-peer-deps
npm run deploy
```

⚠ On Windows, npm install can be brittle due to Windows Defender mid-extract interference with `next/dist/server/require-hook.js`. If `npm run deploy` fails locally because `next` is broken, run:

```bash
npm install next@16.2.6 --force --legacy-peer-deps
```

or, more robust: temporarily add `C:\dev\NextRealmOperators\node_modules` to Windows Defender exclusions (Settings → Privacy & Security → Virus & threat protection → Manage settings → Exclusions).

---

## Path C · GitHub Actions (alternative to Path A)

If you'd rather use GitHub Actions to deploy:

1. Push the included [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
2. In the GitHub repo settings → **Secrets and variables → Actions**, add:
   - `CLOUDFLARE_API_TOKEN` (Cloudflare dashboard → My Profile → API Tokens → create with `Workers Scripts:Edit`)
   - `CLOUDFLARE_ACCOUNT_ID`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_MAPBOX_TOKEN`
   - `NEXT_PUBLIC_SITE_URL`
3. Push to `main` triggers a deploy.

---

## Post-deploy checklist

- [ ] Visit the live URL — landing page loads
- [ ] `/login` works, magic-link email arrives
- [ ] Onboard with a callsign + city — verify your dot appears on `/grid`
- [ ] Log a deployment from `/command/deploy` — radar ping fires on the map in real time
- [ ] `/u/your-handle` shows your dossier with Signal Score
- [ ] `/api/og/operator/your-handle` returns a PNG share card

---

## Troubleshooting

- **Map shows "SIGNAL MAP · OFFLINE"** → `NEXT_PUBLIC_MAPBOX_TOKEN` missing from CF env
- **Magic link redirects to localhost** → Supabase Site URL still set to localhost
- **`/grid` empty** → no operators have onboarded yet; sign up to be the first
- **Build fails with "next command not found"** → CF is using cached node_modules; in the build settings hit "Retry deployment" with "Build cache" disabled
