# Information architecture — v0.3

> **Status:** v0.3 (2026-05-28). All open questions from v0.2 either resolved or moved to recommendations; five new conceptual picks locked (forks-as-relationship, Templates-as-sub-of-Library, follow targets + Activity stream split, Participants five-view structure, template share scopes). Builds on design-language brief and the architecture (ADRs 0001-0009). This document specifies *what's at each level* of the product surface; wireframes specify *how each level looks*.

## Changelog

- **v0.3 (2026-05-28):** Five conceptual picks added after project-owner conversation. (a) **Forks live as a relationship, not a destination** — surface in three places: forker's Studies (with upstream subtitle), parent study's right-panel `Replications` tab, Activity stream. No top-level "Forks" destination. (b) **Templates revoked as a Frameworks alias** — Frameworks and Templates are different concepts; Templates moves to a sub-section of Library. (c) **Activity gets a Yours / Follows split** — Follows is fed by the user's follow targets (tags, authors, Frameworks) so researchers can stay current with their area. (d) **Participants destination structured as five sub-views** — Panels, Open recruitment, Compensation, Quality, Connections. Aggregated only; never PII. (e) **Template share scopes** — every saved version with `kind: template` has four share scopes (Public-replicable / Workspace / Invite link / Submit to Framework); `Make Replicate-able` toggle lives on the object itself.
- **v0.2 (2026-05-28):** Workspace switcher → Linear-style top-bar dropdown. Search → global with a scope dropdown (workspace / studies / library / etc.). Comments → both right-panel tab AND bottom drawer (try both, learn which sticks). No notification bell — Activity destination handles it. Stage names → added Preregister as its own stage between Share and Run. Framework naming → still open (candidate: "Templates").
- **v0.1 (2026-05-28):** First pass with 8 open questions.

## Purpose and scope

This IA covers the **researcher-facing surfaces** — the people building, running, and managing studies. The **participant-facing experience** (the survey-taking surface) has its own IA, drafted separately when we get there.

Scope for v0.1:

- Left rail destinations (top-level platform navigation).
- Surface hierarchy and breadcrumb patterns.
- Right context panel tab system per object type.
- Where the Builder ↔ Whiteboard mode toggle lives.
- Responsive considerations at the IA level (specifics belong to design-system).

Out of scope for v0.1 (deferred):

- Exact screen layouts (those come with wireframes).
- The participant-facing IA.
- Empty state and onboarding flow specifics.
- Notification system architecture.

## The object model (recap from ADRs)

The IA reflects what exists in our system. Brief recap from the ADRs:

| Concept | What it is | Notes |
| --- | --- | --- |
| **Workspace** | A lab / organization / tenant | ADR-0007 multi-tenancy. Has members, settings, OSF connection. |
| **Study** | An experiment instance | Per ADR-0001/2. The primary unit. Has versions, forks, assets, modules. |
| **Version** | An immutable snapshot of a study at a moment in time | Per ADR-0002. Kinds: autosave / named / preregistered / published. |
| **Module** | An atomic question type or artifact | Per ADR-0001. `source/key@version`. Platform-level. |
| **Framework** | A curated reusable protocol | Per ADR-0001/2. Curator-applied verified badge per ADR-0009 / curation decision. |
| **Theme** | A composable overlay declaring visible modules + presets | Per ADR-0001. "Misinformation" is the V1 launch theme. |
| **Asset** | A stimulus or material | Per ADR-0003. Internal upload or external link, frozen on preregistration. |
| **Participant** | Someone who's taken a study | Data lives separately; never copied across forks (ADR-0002). |
| **OSF registration** | An OSF page our preregistration pushed to | Per ADR-0005. |
| **AI invocation** | An audit-log entry for an AI Task call | Per ADR-0006. |
| **Member** | A person in the workspace | Per ADR-0007. Has a role; owns their OSF identity. |

The IA exposes these objects at the right levels for the user — not always in the same hierarchy as the data model.

## Top-level navigation (the left rail)

Ordered by frequency-of-use for Hanna (daily) + Maya (weekly). Labels at desktop; icons-only on narrow viewport per the design-language brief.

