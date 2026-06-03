# ⚠️ SUPERSEDED 2026-06-03 — DO NOT USE

> **Owner rejected the tradeoffs of this fast path** (dev Clerk + dev Neon + dev OSF on prod; no rate-limiter; no CI gate; no auto-axe). This file is preserved for historical context only.
>
> **Use instead:**
> - [`deploy-runbook.md`](./deploy-runbook.md) — the trimmed owner runbook for the proper-path V1.7.0 deploy (~30-40 min owner engagement)
> - [`handoffs/code-tab-pre-deploy-v170.md`](./handoffs/code-tab-pre-deploy-v170.md) — the Phase 0 Code-tab work that precedes the runbook (~1.5 days, includes Upstash rate-limiter, CI workflow, auto-axe spec, bootstrap script, and the lazy-DB fix)
> - [`handoffs/code-tab-lazy-db-init.md`](./handoffs/code-tab-lazy-db-init.md) — the urgent prereq Code tab does first (~30 min); the lazy-DB fix unblocks future builds regardless of which deploy path you take
>
> The content below is left for reference but no decisions should be made from it.

---

# Fast-path Vercel deploy worksheet — V1.7 to .vercel.app (SUPERSEDED)

> Goal: get V1.7 LIVE in ~15 minutes by reusing your existing dev credentials. Tradeoffs at the bottom — read once before starting, then work top to bottom.
>
> **Never write real secret values into this file.** It contains placeholders only. Paste real values directly from `.env.local` into Vercel's UI.

---

## What you'll do (4 steps, ~15 min)

1. **Prep (~5 min)** — add one OSF redirect URI + sign up for Inngest Cloud + grab your `.vercel.app` URL.
2. **Paste 14 env vars into Vercel (~5 min)** — section B below; one row at a time.
3. **Redeploy (~30 seconds)** — click Redeploy in Vercel.
4. **Smoke test (~5 min)** — sign up, build a study, take it as participant.

---

## A. Prep (do these 3 things first)

### A1. Find your Vercel URL

- Open Vercel dashboard → your project → top of the page shows the production URL, something like `https://massive-research-tool-xyz.vercel.app`.
- **Write it down here so you can paste it consistently below:**
  ```
  <your-vercel-url> = https://__________________________________.vercel.app
  ```

### A2. Add a production callback URI to your existing OSF Developer App

