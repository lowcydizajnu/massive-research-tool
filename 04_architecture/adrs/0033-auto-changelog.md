# ADR 0033 — Auto-changelog on conscious saves

- **Status:** accepted
- **Date:** 2026-06-12
- **Deciders:** project owner + Claude
- **Tags:** versioning, diff, collaboration

## Context

First slice of the GitHub-features backlog (the "Releases → release notes" analogue): when a researcher saves a named version, preregisters, or publishes, the version should carry a researcher-readable summary of what changed since the previous frozen version — "＋ Attention check · ～ Likert prompt reworded · － H2". Today the Versions tab lists versions with no indication of what each one changed, and the Save dialog asks for a label with no view of what is being frozen.

The diff machinery already exists: per-block alignment (`alignBlocksForDiff`), config-level change lines (`summarizeConfigDiff`, ADR-0020/0024 era), and the protocol-text serialization + LCS diff (ADR-0031). The decision here is only where the changelog lives and when it is computed.

## Options considered

### Option A — Derive on read

- `listVersions` computes each frozen version's changes against the previous frozen snapshot at query time (and the working copy's pending changes against the latest frozen — which doubles as the Save dialog preview).
- **Pros:** no migration, no write-path changes, cannot go stale or disagree with the snapshots (the snapshots ARE the source of truth); one code path serves the Versions tab, the Save dialog preview, and any future consumer (OSF amendment note).
- **Cons:** recomputed per query (in-memory JSON diff over ≤200 blocks × a handful of versions — microseconds); history with many versions does O(n) diffs per listVersions call.

### Option B — Store the summary on `experiment_version` at freeze time

- A `change_summary text[]` column written by saveAsNamed/preregister/publish.
- **Pros:** read is free; summary is immutable alongside the version.
- **Cons:** migration + three write paths to keep in sync; a bug in the generator is frozen forever (stale summaries after generator improvements); duplicates information fully derivable from data we already freeze.

## Decision

We will derive the changelog on read (Option A): a pure `changelogBetween(prevSnapshot, nextSnapshot)` in `server/modules/changelog.ts` compares the full snapshot-riding definition — blocks (added / removed / config changes via `summarizeConfigDiff`, group membership moves, reorders), groups (added / removed / renamed), theme (preset change / adjustments), and Overview sections. `listVersions` attaches `changes: string[]` to every frozen version (first version reports "Initial version — n blocks") and to the working copy (pending changes vs the latest frozen). Generator improvements retroactively improve ALL histories — that is a feature for a derived view, exactly like GitHub re-rendering diffs.

## Consequences

- **What becomes easier:** the Versions tab reads like release notes; the Save dialog shows what is about to be frozen before the researcher names it; the same lines are ready to become the OSF amendment note when the amendment flow (V1.6 deferral) lands.
- **What becomes harder:** nothing operationally; changelog wording may change between deploys (derived, not frozen) — acceptable and noted in the UI copy ("summary", not "record").
- **Committed to:** snapshots remain the only source of truth; changelog is presentation.
- **Precluded from:** researcher-edited changelog lines (would need Option B's storage; revisit trigger below).

## Revisit triggers

- Researchers want to edit/annotate the generated lines → add a stored override column (Option B for the override only).
- Version histories grow past ~50 frozen versions per study → memoize or compute lazily per row.
- The OSF amendment flow lands → feed `changelogBetween` into the amendment note payload.

## References

- [github-features-backlog](../handoffs/github-features-backlog.md) item 3
- [ADR-0031](0031-protocol-text-diff.md) (protocol-text diff), [ADR-0019](0019-version-preview-and-restore.md)-era freeze semantics, [ADR-0012](0012-block-format-and-autosave-semantics.md) (snapshot-riding definition)
- Code: `05_app/server/modules/changelog.ts`, `studies.listVersions`, `versions-panel.tsx`, `save-version-dialog.tsx`
