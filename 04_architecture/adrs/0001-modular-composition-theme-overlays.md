# ADR 0001 — Adopt versioned modular composition with theme overlays

- **Status:** accepted
- **Date:** 2026-05-27
- **Deciders:** project owner (with Claude as collaborator)
- **Tags:** data-model, modular-composition, theme-overlays, forking, ai-readiness

## Context

The product is positioned as "Qualtrics + GitHub for research" — a survey/experiment builder with first-class transparency, replication, and forking mechanics (see `02_product/product-brief.md` §1). It must support a wide range of question types and artifacts (standard items, media, social-media-post artifacts, chatbot turns, etc.) and let users compose them into experiments at multiple levels of complexity.

Product-brief decision §6 establishes that **thematic spaces (e.g., Misinformation) are composable overlays on a single underlying "everything" space**, not separate products. Users start from the default everything-space, pick a preset theme, or build their own custom space from modules.

This decision shapes:

- The data model (how modules and themes are identified, stored, evolved).
- The editor and runtime (what gets shown, configured, executed).
- The forking model (ADR-0002 to follow) — forks must reference exactly what they were built from, so a replication is genuinely a replication.
- The AI plug-in architecture (ADR-0005 to follow) — AI surfaces (authoring assist, article-to-procedure extraction) need a stable contract to target.
- Any future plugin / extension surface (ADR-0007, deferred).

Project owner's stated priorities for this decision: **maximum architectural flexibility, data integrity across versions, fork-and-follow safety**. Time-to-ship and maintenance overhead are explicitly *not* the optimization target here. Curator-only model (no third-party plugin marketplace at MVP) per product-brief §4.

## Options considered

### Option A — Config-driven theme bundles (everything in core, no extension path)

All modules live in the core codebase. A theme is a structured config file declaring which modules are visible, with what defaults, what curated frameworks ship with the theme, what helper widgets to expose, and what layout hints to apply.

- **Pros.** Simplest to ship and reason about. Adding a theme = adding a config + content, no code change. All modules share quality, performance, and security properties. One deploy, one test suite.
- **Cons.** Themes cannot add new module *types*. A future clinical-trials theme that needs a "consent revoke checkpoint" module forces a core-code change. Data model assumes "all modules are core" — locks out extensibility without a painful migration. Does not future-proof for the fork-and-follow integrity requirements: if module identities are bare keys (`social-post` rather than `core/social-post@1.0.0`), then a core change to `social-post`'s schema breaks every fork in flight.

### Option B — Plugin architecture with theme bundles

Core platform exposes well-defined extension points (slot APIs, lifecycle hooks). Modules are plugins registering against those points. Themes bundle plugins + configuration. Third-party authors can eventually contribute plugins.

- **Pros.** Themes can add new module types without core releases. Long-term, opens the door to third-party module authors per subfield.
- **Cons.** The plugin API itself becomes a product — sandboxing, versioning, dependency resolution, security review, discovery/installation UX, updates. At V1 this is months of engineering with no real third-party plugin author to design for (curator-only model). Plugin quality becomes our problem to enforce.

### Option C — Config-driven now, plugin-ready data model (chosen)

V1 behavior is identical to Option A: all modules in core, themes are config bundles. But the *data model* is designed so that the module registry can later load modules from sources other than core (e.g., a plugin registry) without painful migration. Module identity is a stable triple (`source/key@version`), schemas are first-class artifacts, themes are pure-functional overlays.

- **Pros.** Ships at Option A speed and complexity. Forward-compatible with the plugin path (ADR-0007 deferred). Versioning + schemas-first directly support the fork-and-follow safety requirement and the AI plug-in readiness.
- **Cons.** Requires upfront design discipline (every module change = a version bump; every module declares a formal schema). Slightly larger data footprint (storing source/key/version triples instead of bare keys). Real risk: claim "plugin-ready" without actually being so. Mitigated by a small plugin-readiness checklist below.

## Decision

**We will adopt Option C: versioned modular composition with theme overlays.** Modules are atomic units (question type / artifact, not survey blocks or whole protocols); blocks compose modules; frameworks are curated content separate from the module system. Themes are pure-functional overlays — they filter, group, and configure modules but never mutate them.

The five load-bearing principles:

