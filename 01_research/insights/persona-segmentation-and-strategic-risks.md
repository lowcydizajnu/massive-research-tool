# Insight — Persona segmentation and strategic risks (from synthetic pilot)

An insight is a finding distilled from literature, interviews, or both — packaged so that designers and architects can act on it. Every insight must cite its evidence and state what it implies for the product.

- **Status:** draft
- **Evidence basis:** Three synthetic interview personas (HK / MS / SM) constructed by the project owner from the PI interview guide; explicitly framed as hypotheses, not field data. Captured at `01_research/user-research/notes/2026-05-28-synthetic-pilot-interviews.md`. No real interviews yet.
- **Confidence:** low
- **Source materials:** `01_research/user-research/notes/2026-05-28-synthetic-pilot-interviews.md` (+ raw extract), `01_research/insights/researcher-tooling-pain-points.md` (the literature insight this complements).
- **Last updated:** 2026-05-28

## Headline

The synthetic pilot interviews surface a finding that no single literature search or single persona would have made visible: **the same product question gets opposite answers depending on which user segment is answering, and the wedge ("Qualtrics + GitHub for research") has different — sometimes contradictory — value to each segment**. The solo investigator wants integrated authoring and tolerates richness. The multi-site coordinator wants provenance and resists richness. The burned replicator wants reproducibility and is suspicious of polish. Worse: two of three personas independently surface a **supply-side incentive problem** — the people who hold the studies we want forkable have active reasons NOT to share them, and no tool fixes that. This is the hypothesis most likely to kill the wedge as currently framed, and it is not a technical problem.

## Evidence

### The segmentation is real and matters

The pilot's claim-check section was structured to surface false agreements. Three findings:

1. **Preregistration means three different things** to three personas: a hedge ("officially always... [laughs]" — HK), a load-bearing wall ("if anything I'd want a tool to enforce it more strictly" — MS), and personal armor ("I don't run anything naked anymore" — SM). All three say "yes" to the claim. None mean the same thing.
2. **"Modern UX" is the wrong lead message for the replication-world segments.** HK (solo) accepts it. MS (multi-site) refuses the premise — "modern isn't close to sufficient" — and itemizes the actual bar. SM (replicator) inverts it — polish triggers suspicion ("what are they hiding"). Two of three reject the framing.
3. **"Richer tools → scope up" is solo-only.** HK softly accepts. MS and SM both flatly reject: for multi-site work, richness multiplies divergence risk across sites; for replication-driven work, richness multiplies un-reproducibility surface area. **Marketing "do richer things" wins one segment and actively alienates the other two.**

### The single capability all three care about: build-to-data provenance

Each persona's most viscerally-felt pain converges on the same architectural primitive — *knowing what actually ran*:

- HK's randomization broke silently — "I lost a day to a study where randomization silently broke and a quarter of people saw the wrong condition."
- MS's site forked the materials in March and never pulled the April fix — "forked in March, never pulled the April fix... no automatic way to know."
- SM's eighteen-month replication argument was un-winnable because she couldn't prove her version matched the original — "you can't publish 'we replicated, probably.'"

Three faces of one thing: nobody can prove what actually ran. **Build-to-data attestation is the single capability that speaks to all three.** MS attached unprompted willingness-to-pay to it: "I would pay real money for that guarantee. Not a figure of speech." (Caveat: synthetic — treat as hypothesis to validate, not as a buy signal.)

This aligns squarely with our ADR-0001 versioned module identity, ADR-0002 immutable version history, and ADR-0003 asset-freeze decisions. The architecture we've built is well-positioned. **The wedge framing in user-facing copy should lead with provenance/reproducibility, not authoring richness.**

### The hypothesis most likely to kill the wedge: supply-side incentives

Two of three personas independently surface this. MS at the end: "Why would an original author make their study easy to fork when being hard to replicate protects them?" SM, sharpened by injury: "When I want to build on your work and you'd rather it stay un-scrutinized, no tool bridges that. The frustration isn't logistics — that's Marek's world — it's MOTIVATION. Until that changes, easy-sharing tools mostly help people who already wanted to share."

