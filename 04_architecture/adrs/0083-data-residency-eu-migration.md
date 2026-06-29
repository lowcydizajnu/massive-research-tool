# ADR-0083 — Data residency: migrate production to EU

- **Status:** accepted
- **Date:** 2026-06-29
- **Deciders:** Paweł (project owner), Claude
- **Tags:** infra, data-model, privacy, compliance

> **Outcome (2026-06-29):** Owner confirmed Vercel `DATABASE_URL` was the US project (`...us-east-2...`). Migrated live data US → empty EU `MRT Production` (`aws-eu-central-1`) via `pg_dump`/`pg_restore` with **exact row-count parity across all 51 public tables** + the `drizzle` migrations schema. Owner repointed Vercel `DATABASE_URL` to the EU pooled string and rebuilt HEAD (`460d21e`, live). Trust tables corrected to EU. **Follow-ups:** owner to rename Neon projects so `mrt-production` = the EU project (then all `*-prod.ts` tooling targets EU automatically) + update local `.env.production` `DATABASE_URL`/`UPSTASH_REGION`; decommission the US project + the stale `myresearchtool` EU project after a backup window; Upstash still us-east-1 (hashed buckets only) — move later if desired.

## Context

The public "Security & data" page (ADR-0082) and the dashboard sub-processor table list Neon's location as **"EU/USA"**. A check against the actual Neon account on 2026-06-29 found this is wrong in a way that matters:

- The Neon project that **every deploy script + the health check + this session's prod reads/writes target** is named **`mrt-production`** and lives in **`aws-us-east-2` (US)**.
- Two **EU** projects exist — `MRT Production` and `myresearchtool`, both `aws-eu-central-1` — but the running app's tooling does not use them.
- `UPSTASH_REGION` in `.env.production` is `us-east-1`.

The project owner has consistently chosen EU regions where offered, so the live placement contradicts that intent. Participant data is PII-minimized (ADR-0014: hashed UA, coarse country, no raw IP) but is still **personal data** under GDPR, and "where does my data live" is one of the six trust questions ADR-0082 commits to answering **truthfully**. So the trust page currently over-claims EU, and the material reality (DB at rest) is US.

This ADR settles where production data lives and how we get there. It does **not** change the PII model or the operator-access model (ADR-0082) — only physical residency of the data store.

> Open confirmation before execution: the authoritative wiring is Vercel's `DATABASE_URL` env, which can only be read in the Vercel dashboard. The evidence (all repo tooling targets `mrt-production`; this session's feedback reads/writes + demo-delete against it matched live data) strongly indicates the live DB **is** the US project — but execution is gated on the owner confirming the `DATABASE_URL` host region.

## Options considered

### Option A — Stay in the US; correct the trust page to say "USA"

- Leave infra as-is; fix `subprocessors.ts` so Neon reads **USA** (the truth) and stop claiming EU anywhere.
- **Pros:** zero operational risk; the trust page becomes accurate immediately.
- **Cons:** contradicts the owner's EU intent; weaker GDPR/EU story for EU-based researchers and participants; leaves two EU projects as confusing dead weight.

### Option B — Migrate the database (and Upstash) to EU (chosen)

- Move the production DB to `aws-eu-central-1`, repoint `DATABASE_URL`, retarget repo tooling to the EU project, move Upstash to an EU region, and correct the trust table. Compute (Vercel) and identity (Clerk) stay US and are disclosed honestly.
- **Pros:** matches owner intent; participant + researcher **data at rest in the EU**; honest, stronger GDPR posture; consolidates the confusing 3-project sprawl to one canonical EU project.
- **Cons:** a careful cross-region data migration with a maintenance window; cutover risk (writes during the window); env is baked at Vercel build time so a rebuild is required; **partial** residency only — Vercel/Clerk/Inngest/Anthropic/Hume remain non-EU.

### Option C — Full-stack EU (DB + Vercel functions + Upstash + auth)

- Move everything region-selectable to EU.
- **Pros:** the fullest residency story.
- **Cons:** much larger; Clerk/Anthropic/Hume/Prolific are inherently non-EU companies regardless of region selection, so "full EU" is unreachable anyway; disproportionate to current scale.

## Decision

