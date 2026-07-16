# ADR 0102 — Link reported outcomes back to the preregistered plan

- **Status:** accepted
- **Date:** 2026-07-15
- **Deciders:** project owner
- **Tags:** data-model, study-record, preregistration, discovery

## Context

The OSF "Lifecycle Open Science" review (insight [los-alignment-and-templates](../../01_research/insights/los-alignment-and-templates.md), Round 2 item ⑥) scored **REPORT** as "great surface, missing the link-back": *"outcomes don't link back to the plan (prereg section is a one-liner), no planned-vs-exploratory / deviations reporting, amendments invisible publicly."* LOS's whole claim is that Plan → Produce → Report are **connected**; a citable record that never says which of its findings were predicted is the disconnect.

Both halves of the link already exist and are simply not wired together. The **plan** side landed in [ADR-0101](0101-preregistration-templates-typed-fields.md): typed `hypotheses[]`, `expectedOutcomes[]`, `analysisPlan` inside the frozen `definition_snapshot.overview`. The **lineage** side has existed since the first migration: `experiment_version.supersedes_version_id` + `change_summary` + `amendment_classification`, written by `studies.amend` ([ADR-0004](0004-preregistration-amendments.md)). Nothing reads either onto the public record.

**Grounding the work surfaced a shipped bug that dominates the item.** `getPublicStudy` selects a single version (`kind IN ('published','preregistered')`, newest first, `LIMIT 1`) and then gates the registration fields on `ver.kind === "preregistered"`. So a study preregistered at v3 and **published** at v8 resolves `latestKind: "published"`, and `registrationDoi` / `registrationUrl` / `registrationWithdrawn` all return null/false — **the Preregistration section and its DOI vanish from the public record of exactly the finished, citable studies that matter most.** This also means Round-1 item ② (surface the registration DOI on the record, `61b6478`) only works while a study's newest frozen version is still its preregistration; it was verified on a preregistered study and the published case was missed. Fixing this is a precondition: no chip work matters on a section most finished studies never render.

## Options considered

The decisive question is **how a claim earns the word "preregistered"** on a public, crawlable, citable record. It is the most integrity-loaded word the product prints.

### Option A — Researcher declares it

- A preregistered/exploratory control on each reported claim.
- **Pros:** trivial to build; zero friction; works on legacy records immediately.
- **Cons:** the label is a self-report checked against nothing — precisely the AsPredicted failure mode the feature exists to counter. It asserts the conclusion rather than grounding it. A reader gains no more assurance than the author's word, which they already had.

### Option B — Derive it by diffing the report claim against the frozen plan

- Compare the reported claim to the plan's hypotheses and infer the label.
- **Pros:** no researcher effort; feels rigorous.
- **Cons:** **the data to do it honestly does not exist.** The plan side is `hypotheses: string[]` — bare prose, no ids. The report side is `HypothesisFields` — five *optional freeform strings* ("structured-but-freeform" by deliberate design), plus Markdown. Nothing links them. So this is prose-vs-prose string similarity, and it fails in both directions: it calls a genuinely preregistered claim exploratory when wording drifted, and — far worse — calls an exploratory claim **preregistered** because it shares nouns with H2. ADR-0101 already reached this conclusion when it deferred all derivation to item ⑨ and shipped `FieldSource` as an empty slot.

### Option C — Derive the label from a researcher-declared, machine-verifiable *binding* (downgrade-only)

- The researcher declares one structural fact — *"this claim tests H2 of the preregistration filed as v3"* — and the label is then computed by set membership, not judgement.
- **Pros:** "Preregistered" becomes provable rather than asserted; the referent is a frozen, timestamped hypothesis that (for an original filing) predates data by construction of `assertPlanBeforeData`. The control is a `<select>` — the same shape already shipped on the plan side.
- **Cons:** legacy records have no bindings and render every claim Exploratory until an author binds them; costs the researcher one pick per claim.

### Option D — Option C, but with a free override in both directions

