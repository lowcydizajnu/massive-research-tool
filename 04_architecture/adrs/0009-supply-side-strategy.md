# ADR 0009 — Hybrid supply-side strategy — default virtue + demand-first + mandate leverage

- **Status:** accepted
- **Date:** 2026-05-28
- **Deciders:** project owner (with Claude as collaborator)
- **Tags:** strategy, go-to-market, open-science, supply-side, partnerships

## Context

The wedge ("Qualtrics + GitHub for research") rests on a supply assumption: that researchers will share their studies as runnable, forkable artifacts. The persona-segmentation insight (`01_research/insights/persona-segmentation-and-strategic-risks.md`), drawing on the synthetic-pilot interviews, surfaces a hypothesis that two of three personas reached independently: **original authors have rational reasons NOT to share their studies in ways that make them easy to scrutinize.** Sofia (the burned replicator) framed it most clearly — the tool is "a gift to replicators and a perceived weapon to the originals whose cooperation you need."

This is the single biggest non-technical risk to the product as positioned. No feature alone solves it. It's not in the architecture queue's other ADRs because it's not an architectural decision — it's a strategic one. But postponing it risks shipping V1 into a market with empty supply.

This ADR is unusual: more strategic than code-specific, lighter on data-model details, heavier on go-to-market and product-posture commitments. That's appropriate for the question it addresses.

This ADR sits at number 0009, not 0008, because ADR-0008 is reserved for the plugin-model decision that was deferred in ADR-0001. The non-sequential numbering reflects the order decisions actually got made, which is honest.

## Options considered

### Option A — Default virtue alone

The tool captures runnable artifacts as the byproduct of building. Most of the relevant infrastructure is already in ADR-0001 through ADR-0007. The strategic commitment is to keep choosing "path of least resistance = produces good documentation" at every UX decision going forward.

- **Pros.** Mostly already done. Honors Sofia's "voluntary virtue fails, default virtue works" principle.
- **Cons.** Doesn't change incentives for an author who *actively wants* their work hard to replicate. Doesn't expand the addressable supply beyond people already inclined to share.

### Option B — Demand-first market entry alone

Target the segments that already want to share (consortia, replicators, open-science labs). Don't try to convert the unwilling. Let supply follow demand.

- **Pros.** Tractable for a solo founder. Architecture is already optimized for this segment.
- **Cons.** Smaller TAM in V1. Pure demand-side strategy won't grow supply structurally.

### Option C — Mandate leverage alone (journals + funders)

Partner with journals and funders that require runnable shares. Convert "voluntary virtue" into "structural requirement."

- **Pros.** Touches the supply incentive directly. Compounding effect at scale.
- **Cons.** Long sales cycles. Premature without product evidence. Mandate-driven supply often produces minimum-compliance artifacts rather than genuine ones.

### Option D — Hybrid (chosen)

Three layers that compound rather than compete:

1. **Architectural** (now, mostly done): default virtue as discipline.
2. **Go-to-market** (V1): demand-first.
3. **Strategic partnerships** (V2+): mandate leverage.

- **Pros.** Each layer is tractable on its own. They reinforce each other — default virtue makes demand-first segments happy, demand-first generates the case studies that make mandate-leverage credible.
- **Cons.** Most complex to communicate. Each layer needs continued attention.

## Decision

**We will adopt Option D: a three-layer hybrid supply-side strategy** — default virtue as the architectural posture (continuing what ADRs 0001-0007 began), demand-first as the V1 go-to-market, and mandate leverage as the V2+ strategic partnership track.

### Layer 1 — Default virtue (architectural posture; continuous)

The premise: **good documentation is the byproduct of building, not a separate step.** Researchers don't need to be asked to share runnable artifacts — they need a tool where the path of least resistance produces them automatically.

Most of this is structural already:

- **Schemas-first (ADR-0001).** Every module has a formal data shape. Outputs are structurally valid by construction.
- **Immutable versioned snapshots (ADR-0002).** Every meaningful save is a recoverable point in time; preregistered and published versions are permanent.
- **Asset freeze on preregistration (ADR-0003).** Materials are captured at the moment of commitment.
- **Preregistration amendments (ADR-0004).** Lineage is preserved through legitimate corrections; nothing can be quietly rewritten.
- **OSF push as default (ADR-0005).** The runnable artifact reaches the academic substrate without manual effort.

