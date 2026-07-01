# ADR 0059 — Workspace Playground / Cowork

- **Status:** accepted
- **Date:** 2026-06-21
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** data-model, workspace-destination, collaboration, reuse

## Context

> What is forcing this decision?

Today the workspace has no home for the work that happens *before* a study exists. Researchers gather inspiration — links, half-formed questions, competitor stimuli, candidate papers — somewhere else (Slack, a shared drive, email attachments) and then re-key it into the Builder. The persona work names this precisely: Hanna's pain is "copying my design from one box to another," and the strategic insight is that **the switching unit is a group, not a person** (`01_research/insights/researcher-tooling-pain-points.md`). A shared, pre-build collection space is group-shaped and attacks both at once.

The owner approved a **Playground / Cowork** section: a new **workspace destination** (left rail, alongside Studies/Library/Frameworks per the ADR-0046 destination pattern) holding a **board of typed cards** — link, note/question, image/file, reference/citation, and (later) to-do and poll/vote — with **comments on every card** and a **convert-card → draft-study** action that carries material across so the build no longer starts blank.

Crucially, almost every capability this feature needs **already exists**: comments + activity/notifications (ADR-0015, `commentsRouter`, the `comment` table), media upload (the `/api/media` gateway + `UploadButton`), DOI resolution (the Crossref `CitationAdapter` behind the ADR-0007 vendor seam, surfaced as `studyRecord.lookupCitation`), and study creation (`studies.create`). The decision is therefore mostly about **what new state we own** and **how hard we lean on reuse**, while honoring the PII boundary (ADR-0014) and the vendor-adapter seam (ADR-0007). The owner also asked to **phase** delivery: Phase 1 = link/note/image-file/reference + comments + convert-to-study; Phase 2 = to-do + poll/vote.

## Options considered

> ### Option A — A dedicated `playground_card` table that reuses comments / media / Crossref (chosen)
>
> - Add one new table, `playground_card`, owning card identity, kind, and the small per-kind fields. **Reuse everything else:** comments via the existing `comment` table (new `targetType:"playground_card"`), images via the existing media uploader (`mediaKey` / `/api/media`), references via the existing Crossref adapter (`refDoi` + `studyRecord.lookupCitation`), conversion via `studies.create`. A thin `playground` tRPC router does CRUD + reorder + convert; no new vendor SDKs.
> - **Pros:** one clear owned primitive; the board is queryable and orderable; reuse keeps the new surface tiny and inherits permissions, activity, and the PII posture of the systems it borrows; phaseable by adding columns/kinds per phase.
> - **Cons:** a new table + per-phase migrations; we own card lifecycle (archive, convert-linkage).

