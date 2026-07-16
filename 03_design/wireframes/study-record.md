# Wireframe spec — Study Record page

- **Serves user flow:** [Finish a study and publish its record](../../02_product/user-flows/finish-a-study-and-publish-its-record.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna — postdoc operator](../../02_product/personas/postdoc-operator.md) (author/composer); [Sofia — burned replicator](../../02_product/personas/burned-replicator.md) (reader)
- **Status:** ready for handoff

## Purpose

Be the readable, citable, comparable face of a **finished** study — the page a browser lands on (instead of the Builder) and the page an author composes when they mark a study finished. It must read like a paper at a glance and let a reader decide whether to cite, follow, or replicate.

## Layout

A single scrollable column on parchment (`surface.page`), max ~760px reading width, with a sticky right-rail action card on wide viewports (collapses below the header on mobile). Researcher-native vocabulary throughout (Record, Finished, Replicate, Preregistration, Saved version).

- **Header band** — Plex Serif title; author byline (+Follow); workspace/lab; **Finished** status chip + date; tags (each +Follow); identifiers row (OSF DOI, article DOI/journal link if set).
- **Body = ordered sections** (the composed layout). Default order: Abstract → Method → Results → Data → Preregistration → Replications → Materials → Cite. Bound sections render from study data; authored sections render content.
- **Right-rail action card** — primary **Replicate** (only when Finished + public), secondary **Use as template**; **Cite** (copy citation), **Follow study**, **Open on OSF**, **Compare** (side-by-side with another version/record). For the owner: **Edit record** (enters composer) + visibility chip.

## Content inventory

Bound sections (auto-resolved from study data; the owner reorders/shows/hides them. *Some* carry an authored title/body too — the blanket "not edit content" is superseded by ADR-0056; the one section whose content is genuinely frozen is Preregistration, enforced by `isFrozenSection`):
- **Method** — overview summary + protocol blocks (names + refs) + conditions; the comparable skeleton. Source: server (version snapshot).
- **Results** — headline figures/charts from the results data (per-condition Ns, key measures). Source: computed; aggregate only.
- **Data** — "browse / download" affordance; **aggregate/derived only** for public Records (raw participant data never public, ADR-0014); link to OSF data component if synced.
- **Preregistration** — the frozen plan + OSF DOI + "view registration", **plus the amendment history** (ADR-0102 — see below). Source: server; content not owner-editable.
- **Replications** — lineage summary (count + intents) + link to the lineage tree. Source: `getReplications`.
- **Materials** — link to the participant **Preview** (existing `/preview`) + any stimuli.

Authored sections (content entered by the owner):
- **Abstract** — required to publish public; ≤ ~2000 chars.
- **Results narrative** — prose interpretation.
- **Article link** — DOI or journal URL (+ "Published in …").
- **Deviations** — *(ADR-0102)* what departed from the plan during execution or analysis, and why. Markdown. **Palette-only, `defaultOn: false`** — the default layout seeds at first compose only, so existing records never gain one and we don't write into records their owner considers finished (owner, 2026-07-15). Distinct from **Amendments**: an amendment is a *plan-side* change filed before/independently of the data; a deviation is an *execution* departure reported after the fact. Conflating them makes both meaningless.
- **Custom** — free prose/media blocks (markdown + image via the existing `/api/media` gateway).

### Plan↔report link-back (ADR-0102)

- **Claim chip — Preregistered / Exploratory.** Rendered beside the existing `HypothesisChips` on each `hypotheses` section, reusing that component's `surface-subtle` chip treatment (no new visual decision; design language locked at v0.6). **The label is derived, never typed.** A claim shows **Preregistered** only when it is bound to a hypothesis in a frozen preregistered version; unbound shows **Exploratory**. The chip is accompanied by the referent in text — *"Preregistered · H2 of the preregistration filed 2026-05-01 (v3)"* — because the referent is the whole point: it is what makes the word checkable rather than asserted.
- **Amendments block** — inside the Preregistration section (never its own orderable/hideable section: ADR-0004 forbids hiding amendment history, and an authored section would hand the owner a toggle over their own audit trail). Renders the full `preregistered` chain oldest→newest: version label, filed date, *"Amends v{n}"*, the change summary, the classification chip, DOI/registration link, and withdrawn state. Collapsed to the newest + a "Show N earlier versions" disclosure when the chain is long.
- **Classification chip** — reuses the researcher-facing labels from the amend form (Typo / wording · Methodological correction · Clarification · Scope change · Other) and is explicitly attributed: **"classified by the author"**. It is a self-report; the honest treatment is to attribute it, not to launder it as fact or to hide it.

Header/meta: title, author(+Follow), tags(+Follow), Finished date, OSF DOI, status chip, visibility chip (owner only).

## States

