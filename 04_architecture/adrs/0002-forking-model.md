# ADR 0002 — Adopt snapshot-based forking, pull-from-upstream deferred

- **Status:** accepted
- **Date:** 2026-05-27
- **Deciders:** project owner (with Claude as collaborator)
- **Tags:** data-model, forking, versioning, replication, preregistration, openness

## Context

The product's wedge is "Qualtrics + GitHub for research" (`02_product/product-brief.md` §1). The forking model is the GitHub side of that wedge — it determines whether replications can actually be replications, whether protocols can be derived from each other while preserving lineage, and whether preregistration has the immutability it requires to mean anything.

The forking model also has to respect ADR-0001's commitments: module identity is `source/key@version`, module schemas are first-class, themes are pure overlays, and the data model is plugin-ready. A fork that doesn't honor module version locks would silently break replications when a module evolves. A fork without lineage would lose the "GitHub for research" affordance.

Two related concepts converge here:

- **Preregistration** (open-science workflow) — a researcher needs to freeze and label a moment-in-time version of their experiment that they then publish, register on OSF, or cite in a paper. The frozen version must be immutable and reproducible indefinitely.
- **Forking** (derivation) — Alice creates a new experiment based on Bob's, either to replicate it exactly or to build upon it. The fork must capture exactly what Bob had at fork time.

Both require the same primitive: **an immutable, identifiable point in an experiment's history**. The design question is whether to build that primitive once and use it for both, or build two parallel concepts.

Project owner's pre-commitment for this decision: **the simplest viable forking model that still gives replication-grade integrity**, with explicit room to upgrade to the full model quickly when needed.

## Options considered

### Option A — Copy-and-fresh-fork (no upstream tracking)

When Alice forks Bob's experiment, the system performs a deep copy. The fork records `forked_from_experiment_id`, `forked_at`, and an embedded snapshot of the parent's state at fork time. No ongoing connection. Preregistration is a separate concept built separately.

- **Pros.** Cheapest implementation. Replication integrity comes for free from ADR-0001's module version locks plus the embedded snapshot.
- **Cons.** No pull-from-upstream path. Preregistration ends up duplicating the snapshot infrastructure as a parallel concept. "Pull from upstream" later would require retrofitting the data model.

### Option B (full) — Versioned snapshots + forks that can pull from upstream

Every experiment has a history of immutable versions (autosave snapshots + named/preregistered versions). A fork is a new experiment that references a specific parent version. After fork, the fork owner can optionally pull from newer parent versions.

