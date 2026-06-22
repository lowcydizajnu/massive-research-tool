# ADR 0063 — Workspace-level templates

- **Status:** accepted
- **Date:** 2026-06-22
- **Deciders:** Project owner, Claude
- **Tags:** library, templates, data-model, reuse, activity

## Context

> What is forcing this decision?

The Library destination (V1.13.0) shipped a five-tab shell where only **Modules**
has content. The Library-completion handoff fills the rest; **Templates** lands
first because it also covers the hole left by removing the **Frameworks**
destination (L2): researchers need a place to start a new study from a curated,
known-good skeleton. Today the only reuse primitive is `studies.fork` (ADR-0018) —
cross-workspace replication of a *public, finished* study — which is about
scientific replication, not "give me a starting point."

A Template is a **named, curated artifact** with its own metadata (description,
tags, cover image, use-count, visibility) that points at a **frozen** version of a
source study. It must survive the source study continuing to evolve, be shareable
at three scopes (private / workspace / public), and clone into a new study using
the mechanism we already trust. Constraints in play: ADR-0018 (fork = the clone
engine), ADR-0012 (versions/snapshots — the frozen reference), ADR-0015 (activity
events), ADR-0017 (tag slugs), ADR-0003 + V1.40 (R2 `ws/` namespace for the cover).

This ADR locks the Templates data model + the save/use flows. It is the L1 gate of
the handoff and is paired with the user flow *Use and save templates* and three
wireframe specs (templates tab / template detail / save-as-template modal).

## Options considered

> ### Option A — A `workspace_template` table referencing a frozen `experiment_version`, cloned via `studies.fork` (chosen)

- A new `workspace_template` row carries the curated metadata and FKs a
  `source_experiment_id` + `source_version_id`. "Save as template" first freezes
  the working tip with the existing `studies.saveAsNamed` (a `named` version), then
  writes the row against that version. "Use template" calls `studies.fork` on the
  frozen version into the caller's active workspace, increments `use_count`, and
  emits `template_used`. `share_scope` (private/workspace/public) gates visibility;
  `starter BOOLEAN` marks app-shipped templates (the L2 Misinformation migration).
- **Pros.** Reuses the fork engine wholesale (snapshot/blocks/conditions/theme,
  instanceIds preserved); the template is decoupled from the source study's edit
  lifecycle (frozen version); metadata lives where it belongs; three visibility
  scopes fall out of one column; no new clone logic to test or drift.
- **Cons.** Two writes on save (freeze version + insert row) need sensible ordering
  so a failed insert doesn't strand a stray named version; a denormalized
  `use_count` to keep honest; public templates need a discovery surface (we reuse
  Browse, not a new marketplace).

> ### Option B — An `is_template` boolean on `experiment`

- Flag a study as a template in place.
- **Pros.** No new table.
- **Cons.** Conflates the template (a frozen, curated artifact) with the living
  study — editing the study would mutate the "template"; no home for
  description/cover/use-count/visibility without bloating `experiment`; "use" would
  still need a copy step anyway. Rejected — the handoff explicitly calls this out.

> ### Option C — Keep Frameworks (the in-code `FRAMEWORK_REGISTRY`) and skip Templates

- Leave curated starting points as code-defined frameworks.
- **Pros.** Zero build.
- **Cons.** Researchers can't create their own; frameworks are code-only (no
  user authoring, no per-workspace curation); the Library Templates tab stays
  empty; the IA keeps a redundant top-level destination. Rejected — Templates is
  the user-authorable successor (and L2 removes Frameworks).

## Decision

> A single, declarative sentence.

**We will add a `workspace_template` table that pins curated metadata to a frozen
`experiment_version`; "Save as template" freezes the working tip via
`studies.saveAsNamed` then inserts the row, and "Use template" clones that frozen
version with the existing `studies.fork` engine into the caller's workspace —
with a `share_scope` (private/workspace/public) visibility model, a `starter` flag
for app-shipped templates, a denormalized `use_count`, and `template_published` /
`template_used` activity events.**

Reasoning: the only genuinely new thing is the *curated artifact* — its metadata
and its frozen pointer. Cloning and versioning already exist and are trusted, so
Templates is mostly a thin table + two thin procedures over `fork` and
`saveAsNamed`. Freezing a named version is what makes a template stable while its
source study keeps moving; referencing that version (not the study) is what keeps
the two lifecycles independent.

