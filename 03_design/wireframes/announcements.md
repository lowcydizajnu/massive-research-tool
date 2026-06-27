# Wireframe spec — In-app announcements

- **Serves user flow:** [First-run orientation](../../02_product/user-flows/first-run-orientation.md)
- **IA placement:** [App shell — TopBar + Admin](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

> Consolidates the platform-foundation handoff's three announcement files (topbar widget, slide-out panel, admin authoring) into one spec — they're one feature. PF4 / ADR-0072.

## Purpose

> One sentence: what this screen exists to do.

Let the team publish "what's new" updates and let every researcher see them without leaving the app.

## Layout

> Layout zones.

- **TopBar widget** — a ✨ button among the right-side TopBar affordances, with a small unread dot.
- **Slide-out panel** — opens from the right over a scrim; header ("What's new" + close) then a reverse-chronological list of entries.
- **Admin authoring** (`/admin/announcements`, owner-only) — a publish form (title, Markdown body, optional learn-more URL) above a list of already-published entries.

## Content inventory

> Every piece of content visible.

- **✨ button** — opens the panel; **unread dot** when `unreadCount > 0`. Computed.
- **Entry** — title, published date, body (sanitized Markdown, ADR-0015 allowlist), optional "Learn more →" link, optional image (deferred). From server.
- **Empty panel** — "No announcements yet — product updates will show up here."
- **Admin form** — title input, body textarea (Markdown), learn-more URL, Publish button; list of published titles + dates.

## States

- **Widget default** — no dot (all read).
- **Widget unread** — dot shown when `published_at > user.last_seen_announcement_at` for any entry (null last-seen = all unread).
- **Panel loading / empty / populated** — spinner → empty copy → list.
- **Read** — opening the panel calls `markAllRead` (sets last-seen = now); the dot clears.
- **Admin error** — publish failure shows an inline alert; the form keeps its input.
- **Forbidden** — non-admins 404 on `/admin/announcements`.

## Interactions

- **✨ click** — open panel + mark all read.
- **Close / Esc / scrim** — close panel.
- **Learn more** — opens the URL in a new tab.
- **Publish (admin)** — `announcements.create` (admin-gated) → inserts the row; the form clears and the published list refreshes.

## Edge cases

- Many entries — the list is capped (list limit) + scrolls; no silent over-truncation beyond the cap.
- Long title/body — title wraps; body is short by authoring discipline.
- Unauthed — the widget only renders in the authenticated shell; the admin route 404s.
- Markdown safety — body is rendered through the ADR-0015 allowlist sanitizer; raw HTML is stripped.

## Accessibility notes

- ✨ button has an `aria-label` reflecting unread count; the dot is decorative (`aria-hidden`).
- Panel is `role=dialog` `aria-modal`, Esc-closable, focus moves into it.
- Links have discernible text ("Learn more").

## Deferred

- Image/gif per entry (schema has `image_r2_key`; no uploader in v1).
- `announcement_published` activity-event emit (the widget reads the table directly).
- The full Admin destination (this is an `ADMIN_USER_IDS` stub until the Analytics + Admin handoff).

## Open questions

- Whether to add per-entry "mark read" granularity later (single last-seen timestamp suffices for v1).
