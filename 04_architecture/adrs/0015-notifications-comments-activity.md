# ADR 0015 — Notifications, comments, and activity feed for the V1.6 review network

- **Status:** accepted
- **Date:** 2026-06-03
- **Deciders:** project owner + Claude
- **Tags:** notifications, comments, activity-feed, fan-out, v1.6

## Context

V1.6's anchor user story (Maya reviews, the network comes alive) requires four IA v0.3 surfaces that were specified but inert in MVP + V1.5: the Share stage tab (currently a placeholder), the Replications tab (placeholder), the Activity destination (empty), and `+ Follow` affordances on tag chips / author bylines / Framework + study details / search modal (absent everywhere).

Underneath those surfaces are three intertwined systems:

1. **Comments** — inline review threads on a study or on a specific block instance, with @mentions that fire notifications, with resolved/open state, with edit/delete by the author.
2. **Notifications** — in-product unread badge per recipient, fed by events (mention, fork-of-your-study, OSF push complete, review-request, comment-on-your-study, etc.). The bell-less design per IA v0.3 means notifications surface in the Activity destination with an unread badge on the rail item, not in a global bell popover.
3. **Activity feed** — Activity destination has two sub-streams: `Yours` (events ABOUT the user — mentions, forks of their studies, comments on their work) and `Follows` (events the user has subscribed to via the five follow targets — tag, author, Framework, study, saved-search).

These three are intertwined because a single underlying event (e.g., "Sofia forked Hanna's published study") fans out to: (a) a notification for Hanna (study author), (b) a `Yours` feed entry for Hanna, (c) a `Follows` feed entry for every user following Hanna as an author OR following the tags on the study OR following the study itself OR following the Framework the study uses. Designing them separately produces duplicated event-emission code; designing them together makes the data model coherent.

V1.5 already wired Inngest as the `BackgroundJobAdapter` (per ADR-0007 + V1.5 commit `5938068`). V1.6 reuses Inngest for event fan-out — it's the right tool for the job (typed events, retries, idempotency, observability) and it's already in the lock-in inventory.

The decisions this ADR locks shape ~2-3 weeks of V1.6 implementation across migrations, backend handlers, tRPC routers, and four major UI surfaces.

## Options considered

### Decision 1: Fan-out architecture (events → recipient rows)

How does an event reach all interested recipients?

#### Option A — Fan-out at write time (chosen for `Yours` feed)

When an event fires, the handler computes all recipients synchronously (or via Inngest job) and writes one `notification` row + one `activity_event` row per recipient. Reads are dumb `SELECT * FROM notification WHERE recipient_user_id = ?` — fast, cacheable, scales horizontally on the read side.

- **Pros:** O(1) reads; trivial unread-count math; idempotent retry-safe via unique constraint on `(event_id, recipient_id)`; trivial to add new recipient types later.
- **Cons:** Write amplification — 1 event → N rows. Concerning at very high N (10k+ recipients), but our scale is small (a workspace has <100 members; a popular tag has <100 followers in early V1.6). More storage than query-time.

#### Option B — Query-time fan-out (chosen for `Follows` feed)

Store events once in `activity_event` (no recipient column). At read time, compute which events match the user's follows by joining `activity_event × follow`.

- **Pros:** Minimal storage; follows updates immediately reflect (no backfill needed when a user follows/unfollows a tag); doesn't write-amplify per event.
- **Cons:** Slower reads — per-request join across two growing tables; harder to cache; the `Follows` feed sort + filter is more SQL work.

#### Option C — Always fan-out

Both feeds always fan-out at write time.

- **Pros:** Single read path; uniform code.
- **Cons:** Massive write amplification on follows changes (adding 1 follower requires backfilling all past events for them; unfollowing requires deletes). Operationally painful.

#### Option D — Always query-time

Both feeds compute at read time.

- **Pros:** Minimal storage everywhere.
- **Cons:** Notifications need real-time unread counts; query-time computation of "how many unread notifications do I have" is expensive on every page load. Defeats the cheap-reads architecture we want.