The asymmetry stated cleanly (SM's wrap-up): the tool is a **gift to replicators** and a **perceived weapon to the originals** whose cooperation we need. This is not a technical problem. The system can make sharing frictionless and still face an empty supply side if authors choose not to share.

SM's constructive answer is the most promising route around it: **default virtue.** "Make it the PATH OF LEAST RESISTANCE — so people document properly without meaning to. Voluntary virtue fails. Default virtue works." If good documentation is the byproduct of building (not an additional step), the supply problem partially solves itself for new studies — though it does nothing about the existing back catalogue.

### Trust signals are inverted across segments

The literature insight (`researcher-tooling-pain-points.md`) noted modern UX as a credibility signal — sourced from a single observation. The synthetic pilot complicates this:

- HK: polish → inferred maintenance → trust (this is the original claim).
- MS: polish operationally → fewer support tickets → trust (different mechanism, same direction).
- SM: polish → SUSPICION → distrust ("a beautiful interface now triggers 'what are they hiding'").

A polished demo could **backfire** with the SM-type segment. The design implication isn't "be ugly" — it's "show your workings; don't hide them behind clean UI." Provenance and inspectability are themselves design surfaces.

### Product strategy: two products pulling apart inside one positioning

The synthetic pilot makes visible a tension I underweighted in the product brief: the **solo-investigator product** (integrated authoring + prereg + build, optimize for one researcher's workflow) and the **consortium-operations product** (distribution, version control, attestation, status tracking across sites) share a provenance core but diverge sharply in scope. HK's pain is authoring friction; MS's pain is coordination tracking. A product that tries to be both risks pleasing neither.

This is the central product decision the synthetic interviews force into the open. The brief (`product-brief.md` §1 positioning) said "Qualtrics + GitHub for research" — that framing covers both products but doesn't choose between them. **A choice will need to be made**, likely informed by real interviews and by who pays.

## What this implies for the product

These are *implications conditional on the hypotheses being validated in real interviews.* Each is a candidate adjustment, not a committed change:

1. **Reframe the wedge in user-facing copy from "richer authoring" to "provenance + reproducibility."** The architecture (ADR-0001/0002/0003/0004) is well-aligned with this framing; only the surface narrative needs the shift. The current product-brief positioning ("Qualtrics + GitHub for research") survives but its leading message should emphasize the GitHub-style affordances (versioning, lineage, attestation) more than the Qualtrics-style affordances (authoring breadth). Update product-brief if real interviews confirm this.
2. **Add ADR-0009 (queue): supply-side strategy.** How do we address the incentive asymmetry? Possible mechanisms — make documentation the default byproduct of building (SM's prescription); align with journals that mandate runnable shares; partner with consortia that already share; build for replicators first and let supply follow demand. Out of scope for now but flag as a strategic ADR before V1 ships.
3. **Validate the "modern UX as credibility" claim ASAP in real interviews.** If SM-type inversion is real and common, the visual direction needs to lead with inspectability, not slickness. The persona currently asserts this claim with single-source evidence; the synthetic pilot challenges it for two of three segments.
4. **Reconsider the "richer authoring" feature emphasis.** For multi-site and replication-focused researchers, richness is risk. Solo investigators want it. The platform may need to support both via theme-overlay defaults (ADR-0001 already gives us this mechanism — a "consortium" theme could trim the surface area; a "solo authoring" theme could expand it).
5. **Three new personas worth drafting** (separate next step): solo-postdoc-operator, multi-site-coordinator, burned-replicator. The PI persona (Maya) covers the principal-investigator role but is silent on the postdoc-as-daily-operator pattern (HK), the coordinator pattern (MS), and the burned-replicator pattern (SM). Each opens different JTBDs.
6. **Recruiting strategy for real interviews:** the synthetic pilot's wrap-up referrals point to populations beyond researchers — site PIs inside consortia, data managers, original authors who got replicated (especially ones who handled it badly), and journal editors with leverage to mandate sharing. The "user research" recruiting plan should target these segments, not just more PIs.

## What this insight does NOT tell us

- **Whether any of this is true for real researchers.** Every quote in the pilot is fictional. The structural findings (segment-dependent meanings; supply-side risk; trust-signal inversion) are *plausible patterns* the synthetic exercise made visible — but they are hypotheses, not validated evidence.
- **The frequency of each segment in our addressable market.** Are most academic PIs solo investigators, or do consortia dominate the relevant population? Real interviews and possibly survey-style triangulation needed.
- **Willingness to pay** for any specific capability. The pilot's most quotable WTP line ("I'd pay real money for attestation") is a fictional artifact and should not be reported as a market signal.
- **The full failure modes of the supply-side problem.** SM's "default virtue" prescription is promising in the abstract; whether it actually works in practice (does making documentation the default byproduct produce the right kind of documentation? Or just *more* documentation that's still useless?) is itself an empirical question.
- **Whether the two-product tension (solo vs consortium) resolves cleanly via the theme-overlay mechanism, or whether the two products need to diverge structurally.** A real consortium coordinator's perspective is the key test.

To lift this insight from `low` to `medium` confidence: **conduct 2–3 real interviews from each of the three segments** (six to nine total), specifically probing the structural findings — claim-check divergences, the supply-side risk, and the trust-signal inversion. The synthetic pilot already refined the script; the next step is running it on people who weren't designed by us.

## Sources

- **Primary:** `01_research/user-research/notes/2026-05-28-synthetic-pilot-interviews.md` and the raw extract `2026-05-28-synthetic-pilot-interviews-source.txt` (same folder). The source `.docx` lives in the user's upload folder; the extracted text is preserved alongside the synthesis.
- **Related insight:** `01_research/insights/researcher-tooling-pain-points.md` — the literature pass that this pilot complements. Where literature is thin (e.g., aesthetic frustration, modern-UX-as-credibility, behavioral switching), the pilot adds hypothesis-grade nuance. Where literature is firm (fragmented tooling, OSF as credibility floor, MTurk-to-Prolific shift), the pilot is consistent.
- **Architecture artifacts the pilot pressure-tests:** ADR-0001 (modular composition + theme overlays), ADR-0002 (forking model), ADR-0003 (asset storage), ADR-0004 (preregistration amendments), `04_architecture/data-model/00-core-entities.md`. None of the synthetic findings contradict accepted ADRs; several reinforce them (especially the build-to-data provenance angle for ADRs 0001-0002, and the schemas-first / immutability angles for ADR-0004).
- **Product artifacts the pilot pressure-tests:** `02_product/product-brief.md` (positioning + wedge framing — likely warrants a small update to surface provenance ahead of authoring richness), `02_product/personas/principal-investigator.md` (Maya — synthetic pilot complements but does not validate; three new persona candidates implied).
