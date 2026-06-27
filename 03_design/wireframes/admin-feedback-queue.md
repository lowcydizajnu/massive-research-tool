# Wireframe spec — Admin feedback queue

- **Serves user flow:** [Provide product feedback](../../02_product/user-flows/provide-product-feedback.md)
- **IA placement:** [Admin destination (owner-only)](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

> One sentence: what this screen exists to do.

Give the operator (owner) a single owner-only place to read and triage submitted feedback.

## Layout

> Layout zones.

- A plain destination page (`/admin/feedback`) — not part of normal researcher chrome; reachable only by allow-listed admin users.
- Header (title + a status filter). Below: a reverse-chronological list of feedback rows; each row expandable to its full body + context + screenshot.

> Note: the full Admin destination (cross-workspace nav, `user.is_admin` + `adminProcedure`) is deferred to the Analytics + Admin handoff. For PF2 this is a minimal standalone page gated by an `ADMIN_USER_IDS` allow-list.

## Content inventory

> Every piece of content visible.

- **Title** — "Feedback". Static.
- **Status filter** — chips: All / New / Triaged / In progress / Resolved / Won't fix / Duplicate. Computed.
- **Feedback row** — kind badge, truncated body, submitter (display name/email), workspace, route, relative time. From server.
- **Expanded row** — full body, the context JSON (URL, route, coarse country, hashed UA, workspace/study ids), screenshot thumbnail (links to the R2 object), status, admin notes.
- **Empty-state copy** — "No feedback yet" / "Nothing matches this filter."

## States

- **Default** — list newest-first.
- **Loading** — skeleton rows.
- **Empty** — no rows (or none for the active filter) → empty-state copy.
- **Partial** — n/a (single list).
- **Error** — "Couldn't load feedback" + retry.
- **Forbidden** — a non-admin who reaches the URL gets a 404/redirect (the page must not reveal it exists).

## Interactions

- **Status filter chip** — click filters the list.
- **Row** — click expands/collapses detail.
- **Screenshot thumbnail** — opens the full PNG (signed R2 URL) in a new tab.
- **Status control / notes** — (read-mostly for PF2; status + admin_notes editing may land with the full Admin destination). If shown, changing status persists via an admin mutation.

## Edge cases

- Very long body — truncate in the list, full text on expand.
- Many rows — paginate or cap with a "load more" (no silent truncation — show the count).
- Feedback whose workspace/user was deleted — FK is `ON DELETE SET NULL`; show "(deleted)".
- Screenshot missing (text-only or upload failed) — no thumbnail, just a note.
- Non-admin / signed-out — never renders; 404.

## Accessibility notes

- List is a semantic list; rows are buttons/disclosures with `aria-expanded`.
- Status filter is a labeled control group.
- Screenshot links have descriptive labels ("Screenshot for feedback from {user}").

## Open questions

- Status editing + admin notes UI: minimal in PF2, fuller in the Analytics + Admin handoff. Owner to confirm whether PF2 needs inline status changes or read-only is enough.
