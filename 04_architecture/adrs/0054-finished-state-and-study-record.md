# ADR 0054 — Finished state + the Study Record

- **Status:** proposed
- **Date:** 2026-06-18
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** data-model, runtime, product-surface

## Context

A study's life in this tool ends in the Builder: we model draft → preregistered → published (frozen versions, ADR-0044) and the recruitment lifecycle (open/paused/stopped), but there is **no representation of a finished study as a readable, citable artifact**. The consequences, per [finished-studies-and-comparable-discovery](../../01_research/insights/finished-studies-and-comparable-discovery.md): Browse renders raw protocol blocks (no summary, no comparability); "Replicate" can fire on a bare preregistration (you can't replicate a plan); and researchers bounce to OSF, whose archival storage is good but whose reading/comparison UX is weak.

Two prior decisions are in play. ADR-0018 makes a public study forkable and ADR-0039 added replication intent + divergence — but neither defines *what* you are replicating (a finding) or *where a reader reads it*. ADR-0044 froze the version lifecycle but stopped at "published," not "done." We also already have a **drag-and-drop, data-bound section system**: the customizable dashboards (Stream F / N5 — a widget registry + resolvers + a layout table). That is the same interaction and persistence model a Record composer needs.

This ADR decides the **Finished** lifecycle state and the **Study Record** artifact (its model, how it's composed, who sees it, and how Replicate is gated).

## Options considered

### Option A — No finished state (status quo)
- Browse keeps showing protocol blocks; Replicate stays allowed on any frozen version.
- **Pros:** zero work.
- **Cons:** every problem above persists; Browse stays a filing cabinet; replication semantics stay wrong.

### Option B — A `finishedAt` flag + a fully auto-generated read-only Record
- Mark finished; render a fixed-layout page from study data; no authoring.
- **Pros:** simple; comparable (fixed layout); no new editor.
- **Cons:** no abstract / narrative / article link — the human story researchers actually read; can't omit a section that doesn't apply; a paper page that can't carry an abstract is a non-starter.

### Option C — `Finished` state + a composable Study Record (bound + authored sections), reusing the dashboard section machinery (chosen)
- Finishing opens a composer; **bound sections** auto-fill from study data (uneditable content, reorder/show-hide only) and **authored sections** carry abstract/narrative/links/custom content; the layout persists per study.
- **Pros:** comparability (bound skeleton is consistent across studies) *and* the human story; reuses proven drag/add/remove infra; Browse lands on something structured; gives Replicate a real finding to point at.
- **Cons:** a new artifact + migration + a composer surface; must hold the PII line on any public data section.

## Decision

**We will add a `Finished` study lifecycle state and a Study Record: a per-study, composable page of bound + authored sections, built on the existing dashboard section/registry/layout pattern. Browse lands on the Record; Replicate is gated to Finished; Use-as-template covers every other reuse.**

Reasoning: a finished study is a *publication*, not a builder document. Researchers read, cite, compare, and decide-to-replicate against the publication. By assembling it from **consistent bound sections** we get comparability for free; by allowing **authored sections** we get the abstract and narrative that make it a real record; by reusing the dashboard composer we avoid inventing a second drag-and-drop system. Gating Replicate to Finished makes the two reuse verbs honest — **Template** = "borrow this design," **Replicate** = "test this finding."

Mechanics:
- **Lifecycle:** add `experiment.finished_at` (timestamptz, nullable) + `finished_by_user_id`. `Finished` ⇔ `finished_at` is set. Requires closed recruitment + ≥1 completed response. Reversible (reopen clears it); editing the Record does not require reopening.
- **Record model:** a `study_record` row (per experiment) holding `visibility` (`workspace` | `public`), `abstract`, `article_url`/`article_doi`, `published_at`, and a `layout` (ordered list of section instances: `{type, dataRef?, content?, hidden}`). Section *types* live in a server-side **section registry** with resolvers (mirroring `server/.../dashboard` widgets): bound types (`method`, `results`, `data`, `preregistration`, `replications`, `materials`) resolve from existing queries; authored types (`abstract`, `narrative`, `article-link`, `custom`) store content. No participant PII ever resolves into a public section (ADR-0014) — public data sections are aggregate/derived only.
- **Replicate gate:** the Replicate affordance + `studies.fork` precondition require the source to be `Finished` (and public per ADR-0018). Below that, the UI offers **Use as template** only.
- **Visibility:** a public Record requires the study be public-replicable (mirrors Browse's gate) + an abstract. Workspace-only Records are internal.
- **OSF (face vs archive):** the Record is the readable face; OSF holds the citable artifact. We will **push** abstract + links + results summary to the OSF project and **fetch** the article DOI / related identifier back — extending the existing registry adapter. *Exact OSF endpoints (project wiki / metadata / related-identifiers) must be verified against live docs before build* (same discipline as ADR-0005's withdraw/contributors). OSF sync rides with the deferred OSF-OAuth refresh work (see `osf-5-deferred`); the Record ships independently of OSF.
- **Events:** finishing emits a `study_finished` activity event (ADR-0015) to followers of the study/author/tags.

## Consequences

- **Easier:** reading + comparing finished studies; honest Replicate/Template split; a real landing target for Browse; a place for the abstract/article/data to live together.
- **Harder:** a new artifact + migration + a composer surface to maintain; the PII boundary must be enforced per-section for public Records; OSF round-trip adds an integration to verify.
- **Committed to:** Finished as a first-class state; Records assembled from a section registry (reusing dashboard infra); Replicate ⇒ Finished; public data = aggregate only; OSF as archive not face.
- **Precluded:** replicating a non-finished study (use Template); exposing raw participant data publicly; a second bespoke drag-and-drop engine.

## Revisit triggers

- Researchers want **per-study (vs per-section) templates** for the Record layout → add a workspace-default Record layout (mirrors the dashboard-default decision).
- Demand for **embargoed Records** (finished but results hidden until article publishes) → add an embargo field + date.
- OSF endpoints for wiki/metadata prove unworkable → fall back to one-way push of a rendered summary file.
- The section composer outgrows the dashboard widget model → split into its own registry.

## References

- Insight: [finished-studies-and-comparable-discovery](../../01_research/insights/finished-studies-and-comparable-discovery.md).
- Flow: [finish-a-study-and-publish-its-record](../../02_product/user-flows/finish-a-study-and-publish-its-record.md).
- Wireframe: [study-record](../../03_design/wireframes/study-record.md).
- ADRs: 0044 (version lifecycle / make-live), 0018 (cross-workspace forking), 0039 (replication experience), 0015 (activity events), 0014 (PII boundary), 0005 (OSF registry), and the Stream F dashboard customization (widget registry + layout) this reuses.
- Discovery half: [ADR-0055](0055-discovery-and-browse-expansion.md).
