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
| **What we use it for** | Not adopted yet. The first realtime feature shipped on a **DB-polling default**, not Liveblocks (ADR-0060): presence indicators (avatars + per-block "who's editing") on the Builder, via a `study_presence` heartbeat table + client polling. Liveblocks remains the **push upgrade** for lower latency / collaborative cursors on the Whiteboard canvas. |
| **Behind an adapter** | `RealtimeAdapter` interface **now drafted** at `05_app/server/adapters/realtime.ts` (presence / list / clear); V1 impl is `realtime.local.ts` (DB + polling, no vendor). A Liveblocks impl would live at `realtime.liveblocks.ts` with all `@liveblocks/*` imports confined there; the `realtime` binding swaps with no feature-code change. |
| **Deliberate exceptions** | (none yet — V1 uses no vendor; the DB-polling impl needs no `@liveblocks/*` imports. First Liveblocks impl adds the confined import.) |
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

## Prolific (recruitment provider — per ADR-0047)

| | |
| --- | --- |
| **What we use it for** | Recruit participants on Prolific from our app (V1.15): create/publish/pause/close a study on the provider side, list submissions, approve/reject, send bonuses, receive webhooks. PAT-first (the researcher pastes a Personal Access Token; OAuth optional). |
| **Behind an adapter** | `RecruitmentAdapter` (`05_app/server/adapters/recruitment.ts`, provider-agnostic) — all Prolific API calls confined to `recruitment.prolific.ts` (the only file importing Prolific's API shapes). Feature code calls `getRecruitmentAdapter(provider)`, never Prolific directly. Tokens encrypted (AES-256-GCM) in `recruitment_provider_connection`. |
| **Deliberate exceptions** | The webhook route `app/api/recruitment/[provider]/webhook/[workspaceId]/route.ts` (ADR-0050) — verifies signatures via `adapter.verifyWebhookSignature` (per-workspace secret keyed off the URL) and enqueues a reconcile; import-only at the route boundary like Inngest's `serve()`, no business logic. Removal trigger = recruitment-vendor migration. (The adapter remains the only file importing Prolific's API shapes.) |
| **PII contract** | The adapter NEVER returns participant PII (ADR-0014 amendment): `ProviderSubmission` carries only the opaque `externalPid` + status + timestamps. Even if Prolific's API returns a participant name, no call site can persist it. |
| **Migration target** | A *plurality*, not a swap: CloudResearch / MTurk / others implement the same `RecruitmentAdapter`. A managed-panel "manual / external" connection type (paste-the-URL, mirroring today's V1.5 workflow) covers API-less Polish panels (Ariadna/TGM/etc.) if needed. |
| **Money actions** | approve / reject / send-bonus are exposed in-app (ADR-0052) behind a confirmation modal, but only ever *trigger* the provider's operation via `adapter.approveSubmission` / `rejectSubmission` / `sendBonus` under the researcher's connected token — we hold no card/bank rails. Each writes an append-only `payout_record` (ADR-0048) for spend visibility. Removal trigger = recruitment-vendor migration (same as the adapter). |
| **Cost-ceiling trigger** | Prolific charges the researcher directly (we never process money — ADR-0048/0052); no cost to us. Capability trigger: a customer needs a provider we don't yet adapt. |

## AI providers (per ADR-0006)

| | |
| --- | --- |
| **What we use it for** | First AI feature wired (ADR-0061): the AI conversation block, via **Anthropic (Claude)** with a **bring-your-own, per-workspace key** (encrypted at rest; `ai_provider_connection`). Future: extraction tasks, schema validation assistance, summarization. |
| **Behind an adapter** | `AIProviderAdapter` (`server/adapters/ai.ts`); impl `ai.anthropic.ts` (Claude over HTTP — `validateKey` + `chat`). All Anthropic/OpenAI calls confined to `ai.<vendor>.ts`; feature code never imports a vendor. The BYO key is decrypted + passed per call. |
| **Deliberate exceptions** | (none — no vendor SDK imported; the Anthropic HTTP calls are confined to `ai.anthropic.ts`.) |
| **Migration target** | Per-tenant or per-task. Multiple providers can be active simultaneously. |
| **Cost-ceiling trigger** | Cost-per-invocation tracked in `TenantAIMeter`; trigger when monthly cost > $50/tenant OR when token consumption pattern suggests caching gaps. |

## Document extraction (PDF / Word → text — per ADR-0062)

| | |
| --- | --- |
| **What we use it for** | Turning a researcher-uploaded PDF/DOCX into plain text for the AI conversation block's **context** (ADR-0061/0062). Deterministic parsing — **not** an AI Task, not behind `AIProviderAdapter`. |
| **Behind an adapter** | One module: `server/extract/document.ts`. Library imports (`unpdf` for PDF, `mammoth` for DOCX) live **only** there; the `/api/extract-document` route and feature code call `extractDocumentText(...)` and never import a parser. |
| **Deliberate exceptions** | (none — both libs are pure-JS, server-only, imported solely in `server/extract/document.ts`.) |
| **Migration target** | Swap `unpdf`/`mammoth` for another parser (or a sandboxed background job, or an OCR provider for scanned PDFs) inside the one module without touching callers. |
| **Cost-ceiling trigger** | No per-use cost (local parsing). Capability trigger: scanned-PDF/OCR demand, or structured field extraction → an ADR-0006 AI `extraction` Task instead. |

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
| **What we use it for** | V1.11 block drag-reorder in the Builder list + whiteboard List; V1.13.0 the dashboard customize grid (`rectSortingStrategy` drag-reorder on `/home` + `/dashboard`, ADR-0045 amendment). Researcher-only. |
| **Behind an adapter** | No server adapter — dnd-kit is a client-only UI library, so the boundary is the component wrappers that use it (`05_app/components/feature/whiteboard/sortable-list.tsx` + `components/feature/dashboard/dashboard-grid.tsx`); `@dnd-kit/*` imports are confined to those. The reorder *result* is a plain array order (block `instanceId[]` for the Builder; widget-key order for the dashboard) — no dnd-kit type touches the data layer. |
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

> **Note (2026-06-15):** `react-grid-layout` was briefly added for the dashboard flexible grid (ADR-0045 amendment) and **removed** — its fixed-cell model truncated content-sized widgets and its responsive layout misbehaved. The dashboard grid is now a plain CSS grid + the `@dnd-kit` row above (no new dependency). See the ADR-0045 amendment for the rationale.

## react-joyride (first-run onboarding tour — per ADR-0072)

| | |
| --- | --- |
| **What we use it for** | The first-run product tour (platform-foundation PF3.1) — coachmark steps over the workspace chrome. |
| **Behind an adapter** | No server adapter — client-only UI library, so the boundary is the one component that uses it (`05_app/components/feature/onboarding/onboarding-tour.tsx`), which lazy-loads it via `next/dynamic`. No react-joyride type leaks elsewhere; the tour targets plain `[data-tour="…"]` attributes on existing chrome, and tour-seen state is ours (Clerk publicMetadata `hasSeenTour`), not the library's. |
| **Deliberate exceptions** | (none — the single-component boundary holds.) |
| **Migration target** | Another tour lib (driver.js, intro.js, shepherd) or a small custom coachmark — a migration rewrites the one component; the `[data-tour]` anchors + `hasSeenTour` flag are library-agnostic. **Version note:** v3.x (the React-19-compatible rewrite); v2.x uses `findDOMNode` and cannot run on React 19. |
| **Cost-ceiling trigger** | None — MIT, no SaaS tier. Bundle: lazy-loaded, so it only ships to users who actually see the tour. Revisit on a React-major incompatibility or unmaintained status. |

## Sentry (error monitoring — per ADR-0072)

| | |
| --- | --- |
| **What we use it for** | Production error aggregation + alerting (platform-foundation PF1.1). Free "Developer" tier; EU region. **Read API (ADR-0080):** the admin dashboard pulls open-issue count + 24h error volume + top issues via the Sentry REST API. |
| **Behind an adapter** | **Write/capture: No — deliberate exception** (auto-instrumentation, below). **Read: yes** — the dashboard's API reads live ONLY in `server/adapters/insights.sentry.ts` (the one Sentry-REST caller), env-gated + graceful (returns `{available:false}` on missing token / API error, never throws). Vendor HTTP never leaks into feature/UI code. |
| **Deliberate exceptions** (all removed on a Sentry→X migration) | `withSentryConfig(...)` in `05_app/next.config.ts`; `05_app/instrumentation.ts` (`register()` + `onRequestError`); `05_app/instrumentation-client.ts`; `05_app/sentry.server.config.ts`; `05_app/sentry.edge.config.ts`; `05_app/app/global-error.tsx` (`Sentry.captureException`). All are config/boundary files — no Sentry types or business logic leak into feature code. |
| **PII contract** | `sendDefaultPii: false` in every init (ADR-0014) — no raw IP, cookies, or request bodies; stack traces + error context only. Errors-only (no session replay / profiling) for bundle + quota discipline. |
| **Migration target** | PostHog error tracking or Datadog (ADR-0072). DSN + tokens are env vars (`NEXT_PUBLIC_SENTRY_DSN`; optional `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` for source-map upload); the SDK no-ops when the DSN is absent (local/dev). |
| **Cost-ceiling trigger** | Sentry free-tier event quota hit → tune sample rate or switch (ADR-0072 revisit trigger). |

## PostHog (product analytics — per ADR-0074)

| | |
| --- | --- |
| **What we use it for** | Analytics + Admin handoff AA1 — product analytics (pageviews, autocapture, funnels) + session replay for the researcher app. EU region (`eu.i.posthog.com`). Researcher-only; the participant runtime (`/take/*`) is never tracked (ADR-0014). **Read API (ADR-0080):** the admin dashboard pulls active users (DAU/WAU/MAU) + top events via the HogQL query API. |
| **Behind an adapter** | **Three parts.** (1) Server events behind `server/adapters/analytics.ts` (`AnalyticsAdapter`) + `analytics.posthog.ts` (the only `posthog-node` importer) — strict taxonomy, consent-aware no-op (ADR-0074). (2) The **client SDK is a deliberate exception** (below). (3) **Read/insights (ADR-0080):** the dashboard's HogQL reads live ONLY in `server/adapters/insights.posthog.ts` (the one query-API caller), env-gated + graceful (`{available:false}` on missing key / API error, never throws). |
| **Deliberate exceptions** (removed on a PostHog→X migration) | `05_app/components/analytics/posthog-provider.tsx` — the one file importing `posthog-js`. A client context provider mounted in `app/(app)/layout.tsx` (never in `/take/*`); it inits + captures pageviews + gates session replay. No PostHog type leaks into feature code; the event names it emits are `$pageview`/autocapture (PostHog built-ins), and explicit business events go through the server `AnalyticsAdapter`'s typed taxonomy. |
| **PII + consent contract** | Hard no-op unless `NEXT_PUBLIC_POSTHOG_KEY` is set (un-provisioned envs never phone home). Consent-gated (ADR-0073): capture + session replay run ONLY on "accept all" — "necessary"/no-choice means no init / opt-out, reacting live to the cookie banner. Session replay masks all inputs (`maskAllInputs`), so researcher-typed content never reaches a recording. Client identify is deferred (anonymous stable `distinct_id`) to keep PII minimal. |
| **Migration target** | Another analytics vendor (Amplitude, Mixpanel) or self-hosted PostHog. Server side swaps `analytics.posthog.ts` behind the unchanged `AnalyticsAdapter`; client side rewrites the one provider component. Keys are env vars (`NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST`). |
| **Cost-ceiling trigger** | PostHog free-tier event / recording quota hit → tune capture (sampling, autocapture scope, replay rate) or switch (ADR-0074 revisit trigger). |

## Resend (engagement email — per ADR-0081)

| | |
| --- | --- |
| **What we use it for** | EE3 engagement email — the weekly activity digest + the return-nudge. Operator-facing only; never participant addresses (ADR-0014). Both features default OFF (admin kill switch). |
| **Behind an adapter** | **Yes.** `server/adapters/email.ts` (`EmailAdapter`) + `email.resend.ts` (the only Resend caller — REST via `fetch`, **no SDK dependency**). Env-gated: `isConfigured()=false` + `send` returns `{ok:false}` without `RESEND_API_KEY`/`EMAIL_FROM`, so un-provisioned envs (and the disabled-by-default workers) never send. |
| **Deliberate exceptions** | None — no Resend SDK or types leak outside `email.resend.ts`. |
| **PII contract** | Sends only to researcher account emails; bodies carry aggregate counts + operator-edited copy, never participant data (ADR-0014). |
| **Migration target** | SendGrid / Amazon SES / SMTP. Swap `email.resend.ts` behind the unchanged `EmailAdapter`; keys are env vars (`RESEND_API_KEY` + `EMAIL_FROM`). |
| **Cost-ceiling trigger** | Resend free-tier send quota hit → throttle digest cadence / nudge window or switch ESP (ADR-0081 revisit trigger). |

## Mintlify (docs hosting — per ADR-0078)

| | |
| --- | --- |
| **What we use it for** | Researcher documentation at `docs.myresearchlab.app` (EE4) — hosted search/nav/dark-mode/SSL for the docs site. |
| **Behind an adapter** | N/A — it's a hosting vendor, not an SDK in the app. The only in-app coupling is `lib/help/doc-urls.ts` (the typed `DOC_URLS` map + `DOCS_BASE`), which holds URL *paths*, not any Mintlify type or import. The `<HelpLink>` component is a plain `<a>`. |
| **Deliberate exceptions** | (none — no `@mintlify/*` import anywhere; the app only links out to the docs domain.) |
| **Content portability** | Docs content is **plain MDX in-repo** under `docs/` (+ `docs.json`). Mintlify renders it; it is not locked in a vendor CMS. |
| **Migration target** | Docusaurus / Nextra / self-hosted — a re-host of the same MDX, not a content rewrite. Swap the DNS CNAME + the config file; `DOCS_BASE` is the one app-side constant to repoint. |
| **Cost-ceiling trigger** | Mintlify free tier (Mintlify footer branding) → upgrade (~$20/mo) when content scales, or re-host the in-repo MDX (ADR-0078 revisit trigger). |

## Review discipline

When opening a PR that touches an adapter or adds a vendor SDK import:

1. Confirm the SDK import lives in `05_app/server/adapters/<concern>.<vendor>.ts`. If not, justify the exception in the row above.
2. Confirm the migration target row is still accurate.
3. If cost reality has diverged from the pricing in this file, update it (Clerk especially — their pricing changes).
4. If the migration target has changed because a better alternative exists (e.g., Better Auth replacing Auth.js for the Clerk migration in 2026-05-29), update the relevant ADR and this file in the same commit.

The full migration discipline is in [ADR-0007 §migration-order](adrs/0007-path-a-vs-b.md).

| Cloudflare R2 (asset storage) | `server/adapters/storage.r2.ts` only (aws4fetch presigner; StorageAdapter interface) | Migrate to S3/MinIO: new impl file + one-line export switch; objects copyable via rclone |

| Cloudflare Turnstile (bot/quality screen) | RESERVED, not shipped (ADR-0042) — no code, no secret provisioned | Chosen captcha vendor if bot pressure appears; swap = a captcha adapter behind an interface, or hCaptcha |

| Crossref (citation lookup) | `server/adapters/citation.ts` (`CitationAdapter`) + `server/adapters/citation.crossref.ts` only — public REST, no SDK, no key (polite-pool `mailto`) | Swap to DataCite / OpenAlex / Semantic Scholar behind the same interface; a failed/absent lookup already degrades to manual entry, so the dependency is non-blocking |
