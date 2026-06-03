# Deploy runbook — V1.7.0 production ship (max-automation edition)

Concrete, ordered checklist for executing the production deploy locked in [ADR-0016](./adrs/0016-production-deployment-architecture.md) per the **2026-06-03 amendment** (API-driven bootstrap script — most steps automated via Code tab; owner engagement reduced from ~3-4h to **~30-40 min total**).

**Read this once start to finish before doing anything.** Then work top to bottom. Phases marked "Code tab" are not your work; they happen autonomously.

---

## Phase 0 — Code tab pre-deploy code (~1.5 days; **Code tab**, you wait)

Code tab is building: Upstash rate-limiter + `/take/*` rate-limit calls + GitHub Actions CI + `.env.example` updates + `scripts/deploy-bootstrap.ts` (the API-driven setup) + `scripts/deploy-verify.ts` (the automated quality gate) + `e2e/a11y-researcher-surfaces.spec.ts` (replaces your axe DevTools click-through). Spec: [`handoffs/code-tab-pre-deploy-v170.md`](./handoffs/code-tab-pre-deploy-v170.md).

**Wait** for Code tab's "Phase 0 merged" ping. Don't start Phase 1 until then.

---

## Phase 1 — Accounts + API keys (~15 min you, one sitting)

Do these in any order. Goal: end this phase with every key needed for Phase 2 pasted into a local file.

