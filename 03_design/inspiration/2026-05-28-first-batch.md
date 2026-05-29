# Inspiration batch — 2026-05-28, first batch

> Six screenshots provided by project owner via Mobbin curation. Source images were attached to chat; they are not preserved as files in the workspace (chat attachments don't land on the filesystem here). Descriptions below preserve the salient details for downstream synthesis.

## 1. Maze — "Welcome Screen" study builder

**Source:** Maze, curated via Mobbin.

**What it shows:** A study-builder canvas mid-edit. Three columns plus a top bar.

- **Top bar:** project title left ("New maze 2"), wizard progress center ("Build > Share > Results > Report" with current step highlighted), preview / Start testing / team / settings on the right.
- **Far-left rail:** narrow icon-only nav (home, search, blocks/grid, two more icons, settings) — primary navigation.
- **Mid-left column:** "Study requirements" card on top, then a list of editable blocks ("Welcome / Welcome Screen" selected with thin colored border + light fill, "1 question / Screener" below, "+ Add block" button, then a categorized library — MISSION (Prototype Test, Website Test, App Test, Variant Comparison), QUESTION BLOCK (Open Question), and Thank You at the bottom).
- **Center column:** properties / settings for the selected block. Headline "Welcome Screen" with a small info icon, "Custom message" toggle row. Sparse, focused.
- **Right column:** **live preview** of what the participant sees on a mobile-sized frame — "Welcome / You've been invited to take part…" with a "Get started" button. Tabs at top: Preview | Comments.

**What we like specifically:**

- The three-column rhythm: nav rail → content tree + properties → live preview.
- The preview pane *renders the actual participant experience*. This is the "see what you're making" affordance the personas value.
- Wizard breadcrumbs at the very top — you always know where you are in the larger flow.
- Selected-block visual treatment is subtle but clear (thin colored border + slight fill).
- The block library has section headers (MISSION, QUESTION BLOCK) — categorical not flat.

**What we'd avoid:**

- The far-left rail is *icon-only* — for new users this is high friction. Our equivalent should have labels at desktop, collapse to icons on narrow viewports.
- The "diamond" / premium markers next to features feel transactional in a tool that's supposed to enable research. We can do gating less ostentatiously.

**Pattern to lift:** three-zone layout (rail + content + preview), wizard breadcrumbs at top, categorized block library in the content column.

---

## 2. Notion — workspace + database + formula editor popover

**Source:** Notion, curated via Mobbin.

**What it shows:** A Notion workspace with a database table and a formula editor popover.

- **Left sidebar:** workspace switcher at top ("Alex Smith's Notion" + new-page icon), then Search / Home / Inbox, then "Private" section with a list of pages (SLMobbin Creative Strat… highlighted, Welcome to Notion!, Weekly To-do List, Habit Tracker, Settings, Templates, Trash). At the bottom: Invite members and small utility icons.
- **Main:** at the top a content block with text + image. Below it a "Creative pipeline" database table with columns (Medium, Status, Launch date, Owner, Formula). One row populated (Digital / In progress / July 10 2025 / Alex Smith / checked). Above the right edge of the row, a **floating formula-editor popover** opens: title "Notion Formula" with a Reset/Save action set, a code-style input area showing `Status == "Published, Scheduled"`, a "Valid Syntax · Result for Page 1 = ☑" affirmation row, then two columns ("Built-ins" list left with sortable symbols `+ > >= < <=` and `Functions` below; right column with usage docs for the focused item including code examples `3 + 2 = 5`, `add(-1, 2) = 1`).

**What we like specifically:**

- The **two-column popover pattern** (list of options + detail/docs) for a complex configuration surface. Maps directly to anything where the user picks from a menu and wants context — formula building, module configuration, registry selection.
- "Valid syntax · Result for Page 1 = ☑" — **inline live validation feedback**, immediately tells you whether what you typed will work.
- The neutrality of the Notion canvas — very low chrome, content forward. Even the formula popover sits on the page lightly.
- The whole sidebar is two clear sections: workspace-level (Search/Home/Inbox/Settings) and **the user's content tree** (Private). That separation translates to "platform navigation" vs. "your work."

**What we'd avoid:**

- Notion's table is *very* dense. For our domain (experiments, frameworks) we want richer per-row affordances than a flat database row.
- The icon system (emoji + small icons) reads as casual. We want serious-but-fresh; subtle color and form over emoji-led play.

**Pattern to lift:** left sidebar with workspace nav + content-tree split; popover with menu-list + docs/example pattern for complex config; inline live validation; low-chrome canvas.

---

## 3. TheyDo — Insights list with right-drawer detail

**Source:** TheyDo (service-design tool), curated via Mobbin.

**What it shows:** Three-column layout for managing research insights.

- **Left sidebar:** logo + team name at top, then Dashboard / Search / Updates / Goals; then sections "Journey frameworks" with `[AI] Sample Journey` and `Lifecycle Framework`; then "Building blocks" (Journeys, Personas, Metrics, **Insights** highlighted with sub-items Status / Group / Type, Opportunities, Solutions). At the bottom: "Full access activated, 12 days remaining" card, then Invite collaborators / Help & support / Settings / Logout.
- **Center column:** Insights table with columns Title / Source / Type / Status / Score. Each row has a small icon, title, source pill, type tag (Observation = orange, Need = blue, Gain = green, Pain = pink), validation status, and numeric score. Multiple rows visible. Pagination at bottom (20 per page, 1-14 of 14).
- **Right drawer:** detail view of the selected insight "Convenience is Key". Shows Type (Observation pill), Owner (Sam Lee), Experience impact (slider with -2/2 scale + numeric 2), Status (Validated, green check), Personas (avatar stack), Emoji, Origin (Imported from CSV), `+ Add property` affordance, creation/update metadata. Tabs at bottom: Details / **Evidence (0)** / Insights (0) / Journeys (0) / Opportunities (0). Empty state for Evidence with "Link evidence" CTA.

**What we like specifically:**

- The **right drawer with tabs** for an item's metadata + related artifacts. Maps almost 1:1 to how we'd want to show an experiment, a framework, a module, or a persona — properties up top, then tabs into related things.
- Color-coded type pills (Observation / Need / Gain / Pain) — distinct but **muted**, used as functional categorization not decoration.
- The sub-navigation under "Insights" (Status / Group / Type) — sectioning a single concept by view. Useful for experiments-by-status, frameworks-by-domain, etc.
- The "Experience impact" sliders with a clear numeric label and color spectrum — a thoughtful UI for a fuzzy quantity. We have analogous quantities (effect size, sample size justification, replication confidence) where this pattern applies.
- Empty states for the tabs ("Evidence helps provide context… Currently, no evidence is linked.") — copy that explains the empty state instead of just showing nothing.

**What we'd avoid:**

- The drawer is fairly busy; we should be more disciplined about what shows by default vs. what needs an "Add property" interaction.
- Some category pills use saturated colors next to muted ones — the palette is not fully unified. We'll commit to a consistent saturation level.

**Pattern to lift:** right drawer as the contextual detail panel with tabs into related artifacts; muted but distinct color tags for categorical types; sub-navigation under a single concept; "explain the empty state" copy.

---

## 4. Typeform — Builder mode (form authoring)

**Source:** Typeform, curated via Mobbin.

**What it shows:** Form-authoring view; question 5 ("Which tour locations interest you the most?") selected.

- **Top bar:** "My workspace > My new form" (left), tabs Create / Logic / Connect / Share / Results (center), Publish + help + avatar (right).
- **Left sidebar:** numbered list of questions (1 Which walking-tour did you join?, 2 How much would you rate…, 3 Where can we send…, 4 Which tour locations…, 5 Which tour locations… selected); below "Endings" section.
- **Main canvas:** large centered question card showing question text + description placeholder + three image-choice cards (Blok M / Glodok / Kota Tua) with a "+" tile to add. The numbered "5 →" sits beside the question title.
- **Right sidebar:** Content / Design tab toggle; Question section with Text/Video tab, dropdown showing "Picture Choice"; Settings section with toggles (Required, Show labels, Supersize, Multiple selection, Randomize, "Other" option, Choices alt text); Image or video field.

**What we like specifically:**

- **Numbered question list as the navigation tree** — even at a glance you see flow length and current position. The numbering itself is a system: each question has a stable identity (#5) that survives reordering.
- The right-sidebar Content/Design tab split — separating what the question *is* from how it *looks*. Direct map to our module instance (data) vs. theme overlay (presentation) split.
- Picture-choice with image thumbnails + "A/B/C" letter pills on each — small but valuable accessibility touch. Letters are the keyboard shortcut as much as a label.
- The whole canvas centers the question so the eye doesn't wander; the sidebars frame without dominating.

**What we'd avoid:**

- The "5 →" badge is visually busy where the question title appears once. Number is enough; we'd skip the arrow.
- "Supersize" / "Other option" toggles read as ad-hoc. Our equivalent should be modular controls grouped by purpose.

**Pattern to lift:** numbered-list as nav for sequenced content; right-sidebar Content/Design split; centered canvas for the focused item.

---

## 5. Typeform — Logic mode (node-graph)

**Source:** Typeform, curated via Mobbin.

**What it shows:** Same form as #4 but in Logic view — the **whiteboard / node-graph mode** the project owner mentioned.

- **Top bar:** same as #4 but "Logic" tab is now active.
- **Left sidebar:** three feature cards (Branching, segmentation and calculations / Quiz and scoring / Personalize with data), each with a brief description. Below: zoom out / zoom in / fit / pointer controls in a footer.
- **Main canvas:** node graph showing question 2 ("How much would you rate…") with two branches via small connector chips. The upper branch goes 2 → 3 (Where can we send group…) → 4 (Which tour locations interest…) → A (Thank you for your feedback!). The lower branch goes 2 → 5 (We apologize for the…) → A (Thank you). Each node has a "+" handle for adding outgoing connections and a small branch icon for adding a rule. Boxes are clean, connectors are smooth curved lines.

**What we like specifically:**

- **The same form viewed two ways** — Builder (#4) is sequential and form-y; Logic (#5) is spatial. The underlying data is the same (modules + connections); the view is different. This is **exactly** the "builder mode or whiteboard mode" the project owner asked for, and it confirms ADR-0001's modular composition gives us this for free.
- Node design: clean rectangles with the question number + truncated title. Connectors curved (not orthogonal) — feels organic rather than diagrammatic.
- The "+" on the right of each node makes adding a downstream node a one-click action — low friction for what's normally a multi-step authoring task.
- The left rail in Logic mode shows *feature affordances* rather than navigation — the sidebar contents are context-aware to the mode. Good design discipline.

**What we'd avoid:**

- Zoom controls in the bottom-left corner are easy to miss. We'd put them more obviously and add keyboard shortcuts (`+/- /0` for zoom and fit).
- No mini-map for a graph this small but for larger experiment graphs (many conditions × blocks) we'll want one.

**Pattern to lift:** **dual-mode rendering** of the same underlying data — builder and whiteboard; left rail content is mode-dependent; "+" affordances on nodes for one-click flow extension.

---

## 6. Typeform — Logic modal for branching rules

**Source:** Typeform, curated via Mobbin.

**What it shows:** A **full-screen modal** for configuring conditional branching rules. Form context dimmed behind it.

- **Modal title:** "Branching, segmentation and calculations" — same wording as the feature card in #5.
- **Body:** an If/Then rule builder. "How much would you rate your experience?" header row. `If` dropdown + the field selector + condition dropdown (`is lower t…`) + numeric input (`4`). `+ Add condition` link beneath. Separator. `Then` row with `Go to` dropdown + target selector (`5 We apologize for the unpleasant experience :(`).
- Trash-icon "Delete rule" in red below.
- Next row: "All other cases go to" with a default-route dropdown. `+ Add rule` link.
- Below: second rule group for question 3 (Where can we send group pictures from your tour?) with "Always go to" Select + Add rule.
- Footer: "Delete all rules" in red on the left; Cancel and Save (dark) on the right.

**What we like specifically:**

- **Form-builder-style rule construction** — `If` + condition + value, `Then` + action + target. Plain English structure. Maps directly to our future Theme overlay editor and Module configuration screens.
- "All other cases go to" + a default route — explicit handling of the unhandled case. Anti-pattern aversion baked into UX.
- Save / Cancel are footer-aligned with destructive-action separation (left). Standard but well-executed.
- Modal contents are scrollable; multiple rules stack vertically with clear separators.

**What we'd avoid:**

- The modal isn't dismissable by clicking outside (typically), which is the right choice for forms with state; we'll do the same.
- The dropdowns have light gray borders — for our serious-but-fresh feel we'd lean on whitespace + alignment rather than border weight.

**Pattern to lift:** modal for complex configuration; If/Then rule construction pattern; explicit default-route handling; destructive actions on the left in modal footers.

---

## Patterns common to multiple references

| Pattern | Maze | Notion | TheyDo | Typeform Build | Typeform Logic | Typeform Modal |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Left sidebar with sectioned nav | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Right drawer / right sidebar context | ✓ | — | ✓ | ✓ | — | — |
| Top-bar breadcrumb / wizard | ✓ | — | — | ✓ | ✓ | — |
| Live-preview pane | ✓ | — | — | (✓ canvas) | — | — |
| Builder + whiteboard duality | — | — | — | ✓ | ✓ | — |
| Modal for complex config | — | — | — | — | — | ✓ |
| Color-coded category pills | — | — | ✓ | — | — | — |
| Numbered sequential list as nav | — | — | — | ✓ | — | — |

The **three-zone layout (rail / content / context-drawer)** is in 4 of 6 references; the **builder-vs-whiteboard duality** is the Typeform-only pattern but maps directly to our ADR-0001 commitment. **Modal for complex config** is the standard escape valve when a sidebar isn't enough. The right drawer in TheyDo plus the live-preview pane in Maze together describe our "right side" — sometimes properties, sometimes preview, sometimes both.

## What the project owner asked for, mapped to references

| Principle | Where we saw it |
| --- | --- |
| Clear design, color subtle, serious but fresh | Notion (neutrality), TheyDo (muted but distinct color tags) |
| Clear hierarchy and zones | All six (varied) |
| Customizable workspace | Notion's sidebar nesting; TheyDo's drawer property "Add property" hints at extensibility |
| Clear top-down navigation with breadcrumbs | Maze + Typeform (project > stages) |
| Sidebars follow what's being worked on | TheyDo (right drawer is contextual), Maze (preview tracks selected block) |
| Right drawers slide in and out | TheyDo |
| Preview the artifact you're working on | Maze's live preview pane |
| Builder mode OR whiteboard mode | Typeform Build (#4) + Logic (#5) — same data, two views |
| Responsive / adaptive | All — though the screenshots are desktop only; need to design the mobile/tablet behavior |

## Open questions surfaced

These aren't decisions yet — they're things the brief will need to address:

- **What's the accent color?** "Subtle and serious but fresh" rules out aggressive saturation. Candidates: deep blue (academic), dark teal (clinical-but-modern), warm grey + one tiny pop. Brief proposes; project owner picks.
- **Sans-serif typeface specifically?** Inter is the safe modern default; Söhne or Manrope are alternatives with more character.
- **Does the whiteboard mode allow ALL editing, or only flow-level changes?** In Typeform Logic, you can add branches but you go to Builder to edit a question's contents. We could allow either; choice affects the architecture of the canvas surface.
- **Customization scope.** Notion-level (rearrange every panel) is very flexible but expensive to build. The minimum useful customization for our personas is probably: collapse/expand zones, save zone preferences, pick which right-drawer tabs are visible.
- **Responsive breakpoints.** Most screenshots are desktop. Tablet collapses one zone; mobile likely becomes a linear flow with bottom nav. To be specified.
