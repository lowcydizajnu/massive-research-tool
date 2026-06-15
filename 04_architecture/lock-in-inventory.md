# Lock-in inventory

> **Status:** active. Updated whenever a vendor SDK import lands or moves.
> Per [ADR-0007](adrs/0007-path-a-vs-b.md) §migration-discipline.

This file is the single place where deliberate vendor lock-in is tracked. PR review checks it: any new vendor SDK import outside `05_app/server/adapters/` either (a) updates this file with a justified exception, or (b) gets rejected.

The principle: **shipping fast on managed services is good; carrying vendor names through application code is bad.** This file makes the boundary explicit.

## Audit columns

For each vendor:

- **What we use it for** — the actual scope.
- **Behind an adapter** — what's portable. Replacing the vendor doesn't touch this code.
- **Deliberate exceptions** — places where vendor-specific imports leak into application code with explicit justification. Each exception has a target removal date or trigger.
- **Migration target** — the chosen alternative if cost / capability triggers a switch (per ADR-0007).
- **Cost-ceiling trigger** — when ADR-0007's $200/mo plan + $500/mo execute would flip.

## Clerk (auth)

| | |
| --- | --- |
| **What we use it for** | Identity (signup, sign-in, OAuth Google, email magic-link), session management, MFA (post-V1), user metadata bag (theme preference, last workspace). |
| **Behind an adapter** | `05_app/server/adapters/auth.ts` — `AuthAdapter` interface; server identity (`@clerk/nextjs/server`) imported only in `05_app/server/adapters/auth.clerk.ts`. Feature code (route handlers, server actions, components) calls `auth` from `auth.ts`, never Clerk. |
| **Deliberate exceptions** | Three, all removed on the Clerk→Better Auth migration. (1) `<ClerkProvider>` in `05_app/app/layout.tsx` — a React context provider; must wrap the app at the root, can't sit behind a server-only adapter. (2) `clerkMiddleware()` in `05_app/middleware.ts` — Next.js middleware must live at project root. (3) The custom auth surface — the `(auth)` pages (`signup`/`signin`/`verify`/`sso-callback`) use Clerk client hooks (`useSignUp`/`useSignIn`/`useClerk`) because building custom auth UI (ADR-0007 bans Clerk's prebuilt UI components) requires the client SDK; the `AuthAdapter` only ever covered *server* identity, and the auth surface is expected to be rewritten wholesale on a vendor migration. (4) **Sign out** — `useClerk().signOut()` in `05_app/components/chrome/user-menu.tsx` (V1.12 A1): the server-side `AuthAdapter.signOut()` (Clerk `revokeSession`) leaves the client session cookie + a still-valid short-lived JWT in place, so a redirect alone keeps the user signed in for up to ~1 min; only the client SDK clears the session immediately. Same migration-rewrite expectation as the rest of the auth surface. None carry business logic or vendor types into feature code. |
| **Migration target** | **Better Auth** (per ADR-0007 amendment 2026-05-29). TypeScript-first, organizations primitive built in, first-class Drizzle integration. Was Auth.js in the original ADR. |
| **Cost-ceiling trigger** | Free up to 10k MAU; ~$125/mo at 15k MAU (plan-trigger range); ~$325/mo at 25k MAU; ~$825/mo at 50k MAU. ADR-0007 plan trigger ($200/mo) hits around 18k MAU; execute trigger ($500/mo) hits around 28k MAU. |
| **Pre-commit signal** | Project-owner directive 2026-05-29: "stay with Clerk but be prepared to migrate — maybe it won't happen but just not to be blocked and locked." Adapter discipline must be present from day one even though no migration is planned. |

## Vercel (hosting)

