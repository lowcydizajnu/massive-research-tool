# PROCESS.md — the end-to-end workflow

The whole workflow at a glance:

```
Research  →  Product  →  Design  →  Architecture  →  Build  →  QA  →  Ship
   ▲                                                                    │
   └─────────────── feedback loop (insights from real users) ───────────┘
```

Each phase has (a) inputs it requires, (b) artifacts it produces, (c) a gate — the test that says "you may proceed to the next phase." If the gate fails, you do not move on. You repeat or escalate. The cost of moving forward on a broken foundation grows exponentially with every later phase.

The phases below are presented in the order you tend to start them. In practice they overlap: design refines product thinking, architecture surfaces design constraints, QA feeds back into research. Overlap is fine; **skipping** is not.

---

## Phase 0 — Discovery (optional, recurring)

The "what should we even build?" phase. Some sessions are pure discovery and do not produce a feature; that is acceptable.

**Inputs.** A question or hypothesis. Example: "Should the experiment builder be node-based or form-based?"

**Activities.** Literature review (`literature-review-helper` skill), informal interviews, competitor scans, internal brainstorm.

**Artifacts.** A note in `01_research/insights/` summarizing what you learned and what it implies.

**Gate.** Can you state, in one sentence, what changed in your mental model? If not, you are not done.

---

## Phase 1 — Research

The science layer. This is where psychology lives — not as decoration, but as the substrate for every product decision.

**Inputs.** A specific question tied to the product, framed as a hypothesis or a knowledge gap.

**Activities.**
- Targeted literature search (Consensus, Google Scholar, the `literature-review-helper` skill).
- Protocol synthesis when borrowing established paradigms (Stroop, n-back, dot-probe, etc.) — record exactly what we are reusing and what we are adapting.
- Critical appraisal — note effect sizes, sample sizes, replication status, WEIRD-sample caveats. A finding from one underpowered study does not move the roadmap.

**Artifacts.**
- `01_research/literature/{slug}.md` — paper summary, citation, key finding, our use.
- `01_research/protocols/{paradigm}.md` — when we adopt or adapt a paradigm.
- `01_research/insights/{insight-slug}.md` — synthesized findings that we will hand to Product.
- `01_research/decisions/{topic}.md` — when a research-informed call shapes the product (e.g., "we will not gamify attention tasks because of evidence X, Y, Z").

**Gate.** Every insight in `01_research/insights/` cites at least two independent sources and has a "What this means for the product" section. Insights without a product implication do not advance — they go to `literature/` for reference.

---

## Phase 2 — Product

Translate research and user needs into who, what, why.

**Inputs.** Insights from `01_research/insights/`, real user conversations, and the product hypothesis.

**Activities, in this order:**
1. **Personas** — for this product, at minimum: the principal investigator, the research assistant, the participant. Each persona is one page, anchored in real evidence, not invented.
2. **Jobs-to-be-done** — what is the user trying to accomplish, in what context, with what success criteria? JTBD beats personas alone for prioritization.
3. **User flows** — the literal step sequence to accomplish a job. One flow per job. Diagram + numbered steps + decision points.
4. **User journeys** — the emotional arc and touchpoints across a flow over time. Includes pain points, opportunities, and which research insight applies at each step.
5. **Use cases** — explicit success and failure paths for the most critical flows.

**Artifacts.** Files under `02_product/{personas,jobs-to-be-done,user-flows,user-journeys,use-cases}/` using the templates in `00_meta/templates/`.

**Gate.** For every flow heading into Design, you can answer: who is this for, what job is it doing, which insight grounds it, and what the failure modes are.

> **Note on ordering.** You listed wireframes before design inspiration. We slot inspiration earlier so it can shape your wireframes rather than retrofitting later. If you want them inverted, override in `00_meta/rules/design-rules.md`.

---

## Phase 3 — Design

Make the product visible and interactable, in increasing fidelity.

**Inputs.** User flows and journeys from Phase 2.