- [ ] **Vercel** — sign up at [vercel.com](https://vercel.com) (Hobby tier, free). Then generate a Personal Access Token at [vercel.com/account/tokens](https://vercel.com/account/tokens) (full scope, or team-scoped if you're using a team).
- [ ] **Upstash** — sign up at [upstash.com](https://upstash.com) (free tier covers V1.7.0). Then generate a Management API key at [upstash.com/account/management-api](https://console.upstash.com/account/api).
- [ ] **Neon** — already have an account (you have the dev branch). Generate an API key at [console.neon.tech/app/settings/api-keys](https://console.neon.tech/app/settings/api-keys). Also grab your Neon `PROJECT_ID` (visible in any branch's connection URL).
- [ ] **Clerk** — open [dashboard.clerk.com](https://dashboard.clerk.com); **Create application** named "Massive Research Tool — Production". Don't configure anything inside it yet — the bootstrap script does that. Just grab: Publishable Key, Secret Key, and the Application ID (in the dashboard URL: `dashboard.clerk.com/apps/{APPLICATION_ID}/...`).
- [ ] **OSF** — open [osf.io/settings/applications](https://osf.io/settings/applications); **Create new application**: name "MRT Production", redirect URI `https://<your-domain>/api/auth/osf/callback` (you'll know `<your-domain>` from the next step; come back here after if needed), scope `osf.full_write`. Grab Client ID + Client Secret.
- [ ] **Domain** — buy if you don't have one. If your DNS provider is Cloudflare / Route53 / Namecheap (any provider with a REST API), also generate a scoped DNS API token. Otherwise you'll add one DNS record manually in Phase 3 (~2 min).
- [ ] **TOKEN_ENCRYPTION_KEY** — open a terminal locally:
  ```sh
  openssl rand -hex 32
  ```
  Copy the 64-char hex string. **Back it up in your password manager immediately.** If you lose this, every researcher has to reconnect OSF. **Do NOT paste it into the `.env.production` file from Phase 2** — it goes directly into Vercel via `vercel env add` in Phase 3.

---

## Phase 2 — Paste keys into `.env.production` (~2 min you)

```sh
cd 05_app
cp .env.production.example .env.production
```

Open `05_app/.env.production` and fill in every value from Phase 1. Save. **This file is gitignored** (the `.env*` rule in `.gitignore` covers it); verify it doesn't show in `git status`.

**Do NOT add `TOKEN_ENCRYPTION_KEY` here.** That goes through `vercel env add` in Phase 3.

---

## Phase 3 — Run the bootstrap (~5 min you watching it work + ~5 min DNS wait)

```sh
cd 05_app
npm run deploy:bootstrap
```

This drives every vendor API for you. Across ~3-5 minutes you'll see:

1. Validating `.env.production`...
2. Neon: creating `production` branch, running migrations, seeding modules...
3. Upstash: creating Redis database `mrt-production`...
4. Vercel: creating project, pushing 15 environment variables to Production scope...
5. Clerk Production: configuring redirect URLs, OAuth providers, sign-in/sign-up paths...
6. Clerk Production: creating 3 `+clerk_test` users for the multi-workspace e2e...
7. DNS (if your provider has API): adding the `CNAME` record...
8. Vercel: registering the custom domain (SSL provisions automatically)...

When it's done, paste your `TOKEN_ENCRYPTION_KEY` into Vercel:

```sh
vercel env add TOKEN_ENCRYPTION_KEY production
# CLI prompts for value; paste the 64-char hex string from Phase 1.
# (Do NOT echo it into the terminal via cat / heredoc — type or paste at the prompt.)
```

The bootstrap script's final summary will tell you:
- Anything that couldn't be automated (rare: maybe an OSF reminder if your domain wasn't set at the time you created the OSF app).
- Your `https://<your-domain>` URL.
- The next command: `npm run deploy:verify`.

**Wait for DNS to resolve.** Usually 2-15 min. You'll know when `https://<your-domain>/` loads instead of erroring. Once it does, the deploy is live — Vercel auto-deployed when the project was created (the GitHub `main` branch is the production source).

---

## Phase 4 — Smoke test (~5-10 min you, irreducible)

This is the one part that can't be meaningfully automated — a first production deploy deserves a human walking through "do I see what I expect."

Mirror the V1.5 + V1.6 owner walkthroughs but on production:

- [ ] Open `https://<your-domain>/` — should land on the marketing/welcome surface.
- [ ] Sign up as a fresh user with a real email (use a throwaway if you prefer).
- [ ] Build a study (any framework or blank; the seeded catalogue should show 8 modules / 9 versions).
- [ ] **Preregister** against real OSF (it'll create a real registration; OSF holds it pending your approval per `require_approval()` — feel free to use a throwaway registration since this is verification, not real research).
- [ ] Open recruitment.
- [ ] In an incognito tab: take the study as a participant; complete all questions.
- [ ] Verify Results updates.

If anything errors: check Vercel **Logs** + Inngest **Runs** + Upstash **Data Browser**. Common first-deploy issues:
- A misnamed env var → fix in Vercel dashboard, redeploy via `vercel --prod`.
- OSF redirect URI mismatch → update in OSF Dashboard to the real production URL.
- Clerk redirect URI mismatch → update in Clerk Dashboard (the bootstrap should have done this, but Clerk sometimes needs a manual save).

---

## Phase 5 — Automated quality gates (~2 min you reading the report)

```sh
cd 05_app
npm run deploy:verify
```

This runs (across ~3-5 min):
1. HTTP smoke probe (`/`, `/signin`, `/api/health` — verifies the deploy is live + serving the expected commit SHA).
2. `playwright test --project=auth e2e/a11y-researcher-surfaces.spec.ts` (axe-core across 9 researcher surfaces using the 3 `+clerk_test` users the bootstrap created — **this replaces the axe DevTools click-through** per ADR-0016 amendment §"Quality gates also automated").
3. `playwright test --project=auth e2e/hanna-network.spec.ts e2e/hanna-publish-and-run.spec.ts` (the multi-workspace e2e + the V1.6 carry-forward).
4. Writes a draft `06_qa/audit-logs/{date}-v170-production-deploy.md`.

Read the summary. If anything's red, Code tab fixes it (paste the failing output to Code tab; iterate; re-run `deploy:verify`).

---

## Phase 6 — Sign off + tag (~5 min you + Code tab)

- [ ] Open the draft `06_qa/audit-logs/{date}-v170-production-deploy.md` Code tab wrote in Phase 5; verify it reflects reality.
- [ ] Add your sign-off line at the bottom (mirrors the V1.5/V1.6 audits): "Signed: Paweł Rosner — {date}."
- [ ] Tell Code tab: "Tag v1.7.0 and write release notes." Code tab runs `git tag v1.7.0 && git push origin v1.7.0` (with your standing rule, asks confirmation; you confirm) and writes `release-notes/v1.7.0.md` summarizing the review network for posterity.

**V1.7.0 is shipped publicly.** First time the network features are actually meaningful (Maya can review a study Hanna shared; Sofia can fork a real published study; the activity feed shows real activity).

---

## Rollback (if something breaks)

Vercel keeps every prior deploy. **Settings** → **Deployments** → pick the last-good deployment → **Promote to Production**. One click; no data loss; rate-limit state persists in Upstash.

If a migration is the problem: Neon supports branch-level point-in-time restore. Restore the `production` branch to before the deploy + redeploy the prior code.

If `TOKEN_ENCRYPTION_KEY` is somehow lost or compromised: the recovery story is in [ADR-0016](./adrs/0016-production-deployment-architecture.md) §6 — revoke all `registry_connection` rows + force every researcher to reconnect OSF. This is a real outage; don't lose the key.

---

## Security discipline this runbook depends on (per ADR-0016 amendment "Tradeoff")

- `05_app/.env.production` MUST stay gitignored. Verify with `git status` after Phase 2.
- The five production-scoped API keys (Vercel, Neon, Upstash, Clerk Production Secret, optional DNS) live in `.env.production` on your machine. If your machine is ever compromised, revoke them immediately at each vendor's dashboard.
- Rotate them quarterly. These are rotatable — unlike `TOKEN_ENCRYPTION_KEY`.
- `TOKEN_ENCRYPTION_KEY` is never in `.env.production` and never enters Code tab's process. It lives in your password manager + Vercel's env var store. That's it.

---

## What "owner engagement" actually is

| Phase | You doing | ~Time |
|---|---|---|
| 0 | Waiting on Code tab | 0 (you can do other things) |
| 1 | Vendor signups + API key generation + `openssl rand -hex 32` | ~15 min |
| 2 | Paste keys into `.env.production` | ~2 min |
| 3 | Watch `npm run deploy:bootstrap` work + paste `TOKEN_ENCRYPTION_KEY` via `vercel env add` + DNS wait | ~5 min active + ~5-15 min DNS |
| 4 | Smoke-click through the app | ~5-10 min |
| 5 | Read `npm run deploy:verify` report | ~2 min |
| 6 | Sign audit + tell Code tab to tag | ~5 min |
| **Total active engagement** | | **~30-40 min** |

If something errors mid-run, that's extra (rare; bootstrap is idempotent — just re-run after fixing). DNS propagation is wall-clock wait, not engagement.

---

## References

- [ADR-0016 — Production deployment architecture](./adrs/0016-production-deployment-architecture.md) + 2026-06-03 amendment (API-driven bootstrap)
- [Code tab pre-deploy handoff](./handoffs/code-tab-pre-deploy-v170.md) (Phase 0 spec)
- [Lock-in inventory](./lock-in-inventory.md)
- [V1.7 closeout audit](../06_qa/audit-logs/2026-06-03-v17-review-network.md)
- [Participant-runtime security review](../06_qa/audit-logs/2026-06-03-participant-runtime-security-review.md)
