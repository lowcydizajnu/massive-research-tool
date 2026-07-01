# ADR 0007 — Adopt Path A with migration-ready adapter discipline

- **Status:** accepted
- **Date:** 2026-05-28
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** infrastructure, hosting, auth, realtime, background-jobs, cost-model, migration

## Context

`STACK.md` (last updated 2026-05-27 with the two-path framing) established that the application code is identical on two viable infrastructure shapes:

- **Path A — Fast-to-ship.** Managed services: Vercel (hosting), Clerk (auth + multi-tenancy), Liveblocks (realtime), Inngest (background jobs).
- **Path B — Frugal.** Self-host or open-source: Fly.io / Render / VPS (hosting), Auth.js + Postgres RLS (auth), Yjs self-hosted (realtime), BullMQ + Redis (background jobs).

The cost-scaling table in STACK.md projects Path A at roughly $4k–$10k/month at 100k MAU vs. Path B at $300–$800. The two largest line items at scale on Path A are Clerk (per-MAU pricing above 10k) and Vercel (compute + bandwidth).

Before Build phase begins, we have to commit. The project owner's direction (2026-05-28): "use the most recommended path but be aware that because costs we can decide to switch to cheaper solution." This ADR formalizes that: **adopt Path A for V1 speed-to-ship, with adapter discipline so per-piece migration to Path B equivalents is mechanical when cost or strategy demands it.**

This continues the architectural pattern set by ADR-0005 (`RegistryAdapter`) and ADR-0006 (`AIProviderAdapter`): every external dependency we might want to swap sits behind a thin interface. ADR-0007 applies the same posture to the infrastructure layer.

## Options considered

### Option A — Pure Path A, accept lock-in for speed

