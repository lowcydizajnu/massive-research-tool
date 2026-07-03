# ADR 0090 — Workspace archive & restore (soft-hide, reversible)

- **Status:** accepted
- **Date:** 2026-07-03
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** data-model, workspace, lifecycle

## Context

The owner asked for a way to get rid of a workspace ("we need option to delete
spaces") — the immediate trigger was creating a throwaway "tour" workspace while
testing onboarding and then having no way to remove it, so it clutters the switcher
forever.

When offered permanent delete vs. block-until-empty vs. archive, the owner chose
**Archive, not delete**: hide the workspace and everything in it, keep all data
recoverable, never destroy anything. This is the right default for a psychology-
experiment tool, where a workspace can hold preregistered studies and collected
participant responses — deleting those has research-integrity and IRB implications
that a reversible hide does not.

The mechanism is already half-present. `workspace.archived_at` (a nullable timestamp)
exists in the schema, and the read paths already treat it as "hidden": `workspace.list`
(the switcher list) and `resolveActiveWorkspace` (the active-workspace cookie resolver)
both filter `isNull(workspace.archivedAt)`, and `/admin/workspaces` already renders an
archived badge. What is missing is (a) any way to *set* or *clear* `archived_at`, and
(b) a UI to archive a workspace and to see + restore archived ones. This ADR covers
that write side and its safety rules. Prior decisions in play: ADR-0033 (workspaces +
switcher + active-workspace cookie), ADR-0046 (soft-remove of memberships — the same
"soft, reversible, filtered-out" pattern), ADR-0082 (View-as / support-access
visibility), ADR-0014 (activity-event boundary), ADR-0023 (demo content).

## Options considered

### Option A — Soft archive: set `archived_at`, read paths already hide it (chosen)

- Add `workspace.archive` / `workspace.unarchive` mutations that set/clear the
  existing `archived_at` timestamp. No schema change (the column already exists).
  Every list/resolver already filters archived out, so a single timestamp flip hides
  the whole workspace and everything under it; clearing it brings it all back exactly
  as it was.
- **Pros:** Reversible — nothing is destroyed, matching the owner's pick and the
  research-integrity constraint. No migration. Reuses the existing column and the
  filters already written for it. Mirrors ADR-0046's established soft-remove pattern.
  Studies, versions, responses, members, saves all stay intact and re-appear on
  restore.
- **Cons:** Data is retained, not freed (a workspace archived to "clean up" still
  occupies storage). Archived studies' `/take` links technically still resolve at the
  DB level unless we also stop recruitment (addressed in the Decision). "Archived" is a
  third workspace state the mental model must carry.

### Option B — Hard delete (cascade)

- A `workspace.delete` that cascade-removes the workspace and all studies, versions,
  responses, and collected data after a typed-name confirmation.
- **Pros:** Actually frees storage; no lingering state.
- **Cons:** Irreversible destruction of preregistered studies and participant data —
  exactly the IRB/integrity hazard the owner declined. Needs careful cascade ordering
  across ~a dozen FK-linked tables. Rejected by the owner.

### Option C — Block delete until empty

- Only allow removing a workspace with zero studies; force the researcher to move or
  delete studies first.
- **Pros:** No accidental data loss.
- **Cons:** Doesn't solve the actual case (a throwaway workspace that *does* contain a
  tutorial study you don't want to hand-empty), and still needs a delete path for the
  emptied shell. More friction than archive for no extra safety over Option A.

## Decision

**We will add reversible workspace archive/restore by setting and clearing the existing
`workspace.archived_at` timestamp — never deleting workspace data.**

A workspace **owner** (only) may archive a workspace from its Settings. Archiving sets
`archived_at = now()`; because every membership/active-workspace query already filters
archived workspaces out, the workspace immediately disappears from the switcher and
stops being resolvable as the active workspace — the app falls back to the owner's next
workspace, or to the personal **Home** if they have none left. Restore clears
`archived_at` and the workspace re-appears intact, with all its studies, versions,
responses, members, and saves.

**Archiving your *last* workspace is allowed** (owner call, 2026-07-03: "I can, since
there's still Home"). Home (personal mode, `/home`) is workspace-independent, so a
researcher with zero active workspaces still has a place to stand — and their archived
list in Account settings to restore or create from. This required one supporting change
to the shell: the `(app)` layout previously used *workspace-presence* as a lazy proxy
for "onboarded" and bounced any workspace-less user to `/signup`. It now gates on
`hasCompletedOnboarding` directly, so an onboarded researcher with zero active
workspaces reaches Home instead of the signup screen; workspace-mode routes
(`/dashboard`, `/studies`, …) that genuinely need a workspace redirect to `/home`
themselves when there is none. (Personal mode was already designed to need no
workspace — only that one guard coupled it.)

One safety rule remains, enforced server-side:

- **You cannot archive a workspace with a study still recruiting.** If any study in the
  workspace has an open recruitment session on a runnable (preregistered/published)
  version, the mutation refuses (`PRECONDITION_FAILED`) and **names the offending
  studies**, telling the researcher to stop recruitment first (the Settings card shows
  the same hint with a link to Studies · Running). This prevents the confusing state of
  a *hidden* workspace that is still quietly collecting participant data via live
  `/take` links, and keeps archive a clean "this is dormant" signal. (Because it's
  reversible, this is the only lifecycle guard we need — no data is ever at risk.)

Restore has no such guards (bringing a workspace back is always safe). Archive is
**owner-only** (not admin/editor) because it removes the workspace from every member's
switcher; a non-owner uses study-level archive instead. Archiving emits a
`workspace_archived` product-analytics event (ADR-0074), consistent with
`workspace_created`; it is **not** an `activity_event` (no cross-researcher fan-out —
this is a private housekeeping action, per ADR-0014's boundary).

## Consequences

- **What becomes easier.** Researchers can clear throwaway/finished workspaces from the
  switcher without losing anything; a mis-archive is one click to undo. No migration to
  ship, so this rides a normal code deploy.
- **What becomes harder.** We now carry a third workspace state (active / archived) and
  must keep new list/resolver queries archived-aware — any *future* query that
  enumerates a user's workspaces must remember to filter `archived_at` (the existing
  ones already do; a test locks the switcher + resolver behaviour). Restore must remain
  a first-class, always-available path (we are committed to never orphaning archived
  data behind a missing UI).
- **What we are now committed to.** Keeping archived workspace data intact and
  restorable indefinitely; keeping archive owner-only and guarded by the recruiting
  rule above. Also: the `(app)` shell is now onboarding-gated, so **zero active
  workspaces is a supported state** — every future workspace-enumerating surface must
  tolerate it (Home + Account settings already do; workspace-mode routes redirect to
  Home).
- **What we are now precluded from.** This deliberately does **not** free storage; if a
  "permanently delete + purge" capability is ever needed (GDPR erasure, cost), that is a
  separate future ADR building on this state, not a change to it. Archive is owner-
  scoped, so a workspace archived by its owner vanishes for *all* members at once;
  per-member "hide from my switcher" is out of scope for V1.

## Revisit triggers

- Storage cost or a data-erasure/GDPR obligation forces a true purge → new ADR for
  hard-delete-with-audit on top of the archived state.
- Workspaces routinely get archived while studies are mid-recruitment and researchers
  want archive to *also* stop recruitment in one action → revisit rule 2 (auto-stop vs.
  block).
- Teams ask for per-member workspace hiding independent of the owner's archive →
  separate "hide for me" concept.

## References

- `05_app/server/db/schema.ts` — `workspace.archived_at` (already present).
- `05_app/server/trpc/routers/workspace.ts` — `list` (filters archived), where
  `archive`/`unarchive`/`listArchived` will live.
- `05_app/server/workspace/active.ts` — `resolveActiveWorkspace` (filters archived,
  falls back owned-then-earliest).
- `05_app/app/(app)/layout.tsx` — onboarding gate (was workspace-presence).
- `05_app/app/(app)/(workspace)/layout.tsx` — redirects to `/home` when no active workspace.
- `05_app/app/(app)/(workspace)/settings/workspace/page.tsx` — archive control home.
- `05_app/app/(app)/(personal)/settings/account/page.tsx` — restore-list home.
- Prior ADRs: [ADR-0033](0033-ia-v05-personal-mode-workspace-switcher.md) (workspaces +
  switcher), [ADR-0046](0046-team-destination.md) (soft-remove pattern),
  [ADR-0082](0082-privacy-operator-access-model.md) (View-as visibility),
  [ADR-0014](0014-response-data-model-and-conditioning.md) (activity-event boundary),
  [ADR-0074](0074-analytics-adapter-posthog.md) (product analytics).
- Wireframe: [workspace-archive.md](../../03_design/wireframes/workspace-archive.md).