| # | Destination | Icon | Why it's there | Used by |
| - | --- | --- | --- | --- |
| 1 | **Studies** | `folder` | The thing Hanna touches every working day. Maya reviews approvals here. | Both, daily |
| 2 | **Library** | `stack-2` | Modules, themes, assets, stimuli — the building blocks Hanna assembles. | Hanna, daily |
| 3 | **Frameworks** | `puzzle` | Curated reusable protocols — where Maya finds something to adapt, where Hanna picks a starting point. | Both, weekly |
| 4 | **Participants** | `users` | Cross-study participant management — tracks who's in what, addresses Hanna's parallel-spreadsheet pain. | Hanna, weekly |
| 5 | **Activity** | `history` | Recent versions, fork notifications, OSF push status, collaborator changes — answers "what happened while I was away." | Both, weekly |
| 6 | **Team** | `user-circle` | Members, roles, invitations. Maya manages; Hanna mostly reads. | Maya, monthly |
| 7 | **Settings** | `settings` | Workspace settings, OSF connection, AI routing policy, billing, data export. | Maya, rarely |

**At the top of the top-bar (resolved 2026-05-28):**

- **Workspace switcher — Linear-style dropdown in the top bar.** A clickable workspace name with a small chevron in the top-bar's far left. Opens a popover listing the user's workspaces, search-within, and a "Create workspace" option. Frees the left-rail real estate for actual navigation. Familiar from Linear; researchers who use Linear (more than zero) will not need to learn it.
- **Search — global with a scope dropdown.** ⌘K opens a command-palette-style search modal. Inside the modal, a small dropdown at the top lets the user scope: **Everything** (default) · **This workspace** · **Studies** · **Library** · **Frameworks** · **Members**. Searches respect the scope. Recent results shown when the input is empty. Same shortcut throughout the app.

Below the rail, **at the bottom**:

- **Help / docs**
- **What's new** (release notes when relevant)
- **User menu** — profile, OSF account, sign out

### Sub-navigation under Studies (and other destinations)

When a top-level destination has internal categorization, a sub-nav appears. The TheyDo pattern from the inspiration batch.

**Studies sub-nav** (when on the Studies destination):

- All studies (default)
- Mine (Hanna's; Maya's view defaults here)
- Drafts (`kind: autosave` working versions; no preregistration yet)
- Preregistered (has at least one `kind: preregistered` version)
- Published (has a `kind: published` version)
- **Replicating** (v0.3 — studies the user has replicated/adapted from someone else; shows upstream parent + author as subtitle on each card)
- Archived

A replicated study appears in the Studies list as the user's own object, with a small subtitle: `Replicating Maya Okonkwo · source-cues-v3@2.1`. Click-through on the subtitle navigates to the parent study (cross-workspace if public). No special list for "studies others replicated from me" lives here — that surfaces on the parent study's `Replications` right-panel tab, not as a Studies sub-nav.

**Library sub-nav** (v0.3 — Templates now its own sub-section):

