# Code tab handoff — V1.12 functional-polish bundle (updated 2026-06-08 round 3)

V1.11.3 is the latest tagged release (right-panel re-seed-after-undo/redo). Project owner has identified a large bundle of functional gaps the tool needs before V1.13 (Participants + Prolific) and V2.0 (AI features). This handoff bundles them as **V1.12 — functional polish**, with each section self-contained so you can land them as separate PRs in whatever order makes sense.

**Total estimate: ~13-14 weeks Code-tab time** after three rounds of owner answers expanding the scope:
- Round 1: Section A3 (realistic-complex demo studies; ~1.5w), Section C2 (15 new blocks + 6 meta affordances per Typeform screenshot; ~3w), Section F (granular theme controls + 13 platform presets; ~4w).
- Round 2: Bulk ops kept in V1.12 (~3d); IRB acknowledgment gate added to mimicking presets; demo OSF DOI format locked; 4 new presets added (Reddit/LinkedIn/YouTube/Chat with Discord/WhatsApp/iMessage variants → 17 presets total).
- Round 3: **Section L — Block grouping + experimental parts** (question-groups with anchor artifacts + section/transition blocks + Results pivot by artifact; ~1.5w) and **Section M — IA v0.4: Focused study mode** (route-group split + slim TopBar + collapsible/resizable sidebar + Cmd+K palette elevation + IA document update; ~2w).

Code tab can land sections as separate PRs + ship V1.12.0 / V1.12.1 / ... sub-releases as items mature; one V1.12 audit log + tag at the end of the bundle OR per-sub-release.

**Order this is written in: roughly small-to-large.** Sections A-B are quick wins; C-E are medium; F is the biggest (visual theme + platform presets); G-K are smaller UX additions; L+M are foundational additions from owner's round 3 (block grouping + IA shift).

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

**Owner answer (2026-06-08):** generated but **realistic, not simple — mostly complex** — owner wants demo studies that exercise every functionality and show the app in a believable shape (so the tool can be evaluated against actual research scenarios, not Lorem Ipsum placeholders).

- **In Settings → Workspace**, add a toggle: **"Show demo content."** When ON, the workspace surfaces inject a curated set of demo studies at varying complexity + realistic responses + comments + activity + replications. Per-workspace setting + reset switch.
- Per-workspace flag `workspace.demo_seeded_at timestamptz` + `is_demo boolean DEFAULT false` on `experiment` / `experiment_version` / `response` / `response_item` / `comment` / `mention` / `notification` / `activity_event` / `follow`. Demo rows live in real tables but filtered out of real aggregates (e.g., `Browse` shows demo studies only when `demoMode = true`; production analytics never count them).
- Toggle OFF hides demo content from UI but doesn't delete — researcher can flip back.

**Curated demo studies to author** (~6-8 studies covering full complexity range):

1. **"What makes a headline credible?"** (Hanna's misinformation study — the canonical Pennycook-style example we've been referencing throughout the build). 12 blocks. Two conditions (control vs warning-labeled headlines). Likert + multiple-choice + free-text + attention-check + demographics. Preregistered to OSF with a realistic abstract. ~200 fake completed responses across both conditions. Comments + 2 replications. Status: **preregistered + running**.

2. **"Brand affinity NPS — Q3 2026 pulse"** — simple consumer research NPS survey. 5 blocks. NPS + multiple-choice + dropdown (industry) + free-text follow-up + demographics. Published (no preregistration). ~150 fake responses. Status: **published + closed**.

3. **"Pilot: Conjoint analysis of laptop preferences"** — research pilot with the new conjoint/MaxDiff block (when shipped). 8 blocks. Demographics + multiple ranking trials + reaction time. Conditions: 3 random orderings. Comments showing back-and-forth between co-authors. ~30 responses (small pilot). Status: **published pilot, draft for full study**.

4. **"Longitudinal: Daily mood + sleep" (Wave 1)** — multi-wave study setup. 6 blocks per wave (likert + slider + audio recording + free-text). Branching: only show fatigue questions if sleep < 6h. ~80 responses across 5 days. Status: **preregistered + running** (Wave 1 of planned 3).

5. **"Voting intent + social media exposure"** — politically-charged study using the social-post block + new media blocks. 15 blocks. Multiple conditions × media exposure design. AND/OR conditioning (V1.10). Sensitive demographics with prefer-not-to-say everywhere. Multiple replications by other workspaces (cross-workspace forks per ADR-0018). Status: **preregistered, awaiting OSF approval**.

6. **"Replication: Pennycook 2021"** — Sofia's replication of study #1 above. Forked from Hanna's study; small variations (different stimuli set). Demonstrates the replications navigation flow. Status: **preregistered + running**.

7. **"Draft: Influence of TikTok recommendation on attitude"** — work-in-progress; in Builder. Half-filled. Shows what a study looks like mid-construction. Status: **draft, unsaved changes**.

8. **"Archived: Failed pilot — needs redesign"** — archived study showing the archive state.

