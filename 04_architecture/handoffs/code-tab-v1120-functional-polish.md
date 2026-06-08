# Code tab handoff — V1.12 functional-polish bundle

V1.11.3 is the latest tagged release (right-panel re-seed-after-undo/redo). Project owner has identified a large bundle of functional gaps the tool needs before V1.13 (Participants + Prolific) and V2.0 (AI features). This handoff bundles them as **V1.12 — functional polish**, with each section self-contained so you can land them as separate PRs in whatever order makes sense.

**Total estimate: ~6-8 weeks Code-tab time** if all sections land before V1.12 tag, or split into V1.12.x sub-releases as appetite allows.

**Order this is written in: roughly small-to-large.** Sections A-C are quick wins; D-F are medium; G-I are larger; J-K are my proposed additions to consider.

---

## Section A — Trivial UX gaps (~3-5 days total)

### A1. Sign-out option in the user menu

Owner reported they can't find sign-out. Audit the user-avatar dropdown in the top-right of `app/(app)/layout.tsx` (or wherever it lives). If the dropdown exists, add a **Sign out** item that calls `auth.signOut()` (the AuthAdapter method per ADR-0007) and redirects to `/`. If no dropdown exists, build a minimal one — avatar / display name / Account settings / Sign out.

Test: a Playwright spec asserting the sign-out flow ends with an unauthenticated session + redirect to `/signup` (the post-commit-`5fcda09` root redirect).

### A2. More profile inputs (reuse OSF + typical settings)

Today's user profile is minimal (display name + theme + lastWorkspaceId per memory). Expand the **Account Settings** page with fields researchers typically want:

- **Full name** (separate from display name; goes into OSF preregistration metadata + study author byline)
- **Affiliation** (institution + department, free text; surfaces on public Browse cards + OSF metadata)
- **ORCID iD** (optional; validate format `XXXX-XXXX-XXXX-XXXX`; the OSF integration already has it for the connected OSF user — pull as default)
- **Research areas** (free-text tag input reusing the V1.7 tags primitive)
- **Bio** (short markdown; surfaces on public author page)
- **Personal website / Google Scholar URL** (optional)

Storage: extend the existing `user` table (Drizzle migration; additive, nullable columns). The OSF profile fields are reused for the Preregister stage (auto-fills the "Authors" section); the Browse + Activity surfaces (author byline pulls from here); and the V1.13 Participants destination (compensation invoices will need full name + affiliation).

Wireframe gate: `03_design/wireframes/account-settings.md` (write it before the UI work per CLAUDE.md phase-gate).

### A3. Demo data toggle in Settings

Owner wants a way to "explore all functionalities" without manually creating content. Two-part fix:

- **In Settings → Workspace**, add a toggle: **"Show demo content."** When ON, the workspace surfaces inject a curated seeded set of studies, a sample preregistration, sample comments, sample replications, sample participants/responses. Per-user setting (Clerk `publicMetadata.demoMode = true`); resets to OFF on first real study creation.
- Reuse the existing `scripts/seed-network-demo.ts` (the dev seeder); package it as a callable that runs ONCE for the workspace when the toggle is flipped on, prefixing every seeded entity with a `demo_` tag so they're filterable. Toggling OFF hides them from the UI but doesn't delete (so the user can flip back).

Storage: a `demo_seeded_at timestamptz` column on `workspace` + a `is_demo boolean DEFAULT false` on `experiment`/`response`/`comment`/etc. so the demo content can be filtered out of real research aggregates.

Onboarding hook: new sign-ups land on `/studies` with the demo content already on by default; an empty-state banner says "Showing demo content — toggle off in Settings → Workspace once you start your own studies."

ADR needed? Small — `ADR-0023 — demo-data semantics` could record the "demo-tagged rows live in real tables, hidden by filter, never deleted" pattern. Optional; this could just live in a comment in the seed script.

