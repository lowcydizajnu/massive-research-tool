# Deploy runbook — V1.7.0 production ship

Concrete, ordered checklist for executing the production deploy locked in [ADR-0016](./adrs/0016-production-deployment-architecture.md). Mirrors the ADR's 10-step setup checklist with current-state notes (what Code tab still owes, which env vars actually exist today) so this page is enough to work through end-to-end. **Read [ADR-0016](./adrs/0016-production-deployment-architecture.md) once for context before starting; this page is the do-list.**

**Order matters.** Phase 0 has to land before owner can do Phase 1. Phase 6 only runs once everything is live.

---

## Phase 0 — Code tab pre-deploy work (~1 day; Code tab autonomously)

These cannot be skipped. The deploy is contingent on them. Code tab handoff for these items is paired with this runbook (see `04_architecture/handoffs/code-tab-pre-deploy-v170.md`).

- [ ] **Upstash RateLimitAdapter** at `05_app/server/adapters/ratelimit.upstash.ts` (interface in `ratelimit.ts`); reads `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`; exposes `check(key, window): Promise<{allowed, remaining, resetMs}>`.
- [ ] **Rate-limit calls on `/take/*`** Server Actions — keyed by `recruitment_session_id` + a coarse IP bucket from the edge headers; sliding window (3 starts/min per session + 30 answers/min per session). Closes participant-runtime security review item #9.
- [ ] **`.github/workflows/ci.yml`** runs `npm run typecheck && npm run test && npm run build && npx playwright test --project=chromium` on every PR + push to main; uploads a status check.
- [ ] **`.env.example` updated** with the new Upstash vars (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) and a comment about Vercel-Project-env-var scoping.
- [ ] **Vitest + new rate-limit tests green; validator clean.** (Code tab's own discipline.)
- [ ] **Lock-in inventory updated** with Upstash entry (vendor, what's behind the adapter, migration target = self-managed Redis on Railway/Fly).
- [ ] **Commit + push to GitHub.** (Owner okays the push since the workflow file change touches CI.)

**Owner waits.** Don't start Phase 1 until Code tab pings "pre-deploy code merged."

---

## Phase 1 — Vendor accounts + Code tab work merged (~30 min owner)

- [ ] **Vercel Hobby account** — sign up at vercel.com (free; you can upgrade to Pro later if cost ceilings change). Connect GitHub.
- [ ] **Upstash account** — sign up at upstash.com (free tier covers V1.7.0 easily).
- [ ] (Already have) Clerk, Neon, Inngest, OSF accounts from dev.
- [ ] (Optional now, required before Phase 5) Domain purchased + ready to point DNS. If you don't have one, `<project>.vercel.app` is fine for the first smoke test.

---

## Phase 2 — Per-vendor production setup (~1.5 hours owner)

Each of these creates a **separate** production instance distinct from your existing dev keys in `.env.local`. **Do not** reuse dev keys in production — different environment, different blast radius, different rotation policy.

### 2a. Clerk production application

- [ ] Clerk dashboard → **Create application** → name it (e.g., "Massive Research Tool — Production").
- [ ] Enable: Email magic-link sign-in + Google OAuth (mirror dev).
- [ ] Production URLs:
  - Application home: `https://<your-domain>/`
  - Sign-in URL: `https://<your-domain>/signin`
  - Sign-up URL: `https://<your-domain>/signup`
  - After sign-up URL: `https://<your-domain>/studies`
  - After sign-in URL: `https://<your-domain>/studies`
- [ ] **Authorized redirect URLs** (Google OAuth):
  - `https://<your-domain>/sso-callback`
  - `https://<your-domain>/signup/sso-callback`
- [ ] Email-link "verify" page: `https://<your-domain>/signup/verify` (or whatever your sign-up flow expects).
- [ ] **Copy the production keys** — Publishable + Secret. You'll paste them into Vercel in Phase 4.
- [ ] **Do not delete the dev app** — you'll still want it for localhost testing.

### 2b. OSF production application

- [ ] At `osf.io/settings/applications` → **Create new application**.
- [ ] Name: "Massive Research Tool — Production".
- [ ] **Redirect URI**: `https://<your-domain>/api/auth/osf/callback` (this is the path `.env.example` already names as `OSF_OAUTH_REDIRECT_URI`).
- [ ] Scope: `osf.full_write`.
- [ ] **Copy** the production `OSF_OAUTH_CLIENT_ID` + `OSF_OAUTH_CLIENT_SECRET`.

### 2c. Neon production branch

- [ ] Neon dashboard → open the existing project → **Branches** → create new branch from `main` named `production` (Neon branches are full Postgres branches; isolated data but shared project).
- [ ] **Copy** the production `DATABASE_URL` (the `pgbouncer`-pooled connection string is fine — Drizzle + postgres-js work with it).
- [ ] Run the migration **once against production** before first deploy. From your machine:
  ```sh
  cd 05_app
  DATABASE_URL='<production-url>' npm run db:migrate
  ```
  (You can also wire `db:migrate` into Vercel's build command — but running it once manually first verifies the URL is correct without a deploy.)
- [ ] **Re-seed the module catalogue + frameworks** against production (the dev seed scripts read from `DATABASE_URL`):
  ```sh
  DATABASE_URL='<production-url>' npm run db:seed
  ```
  (Don't run `seed-network-demo.ts` against prod — that's solo-testing scaffold.)

### 2d. Inngest Cloud

- [ ] Inngest dashboard → **New app** → connect via Vercel integration (it'll appear after you've created the Vercel project in Phase 3).
- [ ] Inngest auto-discovers the `/api/inngest` route handler once the Vercel app deploys.
- [ ] **Copy** `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`.

### 2e. Upstash Redis

- [ ] Upstash dashboard → **Create database** → Redis → single-region close to your Vercel primary region (probably `us-east-1` or `eu-central-1`); Global is overkill for V1.7.0.
- [ ] **Copy** `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
- [ ] (Optional) Set max-memory eviction policy to `allkeys-lru` — Upstash default is fine for rate-limit keys (short TTLs).

### 2f. `TOKEN_ENCRYPTION_KEY` (generate ONCE; **NEVER rotate** under V1 per ADR-0016 §6)

On your machine:
```sh
openssl rand -hex 32
```

- [ ] Copy the output. **This will go into Vercel production env vars only.** Don't put it in `.env.local` (different value), don't commit it anywhere, don't share it.
- [ ] **Back it up** in your password manager. If you lose it, every stored OSF token becomes garbage and every researcher has to reconnect OSF. There's no "I forgot" recovery — the key IS the recovery.

---

## Phase 3 — Vercel project creation (~10 min owner)

- [ ] Vercel dashboard → **Add new project** → Import from GitHub → pick the `Massive Research Tool` repo.
- [ ] **Root directory**: `05_app` (not the repo root).
- [ ] **Framework preset**: Next.js (auto-detected).
- [ ] **Build command**: `npm run build` (default).
- [ ] **Production branch**: `main`.
- [ ] **Install command**: default (`npm install`).
- [ ] **DO NOT click Deploy yet** — env vars first (Phase 4).

---

## Phase 4 — Vercel environment variables (~15 min owner)

Vercel → project → **Settings** → **Environment Variables**. **Production scope only** (uncheck Preview + Development; preview env will use a separate set later if needed).

Paste each of the following with its production value from Phase 2:

| Variable | Source | Scope |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` (or `https://<project>.vercel.app` if no domain yet) | Production |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk PROD app | Production |
| `CLERK_SECRET_KEY` | Clerk PROD app | Production |
| `DATABASE_URL` | Neon `production` branch | Production |
| `INNGEST_EVENT_KEY` | Inngest Cloud | Production |
| `INNGEST_SIGNING_KEY` | Inngest Cloud | Production |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` from 2f | **Production (NEVER ROTATE)** |
| `OSF_OAUTH_CLIENT_ID` | OSF PROD app | Production |
| `OSF_OAUTH_CLIENT_SECRET` | OSF PROD app | Production |
| `OSF_OAUTH_REDIRECT_URI` | `https://<your-domain>/api/auth/osf/callback` | Production |
| `OSF_API_BASE` | `https://api.osf.io/v2` | Production |
| `OSF_AUTHORIZE_URL` | `https://accounts.osf.io/oauth2/authorize` | Production |
| `OSF_TOKEN_URL` | `https://accounts.osf.io/oauth2/token` | Production |
| `OSF_SCOPES` | `osf.full_write` | Production |
| `UPSTASH_REDIS_REST_URL` | Upstash database | Production |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash database | Production |

R2 + Liveblocks vars in `.env.example` are **not yet wired** (no consumers in V1.7.0); skip them. Add when the asset-storage / Whiteboard features land.

---

## Phase 5 — Domain + SSL (~30 min owner, including DNS propagation wait)

- [ ] Vercel → project → **Settings** → **Domains** → Add domain.
- [ ] Follow Vercel's wizard — usually one `CNAME` record at your DNS provider pointing `<subdomain>` to `cname.vercel-dns.com`. Bare apex uses an `ALIAS`/`ANAME` instead.
- [ ] Vercel auto-provisions SSL via Let's Encrypt. **Wait until SSL is green** before the smoke test.
- [ ] **Update Clerk + OSF redirect URLs** in their respective dashboards to use the real domain (you may have used `<project>.vercel.app` in Phase 2; swap now). Yes, this is annoying. Yes, you'll forget and get an `invalid_redirect_uri` if you don't.

---

## Phase 6 — First deploy + smoke test (~20 min owner)

- [ ] Push **anything** to `main` (the pre-deploy code merge in Phase 0 was likely the first such push and may have already triggered a build; if not, push a no-op commit to trigger one).
- [ ] Vercel build runs; if CI gate is wired (Phase 0 item) it'll skip on a failed CI status check. If green, deploys.
- [ ] Open `https://<your-domain>/` — should land on the marketing/welcome surface.
- [ ] **Smoke test** — mirror the V1.5 + V1.6 owner walkthroughs but on production:
  1. Sign up as a fresh user (real email).
  2. Build a study (any framework or blank).
  3. **Preregister** against real OSF (a real registration will be created — feel free to use a throwaway one; OSF holds it pending your approval per `require_approval()`).
  4. Open recruitment.
  5. In an incognito tab: take the study as a participant.
  6. Verify Results updates.
- [ ] If anything errors: check Vercel **Logs** + Inngest **Runs** + Upstash **Data Browser**. Common first-deploy issues: a misnamed env var, a forgotten redirect URI update, a missed `db:migrate`.

---

## Phase 7 — Owner-run quality gates (~1 hour owner)

These are the V1.7 audit Sign-off carry-forwards. Run them against the **production URL** — preview URLs are fine for axe; the multi-user e2e needs real Clerk anyway.

### 7a. Real-Clerk axe DevTools

Install the axe DevTools browser extension if not already. Sign in to production. For each of these surfaces, open axe DevTools → run the WCAG 2.1 AA scan → log results:

- [ ] `/studies` (Studies destination)
- [ ] `/studies/[id]/build` (Builder — Conditions section + tag editor + forkability control + module configs)
- [ ] `/studies/[id]/share` (Share stage — comment composer + thread)
- [ ] `/studies/[id]/preregister` (Preregister stage)
- [ ] `/studies/[id]/run` (Run stage — Preregister + Publish & run buttons)
- [ ] `/studies/[id]/results` (Results stage)
- [ ] `/activity` Yours + Follows
- [ ] `/frameworks` Frameworks destination
- [ ] `/studies/[id]/build` Replications tab

Log each pass/fail + the specific violations into a new file at `06_qa/audit-logs/{date}-v170-axe-pass.md` (Code tab can scaffold + fix any findings as a follow-up).

### 7b. Multi-user e2e on real Clerk

Create three test users in Clerk (Hanna, Maya, Sofia). Add their email + password to a local-only `.env.test`:
```
HANNA_TEST_EMAIL=...
HANNA_TEST_PASSWORD=...
MAYA_TEST_EMAIL=...
MAYA_TEST_PASSWORD=...
SOFIA_TEST_EMAIL=...
SOFIA_TEST_PASSWORD=...
```

From your machine, against the production URL:
```sh
cd 05_app
RUN_AUTH_E2E=1 BASE_URL='https://<your-domain>' npm run test:e2e:auth
```

If selectors are stale, Code tab fixes them. Goal: the multi-workspace e2e (Hanna requests review → Maya comments + @mentions → Sofia forks → Maya sees fork in Activity Follows → Replications shows divergence) runs green end to end.

---

## Phase 8 — Deploy audit log + V1.7.0 close (~30 min Code tab + sign-off)

- [ ] Code tab drafts `06_qa/audit-logs/{date}-v170-production-deploy.md` mirroring the V1.5/V1.6 audit pattern: scope, test results (incl. the 3-user e2e), a11y (the Phase 7a log), security (rate-limiter live + the V1.7 audit items now closed), performance (Lighthouse on `/take/*` finally measurable), manual exploratory, sign-off.
- [ ] **Owner signs off** the audit. V1.7.0 is now **publicly shippable**.
- [ ] Tag the commit: `git tag v1.7.0 && git push origin v1.7.0`.
- [ ] Add a `release-notes/v1.7.0.md` summarizing the user-facing additions (the review network) for posterity.

---

## Rollback (if something breaks)

Vercel keeps every prior deploy. **Settings** → **Deployments** → pick the last-good deployment → **Promote to Production**. One click; no data loss; rate-limit state persists in Upstash.

If a migration is the problem: Neon supports branch-level point-in-time restore. Restore the `production` branch to before the deploy + redeploy the prior code.

If `TOKEN_ENCRYPTION_KEY` is somehow lost or compromised: the recovery story is in [ADR-0016](./adrs/0016-production-deployment-architecture.md) §6 — revoke all `registry_connection` rows + force every researcher to reconnect OSF. This is a real outage; don't lose the key.

---

## References

- [ADR-0016 — Production deployment architecture](./adrs/0016-production-deployment-architecture.md) (the locked decisions; this runbook is the execution side)
- [ADR-0007 — Path A vs B](./adrs/0007-path-a-vs-b.md) (vendor lock-in + cost ceilings)
- [Lock-in inventory](./lock-in-inventory.md) (per-vendor migration targets)
- [V1.7 closeout audit](../06_qa/audit-logs/2026-06-03-v17-review-network.md) (the four ship carry-forwards this runbook closes)
- [Participant-runtime security review](../06_qa/audit-logs/2026-06-03-participant-runtime-security-review.md) (item #9 — the rate-limit deferral this runbook executes)
