# ADR-0100 — Study license (reuse terms) as first-class metadata

- **Status:** accepted
- **Date:** 2026-07-09
- **Deciders:** project owner
- **Related:** ADR-0005 (OSF integration), ADR-0054/0056 (Study Record), ADR-0055 (discovery/findability), insight [los-alignment-and-templates](../../01_research/insights/los-alignment-and-templates.md) (Now #4)

## Context

The OSF "Lifecycle Open Science" alignment review found the product has **no license field anywhere** — a study/record cannot state its reuse terms. This is the LOS "reusable" gap: OSF treats Licenses as first-class metadata (a controlled list) on projects/registrations, and it drives whether a reader/aggregator may reuse the work. Without it our public records and (opt-in) datasets are legally ambiguous, and we can emit no `license` in machine-readable metadata.

## Decision

Add a **study-level license** as controlled metadata.

- **Storage:** `experiment.license` — a `text` column, `NOT NULL DEFAULT 'CC-BY-4.0'` (owner-chosen default; the open-science norm). One license per study; it travels with the study, not per-version (a permissions choice, not part of the frozen design). Existing rows backfill to the default via the column default.
- **Controlled list** (`05_app/lib/licenses.ts`, SPDX-style ids): `CC-BY-4.0` (default), `CC-BY-SA-4.0`, `CC-BY-NC-4.0`, `CC0-1.0`, `MIT`, `Apache-2.0`, `all-rights-reserved`. Each entry carries a human label + canonical URL. The set is small on purpose; extend as needed. Unknown/legacy values render as their raw id.
- **Setting it:** `studies.setLicense` (workspace-member write mutation, member-role enforced like other study writes) + a selector on the Study Record composer (the reuse-terms moment).
- **Surfacing:** rendered on the public record (an identifiers/terms line) and returned in `PublicStudyDetail.license`; it will populate `schema.org` `license` in the JSON-LD that lands with the public-records work (Now #1).
- **OSF push — text now, structured later:** the license id + URL are appended to the OSF **record-summary description** text (`pushRecordSummary`, safe/verified — it's already a text PATCH). The **structured** OSF `node_license` relationship (which requires resolving OSF's own license ids via `GET /licenses/` + copyright-holder/year attributes) is **deferred** and grouped with the other verified-API OSF follow-ups (cf. ADR-0005 am.5 ORCID / OSF-5), so we don't invent an unverified contract.

## Consequences

- **+** Records/datasets state reuse terms; unblocks machine-readable `license` for external findability; a CC-BY default means public work is reusable-with-attribution out of the box.
- **+** Minimal surface: one column + one mutation + one selector + one render; no version/migration coupling (study-level).
- **−** The structured OSF `node_license` link is not set yet (text-only on OSF), pending an OSF-API verification pass — same pattern as ORCID.
- **Why not per-version / on `study_record`?** A license is a permissions decision about the whole study, not part of the frozen design snapshot, and applies even before a record is composed — so it lives on `experiment`. The published dataset inherits the study license.
- **Why a fixed short list, not free text?** Machine-readability + OSF/DataCite mapping need controlled identifiers; free text defeats "assessable/reusable."
