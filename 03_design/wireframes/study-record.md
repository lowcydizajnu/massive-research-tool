# Wireframe spec — Study Record page

- **Serves user flow:** [Finish a study and publish its record](../../02_product/user-flows/finish-a-study-and-publish-its-record.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna — postdoc operator](../../02_product/personas/postdoc-operator.md) (author/composer); [Sofia — burned replicator](../../02_product/personas/burned-replicator.md) (reader)
- **Status:** draft

## Purpose

Be the readable, citable, comparable face of a **finished** study — the page a browser lands on (instead of the Builder) and the page an author composes when they mark a study finished. It must read like a paper at a glance and let a reader decide whether to cite, follow, or replicate.

## Layout

A single scrollable column on parchment (`surface.page`), max ~760px reading width, with a sticky right-rail action card on wide viewports (collapses below the header on mobile). Researcher-native vocabulary throughout (Record, Finished, Replicate, Preregistration, Saved version).

- **Header band** — Plex Serif title; author byline (+Follow); workspace/lab; **Finished** status chip + date; tags (each +Follow); identifiers row (OSF DOI, article DOI/journal link if set).
- **Body = ordered sections** (the composed layout). Default order: Abstract → Method → Results → Data → Preregistration → Replications → Materials → Cite. Bound sections render from study data; authored sections render content.
- **Right-rail action card** — primary **Replicate** (only when Finished + public), secondary **Use as template**; **Cite** (copy citation), **Follow study**, **Open on OSF**, **Compare** (side-by-side with another version/record). For the owner: **Edit record** (enters composer) + visibility chip.

## Content inventory

Bound sections (auto-resolved; owner can reorder/show-hide, not edit content):
- **Method** — overview summary + protocol blocks (names + refs) + conditions; the comparable skeleton. Source: server (version snapshot).
- **Results** — headline figures/charts from the results data (per-condition Ns, key measures). Source: computed; aggregate only.
- **Data** — "browse / download" affordance; **aggregate/derived only** for public Records (raw participant data never public, ADR-0014); link to OSF data component if synced.
- **Preregistration** — frozen prereg snapshot + OSF DOI + "view registration." Source: server.
- **Replications** — lineage summary (count + intents) + link to the lineage tree. Source: `getReplications`.
- **Materials** — link to the participant **Preview** (existing `/preview`) + any stimuli.

Authored sections (content entered by the owner):
- **Abstract** — required to publish public; ≤ ~2000 chars.
- **Results narrative** — prose interpretation.
- **Article link** — DOI or journal URL (+ "Published in …").
- **Custom** — free prose/media blocks (markdown + image via the existing `/api/media` gateway).

Header/meta: title, author(+Follow), tags(+Follow), Finished date, OSF DOI, status chip, visibility chip (owner only).

## States

- **Default (Finished, public):** full Record; action card shows Replicate + Cite + Follow + OSF.
- **Loading:** skeletoned sections (header first, then bound sections stream).
- **Empty:** a Finished study with only bound sections (no abstract) reads as "preliminary record — abstract pending"; public publish is blocked until an abstract exists.
- **Partial:** results still computing → Results section shows "Results are being prepared."
- **Not finished (if reached by URL):** show the protocol preview + a "Preliminary — this study isn't finished yet. Follow to know when results land." banner; Replicate hidden, Template shown.
- **Workspace-only Record (viewed by a member):** same page, no public-only affordances; a "Visible to your workspace" chip.
- **Permission denied (private Record, outsider):** 404-style "This record isn't public."
- **Error:** section-level error card with retry; the rest of the page still renders (one failing bound section never blanks the page).

## Interactions

- **Replicate** — only when Finished + public; opens the intent dialog (Direct/Conceptual/Extension), then forks (ADR-0018/0039); notifies the original author.
- **Use as template** — copies the design with fresh ids, no lineage, no notification.
- **Cite** — copies a formatted citation (authors, year, title, DOI).
- **Follow study / author / tag** — existing FollowButton.
- **Compare** — opens side-by-side (reuse the multi-version compare pattern) against another version/record.
- **Owner · Edit record → the composer (drag-and-drop):** enters an edit mode with a **section palette** on the side. The palette lists section *types* grouped as **From your data** (bound: Method, Results, Data, Preregistration, Replications, Materials — each shows a live preview of what it'll resolve) and **Write your own** (authored: Abstract, Narrative, Article link, Custom). Drag a section into the column to add; drag to reorder; per-section overflow menu = hide / remove / (bound) "what feeds this?". Authored sections edit inline. A sticky footer: visibility selector (Workspace / Public) + **Publish record** (validates abstract for public) + "Sync to OSF" (if connected). This reuses the dashboard customization interaction + persistence model (Stream F), not a new engine.

## Edge cases

- Very long title/abstract/author lists → clamp with "show more"; title wraps to 2 lines then ellipsizes.
- Zero replications → Replications section reads "No replications yet." Many (100s) → show top N + "view all" to the lineage tree.
- A bound section with no data (e.g. no preregistration) → the owner sees it greyed in the palette ("nothing to show yet"); it's auto-hidden on the public page rather than rendering empty.
- Slow network → bound sections stream independently; the page is readable as soon as the header + abstract arrive.
- Amended after finishing → "A newer version exists" note linking to it.
- Public/data section must never resolve raw participant rows (enforced server-side, not just hidden in UI).

## Accessibility notes

- Sections are `<section>` with headings forming a correct outline; a "On this page" jump nav mirrors the order (keyboard-operable).
- Composer drag-and-drop has a **keyboard alternative** (move up/down + add/remove buttons) — mandatory, matching the dashboard customization a11y fallback.
- Action card buttons have explicit labels ("Replicate this study", "Copy citation"); the Finished/visibility chips are text, not color-only.
- Charts in Results carry text summaries / data tables (no chart-only information).
- `aria-live` on publish + sync results.

## Open questions

- Section default order + which are on-by-default vs opt-in — resolve with a quick content-priority pass.
- How much of Results/Data is public by default (aggregate granularity) — owner + ADR-0014.
- Does "Compare" belong on the Record (reader-facing) or stay a Builder/whiteboard tool? Leaning: a lightweight reader-facing compare of two Records.
- Citation format(s) to support first (APA?) — owner.