| | |
| --- | --- |
| **What we use it for** | Next.js deployment, edge functions, Vercel Postgres (Neon under the hood). |
| **Behind an adapter** | `HostingShape` is implicit — Next.js standard patterns work on any Node runtime. The data layer is Drizzle + raw `postgres` driver, so the DB can move to any Postgres host without code changes. |
| **Deliberate exceptions** | (none yet — avoid Vercel-specific runtime APIs like `geo` headers, KV, Blob; use libraries that are portable.) |
| **Migration target** | Self-hosted Node container on AWS / GCP / Fly.io, with the Postgres host moved to standalone Neon or Supabase. ADR-0007 marked hosting as the last migration. |
| **Cost-ceiling trigger** | Vercel Pro is $20/user/mo + bandwidth + compute. ADR-0007 ceiling: switch when monthly Vercel bill > $500/mo, which is hard to hit before significant scale. |

## Liveblocks (realtime / presence)

| | |
| --- | --- |
| **What we use it for** | (stub only in V1 — per ADR-0011, no realtime features ship in MVP). Future: collaborative cursors on the Whiteboard mode canvas, presence indicators on shared studies, optimistic update broadcasting. |
| **Behind an adapter** | `RealtimeAdapter` interface (to be drafted when the first realtime feature lands). All `@liveblocks/*` imports limited to `05_app/server/adapters/realtime.liveblocks.ts`. |
| **Deliberate exceptions** | (none — adapter not yet written; first realtime feature triggers the interface.) |
| **Migration target** | Yjs + a small WebSocket server (could be deployed alongside the Next.js app or as a separate service). Yjs is the standard CRDT for collaborative editing; Liveblocks itself is built on top of conceptually similar primitives. |
| **Cost-ceiling trigger** | Liveblocks free up to a low MAU threshold; ~$99/mo for the Starter tier. Trigger when monthly cost > $200/mo OR when we need to support self-hosted enterprise deployments. |

## Inngest (background jobs)

| | |
| --- | --- |
| **What we use it for** | **V1.5: OSF push (ADR-0005) is the first job.** Future: asset freeze (ADR-0003), AI task invocations (ADR-0006), email notifications, abandonment sweeper. |
| **Behind an adapter** | `BackgroundJobAdapter` (`05_app/server/adapters/jobs.ts`) — feature code enqueues typed events; all `inngest` imports confined to `jobs.inngest.ts`. |
| **Deliberate exceptions** | `serve()` in `05_app/app/api/inngest/route.ts` — the Inngest serve handler must sit at the route boundary (like `clerkMiddleware`); import-only, no business logic. Removal trigger = job-vendor migration. |
| **Migration target** | BullMQ + a Redis instance. Standard Node.js queue stack; runs anywhere. |
| **Cost-ceiling trigger** | Inngest free tier covers most early-stage usage; ~$50–$150/mo at moderate scale. Trigger when monthly cost > $200/mo OR when we hit the job-execution-rate ceiling. |

## Upstash (Redis — rate limiting, per ADR-0016)