Adopt Vercel + Clerk + Liveblocks + Inngest. Use vendor-specific features freely (Vercel Edge Middleware, Clerk's pre-built UI components, Liveblocks-specific APIs). Optimize for fastest time-to-shipped-V1.

- **Pros.** Fastest implementation. Use the best of each managed service. No adapter overhead.
- **Cons.** Migration cost compounds. At 10k MAU we'd be paying $300-600/month with no easy escape; at 100k MAU the migration to Path B costs months of work that could have been weeks if we'd designed for portability.

### Option B — Pure Path B from day one

Adopt Fly.io / Render / VPS + Auth.js + Yjs + BullMQ from V1. Maximize cost predictability and minimize lock-in upfront.

- **Pros.** Lowest cost ceiling. Maximum control. No surprises from third-party pricing changes.
- **Cons.** Real engineering work before shipping anything visible. Auth.js + RLS multi-tenancy setup alone is significant. Yjs self-hosting requires a small CRDT-aware Node service. Time-to-V1 stretches materially. Wrong for "solo + Claude, optimize for shipping" framing.

### Option C — Path A with adapter discipline (chosen)

Adopt Path A as the V1 default, with a hard rule: every managed service sits behind a typed adapter interface. Vendor-specific features used in the adapter implementation are invisible to application code. When cost or strategy demands a swap, the swap is "write a new adapter implementation" — not "rewrite the application."

- **Pros.** V1 ships at Path A speed. Per-piece migration to Path B is mechanical at the trigger points (Clerk → Auth.js, Liveblocks → Yjs, Inngest → BullMQ, Vercel → containerized hosting). The adapter discipline mirrors patterns we've already committed to elsewhere (ADR-0005, ADR-0006).
- **Cons.** A few extra hours of design thought per integration point. Real risk: "claim adapter discipline" without actually being portable. Mitigation: a migration-readiness checklist applied per integration point, gradable in code review.

## Decision

**We will adopt Path A with adapter discipline (Option C).** V1 ships on Vercel + Clerk + Liveblocks + Inngest. Every managed-service touchpoint sits behind an adapter interface; vendor-specific behavior never leaks into feature code. When cost ceilings or strategic priorities trigger a switch, the migration is a per-piece adapter swap, not a system rewrite.

### The seven load-bearing principles

1. **Adapter interfaces for every swappable touchpoint:**
   - `HostingShape` (less an adapter, more a deployment discipline — Docker-ready, env-driven, no Vercel-specific runtime assumptions in business logic).
   - `AuthAdapter` (sign-in, sign-up, session, org membership, role check).
   - `RealtimeAdapter` (presence, document collaboration, document subscription).
   - `BackgroundJobAdapter` (enqueue, schedule, retry, dead-letter, observability).
2. **No vendor-specific types in application code.** Auth returns our `User` and `Org` shapes, not Clerk's. Realtime returns our `Presence` and `Document` shapes, not Liveblocks's. Background jobs use our `Event` types, not Inngest's. Adapters translate at the boundary.
3. **Avoid the vendor-specific feature drugs.** Vercel Edge Middleware, Clerk's pre-built UI components (`<UserButton/>`, `<OrganizationSwitcher/>`), Liveblocks' React hooks tied to their schema — these are tempting but they make migration painful. Use them only after writing them down in a "lock-in inventory" list, with a justification per use.
4. **Cost-ceiling triggers are committed up front.** When any single managed service crosses **$200/month** at projected near-term burn, we begin migration planning for that piece (not the whole stack). When it crosses **$500/month**, we execute. Per-piece, not all-or-nothing.
5. **Per-piece migration order, when triggered:** Clerk → Auth.js + RLS is the highest-leverage swap (per-MAU pricing makes it the worst offender at scale). Liveblocks → Yjs is second (also per-MAU). Inngest → BullMQ + Redis is third (usage-priced but more linear). Vercel → containerized hosting is last (only Vercel changes pricing model dramatically with usage; the others bite first).
6. **Adapter implementations live in `src/infrastructure/<concern>/<vendor>.ts`.** Application code imports from `src/infrastructure/<concern>/index.ts`, which exports the active adapter. Switching adapters is a one-line config + new implementation file. The application code never knows or cares.
7. **Migration readiness is a code-review rule.** PRs that introduce vendor-specific imports outside of `src/infrastructure/` are blocked. PRs that add to the "lock-in inventory" require an explicit reviewer sign-off and a justification recorded in the inventory file.

### Specific V1 commitments

- **Hosting:** Vercel. App is also Docker-ready — `Dockerfile` and `docker-compose.yml` work locally. Environment variables drive configuration; no Vercel-specific runtime APIs in business logic.
- **Auth:** Clerk. Use Clerk's API for sign-in, sign-up, organizations, roles. **Do not** use Clerk's pre-built UI components except where wrapped in our own; build the auth UI ourselves so a swap doesn't take the user-facing surface with it.
- **Realtime:** Liveblocks. CRDT-backed presence and collaborative editing on the node-graph canvas. The Liveblocks Storage API is hidden behind `RealtimeAdapter`; feature code subscribes to abstract "documents."
- **Background jobs:** Inngest. Typed events, durable execution, retries. The Inngest function definitions are wrapped in `BackgroundJobAdapter.defineJob()` so the typed event shape is ours, not Inngest's.

### The "lock-in inventory" pattern

A `04_architecture/lock-in-inventory.md` file (to create at Build start) lists every vendor-specific feature we deliberately accept lock-in for, with:

- Vendor and feature name.
- Why we chose it over a portable alternative.
- What migration would cost if we have to swap.
- Whether the lock-in is acceptable at the projected scale.

Every entry is a deliberate decision, not a default. New entries require ADR-level justification (a short follow-on ADR or addition to this one) if they materially affect migration cost.

### Cost monitoring + migration triggers

Per-service cost projections are tracked monthly. Triggers:

- **$200/month on any single managed service:** schedule a migration spike to measure actual swap cost. Don't migrate yet; just verify the swap is still mechanical.
- **$500/month on any single managed service:** execute the migration for that service. Other services unaffected.
- **Single-vendor outage that affects $50k+ ARR worth of customers:** independent of cost, consider migration for resilience reasons.

These are floors, not targets. Earlier migration is fine when there's a strategic reason (e.g., a customer requires self-hosting; a tenant requires data sovereignty).

## Consequences

**What becomes easier:**

- V1 ships fast. The Path A managed services collapse the time from zero to working SaaS.
- Migration paths are clear and mechanical when triggered. No "we'd have to rewrite the auth layer" surprises.
- The adapter pattern is consistent across infrastructure (ADR-0007), registries (ADR-0005), AI providers (ADR-0006), and modules (ADR-0001). One mental model.
- Cost ceilings are made into pre-committed decisions, not crisis-mode debates.

**What becomes harder:**

- Slightly more design work per integration point. Each managed-service touchpoint needs an interface design before vendor implementation.
- Resisting the temptation to use vendor-specific features that would be expedient now and costly later. The lock-in inventory + code-review rule are the enforcement mechanism.
- More test surface: each adapter needs a stub implementation for unit/integration tests, plus a real implementation for end-to-end.

**What we are now committed to:**

- The four adapter interfaces (Hosting / Auth / Realtime / BackgroundJob) before V1 ships.
- No vendor-specific types in application code.
- The lock-in inventory and the code-review rule that gates additions to it.
- Cost ceilings at $200 (plan) and $500 (execute) per single managed service.
- Per-piece migration order when triggered: Clerk → Better Auth *(amendment 2026-05-29 — was Auth.js)*, then Liveblocks → Yjs, then Inngest → BullMQ, then hosting last.

**What we are now precluded from:**

- Using Clerk's pre-built UI components in production user-facing surfaces.
- Using Liveblocks-specific React hooks or Storage API directly in component code.
- Using Inngest's typed event helpers in feature code (only inside the adapter).
- Vercel-specific runtime calls (Edge Middleware, Vercel KV / Postgres) without entry in the lock-in inventory.
- "Just for now" exceptions to the adapter discipline.

## Revisit triggers

Reopen this decision (probably as a superseding ADR) if:

- Any single managed service crosses $500/month at current projected burn — execute migration for that piece per the order above.
- A strategic customer requirement forces self-hosting or data sovereignty for that tenant's data.
- Two or more managed services need migration in the same quarter — consider a larger refactor and a new ADR.
- Path A vendors materially change pricing model in ways that invalidate the cost-scaling assumptions from STACK.md.
- After 12 months at scale, evaluate whether the adapter discipline actually delivered (did migrations stay mechanical, or did vendor-specific behavior leak in despite the rules?).
- Per-tenant deployment becomes a real ask (some research institutions require on-prem). Probably a separate ADR on a multi-tenancy-vs-multi-deployment split.

## Amendments

### 2026-05-29 — Migration target for Clerk shifts to Better Auth (was Auth.js)

**Context.** Project owner asked for a refreshed comparison of auth providers before the Clerk wiring commit lands. Three things changed since ADR-0007 was written (2026-05-28):

1. **Better Auth became a serious option.** Released 2024, TypeScript-first, organizations primitive built in, first-class Drizzle integration. The original ADR weighed Auth.js as the target because Better Auth wasn't on the table yet.
2. **Lucia Auth dropped out.** Its maintainer announced sunset in late 2024 — no longer a viable migration target.
3. **WorkOS clarified its free tier.** 1M MAU free for User Management. Interesting only if we sell to enterprise customers who need SSO/SAML/SCIM.

**Decision.** When Clerk's cost-ceiling trigger fires, migrate to **Better Auth**, not Auth.js. Better Auth's Drizzle adapter is first-class (Auth.js + Drizzle has known sharp edges) and its organizations primitive matches our `Workspace` model without retrofitting. All other terms of ADR-0007 unchanged — adapter discipline, cost ceilings, migration order, lock-in inventory, code-review rule.

**Why update the ADR rather than wait for the migration.** Pre-committing the target keeps the migration mechanical when it triggers. The `AuthAdapter` interface is the same regardless of implementation; pre-naming the implementation prevents bike-shedding under cost pressure.

**Project-owner directive captured.** "Stay with Clerk but be prepared to migrate — maybe it won't happen but just not to be blocked and locked." The `AuthAdapter` interface in `05_app/server/adapters/auth.ts` is the mechanical preparation; this amendment is the strategic preparation. Both ship before any Clerk-specific code lands.

**No change to:** cost-ceiling triggers ($200/mo plan, $500/mo execute); migration order (Clerk is still first); the discipline that no `@clerk/nextjs` imports live outside `05_app/server/adapters/`. The `04_architecture/lock-in-inventory.md` file now tracks the per-vendor breakdown including this updated migration target.

## References

- `STACK.md` — the two-path framing this ADR resolves.
- ADR-0001 — modular composition + theme overlays — the adapter pattern philosophy this ADR extends to infrastructure.
- ADR-0005 — OSF integration — `RegistryAdapter` precedent.
- ADR-0006 — AI plug-in architecture — `AIProviderAdapter` precedent; same shape as the four adapters here.
- ADR-0011 — scaffold strategy — implements this ADR's Path A choice.
- `04_architecture/lock-in-inventory.md` — created 2026-05-29, tracks per-vendor lock-in.
- `05_app/server/adapters/auth.ts` — `AuthAdapter` interface; the mechanical half of "be prepared to migrate."
- `02_product/personas/multi-site-coordinator.md` — Marek's "per-seat × 63 sites = DOA" specifically calls out the Clerk-style pricing risk; the migration trigger directly addresses this concern.
- `02_product/product-brief.md` — overall cost-aware framing.
- Future: ADR-00NN — first migration execution (Clerk → Better Auth when triggered) tests whether the adapter abstraction held.