### Decisions locked

- **Freeze-then-write ordering.** `templates.create` calls `saveAsNamed` first,
  then inserts the row in the same request; if the insert fails, the stray named
  version is acceptable (it's a legitimate checkpoint the researcher can ignore) —
  we do **not** attempt a cross-concern rollback. Documented so it isn't "fixed"
  later by accident.
- **Orphan-safety / deletes.** `templates.delete` is a **soft delete**
  (`deleted_at`) so use-history and any in-flight detail views degrade gracefully;
  deleting a template never touches studies already cloned from it (fork made
  independent copies).
- **Visibility.** `private` = author workspace only; `workspace` = all members of
  the author's workspace; `public` = any workspace may use it (discovered via the
  existing Browse destination filtered to templates — **no** separate marketplace
  in this scope). `starter=TRUE` templates are public + app-owned and non-deletable
  by other workspaces.
- **No template-internal versioning.** A template freezes one source version. "v2"
  is a new template row against a newer source version.
- **Cover image** lives in the `ws/` (public-readable) R2 namespace via the existing
  presign path; only the R2 key is stored.

## Consequences

> - **What becomes easier.** Researchers curate and reuse their own study
>   skeletons; the Frameworks hole is covered by user-authorable Templates; the
>   Library Templates tab has real content; future Library tabs follow this
>   table + thin-router pattern.
> - **What becomes harder.** A denormalized `use_count` to maintain; a second
>   write on save to order carefully; public-template discovery rides Browse and
>   must stay coherent with it; soft-delete adds a `deleted_at` filter everywhere
>   templates are listed.
> - **What we are now committed to.** Templates reference frozen versions (never a
>   moving draft); cloning goes through `studies.fork` (no parallel clone path);
>   visibility is the three-scope model; `starter` templates are app-owned/public.
> - **What we are now precluded from (for now).** Editing a template's content
>   in place; template-internal version history; a dedicated public-template
>   marketplace surface (Browse covers it).

## Revisit triggers

> Conditions under which we reopen this.

- Demand for a dedicated public-template **marketplace** (ranking, curation,
  install counts across workspaces) beyond Browse → its own surface + ADR.
- Researchers want **template versioning** (track a template across source
  revisions) → add a lineage/version column set.
- The freeze-then-write stray-version behaviour confuses users → make
  `templates.create` transactional or reference an existing unchanged named version.
- Cross-workspace **shared** (not public) templates (org-level libraries) → needs
  a sharing/ACL model + privacy review (deferred, V2.x).

## References

> - Links to relevant code, prior ADRs, external docs.

- Handoff: `04_architecture/handoffs/code-tab-library-completion.md` (§L1, §L2).
- User flow: `02_product/user-flows/use-and-save-templates.md`.
- Wireframes: `03_design/wireframes/library-templates-tab.md`,
  `library-template-detail.md`, `builder-save-as-template-modal.md`.
- ADRs: [0018 cross-workspace forking](0018-cross-workspace-forking.md) (the clone
  engine), [0012 block format & autosave](0012-block-format-and-autosave-semantics.md)
  (versions/snapshots), [0015 notifications, comments & activity](0015-notifications-comments-activity.md)
  (template_published / template_used), [0017 study-level tags](0017-study-level-tags.md),
  [0003 asset storage](0003-asset-storage.md) (+ V1.40 `ws/` namespace for covers).
- Code touchpoints: `server/db/schema.ts` (`workspace_template`); a new
  `server/trpc/routers/templates.ts` (list/get/create/useTemplate/update/delete)
  registered in `server/trpc/root.ts`; `studies.fork` + `studies.saveAsNamed`
  (reused, unchanged); `server/events/types.ts` (+2 event types);
  `components/feature/builder/save-version-dialog.tsx` neighbour (Save-as-template
  modal); `app/(app)/(workspace)/library/` (Templates tab + detail).
- **L2 note (for the Frameworks-removal stream):** Frameworks today is an in-code
  `FRAMEWORK_REGISTRY` (`server/trpc/routers/frameworks.ts`), **not** seeded
  `experiment` rows — so the handoff's "reference the framework's study/version"
  migration must first *materialize* the Misinformation framework as a real
  study+version in a starter workspace before a `workspace_template` can point at
  it. Captured here so L2 doesn't assume a non-existent experiment row.
