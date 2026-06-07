# Wireframe spec — Browse public studies

- **Serves user flow:** [Discover and replicate public studies](../../02_product/user-flows/discover-and-replicate-public-studies.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Sofia — burned replicator](../../02_product/personas/burned-replicator.md)
- **Status:** draft

## Purpose

Make publicly-shared studies discoverable — so a researcher who doesn't already have a study's id or link can find one by tag/author, read it, and replicate it into their own workspace in one click.

## Layout

Standard three-zone modular surface per brief v0.6 — slim top bar (destination switcher now includes **Browse**), a **left filter sidebar** (~240px), and a **center card grid** (3 columns at desktop, responsive down to 1). No right context panel. A study card opened from the grid routes to a read-only public Details surface (`/browse/[studyId]`) that reuses the Builder chrome minus editing affordances.

## Content inventory

- **Destination switcher** — Studies · Library · Frameworks · Activity · **Browse** (new). Source: static nav; "Browse" active here.
- **Filter sidebar:**
  - **Tag multiselect** — autocomplete of tag slugs with usage counts. Source: `studies.browseTags({ q })`. Multiple tags = intersect (a study must carry all selected tags).
  - **Author search** — text input matching display name. Source: filters `studies.browsePublic({ filters: { authorQuery } })`.
  - **Sort toggle** — `Most recent` (default) / `Most replicated`. Source: `browsePublic` `sort`.
  - **Clear filters** — resets to the unfiltered "all public" listing.
- **Study card** (grid item). Source: one row from `studies.browsePublic`:
  - **Title** (Plex Serif), links to `/browse/[studyId]`.
  - **Author byline** — display name + **+Follow** (reuses the V1.7 follow affordance, `targetType: 'author'`).
  - **Tag chips** — each a **+Follow** target (`targetType: 'tag'`); clicking the chip body adds it to the tag filter.
  - **Version marker** — `Published vN` or `Preregistration vN` (the latest discoverable version).
  - **Replication count** — "N replications" (fork count; 0 → omitted).
  - **Replicate** CTA — primary button (see Interactions).
- **Result count + pagination** — "Showing N" + a `Load more` cursor button (limit ~24/page).
- **Public Details surface** (`/browse/[studyId]`) — read-only render of the latest published/preregistered version's blocks (block name + `source/key@version`), title, author byline (+Follow), tags (+Follow), version marker, and a top-right **Replicate** CTA. No Configure controls, no stage tabs beyond a back-to-Browse link.

## States

- **Default** — populated 3-col grid, sort = Most recent, no filters.
- **Loading** — card skeletons in the grid; sidebar inputs disabled until the first tag list resolves.
- **Empty (no public studies at all)** — "No public studies have been shared yet. Check back soon." (No CTA — nothing to broaden to.)
- **Empty (filters exclude everything)** — "No public studies match those filters yet — try a broader search, or browse all." with a **Clear filters** button.
- **Partial** — `Load more` appended page while the prior page stays rendered; spinner on the button only.
- **Error** — "Couldn't load public studies. Retry." with a retry button; filters preserved.
- **Replicate in-flight / success** — see Interactions (workspace picker → redirect).

## Interactions

- **Click a card title / card body** — routes to `/browse/[studyId]` (read-only Details).
- **Tag chip (body)** — adds that tag to the sidebar filter (does not navigate). **Tag chip (+Follow)** — follows the tag; reuses the V1.7 affordance.
- **Author +Follow** — follows the author.
- **Tag multiselect** — typing queries `browseTags`; selecting intersects results; removing a token re-broadens.
- **Sort toggle** — re-queries with `sort: 'recent' | 'replicated'`; resets the cursor.
- **Replicate** (card or Details) — affordance: primary button. Action: if the user has one workspace, calls `studies.fork` straight away; if multiple, opens a small **destination-workspace picker** first. System response: spinner (`PendingButton`), then redirect to the new fork's Builder. Error path: if the source is no longer public (race), a toast "This study is no longer public" + the card refreshes/drops.
- **Load more** — fetches the next cursor page, appends; button shows a spinner.

## Edge cases

- **Very long title / author / tag** — title wraps to two lines max then truncates; author byline single-line ellipsis; tag chips wrap, overflow beyond 4 collapses to "+N".
- **Zero / one / many** — empty states above; a single result still uses the grid; thousands paginate by cursor (no offset scans).
- **Slow network** — skeletons; `Load more` and Replicate disable while pending.
- **Permissions** — Browse listing + Details are public-readable (no workspace needed to view); Replicate requires a signed-in user with a workspace (a signed-out viewer's Replicate routes to sign-in first).
- **A study public but with only a Draft (no published/preregistered version)** — excluded from the listing by design (nothing citable to show).

## Accessibility notes

- The grid is a list of articles: each card `role="article"` with an accessible name = the study title. The +Follow buttons use `aria-pressed` (V1.7 pattern). Tag chips that both filter and follow expose two distinct controls, not one ambiguous target.
- Filter sidebar is a labelled `<form>`; the sort toggle is a `radiogroup`; the tag multiselect is a combobox with `aria-expanded`/active-descendant.
- Replication count and version marker never rely on color alone.
- `Load more` moves focus to the first newly-loaded card so keyboard users don't lose their place.

## Open questions

- **Framework chip + framework filter — deferred.** The schema doesn't persist study→framework provenance (no `framework_key` on `experiment`; create-from-framework copies blocks only). Showing a framework chip or filtering by framework needs an additive column + recording it at create time — out of V1.8 scope per owner decision (2026-06-07). Revisit if framework-based discovery is wanted; the filter sidebar leaves room for it.
- **"Most replicated" tie-break** — currently falls back to most-recent within equal counts; revisit if it matters.
- Whether Browse should surface `link-only` studies to members of the owning workspace (today: public-only listing; members already see their own under Studies).
