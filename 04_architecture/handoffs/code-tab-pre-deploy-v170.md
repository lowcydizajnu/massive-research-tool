# Code tab handoff — V1.7.0 pre-deploy code (Phase 0 of `deploy-runbook.md`)

Owner has approved executing the V1.7.0 production deploy per [ADR-0016](../adrs/0016-production-deployment-architecture.md) + its **2026-06-03 amendment** (API-driven bootstrap script — owner wants maximum automation, ~30-40 min total owner engagement instead of ~3-4h). Phase 0 is your work; owner blocks on it. Estimate: **~1.5 days of focused work** (expanded from ~1 day per the original handoff because the bootstrap + verification scripts are new scope).

## What you're doing

Closing the V1.7 ship carry-forwards + participant-runtime security review #9 + ADR-0016's CI gate **AND** building the bootstrap + verification machinery that drives the deploy itself with minimal owner clicks. Owner does account signups + API key generation + smoke test + sign-off; everything else flows through your code.

## Read first (in this order)

1. [`04_architecture/deploy-runbook.md`](../deploy-runbook.md) — the trimmed owner sequence; understand what owner WILL do so you know what your bootstrap doesn't have to.
2. [`04_architecture/adrs/0016-production-deployment-architecture.md`](../adrs/0016-production-deployment-architecture.md) — original ADR + **2026-06-03 amendment** (the API-driven bootstrap is the load-bearing decision; the "stays manual" + "tradeoff" sections set your constraints).
3. [`06_qa/audit-logs/2026-06-03-participant-runtime-security-review.md`](../../06_qa/audit-logs/2026-06-03-participant-runtime-security-review.md) §"Deferred to production deploy" — item #9 = your rate-limit work.
4. [`04_architecture/lock-in-inventory.md`](../lock-in-inventory.md) — you'll add an Upstash row at the end.
5. [`00_meta/STATUS.md`](../../00_meta/STATUS.md) — current state.

## Scope (8 items; one PR per logical chunk OR one big PR titled "PR-A pre-deploy: V1.7.0 ship automation")

### 1. Upstash `RateLimitAdapter`

(Unchanged from prior handoff.) Interface at `05_app/server/adapters/ratelimit.ts`; impl at `05_app/server/adapters/ratelimit.upstash.ts` (ONLY repo file importing `@upstash/*` per ADR-0007 adapter discipline); dev fallback in-memory per-instance (parallel to the Inngest dev fallback you shipped). Tests for round-trip + boundary + the dev fallback. Add Upstash to the lock-in inventory (migration target = self-managed Redis on Railway/Fly).

### 2. Rate-limit calls on `/take/*` Server Actions

(Unchanged from prior handoff.) Closes participant-runtime security review #9.

- `beginAction`: **3 starts/min per `recruitment_session_id` + coarse-IP bucket** (one-way hash of first-3-octets + `UPSTASH_IP_BUCKET_SALT`, never persisted to Postgres — ADR-0014 PII boundary holds).
- `answerAction`: **30 answers/min per `response.id`**.
- On `allowed: false`: `beginAction` → redirect to `/take/[studyId]/throttled`; `answerAction` → render current question with retry banner.

Tests: normal pace unaffected; fuzzed loop tripping the limit is rejected.

### 3. `.github/workflows/ci.yml`

(Unchanged.) Node 20 + `npm ci && npm run typecheck && npm run test && npm run build && npx playwright install --with-deps chromium && npm run test:e2e`. Sets a status check; Vercel's "Skip build if CI failing" hooks off it.

### 4. `05_app/.env.example` update — Upstash + bootstrap

