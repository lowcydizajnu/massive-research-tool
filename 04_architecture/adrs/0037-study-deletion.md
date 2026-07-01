# ADR 0037 — Hard study deletion

- **Status:** accepted
- **Date:** 2026-06-12
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** data-model, destructive-operations

## Context

Archive exists (sets `archived_at`; the study moves to the Archived filter) but nothing actually deletes a study — the owner hit this ("I cannot remove it"). Test studies and abandoned drafts accumulate forever. A real delete must decide what happens to the web of referencing rows: versions, conditions, recruitment, responses, proposals, preview tokens, comments, fork lineage.

## Options considered

### Option A — Hard delete with explicit cascade (chosen)

- One transaction deletes, in FK order: response items → responses → recruitment sessions → conditions → registry pushes → preview tokens → change proposals (source OR target side) → study-targeted comments → versions → the experiment; children forks keep existing but their lineage pointers null out (a fork is its own study — deleting the parent must not destroy someone's replication).
- **Pros:** true removal (GDPR-friendly; test data actually disappears); forks and the activity history (no-FK text references) survive as records.
- **Cons:** irreversible — mitigated by the danger-toned double confirmation and Archive being offered first in the same menu.

### Option B — Soft-delete only (deleted_at flag)

- **Pros:** reversible.
- **Cons:** doesn't solve the owner's problem (data still exists, still counted, still exportable); needs a second "purge" eventually anyway; archive ALREADY covers the reversible case.

## Decision

We will ship Option A as `studies.delete` (write role; danger ConfirmDialog naming what's destroyed). Archive/Unarchive remain the reversible path and sit beside Delete in the ⋯ menu — Unarchive also lands now (it was deferred at M1). Block-instance-scoped comments whose study disappears become unreachable and are deleted with the study's own comment thread; cross-workspace activity rows (plain-text references, no FKs) remain as history.

## Consequences

- **Easier:** workspaces stay clean; abandoned tests are removable; the archived filter stops being a graveyard.
- **Harder:** support cannot resurrect a deleted study — the dialog copy carries that weight.
- **Committed to:** forks survive parent deletion (lineage nulled); responses die with the study.
- **Precluded from:** undo. Archive first is the recommended path and the dialog says so.

## Revisit triggers

- Multi-member workspaces want role-restricted deletion (owner/admin only) → tighten beyond write role.
- A retention/IRB requirement appears for collected responses → block deletion while responses exist, or export-then-delete flow.

## References

- Owner request 2026-06-12; [focused-study-mode wireframe](../../03_design/wireframes/focused-study-mode.md) (⋯ menu)
- Code: `studies.delete`, `studies.unarchive`, `components/chrome/study-actions-menu.tsx`
