# Wireframe spec — Library Templates tab

- **Serves user flow:** [Use and save templates](../../02_product/user-flows/use-and-save-templates.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Let a researcher find and clone a reusable study skeleton (their workspace's, an app-shipped starter, or a public one) from the Library.

## Layout

Standard three-zone modular surface per brief v0.6 — slim top bar, left rail card (Library active), center column with the Library sub-nav pill (Modules · Themes · Materials · **Templates** · Imports) and the work surface below; right context panel reserved (unused on the grid view). The center surface is: a filter/sort/search row, then a responsive card grid (matches the Modules tab grid rhythm).

## Content inventory

> Every piece of content visible on the screen.

- **Sub-nav pill** — the five Library tabs; Templates active. Source: static. (Reused from `library-browse`.)
- **Scope filter** — segmented control: My workspace / App starters / Public. Source: client state → `templates.list({ scope })`.
- **Sort control** — Recently created / Most used / Alphabetical. Source: client → query.
- **Search field** — matches name + tags. Source: client → query.
- **Template card** (repeated) — cover image (or a generated placeholder), name (serif), one-line description (clamp 2), use-count ("Used 12×"), tag chips (max ~3 + overflow), a **Use template** button, and a `starter` badge when applicable. Source: `templates.list`. Name ≤ 64 chars; description clamps.
- **Per-card owner actions** (only when the template belongs to the caller's workspace) — overflow menu: Edit metadata / Change visibility / Delete.
- **Empty state** — copy + CTA (see States).

## States

- **Default** — grid of template cards for the active scope.
- **Loading** — skeleton cards (same grid footprint).
- **Empty (my workspace)** — "No templates yet. Save any study as a template from its Builder → Details panel." CTA: link to Studies.
- **Empty (starters)** — "No starter templates available." (Should not happen once L2 ships the Misinformation starter.)
- **Empty (public)** — "No public templates match." with a clear-search affordance.
- **Partial** — cards stream in; counts ("Used N×") render as they load.
- **Error** — "Couldn't load templates." + Retry.
- **Success / optimistic** — after Delete, the card animates out optimistically; after a visibility change, the badge updates in place.

## Interactions

> For each interactive element: affordance, action, system response, error path.

- **Use template** — primary button on a card → `templates.useTemplate({ templateId })` → forks into the active workspace, increments use_count, redirects to the new study's Builder. Error: toast "Couldn't use this template," card stays.
- **Open card** (click name/cover) — navigates to `/library/templates/<id>` (detail).
- **Scope / Sort / Search** — re-query; preserve in the URL search params so the view is shareable/back-button-safe.
- **Owner overflow → Edit metadata** — opens the same metadata modal as Save-as-template (name/desc/tags/cover/visibility) bound to `templates.update`.
- **Owner overflow → Change visibility** — inline submenu (Private/Workspace/Public) → `templates.update({ shareScope })`; emits `template_published` on private→shared/public.
- **Owner overflow → Delete** — confirm dialog → `templates.delete` (soft-delete); card removed. A starter template is non-deletable by a non-owner workspace (action hidden).

## Edge cases

- Very long name/description — name truncates with ellipsis + title attr; description clamps to 2 lines.
- 0 / 1 / 10 / 1000 templates — empty state; single card doesn't stretch full width; grid paginates/virtualizes via cursor at large N.
- Missing cover image — render a deterministic placeholder (initials/representative block-count motif), never a broken image.
- Slow network — skeletons; Use button shows a pending spinner and is disabled to prevent double-fork.
- Permissions denied — owner actions never render for non-owning workspaces; the server re-checks regardless.

## Accessibility notes

- Cards are a list (`ul`/`li`); the card title is the primary link; the Use button has an accessible name including the template name ("Use template: Misinformation susceptibility").
- Scope/sort are real controls (segmented = radiogroup with arrow-key nav; sort = native select or listbox).
- Focus returns to the triggering card after a modal/confirm closes.
- `use-count` badge is decorative-adjacent — expose as text, not title-only.

## Open questions

- Does the scope filter default to "My workspace" or "All visible"? (Assumed: My workspace.)
- Pagination vs. infinite scroll for large public sets — defer to L1.2 build.