**Pick: Hybrid (A for `Yours`, B for `Follows`).** Matches what Twitter, Slack, and Linear do for analogous problems. The `notification` table backs in-product unread badges + the `Yours` feed (they're the same data); the `Follows` feed reads from `activity_event` joined with `follow`.

### Decision 2: Comment data model — flat vs threaded

#### Option A — Flat list per target (chosen)

Comments are timestamped, attached to a `target_type + target_id`. Replies are just additional comments on the same target. No parent-child relationship. The visual "thread" is the sequence of comments on a target sorted by time.

- **Pros:** Simplest model; matches Google Docs' anchored-comment pattern that researchers know; no infinite-depth UI to design; resolve/unresolve operates on the target's whole comment list per anchor.
- **Cons:** No "reply to this specific comment within the thread" semantics. If the conversation forks (Maya asks two questions, Hanna answers each), the visual flow is timestamp-ordered, not branching.

#### Option B — Tree-threaded comments

Each comment optionally references a `parent_comment_id`. UI renders as nested replies.

- **Pros:** Richer conversational structure; clear which reply is to which comment.
- **Cons:** Significant UI complexity (collapsing, depth limits, "load more replies"); rare in document-review tools (more common in forum-style apps); we don't have a strong product reason for it yet.

#### Option C — Single parent, two-level only

Top-level comments + one level of replies. No deep nesting.

- **Pros:** Most "review conversation" cases are top-level + responses.
- **Cons:** Still adds parent_id complexity for a pattern researchers don't strongly need.

**Pick: Option A.** Flat per target. The user story ("Maya comments → @mentions Hanna in a follow-up") is satisfied with two flat comments on Block 2. If user research later shows researchers need tree-threading, that's a follow-up ADR (would add a `parent_comment_id nullable` column; backward-compatible).

### Decision 3: Comment target — study only, block only, or both

#### Option A — Both (chosen)

Comments can target `study` (general feedback on the whole study) or `block_instance` (anchored to a specific block within the study). The `target_type` enum discriminates.

- **Pros:** Matches Google Docs' "anchor to text or comment on doc"; matches Linear's "issue comments + sub-issue comments"; covers both "this study's intro is unclear" and "this Block 2 needs reverse-scoring."
- **Cons:** UI needs two comment surfaces (right-panel for general, per-block markers for anchored). IA v0.3 already specified both, so this isn't new work — it confirms the design.

#### Option B — Study only

All comments live at the study level. The body can mention "Block 2" textually but isn't anchored to it.

- **Pros:** Simpler.
- **Cons:** Loses the high-value "click on Block 2's comment marker to jump to the relevant comments" — a feature researchers explicitly want when reviewing.

#### Option C — Block only

All comments must be anchored to a block.

- **Pros:** Forces specificity.
- **Cons:** Where does "this study's overall design is solid" go? Forces awkward anchoring.

**Pick: Option A.** Both targets, discriminated by `target_type`.

### Decision 4: Mention resolution and permission model for V1.6

#### Option A — Workspace members only, no cross-workspace mentions (chosen)

Mentions resolve only to users who are members of the workspace the study lives in. Cross-workspace mentions are not supported in V1.6 (the underlying member-invite flow doesn't exist; cross-workspace collaboration is V1.7+).

- **Pros:** Clean permission model — comment visibility = workspace membership; no need to handle "Maya in workspace B mentions Hanna in workspace A" edge case yet.
- **Cons:** Limits the network effect to within a workspace until V1.7.

#### Option B — Allow mentions to any user with discoverability gate

Any user can be @mentioned; visibility into the mentioned user's `Yours` feed depends on study visibility.

- **Pros:** Network effect immediately.
- **Cons:** Lots of edge cases (mention someone who isn't on the platform yet; mention someone who can't see the study; mention spam). Premature for V1.6's scope.

**Pick: Option A.** Workspace-internal mentions only. Cross-workspace forking still works (per ADR-0002 public-forkable default) — the fork itself emits an event that the parent author sees in `Yours`, but cross-workspace @mentions in comments are deferred.

### Decision 5: Follow targets — which to ship in V1.6

IA v0.3 specified five targets: tag, author, Framework, study, saved-search. Which actually ship?

#### Option A — All five (rejected)

#### Option B — Four (tag, author, Framework, study) — chosen for V1.6

Saved-search needs a `saved_search` table + a save-search UI in the search modal. That's separate work. Defer saved-search-as-follow-target to V1.7 (Activity surface ships the empty-state for it).

- **Pros:** Covers the high-value targets; defers the bit that needs new infrastructure.
- **Cons:** A user can't yet "follow my search for misinformation studies on Prolific" — but they CAN follow the `misinformation` tag, which covers most of the same intent.

**Pick: Option B.** Four target types ship; saved-search is V1.7.

### Decision 6: Email digest

Architecturally ready in V1.6, not user-visible.

The fan-out handler that writes `notification` rows for the `Yours` feed also enqueues an `email_digest.batch_event` per recipient. V1.6 ships the event-emission but the handler is a stub (no-op). V1.7 implements the handler (chooses email provider, aggregates events into a daily digest, sends).

**Pick: ship the event, stub the handler.** Costs nothing in V1.6, makes V1.7 a pure feature-add not a refactor.

## Decision

**We will use:**

1. **Hybrid fan-out:** write-time fan-out for `Yours` feed (`notification` table); query-time computation for `Follows` feed (joining `activity_event` against `follow`).
2. **Flat comments** per target (`target_type ∈ {study, block_instance}`, `target_id`, timestamp-ordered).
3. **Both study-level and block-level comment targets**, discriminated by `target_type`.
4. **Workspace-internal @mentions only** in V1.6; cross-workspace collaboration deferred to V1.7+.
5. **Four follow target types** (tag, author, Framework, study) in V1.6; saved-search deferred to V1.7.
6. **Email digest event-emission ships; handler is stubbed** until V1.7.

## Full data model added in V1.6

```sql
-- Comments on studies or specific block instances.
CREATE TABLE comment (
  id                  text PRIMARY KEY,                    -- ULID
  workspace_id        text NOT NULL REFERENCES workspace(id),
  target_type         text NOT NULL CHECK (target_type IN ('study', 'block_instance')),
  target_id           text NOT NULL,                       -- experiment.id or block instance_id (the ULID inside definition_snapshot)
  experiment_id       text NOT NULL REFERENCES experiment(id),  -- denormalized for queryability; always the study the target belongs to
  author_user_id      text NOT NULL REFERENCES user(id),
  body_md             text NOT NULL,                       -- markdown; limited subset (see below)
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by_user_id text REFERENCES user(id),
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  edited_at           timestamptz                          -- nullable; presence indicates an edit
);
CREATE INDEX idx_comment_target ON comment (target_type, target_id, created_at DESC);
CREATE INDEX idx_comment_experiment ON comment (experiment_id, created_at DESC);

-- @mentions inside a comment, resolved at write time.
CREATE TABLE mention (
  id              text PRIMARY KEY,
  comment_id      text NOT NULL REFERENCES comment(id) ON DELETE CASCADE,
  mentioned_user_id text NOT NULL REFERENCES user(id),
  notified_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, mentioned_user_id)                   -- prevents double-notification on edits
);

-- Notification: one row per recipient × event for the Yours feed + unread counts.
CREATE TABLE notification (
  id                 text PRIMARY KEY,                     -- ULID
  recipient_user_id  text NOT NULL REFERENCES user(id),
  type               text NOT NULL,                        -- 'mention', 'fork', 'comment_on_your_study', 'comment_resolved', 'review_request', 'osf_push_complete', ...
  source_event_id    text NOT NULL,                        -- ULID of the originating event (idempotency anchor)
  target_type        text NOT NULL,                        -- 'study', 'block_instance', 'comment', 'experiment_version', etc.
  target_id          text NOT NULL,
  actor_user_id      text REFERENCES user(id),             -- who did the thing (nullable for system events)
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,    -- type-specific extra data (comment_id, divergence_summary, etc.)
  read_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_user_id, source_event_id)              -- idempotency: an event reaches a recipient at most once
);
CREATE INDEX idx_notification_recipient_unread ON notification (recipient_user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notification_recipient_recent ON notification (recipient_user_id, created_at DESC);

-- Append-only event log for the Follows feed (and audit).
CREATE TABLE activity_event (
  id              text PRIMARY KEY,                        -- ULID
  type            text NOT NULL,                           -- same enum as notification.type
  actor_user_id   text REFERENCES user(id),
  workspace_id    text REFERENCES workspace(id),           -- nullable for cross-workspace events (e.g., public fork)
  target_type     text NOT NULL,
  target_id       text NOT NULL,
  -- denormalized "followable attributes" of the target — drives the Follows feed join
  related_tag_slugs text[],                                -- tags on the study/framework/etc. at event time
  related_author_user_id text REFERENCES user(id),         -- the author whose work the event is about (study author, framework author)
  related_framework_id text,                               -- if the event is about a study derived from a framework
  related_study_id text,                                   -- if the event is about a specific study (forks, comments, preregs)
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_event_recent ON activity_event (created_at DESC);
CREATE INDEX idx_activity_event_tag ON activity_event USING GIN (related_tag_slugs);
CREATE INDEX idx_activity_event_author ON activity_event (related_author_user_id, created_at DESC);
CREATE INDEX idx_activity_event_framework ON activity_event (related_framework_id, created_at DESC);
CREATE INDEX idx_activity_event_study ON activity_event (related_study_id, created_at DESC);

-- A user's follow targets.
CREATE TABLE follow (
  id              text PRIMARY KEY,                        -- ULID
  user_id         text NOT NULL REFERENCES user(id),
  target_type     text NOT NULL CHECK (target_type IN ('tag', 'author', 'framework', 'study')),  -- saved_search deferred to V1.7
  target_id       text NOT NULL,                           -- for tag: the slug; for author/framework/study: the entity id
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);
CREATE INDEX idx_follow_user ON follow (user_id);
CREATE INDEX idx_follow_target ON follow (target_type, target_id);
```

## Event types (V1.6 scope)

Constants in `server/events/types.ts`:

```typescript
export type EventType =
  | 'mention'                    // @mention in a comment
  | 'comment_on_your_study'      // someone commented on a study you author
  | 'comment_resolved'           // your comment was marked resolved
  | 'fork'                       // someone forked your study
  | 'osf_push_complete'          // your preregistration's OSF push completed
  | 'review_request'             // someone hit "Save & request review" mentioning you
  | 'preregister_complete'       // a study (yours or one you follow) was preregistered
  | 'new_named_version';         // a study you follow saved a new named version
```

Each event emission goes through a single function `emit(eventType, payload)` that:

1. Writes the `activity_event` row (always; it's the canonical record).
2. Determines recipients via a per-type recipient-resolution function (e.g., `fork` → study author; `mention` → mentioned user; `comment_on_your_study` → study author + workspace members who commented earlier on the same target).
3. Writes one `notification` row per recipient via Inngest fan-out job (idempotent via the unique constraint).
4. Enqueues an `email_digest.batch_event` per recipient (V1.6 stub handler; V1.7 implements).

## Inngest job topology

```
study.fork.created            → fanout-fork-notifications
                              → email-digest-batch (stub)
comment.created               → resolve-mentions
                              → fanout-comment-notifications
                              → email-digest-batch (stub)
comment.resolved              → fanout-comment-resolved-notification
study.preregister.completed   → fanout-preregister-notifications
                              → email-digest-batch (stub)
study.osf_push.completed      → fanout-osf-push-notification
study.named_version.created   → fanout-named-version-notifications
                              → email-digest-batch (stub)
```

All jobs idempotent (the unique constraint on `notification(recipient_user_id, source_event_id)` makes double-fire safe).

## Comment markdown allowance

Limited subset:

- Bold (`**text**`), italic (`*text*`).
- Code spans (`` `code` ``) and code blocks (triple-backtick).
- Links (`[text](url)`) — URL allowlist: `http://`, `https://`, `mailto:`. No JS schemes.
- Line breaks (two trailing spaces or blank line for paragraph).
- @mentions (`@username`) — parsed via separate regex at write time, resolved against workspace members, persisted in `mention` table.

**Not allowed:** images (defer; needs upload pipeline + abuse mitigation), headers, lists (renders awkwardly in inline comments), arbitrary HTML, embeds.

Rendering: use a markdown library configured with the allowlist (e.g., `marked` with custom renderer + DOMPurify sanitization) on the server; render to safe HTML at read time.

## Consequences

**What becomes easier:**

- The Maya-reviews user story works end-to-end with a coherent data model.
- Adding new event types (e.g., V1.7's "your-study-completed-100-responses" notification) is a recipient-resolver + an Inngest job — no schema change.
- Email digest in V1.7 is a pure feature-add (the events are already being enqueued).
- Per-recipient unread counts are a single indexed query (`SELECT count(*) FROM notification WHERE recipient_user_id = ? AND read_at IS NULL`).
- The `Follows` feed is flexible: adding a new follow target type in V1.7 (saved_search) means adding a new `target_type` enum value + extending the recipient-resolution join, not redesigning.

**What becomes harder:**

- Write amplification on fan-out for events with many recipients. At V1.6 scale (workspaces <100 members) this is fine; revisit when a workspace crosses ~1000 members or a tag crosses ~1000 followers (probably V2+).
- The `activity_event.related_*` denormalized columns require event-emission code to be careful to populate them correctly. A bug here means events don't surface in the right Follows feeds. **Mitigation:** unit tests on the recipient-resolution + Follows-feed-query functions, exercised by the V1.6 e2e.
- Comment markdown sanitization is a security surface. **Mitigation:** server-side DOMPurify with strict allowlist; tested against XSS payloads.

**What we are now committed to:**

- The five-table data model above. Migration lands in V1.6 as the first work item after the pre-work pre-roll (condition-builder UI + response modules + V1.5 carry-forwards).
- Inngest as the fan-out engine. Reinforces ADR-0007 + the V1.5 BackgroundJobAdapter.
- Flat per-target comments (no threading) in V1.6.
- Workspace-internal mentions only in V1.6.
- Four follow target types in V1.6 (saved_search → V1.7).
- Email digest events emitted in V1.6, handler stub no-op until V1.7.
- The unique constraint pattern for idempotent fan-out — every recipient row is keyed on `(recipient_user_id, source_event_id)`.

**What we are now precluded from:**

- Tree-threaded comments without an ADR amendment.
- Cross-workspace @mentions in V1.6 (the data model accommodates it; the permission policy refuses it).
- Replacing Inngest with another job runner without touching the fan-out emit/handler code — but that's the adapter discipline working as designed.
- Anonymous comments (Share stage is authenticated-only per IA v0.3).
- Image attachments in comments in V1.6.

## Revisit triggers

- Cross-workspace member invites land (V1.7+). Mentions extend to cross-workspace; permission model needs another pass; the `activity_event.workspace_id` nullability gets exercised.
- A workspace crosses ~1000 members OR a popular tag crosses ~1000 followers. Fan-out write amplification becomes an operational concern; consider partitioning the `notification` table or moving to a queue-backed read model.
- Real user research shows comment threading is being faked via "@reply to Maya" prose patterns; we may want to add tree-threading.
- Email digest handler lands in V1.7 and reveals event-emission gaps (events not being emitted when they should be); fix in V1.7 ADR amendment.
- Compliance request for comment audit log / immutable history. Currently comments support edit-in-place via `edited_at`; if we need full history, add a `comment_revision` table.
- Image attachments become a real demand (probably with the participant-runtime stimulus upload feature in V2).

## Amendment (2026-06-15) — `module` as a fifth follow target

This ADR locked **four** follow targets (tag, author, framework, study; saved_search → V1.7). V1.13.0's Library destination surfaces reusable modules, and a researcher who builds on a module wants to hear when it changes (new version / breaking change / deprecation). So **`module` is added as a fifth `follow.target_type`** — no new mechanism, just one more allowed value.

- **Schema:** the `follow_target_type` CHECK widens to include `'module'` (migration `0013`, additive — existing rows stay valid). `target_id` for a module follow is its **`source/key`** (version-agnostic — you follow the module, not a pinned version), matching how `modules.versions` / `modules.usedIn` key a module.
- **Surface:** the one reusable `FollowButton` on the Library module inspect (`module-library.tsx`); `FOLLOW_TARGET_TYPES` gains `module`, so `follow`/`unfollow`/`myFollows` accept it with no other change.
- **Known limitation (deliberate):** modules don't emit `activity_event`s yet, so the Activity·Follows feed's partition intentionally omits `module` — a module follow is a **stored subscription** that produces no feed rows until module-update events exist. Recording the intent now keeps the data ready. **Revisit trigger:** when module versioning emits events (a `module_version_published` / `module_deprecated` event type), wire the feed partition + a reason label.
- **Why not a new ADR:** this reuses the follow primitive wholesale (no table, no pattern) — it's an extension of this ADR's decision, not a new architectural concept.

## References

- ADR-0001 — modular composition; block instance ids are the `target_id` for block-anchored comments.
- ADR-0002 — forking model; the `fork` event type fires when an Experiment with a `parent_version_id` is created.
- ADR-0004 — preregistration amendments; `preregister_complete` event fires on new `kind:preregistered` ExperimentVersion.
- ADR-0005 — OSF integration; `osf_push_complete` event fires from the existing registry-push Inngest job.
- ADR-0007 + 2026-05-29 amendment — Path A + adapter discipline; Inngest BackgroundJobAdapter is the fan-out engine.
- ADR-0011 — scaffold strategy; the five new tables land in `05_app/server/db/schema.ts` as the first V1.6 migration after pre-work.
- ADR-0013 — participant runtime; not changed by V1.6, but the `osf_push_complete` event references the preregistered version this runtime serves.
- ADR-0014 — response data model; `comment.target_type = 'block_instance'` references the same block instance_id this ADR's runtime stores answers against.
- `03_design/ia/information-architecture.md` v0.3 — specified all four V1.6 surfaces (Share / Replications / Activity / Follow affordances) and the five follow target types this ADR implements four of.
- `02_product/personas/principal-investigator.md` — Maya, the V1.6 anchor persona.
- `02_product/personas/burned-replicator.md` — Sofia, the cross-workspace fork actor in the V1.6 user story.
- Twitter's read-time-vs-write-time timeline architecture is the canonical reference for the hybrid fan-out choice; Slack's notification + activity model is the closest analogue to the bell-less in-product unread pattern IA v0.3 picked.
