# Udhaari

A shared ledger for money lent and borrowed. It's an installable PWA (Android, iOS, desktop) backed by Supabase's free tier. Both people see and edit the same entries live, and every change is logged.

## One-time setup (≈10 min)

1. **Create a Supabase project** at https://supabase.com (free).
2. **Run the schema**: Dashboard → SQL Editor → paste `supabase/migrations/0001_init.sql` → Run.
3. **Auth settings**: Dashboard → Authentication:
   - *URL Configuration*: set **Site URL** to your deployed URL and add `http://localhost:5173/**` plus `https://<your-domain>/**` to **Redirect URLs**.
   - *Providers → Email*: enabled by default (magic link).
   - *Providers → Google* (optional): create an OAuth client in Google Cloud Console with redirect URI `https://<project>.supabase.co/auth/v1/callback`, then paste the client ID and secret here.
4. **Env**: `cp .env.example .env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Dashboard → Project Settings → API).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

## Deploy (free)

Use Vercel, Netlify or Cloudflare Pages: build command `npm run build`, output folder `dist`, and the two `VITE_*` env vars.
Add an SPA fallback so deep links like `/invite/…` work:
- Netlify: `public/_redirects` containing `/* /index.html 200`
- Vercel: `vercel.json` with `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`
- Cloudflare Pages: SPA fallback is automatic

To install it on a phone, open the site, then use Chrome's "Install app" or Safari's Share → "Add to Home Screen".

## How it works

- **Ledger** = you plus one other person. The other person starts as a placeholder, so you can track someone who isn't on the app.
- **Invite**: on a ledger, tap *Invite*. A 7-day link is shared through WhatsApp or the share sheet. When they accept, they take over the placeholder.
- **Entries** are "X gave Y ₹N" and are stored in paise. Deletes are soft deletes and can be restored in SQL.
- **History**: a database trigger records every create, edit, delete and restore, with who made it and the before/after values. It's shown on each entry's edit screen.
- **Security**: Postgres Row Level Security means only ledger members can read or write a ledger. The history table can't be written from the client.
- **Offline**: the service worker caches the app shell. Query data is saved in IndexedDB. Entries added while offline are queued and synced when you're back online, including after an app restart.

## Layout

```
supabase/migrations/0001_init.sql   tables, RLS, triggers, RPCs, balances view
src/lib/                            supabase client, money utils, query client + offline mutations
src/hooks/                          session, data queries, realtime
src/screens/                        Login, Home, LedgerView, EntryForm (+History), InviteAccept, Profile
```
