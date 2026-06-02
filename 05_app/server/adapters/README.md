# server/adapters/

Adapter interfaces and implementations for every external service in the stack. Per [ADR-0007](../../../04_architecture/adrs/0007-path-a-vs-b.md).

## The rule (one rule)

**Outside this folder, application code references the adapter interface only.** Never `import { ... } from "@clerk/nextjs"` in a route handler, never `import { liveblocks } from "..."` in a component. Imports of vendor SDKs live here and only here.

This is what makes ADR-0007's cost-ceiling triggers feasible in 2 weeks instead of 2 months.

## Current adapters

| Interface | Implementation(s) today | Migration target |
| --- | --- | --- |
| `AuthAdapter` | `auth.clerk.ts` (Clerk v7) | Clerk → Better Auth |
| `HostingShape` | (implicit — Next.js + Vercel patterns) | Vercel → Node container |
| `RealtimeAdapter` | (stub only) | Liveblocks → Yjs |
| `BackgroundJobAdapter` | `jobs.inngest.ts` (Inngest; serve route at `app/api/inngest`) | Inngest → BullMQ |
| `RegistryAdapter` | `registry.osf.ts` (OSF; OAuth + push — PR-1c) | OSF → AsPredicted / ClinicalTrials.gov |
| `AIProviderAdapter` | (none — V1 ships substrate only per ADR-0006) | per-provider |

## How to add a new adapter

1. Write the interface in `<concern>.ts` (e.g., `auth.ts`).
2. Implement against the chosen vendor in `<concern>.<vendor>.ts` (e.g., `auth.clerk.ts`).
3. Export the active implementation through `<concern>.ts` as the default — switch vendors by changing one import line.
4. Add a row to `../../../04_architecture/lock-in-inventory.md` documenting what's portable and what isn't.
5. PR checklist: any new vendor SDK import outside this folder fails review.

## Why the discipline matters

Vendor pricing trajectories diverge from product needs over time. The adapter pattern decouples the two. You pay nothing for it until the day you need to migrate, and then you pay 30% of the work instead of 100%.

See [LOCKIN inventory](../../../04_architecture/lock-in-inventory.md) for the per-vendor breakdown.