### A4. Preview tab opens as modal or new tab (not inline)

V1.8.1 shipped a Preview tab at `/studies/[id]/preview` rendering the participant `BlockView` inline. Owner wants it to **reflect the actual design participants see** — meaning open in a context that doesn't carry the researcher chrome (TopBar, LeftRail, stage tabs).

Two viable approaches:

- **(a) Modal**: Preview button opens a full-screen modal containing the participant runtime in an iframe pointed at `/take/[studyId]/preview-session-id?preview=true` (the same route real participants use). Modal close returns to Builder. Pros: zero context switch; modal can be sized to mock common screen widths (desktop / tablet / mobile via responsive controls in modal header).
- **(b) New tab**: Preview button opens `/take/[studyId]/?preview=true` in a new browser tab. Pros: matches what participants actually experience (real URL, real browser chrome); easy to test mobile by resizing the tab. Cons: context switch.

Recommendation: **build (a) modal** with a "Open in new tab" affordance inside it. Owner gets device-width controls + the easy escape hatch. The current inline `/studies/[id]/preview` route is removed; the Preview stage tab triggers the modal instead.

Wireframe gate: `03_design/wireframes/preview-modal.md`.

---

## Section B — Overview tab + study documentation (~1 week)

### B1. Overview tab as the first stage

Owner: "Overview tab for study (first in row Builder, Preview, ...) — describe your study, hypothesis, and everything, add section you want."

Add **Overview** as the first stage tab in `<StageTabs>` (before Builder, Preview, Share, Preregister, Run, Results). The Overview surface is a researcher-authored long-form document that travels with the study + its frozen snapshots.

Surface structure:

- **Title + abstract** (always present; abstract is short text, ~500 chars).
- **Sections** (researcher-added; ordered list of `{ heading, content }` where content is markdown). Default sections suggested but optional:
  - Hypotheses
  - Background / motivation
  - Methods overview (link to Builder)
  - Analysis plan (links to Results when run)
  - Ethics / IRB notes
  - References
- **Add section** button (researcher names + adds an arbitrary section).

Data model: extend `experiment_version.definition_snapshot` with `overview: { abstract: string, sections: Array<{id, heading, content_md}> }`. Per ADR-0012 the overview rides with the snapshot, so a preregistered version freezes the overview text along with the blocks — exactly the same immutability story.

The overview is also pushed into OSF preregistration metadata (ADR-0005) as the abstract + sections render into the OSF registration's narrative fields. Replaces the current OSF "summary = blocks JSON dump" behavior with researcher-authored text.

Markdown rendering: reuse the comment markdown allowlist (V1.7 + DOMPurify) for safe display.

Wireframe gate: `03_design/wireframes/overview-stage.md`.

### B2. Print/PDF export of the Overview + blocks (my addition)

Once Overview + Builder are together, the natural next step is "give me a single document I can attach to a paper or share with my IRB committee." A **"Export study as PDF"** button on the Overview surface generates:

- Cover page (title, authors, affiliation, status badge, version label)
- Overview sections rendered as paragraphs
- Block list as numbered question-by-question appendix
- Footer with citation block ("To cite this study: ...")
- Preregistration receipt (if any) — OSF DOI + URL

Server-side rendering via `@react-pdf/renderer` or similar; downloadable PDF; can also email the link. Add a small ADR for PDF rendering tech if you choose a vendor with licensing implications.

---

## Section C — Embedded content + more block types (~1-2 weeks)

### C1. Embedded content blocks (image, video, link)

Owner: "Allow researcher add content as image, video or link for embedded content."

New core modules (per ADR-0001 versioned module identity):