> ### Option B — Overload existing notes/comments (no new table)
>
> - Represent cards as root-level comments (or "notes") on the workspace, distinguished by a tag, with images as comment attachments and references as comment text.
> - **Pros:** zero new tables; ships fastest.
> - **Cons:** abuses a primitive built for *discussion threads on a target* — there is no typed `kind`, no first-class `position`/ordering, no clean `url`/`mediaKey`/`refDoi`/`assigneeUserId`/`done` fields, and convert-to-study would have to parse free text. It also collides conceptually with comments-on-cards (we'd have comments-on-comments). Violates "don't overload an existing primitive" and would relitigate ordering, kinds, and PII shape later. Rejected.

> ### Option C — Integrate an external board tool (Miro/FigJam/Notion embed)
>
> - Embed or link a third-party board; don't build cards at all.
> - **Pros:** rich board UX for free.
> - **Cons:** the persona's hard requirement is "not a walled garden you can't get your data out of"; an external board defeats convert-to-study (no path from a Miro sticky into `studies.create`), adds a new vendor/PII surface and auth, and fractures the "design, prereg, and experiment are the same object" positioning. Rejected.

## Decision

> A single, declarative sentence.

**We will add a single new `playground_card` table behind a thin `playground` tRPC router for a new workspace Playground destination, and reuse the existing systems for everything else — comments (ADR-0015, via a new `targetType:"playground_card"`), media upload (`/api/media` + `UploadButton`), DOI resolution (the Crossref `CitationAdapter` behind the ADR-0007 seam), and study creation (`studies.create`) for convert-to-study — delivered in two additive, migration-per-phase steps (Phase 1: link/note/image-file/reference + comments + convert; Phase 2: to-do + poll/vote).**

Reasoning: the only genuinely new concept is "a typed, orderable card that lives before a study." Everything else is plumbing we already have and have already reasoned about (permissions, activity, PII, vendor seams). Owning exactly one table keeps the blast radius small, keeps the board first-class (typed, orderable, queryable), and lets convert-to-study be a structured copy rather than text-parsing. Phasing is expressed as *additive columns and new `kind` values*, never a rewrite — Phase 2 turns on fields that Phase 1 leaves null.

### Data-model sketch

New table `playground_card` (target folder for the formal entry: `04_architecture/data-model/`):

| column | type | notes |
| --- | --- | --- |
| `id` | ULID, PK | matches the project's id convention (cf. `comment.id`) |
| `workspaceId` | fk → workspace | the board is per-workspace; the destination scope |
| `kind` | enum `link \| note \| image \| file \| reference \| todo \| poll` | `todo`/`poll` are **Phase 2** values |
| `title` | text, nullable | short label; for link/reference may be filled from paste-text / Crossref |
| `body` | text (markdown), nullable | note/question content |
| `url` | text, nullable | link cards |
| `mediaKey` | text, nullable | image/file cards — the existing `/api/media` key from `UploadButton` |
| `refDoi` | text, nullable | reference cards — resolved via Crossref adapter |
| `assigneeUserId` | fk → user, nullable | **Phase 2** (to-do) |
| `done` | boolean, default false | **Phase 2** (to-do) |
| `position` | float/int | board ordering (drag-to-reorder) |
| `createdByUserId` | fk → user | author |
| `createdAt` / `updatedAt` | timestamptz | standard timestamps |

Reuse, not new tables, for the rest:
- **Comments** → existing `comment` table + `commentsRouter`, adding `targetType:"playground_card"` with `targetId = playground_card.id`; activity/notifications come for free (ADR-0015).
- **Votes (Phase 2)** → prefer a generic reaction/vote primitive if one exists at build time; otherwise a minimal `playground_card_vote(cardId, userId, value)` join table. Decided in this ADR's favor of reuse-first; the formal data-model entry records the final shape.
- **Convert-to-study** → `studies.create`, then map the source card(s): `url → initial link`, `body/title → initial notes`, multi-select → one draft's initial materials. Non-destructive: the source card is linked, not deleted. No new study-creation path.

**Additive / migration-per-phase.** Phase 1 ships the table with `kind ∈ {link,note,image,file,reference}` and leaves `assigneeUserId`/`done` (and any vote table) unused. Phase 2 is a forward-only migration that enables `kind ∈ {todo,poll}` and the vote storage — no destructive change to Phase-1 rows.

## Consequences

> - **What becomes easier.** Capturing pre-build material in one shared, group-shaped place; discussing it where it lives (reused comments); starting a study pre-seeded instead of blank (directly attacks "copying from one box to another"); a durable record of what was considered and rejected.
> - **What becomes harder.** We now own card lifecycle (create/edit/reorder/archive/convert-linkage) and a per-phase migration discipline; a new left-rail destination to keep coherent with the others (ADR-0046).
> - **What we are now committed to.** Exactly one new owned primitive (`playground_card`); comments/media/Crossref/study-create flowing through their **existing** routers and the ADR-0007 vendor seam (no parallel paths); the PII boundary (ADR-0014) — Playground stores researcher-authored content, never participant PII, and adds no IP/UA capture.
> - **What we are now precluded from.** A free-form external board (Option C); overloading comments/notes as the card store (Option B); cross-workspace boards in v1 (a board is per-workspace; cross-workspace sharing would be a separate decision, cf. ADR-0018).

## Revisit triggers

> Conditions under which we reopen this.

- A generic reaction/vote primitive lands elsewhere in the product → adopt it for Phase 2 polls instead of a dedicated table.
- Teams want **cross-workspace** boards or board templates → reopen scope (relates to ADR-0018 forking).
- Demand for **link unfurling / OG previews** → introduces a server-side fetch; must be designed behind the vendor seam (ADR-0007) with a PII review (ADR-0014).
- Boards routinely exceed a few hundred cards → revisit board pagination/virtualization and `position` strategy.
- Convert-to-study needs richer mapping (e.g. references → study record citations) than a simple notes/links carry → expand the convert contract.

## References

> - Links to relevant code, prior ADRs, external docs.

- ADRs: [0015 notifications / comments / activity](0015-notifications-comments-activity.md) (comments + activity reuse), [0046 team destination](0046-team-destination.md) (workspace-destination + left-rail pattern), [0007 path A vs B](0007-path-a-vs-b.md) (vendor-adapter seam), [0014 response data model & conditioning](0014-response-data-model-and-conditioning.md) (PII boundary), [0005 OSF integration](0005-osf-integration.md) (why Playground is *not* an OSF archive surface), [0018 cross-workspace forking](0018-cross-workspace-forking.md) (why boards stay per-workspace in v1).
- Code: `05_app/server/db/schema.ts` (`comment` table, the id/timestamp conventions to match), `05_app/server/trpc/routers/comments.ts` (`commentsRouter`), `05_app/components/feature/builder/upload-button.tsx` (`UploadButton`, returns the `/api/media` URL), `05_app/app/api/media/[...key]/route.ts`, `05_app/server/adapters/citation.ts` + `citation.crossref.ts` (`CitationAdapter`), `05_app/server/trpc/routers/study-record.ts` (`studyRecord.lookupCitation`), `05_app/server/trpc/routers/studies.ts` (`studies.create`), `05_app/components/chrome/left-rail.tsx` (`DESTINATIONS`), `05_app/app/(app)/(workspace)/` (route group for the new destination).
- User flow: [collect-inspiration-in-playground](../../02_product/user-flows/collect-inspiration-in-playground.md).
- Wireframe: [workspace-playground](../../03_design/wireframes/workspace-playground.md).