- **Pros.** Preregistration is native (it's just a named version). Forks reference a specific point in parent history. "Pull from upstream" is supported as a first-class workflow. Strong alignment with the GitHub-for-research wedge.
- **Cons.** Pull-from-upstream is the genuinely hard piece (merge semantics over experiment definitions, UX for conflict resolution). Not needed for V1; risks scope creep if built up front.

### Option B (stripped) — Versioned snapshots + simple forks, no pull-from-upstream (chosen)

Same data model as full B, but V1 ships **without** the pull-from-upstream UX or merge mechanics. A fork captures a specific parent version at fork time and proceeds independently. Pull-from-upstream is a layering decision later — the data model is ready for it.

- **Pros.** Snapshot infrastructure is built once and shared between forking and preregistration (no parallel concepts). The V1 implementation cost is barely above Option A — one extra table. Forward-compatible with the full upstream-tracking model.
- **Cons.** Marginally more data model than A (an extra table, version numbers per experiment). Snapshot-frequency policy needs deciding (autosave + named is the recommendation).

### Option C — Git-like branch-with-merge-back

Full Git semantics — branches, commits, pull requests, merges over experiment definitions.

- **Pros.** Maximum power and flexibility long-term.
- **Cons.** Merge semantics over experimental designs (which are node graphs) are an unsolved problem. The PR-review workflow is novel for researchers — adoption risk. Months of engineering before V1 ships. Most of the value is captured by stripped B + comments/suggestions, without the merge complexity.

## Decision

**We will adopt Option B (stripped): snapshot-based forking, with pull-from-upstream and merge-back deferred.** The data model is identical to full B; only the upstream-sync UX and merge logic are out of V1 scope. The architecture is contractually ready for the full upgrade — see the **Forward-readiness checklist** below.

### The eight load-bearing principles

1. **Every experiment has an immutable version history.** Versions are append-only. The "live" working state is just the latest version (or a draft being edited on top of it).
2. **Versions have a kind:** `autosave`, `named`, `preregistered`, `published`. The kind drives UX (named and preregistered versions are surfaced to users; autosaves are background safety net). Kinds can be added later without migration.
3. **Every version captures the full module-version lock set** (per ADR-0001). A snapshot is self-describing: any future runtime can reproduce it exactly as long as the referenced module versions are still resolvable.
4. **A fork is a new experiment whose lineage points to a specific parent version**, not to "Bob's experiment in general." `forked_from_version_id` is required; the parent version is immutable, so the lineage is permanent and meaningful.
5. **After fork, the fork is fully editable.** The lock is a baseline, not a cage. Alice can add modules, upgrade module versions, change configurations — anything. The lineage record preserves what she started from; her edits show as her own versions in her experiment's history.
6. **Participant data is never copied across forks.** Consent and IRB boundaries forbid it. A fork starts with zero responses. The lineage record carries protocol structure and module versions, never participant-identifying data.
7. **Forkability is a permission on the parent.** Default for V1: **public experiments are forkable; private experiments are not.** Owner can override per experiment (`forkable_by`: `public` / `link-only` / `private`). Public-forkable is the open-science default and the wedge requires it; opt-out covers IRB-restricted studies.
8. **Frameworks (curated content) use the same forking model.** Same snapshot mechanism applied to the framework artifact type. A scholar's published framework can be forked and adapted; the lineage record cites the source.

### Forward-readiness checklist (the contract for upgrading to full B)

Future contributors grade themselves against this. If all are true, upgrading to full B (pull-from-upstream, eventually merge-back) is a feature-add, not a migration.

- [ ] `experiment_versions` table exists from day one, append-only, immutable.
- [ ] Every save creates an autosave version row; named versions are an explicit user action.
- [ ] `experiment.fork_of_version_id` is a foreign key to `experiment_versions.id` (specific version), never to `experiments.id` alone.
- [ ] Module version locks are stored *inside* each `experiment_version`, not on `experiments`. The lock set is part of the immutable snapshot.
- [ ] Forks can read their parent's full version history (subject to permissions). This is what enables future "newer version available" prompts.
- [ ] Version `kind` is an enum; new kinds (`upstream-pulled`, `merge`) can be added without schema change.
- [ ] The data model has no field that assumes "this experiment has exactly one parent" — leave room for merge nodes with multiple parents later.
- [ ] No code path treats `forked_from_version_id` as immutable after fork creation (a future "rebase fork onto newer parent version" feature will need to update this).

### Snapshot frequency policy

- **Autosave:** every meaningful save creates a version row (debounce as needed for performance). Background; not surfaced to user as separate entries by default.
- **Named:** explicit user action ("Save as a named version"). Required name and optional description.
- **Preregistered:** subset of named, marked by integration with OSF or by user action ("Mark as preregistered"). Cannot be edited or deleted.
- **Published:** subset of named, marked when an experiment is publicly released. Cannot be edited or deleted.

Storage is JSONB; rows are cheap. Pruning of old autosave versions is a V2 optimization, not a V1 concern.

### Sketch of the V1 data model

Concrete enough to ground the ADR; full entities live in `04_architecture/data-model/` (to be drafted next).

```
experiment
  id, owner_id, title, description, current_version_id,
  forkable_by ('public' | 'link-only' | 'private'),
  fork_of_experiment_id (nullable), fork_of_version_id (nullable),
  created_at, updated_at

experiment_version
  id, experiment_id, version_number, kind ('autosave' | 'named' | 'preregistered' | 'published'),
  name (nullable), description (nullable),
  definition_snapshot (JSONB — full experiment definition including module-version locks),
  created_at, created_by

  -- immutable; only INSERT, never UPDATE or DELETE

-- Participant data lives in separate tables (responses, sessions, etc.)
-- and is never referenced from forks. Fork creation does not touch participant tables.
```

## Consequences

**What becomes easier:**

- Preregistration is one line of UX: "mark this version as preregistered."
- Replications run faithfully because snapshots are self-describing + ADR-0001 locks modules.
- Forks carry meaningful lineage (specific parent version, not vague "as of fork time").
- "What did this experiment look like when it was published?" is always answerable.
- Pull-from-upstream becomes a feature-add, not an architectural rewrite, when needed.

**What becomes harder:**

- Every save creates a version row — storage grows. Acceptable at the projected scale; pruning policies become a V2 conversation if storage costs warrant.
- Snapshot frequency policy adds a small surface area of UX decisions (when do autosaves happen, what does "name a version" feel like, how is preregistration triggered).
- More data model than the minimum — an extra table and several foreign keys.

**What we are now committed to:**

- Experiments have a version history; versions are immutable; references between artifacts are version-specific.
- Forks always reference a specific parent version (never a parent in the abstract).
- Participant data never crosses fork boundaries.
- Frameworks share the forking model.
- The data model leaves room for multi-parent (merge) and rebased forks without schema change.

**What we are now precluded from:**

- "Just edit the experiment" mutability — every change is a new version.
- Forks that lose lineage to a specific parent version.
- Forks that smuggle participant data across consent boundaries.
- Schema-level assumptions that an experiment has exactly one parent.

## Revisit triggers

Reopen this decision (as a superseding ADR) if:

- Pull-from-upstream becomes a top user request — triggers ADR-00XX adding upstream sync to forks. Should be a feature-add, not a migration, if the forward-readiness checklist held.
- Merge-back / PR-style collaboration becomes evident as a real need — triggers a separate ADR on merge semantics over experiment definitions. This is the genuinely hard piece deferred from Option C.
- Storage growth from per-save autosaves becomes operationally painful — triggers a snapshot-pruning ADR.
- Researchers find the "named version" UX confusing or skip it — triggers a UX rethink, possibly auto-naming heuristics.
- The product evolves toward a single-tenant or low-collaboration model where forking doesn't earn its complexity — would supersede this entire ADR.

## References

- ADR-0001 — modular composition + theme overlays — provides the `source/key@version` module identity model that snapshots depend on.
- `02_product/product-brief.md` §1 (positioning), §2 (open-science workflow), §6 (theme overlays).
- `02_product/personas/principal-investigator.md` ("open-science workflow as built-in path," "easy international collaboration," replication-friendly export).
- `00_meta/rules/architecture.md` (multi-tenancy rules — forks honor tenant boundaries; participant-data isolation).
- Future: ADR-0003 (asset storage — assets attached to versions inherit the same immutability rules).
- Future: ADR-0004 (OSF integration — preregistration uses the named/preregistered version primitive defined here).
- Future ADR — Pull-from-upstream — layers on top of this ADR when triggered.
- Future ADR — Merge semantics for experiment definitions — required only if Option C territory is ever entered.