- Modules
- Themes
- Materials (assets — stimuli, instructions, scoring keys)
- **Templates** — paste-ready starter studies (user's own saved templates + public templates discoverable here). See "Templates and how researchers share them" below.
- Imports (uploaded papers ingestion artifacts — V2)

**Frameworks sub-nav**:

- All
- Verified (curator-badged)
- By theme
- My drafts (researchers can author frameworks too, even before curator review)

**Participants sub-nav** (v0.3 — five-view structure):

- **Panels** — saved cohorts (Prolific subsamples, lab panels, university SONA pools). Anonymized IDs only; aggregated tag history per panel (completion counts, attention-check pass rate).
- **Open recruitment** — currently-running sessions, status pulled from connected providers via RegistryAdapter (Prolific, CloudResearch, SONA, MTurk). Counts of submitted / approved / returned / rejected.
- **Compensation** — pending payouts, completion bonuses, invoices. Important because researchers stress about this in interviews; tooling can flatten it.
- **Quality** — attention-check failures, suspicious timing, withdrawn participants, flagged sessions awaiting researcher decision (approve / reject / bonus).
- **Connections** — provider OAuth status, per-provider settings, rate limits.

This destination is researcher-facing; it never surfaces PII. The participant-facing app is a separate surface entirely (see "Purpose and scope" — participant-facing IA is out of scope here).

**Activity sub-nav** (v0.3 — Yours / Follows split):

- **Yours** (default) — events on the user's own studies: collaborator comments, mentions, fork notifications ("Sofia Marsh replicated your study"), OSF push status, AI invocation completions.
- **Follows** — events from the network: new preregistrations / publications / amendments from followed tags, followed authors, followed Frameworks. The retention surface.
- All (combined, chronological)
- Mentions / @
- Registration status (OSF push status across user's studies — filters from Yours)

See "Following and staying current" below for follow-target details.

## Surface hierarchy and breadcrumbs

The breadcrumb tells you where you are in three glances. Format: `Workspace · Destination · Object [· Sub-object]`. Reads left-to-right; click any segment to navigate up.

**Top-level surfaces:**

```
Misinformation Lab · Studies
Misinformation Lab · Frameworks
Misinformation Lab · Library · Modules
Misinformation Lab · Library · Themes
Misinformation Lab · Library · Materials
```

**Object surfaces** (single study, framework, module, theme, asset):

```
Misinformation Lab · Studies · Source cues study
Misinformation Lab · Studies · Source cues study · Block 2 (manipulation)
Misinformation Lab · Frameworks · Two-sided misinformation exposure
Misinformation Lab · Library · Modules · core/social-post@1.0.0
Misinformation Lab · Library · Themes · Misinformation theme
```

**Stage tabs** (Maze-inspired wizard pattern) appear on study surfaces in the top bar's center, not in the breadcrumb. They are *modes within a study*, not deeper paths.

**Resolved 2026-05-28: six stages, with `Preregister` as its own.**

```
Build  ·  Preview  ·  Share  ·  Preregister  ·  Run  ·  Results
```

| Stage | What happens here |
| --- | --- |
| **Build** | Authoring — modules, blocks, randomization, theme overlay. Builder + Whiteboard modes both live here. |
| **Preview** | Walk through the study as a participant would. Multi-device emulation. No data collected. |
| **Share** | Peer review. Invite collaborators to comment / suggest. Lineage and history visible. Preregistration is NOT here — this stage is for getting feedback before commitment. |
| **Preregister** | The commitment moment. Freeze the version (ADR-0003) + push to OSF (ADR-0005) + lock the snapshot (ADR-0002 `kind: preregistered`). Amendments (ADR-0004) re-enter this stage. |
| **Run** | Live data collection. Real participants. Real responses. The runtime mode. |
| **Results** | Post-collection analytics — descriptive stats, manipulation checks, data export. AI assist surfaces here in V2 per ADR-0006. |

Separating `Share` from `Preregister` accurately reflects the workflow: peer review *before* the commitment is normal practice; conflating them was a mistake in v0.1. This split also makes amendments (per ADR-0004) more clearly land back on the `Preregister` stage, not `Share`.

Within a study, the URL captures `study_id + stage`; the breadcrumb shows the study path; the stage tabs show position within. Two orthogonal navigations.

### Important: studies are flat, not project-nested

We do **not** introduce a "Project > Study" hierarchy for V1. Researchers can group studies via labels/tags (e.g., grant ID, paper, topic) and the Studies list filters by them. Adding a "Project" container would force researchers to make a decision they often haven't made yet ("does this study belong to project X or project Y?") and complicates forking semantics (does a fork inherit project membership?). Tags are sufficient and don't impose structure.

If a real customer-need for nested projects emerges later, it's a follow-up ADR.

## Right context panel — tabs per object type

The right context panel (per the design-language brief) is contextual. Its tab list depends on what's selected. The default tab varies by object; user can pin a different default.

### When a Study is in focus

| Tab | Content | Default for |
| --- | --- | --- |
| **Details** | Study metadata: status, owner, members, tags, current version. | All users |
| **Preview** | Live render of the current version as a participant would see it. | Hanna in Build mode |
| **History** | Version chain (autosaves, named, preregistered, published). Click to inspect / restore. | — |
| **Replications** | Family tree: parent study + parent version (upstream, if this study replicates one) AND list of studies that replicate / adapt this one (downstream). v0.3 renamed from "Lineage" — researcher-facing per vocabulary rule. The downstream list is the home of "forks live as a relationship": this is where Maya sees "Sofia replicated your source-cues study with these divergences." | When the study has any replication relationship in either direction |
| **Comments** | Inline review thread. Mentions notify. Per v0.2: also surfaces as a bottom drawer (Google-Docs-style) so threaded review feels natural; user can switch between drawer and right-panel tab. | When collaborators are active |
| **Validation** | Schema validation status, freeze pass status (ADR-0003), missing required fields, replication risks. | Pre-preregistration |
| **OSF** | OSF registration status, links, push history (ADR-0005). | After preregistration |

### When a Module Instance (a question inside a study) is in focus

| Tab | Content |
| --- | --- |
| **Configure** | Module-specific configuration (the typed inputs against the module's schema). |
| **Validation** | Real-time schema check; "looks valid" / "missing X" / "warning: Y." |
| **Preview** | Live render of this specific module instance. |
| **History** | This module instance's edit history within the current draft. |

### When a Framework is in focus

| Tab | Content |
| --- | --- |
| **Details** | Framework metadata, author, verified badge, theme, citation. |
| **Preview** | Render of the protocol structure (block-by-block). |
| **Studies** | Studies that have been derived from this framework. |
| **Versions** | Framework version chain (frameworks share the version model). |
| **References** | Academic citations supporting this framework. |

### When an Asset (stimulus / material) is in focus

| Tab | Content |
| --- | --- |
| **Details** | Filename, type, source (internal / external), size, owner, ownership confirmation. |
| **Preview** | Inline preview (image, video, audio, document). |
| **Usage** | Studies and frameworks that reference this asset. |
| **Freeze status** | If frozen for a preregistration: which version, when. If external link: replication-risk badge. |

### When a Module (catalogue-level) is in focus

| Tab | Content |
| --- | --- |
| **Details** | `source/key@version`, description, category tags. |
| **Schema** | Formal schema (Zod / JSON Schema rendered readably). |
| **Versions** | All versions of this module type; deprecation status; migration paths. |
| **Used in** | Studies / frameworks currently using this module. |

## Where the Builder ↔ Whiteboard mode toggle lives

On a study's `Build` stage tab, a small two-state toggle in the top-right of the center work surface:

```
[ ⊞ Builder · ◇ Whiteboard ]
```

Per the design-language brief, both modes render the same underlying data. Switching is instant. State (selected node, scroll position, current zoom) is preserved per mode. The left rail's contents adjust to the mode (per Typeform's Logic pattern from the inspiration batch — feature affordances change with mode).

A keyboard shortcut (`⌘\` or similar) toggles modes. Power users won't reach for the mouse.

### What is editable in each mode

V0.1 commitment:

- **Builder mode** edits everything: module instances (content), block structure, randomization rules, theme overlay, asset references.
- **Whiteboard mode** edits flow structure (add / remove / reorder blocks; add / remove / rewire connections; insert branches; configure conditional logic). Drops to Builder via double-click on a node to edit its contents.

This matches Typeform's actual behavior (the inspiration batch's #5 confirms this is the recognized convention). Power users who want to edit module contents in whiteboard mode can — but the affordance is "double-click drops into builder," not "edit-in-place on the canvas." Keeps the canvas free of inline form chrome.

## Responsive considerations at the IA level

The IA contract holds across breakpoints; the rendering changes. Per the design-language brief's responsive section:

- **Desktop (≥1280px):** full three-zone. All sub-navigations visible.
- **Tablet (768–1279px):** left rail collapses to icons (labels on hover); right panel becomes an on-demand overlay drawer; sub-navigations still surface but more compactly.
- **Mobile (<768px):** left rail becomes a bottom tab bar with the top three destinations (Studies / Library / Activity); the rest move into an overflow menu. Right panel is replaced by dedicated screens accessible by tap. Whiteboard mode is read-only on mobile (pan + zoom only); Builder mode works.

The fact that the IA model is the same across breakpoints — the URL still says `studies/:id/build`, the breadcrumb still tells you where you are — keeps muscle memory consistent for users who switch devices.

## Forks as a relationship, not a destination

Forking (researcher-facing: **Replicate** / **Adapt** per vocabulary rule) is a relationship between two studies, not a category of object. So it surfaces in three places, never as its own left-rail destination:

1. **In the forker's Studies list.** A replicated study is the user's own object — appears in `Mine`, in `All studies`, in the new `Replicating` sub-nav, with a subtitle `Replicating {parent-author} · {parent-study-slug}@{parent-version}`. Click-through on subtitle navigates to the parent.
2. **On the parent study's right-panel `Replications` tab.** Lists every downstream replication: who, when, with what divergences (modules added/removed, theme changes, key parameter shifts). This is where Maya sees her work being built on. The tab is two-directional — if the study is itself a replication, the same tab shows the upstream parent at the top and downstream children below.
3. **In the Activity stream.** Yours: "Sofia Marsh replicated your source-cues study" with a permalink to the new study + a diff summary. Follows: "Marek Stein adapted a study you starred." Notification cadence is configurable per follow target.

What we explicitly do *not* build: a `Forks` destination in the left rail. It would compete with Studies for attention and imply forks are a class of object distinct from studies, which the data model says they aren't.

## Templates and how researchers share them

Templates and Frameworks are distinct. The v0.2 idea of aliasing them was a mistake and v0.3 retires it.

| Concept | What it is | Lives in |
| --- | --- | --- |
| **Module** | Atomic question type or artifact (a Likert block, a CRT item, a demographics block). | Library · Modules |
| **Template** | A paste-ready starter *study* — a saved version with `kind: template`. One author, one shape. | Library · Templates |
| **Framework** | A curated *system* — schema + recommended modules + measurement opinions + reporting conventions for a research tradition (e.g., "Misinformation Research Framework"). Bundles templates, modules, and guidance. | Frameworks (top-level) |

A template is just an experiment version the user marked `kind: template`. Sharing it has four scopes:

| Scope | What it does | Default | Where it appears |
| --- | --- | --- | --- |
| **Public, replicable** | Anyone on the platform can find and Replicate. | ✅ default (per ADR-0002 public-forkable-default) | Library · Templates · Public; appears in scoped Library search. |
| **Workspace only** | Visible + replicable to workspace members only. | — | Library · Templates · Workspace. |
| **Invite link** | Unlisted but anyone with the URL can replicate. | — | Anywhere the URL is shared. |
| **Submit to Framework** | Offer the template to an existing curated Framework as a starter; curator review per ADR-0009 Layer 1. | — | Framework's Templates tab after curator accepts. |

UI shape: every saved version has a `Share` action in its right rail. The Share panel has a scope picker on top, a `Make this Replicate-able` toggle, and an optional `Submit to framework…` action. No multi-step publish wizard — sharing is a property of the object, set in one place.

Public templates land in `Library · Templates · Public`. The user's own templates land in `Library · Templates · My Templates`. Both surfaces support the same search and filter chrome.

## Following and staying current

The retention question — "how do researchers stay up to date in their area" — gets a dedicated set of follow targets and an Activity sub-stream.

Follow targets (resolved v0.3):

| Target | What it does | Where to subscribe |
| --- | --- | --- |
| **Tag** | Follow a research-area tag ("misinformation", "preregistration", "replication"). Any public study preregistered, published, or amended with that tag enters the user's Follows feed. | Any tag chip throughout the product (search, study cards, Framework pages) shows a `+ Follow` affordance on hover. |
| **Author** | Follow a researcher. Their public preregistrations, publications, and amendments enter the feed. | On any member profile / author byline. |
| **Framework** | Follow a Framework. New studies using it, plus Framework version updates, enter the feed. | On the Framework's `Details` right-panel tab. |
| **Study** | Follow a specific study. Amendments, version transitions, replications surface. | On the study's `Details` right-panel tab. |
| **Saved search** | Follow a Library or Studies search query. New results matching it surface. | In the search modal, a `Follow this search` action. |

The destination is **Activity · Follows**. Default cadence is real-time in-product with a daily badge increment. An optional weekly email digest is opt-in once Activity has demonstrated the signal isn't sufficient on its own (we don't ship email digests in V1; the architecture is ready).

Following is the primary mechanism for the "default virtue" Layer 1 commitment in ADR-0009 — the path of least resistance for "tell me what's new in my area" produces a well-documented artifact stream rather than scattered Twitter / RSS / preprint-server hunting.

## Participants destination — what researchers see

Anchored on Hanna (postdoc operator) — recruitment, payment, quality. Never raw participant PII at any sub-view; aggregates only. The five sub-views formalized in v0.3:

### Panels

Saved cohorts the user has run before. Each panel shows: anonymized participant count, source provider (Prolific subsample / lab panel / SONA), tag history of studies they've completed, aggregate attention-check pass rate, last-used date. Click into a panel: list of anonymized IDs + per-ID aggregate stats (sessions completed, average completion time, quality score). Never names, emails, or demographic raw rows.

### Open recruitment

Currently-running recruitment sessions across all of the user's running studies. Per session: study name, provider, target N, current N (submitted / approved / returned / rejected), launch time, estimated completion. Status pulled from connected providers via the RegistryAdapter shape from ADR-0005 (Prolific dominant per the literature finding; CloudResearch, SONA, MTurk plug in via the same interface). The right-panel action row supports bulk-approve, bulk-reject, increase target N, pause, close session.

### Compensation

Pending payouts to platforms, completion bonuses owed, invoice status. Researchers consistently surface compensation as a stress point — flattening it is product value. Per row: study, provider, amount, status (pending platform invoice / processing / paid). Filterable by study, by provider, by date. CSV export for grant-accounting use.

### Quality

Flagged sessions awaiting decision: attention-check failures, suspicious timing (too fast or too slow), withdrawn-mid-study, duplicate-IP heuristics. Per row: anonymized participant ID, study, flag reason, evidence summary, recommended action. Researcher approves / rejects / bonuses inline. Decisions log to the immutable audit record (per the QA test-strategy commitment).

### Connections

Provider OAuth status per workspace: Prolific connected / disconnected, CloudResearch connected / disconnected, etc. Per-provider settings: default approval rules, default bonus rules, rate limits, screening criteria templates. New connection flow per provider; connection health surfaced with last-sync timestamp.

### What Participants is NOT

A CRM. No "participant profile" surface. No PII anywhere in the destination. No demographic raw rows — only aggregated histograms. Crossing the PII line is a data-model + privacy decision, not a UI affordance we omit; the architecture enforces it.

## Open questions

### Resolved (2026-05-28)

1. **Workspace switcher placement** — ✅ Linear-style dropdown in the top bar.
2. **Search scope** — ✅ Global with a scope dropdown inside the search modal (Everything / This workspace / Studies / Library / Frameworks / Members).
3. **Comment surfacing** — ✅ Both right-panel tab AND bottom drawer. Try both; learn from real use which one users gravitate to. The data model is the same; only the surface differs.
4. **Notifications surface** — ✅ No bell. Activity destination handles unread state. A small unread-count badge appears next to "Activity" in the rail when there's something new.
5. **Framework naming (v0.3)** — ✅ Frameworks and Templates are different concepts, full stop. Frameworks = curated systems (schema + modules + measurement + reporting conventions for a research tradition). Templates = paste-ready starter studies. Templates moves to `Library · Templates` as its own sub-section. The earlier aliasing recommendation is retired.
6. **Forks placement (v0.3)** — ✅ Forks are a relationship, not a destination. Surface in three places: forker's Studies (with upstream subtitle + new `Replicating` sub-nav), parent's right-panel `Replications` tab (two-directional family tree), Activity (event stream).
7. **Stage names** — ✅ `Build · Preview · Share · Preregister · Run · Results`. Six stages with Preregister as its own. Preview stays as both a panel during Build *and* a stage for full participant-simulation walkthroughs.
8. **Participants destination structure (v0.3)** — ✅ Five sub-views: Panels, Open recruitment, Compensation, Quality, Connections. Aggregated only; PII never surfaces.
9. **Following / staying current (v0.3)** — ✅ Five follow targets (tag, author, Framework, study, saved search) feed `Activity · Follows`. `+ Follow` affordance attached to every tag chip, author byline, Framework details tab, study details tab, and search modal.
10. **Template share scopes (v0.3)** — ✅ Four scopes (Public-replicable default / Workspace / Invite link / Submit to Framework). Single `Share` panel per saved version; no multi-step publish wizard.

### Still open

11. **Participants destination — cross-workspace vs per-workspace registry** — current v0.3 commitment is per-workspace (Panels and Connections are workspace-scoped). Multi-site coordinators (Marek) may need cross-workspace panel aggregation eventually. Defer to wireframe pass and to a follow-up ADR if the cross-workspace case becomes real.
12. **AI features in the IA** — V1 ships no AI features per ADR-0006, but the architecture surfaces (AI invocation log, AI routing policy) need a home. Recommendation: under Settings · AI. Wireframe pass will confirm.
13. **Follow-target storage and notification cadence** — defaulted to in-product real-time + daily badge. Email digest opt-in deferred to post-V1. Per-target cadence controls (immediate / daily / weekly / off) need a settings home, probably under Settings · Notifications. Confirm in wireframes.

## What comes next

1. **Project owner reviews this IA**, flags anything that doesn't match the vision, picks among the open questions.
2. **First wireframe pass** — start with Hanna's "build a study" core flow on the Studies destination. Builder mode first; whiteboard mode second pass.
3. **Tokens get concrete** in `03_design/design-system/tokens.md` once the brief picks are locked.
4. **Component-library specs** start once the first wireframes settle.

## Sources

- `03_design/design-language-brief.md` v0.1 — the three-zone layout, builder + whiteboard duality, top-bar wizard, right context panel.
- `03_design/inspiration/2026-05-28-first-batch.md` — the visual evidence behind the layout patterns chosen here.
- `02_product/personas/postdoc-operator.md` (Hanna) — daily-operator priorities.
- `02_product/personas/principal-investigator.md` (Maya) — approver priorities.
- `04_architecture/adrs/0001` through `0009` — the object model this IA exposes.
- `04_architecture/data-model/00-core-entities.md` — the entities the IA navigates.
