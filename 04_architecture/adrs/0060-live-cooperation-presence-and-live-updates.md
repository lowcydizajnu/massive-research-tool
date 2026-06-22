# ADR 0060 — Live cooperation — presence, soft-locks & live updates

- **Status:** accepted
- **Date:** 2026-06-21
- **Deciders:** Project owner, Claude
- **Tags:** realtime, collaboration, builder, comments, activity, vendor-seam

## Context

> What is forcing this decision?

Studies are edited by groups, not individuals (the strategic insight: "the switching unit is a group" — `01_research/insights/researcher-tooling-pain-points.md`). Today two researchers on the same study can't tell the other is there, can silently clobber each other's edits, and must **refresh to see a teammate's comment or activity**. The owner asked for live cooperation: presence avatars, a "who's editing this block" indicator, and comments/activity that update without a refresh.

This is the **first realtime feature**, and most of the architecture is already decided — this ADR pins the V1 scope + transport and triggers the `RealtimeAdapter`:
- **ADR-0007** (path A vs B) names **Realtime** as one of the four locked adapter interfaces (`RealtimeAdapter` — presence / document collaboration / subscription), with **Liveblocks** as Path A and **Yjs self-hosted** as the Path-B migration.
- The **lock-in inventory** carries the Liveblocks row: "stub only in V1… adapter to be drafted when the first realtime feature lands; `@liveblocks/*` confined to `realtime.liveblocks.ts`; migration target Yjs + WebSocket."
- **ADR-0012** (autosave) already chose **last-write-wins across concurrent edits** on the single mutable working-tip `definition_snapshot`.
- **build-stage-builder-mode.md** already specs the presence UX: "Concurrent editor (rare; not in V1 ship but architecturally allowed) — top-bar avatar group shows the other editor; selected block shows their cursor color outline."

So the open questions are narrow: *which concurrency model* (block-level vs character-level CRDT) and *which transport ships first* (a vendor we must provision, vs a frugal default behind the same seam).

## Options considered

