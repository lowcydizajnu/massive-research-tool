# STACK.md — recommended technology and why

This is a recommendation, not a commitment. Each choice has a rationale tied to the product's actual constraints: SaaS, multi-tenant, multi-project, complex cross-wired data, hybrid UI (forms + drag-and-drop node graphs), scientific reliability. Anything you want to override gets recorded as an ADR before it changes here.

The document presents **two viable paths**. Same application code; different operational shape. Pick deliberately, record the choice as an ADR before committing.

- **Path A — Fast-to-ship.** Managed services across the board. Highest monthly cost, lowest setup time, fewest ops decisions to make alone.
- **Path B — Frugal.** Self-host or open-source the expensive pieces. Lowest monthly cost, more setup time, real Linux ops to own.

---

## TL;DR

| Layer                      | Path A — Fast-to-ship                | Path B — Frugal                                  | Why this layer matters                              |
| -------------------------- | ------------------------------------ | ------------------------------------------------ | ---------------------------------------------------- |
| Language                   | TypeScript                           | TypeScript                                       | One language end-to-end, types catch bugs early      |
| Web framework              | Next.js (App Router)                 | Next.js (App Router)                             | SSR/RSC, file-based routing, mature SaaS path        |
| API                        | tRPC                                 | tRPC                                             | End-to-end type safety, no contract drift            |
| UI primitives              | Tailwind + shadcn/ui (Radix)         | Tailwind + shadcn/ui (Radix)                     | Accessible primitives, full code ownership           |
| State (client)             | Zustand + TanStack Query             | Zustand + TanStack Query                         | Simple local state, robust server cache              |
| Node-graph canvas          | React Flow                           | React Flow                                       | Best-in-class drag-and-drop whiteboard               |
| Workflow / state           | XState                               | XState                                           | Explicit state machines for experiment runtime       |
| Database engine            | PostgreSQL                           | PostgreSQL                                       | Relational rigor + JSONB for flexible experiment defs |
| **Hosted DB**              | **Neon (managed, branching)**        | **Self-hosted Postgres on a VPS**                | Where the DB physically runs                         |
| ORM                        | Drizzle ORM                          | Drizzle ORM                                      | Thin, SQL-transparent, fully typed                   |
| **Auth & multi-tenancy**   | **Clerk**                            | **Auth.js + Postgres RLS**                       | Sign-in, orgs, roles, tenant isolation               |
| **Realtime collaboration** | **Liveblocks (managed)**             | **Yjs self-hosted (small Node service)**         | CRDT-backed presence + multi-user canvas             |
| **Background jobs**        | **Inngest (managed)**                | **BullMQ + Redis**                               | Long-running, retryable workflows                    |
| File / asset storage       | Cloudflare R2 (cheap egress)         | Cloudflare R2 or self-hosted MinIO               | S3-compatible blob storage                           |
| Testing                    | Vitest + Playwright + Storybook + axe | Vitest + Playwright + Storybook + axe           | Unit, e2e, component, a11y                           |
| Observability              | Sentry + PostHog                     | Sentry self-hosted + PostHog (free tier)         | Errors, product analytics                            |
| **Hosting**                | **Vercel**                           | **Fly.io, Render, or VPS (Hetzner)**             | Where the app runs                                   |

Bold rows are the ones that meaningfully differ between paths. Everything else is the same in both.

---

## Cost reality

Numbers below are realistic monthly ranges based on public pricing for the listed providers, assuming B2B SaaS usage patterns (researchers and labs as users, not consumer scale). They are estimates, not quotes.

| Stage              | Active users | Path A (fast)           | Path B (frugal)         | Note                                                                 |
| ------------------ | ------------ | ----------------------- | ----------------------- | -------------------------------------------------------------------- |
| MVP / pre-revenue  | 0–100        | $0–20                   | $5–25                   | Both viable; Path A is free until you hit limits.                    |
| Early production   | ~1k          | $70–150                 | $40–80                  | Most managed services still on free or starter tiers.                |
| Growth             | ~10k         | $300–600                | $80–200                 | Clerk's MAU pricing and Vercel bandwidth start to bite on Path A.    |
| Scale              | ~100k        | $4k–10k+                | $300–800                | Clerk alone is ~$1.8k+/mo at 100k MAU. Liveblocks per-MAU adds up.   |

The largest single line item at scale on Path A is **Clerk** (per-MAU pricing above 10k). Second is **Vercel** (compute + bandwidth). Third is **Liveblocks** if collaborative editing is heavily used.

## Where the costs hide

- **Clerk above 10k MAU.** $0.02 per MAU after the free tier. At 100k MAU that's ~$1,800/mo just for sign-in.
- **Vercel bandwidth.** 1TB included on Pro, then ~$40/TB. Serving stimulus media (images, audio, video) to participants can chew through it.
- **Vercel function execution.** Long-running experiment scoring, batch exports, large ingests bump into timeouts and pay per invocation. This is partly why background jobs are pushed to Inngest.
- **Liveblocks per-MAU.** Counts anyone connecting to a session. Yjs self-hosted on a tiny VPS removes the line item.
- **Sentry event volume.** Free tier is small; a noisy production error can burn the monthly quota in hours.

---

## Why this shape

