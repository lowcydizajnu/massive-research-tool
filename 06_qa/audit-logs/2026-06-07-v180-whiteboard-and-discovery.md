# QA audit — 2026-06-07 — V1.8 Whiteboard and discovery

## Overview

- **Auditor:** Claude (agent).
- **Scope:** the V1.8 anchor — two bundled streams. **Stream A — Whiteboard mode** (ADR-0020): the study as a React Flow node-graph with round-trip edits, multi-version compare, and an accessible list fallback. **Stream B — Cross-workspace discovery** (ADR-0018): the Browse destination, public study Details, and one-click Replicate.
- **Verdict:** ✅ cleared to ship as **v1.8.0** (single deploy, both streams). One deploy-time action is mandatory and gated on owner approval — the additive `whiteboard_viewport` migration must be applied to the production DB before/with the new code (else `studies.get` errors), exactly as it did on dev.

## What shipped (by PR, on the `v1.8` branch)

1. **Stream A foundations** (`8db1408`) — `@xyflow/react` v12 + lock-in inventory row + additive migration `0005` (`whiteboard_viewport jsonb` on `experiment_version`).
2. **Stream B gate** (`82da193`) — discovery user flow + `browse-public-studies` wireframe (framework filter deferred — no study→framework provenance).
3. **Stream B data layer** (`1329d2b`) — `browsePublic` (tag-intersection + author filters, recent/most-replicated sort, keyset cursor) + `browseTags`.
4. **Stream B UI** (`466d665`) — `/browse` destination, `BrowseExplorer`, `BrowseCard`, public Details (`/browse/[studyId]` via `getPublicStudy`), Replicate.
5. **Stream A canvas core** (`fb50fd5`) — `/build/whiteboard` route, real Builder⇆Whiteboard toggle, `lib/whiteboard/graph.ts` mapper, themed React Flow canvas, viewport persistence (`updateWhiteboardViewport`).
6. **Stream A round-trip** (`158e282`) — `WhiteboardWorkspace`: add/remove/configure via the existing Builder mutations (no new edit endpoints).
7. **Stream A compare** (`10b6265`) — `compareVersions` (reuses `diffBlocks`) + side-by-side diff-colored compare page.
8. **Stream A a11y + tests** (`14b53a5`) — accessible List fallback + Canvas/List toggle; axe coverage extended; gated whiteboard e2e.

## Verification

- **Unit/integration:** **177 vitest green** (20 files), including: `deriveGraph` mapper (3), `compareVersions` (2: diff + tenant scope), `browsePublic`/`browseTags` (6), `getPublicStudy` (2), `whiteboard_viewport` migration assertion (1).
- **Static:** `typecheck` clean, `lint` clean (the V1.7.2 import-name guardrail active), `next build` clean — all V1.8 routes registered (`/browse`, `/browse/[studyId]`, `/build/whiteboard`, `/build/whiteboard/compare`).
- **Manifest:** `validate.py` clean (ADR-0020, the discovery flow, and the browse wireframe registered).
- **Gated (not run here):** the auth e2e suite (`browse-and-replicate.spec`, `whiteboard.spec`) + the extended axe pass — they need a reachable Clerk + test users; run via `RUN_AUTH_E2E=1 … npm run test:e2e:auth` / `deploy:verify`.

## Lock-in / safety review

- React Flow (`@xyflow/react`) is MIT, client-only; all imports confined to `components/feature/whiteboard/*`; data shape is ours (`definition_snapshot.blocks`) so no data-model lock-in. Migration target Konva/custom canvas (lock-in inventory row added).
- All Whiteboard block edits flow through the existing tenant-scoped Builder mutations; the one new endpoint (`updateWhiteboardViewport`) is a writeProcedure that only touches the autosave tip's UX state.
- Browse reads are `publicProcedure` (listing is public by design); `getPublicStudy`/`compareVersions` are tenant/visibility-scoped (cross-tenant private studies are NOT_FOUND — test-covered). Replicate reuses the existing public-or-member fork guard.

## Known scope notes (deliberate, documented)

- **Framework filter/chip on Browse — deferred** (schema has no study→framework link; owner decision 2026-06-07).
- **Replicate workspace picker — deferred** (no "list my workspaces" endpoint; V1 is one workspace/user — confirmed sufficient as the project is single-user today).
- **Whiteboard node-position persistence — deferred** (pan/zoom persists; per-node drag positions re-layout on reload). Dagre/elk auto-layout is a future enhancement (ADR-0020).
- Deferred to V1.9+ per ADR-0020 + handoff: free-form sketching (Excalidraw), sketch-to-block, real-time canvas collab, full-text Browse search, saved-search follow.

## Sign-off

- [x] Agent: V1.8 code complete; 177 vitest + typecheck + lint + build + validator all green.
- [x] Agent: **SHIPPED** — owner approved the deploy (2026-06-07). Prod `whiteboard_viewport` migration applied via `db:migrate:prod`; `v1.8` merged to `main` (`52f6064`); Vercel deployed (`/api/health` → `52f6064`); smoke clean (`/signin` 200, protected routes 307); tagged **`v1.8.0`**.
- [ ] **Owner:** click-through review on production (Browse + Whiteboard). Optional: `npm run deploy:verify` for the full gated axe/e2e pass (writes test data — skippable as the only user).