Add the three Upstash vars (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_IP_BUCKET_SALT`) per the prior handoff, **PLUS** add a separate `05_app/.env.production.example` with the deploy-bootstrap-only keys owner pastes in once:

```
# === Deploy bootstrap (V1.7.0, ADR-0016 amendment 2026-06-03) ===
# This file mirrors .env.production (gitignored). Owner pastes API keys
# generated in deploy-runbook.md Phase 1 here once; scripts/deploy-bootstrap.ts
# reads them and drives every vendor that has a programmatic API. NEVER COMMIT.
#
# TOKEN_ENCRYPTION_KEY is INTENTIONALLY NOT IN THIS FILE per ADR-0016
# amendment — owner pastes it directly into Vercel via `vercel env add`.

VERCEL_TOKEN=                          # vercel.com/account/tokens (full scope OR team-scoped)
VERCEL_TEAM_ID=                        # optional; only if you use a Vercel team
GITHUB_REPO=                           # e.g. paweł-rosner/massive-research-tool

NEON_API_KEY=                          # console.neon.tech/app/settings/api-keys
NEON_PROJECT_ID=                       # from any branch URL in Neon

UPSTASH_API_KEY=                       # upstash.com/account/management-api
UPSTASH_EMAIL=                         # the email on your Upstash account
UPSTASH_REGION=us-east-1               # single region; close to Vercel primary

CLERK_PROD_SECRET_KEY=                 # from the PROD Clerk Application you create as a shell
CLERK_PROD_PUBLISHABLE_KEY=            # ditto
CLERK_PROD_APPLICATION_ID=             # from the PROD Clerk dashboard URL

# Optional DNS automation; if your provider isn't here, skip + add the CNAME manually.
DNS_PROVIDER=                          # cloudflare | route53 | namecheap | none
CLOUDFLARE_API_TOKEN=                  # if DNS_PROVIDER=cloudflare; needs DNS:Edit on the zone
CLOUDFLARE_ZONE_ID=                    # ditto
# (route53/namecheap: similar; document equivalents)

OSF_PROD_OAUTH_CLIENT_ID=              # from osf.io/settings/applications PROD app
OSF_PROD_OAUTH_CLIENT_SECRET=          # ditto

PRODUCTION_DOMAIN=                     # e.g. app.example.com (no scheme)
TEST_USER_HANNA_EMAIL=                 # e.g. hanna+clerk_test@example.com (uses Clerk's +clerk_test convention)
TEST_USER_MAYA_EMAIL=                  # ditto
TEST_USER_SOFIA_EMAIL=                 # ditto
TEST_USER_PASSWORD=                    # shared across the 3 +clerk_test users; bootstrap script sets it
```

### 5. `scripts/deploy-bootstrap.ts` — the load-bearing script

The single command owner runs: `npm run deploy:bootstrap`. Reads `.env.production`; drives every vendor with an API; exits with a runbook-style summary owner can paste into the deploy audit.

Steps (each idempotent — re-running the script after a partial failure picks up where it left off):

1. **Validate env** — every required key present + non-empty; fail fast with a list of missing keys.
2. **Neon: create `production` branch** if absent (`POST /projects/{NEON_PROJECT_ID}/branches`); capture connection string (the pooled one — Drizzle works fine with PGBouncer). Run `db:migrate` against it. Run `db:seed` against it (modules + frameworks; **not** the network-demo seeder).
3. **Upstash: create Redis database** (`POST /redis/database/{name}`) if absent; capture REST URL + REST token. Set `allkeys-lru` eviction (cheap; defaults to noeviction).
4. **Vercel: create project** (`POST /v9/projects`) if absent; set root dir `05_app`, framework `nextjs`, production branch `main`, install + build commands from the runbook.
5. **Vercel: bulk-set env vars** (`POST /v9/projects/{id}/env`, scope `production`). Loop over the 15 vars to seed (everything except `TOKEN_ENCRYPTION_KEY`). Include the OSF vars (from `.env.production`), Clerk vars, `DATABASE_URL` from step 2, `INNGEST_*` (owner pastes from Inngest dashboard into `.env.production`; or wire the Vercel-Inngest integration which auto-syncs these), Upstash vars from step 3, `NEXT_PUBLIC_SITE_URL = https://{PRODUCTION_DOMAIN}`. Print a clear note: "TOKEN_ENCRYPTION_KEY NOT set — owner must run `vercel env add TOKEN_ENCRYPTION_KEY production` interactively, then `openssl rand -hex 32 | tr -d '\n' | pbcopy` and paste."
6. **Clerk Production: configure** (`PATCH /v1/applications/{id}` via Backend API) — set redirect URLs (`https://{PRODUCTION_DOMAIN}/sso-callback`, `…/signup/sso-callback`, `…/signup/verify`), enable email magic-link + Google OAuth (mirror dev), set sign-in/sign-up paths. Then `POST /v1/users` for each of the 3 `+clerk_test` users (Clerk's `+clerk_test` convention bypasses email verification for testing).
7. **OSF Production: print manual reminder** (no API) — "Open `https://osf.io/settings/applications` → confirm the PROD app's redirect URI is `https://{PRODUCTION_DOMAIN}/api/auth/osf/callback`. The bootstrap script can't do this for you." (Owner did the create in Phase 2 of the runbook; this is a verification reminder.)
8. **DNS (optional)** — if `DNS_PROVIDER=cloudflare`, `POST /zones/{id}/dns_records` adding the `CNAME` for `{PRODUCTION_DOMAIN}` pointing at `cname.vercel-dns.com`. If `DNS_PROVIDER=none`, print the record owner needs to add manually.
9. **Vercel: add domain to project** (`POST /v9/projects/{id}/domains`) — Vercel then auto-provisions SSL via Let's Encrypt (async; the verify script polls).
10. **Vercel: configure Ignored Build Step** — set the project setting that ties build approval to the GitHub status check from `.github/workflows/ci.yml`.
11. **Print summary** — what was created, what owner still needs to do (paste `TOKEN_ENCRYPTION_KEY`; wait for DNS), the next command to run (`npm run deploy:verify`).

Idempotency notes: each step uses "create if absent" via list-then-create or upsert semantics. Re-running is safe. If a step fails, the script exits with a clear "rerun after fixing {thing}" message + the partial state preserved.

Tests: each vendor's API call has a unit test against a mocked HTTP layer (MSW). An integration test runs the bootstrap end-to-end against a sandbox or with stubs (the test mode shouldn't hit real Neon / Vercel / etc.). The bootstrap should NEVER auto-run on import; only via the CLI entry.

### 6. `scripts/deploy-verify.ts` — the verification wrapper

The second command owner runs: `npm run deploy:verify`. Chains:

1. **HTTP smoke probe** — `GET https://{PRODUCTION_DOMAIN}/` expects 200; `GET …/signin` expects 200; `GET …/api/health` (Code tab adds this endpoint as a tiny RSC that returns `{ok: true, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7) ?? 'dev'}`) expects 200 with the right SHA.
2. **Trigger the axe spec** — `playwright test --project=auth e2e/a11y-researcher-surfaces.spec.ts` with `BASE_URL=https://{PRODUCTION_DOMAIN}`.
3. **Trigger the multi-user e2e** — `playwright test --project=auth e2e/hanna-network.spec.ts e2e/hanna-publish-and-run.spec.ts` with the same `BASE_URL`.
4. **Aggregate** — pretty-print a one-screen summary: smoke ✓/✗, axe violations count per surface, e2e pass/fail per spec.
5. **Write deploy audit draft** — populate `06_qa/audit-logs/{YYYY-MM-DD}-v170-production-deploy.md` from a template (mirror V1.5/V1.6 audit structure). Test counts + a11y results + smoke results fill in automatically; owner reviews + signs.

### 7. `e2e/a11y-researcher-surfaces.spec.ts` — the replacement for owner-run axe DevTools

Uses the existing `auth` Playwright project (the `+clerk_test` fixture you already shipped for `hanna-runtime.spec.ts` and `hanna-network.spec.ts`). For each of the 9 researcher surfaces below: sign in as Hanna (or as needed for the surface), navigate, run `await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()`, assert `violations.length === 0` (or a tightly-scoped allowlist if a known false-positive exists — document each in a comment).

Surfaces:

1. `/studies`
2. `/studies/[id]/build` (Builder + Conditions section + tag editor + forkability control + a representative module config form)
3. `/studies/[id]/share`
4. `/studies/[id]/preregister`
5. `/studies/[id]/run` (both Preregister and Publish & run paths)
6. `/studies/[id]/results`
7. `/activity` Yours + `/activity?tab=follows` Follows
8. `/frameworks`
9. `/studies/[id]/build?tab=replications` (the Replications tab)

Output: a structured `06_qa/audit-logs/{date}-v170-axe-pass.md` written by a post-test hook listing each surface + violations count + (for any violations) the rule id + impact + selector. **Per ADR-0016 amendment §"Quality gates also automated", this REPLACES the owner-run axe DevTools pass** — owner reads the report, doesn't click through axe DevTools in the browser. Equivalence is the same `axe-core` engine under both; what neither catches is focus-management bugs and AT-narration quality (the prior owner-run pass also missed those, so the floor doesn't drop).