- Open [osf.io/settings/applications](https://osf.io/settings/applications).
- Click your existing dev OSF app (the one whose Client ID is in your `.env.local`).
- Find **Callback URL**. OSF lets you have multiple — add a new line:
  ```
  https://<your-vercel-url>/api/auth/osf/callback
  ```
  (Keep the existing `http://localhost:3000/api/auth/osf/callback` line — you'll still want it for local dev.)
- Save.

### A3. Sign up for Inngest Cloud (~2 min)

- Open [inngest.com](https://inngest.com) → Sign up (free tier covers V1.7 easily; Google sign-in is fastest).
- Once in, you'll see a "Connect your app" prompt. Skip it for now — you'll connect via env vars.
- Inngest dashboard → **Manage** → **Event keys** → copy the **Event Key**. Save as `INNGEST_EVENT_KEY`.
- Inngest dashboard → **Manage** → **Signing key** → copy the signing key. Save as `INNGEST_SIGNING_KEY`.

(If you skip Inngest Cloud entirely: OSF push + V1.7 notification fan-out won't work in production. Not viable for V1.7. Spend the 2 min.)

---

## B. The 14 env vars to paste into Vercel

**Where to paste each one:**

Vercel → your project → **Settings** → **Environment Variables** → **Add New** → fill **Name** + **Value** → set **Environment = Production** (uncheck Preview + Development) → **Save**. Repeat for each of the 14 rows below.

When all 14 are saved, move to Section C.

---

### 1. `NEXT_PUBLIC_SITE_URL`
- **Get from:** Section A1 above
- **Value:** `https://<your-vercel-url>`

### 2. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- **Get from:** `05_app/.env.local`, line starting `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=`
- **Value:** copy whatever is after `=`

### 3. `CLERK_SECRET_KEY`
- **Get from:** `05_app/.env.local`, line `CLERK_SECRET_KEY=`
- **Value:** copy whatever is after `=`

### 4. `DATABASE_URL`
- **Get from:** `05_app/.env.local`, line `DATABASE_URL=`
- **Value:** copy whatever is after `=` (this is your Neon dev branch — you'll be writing prod data into it; see tradeoffs)

### 5. `INNGEST_EVENT_KEY`
- **Get from:** Section A3 above (NOT from `.env.local` — your local one is empty)
- **Value:** the Event Key you copied from Inngest dashboard

### 6. `INNGEST_SIGNING_KEY`
- **Get from:** Section A3 above
- **Value:** the Signing Key you copied from Inngest dashboard

### 7. `TOKEN_ENCRYPTION_KEY`
- **Get from:** `05_app/.env.local`, line `TOKEN_ENCRYPTION_KEY=`
- **Value:** copy whatever is after `=` (this is the same key you've been using locally — for the fast path we keep one key; you can rotate to a separate production key later, but rotation invalidates stored OSF tokens, so for now keep it shared)

### 8. `OSF_OAUTH_CLIENT_ID`
- **Get from:** `05_app/.env.local`, line `OSF_OAUTH_CLIENT_ID=`
- **Value:** copy whatever is after `=`

### 9. `OSF_OAUTH_CLIENT_SECRET`
- **Get from:** `05_app/.env.local`, line `OSF_OAUTH_CLIENT_SECRET=`
- **Value:** copy whatever is after `=`

### 10. `OSF_OAUTH_REDIRECT_URI`
- **Get from:** Section A1 + A2 above
- **Value:** `https://<your-vercel-url>/api/auth/osf/callback`
- **NOT** the localhost one from `.env.local`

### 11. `OSF_API_BASE`
- **Get from:** literal constant (matches `.env.local`)
- **Value:** `https://api.osf.io/v2`

### 12. `OSF_AUTHORIZE_URL`
- **Get from:** literal constant
- **Value:** `https://accounts.osf.io/oauth2/authorize`

### 13. `OSF_TOKEN_URL`
- **Get from:** literal constant
- **Value:** `https://accounts.osf.io/oauth2/token`

### 14. `OSF_SCOPES`
- **Get from:** literal constant
- **Value:** `osf.full_write`

---

## C. Redeploy

- Vercel → your project → **Deployments**.
- Find the most recent failed deployment (red ✗).
- Click the `...` menu → **Redeploy** → confirm.
- Wait ~2 minutes for the build. Should turn green.

If it goes red again: copy the error log, paste to me, I'll diagnose.

---

## D. Smoke test (~5 min)

Once the build is green:

- [ ] Open `https://<your-vercel-url>/` — should load the welcome surface.
- [ ] Sign up as a fresh user (real email; you can use a `+test` alias on your gmail).
- [ ] Build a study (try Misinformation Research Framework or Blank; you should see the 8 modules / 9 versions in the Add-block picker).
- [ ] Open it in Builder; add a likert block; configure one condition.
- [ ] Either:
  - **Preregister** — will create a real OSF registration (use a throwaway label like "v1.7 prod smoke 2026-06-03"; OSF holds it pending your approval).
  - OR **Publish & run** — skips OSF entirely; quicker for the smoke.
- [ ] Open recruitment, copy the URL, open in incognito, take the study.
- [ ] Verify Results updates.

If everything works: V1.7 is live. Tell me and I'll capture the moment in STATUS + dashboard + queue Code tab to draft the deploy audit log.

If something errors: send me the error + which step. Common ones:
- `Clerk session error` → likely a Clerk redirect URL needs the `.vercel.app` URL added in Clerk dashboard (Clerk → your app → Paths → add the production URLs).
- `OSF returned 400 redirect_uri_mismatch` → the OSF Developer App's callback URL list doesn't include the `.vercel.app` URL (back to Section A2).
- Anything else → paste the error.

---

## Tradeoffs of this fast path (vs the proper bootstrap path)

You're shipping V1.7 by **reusing dev infrastructure for production**. What that means concretely:

- **Dev Clerk app** = anyone who finds your `.vercel.app` URL can sign up there alongside your dev users. Mixed user pool. Fine for soft launch; not fine for real public users.
- **Dev Neon branch** = production user data writes into the same branch you use for local development. You could lose data by running a `db:reset` locally without thinking. Not a disaster (Neon supports branch point-in-time restore) but a real footgun.
- **Dev OSF Developer App** = preregistrations from production show the dev app's metadata to OSF. OSF approval flow still works; metadata is just slightly off.
- **No rate-limiter on `/take/*`** = the participant-runtime security review #9 deferral is still open. Single bad actor could flood the answer endpoint. Fine for a soft launch; not fine for an open Prolific study at scale.
- **No CI gate before deploys** = a typo in a `main` push can break production. You'll have to be careful with what you push to `main` until the GitHub Actions workflow lands.
- **No automated axe pass** = you should do a manual axe DevTools check on the new researcher surfaces (Activity, Frameworks, Replications tab, tag editor, Share) before sharing the URL with real participants.

When you want to clean these up: the proper path is what Code tab was going to build (Phase 0 pre-deploy code per the original handoff). Estimated ~1.5 days Code tab work. Today, the fast path gets you live; the proper path comes later when you have the appetite.

---

## What I'm doing in parallel

Queuing Code tab to fix the underlying brittleness that caused the build failure — the DB client module throws at import time if `DATABASE_URL` is missing, which breaks `next build`'s static analysis. Lazy-init the client (defer the env check to first query) so this class of failure can't happen again. ~10-line change; harmless to the existing code. Code tab handoff is at `04_architecture/handoffs/code-tab-lazy-db-init.md`.
