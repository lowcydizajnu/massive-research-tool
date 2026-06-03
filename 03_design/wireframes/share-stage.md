# Wireframe spec — Share stage — peer review + comments

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md) (the peer-review leg)
- **IA placement:** [Information architecture](../ia/information-architecture.md) (Share stage; right-panel Comments tab)
- **Persona:** [Maya Okonkwo — PI](../../02_product/personas/principal-investigator.md) (the reviewer) + [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md) (the author)
- **Status:** draft

## Purpose

The peer-review surface (IA v0.3: Share is review *before* commitment, distinct from Preregister). A collaborator reads the study and leaves comments — on the whole study or on a specific block — with @mentions of workspace members; the author resolves them. Backed by the PR-1a comments API + ADR-0015 events (a comment notifies the study author + earlier commenters; an @mention notifies the mentioned).

## Layout

The Build-stage shell reused (StageTabs pill with **Share** active; work-surface card + right context panel):

1. **Work surface** — read-only study header + the **block list** (same cards as Build, but not editable here). Each block card carries a **comment marker** (a count badge) and is selectable; selecting a block scopes the Comments panel to that block.
2. **Right context panel · Comments tab** — the thread for the current target (the whole study when no block is selected; the selected block otherwise): a flat, oldest-first list of comments + a composer at the bottom.

(IA v0.3 also floats a bottom **Comments drawer** as a "try both" surface; V1.7 ships the right-panel tab first and leaves the drawer as a fast-follow — noted in Open questions.)

## Content inventory

- **Target switcher (implicit):** study-level vs block-level, driven by block selection in the work surface. A small header in the panel states the scope ("Comments on this study" / "Comments on {block name}").
- **Comment** — author avatar/name, relative time, **rendered markdown body** (the ADR-0015 allowlist: bold/italic/code/links/@mentions — sanitized), an **edited** marker, a **resolved** chip when resolved. Author-only **Edit**/**Delete**; any writer can **Resolve**/**Reopen**.
- **Composer** — a textarea (markdown), an **@-mention autocomplete** (workspace members only — type `@`, pick a member; inserts the display name + carries the user id), and a **Comment** button. Disabled while empty.
- **Comment marker (per block):** a count badge on the block card; absent when zero.
- **Empty state:** "No comments yet — start the discussion" with the composer.

## States

- **Default:** study-level thread + composer.
- **Block selected:** the panel scopes to that block's thread; the block card is highlighted.
- **Composing / @-mention open:** the autocomplete lists matching active members; arrow-key + Enter select; Escape closes.
- **Posting:** the Comment button shows busy; on success the new comment appends and the composer clears.
- **Resolved comment:** dimmed with a "Resolved" chip + a Reopen affordance; resolved comments remain in the thread (not hidden) so the discussion record is intact.
- **Edited:** an "edited" marker next to the timestamp.
- **Empty:** the empty-state copy + composer.
- **Error:** inline `alert` ("Couldn't post — try again"); the draft is preserved.

## Interactions

- **Post** — `comments.create({experimentId, targetType, targetId, bodyMd, mentionedUserIds})`; the composer resolved the @handles to member ids via the autocomplete. On success → append + clear; the author + earlier commenters + the mentioned get notifications (ADR-0015).
- **Resolve / Reopen** — `comments.resolve({commentId, resolved})`; resolving notifies the comment's author.
- **Edit** (author) — inline edit → `comments.update`; sets the edited marker.
- **Delete** (author) — `comments.delete` with a confirm.
- **Select a block** — scopes the panel; the work surface highlights the card.
- **@-mention autocomplete** — reads the workspace's active members (a `workspace.members` query); workspace-internal only in V1.7.

## Edge cases

- **Markdown safety:** render via marked + DOMPurify with the ADR-0015 allowlist (no images/headers/lists/raw HTML); links get `rel="noopener noreferrer"` + are limited to http/https/mailto.
- **@mention of a non-member:** the autocomplete only offers members, so it can't happen via the UI; the server also drops non-members defensively.
- **Long thread:** the panel scrolls; the composer stays pinned at the bottom.
- **Block deleted after a comment:** a block-scoped comment whose instanceId no longer exists in the working tip still lists under the study (its `targetId` persists); it just has no card to anchor to. (Acceptable in V1.7; the comment isn't lost.)
- **Preregistered/immutable study in focus:** comments are still allowed on Share (review continues post-freeze); commenting never mutates the design.

## Accessibility notes

- The composer textarea is labelled; the @-mention autocomplete is an ARIA combobox (`aria-expanded`, `aria-activedescendant`, listbox options) — keyboard-operable.
- Each comment is an `article` with an accessible author + timestamp; Resolve/Edit/Delete are real buttons with accessible names ("Resolve comment by {author}").
- The per-block comment marker pairs the count with text ("2 comments"), not color-only.
- Rendered markdown is sanitized HTML; no `dangerouslySetInnerHTML` without DOMPurify.

## Open questions

- The bottom **Comments drawer** (IA v0.3 "try both") — V1.7 ships the right-panel tab; the drawer is a fast-follow once we see whether the tab suffices.
- Tree-threaded replies — explicitly out (flat per target, ADR-0015); a future ADR amendment if needed.
- Comment reactions/emoji — V1.8+.