**Each demo study includes:**
- Realistic title + abstract written in researcher's voice (not "Demo Study #3")
- 5-15 blocks of various module types using V1.6's 9 modules + the new V1.12 blocks
- Conditions defined where appropriate (using V1.10's AND/OR builder)
- Branching/skip rules (V1.9.0)
- 30-300 fake responses (cluster-sampled from realistic distributions — likert responses skewed by condition, demographics matching real population estimates)
- Comments from "Maya Okonkwo" + "Hanna Kowalczyk" + "Sofia Marsh" reviewing each other's work (the personas from `02_product/personas/`)
- Activity events emitted properly so the Activity destination shows real-feeling activity
- For preregistered studies: a clearly-non-resolvable DOI format `10.17605/OSF.DEMO/<demo-key>` (visibly different from real OSF DOIs which use `OSF.IO`) — no per-link badge needed because the workspace banner + the distinct DOI shape both make the demo-ness obvious. The runtime DOES NOT push these to real OSF (the `is_demo` flag on the version short-circuits the `registry.push` Inngest job)

**Implementation approach:**
- New file `scripts/seed-demo-workspace.ts` (separate from `seed-network-demo.ts` which is for dev e2e). Imports realistic block configs from a `scripts/demo-studies/` directory — each demo study is a `.ts` file exporting its definition.
- Idempotent: first run seeds + records `workspace.demo_seeded_at`; subsequent runs no-op (researcher can `Reset demo content` to re-seed).
- Fake-response generator: per-block-type plausible-distribution sampler (likert ~ normal(4, 1.2); free-text picked from a curated 20-line pool per block; demographics matched to real US/global distributions per Census/Pew data).
- Audio recordings (when that block ships): use a curated set of 5-second public-domain audio clips for the demo responses. License-clean.

**Workspace-level demo banner (owner confirmed 2026-06-08):**
When `workspace.demo_seeded_at IS NOT NULL` AND the user has demo mode enabled, a persistent banner renders at the top of every researcher-side surface:

> ℹ️ Showing demo content. Toggle off in Settings → Workspace once you start your own studies. [Hide for this session]

Combined with the distinct `OSF.DEMO` DOI format above, no per-link badge is needed — the banner is the primary signal, the DOI shape is the secondary signal, and the demo studies' Open Science Framework links open into a clearly-marked "Demo only" placeholder page (not real OSF) when clicked.

ADR-0023 — Demo-data semantics (write at scaffold time). Captures: demo rows live in real tables filtered by `is_demo`; never counted in production aggregates; never federated to Browse for non-demo viewers; never push to real OSF.

Wireframe gate: `03_design/wireframes/settings-workspace.md` — where the toggle lives + the "Reset demo content" affordance.

Estimate: ~1.5 weeks (authoring the 6-8 studies is the bulk; ~2-3 days per study at quality bar).

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

### C2. More block types (owner screenshot received 2026-06-08; full spec below)

Owner sent the Typeform "Add form elements" panel as the target. ~30 elements shown; below is the breakdown of which become MRT blocks for V1.12, which become study-level settings (not blocks), which are research-specific additions beyond the screenshot, and which are out of scope.

Every new block follows the standard `CoreModuleDef` shape from ADR-0001: `key`, `version`, `responseSchema`, `isAnswerEmpty`, optional `validateAnswer`, Builder Configure form, participant runtime render, results summarization in `getResults`, CSV column extraction. Tests per block.

**Group 1 — Standard form blocks** (~10 days; each is ~0.5-1 day of work)

| Block | `core/` key | `responseSchema` shape | Notes |
|---|---|---|---|
| Email | `email@1.0.0` | `{value: string (email format)}` | Format validation via Zod; optional double-entry confirm |
| Phone Number | `phone@1.0.0` | `{value: string, country: ISO2}` | `libphonenumber-js` for parsing; per-country format hints |
| Address | `address@1.0.0` | `{street, city, state, postal, country}` | Structured fields; optional autocomplete via a free address API later |
| Website / URL | `url@1.0.0` | `{value: string (url format)}` | Format validation; optional Open Graph preview render in Results |
| Contact Info | `contact@1.0.0` | `{name, email, phone?}` | Combined block for cases where researcher wants name+email+phone on one screen |
| Number | `number@1.0.0` | `{value: number, unit?: string}` | Min/max validation; optional unit suffix ("$ per week"); decimal-precision setting |
| Date | `date@1.0.0` | `{value: ISO8601 date}` | Min/max date; default-today option; optional time component (date+time variant) |
| Yes/No | `yes-no@1.0.0` | `{value: 'yes' \| 'no'}` | Two big buttons; configurable as Yes/No or True/False or custom binary labels |
| Dropdown | `dropdown@1.0.0` | `{selected: string}` | Single-select via native `<select>`; UX variant of multiple-choice for long option lists (10+); optional searchable |
| Picture Choice | `picture-choice@1.0.0` | `{selected: string \| string[]}` | Image-based options; single or multi-select; uses ADR-0003 R2 upload for option images; researcher-deterministic option shuffle option |

**Group 2 — Rating & ranking** (~3 days)

| Block | `core/` key | `responseSchema` shape | Notes |
|---|---|---|---|
| NPS (Net Promoter Score) | `nps@1.0.0` | `{score: 0..10}` | 0-10 with "Not at all likely / Extremely likely" anchors; standard NPS labeling; Results auto-calculates Promoter/Passive/Detractor segments |
| Rating (stars) | `rating-stars@1.0.0` | `{value: 1..N}` | Configurable 1-5, 1-7, 1-10 stars or hearts; half-star option; required vs optional |
| Matrix / Likert grid | `matrix@1.0.0` | `{rows: Record<rowKey, scaleValue>}` | Multiple rows × likert columns; common in personality batteries (Big Five) + satisfaction surveys; per-row required toggle; row randomization option |

**Group 3 — Research-specific** (~5 days; not in the Typeform screenshot but high-value for MRT users)

| Block | `core/` key | `responseSchema` shape | Notes |
|---|---|---|---|
| Audio recording | `audio-record@1.0.0` | `{r2_key: string, duration_ms: number}` | Browser MediaRecorder; max-duration limit; R2 upload via ADR-0003; participant must consent (extra prompt before record) |
| Reaction time | `reaction-time@1.0.0` | `{rt_ms: number, response: string}` | Precise JS timing for stimulus → response latency; client-side `performance.now()`; per-stimulus warmup option |
| Visual analogue scale (VAS) | `vas@1.0.0` | `{value: 0..100}` | Slider variant with NO numeric markers (continuous unmarked scale); standard pain/mood research instrument |
| Semantic differential | `semdiff@1.0.0` | `{value: 1..7}` | Bipolar adjective pairs (e.g., "weak ↔ strong" on 7-point); configurable anchor labels per pair |
| MaxDiff / best-worst scaling | `maxdiff@1.0.0` | `{best: itemKey, worst: itemKey}` | From a set of N items, pick best AND worst; classic preference elicitation; multi-trial setup |

**Group 4 — Out of scope V1.12** (defer or skip)

- **File Upload** (general file, not specifically audio/image) — defer to V1.13; needs virus scanning + size limits + storage cost considerations beyond R2's hot tier. Note an ADR-amendment when adding.
- **Signature** — defer; canvas-drawn signature has low research value (most consent uses checkbox); revisit if requested.
- **Payment (Stripe)** — out of scope; not research-related; if a researcher needs to pay participants, Prolific handles that in V1.13.
- **Scheduler** (calendar booking) — out of scope; Calendly-style booking is for interviews not surveys; revisit if owner needs it.
- **Legal** — already covered by the consent screen at `/take/[studyId]/start` (V1.5) + the optional consent block in V1.12 Section G.
- **Clarify with AI / FAQ with AI** — out of scope; these are V2.0 AI features per the roadmap.

**Group 5 — Meta affordances** (not blocks; ~3-4 days)

These are not modules; they're study-level settings or layout primitives.

- **Welcome Screen** — study-level setting (in Overview tab from Section B1 OR a new "Intro" block kind). Researcher writes a title + subtitle + intro paragraph + "Start" button. Shown to participants before block #1. Storage: `experiment_version.welcome_screen jsonb` (rides with snapshot).
- **End Screen** — study-level setting. Shown after the last block before the existing "Thank you" complete page (V1.5). Researcher writes a custom thank-you + optional redirect URL + optional debriefing text. Storage: `experiment_version.end_screen jsonb`.
- **Multi-Question Page** — layout setting per block-group. Allow rendering N blocks on one scrollable page instead of one-per-page. Researcher toggles "Multi-question screen" on a group; participant sees them together. Conflicts with V1.5's "per-question SSR for analytics fidelity" (ADR-0013) → needs a small ADR amendment: per-screen routing still uses distinct URLs (`/take/.../q3-5` carries multiple blocks), preserving Clarity heatmaps at the screen level rather than per-question.
- **Question Group** — grouping affordance in the Builder. Researcher wraps blocks in a group with a name + collapsible header. Pure UI organization; doesn't affect participant runtime by default unless paired with Multi-Question Page.
- **Partial Submit Point** (save-and-continue-later) — defer; needs an anonymous-resume token + email-link mechanism not currently in the runtime; significant scope; revisit V1.13+.
- **Redirect to URL** (after study completion) — study-level setting. Researcher provides a URL; participant is redirected after the End Screen. Standard for Prolific completion-code redirects. Storage: `experiment_version.redirect_url`.

**Per-block standard work (every new block has):**
1. Schema definition in `server/modules/registry.ts`
2. `validateAnswer` for any non-trivial constraints
3. `isAnswerEmpty` honest about empty states
4. Builder Configure form fields
5. Participant runtime render (mobile-responsive per Section K mini-list)
6. Results summarization in `getResults` (sensible default; e.g., NPS = Promoter/Passive/Detractor segments)
7. CSV column extraction in `stringifyAnswer`
8. Unit tests for shape + extraction + summarization
9. Re-seed the Neon production catalogue when shipping (per V1.7.2 hotfix pattern)

**Per-block ADR consideration:**
- Picture Choice + Audio recording need ADR-0003 R2 upload wiring + virus-scan policy.
- Reaction time needs an ADR-amendment to ADR-0013 (client-side timing escape hatch; precision guarantees).
- MaxDiff needs an ADR for multi-trial setup semantics (how trials relate to a single `response_item` row).

**Estimate for Section C2 expanded: ~3 weeks** (was ~1 week before screenshots). Code tab can ship in waves: Group 1 → Group 2 → Group 3 → meta affordances. Group 1 alone is huge value.

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

## Section F — Visual theme / layout editor (~4 weeks; the biggest item)

Owner: "Design of research should be determined by researcher because everything need to be controlled by researcher. We should add some visual editor for entire research, theme or layout (like default survey or Facebook platform)."

**Owner answer (2026-06-08):** "More granular — primitives might be good start point — but for some reason researchers want to have more granular control to keep study more accurate and reduce some noise which might affect the outcomes. Also we should add some defined layouts like social media (FB, X, Instagram, TikTok), news pages, business portal, lifestyle website, forum, blog..."

The owner's point about **ecological validity** is research-critical: a study about misinformation on Facebook is more believable if participants see something that LOOKS like Facebook. The platform presets aren't just cosmetic — they're a methodological feature that reduces "research-context noise" (participants behaving differently because the study LOOKS like a survey rather than the real platform being studied).

This is **researcher-controlled per-study theming + layout** with deep granularity + platform-mimicking presets. Decoupled from the workspace-level design language (warm parchment + Plex Serif), each study can ship to participants with a custom appearance — including UI that visually mimics a target platform.

### F1. Theme primitives (granular, per owner)

A study's theme is a record of overridable CSS tokens (per ADR-0007's adapter discipline — vendor styling stays isolated). The full surface, granular for research-grade control:

