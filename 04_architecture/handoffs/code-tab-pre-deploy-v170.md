# Code tab handoff — V1.7.0 pre-deploy code (Phase 0 of `deploy-runbook.md`)

Owner has approved executing the V1.7.0 production deploy per ADR-0016. Phase 0 is your work; owner blocks on it. Estimate: ~1 day of focused work.

## What you're doing

Closing the in-code half of the V1.7 ship carry-forwards + the participant-runtime security review #9 deferral + the CI gate ADR-0016 specifies. Owner does the vendor signups + deploy clicks afterward per `04_architecture/deploy-runbook.md`.

## What's in scope (4 items; one commit per item)

### 1. Upstash RateLimitAdapter

- New interface: `05_app/server/adapters/ratelimit.ts`
  ```ts
  export interface RateLimitAdapter {
    /**
     * Check + increment under a sliding window.
     * @returns allowed: false → caller must reject the request.
     */
    check(key: string, window: RateLimitWindow): Promise<{
      allowed: boolean;
      remaining: number;
      resetMs: number;
    }>;
  }

  export interface RateLimitWindow {
    /** Window length in seconds. */
    windowSeconds: number;
    /** Max requests per window. */
    max: number;
  }
  ```
- New impl: `05_app/server/adapters/ratelimit.upstash.ts` — wraps `@upstash/ratelimit` + `@upstash/redis`; reads `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`; uses `Ratelimit.slidingWindow(max, ${windowSeconds} s)`. Per ADR-0007 adapter discipline: this file is the ONLY one in the repo importing from `@upstash/*`.
- Dev fallback: same pattern as the Inngest dev fallback you already shipped — when `UPSTASH_REDIS_REST_URL` is unset, return an in-memory limiter that's per-instance (acceptable for `npm run dev`; ineffective on serverless, which is fine because we won't ship without the real one).
- Tests: round-trip + boundary cases for both the real adapter (mock the Upstash REST endpoint via MSW or similar) + the dev fallback.
- Lock-in inventory update — add an Upstash row: behind the adapter; migration target = self-managed Redis on Railway/Fly.

### 2. Rate-limit calls on `/take/*` Server Actions

Per the participant-runtime security review #9 deferral. Two windows from the security review note:

- `beginAction` (consent → session start): **3 starts/min per `recruitment_session_id` + a coarse IP bucket** from the edge headers (Vercel sets `x-forwarded-for`; take the first IP, hash to a coarse `/24` bucket — don't store raw IPs anywhere, just the bucket key).
- `answerAction` (per-question advance): **30 answers/min per `response.id`** (the session ULID). This bounds a runaway client without affecting normal pace.

Behavior on `allowed: false`:
- `beginAction` → redirect to a friendly "too many starts, please wait" page (new route `/take/[studyId]/throttled`).
- `answerAction` → render the current question with a banner "throttled, retry in {N}s" + a `Retry` button that re-submits.

**Note on the IP bucket:** ADR-0014 forbids storing raw IPs. The bucket is a one-way hash of `${ipv4_first_3_octets}:${UPSTASH_SECRET_SALT}` (env var; treat like `TOKEN_ENCRYPTION_KEY` but cheap to rotate). Never persisted to Postgres; lives only in Upstash key space.

Tests: a participant taking a study normally is unaffected (~1 start, ~2-3s between answers); a fuzzed loop tripping the limit is rejected.

### 3. `.github/workflows/ci.yml`

Standard Node 20 + npm pipeline:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: 05_app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: 05_app/package-lock.json
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- The default Playwright `test:e2e` is the 4 unauthenticated specs (chromium project); the gated `test:e2e:auth` project stays opt-in (owner runs it against real Clerk per `deploy-runbook.md` Phase 7b).
- The pgLite tests Drizzle uses don't need a live Postgres in CI.
- Vercel **Settings → Git → Ignored Build Step** should be wired post-merge:
  ```sh
  bash -c "git fetch && git diff --quiet HEAD~1 HEAD ':!**/*.md' && exit 1 || exit 0"
  ```
  ...or simpler, use Vercel's "Skip build if CI is failing" via a GitHub status check. Either path works.

### 4. `05_app/.env.example` update

Add the two Upstash vars + the IP-bucket salt:

```
# === Rate limiting (V1.7.0, ADR-0016) — Upstash Redis ===
# Sign up at upstash.com → create a Redis database → copy REST URL + REST token.
# When unset locally, the RateLimitAdapter falls back to an in-memory per-instance
# limiter (sufficient for `npm run dev`; ineffective on serverless).
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
# Coarse-bucket IP hash salt for /take/* rate-limiting. Generate once and keep
# stable: openssl rand -hex 16. Rotating invalidates current IP buckets (cheap;
# unlike TOKEN_ENCRYPTION_KEY this is safe to rotate).
UPSTASH_IP_BUCKET_SALT=
```

## What's NOT in scope (owner-only or later)

- **Do not** create Vercel/Upstash/Clerk-prod/OSF-prod accounts (owner does that in Phase 1-2 of the runbook).
- **Do not** push to GitHub without owner confirmation (the workflow file changes CI behavior — owner approves).
- **Do not** touch `TOKEN_ENCRYPTION_KEY` anywhere (permanent ledger key per ADR-0016 §6).
- **Do not** run `npm run db:migrate` against any environment that isn't yours (Neon prod branch is owner-owned).
- The 3-user auth e2e run happens against real Clerk on production — that's Phase 7b, owner-coordinated; you fix selector issues when they surface.
- Axe DevTools pass is owner-run (Phase 7a); you fix findings.

## Commit sequence (4 small commits, one PR per logical chunk)

1. `feat(adapters): RateLimitAdapter interface + Upstash impl + dev fallback (PR-A pre-deploy)`
2. `feat(take): rate-limit beginAction + answerAction per security review #9 (PR-A pre-deploy)`
3. `ci: GitHub Actions workflow + Vercel ignored-build-step hook (PR-A pre-deploy)`
4. `docs(env): Upstash + IP-bucket-salt env vars (PR-A pre-deploy)`

Or bundle as one PR titled "PR-A pre-deploy: rate-limiter + CI for V1.7.0 deploy" if you prefer.

When green: ping owner. Owner starts Phase 1 of the deploy runbook.

## Reading order before you start

1. `04_architecture/deploy-runbook.md` (the do-list this handoff feeds)
2. `04_architecture/adrs/0016-production-deployment-architecture.md` (the architecture; §2 explains why Upstash; §6 explains why TOKEN_ENCRYPTION_KEY is sacred)
3. `06_qa/audit-logs/2026-06-03-participant-runtime-security-review.md` §"Deferred to production deploy" (item #9 = your rate-limit work)
4. `04_architecture/lock-in-inventory.md` (you'll add an Upstash row at the end)
5. `00_meta/STATUS.md` (current state)

Then start with item 1. Don't skip ahead — the rate-limit calls in item 2 import the adapter from item 1.
