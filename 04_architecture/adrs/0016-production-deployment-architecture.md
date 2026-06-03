# ADR 0016 — Production deployment architecture

- **Status:** accepted
- **Date:** 2026-06-03
- **Deciders:** project owner + Claude
- **Tags:** deployment, infra, hosting, secrets, rate-limiting, v1.6

## Context

V1.6 pre-work is code-complete on localhost. The wedge runs end-to-end against real Clerk + real OSF + a Neon dev branch, but the app has **never been deployed**. Every release so far has been a localhost story. Per the 2026-06-03 V1.6 audit log we have three carry-forwards before V1.6 can ship publicly: the real-Clerk axe DevTools pass, the production deploy itself, and the hosted rate-limiter scoped to `/take/*` (item #9 in [`participant-runtime-security-review.md`](../../06_qa/audit-logs/2026-06-03-participant-runtime-security-review.md)).

ADR-0007 already settled the path question — Path A with adapter discipline; vendors are Vercel + Clerk + Liveblocks + Inngest, each behind a typed adapter. ADR-0007 also locked the cost ceilings ($200/mo plan, $500/mo execute per single managed service) and the lock-in inventory. What ADR-0007 did **not** decide: the per-vendor production setup checklist, the rate-limiter store, the domain strategy, the secrets-management path, the CI/CD shape, and the `TOKEN_ENCRYPTION_KEY` rotation policy. Each of these has to be locked before a production deploy is a click-through rather than a planning sprint.

Per project owner direction 2026-06-03: production deploy is **deferred** (focus shifts to V1.7 — the ADR-0015 anchor scope). This ADR locks the architecture now anyway, because (a) the deploy-day puzzles compound when stacked with multi-release feature work, (b) the V1.6 audit's accepted risk is bounded by "deploy is planned, not improvised," and (c) some decisions (rate-limiter store, secrets) influence code Code tab writes before the actual deploy. ADR-0016 is accepted; execution is the open follow-up.

## Options considered

The decisions split across six axes. Each was evaluated independently.

### 1. Hosting

#### Option A — Vercel

- The choice ADR-0007 already locked. Next.js's first-party host; first-class edge / serverless function support; preview deployments per branch; first-class Clerk + Neon + Upstash + Inngest integrations.
- **Pros:** zero friction with the stack we already built; preview environment per PR is the default (turns the "real-Clerk axe DevTools" carry-forward from "set up staging" into "open the PR preview URL"); free hobby tier covers V1.6.0; cost-ceiling friendly until we cross the Pro/Team threshold.
- **Cons:** vendor concentration risk per the lock-in inventory; egress + function-execution costs at scale; the Pro plan jump is real ($20/seat/mo, not free). All known + accepted in ADR-0007.

#### Option B — Self-host on Fly.io / Railway / a VPS

- Run the Next.js app + a managed Postgres + a Redis ourselves.
- **Pros:** lower lock-in; cheaper at scale; single bill.
- **Cons:** rebuilds everything ADR-0007 already settled; we lose preview deployments + Vercel's first-party Clerk/Neon integrations; on a solo team this trades dev time for cost ceiling that's not under pressure.

**Decision:** stay with Vercel per ADR-0007. Not relitigated.

### 2. Rate-limiter store (for `/take/*` per security review #9)

#### Option A — Upstash Redis via `@upstash/ratelimit`

- Serverless-friendly Redis (REST + HTTP); the canonical hosted limiter for Vercel-deployed Next.js. Generous free tier (10k commands/day, then $0.20/100k). Fixed-window or sliding-window primitives built in.
- **Pros:** zero infra to manage; sub-50ms latency from Vercel functions (Upstash is Vercel's official Redis partner); the `@upstash/ratelimit` library encodes the keying patterns we need (sliding window keyed by `recruitment_session_id` + a coarse IP bucket); cost ceiling friendly.
- **Cons:** another vendor (Upstash) added to the lock-in inventory; per-region latency outside US-East is non-trivial. Acceptable: rate-limit hot path is millisecond-tolerant.

#### Option B — Vercel KV

- Vercel's branded KV store. Under the hood: Upstash Redis. Same primitives via Vercel's wrapper.
- **Pros:** one fewer dashboard; billing consolidates on Vercel.
- **Cons:** functionally identical to Upstash but slightly more lock-in (Vercel-branded namespace); historical concern: Vercel has reshuffled storage offerings (KV, Postgres → Neon, Blob); using Upstash directly insulates us from those reshuffles.

#### Option C — Per-instance in-memory + Postgres ledger

- Hold counts in-process; periodically sync to a `rate_limit_event` Postgres table.
- **Pros:** no new vendor.
- **Cons:** ineffective on serverless (per-instance counts are useless across cold starts + horizontal scaling); the Postgres-ledger approach is high-latency for the hot path. Wrong shape for the problem.

**Decision:** **Upstash Redis directly** (Option A), wrapped behind a `RateLimitAdapter` interface in `05_app/server/adapters/ratelimit.upstash.ts` per the ADR-0007 adapter discipline. The adapter exposes `check(key, window): Promise<{allowed, remaining, resetMs}>`; the migration target (if cost ceiling hits) is plain Redis on a managed host (Railway / a Fly.io Redis cluster).

### 3. Domain strategy

#### Option A — Subdomain on an owner-controlled root domain (e.g. `app.<root>` + `<root>` marketing)

- Vercel handles the SSL via Let's Encrypt automatically; DNS is a single `CNAME` to the Vercel target.
- **Pros:** simple; cheap; standard pattern; preview deploys get `<branch>-<project>.vercel.app` URLs that don't need extra DNS.
- **Cons:** a marketing site at the root is a separate concern (V1.7+).

#### Option B — Bare apex on a dedicated domain

- The app lives at the apex of a domain bought for the product.
- **Pros:** clean URL.
- **Cons:** the apex `A`/`ALIAS` setup is fussier; requires either pointing `MX` records away or accepting that the apex can't run a marketing site at the same level.

**Decision:** **subdomain on an owner-controlled root domain (Option A).** The exact domain is owner-chosen at deploy time. Until then, `<project>.vercel.app` is sufficient for preview environments. Marketing site is a V1.7+ concern.

### 4. Secrets management

#### Option A — Vercel Project Environment Variables

- Vercel's built-in env var management; per-environment (Production / Preview / Development); encrypted at rest; never exposed to the client unless prefixed with `NEXT_PUBLIC_`.
- **Pros:** zero additional infra; works with preview deployments; team members see secrets via Vercel's UI (audit trail).
- **Cons:** rotating a secret means a redeploy (Vercel rebuilds when env vars change); no SSO-gated CLI access pattern.

#### Option B — 1Password CLI / Doppler / Infisical

- External secrets store; Vercel pulls from it at build time via a sync.
- **Pros:** one source of truth across local + Vercel + (eventually) CI; nice CLI ergonomics.
- **Cons:** another vendor; the rotate-and-redeploy cycle is the same; overkill for solo + Claude.

**Decision:** **Vercel Project Environment Variables (Option A).** Per-environment scoping is sufficient; rotate-and-redeploy is the explicit pattern. The one constraint: **`TOKEN_ENCRYPTION_KEY` must NEVER be rotated** without a token-migration plan (rotation invalidates every stored OSF token, which means every researcher reconnects OSF; see section 6). Other secrets (`CLERK_SECRET_KEY`, `OSF_CLIENT_SECRET`, `DATABASE_URL`, `UPSTASH_REDIS_*`) are rotatable freely.

### 5. CI/CD shape

#### Option A — Vercel git integration auto-deploy on `main` + preview per PR

- Vercel watches GitHub; any push to `main` deploys to Production; any PR opens a Preview deploy at a unique URL.
- **Pros:** zero CI config; Preview URLs are the staging environment (no separate staging deploy to maintain); rollback is one click in Vercel.
- **Cons:** no test gate before deploy — a broken `main` deploys broken; mitigated by a GitHub Action that runs `npm run typecheck && npm run test && npm run build` on PR.

#### Option B — Manual deploy on git tag

- Only tagged releases deploy.
- **Pros:** explicit deploy step; "production looks like the tag" semantically.
- **Cons:** the friction discourages frequent deploys; preview env still needs auto-deploy to be useful.

**Decision:** **Vercel git integration auto-deploy on `main` + preview per PR (Option A).** Add a GitHub Action `ci.yml` that runs `npm run typecheck && npm run test && npm run build && npx playwright test --project=chromium` on every PR; Vercel's "Ignored Build Step" feature can be wired to refuse a build if the CI run failed, blocking a bad `main` push from auto-deploying. This is a "trust the gate" model; if it proves too risky we can swap to Option B.

### 6. `TOKEN_ENCRYPTION_KEY` rotation policy

#### Option A — Never rotate; treat as a permanent ledger key

- Generated once with `openssl rand -hex 32`; stored in Vercel Production env vars; never changed.
- **Pros:** zero migration risk; no plan needed.
- **Cons:** if the key is ever compromised, every stored OSF token is at risk; we have no rotation muscle.

#### Option B — Rotate via dual-key envelope encryption

- Add a `key_version` column to `registry_connection.access_token_ciphertext`; the encryption layer accepts a list of keys and decrypts with the matching version; new writes use the current version; an offline job re-encrypts old rows under the new key, then the old key is retired.
- **Pros:** rotatable without invalidating tokens.
- **Cons:** ADR-0005 didn't budget for this; substantial code change; not warranted at V1 scale.

**Decision:** **Option A for V1 (never rotate).** If a compromise event ever occurs, the response is: revoke every `registry_connection` row + force every researcher to reconnect OSF (acceptable forensics + recovery story for a small user base; would not be acceptable at scale). Revisit if user count > 100 active researchers or if a regulatory regime requires rotatable storage.

## Decision

**We will deploy Massive Research Tool to production via Vercel (per ADR-0007), with Upstash Redis as the hosted rate-limiter behind a `RateLimitAdapter`, a subdomain on an owner-controlled root domain, secrets managed in Vercel Project Environment Variables (per-environment), CI/CD via Vercel git integration auto-deploy on `main` plus per-PR preview deployments gated by a GitHub Actions test run, and `TOKEN_ENCRYPTION_KEY` treated as a permanent ledger key never to be rotated under the V1 envelope.**

In plain language: every architectural deploy question for V1 is locked. Execution is the owner's coordinated step — log in to each vendor, paste values into Vercel env vars per the checklist below, point DNS, click deploy.

### Per-vendor production setup checklist

When the owner is ready to execute the deploy, the work is mechanical clicks plus one short PR:

**1. Vercel account + project**
- Create a Vercel Hobby account (free; can be upgraded to Pro if cost ceilings change).
- Connect the GitHub repo; create a project from `05_app/`.
- Set the production branch to `main`; preview branches default to every other branch.

**2. Clerk production application**
- In Clerk dashboard, create a **new Application** (Production), distinct from the dev application currently in `.env.local`. Production keys (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) are different from dev keys.
- Configure: Email magic-link + Google OAuth; production redirect URLs (`https://<production-domain>/sso-callback`, `https://<production-domain>/signup/verify`).
- Add the production keys to Vercel **Production** env vars only (not Preview/Development).

**3. OSF production application**
- At `osf.io/settings/applications`, register a new Developer App with the production callback (`https://<production-domain>/api/connections/osf/callback`). Production `OSF_OAUTH_CLIENT_ID` + `OSF_OAUTH_CLIENT_SECRET`.
- Owner generates a production PAT for owner-side test runs (optional; researchers will use OAuth).

**4. Neon production branch**
- In Neon, create a **production branch** distinct from the current dev branch (Neon branches are full Postgres branches; share the project but isolate data).
- Production `DATABASE_URL` to Vercel Production env vars.
- Run `npm run db:migrate` against production once before first deploy (or wire it into the Vercel build command: `npm run db:migrate && npm run build`).

**5. Inngest Cloud**
- Sign up for Inngest Cloud (free tier covers V1.6/V1.7 throughput).
- Connect the Inngest app to the Vercel project; Inngest auto-discovers the `/api/inngest` route handler.
- `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` to Vercel Production env vars.

**6. Upstash Redis (new)**
- Sign up for Upstash; create a Redis database (Global if multi-region desired; otherwise single-region close to Vercel's primary region).
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` to Vercel Production env vars.
- Install `@upstash/redis` + `@upstash/ratelimit` in `05_app/` (single short PR; wired through `RateLimitAdapter`).

**7. Custom domain**
- Owner buys + points DNS at Vercel per the Vercel domain wizard (one `CNAME` record).
- Add the domain to the Vercel project; Vercel provisions SSL automatically via Let's Encrypt.

**8. `TOKEN_ENCRYPTION_KEY`**
- Generate **once**: `openssl rand -hex 32`. Add to Vercel Production env vars. **Treat as permanent — do not rotate under V1** (see decision section 6).

**9. CI gate**
- Add `.github/workflows/ci.yml` running `npm run typecheck && npm run test && npm run build && npx playwright test --project=chromium`.
- In Vercel project settings → Git → Ignored Build Step, wire it to skip a build if the CI status check failed.

**10. Smoke test**
- After first deploy: hit the production URL, sign up as a fresh user, build a study, preregister against real OSF, take it as a participant in an incognito tab, verify Results — exactly the V1.5 owner walkthrough but on production.
- Log results in a new `06_qa/audit-logs/YYYY-MM-DD-v160-production-deploy.md` mirroring this audit's pattern.

## Consequences

- **What becomes easier.** Deploy day is mechanical clicks against a known checklist; no fresh planning. The rate-limiter migration target is pre-decided. Preview deployments per PR turn the carry-forward real-Clerk axe pass from "set up staging" into "open the PR URL." Future ADR amendments to the deploy architecture have a clear baseline to amend.
- **What becomes harder.** We've locked in Upstash as a new vendor (now tracked in [`lock-in-inventory.md`](../lock-in-inventory.md)) — Code tab needs to add it. Vercel auto-deploy on `main` puts a real "trust the CI gate" responsibility on the team; a flaky gate means a flaky `main`.
- **What we are now committed to.** Vercel + Upstash for V1; `TOKEN_ENCRYPTION_KEY` as a permanent ledger key (rotation is a future migration ADR if it ever happens); Vercel Project env vars as the secrets store; auto-deploy on `main`.
- **What we are now precluded from.** Bare-metal self-host without re-deciding ADR-0007 + this ADR; a rotatable token encryption envelope under V1 (defer to ADR amendment + a token re-encryption migration); a separate staging environment beyond Vercel preview deploys.

**Execution status:** ADR is **accepted**; the deploy itself is **deferred** per owner direction 2026-06-03. The deploy will execute at a project-owner-chosen time, almost certainly **before V1.7 ships publicly** (the V1.7 anchor scope = ADR-0015 = comments + notifications + activity, which is meaningful only in a deployed multi-user environment; localhost demos work but the network effect needs real users). The expected ordering becomes: V1.7 build → production deploy as V1.6.0 → V1.7 closeout audit → V1.7 publicly visible.

## Revisit triggers

- **Monthly Vercel + Upstash + Inngest cost exceeds $200 combined plan** (per ADR-0007 cost ceiling) — re-evaluate hosting + rate-limiter together.
- **Execute trigger fires:** combined cost exceeds $500/mo per single managed service per ADR-0007 — migrate per the ADR-0007 migration order (Clerk first, then Liveblocks, then Inngest, hosting last).
- **A `TOKEN_ENCRYPTION_KEY` compromise event** — emergency ADR amendment + bulk re-encryption migration; meanwhile force every `registry_connection` row to be re-authenticated.
- **A non-web client is added** (mobile app, CLI tool) — re-evaluate the Vercel-as-hosting decision against a backend-first split.
- **Active researcher count > 100** — revisit the never-rotate `TOKEN_ENCRYPTION_KEY` policy (the recovery story scales badly past that point).
- **A separate staging environment is needed** (e.g., a long-running pilot study against an environment that lags `main`) — Vercel preview-per-PR may not be sufficient; consider a dedicated `staging` branch with its own production-like deploy.
- **Drizzle / Neon / Clerk drops a feature we depend on** — ADR-0007 + this ADR get a joint amendment.

## References

- [ADR-0007 — Path A vs B](./0007-path-a-vs-b.md) + 2026-05-29 amendment (Better Auth migration target; cost ceilings; adapter discipline).
- [ADR-0005 — OSF integration](./0005-osf-integration.md) (the `TOKEN_ENCRYPTION_KEY` consumer; rotation invalidates stored OSF tokens).
- [ADR-0013 — Participant runtime + 3rd-party analytics](./0013-participant-runtime-and-analytics.md) + 2026-06-03 amendment (the `/take/*` surfaces that need rate-limiting).
- [ADR-0014 — Response data model + minimum viable conditioning](./0014-response-data-model-and-conditioning.md) (the anonymous-participant identifier model; informs what we rate-limit on).
- [Lock-in inventory](../lock-in-inventory.md) (will be amended to add Upstash on the Code tab side; the deploy executes this).
- [Participant-runtime security review](../../06_qa/audit-logs/2026-06-03-participant-runtime-security-review.md) (rate-limit deferral #9 is the load-bearing input to this ADR).
- [V1.6 audit log](../../06_qa/audit-logs/2026-06-03-v16-prework-publish-and-run.md) (names this ADR as the carry-forward).
- Vercel docs — [Environment Variables](https://vercel.com/docs/projects/environment-variables), [Custom Domains](https://vercel.com/docs/projects/domains), [Ignored Build Step](https://vercel.com/docs/projects/overview#ignored-build-step).
- Upstash docs — [@upstash/ratelimit](https://github.com/upstash/ratelimit), [Vercel integration](https://vercel.com/integrations/upstash).
