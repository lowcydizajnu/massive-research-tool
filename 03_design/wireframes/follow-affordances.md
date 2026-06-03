# Wireframe spec — Follow affordances + Activity · Follows

- **Serves user flow:** [Hanna build a study](../../02_product/user-flows/hanna-build-a-study.md) + [Browse frameworks](../../02_product/user-flows/browse-frameworks.md) (staying current in an area).
- **IA placement:** [Information architecture](../ia/information-architecture.md) §"Following / staying current" (five follow targets; `+ Follow` on tag chips / author bylines / Framework details / study details / search) + §"Activity sub-nav" (Follows).
- **Persona:** [Maya Okonkwo — PI](../../02_product/personas/principal-investigator.md) (follows her area + her people).
- **Status:** draft

## Purpose

The retention surface. A researcher subscribes to **four follow targets** (ADR-0015 Decision 5B; saved-search deferred): a **tag**, an **author**, a **Framework**, a **study**. Those subscriptions feed **Activity · Follows** (`activity_event × follow`, query-time). This spec covers (a) the reusable **`+ Follow` button** and its four placements, and (b) the **Follows feed** rows. Builds on [activity-destination.md](activity-destination.md) (the Follows tab shell), ADR-0015 (follow targets + query-time fan-out), and ADR-0017 (study-level tags — the tag follow target's data home).

## Layout

There is no standalone screen for following — the affordance is **attached to existing surfaces**, and the feed lives in the existing Activity destination:

- The **`+ Follow` button** sits inline on four host surfaces: a study-level **tag chip**, an **author byline**, the **Framework detail** surface, and the **study Details** panel. It is chip-scale so it never dominates its host.
- The **Follows feed** is the second tab of the Activity destination (activity-destination.md) — a single newest-first vertical list of event rows, replacing PR-2's deferred empty-state.

## Content inventory

- **Follow button** — a toggle showing `+ Follow` (not following) or `Following` (following, click to unfollow); chip-scale; an accessible name naming the target; pending/disabled during the mutation; hidden entirely for self (own author/study).
- **Follows feed row** — actor + researcher-native verb phrase + target link + relative time + a **"why you see this"** marker naming the follow that matched (e.g. "Following misinformation"). No unread/read state.
- **Follows empty state** — copy pointing the user at the `+ Follow` affordances.

## The Follow button

A single small toggle component reused on every surface:

- **Not following:** `+ Follow` (outline/ghost chip). Click → `follows.follow({targetType, targetId})` → flips to **Following** optimistically.
- **Following:** `Following` (filled/subtle). Hover/focus reveals it can be clicked to **Unfollow** (label stays "Following"; the action toggles off) → `follows.unfollow(...)`.
- **Size:** chip-scale (`text-small`, `radius-md`), so it sits inline next to a tag chip, a byline, or a details row without dominating.
- **State source:** the client knows the user's follows via `follows.myFollows` (one query, cached) and looks up `(targetType,targetId)` membership; the button reflects + invalidates that.

### Placements

1. **Tag chip** — every study-level tag chip (ADR-0017) renders the tag text + a trailing `+ Follow`/`Following` affordance. Appears wherever study tags show: the **study Details** panel, the **Share** stage header, and the **study card**. `targetType:"tag"`, `targetId:` the tag slug.
2. **Author byline** — next to a study's owner name (the Builder **Details** panel "Owner" row; any "by {author}" byline). `targetType:"author"`, `targetId:` the author's user id. The button is hidden when the author is the current user (you don't follow yourself).
3. **Framework Details** — on the framework detail surface (frameworks-browse.md), next to the Framework name. `targetType:"framework"`, `targetId:` the framework key.
4. **Study Details** — a **Follow this study** affordance in the Builder **Details** panel (so a collaborator can track a study they don't own). `targetType:"study"`, `targetId:` the study id. Hidden for the study's own owner (they get Yours notifications already).

## Activity · Follows feed

Replaces the PR-2 deferred empty-state in the **Follows** tab of the Activity destination.

- **Source:** `follows.feed` — `activity_event` rows that match ANY of the user's follows: tag (the event's `related_tag_slugs` overlaps a followed tag), author (`related_author_user_id` = a followed author), framework (`related_framework_id` = a followed framework), study (`related_study_id` = a followed study). Newest-first; the user's own actions are excluded.
- **Row anatomy:** same shape as Yours rows (actor + researcher-native verb phrase + target link + relative time), plus a small **"why you see this"** tag — the follow that matched ("Following misinformation" / "Following Hanna" / "Following Misinformation Framework" / "Following {study}"). No unread/read state on Follows (it's a stream, not a to-do; only Yours carries the unread badge).
- **Verb phrases (Follows-relevant events):** `preregister_complete` → "{actor} preregistered {study}", `new_named_version` → "{actor} saved a new version of {study}", `fork` → "{actor} replicated {study}", `osf_push_complete` → "{study}'s OSF registration is live".
- **Empty state:** "Your Follows feed is empty. Follow a tag, an author, a Framework, or a study — look for **+ Follow** on tags, bylines, and details panels." (links/points at the affordances).

## States

- **Follow button:** not-following (`+ Follow`) · following (`Following`) · pending (briefly disabled during the mutation) · self (hidden, for author/study).
- **Follows feed:** has-items (rows + the matched-follow tag) · empty (the empty-state above) · loading (skeleton) · error (inline alert).

## Interactions

- **Follow / Unfollow** — `follows.follow` / `follows.unfollow`; optimistic toggle; invalidates `follows.myFollows` (+ `follows.feed` so a new follow's history can appear).
- **Open Follows** — the Activity Follows tab reads `follows.feed`.
- **Click a feed row** — navigates to the study (or Framework) the event is about.

## Edge cases

- **Idempotent follow:** the `follow` table's `UNIQUE(user_id, target_type, target_id)` makes a double-follow a no-op (ON CONFLICT DO NOTHING); unfollow of a non-follow is a no-op.
- **Follow yourself / your own study:** the affordance is hidden (author/study targets check `targetId !== currentUserId` / `study.ownerId !== currentUserId`).
- **Empty related fields:** events with no tags/framework (e.g. a comment) simply don't match tag/framework follows — that's expected; they reach Follows only via author/study matches.
- **Cross-workspace:** follows are identity-scoped (like notifications) — you follow people/areas across the network, not within one workspace. The Follows feed reads `activity_event` regardless of workspace, subject to study visibility (public/forkable studies surface; private ones the follower can't see are filtered — V1.7 keeps it simple: only events the follower's workspace membership or the study's public-forkable status permits).
- **A tag with no events yet:** following it is still valid; the feed just shows nothing for it until a matching event fires.

## Accessibility notes

- The Follow button is a real `button` with an accessible name that includes the target ("Follow the misinformation tag" / "Following Hanna — click to unfollow"); state conveyed by text, not color alone.
- Tag chips pair the tag text with the follow control; the control is keyboard-reachable and not nested inside another interactive element (chip text + button are siblings).
- Follows feed rows are `article`/`li` with an accessible sentence + a visually-distinct but text-labelled "why you see this" marker.

## Vocabulary check (developer-term gate)

Feed copy uses researcher-native verbs: **replicated** (not forked), **preregistered** / **saved a new version** (not "pushed" / "named version event"), **OSF registration** (the user-facing artifact). "Follow" itself is researcher-native (Replicate/Adapt aside, following an author or area is plain language).

## Open questions

- **Saved-search follow target** — the fifth target (ADR-0015 Decision 5); deferred to V1.7+ (needs a saved-search table + search-modal UI). The Follows empty-state doesn't mention it yet.
- **Per-target notification cadence** — still deferred (Settings · Notifications home; ADR-0015 Decision 6, email stubbed).
- **Follows feed pagination** — caps at recent N like Yours; revisit when feeds get long.
- **Study visibility filtering** — V1.7 uses the simple public-forkable / membership rule above; a richer visibility model is a later refinement.
