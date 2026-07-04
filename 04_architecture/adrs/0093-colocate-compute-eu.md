# ADR 0093 — Colocate Vercel compute in the EU (fra1)

- **Status:** accepted
- **Date:** 2026-07-04
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** infra, performance, privacy, compliance

> Amends [ADR-0083](./0083-data-residency-eu-migration.md), which moved the production DB to EU (Frankfurt) but deliberately **kept Vercel compute in the US** ("Compute (Vercel) and identity (Clerk) stay US"). This ADR moves compute to the EU too, for performance.

## Context

After ADR-0083 (2026-06-29) the production Postgres runs on Neon **EU / aws-eu-central-1 (Frankfurt)**, while Vercel serverless functions still run in **US-East (iad1, the account default — no region was pinned)**. Every DB round-trip therefore crosses the Atlantic (~80–100ms each way).

The runtime does not do one query per request — it does many, sequentially:
- The participant **"Continue"** action does ~8 sequential Postgres round-trips + 2–3 Upstash calls, then a full-page redirect that re-fetches the study snapshot again — ≈1s of pure network latency before any render.
- A **workspace switch** lands on the force-dynamic dashboard, which fires ~11 queries (with redundant identity lookups and two unbounded aggregate scans) across sequential waves — multiple seconds.

The owner reported both as unacceptably slow ("I asked for modular and fast architecture but it is so slow"). Profiling (the runtime-perf diagnosis, 2026-07-04) confirmed the transatlantic RTT × sequential-round-trip fan-out is the dominant cost; the DB client is already a reused pooled singleton, so it is not per-request handshakes.

## Options considered

### Option A — Pin Vercel functions to Frankfurt (`fra1`) via `vercel.json`

- Add `{ "regions": ["fra1"] }` at the Vercel root (`05_app/vercel.json`). fra1 = Frankfurt = same city as the Neon EU DB.
- **Pros:** Config-only, no code change. Cuts each DB round-trip from ~90ms to single-digit ms — a ~10× reduction on the dominant cost, helping *every* request (take, dashboard, builder, exports). Also colocates compute with the data, which is *more* aligned with the EU data-residency intent of ADR-0083, not less. Cold-start handshakes also stop crossing the Atlantic.
- **Cons:** US-based participants/researchers get higher latency to the *compute* layer. In practice DB-bound requests dominate and their data already lives in the EU, so net latency for the typical request improves. Requires a Vercel plan that allows region selection (Pro+; Hobby is iad1-only). Reverses the explicit "compute stays US" line in ADR-0083.

### Option B — Keep compute in the US, only optimize the code

- Cache identity per-request, parallelize queries, cache the snapshot, reduce round-trips.
- **Pros:** No topology/compliance change.
- **Cons:** Leaves ~90ms on every remaining round-trip. Even a perfectly-parallelized request pays one transatlantic RTT; the take flow's inherent sequencing (rate-limit → write → resolve-next) can't be fully flattened. Caps the achievable speedup well below Option A.

### Option C — Move the DB back to the US

- Undo ADR-0083.
- **Cons:** Abandons the EU data-residency posture the owner deliberately chose. Rejected.

## Decision

We will **pin Vercel compute to `fra1` (Frankfurt)** via `05_app/vercel.json`, colocating compute with the EU database. We will *also* do the code-level optimizations (Option A **and** the substance of Option B) — colocation removes the transatlantic tax, and the code work removes the redundant/sequential round-trips on top of it.

The compute region is baked at build time, so this takes effect on the next fresh build of HEAD (not a "Redeploy" of an old build), and is verified via the `x-vercel-id` response-header region prefix and `myresearchlab.app/api/health`.

## Consequences

- **Easier / faster:** Every DB-bound request gets ~10× lower per-round-trip latency; the reported take/switch lag should drop from seconds to sub-second once compute + the code wins land.
- **Compliance:** Compute now processes request/response data in the EU (Frankfurt), matching the DB. The subprocessor disclosure (`lib/legal/subprocessors.ts`) is updated to "EU (Frankfurt) compute; US company" (owner-approved 2026-07-04). That list is the single source embedded in the Privacy Policy body, so the published policy now reflects the EU compute region. **No `CURRENT_LEGAL_VERSION` bump / re-accept** was done: the move is a factual, arguably *more*-protective change (compute now in the EU), not a new data flow or a downgrade, so the accepted terms are unchanged. Vercel Inc. remains a US company (jurisdictional access is unchanged); this ADR changes where functions *execute*, not who the processor is.
- **Committed to:** A single EU compute region. If we later need multi-region, revisit (Vercel Pro allows more than one).
- **Harder:** US-origin traffic pays more latency to reach compute; acceptable given the EU-resident data and the DB-bound workload. Requires the Vercel plan to permit region selection.

## Revisit triggers

- A significant US user base where compute latency outweighs the DB-colocation win (→ consider multi-region or a US read replica).
- Vercel changing region availability/pricing on the current plan.
- The DB moving regions again (keep compute colocated with it).

## References

- [ADR-0083](./0083-data-residency-eu-migration.md) — the EU DB migration this amends.
- [ADR-0016](./0016-production-deployment-architecture.md) — the original single-region US deployment baseline.
- `05_app/vercel.json` — `{ "regions": ["fra1"] }`.
- `05_app/lib/legal/subprocessors.ts` — Vercel compute-region disclosure.
- Runtime-perf diagnosis (2026-07-04): take-continue + workspace-switch round-trip counts; the code-win follow-ups (per-request `cache()` for identity, parallelize dashboard aggregates, cache the `/take` snapshot, single-call rate limit).