**Colors (8 tokens):**
- Primary brand
- Secondary / accent
- Page background
- Surface (card/panel background)
- Text primary
- Text muted
- Border
- Success / Error / Warning (semantic colors)

**Typography (5 controls):**
- Heading font (curated list ~12 options: Plex Serif / Plex Sans / Inter / Helvetica / Arial / Georgia / Times / Roboto / Open Sans / Lato / Source Sans / system-ui)
- Body font (same list)
- Mono font (Plex Mono / SF Mono / Menlo / Courier)
- Base size (12-18px)
- Line height (1.3 / 1.5 / 1.7)

**Layout (6 controls):**
- Container width (narrow 480px / medium 640px / wide 800px / full)
- Per-question screen vs multi-question screen (paired with C2 Group 5)
- Progress indicator (percentage bar / step counter / dot pagination / none)
- Navigation buttons (Back+Next / Next only / keyboard-only)
- Question alignment (centered / left)
- Block density (compact / normal / spacious — controls padding between blocks)

**Visual primitives (5 controls):**
- Border radius (sharp 0 / soft 4 / rounded 8 / pill 16+)
- Shadow depth (none / subtle / soft / pronounced)
- Background pattern (blank / dots / lines / grid / parchment / custom-upload)
- Button style (filled / outlined / ghost / underline)
- Input style (bordered / underlined / filled / minimal)

**Branding (3 controls):**
- Logo (R2 upload per ADR-0003; rendered top-left of every page)
- Favicon (R2 upload; injected as `<link rel="icon">` on `/take/*` routes)
- Footer text (markdown; default "Powered by Massive Research Tool" — researcher can override or remove on paid plans)

**Per-block-type overrides (granular control owner asked for):**
Each block type exposes 3-5 styling slots researcher can override:
- Multiple choice / Picture choice: option style (cards / list / pills), selected highlight, option font
- Likert / Matrix: scale color (anchored on primary), label position (above / inline / below), row spacing
- Slider / VAS: track color, thumb style, label position
- Free text: input background, character counter visibility, placeholder style
- Social-post / news/feed block: per-platform overrides (see F1.5 platform presets)

Stored as `experiment_version.theme` (jsonb on the version; rides with the snapshot per ADR-0012; preregistered versions freeze the theme exactly so a replication years later renders identically).

### F1.5. Platform layout presets (owner-requested 2026-06-08)

Each preset is a **complete theme + layout + block-rendering bundle** that makes the participant runtime visually mimic a target platform. Critical for ecological-validity research where the "look" of the medium being studied matters.

**Full preset list (17 total; owner expanded 2026-06-08):**

