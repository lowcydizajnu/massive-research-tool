# Framework entities

> **Status:** decision note. Records how Frameworks are modelled in **V1** and why the DB-backed entities sketched in [00-core-entities.md](00-core-entities.md) (`Framework` / `FrameworkVersion`) are deferred. Grounds [ADR-0011](../adrs/0011-scaffold-strategy.md) item 9 (seed the Misinformation Research Framework) and the New-study "from Framework" path.
>
> **Date:** 2026-06-02
> **Related:** [ADR-0001](../adrs/0001-modular-composition-theme-overlays.md), [ADR-0002](../adrs/0002-forking-model.md), [ADR-0012](../adrs/0012-block-format-and-autosave-semantics.md), [00-core-entities.md](00-core-entities.md), [05_app/server/frameworks/registry.ts](../../05_app/server/frameworks/registry.ts)

## What a Framework is

Per ADR-0001, a **Framework** is a research tradition's curated kit — a starting composition of blocks (plus, later, schema/measurement/reporting conventions). A researcher starts a study "from a Framework" and gets those blocks pre-populated, then edits freely. ADR-0002 says Frameworks share the experiment forking/versioning model.

## V1 decision — in-repo built-in frameworks (no DB tables yet)

`00-core-entities.md` sketched `Framework` / `FrameworkVersion` as mirrors of Experiment / ExperimentVersion, and explicitly deferred fleshing them out "when a curator publishes a framework." V1 has **no curator-authoring flow** and ships **one** built-in framework, so DB-backed Framework entities would be premature.

**Decision:** V1 ships frameworks as an **in-repo curated registry** (`05_app/server/frameworks/registry.ts`), mirroring the module registry. A framework is:

```ts
type FrameworkDef = {
  key: string;          // e.g. "misinformation"
  name: string;         // "Misinformation Research Framework"
  description: string;
  blocks: { source: string; key: string; version: string; config: Record<string, unknown> }[];
};
```

- `frameworks.list` reads this registry (the New-study modal's Framework picker).
- `studies.create({ kind: "framework", frameworkKey })` copies the framework's `blocks` into the new study's autosave version — each block gets a fresh **ULID** `instanceId` and the framework's preset `config`; `module_version_locks` is derived (per ADR-0012). The block format is identical to a study's, so "create from framework" is a straight copy-with-new-ids.

This keeps the block format single-sourced (ADR-0012) and matches the human-curation reality of V1 (the project owner curates; there is no third-party publishing yet).

## What this defers (and the upgrade path)

When curator authoring / sharing arrives (the deferred ADR in 00-core-entities §Framework), promote to DB-backed **Framework** + **FrameworkVersion** tables (the sketched shape): a Framework is then just an Experiment-like row with `forkable_by`, its versions immutable snapshots, and the in-repo registry becomes the seed for the built-in rows. Because `studies.create` already consumes a `{ blocks }` definition, the swap is "read the framework's current FrameworkVersion.definition_snapshot instead of the in-repo def" — feature-add, not migration of existing studies. Template share-scopes (IA v0.3) and the `Submit to Framework` flow attach at that point.

## Out of scope for V1

- DB-backed Framework/FrameworkVersion rows, curator publishing, framework versioning/forking.
- The Template path in the New-study modal (different concept; stays disabled per the wireframe edge case).
- Theme overlays bundled with a framework (ADR-0001) — the V1 framework is blocks only.
