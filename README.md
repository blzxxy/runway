# Runway v2 — Personal Finance PWA

Cash runway, savings goals (ring fund + emergency buffer), weekly budget, Pokémon-flip tracker
with eBay fee math, projected timeline, and push notifications. Dark, mobile-first, installable
on your iPhone Home Screen, synced across devices via Supabase.

Built with Next.js 14 (App Router) + TypeScript + Tailwind, deployable on Vercel's free tier.

---

## 1. Set up Supabase (~5 minutes)

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick any name/password/region.
2. When the project is ready, open **SQL Editor** (left sidebar) → **New query**.
3. Open `supabase/schema.sql` from this repo, paste the **entire file**, click **Run**.
   This creates all tables, row-level security (each user can only see their own rows),
   and enables Realtime sync.
4. Go to **Authentication → Providers → Email** and make sure **Email** is enabled
   (magic links are on by default; you can disable "Confirm email" double-opt-in if you want
   faster first login).
5. Go to **Authentication → URL Configuration**:
   - **Site URL**: your future Vercel URL (e.g. `https://runway-yourname.vercel.app`) —
     you can come back and set this after step 3 below.
   - **Redirect URLs**: add `https://YOUR-VERCEL-URL/auth/callback` and, for local dev,
     `http://localhost:3000/auth/callback`.
6. Go to **Project Settings → API** and copy three values for later:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only — never share this)

## 2. Generate VAPID keys for push notifications (~1 minute)

On any machine with Node installed:

```bash
npx web-push generate-vapid-keys
```

Copy the output:
- Public Key → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- Private Key → `VAPID_PRIVATE_KEY`

Set `VAPID_SUBJECT` to `mailto:your-email@example.com`.

Also invent a `CRON_SECRET` — any long random string (e.g. run `openssl rand -hex 32`).
Vercel automatically sends it with cron requests so nobody else can trigger your notifications.

## 3. Deploy to Vercel (~5 minutes)

1. Push this folder to a new GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Runway v2"
   # create an empty repo on github.com, then:
   git remote add origin https://github.com/YOURNAME/runway.git
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
   Vercel auto-detects Next.js; don't change build settings.
3. Under **Environment Variables**, add every variable from `.env.example` with your real values.
4. Click **Deploy**. When it finishes you'll get a URL like `https://runway-yourname.vercel.app`.
5. Go back to Supabase **Authentication → URL Configuration** and set that URL as the
   Site URL + add `/auth/callback` to Redirect URLs (step 1.5 above).

**Cron note:** `vercel.json` schedules the notification check daily at 12:00 UTC (8am EDT).
Vercel's free (Hobby) plan supports daily crons; runs land within about an hour of the scheduled
time. During winter (EST) 8am ET is 13:00 UTC — change the schedule in `vercel.json` if you care.

## 4. Install on your iPhone

1. Open your Vercel URL in **Safari** on the phone.
2. Sign in with your email → tap the magic link from your inbox.
3. Walk through onboarding (or skip everything — defaults match the seeded setup).
4. Tap **Share** (square with ↑ arrow) → **Add to Home Screen** → **Add**.
5. Open **Runway from the Home Screen icon** (important — notifications don't work from
   the Safari tab).
6. Go to **Settings (in the app) → Notifications → Enable**, and accept the iOS prompt.
   Requires iOS 16.4 or later.

## 5. Import your v1 data (optional)

If you used the v1 single-file artifact: export a JSON backup there, then in this app go to
**Settings → Data → Import from v1 artifact JSON**. Leave "clear existing first" checked to
avoid duplicating the seeded events/flips.

## Local development

```bash
cp .env.example .env.local   # fill in your values
npm install
npm run dev                  # http://localhost:3000
```

## How the money model works

- **Cash** = starting cash + income + received eBay payouts − expenses − flip buys − savings transfers.
- **Savings transfers** move money out of cash into the ring / emergency / house buckets.
- **Ring purchases** (the diamond) come out of the ring fund, not cash. The ring bar keeps
  showing lifetime progress toward the full goal, with a 💎 marker once the stone is bought.
- **Flip sales**: "sold" computes the payout (price − 13.25% − $0.30/item − shipping) but the
  money sits in **Pending payouts** until you tap **Paid out** — that's when cash moves.
- **Timeline projections** = pending events + weekly budget estimate + expected flip payouts.
  Recurring events auto-extend so you always see at least 8 weeks ahead.
- **Realtime**: change anything on one device and other open devices refresh within seconds.

## Project structure

```
supabase/schema.sql        Postgres schema + RLS + Realtime
src/middleware.ts          Auth session refresh + route protection
src/app/login              Magic-link sign-in
src/app/onboarding         First-run setup wizard (7 steps, all skippable)
src/app/(app)/             Authenticated app: Home, Timeline, Flips, Settings
src/app/api/cron/...       Daily push-notification check (Vercel cron)
src/components/            FinanceProvider (data + realtime), cards, chart, quick-add
src/lib/finance.ts         All money math (fees, projections, chart series)
public/sw.js               Service worker (push + notification clicks)
public/manifest.json       PWA manifest
```