**Type safety end-to-end.** TypeScript + tRPC + Drizzle means the path from a database column to a button in the UI is one continuous type. Contract drift between frontend and backend is one of the largest bug sources in SaaS; this stack closes that door.

**Relational backbone, flexible payloads.** Psychological experiments have a strict relational structure (User → Project → Experiment → Trial → Response) and a wildly flexible inner schema (each paradigm has its own parameters and stimuli). PostgreSQL with JSONB columns gives you both: enforced relationships, indexed JSONB for parameter querying, and the option to migrate hot fields out of JSONB into proper columns later.

**Node graphs deserve a purpose-built library.** The "drag-and-drop connectors on a whiteboard" requirement maps exactly to React Flow's domain: nodes, edges, handles, custom node components, minimap, zoom. Building this from scratch is months of work to reach what React Flow gives you in a week.

**State machines for experiment runtime.** Experimental protocols are deterministic and stateful: instructions → consent → practice → trial loop → debrief, with branches and timeouts. XState makes the protocol explicit, testable, visualizable, and reviewable by a non-engineer collaborator. This is exactly the kind of complexity where ad-hoc booleans turn into bugs.

**Multi-tenancy from day one.** Whether via Clerk Organizations (Path A) or Postgres row-level security with Auth.js (Path B), tenant isolation is structural, not bolted on.

**CRDT realtime, when we get there.** Liveblocks (Path A) or Yjs (Path B) handle the gnarly parts of multi-user editing on the canvas. Not needed for the MVP, but the architecture should leave room.

---

## Why the two paths split where they split

The differences between Path A and Path B concentrate on **hosting, auth, realtime, and background jobs** because that is where managed-service pricing scales aggressively with usage. Application code (Next.js, tRPC, Drizzle, React Flow, XState) is identical on both paths — you can change paths later without rewriting features. The migration cost is real but bounded:

- **Hosting (Vercel → Fly.io/Render/VPS):** Two to five days of work the first time, mostly Dockerfile + CI changes. Code changes only if you used Vercel-specific features (Edge Middleware, image optimization, KV).
- **Auth (Clerk → Auth.js):** One to two weeks for a careful migration with a data backfill. Avoid Clerk's pre-built UI components to keep the migration lighter.
- **Realtime (Liveblocks → Yjs):** A few days. Both speak CRDTs; the API shape differs.
- **Background jobs (Inngest → BullMQ):** A few days. Inngest's event model maps cleanly to BullMQ queues if you kept events as your own types.

**Practical recommendation:** Start on **Path A** to compress time-to-working-app, but write the code so each managed service sits behind a thin adapter. At the first scaling pinch point (hitting a free-tier ceiling, an invoice line item exceeding ~$200/mo), write an ADR and migrate that one piece to its Path B equivalent. Do not migrate everything at once.

---

## When to pick Path B from the start

- You are pre-revenue, time-rich, and cash-poor — the ops work is cheaper than the SaaS bill will be.
- You expect 10k+ MAU within 12 months and want to avoid an expensive migration later.
- You have a strong opinion that owning the infrastructure is worth the maintenance burden.

## When to stay on Path A indefinitely

- Revenue per user is high enough that infra cost is a small line item.
- Engineering time is the binding constraint, not money.
- You are okay rewriting later if the economics change.

---

## Anti-choices (and why)

- **Not Firebase / not Firestore.** No relational integrity, painful for cross-wired data with many-to-many relationships. Fine for prototypes; brittle for our domain.
- **Not Mongo.** JSONB in Postgres gives the same flexibility without losing relational guarantees.
- **Not Prisma (default).** Drizzle is leaner, the SQL is visible, and migrations are less magical. Prisma is fine if you prefer its developer ergonomics — record the swap as an ADR.
- **Not GraphQL (yet).** tRPC covers our internal needs without the schema overhead. We can layer GraphQL later if external API consumers appear.
- **Not Redux.** Zustand + TanStack Query is sufficient for everything except very large global state graphs, which we do not have.
- **Not custom drag-and-drop.** React Flow exists. Building our own is a months-long detour.
- **Not AWS/GCP from day one.** Their flexibility costs early-stage focus. Adopt later if a specific need (compliance, region) forces it.

---

## What needs an ADR before you actually adopt it

Every line above is a starting point. When the time comes to commit, write an ADR for at least these decisions:

- **Path selection.** Path A vs Path B vs a hybrid (and which services are on which path).
- **Tenancy model.** Clerk Orgs vs Auth.js + RLS — specific row-level security policies if the latter.
- **Realtime approach.** Liveblocks vs Yjs vs none initially.
- **Background workflows.** Inngest vs BullMQ vs Trigger.dev vs raw queues.
- **Storage layout for experiment definitions.** One JSONB blob vs normalized tables vs hybrid.
- **Hosting target.** Vercel vs Fly.io vs Render vs VPS, including the deploy pipeline.

The ADR template lives at `00_meta/templates/ADR-template.md`.

---

## What this does *not* lock in

- Hosting can change. Both paths are portable Node apps under the hood.
- The DB host can change without changing application code (Postgres is Postgres).
- The auth provider can change with effort proportional to how deeply we lean on its non-portable features — keep those in a thin adapter.

The point of recording the stack — and the two-path framing — is so we can disagree productively and migrate deliberately, not so we lock anything in early.