- **Default (Finished, public):** full Record; action card shows Replicate + Cite + Follow + OSF.
- **Loading:** skeletoned sections (header first, then bound sections stream).
- **Empty:** a Finished study with only bound sections (no abstract) reads as "preliminary record — abstract pending"; public publish is blocked until an abstract exists.
- **Partial:** results still computing → Results section shows "Results are being prepared."
- **Not finished (if reached by URL):** show the protocol preview + a "Preliminary — this study isn't finished yet. Follow to know when results land." banner; Replicate hidden, Template shown.
- **Workspace-only Record (viewed by a member):** same page, no public-only affordances; a "Visible to your workspace" chip.
- **Preregistered *and* published (ADR-0102 D4):** the Preregistration section renders — with the plan, the DOI, and the amendment chain — even though the study's newest frozen version is the *published* one. This is the case that was previously broken: the section and its DOI disappeared from exactly the finished, citable records. The section's gate is **"has ≥1 preregistered version"**, and the DOI / registration URL / withdrawn state resolve from the **newest preregistered version**, not from the latest frozen row.
- **Never preregistered:** the Preregistration section is auto-hidden (nothing to show) — unchanged.
- **Amended:** chain shows each link with its summary + classification; the newest is the operative plan.
- **Withdrawn:** the newest preregistration's withdrawn note leads the section; **earlier, non-withdrawn links still render** (withdrawal is per-version, and erasing the earlier history would be the hiding ADR-0004 forbids).
- **Claims, no preregistration:** every claim renders **Exploratory** with no chip noise — honest, and no binding control is offered (there is nothing to bind to).
- **Permission denied (private Record, outsider):** 404-style "This record isn't public."
- **Error:** section-level error card with retry; the rest of the page still renders (one failing bound section never blanks the page).

## Interactions

- **Replicate** — only when Finished + public; opens the intent dialog (Direct/Conceptual/Extension), then forks (ADR-0018/0039); notifies the original author.
- **Use as template** — copies the design with fresh ids, no lineage, no notification.
- **Cite** — copies a formatted citation (authors, year, title, DOI).
- **Follow study / author / tag** — existing FollowButton.
- **Compare** — opens side-by-side (reuse the multi-version compare pattern) against another version/record.
- **Owner · Bind a claim to the plan (ADR-0102)** — on each `hypotheses` section in the composer, a **"Tests"** select listing the hypotheses of the newest preregistered version as `H1…Hn` (+ `—` for none), mirroring the control already shipped on the plan side in `overview-editor.tsx` including its dangling-reference fallback. Picking one binds `{planVersionId, hypothesisIndex}` and the chip becomes **Preregistered**; `—` leaves it **Exploratory**. A separate **"report as exploratory anyway"** checkbox downgrades a bound claim (a plan-matching hypothesis analysed a way the plan didn't specify is a real and honest case). **There is no control that upgrades an unbound claim** — the select is the only path to the word, by design: you point at a frozen hypothesis, or you don't get to say it. When the study has no preregistration the control is absent, not disabled-with-a-tooltip (there is nothing to pick).
- **Owner · Edit record → the composer (drag-and-drop):** enters an edit mode with a **section palette** on the side. The palette lists section *types* grouped as **From your data** (bound: Method, Results, Data, Preregistration, Replications, Materials — each shows a live preview of what it'll resolve) and **Write your own** (authored: Abstract, Narrative, Article link, Custom). Drag a section into the column to add; drag to reorder; per-section overflow menu = hide / remove / (bound) "what feeds this?". Authored sections edit inline. A sticky footer: visibility selector (Workspace / Public) + **Publish record** (validates abstract for public) + "Sync to OSF" (if connected). This reuses the dashboard customization interaction + persistence model (Stream F), not a new engine.

## Edge cases

- Very long title/abstract/author lists → clamp with "show more"; title wraps to 2 lines then ellipsizes.
- Zero replications → Replications section reads "No replications yet." Many (100s) → show top N + "view all" to the lineage tree.
- A bound section with no data (e.g. no preregistration) → the owner sees it greyed in the palette ("nothing to show yet"); it's auto-hidden on the public page rather than rendering empty.
- Slow network → bound sections stream independently; the page is readable as soon as the header + abstract arrive.
- Amended after finishing → "A newer version exists" note linking to it.
- Public/data section must never resolve raw participant rows (enforced server-side, not just hidden in UI).
- **Legacy records render every claim Exploratory** (ADR-0102, accepted cost) — they predate binding, so the system genuinely cannot verify them. Honest, but retroactively unflattering; the author can bind at any time and the chip flips. Do **not** soften this by defaulting to Preregistered or by hiding the chip on old records — either would re-import the self-report the ratchet exists to remove.
- **A bound hypothesis whose version was later amended** — the binding pins the *version*, so it keeps resolving against the list it was bound to and stays correct. The render says which version, so a reader can see the claim was bound to v3 while v5 is operative.
- **Change summaries are public, permanent, and unmoderated** (ADR-0102, committed-to gap) — researcher-authored free text on an indexed page with no takedown path, and ADR-0004 forbids hiding it. The amend form must say so before the author writes it.

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
