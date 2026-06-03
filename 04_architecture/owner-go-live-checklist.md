# Owner go-live checklist — V1.7.0 production deploy

Step-by-step you can keep open in another window. Refines [`deploy-runbook.md`](./deploy-runbook.md) with the four known gotchas from the post-Phase-0 source audit + the iteration mindset.

> **Expect to iterate once.** Code tab built the bootstrap from vendor API docs but didn't dry-run against live Neon/Vercel/Upstash/Clerk. The script is **idempotent** (every step is create-if-absent) so re-running after a fix is safe and resumes where it left off. Plan ~1 hour total including ~15-20 min of iteration if anything goes sideways. Ping me at each failure — I'll diagnose immediately.

---

## Phase 1 — Accounts + API keys (~15 min)

Do these in any order. End this phase with one Phase 2 paste list.

### 1. Vercel
- Sign up at [vercel.com](https://vercel.com) (Hobby tier, free).
- Already done if your existing project connected.
- Generate a Personal Access Token: [vercel.com/account/tokens](https://vercel.com/account/tokens) → full scope is simplest; team-scoped works if you have a team.

### 2. Upstash
- Sign up at [upstash.com](https://upstash.com) (free tier).
- Management API key: [console.upstash.com/account/api](https://console.upstash.com/account/api) → **note both your account email AND the API key** (auth uses basic auth `email:key`).

### 3. Neon
- You already have an account. Generate API key: [console.neon.tech/app/settings/api-keys](https://console.neon.tech/app/settings/api-keys) → scope: read+write projects.
- The bootstrap creates a fresh `mrt-production` project; you don't need to do anything in the Neon UI beforehand. The dev project stays untouched.

### 4. Clerk PRODUCTION application shell (do this in dashboard.clerk.com)
- **Create application** → name "Massive Research Tool — Production".
- For now, leave its settings at defaults. You'll come back and finish configuration in Phase 4 ("Clerk dashboard manual configuration"). The bootstrap only sets `allowed_origins`.
- Grab: **Publishable Key**, **Secret Key**, and **Application ID** (it's in the dashboard URL: `dashboard.clerk.com/apps/{APPLICATION_ID}/...`).

### 5. OSF PRODUCTION Developer App
- [osf.io/settings/applications](https://osf.io/settings/applications) → Create new application.
- Name: "MRT Production".
- **Callback URL**: `https://<your-production-domain>/api/auth/osf/callback` (you'll know your domain by now — `.vercel.app` URL is fine).
- Scope: `osf.full_write`.
- Grab: **Client ID** + **Client Secret**.

### 6. Inngest Cloud
- [inngest.com](https://inngest.com) → Sign up (free; Google sign-in fastest).
- Create app → choose TypeScript.
- Dashboard → **Manage** → **Event keys** → copy the **Event Key**.
- Dashboard → **Manage** → **Signing key** → copy the **Signing Key**.

### 7. Domain (optional but recommended)
- If you have a domain ready, use it. If not, just use the Vercel-assigned `<project>.vercel.app` URL — bootstrap accepts it.
- If your DNS is Cloudflare/Route53/Namecheap: generate a scoped DNS API token now (DNS:Edit on the zone). Bootstrap will add the CNAME automatically.

### 8. TOKEN_ENCRYPTION_KEY (LOCAL ONLY — never paste into the .env.production file)
- Open a terminal:
  ```sh
  openssl rand -hex 32
  ```
- Copy the 64-char hex string.
- **Back it up in your password manager IMMEDIATELY.** Losing this = every researcher reconnects OSF. Unrecoverable.

---

## Phase 2 — Paste keys into `.env.production` (~3 min)

```sh
cd 05_app
cp .env.production.example .env.production
```

Open `05_app/.env.production` and fill in every value from Phase 1.

**Do NOT paste `TOKEN_ENCRYPTION_KEY` into this file.** It only goes into Vercel in Phase 3b.

Verify the file is gitignored:
```sh
git check-ignore .env.production && echo "gitignored ✓"
```
(Should print "gitignored ✓". If it doesn't, **stop** and tell me.)

---

## Phase 3 — Run bootstrap (~5 min watching + ~5-15 min DNS wait)

### 3a. Bootstrap
```sh
cd 05_app
npm run deploy:bootstrap
```

You'll see a step-by-step log:
1. Validating `.env.production` — fails fast if any of the 15 required keys are missing.
2. Neon: creating fresh `mrt-production` project + running `db:migrate` + `db:seed`.
3. Upstash: creating Redis database `mrt-production`.
4. Vercel: creating/detecting project, seeding 12 env vars at Production scope.
5. Clerk Production: setting `allowed_origins` + creating 3 `+clerk_test` users.
6. OSF: prints a reminder to verify your prod app's redirect URI matches.
7. DNS: if Cloudflare configured, adds the CNAME; otherwise prints what record to add manually.
8. Vercel: attaches the domain (SSL provisions async via Let's Encrypt).
9. Vercel: configures the ignored-build-step.
10. Summary printed.

**If anything fails:** copy the error output (it's auto-redacted), paste to me, I diagnose. Re-run after the fix; bootstrap is idempotent.

### 3b. Paste TOKEN_ENCRYPTION_KEY into Vercel

This is the one var the bootstrap intentionally doesn't touch (ADR-0016 §6 — the key must never enter Code tab's process).

Install Vercel CLI if you haven't:
```sh
npm i -g vercel
```

Then:
```sh
cd 05_app
vercel link    # one-time: links this dir to the Vercel project
vercel env add TOKEN_ENCRYPTION_KEY production
```
The CLI prompts for the value. Paste the 64-char hex from Phase 1 step 8. Don't echo it into the terminal via `cat` or heredoc — type or paste at the prompt only.

### 3c. Wait for DNS + SSL (~5-15 min)

If you used a custom domain: wait until `https://<your-domain>/` loads (instead of a DNS error). Vercel auto-provisions Let's Encrypt SSL once DNS resolves. If you used `.vercel.app`: it's instant.

### 3d. Trigger a fresh deploy with the now-complete env

Bootstrap created/configured the project but the LAST build (from the day you connected the repo) failed. With env vars now set, redeploy:

- Vercel dashboard → your project → Deployments → most recent failed deploy → `...` → **Redeploy** → confirm.
- OR push a no-op commit to `main` (Vercel auto-deploys).
- Wait ~2 min for the build to go green.

---

## Phase 4 — Clerk dashboard manual configuration (~10 min) ⚠️ Gotcha #1

**The bootstrap doesn't configure most of Clerk's Production app settings.** It only sets `allowed_origins`. Owner finishes the rest in [dashboard.clerk.com](https://dashboard.clerk.com) → your PROD app:

- [ ] **Paths** → set:
  - Sign-in URL: `/signin`
  - Sign-up URL: `/signup`
  - After sign-in URL: `/studies`
  - After sign-up URL: `/studies`
- [ ] **Email + Password** → enable.
- [ ] **Email Magic-Link** → enable (mirror dev).
- [ ] **Google OAuth** → enable. Clerk will give you a Redirect URI to paste into Google Cloud Console; create a Google OAuth Client over there if you haven't (or reuse your dev one with the new redirect URI added). Paste the Google Client ID + Secret back into Clerk.
- [ ] **Authorized redirect URLs** for SSO:
  - `https://<your-domain>/sso-callback`
  - `https://<your-domain>/signup/sso-callback`
- [ ] **Webhooks** (optional): if you ever wire post-signup hooks, configure here.

### Gotcha #2 — Production Clerk might require email verification for the 3 test users

The bootstrap creates the +clerk_test users via Backend API but doesn't mark their emails verified. Production Clerk typically requires verification, so the 3 users may sign in unsuccessfully (the multi-user e2e in Phase 5 will fail on auth).

**Workaround:** in Clerk dashboard → Users → click each of the 3 test users → Email address → click "verify". Takes 30 seconds × 3.

If you want to skip this manual step, ping me and I'll have Code tab amend `seed-clerk-test-users.ts` to pass `email_addresses: [{email_address, verification: {status: "verified", strategy: "manual"}}]` so they're marked verified at creation. ~5 min Code tab fix.

---

## Phase 5 — Smoke test (~5-10 min, irreducible)

Open `https://<your-domain>/`. Walk through the standard owner flow:

- [ ] Sign up as a fresh user (real email; use `you+prodtest@gmail.com` if you want a throwaway alias).
- [ ] Build a study (Misinformation Research Framework or Blank — the Add-block picker should show all 8 modules / 9 versions).
- [ ] Add 1-2 blocks, configure them.
- [ ] **Save & request review** (tests V1.7 review network end-to-end if you have a second user) OR just **Preregister** or **Publish & run**.
- [ ] Open recruitment, copy the URL, open in incognito, complete the study.
- [ ] Verify Results updates.
- [ ] Connect OSF (Account · Connections) — verify OAuth round-trips to your production `<your-domain>/api/auth/osf/callback`.

Common first-deploy errors:
- `invalid_redirect_uri` from Clerk → recheck the SSO callback URLs in Phase 4.
- `redirect_uri_mismatch` from OSF → recheck your OSF Production app's callback URL.
- `503` from /take/* → Upstash isn't reachable; check `UPSTASH_REDIS_REST_URL` in Vercel env vars.
- `Cannot connect to database` → DATABASE_URL in Vercel is wrong; re-run bootstrap (it'll re-fetch from the Neon project).

Paste any error to me; I diagnose.

---

## Phase 6 — Automated quality gates (~3-5 min)

```sh
cd 05_app
npm run deploy:verify
```

This runs (against your live URL):
1. HTTP smoke probe (`/`, `/signin`, `/api/health`).
2. Axe a11y spec across the 9 researcher surfaces (uses the 3 `+clerk_test` users — needs the Phase 4 email-verified workaround).
3. Multi-workspace network e2e + publish-and-run e2e.
4. Writes a draft `06_qa/audit-logs/<date>-v170-production-deploy.md`.

Read the summary. Each line is ✓ or ✗.

If the e2e fails on auth → Phase 4 Gotcha #2 (the +clerk_test users need email-verified). Fix in Clerk dashboard, re-run.

If axe finds violations → paste me the report path; Code tab fixes the violations as a follow-up PR; you re-run `deploy:verify` after the fix lands.

---

## Phase 7 — Sign + tag (~5 min)

- [ ] Open the draft `06_qa/audit-logs/<date>-v170-production-deploy.md` deploy-verify wrote.
- [ ] Walk through the smoke checklist at the bottom (mostly repeats Phase 5 — confirms what you saw).
- [ ] Add sign-off line: "Signed: Paweł Rosner — <date>."
- [ ] Tell me: "Tag v1.7.0." I'll run `git tag v1.7.0 && git push origin v1.7.0` after you confirm + write `release-notes/v1.7.0.md`.

**V1.7.0 is shipped publicly.** First time the network features are meaningful with real users.

---

## The four known gotchas (TL;DR before you start)

| # | Gotcha | What to do |
|---|---|---|
| 1 | Clerk dashboard manual config beyond `allowed_origins` | Phase 4 above (~10 min). Bootstrap can't do paths / OAuth / SSO callback config via API. |
| 2 | +clerk_test users may not be email-verified in production Clerk | Phase 4 Gotcha #2 (~2 min manual verify in Clerk dashboard) OR ask me for the Code tab amendment (~5 min Code tab fix). |
| 3 | CI gate isn't actually wired (the ignored-build-step gates by branch, not GitHub Actions status) | Cosmetic for V1.7.0 launch (solo dev, low push frequency, you can `npm run typecheck && test && build` locally before pushing main). V1.7.1 follow-up to fix properly. |
| 4 | Preview deploys are disabled (side effect of #3) | Acceptable for solo launch. V1.7.1 fix restores them. |

---

## Rollback (if something is really wrong post-deploy)

Vercel keeps every prior deploy. Settings → Deployments → pick the last-good (or just the failed pre-bootstrap one) → Promote to Production. One click; no data loss; rate-limit state in Upstash persists.

If a Neon migration broke something: Neon supports project-level point-in-time restore.

If `TOKEN_ENCRYPTION_KEY` is somehow lost: revoke all `registry_connection` rows + force every researcher to reconnect OSF. See ADR-0016 §6.

---

## References

- [deploy-runbook.md](./deploy-runbook.md) — the original Phase 0-8 layout (this file is its companion at deploy time)
- [ADR-0016](./adrs/0016-production-deployment-architecture.md) + 2026-06-03 amendment
- [V1.7 closeout audit](../06_qa/audit-logs/2026-06-03-v17-review-network.md)