- Derive from the binding; let the author override either way (mirroring ADR-0101's symmetric `source: "researcher" | "derived"`).
- **Pros:** flexible; consistent with the ADR-0101 provenance idiom.
- **Cons:** an **upgrade** override re-opens Option A's hole completely — the chip is a self-report again, just with extra steps. It also manufactures a third state (*claims preregistered, binds to nothing*) that no reader can adjudicate and no query can validate.

## Decision

Take **Option C**. A claim is marked **Preregistered only by binding it to a hypothesis in a frozen preregistered version**; the label is derived from that binding. **Downgrading a bound claim to Exploratory is always allowed; upgrading is impossible by construction** — you cannot type "preregistered", you can only point at a frozen hypothesis, or not. Unbound ⇒ **Exploratory**, with no judgement and no diff. This asymmetry is the feature: the strong claim requires a verifiable referent, the weak claim is free. Specifics:

**D1 — Storage.** The binding lives in `study_record.layout` jsonb as a typed sibling to `fields` on `RecordSection`: `claim?: { planVersionId, hypothesisIndex, exploratoryOverride? }`. `study_record` is the post-hoc *face* of the study and must stay editable after publication; ADR-0101 set the house pattern (extend the jsonb, keep an in-repo registry, no migration), and ADR-0099/0101 both rejected new tables on weight. **Rejected:** a new column/table (a migration, and the migrate-prod-before-push rule, for per-section data); writing into `definition_snapshot.overview` (that is the **frozen plan** — amend-only per ADR-0004; a report claim inside an OSF *pre*registration is a category error); and smuggling the index into `HypothesisFields` — `fields` is `Record<string,string>` and `saveLayout` filters it with `v?.trim()`, so a numeric index throws and `0` is silently dropped.

**D2 — Binding shape: pin `{planVersionId, hypothesisIndex}` (1-based).** The renumber-on-delete fragility that bit `ExpectedOutcome.hypothesisIndex` in item ⑤ exists **only on the working tip**; a frozen `definition_snapshot` is append-only and immutable (ADR-0002), so `hypotheses[]` inside a *specific* frozen version can never renumber. Pinning the version makes the index permanently correct and lets the record say something citable: *"H2 of the preregistration filed 2026-05-01 (v3)"*. **Rejected:** a bare index against "the plan" (silently re-points when an amendment inserts a hypothesis); adding ids to `overview.hypotheses[]` (breaks the `string[]` shape every existing snapshot, `buildOpenEndedBody`, and `protocol-text.ts` assume, for a problem pinning dissolves for free); text matching (Option B).

**D3 — Which version is "the preregistration".** The picker offers hypotheses from the **newest `kind='preregistered'` version**, queried explicitly; the stored `planVersionId` records which was picked and the render resolves against *that* row. The existing `LIMIT 1` "latest frozen version" returns the **published** v8 for a study preregistered at v3 — validating a chip against its plan would compare to the wrong list entirely.

**D4 — The anchor gate (the shipped bug).** The Preregistration section gate changes from `latestKind === "preregistered" || registrationWithdrawn` to **"this study has ≥1 preregistered version"**, and `registrationDoi`/`registrationUrl`/`registrationWithdrawn` resolve from the **newest preregistered version** rather than the latest frozen row. This is an observable semantics change to a `publicProcedure` also consumed by `lib/seo/jsonld.ts`: records that show no preregistration today will start showing one. That is the fix landing, not a regression — and it repairs Round-1 item ②.

**D5 — Deviations is a section; lineage is not.** Deviations becomes a new `SECTION_TYPES` entry (`group: "authored"`, `defaultOn: false`), inheriting palette/reorder/hide/Markdown for near-zero code. **Owner decision 2026-07-15: palette-only** — `DEFAULT_LAYOUT` seeds only at first compose, so existing records never gain one, and we do not backfill into records their owner considers finished. **Rejected:** modelling deviations as content on the `preregistration` section (`isFrozenSection` makes `saveLayout` keep only `{type, hidden}` — the content would be **silently destroyed on save**); and `group: "bound"` seeded from `changeSummary` (amendments are *plan-side changes*; deviations are *execution/analysis departures* — conflating them makes both meaningless). Amendment **lineage** renders inside `PreregistrationBody`, not as a section: it is the single anchor shared by `DefaultRecord` and `ComposedRecord`, and ADR-0004 forbids hiding amendment history — an authored section would hand the owner a hide toggle over their own audit trail.

**D6 — Public lineage.** A **second** query (the existing one keeps its `LIMIT 1` — it feeds `readOverview`/`readBlocks`/`conditionsForVersion`): all `kind='preregistered'` rows, `ORDER BY versionNumber ASC`, resolving `supersedesVersionId → versionNumber` **in memory**. Both backward ("Amends v3") and forward ("Superseded by v5") are derivable from that flat array, satisfying ADR-0004's bidirectional requirement in one payload. **Rejected:** per-row point lookups (N+1 across a chain); recursively walking `supersedesVersionId` (no unique index, no lock — the pointer graph can fork).

**D7 — `amendment_classification` is rendered as self-reported.** Reuse the researcher-facing labels already in `amend-button.tsx`; attribute it explicitly to the author. ADR-0004 flagged cherry-picking to obscure scope changes as a known abuse vector; the answer to a self-report is to **attribute** it, not to launder it as fact or suppress it. The renderer decides "is this an amendment" from `supersedesVersionId != null`, never from a non-null classification — the DB CHECK constrains only the supersedes/summary pair.

**D8 — Advisory, not a publish gate.** An unclassified claim does not block `setVisibility`. ADR-0101's precedent is a hard gate *only where the thing protected is the meaning of the word*; here the ratchet already makes the unbound default (Exploratory) the honest one, so there is nothing left to enforce.

**D9 — No migration, no seed.** `study_record.layout` is jsonb; all three lineage columns have existed since `0000_quiet_vampiro.sql`. No module registry is touched, so `db:seed:prod` is not implicated either.

**Deliberately deferred:** the OSF push text is **unchanged** — `osfRecordSummary()` hashes its items into `osfPushedHash`, so adding lineage items would flip **every existing record** to "changes to push", a silent mass-drift event, to duplicate information that already lives on OSF as real registrations. And ADR-0004's per-version public URLs (`/browse/[studyId]/v/[n]`) are **re-deferred a second time, named here explicitly**: the chain renders in-page with anchors.

## Consequences

- **What becomes easier.** A published record finally shows its preregistration, its DOI, and its amendment history; a reader can tell predicted findings from exploratory ones and check the claim against a frozen, timestamped hypothesis; Round-1 item ②'s DOI stops disappearing on publish.
- **What becomes harder.** Two public producers (`getPublicStudy`, `getRecordPreview`) must stay in lockstep — a *divergent value* between them is not a compile error, so the chain query and plan projection live in one shared helper; and every claim now costs the researcher one binding pick.
- **What we are now committed to.** "Preregistered" on a record means a verifiable binding to a frozen hypothesis — never a self-report. Amendment history is public and unhideable, which includes `change_summary`: researcher-authored free text, now public and crawlable on an indexed page (ADR-0055 am.1), with **no moderation, redaction, or takedown path**, and ADR-0004 forbids hiding it afterwards. The amend form must warn that the summary is public and permanent.
- **What we are now precluded from.** Marking a claim preregistered without a binding; hiding an amendment; per-version public URLs until the deferral above is revisited.
- **Accepted cost.** Legacy records (no bindings) render every claim **Exploratory** until an author binds them. That is the honest default — the system genuinely cannot verify those claims — but it means the chip is retroactively unflattering to records published before item ⑥.

## Revisit triggers

- Item ⑨ ships the auto-deriver → it may *propose* bindings from the runnable study, but the ratchet holds: a proposal a researcher accepts is still a declared binding.
- Researchers routinely want "preregistered" on claims they can't bind (e.g. the plan predates the platform) → revisit the referent, **not** the ratchet; an unverifiable claim must not borrow a verifiable word.
- A `change_summary` needs redaction (PII, defamation) → this ADR's committed-to gap becomes real and needs a takedown decision reconciled with ADR-0004's no-hiding rule.
- The OSF summary should carry lineage after all → decide what to do about the global `osfPushedHash` drift flag first.

## References

- Insight: [los-alignment-and-templates](../../01_research/insights/los-alignment-and-templates.md) (Round 2 item ⑥; the REPORT scorecard row)
- Related ADRs: [ADR-0101](0101-preregistration-templates-typed-fields.md) (the typed plan this reads; the jsonb-extension pattern; `FieldSource` deferral), [ADR-0004](0004-preregistration-amendments.md) (amend-not-edit; bidirectional lineage requirement; the per-version-URL deferral this re-defers; the cherry-picking abuse vector), [ADR-0002](0002-forking-model.md) (append-only frozen snapshots — why pinning an index is safe), [ADR-0054](0054-finished-state-and-study-record.md) / [ADR-0056](0056-study-record-v2-and-study-dashboard.md) (composed record; preview === published), [ADR-0055](0055-discovery-and-browse-expansion.md) am.1 (the record is public + crawlable), [ADR-0014](0014-response-data-model-and-conditioning.md) (the participant-data boundary — unaffected here: this is owner prose + version metadata, no participant data)
- Implementation substrate: `05_app/lib/study-record/sections.ts` (`SECTION_TYPES`, `RecordSection`, `sanitizeLayout`, `isFrozenSection`), `05_app/components/feature/study-record/record-sections.tsx` (`PreregistrationBody` — the anchor), `05_app/components/feature/study-record/hypothesis-chips.tsx` (the chip treatment to reuse), `05_app/server/trpc/routers/study-record.ts` (`saveLayout`, `getForEdit`), `05_app/server/trpc/routers/studies.ts` (`getPublicStudy` L1552-1554 — the D4 bug; `getRecordPreview`; `amend`)
- Gate artifacts to follow: user flow ([finish-a-study-and-publish-its-record](../../02_product/user-flows/finish-a-study-and-publish-its-record.md)), wireframe ([study-record](../../03_design/wireframes/study-record.md)), data-model ([06-study-record](../data-model/06-study-record.md)), then code + tests + a QA pass in `06_qa/audit-logs/`