**We will migrate the production database to `aws-eu-central-1` (Option B):** make one EU Neon project canonical, copy all data US→EU with verified row-count parity, repoint Vercel's `DATABASE_URL`, retarget the repo's prod tooling and `.env.production` (DB + `UPSTASH_REGION`) to EU, then correct the sub-processor disclosure. Vercel/Clerk and the BYO-key AI/recruitment vendors stay in their home regions and are disclosed as such — the material guarantee we make is **data at rest in the EU**, not full-stack EU.

Reasoning: the store of personal data is the part that matters most for residency and for the owner's intent; moving it is achievable with bounded risk, and it lets the trust page tell the truth (EU data-at-rest) instead of either over-claiming or settling for US.

## Runbook (execute only after owner confirms Vercel `DATABASE_URL` + gives go; treat as a maintenance window)

1. **Confirm live wiring** — owner reads Vercel → Project → Settings → Environment Variables → `DATABASE_URL` host (region is in the host, e.g. `...us-east-2...` vs `...eu-central-1...`). If it is already EU, this ADR collapses to "retarget the repo tooling + fix the table" (no data move) — and it means this session's prod scripts hit a non-live US project, which must be reconciled.
2. **Pick the canonical EU project** — choose one of `MRT Production` / `myresearchtool`; plan to delete the other to end the 3-project confusion. Record the chosen project id.
3. **Freeze writes** — pause open recruitment / put the app in a brief maintenance posture so no writes land mid-cutover.
4. **Copy data** — `pg_dump` from `mrt-production` (us-east-2) → restore into the EU project, OR Neon branch/copy if cross-region supported. Include the Drizzle `__drizzle_migrations` table so migration state matches.
5. **Verify parity** — compare row counts for `user`, `workspace`, `member`, `experiment`, `experiment_version`, `condition`, `recruitment_session`, `response`, `response_item`, `quality_flag`, `feedback`, registry/OSF tables. Must match exactly.
6. **Repoint env (baked at build!)** — set Vercel `DATABASE_URL` (+ any direct URL) to the EU project, then **rebuild HEAD** — never "Redeploy" an old build (env is baked at build time; see memory `vercel-env-needs-fresh-head-build`).
7. **Retarget tooling** — update repo scripts that resolve the project by name (`mrt-production`) to the EU project; update `.env.production` `DATABASE_URL` + `UPSTASH_REGION` → EU; move the Upstash database to an EU region.
8. **Verify** — `myresearchlab.app/api/health` returns the new SHA; spot-check data parity + one write; confirm recruitment/take still works.
9. **Correct the disclosure** — `lib/legal/subprocessors.ts`: Neon → `EU (aws-eu-central-1)`, Upstash → EU; update `docs/trust/data-and-security.mdx` + the dashboard table; reference this ADR from ADR-0082.
10. **Decommission** — after a backup/retention window, delete the US `mrt-production` project and the duplicate EU project.

Migration carries schema/data → run `db:migrate:prod` semantics as needed and **migrate before any push** (memory `migrate-prod-before-push`).

## Consequences

- **Easier:** the trust page can state EU data-at-rest truthfully; one canonical DB project instead of three; aligns with owner intent + EU researcher expectations.
- **Harder:** a one-time careful cross-region migration with a maintenance window; ongoing awareness that compute/auth are still US (must keep the disclosure honest about the split).
- **Committed to:** participant + researcher **data at rest in the EU**; keeping `subprocessors.ts` accurate to the real regions; not silently claiming residency we don't have.
- **Precluded from:** advertising "full EU" residency (Vercel/Clerk/Anthropic/Hume/Prolific remain non-EU); leaving the US project as a live write target once cutover completes.

## Revisit triggers

- An EU institution / DPA requires full-stack EU compute → reopen for Option C (Vercel EU functions, EU auth).
- Neon adds in-place region change (would simplify step 4).
- We add data-residency tiers per workspace (some studies must stay in a specific region).

## References

- ADR-0082 (privacy & operator-access; the trust-page accuracy commitment this enforces), ADR-0014 (PII-minimization), ADR-0007 (adapter/lock-in boundary).
- Code: `lib/legal/subprocessors.ts` (the hardcoded Location list being corrected), `docs/trust/data-and-security.mdx`, `.env.production(.example)` (`DATABASE_URL`, `UPSTASH_REGION`), the `*-prod.ts` scripts that resolve the Neon project by name.
- Memory: `vercel-env-needs-fresh-head-build`, `migrate-prod-before-push`, `prod-health-check-url`.
