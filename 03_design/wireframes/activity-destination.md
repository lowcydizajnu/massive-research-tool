# Wireframe spec — Activity destination — Yours / Follows

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md) (the "what happened while I was away" leg — Hanna requests review, then sees comments / mentions / forks about her work) + [Hanna run and read results](../../02_product/user-flows/hanna-run-and-read-results.md) (OSF push status).
- **IA placement:** [Information architecture](../ia/information-architecture.md) §"Activity sub-nav" (Yours / Follows split) + §"Notifications surface" (no bell; an unread-count badge next to **Activity** in the rail).
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md) (the author who returns to a backlog of activity) + [Maya Okonkwo — PI](../../02_product/personas/principal-investigator.md) (follows her area).
- **Status:** draft

## Purpose

The single place that answers "what happened while I was away" (IA v0.3 — there is **no notification bell**; the rail's Activity item carries the unread badge instead). Two sub-streams:

- **Yours** (default) — events *about the user*: comments on their studies, @mentions, forks/replications of their work, OSF push completions, review requests. Backed by the `notification` table (write-time fan-out, ADR-0015 Decision 1A). This is the same data as the rail unread badge.
- **Follows** — events *from the network the user subscribed to*: new preregistrations / named versions from followed tags, authors, Frameworks, studies. Backed by `activity_event × follow` (query-time, ADR-0015 Decision 1B). The retention surface.

**V1.7 PR-2 scope:** the **Yours** stream + the rail unread badge. **Follows** ships its structure (the tab + a deferred empty-state) here and becomes live in **PR-3** (follow affordances + the join query). Saved-search-as-follow-target stays out (V1.7+, per ADR-0015 Decision 5).

## Layout

A standard destination (same shell as Studies — left rail + top bar + a single work surface; no right context panel here):

1. **Header** — "Activity" (Plex Serif display) + a one-line subtitle. A **Mark all read** action sits at the top-right of the Yours stream when there's anything unread.
2. **Sub-nav tabs** — `Yours` (default) · `Follows`. The active tab uses the same pill treatment as the StageTabs (serif, primary text, canvas fill).
3. **Stream** — a single vertical list of **event rows** (modular floating cards on parchment, per the design language), newest-first.

## Content inventory

- **Event row** — an **actor** (display name; "Someone" if the actor is unresolved / a system event), a **verb phrase** built from the event `type` + `payload`, the **target** (a study, rendered as a link to it), and a **relative timestamp**. Unread rows carry a subtle unread affordance (a left accent + a filled dot — never color-only; see a11y).
  - `comment_on_your_study` → "{actor} commented on {studyTitle}"
  - `mention` → "{actor} mentioned you" (on {studyTitle} when known)
  - `comment_resolved` → "{actor} resolved a comment on {studyTitle}"
  - `fork` → "{actor} replicated {studyTitle}"
  - `review_request` → "{actor} requested your review on {studyTitle}"
  - `osf_push_complete` → "Your OSF registration for {studyTitle} is live" + the DOI as a link (system event — no actor)
- **Unread badge (rail):** a small count next to the **Activity** rail item; reads from `notifications.unreadCount`. Absent when zero.
- **Empty states:**
  - Yours: "You're all caught up — comments, mentions, and replications of your work show up here."
  - Follows (PR-2, deferred): "Follow tags, authors, Frameworks, and studies to build your feed. Following arrives soon." (PR-3 replaces this with the live feed + a real empty-state pointing at the `+ Follow` affordances.)

## States

- **Yours · default (has items):** newest-first rows; unread rows accented; a **Mark all read** button when `unreadCount > 0`.
- **Yours · all read:** rows still listed (history), no accents, no Mark-all-read button.
- **Yours · empty:** the caught-up empty-state.
- **Follows (PR-2):** the deferred empty-state above (the tab is present so the IA is legible; the feed is wired in PR-3).
- **Marking read:** visiting Yours marks the visible unread rows read (optimistic), which clears the rail badge; **Mark all read** clears everything at once.
- **Loading / error:** a quiet skeleton list; on error an inline `alert` ("Couldn't load activity — refresh").

## Interactions

- **Open Activity** — rail item → `/activity`; the badge reflects `notifications.unreadCount`.
- **Read a row** — `notifications.markRead({id})` (idempotent; no-op if already read or not the caller's). On open of Yours, the client marks the currently-unread rows read so the badge clears (per IA §"Notifications surface" — the destination *is* the read mechanism).
- **Mark all read** — `notifications.markAllRead()`.
- **Follow a target** — *not here*; the `+ Follow` affordances live on tag chips / author bylines / Framework + study Details (PR-3). Activity only *consumes* follows.
- **Click a target** — navigates to the study (`/studies/{id}` or its Share stage for a comment/mention).

## Edge cases

- **Cross-workspace:** notifications are **per-user**, not per-workspace (the `notification` query scopes to `recipientUserId`, not the active workspace) — Hanna sees activity about her work regardless of which workspace it happened in. (Yours is identity-scoped; Follows will be too.)
- **Unresolved actor:** system events (`osf_push_complete`, emitted with `actorUserId: null`) render without an actor ("Your OSF registration…"); a deleted actor renders as "Someone".
- **Idempotent fan-out:** a re-fired event never produces a duplicate row (`UNIQUE(recipient_user_id, source_event_id)`), so the stream can't show the same event twice.
- **Stale target:** if a referenced study was archived/deleted, the row still renders its stored `payload.studyTitle` (denormalized) and the link 404s gracefully — the event record isn't lost.
- **Large backlog:** the list caps at the most recent N (default 50) with a quiet note if truncated; pagination is a fast-follow (no silent unbounded scan).

## Accessibility notes

- The sub-nav is an ARIA `tablist` (Yours / Follows) with `aria-selected`; tabs are keyboard-operable; the panel is a labelled `tabpanel`.
- Each event row is an `article`/`li` with an accessible sentence (actor + verb + target + time); the timestamp uses `<time datetime>`.
- **Unread is never color-only:** an unread row pairs the accent with a visible dot and `aria-label="unread"` (or visually-hidden "Unread:" prefix). The rail badge pairs its count with text ("3 unread").
- **Mark all read** / **Mark read** are real buttons with accessible names.

## Vocabulary check (developer-term gate)

User-facing copy uses researcher-native language (per `00_meta/rules/design-rules.md`): a `fork` event reads **"replicated"**, a `preregister_complete` reads **"preregistration"**, a named version reads **"saved version"**. The words *fork / push / event* never reach this surface.

## Open questions

- **Per-target notification cadence** (immediate / daily / weekly / off) — IA recommendation #13; needs a Settings · Notifications home. Out of V1.7; the email-digest handler is stubbed (ADR-0015 Decision 6).
- **Pagination / infinite scroll** — V1.7 caps at the recent N; revisit when feeds get long.
- **Per-row dismiss** vs read-only history — V1.7 keeps full history (mark-read, never delete); revisit if the stream gets noisy.