> ### Option A — Presence + block-level soft-locks + last-write-wins (chosen)
>
> - Broadcast **presence** (who's in the study, which block each has focused) and show avatars + a per-block colored border with initials. Two people edit **different** blocks freely; the **same** block shows a soft "X is editing" hint and resolves by **last-write-wins** (exactly ADR-0012). Comments + activity/notifications go **live via short-interval polling** (React Query `refetchInterval`) so a teammate's comment appears without a refresh. All of it sits behind a new `RealtimeAdapter`; the **V1 transport is a DB-heartbeat presence table + query polling** (no vendor to provision), with **Liveblocks/Yjs as the documented upgrade** (swap the adapter, not feature code).
> - **Pros:** matches ADR-0012 (LWW) + the build-stage wireframe (avatars + block outline) exactly; fits the snapshot/version model with no rework; writes stay on existing tRPC mutations; ships now with **no vendor provisioning** (mirrors the rate-limit adapter's dev-fallback pattern); honors the ADR-0007 seam so an upgrade to Liveblocks/Yjs touches one adapter file.
> - **Cons:** near-real-time (poll cadence, not instant push); same-block simultaneous edits lose the loser's change (mitigated by the soft-lock hint); a small additive presence table + a poll endpoint.
>
> ### Option B — CRDT co-editing (Yjs / Liveblocks Storage)
>
> - Represent the study as a CRDT document (Y.Doc) as the source of truth; Google-Docs-style character/field co-typing, conflict-free, live cursors.
> - **Pros:** no lost edits ever; best-in-class for prose co-authoring; live cursors.
> - **Cons:** poor fit with the current model — the study is one `definition_snapshot` jsonb on a mutable working tip, and CRDT needs a parallel sync/persistence path reconciled with the **immutable, citable** version snapshots (ADR-0002/0012) + schemas-first validation (ADR-0001) on every merge; requires provisioning Liveblocks Storage or a Yjs+WS server (cost + ops); multi-phase rebuild. Overkill for **block-structured** authoring, where teams divide work by block, not by paragraph. The inventory already files this as the **future migration**, not the V1 target.

## Decision

> A single, declarative sentence.

**We will build live cooperation as Option A — presence + block-level soft-locks + last-write-wins, plus live comments/activity via short-interval polling, all behind a new `RealtimeAdapter` whose V1 implementation is a DB-heartbeat presence table + React Query polling (no vendor), with Liveblocks (then Yjs) as the pre-decided upgrade path per ADR-0007 + the lock-in inventory.**

Reasoning: every piece except the transport is already decided, and Option A realizes those decisions with the smallest blast radius and **without blocking on a vendor account**. Presence is ephemeral, low-stakes data — a heartbeat row per (study, user) with a TTL, read by others on a poll, is entirely adequate to render avatars and a "who's editing" border. Edits keep flowing through the existing tRPC mutations under ADR-0012's last-write-wins; realtime only carries *presence* + *"something changed, refetch"* signals, never the authoritative data. Because feature code talks only to `RealtimeAdapter` (abstract `Presence`/subscription shapes, never vendor types), swapping the polling default for Liveblocks push — or Yjs CRDT if true co-typing is ever needed (Option B) — is an adapter change, not a rewrite.

## Consequences

> - **What becomes easier.** Teammates see each other and stop clobbering edits; comments + activity update without a refresh (removes the "refresh to see Maya's comment" friction); the realtime seam exists for future features (whiteboard cursors, etc.).
> - **What becomes harder.** We now own a presence table + heartbeat lifecycle (TTL/cleanup) and a poll cadence to tune; per-block UI must reflect remote focus; we carry a (documented) gap between "near-real-time polling" and "instant push" until/if we adopt Liveblocks.
> - **What we are now committed to.** Block-level concurrency + last-write-wins (ADR-0012); presence as ephemeral, non-authoritative data; all realtime behind `RealtimeAdapter` (no vendor types in feature code, per ADR-0007); the PII boundary (ADR-0014) — presence stores only userId + studyId + blockId + heartbeat, never participant data.
> - **What we are now precluded from (for now).** Conflict-free character-level co-typing (Option B / Yjs); offline edit-merge; cross-tab operational transforms — all reachable later via the adapter without touching feature code.

## Revisit triggers

> Conditions under which we reopen this.

- Teams routinely co-edit the **same block** and lost-edit complaints appear → adopt Liveblocks push and/or move that surface to CRDT (Option B).
- Poll volume becomes a cost/load problem at scale → swap the polling adapter for Liveblocks/Yjs push.
- A realtime feature needs **instant** sub-second latency (e.g. live cursors while dragging on the whiteboard) → upgrade the transport.
- The owner provisions Liveblocks and wants push immediately → swap the adapter impl (no feature-code change).

## References

> - Links to relevant code, prior ADRs, external docs.

- ADRs: [0007 path A vs B](0007-path-a-vs-b.md) (RealtimeAdapter seam; Liveblocks/Yjs), [0012 block format & autosave](0012-block-format-and-autosave-semantics.md) (last-write-wins working tip), [0014 response data model](0014-response-data-model-and-conditioning.md) (PII boundary), [0015 notifications/comments/activity](0015-notifications-comments-activity.md) (the comment + activity systems made live here), [0002 forking model](0002-forking-model.md) (immutable citable versions).
- Lock-in: `04_architecture/lock-in-inventory.md` (Liveblocks row → adapter now drafted; V1 impl = DB polling).
- Wireframe: `03_design/wireframes/build-stage-builder-mode.md` (concurrent-editor avatars + selected-block outline).
- Code touchpoints: `05_app/server/adapters/realtime.ts` (interface) + `realtime.local.ts` (DB-polling impl), `05_app/server/db/schema.ts` (`study_presence`), `05_app/server/trpc/routers/presence.ts`, `05_app/components/feature/builder/*` (avatars + per-block border), `05_app/components/feature/share/comments-panel.tsx` + activity feeds (refetchInterval).