| | |
| --- | --- |
| **What we use it for** | A hosted, cross-instance counter for rate-limiting the public `/take/*` participant Server Actions (closes participant-runtime security review #9). A shared store is the point — serverless instances + regions each have their own memory, so an in-process limiter can't enforce a global cap. |
| **Behind an adapter** | `RateLimitAdapter` (`05_app/server/adapters/ratelimit.ts`) — feature code calls `rateLimit.limit(key, rule)`; all `@upstash/*` imports confined to `ratelimit.upstash.ts`. A per-instance in-memory fallback runs in dev/test when the REST creds are absent (parallel to the Inngest dev fallback); a missing cred in production is fatal, never a silent no-op. |
| **Deliberate exceptions** | (none — the adapter is the only `@upstash/*` importer; no Upstash types leak into feature code.) |
| **Migration target** | Self-managed Redis (Railway / Fly.io / a container) behind the same `RateLimitAdapter`. The fixed-window INCR + EXPIRE logic is plain Redis, not Upstash-specific; only the REST client construction changes. |
| **Cost-ceiling trigger** | Upstash free tier covers low request volumes (pay-per-request); ~$10–$50/mo at moderate `/take` traffic. Trigger when monthly cost > $100/mo OR when request latency from the REST API materially affects participant flow. |

## OSF (registry — per ADR-0005)

| | |
| --- | --- |
| **What we use it for** | Push-to-OSF on preregistration. Per-user OAuth (researchers own their OSF identity). |
| **Behind an adapter** | `RegistryAdapter` (`05_app/server/adapters/registry.ts`, registry-agnostic) — all OSF API/OAuth calls confined to `registry.osf.ts`. |
| **Deliberate exceptions** | (none — the OSF OAuth redirect/callback routes use the adapter's `getAuthorizeUrl`/`completeConnection`, no OSF SDK leaks into route/UI code.) |
| **Migration target** | Not a migration so much as a *plurality*: AsPredicted, ClinicalTrials.gov, PsyArXiv all plug into the same `RegistryAdapter` shape. Per-tenant config picks which registries are enabled. |
| **Cost-ceiling trigger** | OSF is free for researchers — no cost trigger. Capability trigger: when a customer demands a registry we don't support. |

## AI providers (per ADR-0006)

| | |
| --- | --- |
| **What we use it for** | V1 ships substrate only — interface + audit log + cost metering. No AI features in MVP. Future: extraction tasks (procedure + materials from uploaded papers), schema validation assistance, summarization. |
| **Behind an adapter** | `AIProviderAdapter` interface per ADR-0006. All OpenAI / Anthropic / etc. SDK imports limited to `05_app/server/adapters/ai.<vendor>.ts`. Per-tenant routing with sensitivity tags. |
| **Deliberate exceptions** | (none — substrate only, no provider wired in V1.) |
| **Migration target** | Per-tenant or per-task. Multiple providers can be active simultaneously. |
| **Cost-ceiling trigger** | Cost-per-invocation tracked in `TenantAIMeter`; trigger when monthly cost > $50/tenant OR when token consumption pattern suggests caching gaps. |

## React Flow / xyflow (Whiteboard canvas — per ADR-0020)

| | |
| --- | --- |
| **What we use it for** | V1.8 Whiteboard mode — the study-graph view (blocks as nodes, `visibility.showIfCondition` rules as edges) + multi-version side-by-side compare. Researcher-only (ADR-0013: participants stay SSR-MPA). |
| **Behind an adapter** | No server adapter — `@xyflow/react` is a client-only UI library, so the lock-in boundary is a component wrapper, not a `server/adapters/` interface. All `@xyflow/react` imports + its CSS are confined to `05_app/components/feature/whiteboard/*`; the rest of the app never imports xyflow types or components. The canvas is a translation layer over `definition_snapshot.blocks` (ADR-0012) — the data shape is **ours**, not xyflow's, so there is no data-model lock-in (the migration only rewrites rendering). |
| **Deliberate exceptions** | (none — the component-folder boundary holds; no xyflow import leaks outside `components/feature/whiteboard/`.) |
| **Migration target** | Konva or a small custom HTML5-canvas layer (per ADR-0020). Well-bounded because nodes/edges are derived from our own `blocks` array on each render; a migration swaps the renderer, not the data. |
| **Cost-ceiling trigger** | None — MIT licensed, no SaaS tier, no per-seat cost. The only revisit trigger is bundle size (~30kb gzipped today; revisit if a future `bundle-size` ADR sets a budget) or a hypothetical license change (ADR-0020 revisit triggers). |

## dnd-kit (Block drag-reorder — per ADR-0022)

| | |
| --- | --- |
| **What we use it for** | V1.11 block drag-reorder in the Builder list + whiteboard List — a smooth, keyboard-accessible sortable. Researcher-only. |
| **Behind an adapter** | No server adapter — dnd-kit is a client-only UI library, so the boundary is a component wrapper (`05_app/components/feature/whiteboard/sortable-list.tsx`); `@dnd-kit/*` imports are confined to that wrapper + the two list components that consume it. The reorder *result* is a plain `instanceId[]` handed to `studies.reorderBlocks` — no dnd-kit type touches the data layer. |
| **Deliberate exceptions** | (none — the wrapper boundary holds.) |
| **Migration target** | Native HTML5 DnD (what we had pre-V1.11) or another sortable lib; a migration swaps the wrapper, since order is just the `blocks` array order (ADR-0012). |
| **Cost-ceiling trigger** | None — MIT, no SaaS tier, no per-seat cost. Revisit only on a React-major incompatibility or unmaintained status (ADR-0022 triggers). |

## @react-pdf/renderer (Study PDF export — per ADR-0027)

| | |
| --- | --- |
| **What we use it for** | V1.12 B2 "Export study as PDF" — server-side rendering of the study document (cover + abstract + hypotheses + sections + block appendix + citation + prereg receipt). Researcher-only. |
| **Behind an adapter** | No server adapter — it's a rendering library, confined to one document component (`05_app/components/feature/overview/study-pdf.tsx`) + the one route that buffers it (`05_app/app/(app)/studies/[id]/export-pdf/route.ts`). Everything it renders comes from our own data; no `@react-pdf/*` type leaks elsewhere. |
| **Deliberate exceptions** | (none — the two-file boundary holds.) |
| **Migration target** | Browser print-to-PDF (the ADR-0027 Option B fallback) or another server PDF lib; a migration rewrites the one document component. |
| **Cost-ceiling trigger** | None — MIT, no SaaS tier. Operational note: must run on the Node runtime + be in `next.config` `serverExternalPackages` (not bundled). Revisit on a React/Node-major incompatibility or Vercel bundle/runtime cost (ADR-0027 triggers). |

## react-grid-layout (Dashboard flexible grid — per ADR-0045 amendment 2026-06-15)

| | |
| --- | --- |
| **What we use it for** | V1.13.0 dashboard customization — the draggable + resizable 2D grid on `/home` + `/dashboard` (drag widgets on the real layout, resize narrower/wider, 3 responsive columns). Researcher-only. |
| **Behind an adapter** | No server adapter — `react-grid-layout` is a client-only UI library, so the boundary is the dashboard grid island (`05_app/components/feature/dashboard/dashboard-grid.tsx`) + its CSS import; no `react-grid-layout` type touches the data layer. Geometry is stored as our own `{x,y,w,h}` grid units inside the existing `dashboard_layout.widgets` jsonb (ADR-0045) — the data shape is **ours**, so a migration swaps only the renderer. |
| **Deliberate exceptions** | (none — the single-island boundary holds.) |
| **Migration target** | The "flowing grid" fallback — a CSS grid with per-widget `colSpan` + the `@dnd-kit` we already own for reorder. Well-bounded: the stored `{x,y,w,h}` degrades cleanly to a width + order. (This is also the fallback if RGL ever breaks on a React major.) |
| **Cost-ceiling trigger** | None — MIT, no SaaS tier, no per-seat cost. `react-grid-layout@2.x` peers `react >= 16.3.0` (React 19 OK; 2.x dropped `findDOMNode`). Revisit on a React-major incompatibility, unmaintained status, or a future `bundle-size` budget. |

## Review discipline

When opening a PR that touches an adapter or adds a vendor SDK import:

1. Confirm the SDK import lives in `05_app/server/adapters/<concern>.<vendor>.ts`. If not, justify the exception in the row above.
2. Confirm the migration target row is still accurate.
3. If cost reality has diverged from the pricing in this file, update it (Clerk especially — their pricing changes).
4. If the migration target has changed because a better alternative exists (e.g., Better Auth replacing Auth.js for the Clerk migration in 2026-05-29), update the relevant ADR and this file in the same commit.

The full migration discipline is in [ADR-0007 §migration-order](adrs/0007-path-a-vs-b.md).

| Cloudflare R2 (asset storage) | `server/adapters/storage.r2.ts` only (aws4fetch presigner; StorageAdapter interface) | Migrate to S3/MinIO: new impl file + one-line export switch; objects copyable via rclone |

| Cloudflare Turnstile (bot/quality screen) | RESERVED, not shipped (ADR-0042) — no code, no secret provisioned | Chosen captcha vendor if bot pressure appears; swap = a captcha adapter behind an interface, or hCaptcha |
