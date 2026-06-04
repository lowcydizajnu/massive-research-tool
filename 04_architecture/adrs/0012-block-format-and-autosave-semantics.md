# ADR 0012 — Block format and autosave semantics

- **Status:** accepted
- **Date:** 2026-06-02
- **Deciders:** project owner + Claude
- **Tags:** data-model, build, versioning, modules

## Context

The Builder (ADR-0011 MVP item 7) is the authoring surface where a researcher adds, configures, and reorders the blocks that make up a study. To build block editing we have to lock two things that earlier work deliberately left open, plus one mechanical prerequisite:

1. **The shape of a block instance inside `ExperimentVersion.definition_snapshot`.** The core-entities data-model sketch ([00-core-entities.md](../data-model/00-core-entities.md)) explicitly deferred this ("what does a module *instance* look like inside `definition_snapshot`?" — open question 3). The Builder can't render or validate blocks without it.

2. **Autosave vs. immutability.** [ADR-0002](0002-forking-model.md) states that `ExperimentVersion` rows are **immutable** (append-only; `kind` ∈ autosave/named/preregistered/published). But a Builder autosaves on every meaningful edit (title commit, block add, config change, reorder). Appending a brand-new immutable row per edit would explode the table and complicate the "working tip" (`Experiment.current_version_id`) that the whole UI reads from. We need a coherent story for where in-progress edits live relative to the immutable, citable versions.