- **`core/image@1.0.0`** — researcher uploads an image OR pastes a URL. Renders inline in the participant runtime. Used for stimulus presentation (a chart, a photo, a meme).
- **`core/video@1.0.0`** — YouTube / Vimeo / direct mp4 URL. Embed via `<iframe>` for YouTube/Vimeo, `<video>` for mp4. Researcher picks aspect ratio + autoplay/controls.
- **`core/link@1.0.0`** — embedded card with title + description + URL. Renders as a styled card in the runtime (like Slack/Discord link previews). Optional preview-image fetch via Open Graph tags (server-side; cached).
- **`core/text@1.0.0`** — markdown text block (instructions, transitions, debrief copy). Markdown allowlist same as comments.

Storage: per ADR-0003, asset storage uses R2/S3 (hybrid researcher-choice — internal upload OR external link). For images/videos, researchers pick "Upload" (goes to R2; participant runtime serves from CDN URL) or "Link" (external URL; we don't host but warn about link-rot in the freeze step). For text + link blocks, no asset storage needed.

Auto-freeze on preregistration: per ADR-0003, when a study preregisters, all internal-upload assets get content-hashed + frozen. External links flag a warning. This already exists in the V1.5 substrate; just wire the new modules into it.

`responseSchema`: none for image/video/text/link blocks (they're stimulus-only, not response-capturing). The runtime renders them but doesn't expect an answer.

`isAnswerEmpty`: returns true (no answer to be empty about).

### C2. More block types (TBD per owner screenshots)

Owner: "Adding more blocks types - attached screenshots."

**No screenshots attached to the message** — please send them and I'll spec each block type. Likely candidates based on common survey tools:

- **Likert grid / matrix** (multiple rows × likert columns; common in Big Five personality batteries, satisfaction surveys)
- **NPS (Net Promoter Score)** (0-10 scale with specific labeling; widely used)
- **Semantic differential** (bipolar adjective pairs, e.g., "weak ↔ strong" on a 7-point scale)
- **File upload** (participant uploads a file — photo, voice recording, document)
- **Date / time picker**
- **Number input with unit** (e.g., "$_____ per week")
- **Slider matrix** (multiple sliders on one screen)
- **Conjoint / discrete choice** (research-specific, more niche)
- **Open-ended audio recording** (browser MediaRecorder API)
- **Reaction time task** (precise-timing JS module)
- **MaxDiff / best-worst scaling**

Each new block needs the standard module shape: `responseSchema`, `isAnswerEmpty`, optional `validateAnswer`, Builder Configure form, participant runtime render, results summarization in `getResults`, CSV column extraction. Tests in the per-module path.

When owner sends the screenshots, write a fresh sub-handoff for each block listing the exact schema + UX.

---

## Section D — Data export + explorer (~2 weeks)

### D1. Data export builder

Owner: "Export data builder and explorer — allow user defined what data they want to have in exported file, allow them preview data in our app, like scrollable table, with drag and drop column order, hiding columns, renames col., templates, and so on."

Current state (V1.5+): `studies.getResults` aggregates by-condition counts + per-question summaries; a basic CSV export dumps responses. Owner wants this to become a configurable workflow.

**New surface: `/studies/[id]/results/export`** with two panels:

- **Left: column picker.** Lists every available variable (participant ULID, condition, started_at, completed_at, time_per_block, every block's response columns, every demographics field, computed scores). Checkboxes + drag handles for ordering. Searchable.
- **Right: live preview.** Scrollable table with the selected columns; first 50 rows of actual data; sticky header. Drag column headers to reorder; right-click column for "Hide" / "Rename" / "Format". Visual feedback as the column picker changes the preview in real-time.

**Templates:** save a column configuration as a named template (per-user, per-study, OR per-workspace). Researcher can save "My SPSS export" with specific columns + names. Templates are first-class — `column_template` table — and can be shared with workspace members.

**Export formats:**

- CSV (default; already exists; configurable column order/names now)
- TSV (for Excel-on-European-locales without CSV-quote-escaping issues)
- JSON (one object per response; nested condition + answer objects)
- SPSS `.sav` (uses `sav-format` npm or similar; with proper variable labels + value labels from the responseSchema)
- STATA `.dta` (similar to SPSS; less common but academic-standard)
- Excel `.xlsx` (multi-sheet: Sheet 1 = data, Sheet 2 = codebook, Sheet 3 = study metadata)

**Variable labels + value labels:** every column in the export carries metadata from the responseSchema (e.g., likert column "Q3_warning_belief" has value labels "1 = Strongly disagree, ... 7 = Strongly agree"). This is the **data dictionary** automatically.

Data model: new `column_template` table — `{id, study_id (nullable), workspace_id, user_id, name, columns: jsonb (ordered array of {variable_id, display_name, hidden})}`.

Wireframe gate: `03_design/wireframes/export-builder.md`.

### D2. Data dictionary export (my addition)

Pairs with D1: a "Download codebook" button generates a separate file describing every variable in the export — name, type, valid values, source block, condition assignment logic, etc. Machine-readable JSON + human-readable PDF. This is the academic-paper-appendix material that makes a dataset citable.

### D3. Data explorer mode (preview-table is the explorer)

The same scrollable table from D1 doubles as an in-app data explorer. Researcher doesn't have to download anything to see what they have. Features:

- Filter rows by column value (e.g., "only completed", "condition = warning-labeled")
- Sort by any column
- Inline cell preview for long text answers (click to expand)
- Per-cell highlight if response was flagged in V1.6's attention-check
- Counts row at the bottom (N, n by condition)

No new data model needed for the explorer — it's pure UI over `getResults`.

---

## Section E — Replications navigation (~1-2 weeks)

### E1. Nested replications view

Owner: "Way of navigating replications — replicated research with 'nested' replications, user finds some research but here is clearly able to see where does it sit in replications and its structure and timeline."

Today (V1.7 + V1.8): the Replications tab on a study shows direct downstream forks (one level deep). Owner wants:

- **Multi-level tree** — fork-of-a-fork-of-a-fork shown as a nested expandable tree. Each node is a study card; expand the node to see its own forks.
- **Position in the tree** — when looking at any study, an "Origin" breadcrumb shows the upstream ancestry: `Hanna's misinformation study v3 → Sofia's replication (2026-03) → your fork`. Clickable to navigate.
- **Sibling forks** — at any node, see other forks of the same parent. Compare positions in the tree (e.g., "5 other replications were done in parallel").

### E2. Timeline view

Same data, rendered as a horizontal timeline:

- X-axis = date
- Y-axis = generations (parent at top, forks below, fork-of-forks below that)
- Each study is a dot/card on the timeline
- Edges connect parent → fork
- Click to navigate; hover for summary

Useful for "when was this replicated, by whom, and how does that distribute across the past year?"

### E3. Tree structure data

The data already exists — `experiment.parent_version_id` per ADR-0002 + ADR-0018 form the tree. New queries:

- `studies.getReplicationTree(studyId, depth = 3)` — recursive CTE over `experiment` joined to itself via `parent_version_id`. Returns the full subtree rooted at the given study. Per ADR-0018, cross-tenant private forks show their existence but not their internal structure (count-only).
- `studies.getReplicationAncestry(studyId)` — walk up the parent chain to the root.

Wireframe gate: `03_design/wireframes/replications-navigation.md`.

ADR-0023 (or similar) — `Replication graph queries + depth limits` — recursive CTE depth caps, cross-tenant visibility rules per ADR-0018, performance concerns (the tree could in theory be hundreds of nodes deep + thousands wide). Cap at depth 5 or paginate.

---

## Section F — Visual theme / layout editor (~2-3 weeks; the biggest item)

Owner: "Design of research should be determined by researcher because everything need to be controlled by researcher. We should add some visual editor for entire research, theme or layout (like default survey or Facebook platform)."

This is **researcher-controlled per-study theming + layout**. Decoupled from the workspace-level design language (warm parchment + Plex Serif), each study can ship to participants with a custom appearance.

### F1. Theme primitives

A study's theme is a record of overridable CSS tokens (per ADR-0007's adapter discipline — vendor styling stays isolated):

- **Brand colors**: primary, accent, background, text (4 colors at minimum)
- **Typography**: heading font, body font (curated list of ~8 web-safe + Google Fonts options)
- **Logo / favicon**: optional image upload (R2 per ADR-0003)
- **Border radius**, **shadow depth** (one of 3-4 visual styles: minimal / soft / sharp / playful)
- **Background pattern** (subtle: dots / lines / blank / parchment / gradient)
- **Footer text** (researcher-customizable; replaces the default "Powered by Massive Research Tool")

Stored as `experiment_version.theme` (jsonb on the version; rides with the snapshot per ADR-0012; preregistered versions freeze the theme).

### F2. Layout primitives

Within the participant runtime page:

- **Container width**: narrow (typeform-like, 600px) / medium (800px) / wide (full) / responsive
- **Per-question screen vs multi-question screen** (current = per-question; some studies want a single scrolling page)
- **Progress indicator**: percentage bar / step counter / none
- **Navigation**: separate Back/Next buttons / single Next button (no back) / keyboard-only

Stored same as theme — `experiment_version.layout` (jsonb on the version).

### F3. Visual theme editor surface

A new stage tab: **Design** (or a sub-tab under Builder). Renders the theme + layout pickers on the left, a live preview of the participant runtime on the right, updating as the researcher tweaks.

Theme presets (curated for common research traditions):

- **Academic** (default; current design — warm parchment + Plex Serif)
- **Clinical** (light blue + Inter + minimal — for medical/health studies)
- **Modern** (white + Inter + sharp corners — survey-tool aesthetic)
- **Playful** (light pastel + rounded + soft — for children/youth studies)
- **Custom** (researcher tweaks any token)

Plus an "Import from URL" feature: paste a URL, scrape the favicon + dominant colors, propose a theme. Optional fancy add later.

### F4. Theme application in participant runtime

The participant runtime's root layout reads `experiment_version.theme + layout` and injects them as CSS variables on the page root. Per ADR-0013, this happens server-side in the per-question SSR render. No client-side theme switching for participants.

### F5. ADR-0024 — Per-study theming

The architecture decision. Covers:

- Theme + layout as jsonb on `experiment_version` (rides with the snapshot; preregistered = frozen theme).
- Themes are version-scoped, not study-scoped — a researcher can A/B test "academic vs modern" by publishing two versions with different themes.
- Branding limits (no scripts, no arbitrary CSS — only the curated token surface) so we can't be used as an attack vector against participants.
- The workspace's design language (`tokens.css` + brief v0.6) stays the RESEARCHER-side language; per-study themes only affect the participant runtime.

Wireframe gate: `03_design/wireframes/design-stage.md`.

---

## Section G — Researcher-controlled design philosophy

Owner: "Design of research should be determined by researcher because everything need to be controlled by researcher."

This is more philosophy than feature — Section F implements most of it. Two additional small affordances that reinforce the principle:

- **Participant-facing copy is researcher-editable.** Every default string the participant sees (consent intro, "Thank you" complete page, attention-check warning text, error messages, next button label) should be a per-study editable field, defaulting to our sensible English copy. Stored in `experiment_version.copy` jsonb.
- **Researcher can disable / hide our branding.** Footer "Powered by Massive Research Tool" is on by default; researcher can toggle off (paid plans only? or free? — decide as a pricing question later).

---

## Section H — Autosave indicator (my addition, ~3 days)

Owner reported in earlier sessions that "saving, adding comments takes some time — sometimes too long." V1.7.1 shipped loading spinners on submit buttons (PendingButton). What's still missing: a **persistent autosave-status indicator** that tells the researcher "your work is saved" / "saving..." / "unsaved changes" without them having to click anything.

Place in the TopBar (right of the breadcrumb, left of ⌘K + user menu). Three states:

- **Idle** — small dot in `--color-success` + "All changes saved · 30s ago" (relative time)
- **Saving** — pulsing dot in `--color-text-muted` + "Saving..." (only visible while a save mutation is in-flight)
- **Error** — red dot + "Couldn't save — Retry" (clicks the retry; surfaces underlying error)

Reuses the existing `studies.writeBlocks` mutation; tap into its `isPending` state via a React Context wrapping the Builder + Whiteboard surfaces.

Also useful: **a keyboard shortcut Cmd+S that triggers explicit Save as Named version** (instead of just autosave). Ties into V1.11's undo/redo nicely.

---

## Section I — Public preview URL (my addition, ~3 days)

Owner's Preview tab (Section A4) is for the researcher's own viewing. **Public preview URL** is a different need: share a draft study with a colleague for review BEFORE preregistering.

Each study gets a "Share preview" button generating a URL like `https://myresearchlab.app/preview/<study_id>?token=<opaque>`. The token is a one-shot signed URL (32-char random, stored hashed in a `preview_token` table with expiry + revocation). Visitors with the link see the participant runtime in preview mode (no real responses recorded) without needing a Clerk account.

Tokens expire (default 7 days; researcher-configurable). Researcher can revoke any token from a Settings page.

Pairs with V1.7 "Save & request review" — that flow uses Clerk-authenticated workspace members; public preview URL is for external reviewers who don't have an account.

ADR? Optional small one for "anonymous preview-URL semantics" (signed tokens, expiry, no PII captured).

---

## Section J — Onboarding tour (my addition, ~1 week)

Pairs with Section A3 (demo data toggle). New sign-ups see a guided tour:

- After onboarding (display name + workspace), the `/studies` destination loads with the demo content + a **Tour overlay** highlighting:
  - "This is your Studies destination — your studies appear here"
  - "+ New study to start building"
  - Click into a demo study → "This is Builder. Drag blocks from the left palette..."
  - Cycle through Builder / Whiteboard / Preregister / Run / Results / Browse with 1-2 sentence tooltips
- Tour can be **skipped** (top-right "Skip tour") or **resumed** later from Settings → "Replay tour"
- Tour state stored in Clerk `publicMetadata.tourCompleted = boolean`

Implementation: a small Tour component using `react-joyride` or similar (MIT, small bundle), or hand-rolled with a tiny step engine over CSS positioning. ~200 lines + per-step copy.

---

## Section K — Smaller UX wins (my mini-list)

If there's slack in V1.12, these are quick gems:

- **⌘K command palette** — fuzzy-search across destinations + studies + recently visited. Reuses Clerk-authed routing. ~3 days. Single biggest "this feels like a real tool" lift.
- **Saved comment drafts** — currently if you start typing a comment then click away, you lose it. localStorage draft (per-comment-target) restored when you come back. ~1 day.
- **Better empty states** — every destination has an empty state; some are bare ("No studies yet"). Add illustration + 2-sentence onboarding nudge to each. ~2 days. Pairs with demo data toggle.
- **Bulk study operations** — checkbox column on `/studies` + Archive / Duplicate / Export-multiple actions. ~3 days.
- **Mobile-responsive participant runtime audit** — `/take/*` should already be responsive (Tailwind + SSR + small components), but run Lighthouse + manual phone testing; fix anything broken. Critical for participant UX since many will be on phones. ~3 days.

---

## Sequencing recommendation

Bundle as PR streams Code tab can land in any order:

- **PR 1 (small wins)** — A1 sign-out + A2 profile + A3 demo toggle + A4 Preview modal (~1 week)
- **PR 2 (Overview + PDF)** — B1 Overview tab + B2 PDF export (~1 week)
- **PR 3 (embedded media)** — C1 image/video/text/link blocks (~1 week)
- **PR 4 (block types — gated on screenshots)** — C2 (awaiting owner)
- **PR 5 (export builder + dictionary + explorer)** — D1 + D2 + D3 (~2 weeks)
- **PR 6 (replications nav)** — E1 + E2 + E3 (~1-2 weeks)
- **PR 7 (visual theme editor — biggest)** — F1-F5 + ADR-0024 (~2-3 weeks)
- **PR 8 (philosophy reinforcements)** — G (~3 days; folds into PR 7 if convenient)
- **PR 9 (UX wins)** — H autosave indicator + I public preview URL + J onboarding tour + K mini-list (~2 weeks total; can split)

If all PRs land, tag `v1.12.0` at the end with a single audit log mirroring the V1.8 / V1.7 pattern.

Alternatively, ship sub-releases (V1.12.0, V1.12.1, …) per PR. Up to Code tab — both patterns have worked.

---

## ADRs / wireframes needed (phase-gate per CLAUDE.md)

ADRs:
- **ADR-0023** — Demo-data semantics (Section A3) — small, optional
- **ADR-0024** — Per-study theming + layout (Section F5) — substantial
- **ADR-0025** — Replication graph queries + depth limits (Section E3) — small
- **ADR-0026** — Anonymous preview-URL semantics (Section I) — small, optional
- **ADR-0027** — PDF rendering tech (Section B2) — only if vendor choice has licensing implications

Wireframes:
- `03_design/wireframes/overview-stage.md` (B1)
- `03_design/wireframes/preview-modal.md` (A4)
- `03_design/wireframes/export-builder.md` (D1)
- `03_design/wireframes/replications-navigation.md` (E1)
- `03_design/wireframes/design-stage.md` (F3)
- `03_design/wireframes/account-settings.md` (A2)

Each wireframe Code tab writes BEFORE building the UI per CLAUDE.md phase-gate rule.

---

## What's NOT in V1.12 (still queued for after)

- **V1.13** — Participants destination (5 sub-views) + first Prolific `RegistryAdapter`. Was originally the V1.10 plan; now V1.13.
- **V2.0** — AI features on the ADR-0006 substrate (measure picker, literature → blocks, hypothesis extraction).
- Real-time multi-user canvas collab (Liveblocks substrate → real feature).
- Plugin marketplace (ADR-0008 substrate).
- Conversational rendering / chatbot.
- DB-backed Frameworks + curator authoring.
- Full-text search across studies.
- Translations / i18n (English-only today).

---

## Open questions for owner

1. **Block types screenshots** — please send so I can spec each (Section C2).
2. **Demo content style** — should the seeded demo studies be hand-curated realistic examples (more work to author, but feel professional) OR auto-generated placeholders (faster but feel like Lorem Ipsum)?
3. **Visual theme editor scope** — is the Section F primitives list (colors / fonts / logo / radius / shadow / pattern / footer) what you have in mind, or do you want more granular control (e.g., per-block-type styling)?
4. **Public preview URL expiry default** — 7 days reasonable, or different?
5. **Bulk study operations** — top priority or skippable for V1.12?

---

## Reading order for Code tab

1. This handoff (start to finish)
2. The owner's earlier feedback memories — search `memory/feedback_*.md` for any preferences relevant to specific items
3. ADRs in play per section: ADR-0001 (modules), ADR-0002 (forking), ADR-0003 (asset storage — Section C1 + F1 + B2), ADR-0005 (OSF — Section A2 + B1), ADR-0007 (lock-in — every vendor choice), ADR-0012 (block format — Section B1 + C1 + F1), ADR-0013 (participant runtime — Section A4 + F4 + I)
4. STATUS.md current state
5. Pick a PR stream + write the relevant wireframe gate first

When green: ping owner. Owner runs `npm run deploy:verify` after the V1.12 deploy; signs the audit log; tags `v1.12.0`.
