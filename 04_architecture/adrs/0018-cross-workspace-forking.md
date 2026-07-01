# ADR 0018 — Cross-workspace forking and replication

- **Status:** accepted
- **Date:** 2026-06-03
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** forking, replication, tenancy, permissions, v1.7

## Context

[ADR-0002](0002-forking-model.md) adopted snapshot-based forking and declared **forkability is a permission on the parent** (`forkable_by`: `public` / `link-only` / `private`; public-forkable is the open-science default). [ADR-0015](0015-notifications-comments-activity.md) made `fork` an event ("Sofia replicated your study") and the V1.7 anchor e2e is explicitly cross-workspace: *Sofia (workspace B) forks Hanna's published study (workspace A); Maya, following Hanna, sees it in Follows; Hanna's Replications tab shows the divergence.*

But forking was never built, and everything else in the app is **workspace-scoped**: `studies.get`/`list` filter on `experiment.tenant_id = activeWorkspace`, so a user literally cannot read a study in another workspace. There is no path for Sofia to read — let alone fork — Hanna's study. This ADR decides that path: the single, permissioned cross-tenant read that forking requires, what a fork copies, and how the Replications surface reads back across workspaces. It is the implementation of ADR-0002's "public experiments are forkable" promise across the tenant boundary — not a new forking model.

## Options considered

### Decision 1 — The cross-tenant read

#### Option A — A dedicated, permission-gated fork-source reader (chosen)

One narrow server helper (`loadForkSource(studyId, callerUserId)`) reads an `experiment` **without** the active-workspace filter, and returns it only if it is **forkable to this caller**: `forkable_by = 'public'` (anyone) OR the caller is an active member of the source's workspace (same-workspace forks, any forkability — you can fork your own private work). `link-only` is recognised but deferred (no link-token machinery in V1.7). Every *other* query stays workspace-scoped; this is the one audited exception.

- **Pros:** Minimal blast radius — exactly one function may cross tenants, easy to audit; the permission rule is explicit and lives in one place; matches ADR-0002 §7 verbatim.
- **Cons:** A second read path for studies (the scoped one + this one) to keep in sync if the study shape changes.

#### Option B — Relax `studies.get` to allow public studies cross-tenant

Make the existing getter return a study if it's in your workspace OR public.

- **Pros:** One code path.
- **Cons:** Quietly widens the most-used query's trust boundary; every caller of `get` now has to reason about cross-tenant rows; easy to leak private fields. Rejected — the tenant scope on `get` is load-bearing.

### Decision 2 — What a fork copies + lineage

We follow ADR-0002 (snapshot, version-pinned lineage, no participant data). The fork pins `fork_of_version_id` to the source's **latest runnable version** (preregistered/published) when one exists, else the working tip — the meaningful thing to replicate is what was registered/published, not an unfinished draft. Block `instanceId`s are **preserved** in the copy (not re-minted) so the Replications diff can align parent and child blocks by identity; conditions are copied like preregister does. The new experiment lives in the caller's active workspace, `owner_id` = caller, `forkable_by` default `private`.

### Decision 3 — Reading replications back (Replications tab)

`getReplications(studyId)` returns the **parent** (if this study is itself a fork) and the **children** (`fork_of_experiment_id = studyId`). Children may live in other workspaces. To avoid leaking private protocol detail across tenants, a child's **block-level divergence** is computed only when the caller may see it (the child is `public` or in the caller's workspace); otherwise the child is counted + named (author + title are fork-relationship signal the parent author already received via the `fork` event) but its diff is withheld.

## Decision

**We will add one permission-gated cross-tenant fork-source reader (Decision 1A); `studies.fork` copies the source's latest runnable (else tip) snapshot — instanceIds preserved — into a new private experiment in the caller's workspace with version-pinned lineage and emits the `fork` event; `getReplications` reads the parent + children cross-tenant, withholding the divergence diff for children the caller can't see.** Cross-tenant access is allowed iff the source is `public` or the caller is a member of its workspace; `link-only` is deferred. This is the smallest surface that delivers ADR-0002's public-forkable promise and the ADR-0015 fork event without widening any existing query's trust boundary.

## Consequences

- **Easier:** the V1.7 cross-workspace anchor e2e becomes expressible; "replicated your study" notifications + Follows entries have a real trigger; the Replications tab has data; preserved instanceIds make divergence diffs precise.
- **Harder:** two study read paths (scoped + fork-source) to keep aligned; the privacy rule for child diffs is a real branch to test.
- **Committed to:** `forkable_by = 'public'` as the cross-tenant gate; version-pinned lineage (`fork_of_version_id` → a specific immutable version, per ADR-0002 forward-readiness); instanceId preservation across a fork.
- **Precluded (until revisited):** `link-only` forking (needs share-link tokens); pull-from-upstream / merge-back (ADR-0002 already deferred); cross-tenant browse/discovery of others' public studies (no "explore" surface in V1.7 — you fork a study you reached by id/link).

## Revisit triggers

- We add a public **discovery/explore** surface (browse others' public studies) — the cross-tenant reader generalises into a query, and visibility filtering needs a real model.
- `link-only` forking is requested — needs share-link tokens + a redemption path.
- Pull-from-upstream / merge ships (ADR-0002's deferred half).
- A study needs per-field cross-tenant visibility finer than "public ⇒ whole protocol visible."

## Amendment (2026-06-14) — replication requires a frozen version

The audit found the original Decision 2 "pin the latest runnable version **else the working tip**" let a study that was only ever a **draft** (never preregistered/published) be replicated, and `setForkable` would flip any study to `public` with no stage check — so a moving draft could be offered for replication. That contradicts the open-science intent (you replicate a *registered* design, not a shifting draft).

**Decision:** replication now requires a **frozen** version (`RUNNABLE_KINDS` = preregistered/published):

- `loadForkSource` drops the unconditional tip fallback. The tip (autosave draft) fallback is kept **only for a same-workspace active member** — duplicating your own work-in-progress (the "Use as template" path) stays allowed. A **public / cross-workspace replication of a draft is refused** (`PRECONDITION_FAILED`, "isn't frozen yet").
- `setForkable` refuses `public`/`link-only` until the study has a frozen version (setting back to `private` is always allowed).
- The Builder disables the forkable toggle + Replicate affordance until a frozen version exists.

Own-private-draft carve-out (same-workspace duplication of an unfrozen draft) is **kept** — confirm with the owner if even that should be gated. Migration-free.

## References

- [ADR-0002 — Snapshot-based forking](0002-forking-model.md) (the forking model + `forkable_by` permission this implements across tenants).
- [ADR-0015 — Notifications, comments, activity feed](0015-notifications-comments-activity.md) (the `fork` event + Follows).
- [follow-affordances.md](../../03_design/wireframes/follow-affordances.md), `05_app/server/trpc/routers/studies.ts` (`fork`, `getReplications`, `setForkable`).