3. **`Module` / `ModuleVersion` don't exist in the database yet.** They're sketched in the data model but were never migrated (the first migration only created user/workspace/member/experiment/experiment_version). Adding a block requires a real module catalogue to pick from and a real schema to validate against (ADR-0001's schemas-first principle).

This ADR resolves all three. It is a **clarification of ADR-0002, not a reversal**: ADR-0002's immutability guarantee is what makes preregistration and citation trustworthy, and that guarantee is preserved in full for every `kind` that anyone cites — `named`, `preregistered`, `published`. The only thing this ADR changes is the lifecycle of the *one* `autosave`-kind row, which was never a citable artifact.

## Options considered

### Block-instance format

**Option F-A — Opaque JSON blob.** `definition_snapshot` stays untyped; the Builder reads/writes whatever shape it likes.
- **Pros:** zero upfront design; maximum flexibility.
- **Cons:** no validation, no queryability, no shared contract between Builder/runtime/AI/export. Directly contradicts ADR-0001's schemas-first commitment. Every consumer reinvents the shape.

**Option F-B — Typed block array validated against module schemas (chosen).** `definition_snapshot = { blocks: BlockInstance[] }`, each block referencing a module version and carrying a `config` validated against that `ModuleVersion.schema` before write.
- **Pros:** one contract; schemas-first validation per ADR-0001; the existing `module_version_locks` array is derivable from the block set; forward-compatible with the runtime/export/AI consumers.
- **Cons:** a format to maintain and version. Acceptable — it's the load-bearing authoring contract.

### Autosave vs. immutability

**Option A-A — Strict append (a new immutable row per autosave).** Honor ADR-0002 literally; every autosave inserts a new `autosave`-kind version.
- **Pros:** purest reading of immutability; complete keystroke history.
- **Cons:** row explosion (thousands of autosave rows per study); `current_version_id` churns constantly; pruning policy needed immediately; heavy writes for a solo author. The history it captures is noise, not citable units.

**Option A-B — Autosave row is the mutable working tip (chosen).** Each Experiment has exactly **one** `autosave`-kind version that is updated in place; `named`/`preregistered`/`published` are immutable snapshots taken *from* it, never replacing it.
- **Pros:** matches the `current_version_id` "working tip" idea (a Git working directory); cheap writes; the immutable rows are exactly the citable ones, nothing more; small, comprehensible row count.
- **Cons:** softens ADR-0002's "every row immutable" to "every *citable* row immutable." Worth an explicit ADR (this one). Last-write-wins across concurrent tabs (see Consequences).

**Option A-C — A separate `draft` table distinct from versions.** Drafts live in their own mutable table; versions stay strictly immutable.
- **Pros:** keeps the version table 100% immutable.
- **Cons:** duplicates most of the version shape in a parallel entity; two code paths for "the current content"; more migration + sync surface. The autosave `kind` already exists for exactly this role — a second entity is redundant.

## Decision

**We will adopt Option F-B (typed, schema-validated block array) and Option A-B (the single `autosave` version is the mutable working tip; named/preregistered/published are immutable snapshots taken from it).** Concretely:

**Block format.** `ExperimentVersion.definition_snapshot` has the shape `{ blocks: BlockInstance[] }`, where:

```ts
type BlockInstance = {
  instanceId: string;            // ULID — sortable, shorter than UUIDv4, same uniqueness
  source: string;                // module namespace, e.g. "core"
  key: string;                   // module key, e.g. "social-post"
  version: string;               // semver pin, e.g. "1.0.0"
  config: Record<string, unknown>; // validated against ModuleVersion.schema (Zod) before every write
};
```

- `instanceId` is a **ULID**, not a UUIDv4 — lexicographically sortable (creation order falls out for free) and more compact, with equivalent uniqueness.
- `config` is `Record<string, unknown>` at the TypeScript boundary and is **always validated against the referenced `ModuleVersion.schema` (Zod) before it is written**, per ADR-0001. The DB column stays `jsonb`; the integrity guarantee is an app-layer guard at the write boundary (a Postgres CHECK can't run Zod), with the option of a coarse structural CHECK later. Invalid block config is rejected at write time, not stored-and-flagged.
- The existing `ExperimentVersion.module_version_locks` array is the **derived** set of distinct `(source, key, version)` triples across `blocks` — kept in sync on every write so the version remains self-describing.

**Autosave semantics (clarifying ADR-0002).**

- **One-autosave-per-Experiment invariant.** Every Experiment has exactly one `kind = autosave` ExperimentVersion. It is the **working tip** and is updated in place as the researcher edits (block add/remove/reorder, config changes). `studies.create` already produces this v1 autosave row.
- **`current_version_id` points to the autosave row during editing.** Viewing a historical snapshot is a read concern that renders that snapshot without moving the tip — `current_version_id` is not repointed to view history.
- **Named/preregistered/published branch off the autosave; they never replace it.** "Save as named" copies the autosave's `definition_snapshot` + `module_version_locks` into a **new immutable** `named` row (its own `version_number`); the autosave row continues to be edited afterward.
- **Preregistration sits on top of mutability cleanly.** Preregister **snapshots** the current autosave into a new immutable `preregistered` row; the autosave continues unchanged. Amendments still follow [ADR-0004](0004-preregistration-amendments.md): a new `preregistered` row with `supersedes_version_id` + a required `change_summary` — never an edit to an existing preregistered row. Immutability for `preregistered`/`published` is absolute, exactly as ADR-0002 requires.
- **Framing.** The autosave-mutable row is the working directory; `named`/`preregistered`/`published` snapshots are the commits — the citable, immutable units. ADR-0002's guarantee that *citable* history is immutable is preserved in full.

**Module catalogue.** The `Module` + `ModuleVersion` tables are migrated **in the same change as this ADR** (a data-model entry — `02-module-entities.md` — lands alongside, not as a separate task), and the migration **seeds two core modules** that the Builder and the verification page already reference:

- `core/social-post@1.0.0` — the misinformation stimulus block from the Builder wireframe.
- `core/likert-7@1.0.0` — a 7-point Likert manipulation-check block.

Seeding these means the forthcoming failing Hanna-loop e2e ("add 2 blocks") has real modules to compose.

## Consequences

**What becomes easier.**
- The Builder has one block contract to render, validate, reorder, and persist; the runtime/export/AI consumers inherit it.
- Autosave is a cheap in-place update; no pruning policy needed for V1.
- The citable units (`named`/`preregistered`/`published`) are exactly the immutable rows — clean for OSF push (ADR-0005) and citation.
- ULID `instanceId`s sort by creation order without a separate ordering column.

**What becomes harder.**
- One more contract to version (the block format) — changes to it are migrations of `definition_snapshot`.
- Validation must run at every write boundary (server-side, against `ModuleVersion.schema`); a bug there could persist invalid config. Mitigated by it being a single choke point in the block-write mutation.

**What we are now committed to.**
- Exactly one `autosave` version per Experiment, updated in place; all other kinds immutable and snapshotted from it.
- `definition_snapshot = { blocks: BlockInstance[] }` with ULID ids and schema-validated `config`.
- `module_version_locks` kept in sync as the derived triple set.
- `Module`/`ModuleVersion` tables + the two seeded core modules shipping with this decision.

**What we are now precluded from.**
- Editing a `preregistered`/`published` row in place (amendments only, per ADR-0004).
- Storing block config that fails its module schema (rejected at write, never stored-and-flagged).
- Treating autosave rows as citable history.

**Known trade-off — block-edit concurrency (V1: last-write-wins).** Because the autosave row is mutable, two tabs editing the same study race on it: the last write wins and can silently clobber the other. This is acceptable for V1 — the `build-a-study` flow and the postdoc-operator persona are single-author, and the flow's failure modes don't include concurrent multi-tab editing. If multi-tab/multi-author editing becomes real, the V1.5 fix is **optimistic concurrency**: a monotonically increasing edit counter on the autosave row, with writes rejected on a stale counter (and eventually Liveblocks-backed presence per ADR-0007). Noted here so the trade-off is a recorded decision, not an accident.

## Revisit triggers

- **Concurrent editing becomes common** (multi-tab clobbers reported, or real-time collaboration is scheduled) → add the optimistic-concurrency counter, then Liveblocks.
- **Autosave history is wanted** (users ask to roll back to an arbitrary mid-edit point) → reconsider periodic autosave snapshots or an edit log.
- **The block format needs to express things the flat array can't** (nested blocks, conditional branches/logic beyond a config field) → version the block format and migrate snapshots.
- **A non-`core` module source arrives** (the plugin path, ADR-0008) → confirm `source` + the validation choke point generalize to plugin-provided schemas.

## References

- [ADR-0001](0001-modular-composition-theme-overlays.md) — module identity (`source/key@version`), schemas-first validation (the contract this block format honors).
- [ADR-0002](0002-forking-model.md) — the immutable-versioning model this ADR clarifies (autosave = mutable working tip; citable kinds stay immutable).
- [ADR-0004](0004-preregistration-amendments.md) — amendment mechanism preserved on top of autosave mutability.
- [ADR-0005](0005-osf-integration.md) — OSF push consumes the immutable preregistered snapshots.
- [ADR-0011](0011-scaffold-strategy.md) — the Builder (item 7) + module-catalogue MVP slice this enables.
- [00-core-entities.md](../data-model/00-core-entities.md) — ExperimentVersion (`definition_snapshot`, `module_version_locks`, `kind`) + open question 3 this resolves.
- `02-module-entities.md` — Module/ModuleVersion data-model entry, landing in the same change.
- `03_design/wireframes/build-stage-builder-mode.md` — the Builder surface that renders blocks.
- `02_product/user-flows/hanna-build-a-study.md` — single-author flow + failure modes informing the LWW trade-off.

---

## 2026-06-04 amendment — `versionNumber` semantics

V1.7.0's first real session surfaced a confusion: a researcher's first Preregister showed "v3", because `versionNumber` was `max(existing) + 1` across **all** kinds — so the autosave working tip was v1, and any prior conscious save bumped from there. "v3" was technically "the 3rd ExperimentVersion row of any kind", which doesn't match the user's mental model of "my versions".

**Amendment:** version numbering counts **conscious saves only**.

- The **autosave** working tip is the unnumbered **Draft** — `versionNumber = 0` (chosen over `null` for simpler ordering + `> 0` checks; semantically "before v1").
- `named` / `preregistered` / `published` snapshots number from **1**, computed as `count(versions WHERE kind IN (named, preregistered, published)) + 1` — **count, not max+1**, so a future deletion can't leave a gap that skips a number (nothing is deleted today; the semantics are just cleaner).
- UI labels by kind: Draft (no number) · `v{n} — {name}` (named) · `Preregistration v{n}` · `Published v{n}`. The Builder header renders "Draft" when `versionNumber === 0`; a Versions sub-tab lists the full history.

**Migration:** existing production rows are **not** backfilled — a handful of pre-amendment studies keep their old numbers (autosave=1, first conscious save=2, …). The Versions sub-tab labels every row by kind, so the one-off offset reads clearly rather than as a mystery. New studies number cleanly from the Draft.

Implemented in V1.7.1: `server/trpc/routers/studies.ts` (`nextVersionNumber()` helper at `saveAsNamed` / `saveAndRequestReview` / `preregister` / `publish`; autosave init `versionNumber: 0` in `create` + `fork`).
