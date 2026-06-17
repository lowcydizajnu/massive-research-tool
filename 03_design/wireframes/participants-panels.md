# Wireframe spec — Participants · Panels

- **Serves user flow:** [Run and read results](../../02_product/user-flows/hanna-run-and-read-results.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

Let a researcher curate **panels** — named, workspace-scoped cohorts of past participants identified only by their opaque provider id (`external_pid`) — so they can later **re-recruit** them (longitudinal follow-ups, high-quality returners) or **exclude** them (avoid cross-contamination across related studies). Never a CRM: panels show aggregate membership + provenance, never participant PII (ADR-0051, ADR-0014).

## Layout

The Participants destination shell (shared `ParticipantsSubNav` pill: Connections · Open recruitment · **Panels** · Compensation · Quality), with **Panels** active. Below it, one work-surface stack:

1. **Header row** — "Panels" + a one-line explainer + a primary **New panel** button (right-aligned).
2. **Panel list** — one card per panel: name, optional description, **member count**, last-updated, and row actions (**View members**, **Add from a study**, **Delete**). Empty state when none.
3. **Panel detail** (route `/participants/panels/[panelId]`) — the panel header (name, count) + the **member table**: truncated `external_pid`, the study they were first added from, and when. Plus **Add members from a study** and per-row **Remove**.

## Content inventory

- **New panel button** — primary action; opens an inline create form (name required, description optional).
- **Panel card** — `name` (from server), `description` (optional), `memberCount` (computed), `updatedAt`. Source: `panels.list`.
- **Add-from-a-study control** — a study picker (the workspace's studies that have provider submissions) + a status filter (Approved only / Approved + submitted / All) → bulk-adds those studies' `external_pid`s. Source: `panels.eligibleStudies` + `panels.addMembersFromStudy`.
- **Member row** — truncated `external_pid` (e.g. `5f3a…b21`, monospace), `sourceStudyTitle`, `addedAt`. Source: `panels.members`. NEVER a name/email — none exists in our data (ADR-0014).
- **Use-in-a-study note** — static helper: panels can be applied as include/exclude when recruiting on a provider (wired in a follow-up; see ADR-0051 "Provider exclusion").

## States

- **Default** — list of panel cards (or detail with member table).
- **Loading** — server-rendered; mutations use `PendingButton` busy state.
- **Empty (no panels)** — "No panels yet. Create one to re-recruit or exclude past participants by their anonymous provider id." + **New panel**.
- **Empty (panel has no members)** — "No members yet. Add participants from a study you've run." + the add-from-a-study control.
- **Partial** — a panel whose source study is still recruiting: member count reflects submissions reconciled so far; copy notes it updates as more come in.
- **Error** — inline `alert` on create/add/delete failure; nothing partially written (adds are idempotent on `(panel_id, external_pid)`).
- **Success / optimistic** — after add, the member count + table refresh; a toast/inline note states how many were added (and how many were already present).

## Interactions

- **New panel** — inline form → `panels.create({ name, description })`; on success the card appears and (optionally) navigates to its detail.
- **Add members from a study** — pick a study + status filter → `panels.addMembersFromStudy({ panelId, studyId, statuses })`; system pulls that study's `provider_submission.external_pid`s matching the filter and upserts them (idempotent); response reports `{ added, alreadyPresent }`.
- **Remove member** — `panels.removeMember({ panelId, externalPid })`; row disappears.
- **Delete panel** — confirm → `panels.delete({ panelId })`; cascades members.
- **View members** — navigates to the panel detail route.
- All mutations are `writeProcedure` (viewers see the panels read-only; create/add/delete are absent/disabled).

## Edge cases

- **Very long name/description** — truncate in the card with `title`; detail shows full.
- **0 / 1 / many panels and members** — list and table render at all sizes; large member tables paginate or cap with a "showing N of M" note (no silent truncation).
- **Adding from a study with no provider submissions** — disabled in the picker (only studies with submissions are listed) with a hint.
- **Duplicate adds** — idempotent; the response says how many were already present rather than erroring.
- **Slow network** — `PendingButton` busy states; the add can be a larger batch, so it shows progress copy.
- **Permissions denied** — a viewer cannot create/add/delete (write-gated, mirrors `writeProcedure` FORBIDDEN).

## Accessibility notes

- The member table is a real `<table>` with a caption ("Members of {panel}"); truncated PIDs carry a `title` with the full opaque id (still not PII).
- Create/add/delete buttons use `aria-busy` while pending; the add result is announced via an `aria-live` region.
- Destructive **Delete panel** confirms before firing and is reachable/operable by keyboard.
- Sub-nav: active **Panels** tab carries `aria-current="page"`.

## Open questions

- **Cross-study membership provenance** — keep only the *first* source study per PID, or record every study a PID came from? Leaning: first-source for V1 (provenance is a hint, not an audit trail).
- **Provider exclusion mechanism** — Prolific's current allowlist/participant-group API must be verified live before wiring "use panel as exclude/include" into study creation (the handoff's `eligibility_requirements` note predates the move to `filters`). Deferred to the ADR-0051 follow-up.
- **Auto-panels** — should "everyone who passed attention checks in study X" be a saved smart-filter rather than a static snapshot? Deferred; V1 panels are static membership.