Non-mimicking baselines (4):
1. **Academic** — current MRT default (warm parchment + Plex Serif + modular floating cards). Researcher-honest, neutral, "this is clearly a research instrument."
2. **Clinical / Medical** — light blue + Inter + minimal cards + plain borders + branding removable. For health studies that need to look like NHS / Mayo / hospital intake forms.
3. **Modern survey** — white + Inter + sharp corners + progress bar. For when "looks like Typeform/SurveyMonkey" is the desired baseline.
4. **Playful** — light pastels + rounded + soft shadows + friendly typography. For children / youth studies.

Mimicking — social media (4):
5. **Facebook** — FB blue (#1877F2) header + Helvetica/Segoe + rounded white cards on light gray bg + FB-style block headers (avatar + name + timestamp). The `core/social-post` block renders as a real-looking FB post with like/comment/share buttons (UI only, non-functional). Critical for misinformation/social-media research.
6. **X (Twitter)** — black bg + monochrome accent + condensed Helvetica + tweet-style cards with engagement icons (reply/repost/heart/views). Social-post block renders as a tweet thread.
7. **Instagram** — gradient header (purple-pink-orange) + Helvetica + image-forward layout (large image area; small text below) + heart/comment/share icons. Picture-choice block emphasized over text.
8. **TikTok** — black bg + bottom-up scroll feel + bright accent (#FE2C55) + heavy use of vertical video aspect ratios + emoji-heavy. Video block renders as fullscreen with side action bar.

Mimicking — web content (5):
9. **News site** — newspaper-style with serif headline + sans-serif body + sidebar + byline + datestamp + "Subscribe" CTA (mocked). For headline-credibility research (the canonical use case).
10. **Business portal** — corporate enterprise look: navy/gray + Inter + structured forms + multi-column layouts + "Submit to HR" CTA. For workplace surveys / B2B research.
11. **Lifestyle website** — magazine-style + warm photography + serif/sans mix + ample whitespace. For wellness / lifestyle / consumer attitude research.
12. **Forum** — phpBB / vBulletin-style threaded layout + monospace usernames + post-count badges. For online-community-behavior research with a "traditional forum" aesthetic.
13. **Blog** — Medium-style: minimal + reading-focused + large headers + author byline + clap/share at bottom. For long-form attitude research.

Mimicking — owner-expanded 2026-06-08 (4):
14. **Reddit** — Reddit's threaded discussion layout: subreddit header + upvote/downvote arrows + comment-tree indentation + flair tags + "mod" indicators. The `core/social-post` block renders as a Reddit post; comments block renders as nested Reddit comments. Useful for online-community-behavior + content-moderation + community-norms research.
15. **LinkedIn** — professional feed: light gray bg + Inter + endorsement badges + connection-degree indicators ("1st", "2nd") + "Promoted" labels + post-engagement bar with reactions (Like / Celebrate / Support / Insightful / Curious). Social-post block emphasizes credentials. Useful for workplace + B2B + recruitment-bias research.
16. **YouTube comments** — comment-thread layout positioned UNDER a placeholder video player at the top; pinned-creator-response affordance; like/reply counts; "creator hearted this" badges. The video block (when shipped) renders as the YouTube player at the top with comments below. Useful for video-content engagement + parasocial-relationship research.
17. **Chat (Discord / WhatsApp / iMessage)** — chat-bubble layout with sender bubbles right-aligned + receiver bubbles left-aligned + typing indicators + read receipts + reactions on long-press + threaded replies indented. Owner picks per-study which sub-style (Discord vs WhatsApp vs iMessage) the bubbles render as (3 style variants under the same preset key). Useful for interpersonal-communication + group-dynamics + private-vs-public-context research.

**How a preset is structured:**

Each preset is a TypeScript module at `lib/themes/presets/<preset-key>.ts` exporting:
```ts
export const facebookPreset: ThemePreset = {
  key: 'facebook',
  name: 'Facebook',
  description: 'Mimics the Facebook web feed.',
  tokens: { /* the 22-token theme primitives above */ },
  layout: { /* the layout primitives above */ },
  blockOverrides: {
    'core/social-post': FacebookSocialPostRenderer, // alternative React component
    'core/multiple-choice': FacebookPollRenderer,    // looks like FB Poll
    // … per block type
  },
  warnings: [
    'Mimicking Facebook may affect participant trust; declare in your consent screen.',
  ],
};
```

The participant runtime checks `experiment_version.theme.preset_key` — when set, the runtime imports the preset module, applies its tokens as CSS variables, applies its layout settings, and uses its `blockOverrides` to swap in alternate block renderers where defined.

**Choosing a preset doesn't lock the researcher in** — they can pick a preset as a baseline + override individual tokens / per-block-type styling on top. The Design stage shows preset + overrides separately so researchers can see what they've changed.

**Methodological / ethical IRB acknowledgment gate (owner confirmed 2026-06-08):**

When a researcher picks any of the 13 mimicking presets (5-17), a **modal acknowledgment** appears before the preset applies:

> ⚠️ **This preset visually mimics [Facebook / X / Reddit / etc.]**
>
> Mimicking a real platform can affect participant trust, perceived authority, and reactivity. Use only where it's methodologically justified + you have IRB approval where applicable.
>
> ☐ I confirm I have IRB approval (or my study type doesn't require it) and I've documented this design choice in my methodology.
>
> [Cancel] [Apply preset]

Researcher must check the box + click Apply. The acknowledgment is stored on `experiment_version.theme.preset_irb_acknowledgment = { acknowledged_at, user_id, preset_key }` (rides with the version per ADR-0012; preregistered = the acknowledgment is locked into the immutable record). The non-mimicking baselines (1-4 Academic/Clinical/Modern/Playful) apply without the gate.

The Overview tab (B1) auto-injects the preset name + acknowledgment date into the methodology section so the IRB review trail is part of the preregistration narrative pushed to OSF.

**Preset budget for V1.12 ship (Wave 5; ~3-4 weeks total for all 17):**
- Academic + Clinical + Modern survey + Playful (4 baselines; no IRB gate) — ~2 days total to author.
- Facebook + X + News + Business portal (mimicking quartet) — ~4-5 days total.
- Instagram + TikTok + Lifestyle + Forum + Blog (Wave 5b) — ~5-6 days total.
- Reddit + LinkedIn + YouTube + Chat (Discord/WhatsApp/iMessage variants) (Wave 5c, owner-expanded) — ~5-6 days total (Chat has 3 sub-style variants so it's effectively 6 presets-worth of styling work).
- IRB acknowledgment modal + acknowledgment-storage in `experiment_version.theme` + Overview-auto-injection — ~2 days.
- Per-block-type renderer overrides framework (the typed contract every preset implements) — ~3 days.

ADR-0024 (Section F5) covers the architectural locks for presets: preset module shape, block-override-renderer contract, security (still no scripts, no arbitrary CSS — preset modules are vetted-by-us code, not user content), and the methodological-warnings discipline.

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

### F5. ADR-0024 — Per-study theming + platform presets

The architecture decision. Covers:

- **Theme + layout + preset_key** as jsonb on `experiment_version.theme` (rides with the snapshot per ADR-0012; preregistered = frozen theme exactly; replications years from now render identically).
- **Themes are version-scoped, not study-scoped** — a researcher can A/B test "Facebook vs Academic" by publishing two versions with different presets + comparing engagement.
- **Preset modules are vetted code we ship**, not user content. The `lib/themes/presets/*.ts` files are TypeScript modules in the repo; researchers pick from them but can't author new presets in V1.12 (that's a V1.13+ marketplace question per ADR-0008 substrate).
- **Per-block-type renderer overrides** are CONTRACTED — each preset's `blockOverrides[blockKey]` must implement the same `BlockViewProps` contract as the default renderer (`{block, value, onChange}`); the runtime swaps renderers at SSR time per ADR-0013. No client-side dynamic swapping.
- **Branding limits**: no scripts, no arbitrary CSS, no remote font URLs beyond our curated list. Researcher-customizable values are pre-validated against allowlists (color = valid CSS color; font = one of curated names; pattern = one of `none|dots|lines|grid|parchment|custom-upload`). Custom logo/favicon uploads go through R2 + content-type validation per ADR-0003.
- **Methodological warning surface** — mimicking presets (FB/X/Instagram/TikTok/news/forum/blog) carry a `warnings: string[]` field surfaced in the Design stage UI; the Overview tab (Section B1) auto-injects the chosen preset into the methodology section so IRB/preregistration captures the visual context.
- **Per-block-type granular overrides** — researcher can override ~3-5 styling slots per block type (e.g., multiple-choice option style; likert label position) within a controlled `blockStyleOverrides: Record<blockKey, Partial<BlockStyles>>` map. Schema-validated; unknown keys rejected.
- **The workspace's design language** (`tokens.css` + brief v0.6 — warm parchment + Plex Serif + modular floating cards) stays the RESEARCHER-side language; per-study themes only affect the participant runtime at `/take/*`. Researcher-side Builder/Whiteboard/Studies/Browse/Activity/etc. are unchanged.
- **No CSS-in-JS at runtime** — themes resolve to CSS variables at SSR time per ADR-0013, injected into a `<style>` block on the per-question page. Zero client-side theme switching for participants (deterministic for analytics).

Wireframe gate: `03_design/wireframes/design-stage.md` — Design stage UI (preset picker + granular controls panel + live preview); `03_design/wireframes/design-stage-presets-gallery.md` for the preset showcase.

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

## Section L — Block grouping + experimental parts (owner-added 2026-06-08, ~1.5 weeks)

Owner asked for two compositional affordances that are foundational for serious experimental design and don't exist today (today blocks are a flat list):

### L1. Question Groups with anchor artifacts

> "I would like to group questions to display them together — for example post or image alongside multichoice and likert all together — and data assigned to my artifacts."

The use case: a researcher shows a **stimulus** (a social media post, an image, a news headline) and asks **multiple measures** about it on the same screen (likert: "How credible is this?"; multiple-choice: "Would you share this?"; free-text: "Why?"). All measures are semantically anchored to the stimulus — data analysis aggregates responses **by stimulus**, not by question-in-isolation. This is the standard "stimulus + measures" pattern in social/cognitive psychology research.

**Block kind: `core/question-group@1.0.0`**

A new block-kind that wraps N member blocks with an explicit **anchor**:

- `id`, `type: "question-group"`, `title?` (optional researcher-visible label), `parent_group_id?` (for nesting under sections — Section L2)
- `anchor_block_id?: string` — references one of the members; that member is the "artifact under study" (e.g., the social-post block). Optional — a group without an anchor is just a "render these together" grouping (e.g., demographics block + a few related likerts on one screen).
- `members: BlockInstance[]` — actually, members are kept in the flat blocks array; the group references them via the new `parent_group_id` field on every block (every block knows its parent group via this field). This minimizes the data-model change — the flat array stays flat, with a tree-shape derived from `parent_group_id`.
- `layout: "stacked" | "side-by-side" | "stimulus-prominent"` — controls how members render together. `stimulus-prominent` is the standard pattern (anchor at top large; measures below).
- `condition?` — same showIf shape as ADR-0021 / V1.10's condition builder. Hides/shows the whole group as a unit. If conditioned, NONE of the members render.

**Data linkage to the artifact** (the load-bearing feature):

Per ADR-0014's `response_item` table: today `response_item.block_instance_id` references the answering block directly. We add:

- `response_item.group_id?: text` — the question-group's `id` (if the answering block is inside a group)
- `response_item.anchor_block_id?: text` — the anchor block's `id` (denormalized from the group for query speed)

Now Results / Data Export can pivot:
- "Show me the credibility-likert mean **for each artifact** (group anchor)"
- "Show me all responses **to this specific social-post**" — joins on `anchor_block_id`
- CSV export gets a new column `artifact_id` per response row (the anchor block's instance id)

This is the half that makes the grouping methodologically useful, not just UI.

**Builder UI:**
- Drag blocks into a "group container" on the Builder canvas; the container renders with a labelled border + the anchor highlighted with a small "★ Anchor" marker (researcher can re-pick the anchor by clicking a different member).
- Whiteboard canvas (React Flow): the group renders as a grouped node with members as sub-nodes (using React Flow's parent-node primitive — first-class for this pattern).
- List view: indented under the group header.

**Participant runtime:**
- One screen per group (instead of one per question), respecting the V1.5 ADR-0013 per-question-SSR-for-analytics rule via a small amendment: per-screen routing carries multiple block_instance_ids in the URL (`/take/.../screen/g1` where `g1` is the group id), preserving Clarity heatmaps at the group level. Answers from a screen-submit roll up as multiple `response_item` rows in one transaction.
- The layout setting (stacked / side-by-side / stimulus-prominent) controls the visual arrangement on the screen.

ADR-0028 — Question groups + anchor artifacts. Locks the data model (parent_group_id on blocks + group_id / anchor_block_id on response_item), the per-screen-routing amendment to ADR-0013, the Results pivot semantics.

Wireframe gate: `03_design/wireframes/builder-question-groups.md`.

### L2. Experimental parts / sections / between-screens

> "Groupings other groups and questions in parts of experiment — part one, between screen, part two, ... (parts also might be conditioned)."

Standard research terminology: an experiment has **phases** (sometimes called blocks in the experimental-psych sense — confusingly different from our "blocks" = questions). Common pattern:

- **Part 1 — Pre-test:** demographics + baseline measures
- **Between-screen:** "You'll now see 10 social media posts. After each, please answer the questions."
- **Part 2 — Stimulus phase:** 10 question-groups (each with one stimulus + measures)
- **Between-screen:** "Almost done! A few final questions."
- **Part 3 — Post-test:** manipulation checks + debrief
- Each part may have an optional condition (e.g., only show Part 3 to participants in the warning-labeled condition)

**Two new block kinds:**

- **`core/section@1.0.0`** — a labelled top-level part of the experiment. Has `title`, `description?`, `condition?`, and contains member blocks (via their `parent_group_id`). Renders as a visual divider in the Builder + a participant-runtime "Part 1 of 3" indicator at the top of each screen within the section. Sections cannot nest sections (one level of section + groups inside).
- **`core/transition@1.0.0`** — a between-screen narrative block. No response captured. `content_md` (markdown) is shown as a full-screen interstitial with a "Continue" button. Used for "You'll now see 10 posts...", debrief screens, instructions between parts.

**Hierarchy supported:**

```
Section "Part 1: Background"
  ├ Block: demographics
  └ Block: baseline likert
Transition: "You'll now see 10 posts..."
Section "Part 2: Stimuli"
  ├ Question-group "Post 1"
  │   ├ Block: social-post (anchor)
  │   ├ Block: credibility likert
  │   └ Block: share-intent multiple-choice
  ├ Question-group "Post 2"
  │   └ ...
  └ ... (8 more)
Transition: "Almost done..."
Section "Part 3: Manipulation checks"
  └ ...
```

All represented as a flat blocks array with `parent_group_id` references. Order = array index. Tree derivation = client-side fold.

**Conditional sections:**

A section with a `condition` (using the V1.10 AND/OR ConditionBuilder) hides its entire subtree if the condition is false. Same evaluation as V1.9.0's branching engine — the runtime walks the tree, skips conditioned-out sections + their descendants.

**Builder UI:**
- Sections rendered as collapsible top-level containers (like Notion toggle blocks).
- Drag-reorder applies at the section level too (move whole sections around).
- Right-panel Configure shows section title + description + condition.

**Participant runtime:**
- "Part X of Y" indicator at top of each screen within a section (rolling up from the section's title).
- Transition screens get their own URL: `/take/.../transition/t1`.

ADR-0028 amendment (or a separate ADR-0029 — small one): section + transition block kinds + the hierarchy tree fold.

Wireframe gate: `03_design/wireframes/builder-sections-and-parts.md`.

### L3. Data model amendment (small additive migration)

Two changes:

1. Every block (in `definition_snapshot.blocks`) gains a `parent_group_id?: string` field. Default null = top-level. Renamed-from-nothing; backwards compatible (existing studies have all-null parent_group_ids = same flat structure they have today).
2. `response_item` table gains `group_id text NULL`, `anchor_block_id text NULL`. Additive migration; backwards compatible.

Per ADR-0012 the blocks JSON shape is researcher-editable; the parent_group_id field is just a new optional property. Preregistered = the nesting is frozen with the snapshot.

### L4. Results + Export integration

- `getResults` now optionally aggregates by anchor — researcher picks "By question" (current behavior) or "By artifact" (NEW: groups response items by anchor_block_id, shows per-artifact means/distributions).
- Section D (data export builder) variable list adds a per-group "artifact_id" virtual column when groups exist.
- The platform presets in Section F can render groups differently (e.g., on the Facebook preset, a question-group with a social-post anchor renders as a real FB post with the measures BELOW it; on the Reddit preset, the post is a Reddit post with measures threaded under it).

---

## Section M — IA v0.4: Focused study mode (owner-added 2026-06-08, ~2 weeks)

Owner asked for a substantial IA shift after using the tool: when a researcher selects a study from the dashboard, the workspace chrome should get out of the way — they're in "study mode" until they explicitly leave. Inspired by the attached screenshot (a Journeys app showing slim workspace switcher + breadcrumb + close-X with no destination sidebar).

### M1. The proposed model — two IA modes

**Mode 1 — Workspace mode** (the default; current IA):
- TopBar with workspace switcher + global ⌘K + user menu
- LeftRail with destinations: Studies / Library / Frameworks / Activity / Browse / Settings
- Surfaces for cross-study work (Browse, Activity, Frameworks listing, etc.)
- Routes: `/`, `/studies`, `/browse`, `/activity`, `/frameworks`, `/library`, `/settings/*`

**Mode 2 — Focused study mode** (NEW; owner-requested):
- TopBar transforms to: workspace name + collapse icon on the left, breadcrumb `Studies / [Study Title]` in the middle, ⋯ More menu + ✕ Close on the right (matching the screenshot)
- LeftRail collapses entirely (or replaced with a study-internal nav: stage selector + sub-panels)
- The right panel (Configure / Details / Conditions / Versions / Replications / Comments) stays
- The full work surface fills the rest of the page
- Closing (✕ click) returns to `/studies` (or wherever the user came from)
- Routes: `/studies/[id]/*` (everything under a study)

The MODE switch happens automatically based on URL path. No manual toggle.

### M2. The visual changes (per screenshot)

- **Workspace name at top-left** (replacing the current TopBar's workspace switcher) with a small avatar/logo + name + subtitle (e.g., "Design Team"). Clicking expands a workspace switcher dropdown.
- **Collapse icon next to the workspace name** — when in focused mode, the LeftRail can be toggled to a slim icon-only column OR fully hidden. Default: hidden (the bare minimum chrome).
- **Breadcrumb `Studies / [Study Title]`** — `Studies` is a link back; the title is the current focus. Editable inline if the user has write permission (V1.8.2 already shipped editable title).
- **Right-aligned ⋯ menu + ✕ close** — the menu has actions like Archive / Duplicate / Export / Settings / Delete (a per-study version of the bulk actions from Section K); the close X navigates back to `/studies`.
- **Top bar visually merges with the page** — no boxed container around it. The current implementation puts the TopBar in a card-like wrapper; this changes to a flat strip flush with the viewport edge, with a subtle shadow or border-bottom only. (Per owner: "Visually make nav also part of top of page not as box as is now.")

### M3. Resizable sidebar handle

> "Between main section and left sidebar should be handle to make them wider/narrower."

Add a draggable handle between the LeftRail (or its collapsed icon-strip in focused mode) and the main content area. User drags to resize; saved to `user.publicMetadata.sidebarWidth` per user, per workspace.

Implementation: `react-resizable-panels` (MIT, small, accessibility-conscious). Add to lock-in inventory.

Min/max widths: collapsed (~48px icon strip) / narrow (~200px) / default (~256px) / wide (~360px). Drag snaps to these breakpoints OR truly continuous.

### M4. Stage-tab + right-panel position decision

Owner: "Right side of nav keep as is now or move to left panel."

The current right panel (Configure / Details / Conditions / Versions / Replications / Comments) is at the right of the work surface. Options:

- **(a) Keep right** (current) — feels balanced; mirrors many design tools (Figma, Sketch).
- **(b) Move to left** — replaces the (now hidden) LeftRail in focused mode; the right side becomes the canvas only. Might feel cleaner in focused mode where there's no left nav.
- **(c) Both options exposed** — researcher picks via a Settings preference (right-handed vs left-handed handedness; researcher autonomy).

Recommendation: ship (a) keep-right by default + (c) settings preference for left-handed users. Owner's wording "keep as is now or move to left panel" suggests they're not yet sure; the settings toggle defers the choice and respects researchers who'd want different.

### M5. Routes + layout architecture

Next.js route group split:

```
app/
  (app)/
    (workspace)/        ← Mode 1 routes (NEW group)
      layout.tsx        ← TopBar with destinations + LeftRail
      page.tsx          ← / → redirects to /studies (already done per commit 5fcda09)
      studies/
        page.tsx        ← /studies
      browse/
        page.tsx
      activity/
        page.tsx
      frameworks/
      library/
      settings/
    (study)/            ← Mode 2 routes (NEW group)
      layout.tsx        ← Slim focused-mode TopBar; no LeftRail
      studies/[id]/
        layout.tsx      ← Stage tabs + right panel
        overview/page.tsx
        build/page.tsx
        preview/page.tsx
        share/page.tsx
        preregister/page.tsx
        run/page.tsx
        results/page.tsx
```

The two groups are siblings under `(app)`. Next.js route groups don't affect URL paths — `/studies/[id]/build` continues to work; only the layout chain changes.

### M6. Cmd+K command palette becomes more important

With the LeftRail destinations hidden in focused mode, **Cmd+K** (already in Section K mini-list) becomes the primary cross-study navigation. Bump priority + expand search:

- Search across studies (jump to a study)
- Search across destinations (jump to Browse / Activity / Frameworks)
- Recent items
- Quick actions ("Save as named", "Preregister", "Export results")
- ⌘K respects focused-mode context: if user is inside a study, recent block edits + study-internal actions surface first.

### M7. IA v0.4 document update

The IA document at `03_design/ia/information-architecture.md` is at v0.3. This change is a v0.4. Code tab writes the v0.4 amendment that captures:

- The two-mode model (workspace vs focused study)
- The mode-switch rules (URL-path-driven; no manual toggle)
- Cmd+K's elevated role
- The right-panel-side preference setting
- The collapsible/resizable sidebar primitive

### M8. ADR-0029 — IA v0.4: Focused study mode + dual layout

Architecture decision covers:

- The Next.js route-group split (`(workspace)` vs `(study)`)
- The resizable-panels library choice (`react-resizable-panels`; MIT; add to lock-in inventory with migration target = custom hook over `useState` + `resize observer`)
- Mode switch behavior + transitions (no animation in v1; just route change → layout swap)
- Persistence of sidebar width (per user, per workspace; stored in Clerk metadata via the AuthAdapter)
- Right-panel-side preference setting + Settings UI surface
- Backward compatibility — the existing routes work unchanged; no migration needed.

Wireframe gates: `03_design/wireframes/focused-study-mode.md` + `03_design/wireframes/workspace-mode-topbar.md`.

### M9. Section M sequencing (~2 weeks Code tab)

- PR L1 (~3 days): route group split + slim TopBar component for focused mode + close-X → /studies behavior
- PR L2 (~3 days): resizable-panels integration + sidebar width persistence + min/max breakpoints
- PR L3 (~2 days): TopBar flat-flush styling (no box) + workspace selector dropdown
- PR L4 (~3 days): Cmd+K palette expanded with focused-mode awareness + studies search
- PR L5 (~1 day): right-panel-side preference + Settings UI
- PR L6 (~2 days): IA v0.4 document + ADR-0029 + wireframes + axe spec for focused mode
- Test: Playwright spec that navigates / → /studies → click study → assert focused mode chrome → click ✕ → back to /studies.

---

## Sequencing recommendation (updated 2026-06-08)

Bundle as PR streams Code tab can land in any order. Given the expanded scope, Code tab's recent cadence (6 tagged releases in 4 days), and the high authoring cost of A3 demo content + F platform presets, splitting into V1.12.0 / V1.12.1 / ... sub-releases is probably cleaner than one giant V1.12 bundle.

**Wave 1 — quick wins (~1.5 weeks; ship as V1.12.0):**
- PR 1: A1 sign-out + A2 profile + A4 Preview-as-modal (~1 week)
- PR 2: H autosave indicator + I public preview URL (~1 week, parallel to PR 1)

**Wave 2 — Overview + media + first block-type batch (~2.5 weeks; ship as V1.12.1):**
- PR 3: B1 Overview tab + B2 PDF export (~1 week)
- PR 4: C1 embedded content blocks (image/video/text/link) (~1 week)
- PR 5: C2 Group 1 standard form blocks (email/phone/address/url/contact/number/date/yes-no/dropdown/picture-choice) (~1.5 weeks)

**Wave 3 — research blocks + rating/ranking + demo content (~3 weeks; ship as V1.12.2):**
- PR 6: C2 Group 2 rating/ranking (NPS/stars/matrix) + Group 3 research-specific (audio/reaction-time/VAS/semantic-differential/MaxDiff) (~1.5 weeks)
- PR 7: A3 realistic-complex demo studies + ADR-0023 demo-data semantics (~1.5 weeks; could parallelize with PR 6)

**Wave 4 — replications nav + export builder (~3 weeks; ship as V1.12.3):**
- PR 8: E1+E2+E3 replications navigation + ADR-0025 (~1.5 weeks)
- PR 9: D1+D2+D3 export builder + dictionary + explorer (~2 weeks; parallelize with PR 8)

**Wave 5 — visual theme + platform presets (~4 weeks; ship as V1.12.4 — the big one):**
- PR 10: F1 granular theme primitives + F2 layout + F4 SSR runtime + ADR-0024 (~1.5 weeks)
- PR 11: F1.5 platform presets first 4 (Academic/Clinical/Modern/Playful) (~3 days)
- PR 12: F1.5 platform presets — mimicking quartet (FB/X/News/Business portal) (~1 week)
- PR 13: F1.5 remaining presets (Instagram/TikTok/Lifestyle/Forum/Blog) (~1 week)
- PR 14: F3 Design stage UI + F5 ADR-0024 finalization + G researcher-controlled copy (~5 days)
- PR 15: C2 Group 5 meta affordances (Welcome / End / Multi-Q page / Question Group / Redirect) — folds into the Design stage UI work (~3 days)

**Wave 5b — IA v0.4 focused study mode (NEW, owner-added 2026-06-08; ~2 weeks; ship as V1.12.4b):**
- PR L1 (~3 days): route group split `(workspace)` vs `(study)` + slim TopBar for focused mode + close-X behavior
- PR L2 (~3 days): resizable-panels integration + sidebar width persistence (Clerk metadata via AuthAdapter)
- PR L3 (~2 days): TopBar flat-flush styling (no box) + workspace selector dropdown
- PR L4 (~3 days): Cmd+K palette expanded with focused-mode awareness + studies search
- PR L5 (~1 day): right-panel-side preference + Settings UI
- PR L6 (~2 days): IA v0.4 document + ADR-0029 + wireframes + axe spec for focused mode

**Wave 5c — block grouping + experimental parts (NEW, owner-added 2026-06-08; ~1.5 weeks; ship as V1.12.4c):**
- PR M1 (~3 days): data-model amendment (parent_group_id on blocks + group_id/anchor_block_id on response_item) + Drizzle migration + ADR-0028
- PR M2 (~3 days): `core/question-group@1.0.0` block kind + Builder UI (group container with anchor marker) + tree-aware rendering + Whiteboard React Flow parent-node integration
- PR M3 (~3 days): `core/section@1.0.0` + `core/transition@1.0.0` block kinds + conditional sections + participant runtime "Part X of Y" indicator + per-screen routing amendment to ADR-0013
- PR M4 (~2 days): Results pivot ("By question" vs "By artifact") + export builder anchor column + integration with V1.12 platform presets (group renders differently per platform)
- PR M5 (~1 day): wireframes (builder-question-groups + builder-sections-and-parts) + integration tests

**Wave 6 — onboarding tour + UX wins + sign-off (~1.5 weeks; ship as V1.12.5):**
- PR 16: J onboarding tour (pairs with demo content from PR 7) (~1 week)
- PR 17: K Cmd+K palette + saved comment drafts + better empty states + mobile audit (~1 week, parallel) — Cmd+K work was elevated in Wave 5b PR L4; this is the remaining items
- PR 18: bulk study operations — checkbox selection on `/studies` + Archive/Duplicate/Export/Tag/Delete-selected (owner confirmed 2026-06-08 to keep in V1.12 Wave 6; ~3 days)

After each Wave: deploy + smoke + audit log entry + sub-tag (v1.12.0, v1.12.1, ...). Or bundle into one big V1.12 deploy at the end — Code tab's call. Per ADR-0016 deploy pattern + the deploy:verify procedure.

**Revised total V1.12 estimate: ~13-14 weeks** after Sections L (~1.5w) + M (~2w) added. Code tab's actual cadence will likely compress this; estimates are conservative.

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

## Open questions — answered by owner 2026-06-08

1. ✅ **Block types screenshots received.** Section C2 expanded with full spec (Group 1 standard form, Group 2 rating/ranking, Group 3 research-specific, Group 4 out-of-scope, Group 5 meta affordances). ~3 weeks of new block work.
2. ✅ **Demo content style**: **generated but realistic — mostly complex, not Lorem Ipsum.** Owner needs studies to test functionality + see app in believable shape. Section A3 now lists 6-8 curated demo studies (misinformation / NPS / conjoint / longitudinal / political / replication / draft / archived) authored at quality bar with realistic blocks + responses + comments + replications. ~1.5 weeks authoring effort.
3. ✅ **Visual theme editor scope**: **more granular** + add platform layout presets. Section F now spans 22 theme tokens + 6 layout controls + per-block-type style overrides + 13 platform presets (Academic / Clinical / Modern survey / Playful + Facebook / X / Instagram / TikTok / News / Business portal / Lifestyle / Forum / Blog). Section F estimate expanded from ~2-3 weeks to ~4 weeks. Methodological-warning surface added for mimicking presets.
4. ✅ **Public preview URL expiry**: 7-day default confirmed.
5. ⏳ **Bulk study operations** — owner asked for explanation. Bulk operations let a researcher select multiple study rows via checkboxes + perform an action on all selected at once (Archive multiple / Duplicate multiple / Export multiple as zip / Tag multiple / Delete multiple). Saves clicks for researchers managing 20+ studies. **Verdict pending — keep in V1.12 K mini-list, push to V1.13, or skip indefinitely?**

## Open questions — fully resolved 2026-06-08

- ✅ **Demo OSF DOIs**: workspace-level "Showing demo content" banner + distinct `10.17605/OSF.DEMO/<key>` DOI format. No per-link badge.
- ✅ **Mimicking presets IRB gate**: required. Modal acknowledgment + checkbox before applying any of the 13 mimicking presets; acknowledgment stored on the version + auto-injected into the Overview methodology section.
- ✅ **Bulk operations**: keep in V1.12 Wave 6 (~3 days).
- ✅ **More platform presets**: ALL four added (Reddit + LinkedIn + YouTube comments + Chat-bubble with Discord/WhatsApp/iMessage variants). Total preset count = 17 (4 non-mimicking baselines + 13 mimicking).

All scope locked. Code tab can start Wave 1 (PRs 1+2) whenever; subsequent Waves stack as PRs land. ADRs to draft as each Wave nears (ADR-0023 demo / ADR-0024 theming-with-presets-and-IRB-gate / ADR-0025 replication graph / ADR-0026 preview URL / ADR-0027 PDF rendering).

---

## Reading order for Code tab

1. This handoff (start to finish)
2. The owner's earlier feedback memories — search `memory/feedback_*.md` for any preferences relevant to specific items
3. ADRs in play per section: ADR-0001 (modules), ADR-0002 (forking), ADR-0003 (asset storage — Section C1 + F1 + B2), ADR-0005 (OSF — Section A2 + B1), ADR-0007 (lock-in — every vendor choice), ADR-0012 (block format — Section B1 + C1 + F1), ADR-0013 (participant runtime — Section A4 + F4 + I)
4. STATUS.md current state
5. Pick a PR stream + write the relevant wireframe gate first

When green: ping owner. Owner runs `npm run deploy:verify` after the V1.12 deploy; signs the audit log; tags `v1.12.0`.
