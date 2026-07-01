# ADR 0019 — Version preview and restore

- **Status:** accepted
- **Date:** 2026-06-04
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** data-model, builder, versioning

## Context

The Builder's Versions sub-tab (V1.7.1, ADR-0012 amendment) lists the autosave **working copy** plus every frozen conscious save (named / preregistered / published). It is read-only: rows are not interactive. The owner asked to make the rows clickable and to be able to "switch between" versions, and chose, when asked, **read-only preview with an explicit Restore button** (not click-to-restore, and not bidirectional switching).

This forces a decision about what "restore" *means* in our model. ADR-0002/0004/0012 establish that conscious versions are **immutable frozen snapshots** — that immutability is what makes a preregistration trustworthy (an OSF registration must reference a definition that cannot silently change). So "switching the current version" to a frozen one cannot mean making that frozen row mutable. The only mutable thing in a study is the autosave tip (`experiment.current_version_id` → the `kind:autosave` row, written in place by `writeBlocks`, ADR-0012).

We also need a way to read a single non-current version's block set for the preview pane; today blocks are only ever read from the autosave tip (`studies.get`) or the current preregistration.

## Options considered

### Option A — Restore = copy a frozen snapshot's blocks into the working copy (chosen)

- A new `studies.restoreVersion({ studyId, versionId })` writeProcedure reads the chosen frozen version's `definition_snapshot.blocks` and writes them into the autosave tip via the existing `writeBlocks` helper — exactly as if the researcher had hand-rebuilt that block set. The frozen row is never mutated; `current_version_id` keeps pointing at the autosave tip.
- Preview is served by a new `studies.getVersion({ studyId, versionId })` query returning that version's blocks read-only (resolved against the module registry the same way `studies.get` does).
- **Pros:** preserves snapshot immutability (preregistration integrity holds); reuses the autosave write path (last-write-wins, no new concurrency rules); "restore" is just an ordinary edit to the working copy, so Save/Preregister/Publish afterward behave normally; trivially overwritable.
- **Cons:** restoring overwrites the current unsaved working copy with no automatic backup — mitigated by an explicit confirm and the clear "Unsaved changes" badge (ADR-0012 amendment label work) so the user knows when they'd lose edits.

### Option B — Restore = repoint `current_version_id` to the frozen version

- Make the chosen frozen version the "current" one by moving the pointer.
- **Pros:** no data copy.
- **Cons:** breaks the model — frozen versions would become the editable tip, so the next autosave would mutate a snapshot a preregistration may reference; or we'd need fork-on-write, which is more machinery than Option A. Rejected as it violates ADR-0002/0004 immutability.

### Option C — Branch/checkout multiple working copies (git-style switching)

- Keep several mutable tips and switch between them.
- **Pros:** matches the literal "switch between them" phrasing.
- **Cons:** far beyond V1 scope; multiple tips need a selection model, conflict story, and UI we don't have. Deferred; Option A covers the actual need (get an old version back to keep working on it).

## Decision

We will implement restore as **copying a frozen version's blocks into the autosave working copy** (Option A), with a read-only preview served by a dedicated `getVersion` query. Frozen versions stay immutable; restore is an ordinary, explicit, confirmed edit to the working tip. This gives the researcher the "go back to v1 and keep working" capability they asked for without compromising the snapshot guarantees that preregistration depends on.

Any frozen version — including preregistered and published ones — may be **previewed** and used as a **restore source** (a researcher legitimately wants to branch new work off a published design); the restore only ever lands in the working copy, never alters the source.

## Consequences

- **Easier:** recovering an earlier design; starting fresh edits from a known-good snapshot; the preview pane gives a way to inspect any version's blocks without leaving the Builder.
- **Harder:** nothing structurally; one new read query + one new write mutation, both on existing paths.
- **Committed to:** restore = overwrite-working-copy semantics; a confirm step before restore (it can discard unsaved work); preview is read-only.
- **Precluded (for now):** git-style multiple mutable tips (Option C); making a frozen version directly editable (Option B). Restore does **not** emit an activity event in V1 (it is a private working-copy edit, not a conscious save); if that proves confusing we can revisit.

## Revisit triggers

- Researchers ask for true branching (multiple concurrent working copies).
- We need an audit trail of restores (e.g. for collaboration), which would mean emitting an event or stamping provenance on the tip.
- Restore-loss complaints despite the confirm — would push us to auto-snapshot the working copy before a restore.

## References

- ADR-0002 / ADR-0004 — versioning + immutable snapshots.
- ADR-0012 (+ 2026-06-04 amendment) — autosave tip = unnumbered Draft; conscious saves are frozen.
- `05_app/server/trpc/routers/studies.ts` — `writeBlocks`, `readBlocks`, `studies.get`, `listVersions`, `saveAsNamed`.
- `05_app/components/feature/builder/versions-panel.tsx` — the surface gaining preview + Restore.
- 06_qa/audit-logs/2026-06-04-v171-polish-deploy.md — the session that surfaced the request.