### 8. `package.json` scripts + Vercel-CLI wiring

```json
"deploy:bootstrap": "tsx scripts/deploy-bootstrap.ts",
"deploy:verify": "tsx scripts/deploy-verify.ts",
"deploy:test-users": "tsx scripts/seed-clerk-test-users.ts"   // standalone reseed if needed
```

`tsx` already in dev deps from prior work. The verify script picks up `BASE_URL` from `.env.production` (`https://${PRODUCTION_DOMAIN}`).

## What's NOT in scope (owner-only)

- **`TOKEN_ENCRYPTION_KEY` handling.** The bootstrap script intentionally never reads or writes this key. Owner generates with `openssl rand -hex 32`, runs `vercel env add TOKEN_ENCRYPTION_KEY production` interactively (CLI prompts; nothing written to disk), pastes from clipboard. The bootstrap's env-var loop explicitly skips this var and prints a reminder.
- **Vercel + Upstash account signups.** Owner clicks through.
- **Clerk Production Application SHELL creation.** Owner creates the empty app once in the Clerk dashboard; bootstrap configures it. (Clerk Backend API can't `POST /applications` AFAIK.)
- **OSF Developer App creation.** No API; owner clicks.
- **Domain purchase.**
- **Smoke test.** Owner human-verifies. This is irreducible and that's correct — a first production deploy deserves a human walkthrough.
- **Audit sign-off + `git tag v1.7.0`.** Owner signs; Code tab tags only after explicit confirmation per project standing rule.

## Commit sequence

If splitting (recommended for review):

1. `feat(adapters): RateLimitAdapter interface + Upstash impl + dev fallback`
2. `feat(take): rate-limit beginAction + answerAction per security review #9`
3. `ci: GitHub Actions workflow + Vercel ignored-build-step hook`
4. `docs(env): .env.example Upstash vars + .env.production.example deploy-bootstrap shape`
5. `feat(deploy): scripts/deploy-bootstrap.ts — API-driven vendor setup (ADR-0016 amendment)`
6. `feat(deploy): scripts/deploy-verify.ts + /api/health + V1.7.0 audit-log scaffold`
7. `test(a11y): e2e/a11y-researcher-surfaces.spec.ts — Playwright+axe on the 9 surfaces`

If bundling: one PR titled `PR-A pre-deploy: V1.7.0 ship automation (rate-limiter + CI + bootstrap + verify + axe spec)`.

When green: ping owner. Owner starts Phase 1 of the trimmed deploy runbook (~30-40 min start to deploy live + verified).

## Security discipline reminders (per ADR-0016 amendment "Tradeoff")

- `.env.production` lives in `05_app/`; verify it's covered by the existing `.env*` rule in `05_app/.gitignore`. If not, add `.env.production` explicitly + a test that asserts the file is gitignored.
- The bootstrap script's HTTP layer should redact secret values from any error logs (a Vercel API error log shouldn't echo the token). Add a tiny redactor that masks any value that matches `/^[A-Za-z0-9_-]{20,}$/` in error output.
- Never read or store `TOKEN_ENCRYPTION_KEY` anywhere in Code tab's process. If a script ever encounters it (e.g., a verify pass that lists Vercel env vars), drop it on the floor.

## When you're done

Ping owner with: "Phase 0 merged on commit `<sha>`. Owner runbook is ready to execute from Phase 1. Estimated owner engagement: ~30-40 min."