What remains is **discipline**: every product / design / UX decision going forward should be evaluated against "does this make the path of least resistance produce a better-documented artifact, or a worse one?" The discipline lives in `00_meta/rules/design-rules.md` as a check item; it also informs every future feature spec.

**Specific commitments under default virtue:**

- Forking, sharing, citation, and publication flows produce runnable artifacts by default, not "with extra effort."
- Documentation fields are inline with editing flows, not gated behind a separate "now please document" step.
- Default privacy is the most open setting that still respects consent and IRB boundaries — friction is added for *closing*, not for *opening*.
- Per ADR-0007's lock-in inventory pattern: any UX decision that materially reduces default-virtue requires a "documentation debt" entry with a justification.

### Layer 2 — Demand-first go-to-market (V1)

V1 acquires users from the segments that already *want* to share their work. The product wedge is correct; the addressable market for V1 is the willing-share population.

**V1 target segments, in priority order:**

1. **Multi-site consortia** (Marek's archetype). The pain is acute; willingness to share is structural (multi-site work doesn't function without it); the existing alternatives are spreadsheets and Slack. Even one consortium represents many researchers and a credible reference case.
2. **Replication-focused labs and researchers** (Sofia's archetype). Small in absolute count but highly vocal; conversion produces evangelists.
3. **Open-science-engaged labs** (the best version of Maya / Hanna). Researchers already publishing on OSF, preregistering routinely, sharing materials. Our tool's default-virtue posture matches their existing values.

**V1 explicitly NOT-targeting:**

- Reluctant-author segments who actively prefer their work hard to replicate. They will not be V1 customers; trying to win them dilutes positioning.
- Researchers who treat OSF as an end-of-project compliance dump rather than a working surface. They are not the early-adopter shape we want; they will follow later, not lead.

**V1 marketing/positioning** leads with provenance and reproducibility per product-brief §8 — "Qualtrics + GitHub for research" with the GitHub-style affordances visibly emphasized. Authoring richness is the supporting message, not the headline. The headline is *what you make here is a thing that runs in 2035*.

**V1 success criteria for this layer** (qualitative — quantitative targets premature):

- At least one consortium customer (or candidate) by V1 launch.
- At least three labs explicitly engaged with open-science publishing.
- Early reference cases come unprompted from the willing-share segments.

### Layer 3 — Mandate leverage (V2+ strategic partnerships)

When V1 has produced credible product evidence, approach **a small number of carefully chosen institutional partners** — journals that mandate runnable shares, funders that mandate open materials.

**Candidate journals** to approach with V1 evidence (illustrative, not exhaustive):

- *Royal Society Open Science* — already mandates data sharing, publishes registered reports.
- *PLOS ONE* and selected *BMJ* titles — data-sharing-mandate cultures.
- *Advances in Methods and Practices in Psychological Science (AMPPS)* — methodologically engaged audience.
- *Behavior Research Methods* — the tooling community's home journal.

**Candidate funders** (illustrative):

- NIH (existing data-sharing policy effective 2023).
- NSF (data management plan requirements).
- Wellcome Trust (open access mandate, increasing emphasis on reproducibility).
- DFG (German funder, very engaged with open-science reform).

**The pitch shape** for V2+:

- **To journals:** "Your authors get a one-click compliance flow for the methods/materials transparency requirements you already publish."
- **To funders:** "Your grant outputs become permanently reproducible artifacts, not paragraphs that decay."

**What we do NOT do** at the mandate-leverage layer:

- Promise exclusivity to any single partner.
- Build features specifically to satisfy one journal's quirks at the expense of others.
- Treat mandate-driven adoption as the same as voluntary adoption (the UX needs to make compliance feel like enabling research, not satisfying a regulator).

**V2+ success criteria** (qualitative):

- One journal partnership in active pilot.
- One funder relationship with at least an exploratory conversation.
- Documented cases of authors choosing the platform *because* of a mandate, alongside the V1 willing-share population.

### What this ADR explicitly does NOT try to do

- **Recover the back catalogue.** The existing universe of un-runnable studies, papers with missing materials, OSF graveyards — these are not addressable by any feature we ship. We accept this loss and focus on flow rather than stock. Future researchers' work becomes reproducible; past work mostly does not.
- **Convert reluctant authors against their interests.** A researcher who genuinely benefits from being hard to replicate has rational reasons to avoid our tool. We do not try to overcome rational self-interest with UX cleverness.
- **Build features that primarily serve the supply problem.** This is a strategic ADR, not a feature roadmap. The features that solve supply-via-default-virtue are mostly already committed in ADRs 0001-0007.

## Consequences

**What becomes easier:**

- A coherent answer to "why will anyone share their work on this platform?" emerges. The answer is: because the right segments already want to (V1), and the right institutions will require it (V2+), and the tool makes it the easy path either way.
- V1 product priorities sharpen. We're not trying to win every segment; we're winning the segments that already exist.
- Future strategic ADRs and partnerships discussions have a frame to work in.

**What becomes harder:**

- Demand-first explicitly leaves money on the table in V1. Some pressure to "also serve the reluctant-author segment" will recur. The default answer is "not in V1."
- Mandate leverage requires institutional credibility we don't have yet. The temptation to chase journal partnerships prematurely (before product evidence) will recur. The default answer is "after V1."
- Continued default-virtue discipline requires sustained UX attention. Every "let's just add this shortcut" temptation is a discipline test.

**What we are now committed to:**

- Default virtue as a continuous architectural posture, evaluated per UX decision.
- V1 go-to-market focused on consortia, replicators, and open-science labs — explicitly not the reluctant-author segments.
- V2+ strategic partnership track with journals and funders, gated by V1 product evidence.
- Honest acknowledgment that the back catalogue is lost; flow > stock.

**What we are now precluded from:**

- V1 marketing that targets reluctant-author segments.
- Premature mandate-leverage outreach without product evidence.
- UX shortcuts that erode default-virtue without a recorded "documentation debt" entry and justification.
- Treating the empty-supply hypothesis as solved; it is mitigated, not solved.

## Revisit triggers

Reopen this decision if:

- **V1 demand-first segments turn out to be smaller than projected.** Smaller TAM may force expansion to adjacent segments earlier, possibly including some reluctant-author niches.
- **A journal or funder approaches us before V1 ships.** The mandate-leverage track may need to accelerate; the strategic posture should be ready for that.
- **An adjacent product (a journal-system extension, a funder-portal integration) becomes a viable wedge.** Re-evaluate whether we're at the right level of the stack.
- **Empirical evidence emerges that the "rational reasons not to share" claim is weaker than the synthetic pilot suggested.** Real-user interviews might show this hypothesis is overstated for our segments; if so, demand-first targeting could broaden.
- **The architectural default-virtue commitments are visibly drifting** — UX shortcuts accumulating, documentation debt growing. Triggers a discipline review and possibly a follow-up ADR formalizing the rules more tightly.

## References

- `01_research/insights/persona-segmentation-and-strategic-risks.md` — the originating insight; Sofia's framing of the asymmetry; Marek's funding-asymmetry concern.
- `02_product/product-brief.md` §9 (supply-side risk surfaced) and §1 (positioning the wedge).
- `02_product/personas/burned-replicator.md` — Sofia explicitly recommends default virtue; her "voluntary virtue fails, default virtue works" line is the most actionable piece of strategic advice in the synthetic pilot.
- `02_product/personas/multi-site-coordinator.md` — Marek's segment is the cleanest V1 demand-first target.
- `02_product/personas/principal-investigator.md` + `postdoc-operator.md` — best-case segments of these personas overlap with the open-science-engaged-lab category.
- ADR-0001 through ADR-0007 — collectively constitute the default-virtue architectural foundation.
- `00_meta/rules/design-rules.md` — should gain a "default virtue" check item; future addition.
- Future: V1 GTM document — translates this ADR into concrete launch plans.
- Future: V2+ partnership outreach plan — operationalizes the mandate-leverage layer.
- Future: a follow-up ADR if/when default-virtue discipline drifts and needs tightening.