**Activities, in this order:**
1. **Inspiration & precedent** (`03_design/inspiration/`) — mood boards, competitor screens, references. Annotated, not dumped. "What works, what doesn't, what's relevant to us."
2. **Information architecture** (`03_design/ia/`) — sitemap, navigation model, content hierarchy, taxonomy of objects (Project, Experiment, Trial, Participant, Result, etc.).
3. **Wireframes** (`03_design/wireframes/`) — low-fi, structural only. One file per screen or screen-family. Includes the user flow it serves and the IA placement.
4. **Design system** (`03_design/design-system/`) — tokens (color, type, spacing, motion), primitives (button, input, card), composites (form row, data table, node-graph canvas), patterns (empty state, error, loading, optimistic update). Nothing ships to the app that is not first in the design system.
5. **Prototypes** (`03_design/prototypes/`) — high-fidelity, interactive where useful. For drag-and-drop and node-graph interactions, prototype in code (a small Storybook or sandbox) — static mockups lie about interaction.
6. **Handoff specs** (`03_design/handoff/`) — generated with the `design:design-handoff` skill. Layout, tokens, props, states, breakpoints, edge cases, motion.

**Accessibility is a phase-3 concern, not a phase-6 audit.** Run `design:accessibility-review` on every screen before it leaves Design.

**Gate.** A screen leaves Design only when it has: a wireframe, all its components defined in the design system, a handoff spec, and an accessibility pass. The `design:design-critique` skill runs on the final mockup; findings are addressed or explicitly accepted.

---

## Phase 4 — Architecture

Turn the designed experience into a system that can hold up under multi-tenant, multi-project, cross-wired complexity.

**Inputs.** Handoff specs and the design system from Phase 3.

**Activities.**
1. **Capture the domain model** — `04_architecture/data-model/` — entities, relationships, invariants. Use ER diagrams. Name things carefully; rename early, never late.
2. **Write ADRs for every non-obvious choice** — `04_architecture/adrs/` — see `00_meta/rules/decision-records.md`. Examples that demand ADRs for this product: tenancy model, authorization model, how experiment definitions are versioned, how the node-graph runtime executes, realtime collaboration approach, file/asset storage, background job system.
3. **Define API contracts before implementation** — `04_architecture/api-contracts/`. Type-safe contracts (tRPC schemas, OpenAPI) are part of the architecture, not the code.
4. **Draw the diagrams that matter** — `04_architecture/diagrams/`. System context, container diagram (C4 levels 1 and 2 are usually enough), key sequence diagrams (auth, experiment run, result ingestion), state machines for any flow with more than three states (the node-graph editor and the experiment runner both qualify).

**Gate.** Before any feature enters Build: data model is in `data-model/`, the relevant ADRs are written and signed off, contracts exist, and the highest-risk flow is diagrammed.

---

## Phase 5 — Build

Write the application. The first time you reach this phase, also do the one-time setup described in `STACK.md`.

**Activities.**
1. Implement against the contract — never against intuition.
2. Test as you write. See `00_meta/rules/qa-and-testing.md` for the layered strategy (unit, integration, end-to-end, visual regression for the design system).
3. Land changes in small, reviewable increments. Even solo, a small diff is a clean diff.
4. Every PR (or commit batch) carries a filled-out `00_meta/templates/pr-checklist-template.md`.

**Gate.** All tests green, checklist complete, the change is traceable to a feature spec and an ADR. Visual changes are diffed against the design system.

---

## Phase 6 — QA

Verification beyond the unit and integration tests written during Build.

**Activities.**
- End-to-end run against a staging environment that mirrors production.
- Accessibility re-check using `design:accessibility-review` on the live build.
- Security review using the `security-review` skill for any change touching auth, data isolation, or external input.
- Performance check on the slowest expected flow (large experiment, many participants, complex node graph).
- Manual exploratory testing — note findings in `06_qa/audit-logs/`.

**Gate.** The audit log for the release is committed and links to every issue raised, fixed, or accepted.

---

## Phase 7 — Ship and learn

Release behind a feature flag where possible. Collect quantitative signal (event analytics, error rates, performance) and qualitative signal (user interviews, support tickets). Pipe what you learn back into `01_research/insights/`. The loop closes.

---

## Recurring practices that span all phases

**Decision records.** Architectural decisions live in `04_architecture/adrs/`, but product, design, and research decisions also need records (in their own folders' `decisions/` subfolders when present, or inline in the relevant artifact). The trigger is: "would a future contributor be confused about *why* this was done this way?" If yes, write it down.

**Memory.** When you learn something durable about how we work (a preference, a constraint, a recurring trade-off), save it to memory so the next session inherits it.

**Archive, do not delete.** When a doc is superseded, move it to `99_archive/` with a one-line note about what replaced it. The audit trail matters more than tidiness.

**Stop and ask.** The single highest-leverage habit. A two-line clarifying question prevents a two-day rebuild.
