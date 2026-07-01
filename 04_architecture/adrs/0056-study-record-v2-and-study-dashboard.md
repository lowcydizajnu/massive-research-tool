# ADR 0056 — Study Record v2 + Study Dashboard

- **Status:** accepted
- **Date:** 2026-06-18
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** ux, ia, data-model, study-record, dashboard

## Context

Slice 2 (ADR-0054) shipped the composable Study Record + composer. Reviewing it live, the owner raised a batch of UX/structure gaps that amount to a **v2** of the Record plus a long-missing **per-study Dashboard**:

1. **Vocabulary drift** — the focused top bar says recruitment is "Closed" while the Results card says the study is "Finished"; the two read as one end-state. "Finished" should be a consistent study-state tag shown alongside the version tags (Preregistered / Published).
2. **No preview** — you can't see the public Record before publishing.
3. **Bound sections are read-only** — but a researcher needs to edit them (e.g. Conditions isn't Method); only *preregistered* content must stay frozen.
4. **Sections too coarse** — the Abstract should carry the DOI + article link inline; there's no **Hypotheses** section (H1/H2/… each separate, with effect type / correlation / p-value / analysis type), and edge cases need **freeform blocks with editable titles**.
5. **No rich text** — authored content needs basic formatting + lists; numbers deserve visual treatment.
6. **IA** — the Record is nested under Results; it should be the **last stage tab**. The public page **stretches** instead of sharing Browse's width. A **per-study Dashboard should be the FIRST tab** — "where are we with this study" for the creator.
7. **Discovery affordances** — Save/bookmark a study; Share; import citation/statistics for the article.

Prior decisions in play: ADR-0054 (Finished state + Record), ADR-0045 (dashboard customization / Stream F), ADR-0044 (version lifecycle), ADR-0014 (PII boundary — public = aggregate only), ADR-0007 (vendor seams + lock-in inventory), ADR-0055 (discovery / Browse).

## Options considered

### Record content model — editable bound sections

- **Option A — keep bound sections read-only** (Slice 2). Pros: simplest, comparable-by-construction. Cons: the owner can't fix a mislabeled/auto-wrong section; rejected by the feedback.
- **Option B (chosen) — every section is an editable block; bound sections seed from study data but accept an override; preregistered-derived content is frozen.** Pros: full authorial control, the "publication" model researchers expect. Cons: more storage + an "overridden vs auto" affordance; must still hard-freeze preregistered text.

### Hypotheses / structured-but-freeform

- **Option A — fixed schema** (effect, p, analysis as required columns). Cons: research is heterogeneous; we'll hit edge cases we can't model.
- **Option B (chosen) — typed-but-optional + freeform.** Each hypothesis is a block with an editable title + rich content and *optional* structured fields (effect type, direction, statistic kind + value, analysis); unknown cases use freeform blocks with editable titles. Numbers get visual treatment in render.

### Rich text

- **Option A — full WYSIWYG/HTML.** Cons: sanitisation surface, heavier, lock-in.
- **Option B (chosen) — Markdown** (bold/italic/headings/lists/links) stored as text, rendered with a small allowlisted renderer. Lightweight, portable, diffable, no new vendor. A small formatting toolbar assists; raw markdown still valid.

### Save / bookmark

- **Reuse Follow** vs **(chosen) a distinct `saved_record`** personal list. Follow = feed updates; Save = a tidy reading list surfaced on the dashboard. Different intents → different tables.

### Citation import

- **Manual only** vs **(chosen) DOI auto-fetch via a `CitationAdapter` (Crossref, free/no-key) + manual fallback.** The adapter lives in `server/adapters/citation.crossref.ts` per ADR-0007; a wrong/unknown DOI degrades to manual entry.

### Study Dashboard

- **(chosen)** a new **first** stage tab: a lifecycle progress tracker (Draft → Preregistered → Recruiting → Data in → Finished → Record published) as the spine, plus recruitment/data at-a-glance, next-actions/blocking prompts, and a per-study activity timeline. Reuses existing aggregates where possible; read-only.

## Decision

**We will ship Study Record v2 — every section an editable block (bound sections seed from data and accept an override; preregistered content frozen), granular sections (Abstract-with-article-link, structured-but-freeform Hypotheses, freeform blocks with editable titles), Markdown rich text, a 2-column public read page at Browse width with a Cite/Share/Save sidebar and an owner Preview, the Record as the last stage tab, and DOI citation import behind a `CitationAdapter` — plus a new per-study Dashboard as the first stage tab and a `saved_record` bookmark list.**

Reasoning: the Record is a *publication*; researchers expect to control every word, see it before it's public, cite it, and save others'. The Dashboard answers the orthogonal question the Record can't — "where is *my* study right now." Both reuse existing machinery (the `study_record.layout`, the dashboard registry, the version snapshot) rather than inventing engines, and hold the PII line (public data stays aggregate, ADR-0014) and the freeze line (preregistered content immutable, ADR-0044).

## Consequences

- **Easier:** authoring a real record; previewing before publish; citing/saving/sharing; seeing study progress at a glance; honest, consistent "Finished" vocabulary.
- **Harder:** more section types + an override/frozen model to maintain; a Markdown render/sanitise path; a citation integration to keep working; another dashboard surface.
- **Committed to:** sections as editable blocks (bound override + frozen-prereg); Markdown as the authored format; `saved_record` + `CitationAdapter` (Crossref) as new seams; Record = last tab, Study Dashboard = first tab; public data aggregate-only.
- **Precluded from:** silently locking bound sections; storing rich text as raw HTML; per-section public raw-data exposure.

## Revisit triggers

- Markdown proves too limiting for researchers (tables, footnotes) → consider a structured doc model.
- Crossref rate limits / coverage gaps hurt → add a second citation source behind the same adapter.
- The Study Dashboard overlaps the workspace dashboard enough to merge → reconsider as a widget.

## References

- ADR-0054 (Finished + Record), ADR-0045 (dashboard customization), ADR-0044 (version lifecycle), ADR-0014 (PII boundary), ADR-0007 (vendor seams), ADR-0055 (discovery).
- Wireframe `03_design/wireframes/study-record.md`; data-model `04_architecture/data-model/06-study-record.md`.
- Crossref REST API: `https://api.crossref.org/works/{doi}` (public, no key, polite pool via a `mailto`).

## Amendment 2026-06-19 — publishable dataset on the Record (E2)

Owner decision: the **Data** section may publish the study's response table (the same table shown in the **Export Data** view), **researcher opt-in**, since ~99% of these studies are anonymous; the researcher can **mask columns** they don't want public. This **amends** the "public Data = aggregate only" line for the Record (ADR-0014's PII principles still govern the *Participants* destination + Panels).

Safety rails (non-negotiable, because this is the one place raw participant rows can go public):
- **Default OFF.** Nothing is published until the owner explicitly enables it and confirms.
- **Snapshot at publish.** The composer (which already has workspace-scoped `getResults`) builds the export matrix client-side via `lib/export/dataset` and stores an **immutable snapshot** (`study_record.data_table`) — the public page renders the stored snapshot, so no public raw-data query path exists and the dataset doesn't silently change as stragglers complete.
- **Per-column control.** The owner chooses which columns to include; the opaque participant id (`external_pid`) is **excluded by default** (re-identification risk — it's the payment-reconciliation handle, ADR-0014) and must be added back deliberately.
- **Explicit consent.** Enabling shows a confirmation stating that participant-level rows will be public and the owner affirms the data is anonymous + consented.
- Storage: `study_record.data_published` (bool), `data_masked_columns` (text[]), `data_table` (jsonb `{headers, rows}` snapshot). Migration 0026.

Why snapshot-and-store over an on-demand public results builder: avoids exposing a cross-tenant raw-results query, makes the published dataset immutable + auditable, and reuses the exact Export Data computation the researcher already trusts.

## Amendment 2026-06-20 — OSF push state (E4b/item 2), withdrawal reflected app-wide (item 3), OSF watch sweep (E4c)

Owner feedback after the E4b push UX shipped. Three OSF-sync decisions:

- **Push is itemized + content-addressed, not blind (item 2).** A single source-of-truth builder (`osfRecordSummary` in the study-record router) returns the exact items a push writes to the **project node** (abstract, article DOI/link, public-record link) **plus** a sha256 of the text. The confirm modal lists those items (no opaque blob); the **public-record link is included only when the record is `public`** — a workspace-private record 404s on `/browse/[id]`, which was the bug. `study_record` gains `osf_pushed_hash` + `osf_pushed_at` (**migration 0027**); `getForEdit` derives `osfUpToDate` by comparing the current hash to the stored one, so the button reads "OSF up to date" right after a push while still allowing a deliberate repeat push. Why a hash over a dirty-flag: the summary derives from several columns + visibility, so the only honest "has it changed since the last push" signal is the content itself.
- **A withdrawn registration is not a preregistration anywhere (item 3).** Once `experimentVersion.registrationWithdrawn` is true (ADR-0005 am. 3), the study no longer counts as "Preregistered" on the Studies-list stage, the Browse card + public-record marker, the record's Preregistration section, or the Study Dashboard lifecycle — its plan is no longer frozen on the registry. `PublicStudyDetail`/`BrowseStudyCard` carry `registrationWithdrawn`; the dashboard surfaces it explicitly ("Preregistration withdrawn" + a re-register prompt) rather than silently dropping the step.
- **Withdrawal syncs automatically (E4c).** A 6-hourly Inngest cron (`runOsfWatch`, body in `server/jobs/osf-watch.ts`, registered in the `/api/inngest` serve route) polls every pushed-but-not-yet-withdrawn registration through the registry adapter and flips `registrationWithdrawn` (+ backfills DOI) straight from OSF — so a withdrawal/retraction made on osf.io reflects across the app without the owner clicking "Check OSF status". Best-effort per study (a disconnected owner or transient OSF error skips that one and never fails the sweep); the filter on `registrationWithdrawn = false` means a study is polled at most once after it's withdrawn. A new `osf_registration_withdrawn` activity event notifies the author. Why a cron over only on-demand: a withdrawal the researcher made on OSF (or an external retraction) must not depend on them re-opening the app.
