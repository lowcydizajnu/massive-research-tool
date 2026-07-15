# ADR-0100 — Study license (reuse terms) as first-class metadata

- **Status:** accepted
- **Date:** 2026-07-09
- **Deciders:** project owner
- **Tags:** data-model, metadata, osf, discovery

## Context

The OSF "Lifecycle Open Science" alignment review (insight [los-alignment-and-templates](../../01_research/insights/los-alignment-and-templates.md), Now #4) found the product has **no license field anywhere** — a study/record cannot state its reuse terms. This is the LOS "reusable" gap: OSF treats Licenses as first-class metadata (a controlled list) on projects/registrations, and it drives whether a reader/aggregator may reuse the work. Without it our public records and (opt-in) datasets are legally ambiguous, and we can emit no `license` in machine-readable metadata (blocking part of Now #1).

## Options considered

### Option A — Study-level `experiment.license` column, controlled list, default CC-BY-4.0
- **Pros:** One license per study, travels with the study (not the frozen design), applies even before a record is composed; a single column + mutation + selector; controlled SPDX-style ids stay machine-mappable to schema.org / OSF; owner-chosen CC-BY default means public work is reusable-with-attribution out of the box; existing rows backfill via the column default.
- **Cons:** One license for the whole study (can't license the dataset differently from the materials); the structured OSF `node_license` relationship needs a follow-up.

### Option B — Per-version / on `study_record`, or free-text
- **Pros:** Per-version would freeze the license into the snapshot; free text is trivially flexible.
- **Cons:** A license is a permissions decision about the whole study, not part of the frozen design, and is needed before a record exists — so `study_record`/per-version is the wrong home. Free text defeats machine-readability + OSF/DataCite mapping (the whole point of "assessable/reusable").

## Decision

Take **Option A**. `experiment.license` — `text NOT NULL DEFAULT 'CC-BY-4.0'` (migration 0057). Controlled list in `05_app/lib/licenses.ts` (CC-BY-4.0 default, CC-BY-SA-4.0, CC-BY-NC-4.0, CC0-1.0, MIT, Apache-2.0, all-rights-reserved) each with a label + canonical URL; unknown/legacy ids render as their raw string. Set via `studies.setLicense` (member-role-enforced, tenant-scoped) + a selector in the Study Record composer's publish bar. Rendered on the public record + composer preview (shared `RecordSections` footer) and returned in `PublicStudyDetail`/`StudyRecordForEdit`. On OSF, appended to the **record-summary description text** now; the structured `node_license` relationship (needs `GET /licenses/` id resolution + copyright-holder/year) is **deferred** with the other verified-API OSF follow-ups (cf. ADR-0005 am.5 ORCID / OSF-5), so we don't invent an unverified contract.

## Consequences

- **What becomes easier.** Records/datasets state reuse terms; machine-readable `license` is now emittable (schema.org, Now #1); public work is reusable-with-attribution by default.
- **What becomes harder.** Nothing material — one column, one mutation, one selector; no version/migration coupling.
- **What we are now committed to.** A controlled license vocabulary (`lib/licenses.ts`) as the source of truth, and surfacing the license wherever the record is shown/cited/pushed.
- **What we are now precluded from.** Per-artifact licensing (dataset ≠ materials) without a later data-model change; structured OSF `node_license` until the deferred OSF-API pass.

## Revisit triggers

- A researcher needs to license the **dataset** differently from the study/materials → introduce per-artifact license.
- The deferred OSF-API pass (OSF-5 / ORCID) lands → wire the structured `node_license` relationship + DataCite `rightsList`.
- Demand for licenses outside the curated list → extend `LICENSES` (keep it identifier-based).

## References

- Insight: [los-alignment-and-templates](../../01_research/insights/los-alignment-and-templates.md) (Now #4)
- Related ADRs: [ADR-0005](0005-osf-integration.md) (OSF integration; am.5 ORCID defer pattern), [ADR-0054](0054-finished-state-and-study-record.md) / [ADR-0056](0056-study-record-v2-and-study-dashboard.md) (Study Record), [ADR-0055](0055-discovery-and-browse-expansion.md) (discovery/findability)
- Implementation: `05_app/lib/licenses.ts`, migration `05_app/server/db/migrations/0057_deep_black_cat.sql`