1. **Module identity is a stable triple: `source/key@version`.** For V1, `source` is always `core`. Example: `core/social-post@1.0.0`. Keys are kebab-case; versions follow semver semantics. Every module change that affects data shape requires at least a minor version bump; every breaking change requires a major version bump.
2. **Module schemas are first-class artifacts.** Every module declares its data shape formally (Zod or JSON Schema). The platform validates module data against the declared schema on read and write. Schema definitions ship inside the module and are versioned alongside it.
3. **Themes are pure-functional overlays over the module registry.** A theme declares: which modules are visible, default configurations, layout/grouping hints, curated frameworks (separate content), and theme-specific helper widgets. A theme never modifies a module's behavior or schema. Adding, removing, or swapping a theme cannot affect underlying experiment data.
4. **Forks reference module versions explicitly.** When experiment A is forked into experiment B, B records the exact `source/key@version` for every module in use. If `core/social-post` later moves from v1 to v2 with a breaking change, B continues to run on v1 (with v1's schema, v1's runtime behavior). Migration to v2 is an opt-in action with an explicit migration step.
5. **The module registry interface is plugin-ready.** The registry's contract is "given a `source/key@version`, return a module definition." For V1 the only registered source is `core` (loaded from the codebase). The interface does not assume this is the only source. Adding a new source later (e.g., `plugin:foo`) is a registry-loading change, not a data migration. This is the deferred plugin path (ADR-0007).

### Module granularity (confirmed)

| Concept | Definition | Example |
| --- | --- | --- |
| **Module** | An atomic question type or artifact. Versioned. Schema-bound. | `core/social-post@1.0.0`, `core/likert-scale@1.0.0`, `core/video-clip@1.0.0` |
| **Block** | An ordered composition of modules with optional logic between them. Not separately versioned; lives inside an experiment definition. | A "manipulation block" consisting of 3 social-post modules followed by 2 likert-scale modules |
| **Framework** | A curated, named, reusable composition of blocks. Lives in the framework library; versioned. | "Two-sided misinformation exposure with attitude shift measurement," authored by a scholar with a published article |
| **Theme** | A pure overlay declaring visible modules, defaults, layouts, curated frameworks, helper widgets. | Default theme (everything), Misinformation theme, custom user theme |

### Plugin-readiness checklist (the small upfront investment)

Future contributors grade themselves against this:

- [ ] Every module identifier is written as `source/key@version`, never bare.
- [ ] The module registry has no hardcoded `source == "core"` check outside of the loader.
- [ ] Every module ships a formal schema; the platform validates on read and write.
- [ ] No theme code path mutates a module — themes only read.
- [ ] Forks store the version triple they were created against; the runtime resolves them.
- [ ] The data model has no field that would need to be widened to accommodate a non-core source.

## Consequences

**What becomes easier:**

- Themes ship as config + content, never code releases.
- AI plug-in surfaces (authoring assist, article-to-procedure extraction) have a clean, stable contract: generate JSON validated against a module schema.
- Forks reproduce experiments faithfully even after the underlying modules evolve.
- New module types can be added without breaking existing experiments (because old ones lock to old versions).
- The plugin path (ADR-0007) becomes a layering decision later, not a migration.

**What becomes harder:**

- Every module change requires a version bump and an explicit migration story for old data. No "just change the schema."
- Module schemas must be formally defined up front (Zod or JSON Schema). Quick-and-dirty modules are not allowed.
- Slightly larger data footprint per experiment (storing source/key/version triples instead of bare keys).
- Discipline cost: contributors must understand and follow the versioning + schema rules. The plugin-readiness checklist exists to make this enforceable in review.

**What we are now committed to:**

- The module identity model (`source/key@version`) is permanent across all data.
- Themes can never mutate modules — they can only configure and filter.
- Forks always carry their module-version lineage.
- Every module has a formal schema.

**What we are now precluded from:**

- "Quick hack" modules without schemas.
- Themes that override module behavior (only configuration is allowed).
- Forks that lose lineage to their parent or their module versions.
- Module changes that silently break existing data.

## Revisit triggers

Reopen this decision (probably as a superseding ADR) if any of these become true:

- A genuine third-party plugin author appears, and the deferred plugin path needs to be made real. Triggers ADR-0007.
- Module-version proliferation becomes operationally painful (hundreds of versions across modules). May need to introduce version compatibility ranges or default-latest semantics with explicit pinning.
- The schemas-first discipline turns out to materially slow rapid experimentation in V1 (unlikely given stated priorities, but possible).
- The product evolves away from "one tool with overlays" toward "many small specialized products," in which case this ADR would be superseded.
- Cross-source module references (e.g., a community-plugin module embedded in a core-curated framework) become common enough to need a formal trust/attribution model. Triggers ADR-0007 + a new ADR on trust.

## References

- `02_product/product-brief.md` §6 (themes as composable overlays — the originating decision).
- `02_product/product-brief.md` §1 (positioning: Qualtrics + GitHub for research — the wedge this serves).
- `02_product/personas/principal-investigator.md` ("headroom for complex designs" + replication-friendly workflow).
- `STACK.md` (the React Flow / node-graph substrate that hosts module composition).
- `00_meta/rules/architecture.md` (the node-graph section: "the graph is a data structure, not a UI tree" — this ADR formalizes that for modules).
- ADR-0002 (forking model, to be written next — depends on this ADR's module-version contract).
- ADR-0005 (AI plug-in architecture, to be written later — depends on the schemas-first principle).
- ADR-0007 (plugin model, deferred — depends on the plugin-ready data model from this ADR).
