# ADR 0032 — IA v0.4: focused study mode + dual layout

- **Status:** accepted
- **Date:** 2026-06-12
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** information-architecture, routing, chrome

> The V1.12 handoff numbered this "ADR-0029"; that number was since taken by custom composite modules, so the decision lands here as 0032. Scope: [handoff Section M](../handoffs/code-tab-v1120-functional-polish.md).

## Context

After living in the tool, the owner asked for an IA shift (2026-06-08): opening a study should drop the workspace chrome — the researcher is "in" the study until they explicitly close it. Today one layout (`app/(app)/layout.tsx`) renders the boxed TopBar + LeftRail for every authenticated route, including all of `/studies/[id]/*`, so the rail and global chrome compete with the Builder for width.

Four sub-decisions ride along: how the mode switch is implemented, how the left rail becomes resizable, how the now-load-bearing ⌘K palette is built, and where the right-panel-side preference lives. Prior decisions in play: ADR-0007 (lock-in discipline — every new dependency needs justification), ADR-0013 (participant surfaces have no app chrome; unaffected), IA v0.3 (the destination set, unchanged).

## Options considered

### Option A — Next.js route groups: `(workspace)` vs `(study)` sibling groups under `(app)`

- Two sibling route groups with their own `layout.tsx`; the shared parent keeps providers + auth. URL paths are unchanged (groups don't affect URLs).
- **Pros:** mode resolved server-side at the layout level — no flash, no client branching; each chrome is a plain server component; middleware/auth untouched; zero migration (file moves only).
- **Cons:** a one-time `git mv` of every study route; two layouts each fetch workspace/user (one extra cheap query per navigation).

### Option B — One layout that branches on `usePathname()`

- Keep the single layout; a client wrapper hides the rail and swaps the bar when the path matches `/studies/[uuid]`.
- **Pros:** no file moves.
- **Cons:** the whole shell becomes a client component (today it is a server component passing serialized props); chrome flashes on hydration; path-regex duplication of routing the framework already does.

### Rail resize — Option A: custom drag handle · Option B: `react-resizable-panels`

- The handoff suggested `react-resizable-panels`. Our need is ONE vertical handle with pixel clamps on a fixed-width rail; the library's percentage-based panel model fits fluid multi-panel splits, and it would be a new lock-in inventory entry (ADR-0007).
- Custom is ~60 lines — pointer drag + `role="separator"` keyboard resize + localStorage — with exact pixel semantics and no dependency. **Custom chosen.**

### Persistence — Option A: localStorage · Option B: Clerk `publicMetadata` via AuthAdapter

- The handoff suggested Clerk metadata. That costs a server write per drag (or debounce machinery) for a value whose cross-device worth is low — chrome width is a per-screen ergonomic, not research state.
- localStorage is instant, free, per-device. **localStorage chosen** for both rail width and the right-panel-side preference. Why-not metadata: revisit if multi-device drift actually annoys (trigger below).

### ⌘K palette — Option A: custom dialog · Option B: `cmdk`

- `cmdk` is the standard, but it is another dependency for what is here a filtered list with keyboard nav — and our dialog/menu patterns already exist in-repo.
- Custom: input + grouped `listbox` + `aria-activedescendant`, ~150 lines, no new lock-in row. **Custom chosen.** Why-not cmdk: revisit if the palette grows fuzzy-matching/nested pages.

## Decision

We will split `app/(app)` into `(workspace)` and `(study)` route groups, each owning its chrome as server components; the mode switch is the URL, never a toggle. The rail resize, ⌘K palette, and panel-side preference are built in-repo with no new dependencies, persisting per-device in localStorage. Both top bars flatten from boxed cards into full-width strips (border-bottom only).

Plainly: Next.js already knows which kind of page it is rendering — we let the file system pick the chrome instead of re-deriving it in client code, and we do not take on libraries for one handle and one list.

## Consequences

- **Easier:** focused mode is the default consequence of opening any study route — new study sub-routes inherit it for free; chrome stays server-rendered (fast, no hydration flash); no new vendors to inventory.
- **Harder:** chrome changes now touch two layouts; the two modes can drift if edits land in only one (shared pieces — UserMenu, AutosaveIndicator, palette — live in `components/chrome/` to resist this).
- **Committed to:** URL-driven mode (no manual toggle); rail hidden (not collapsed-to-icons) in focused mode v1; the same custom-handle pattern for the Builder work-surface ↔ context-panel divider (owner follow-up 2026-06-12, `pane-resize.tsx`); ⌘K as the primary cross-study navigation inside a study; a new `studies.archive` write mutation backing the ⋯ menu (Duplicate/Delete stay deferred to the Wave 6 bulk-operations slice).
- **Precluded from:** per-route custom chrome mixes (a route is in exactly one group); SSR-known rail width (localStorage means the default width renders server-side and the persisted width applies before paint via an inline read).

## Revisit triggers

- The owner misses destination access inside a study after living with ⌘K → build the slim icon-strip rail variant from the handoff sketch.
- Multi-workspace or multi-device use becomes real → move width/panel-side into Clerk `publicMetadata` through the AuthAdapter.
- The palette needs fuzzy matching, async multi-source ranking, or nested pages → adopt `cmdk` (one inventory row, drop-in).
- A third chrome mode appears (e.g. a Participants ops console) → reassess whether route groups still carry the IA.

## References

- [Handoff Section M](../handoffs/code-tab-v1120-functional-polish.md) (M1–M9)
- [IA v0.4](../../03_design/ia/information-architecture.md) — two-mode amendment
- Wireframes: [focused-study-mode](../../03_design/wireframes/focused-study-mode.md), [workspace-mode-topbar](../../03_design/wireframes/workspace-mode-topbar.md)
- [ADR-0007](0007-path-a-vs-b.md) (lock-in discipline), [ADR-0013](0013-participant-runtime-and-analytics.md) (participant surfaces unaffected)
- Code: `05_app/app/(app)/(workspace)/layout.tsx`, `05_app/app/(app)/(study)/layout.tsx`, `05_app/components/chrome/`
