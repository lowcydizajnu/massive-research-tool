# Persona — Dr. Sofia Marsh, Burned Replicator

A persona is a memorable, evidence-grounded archetype that exists to make user decisions concrete. If you cannot point at the evidence behind a claim, do not include the claim.

- **Status:** in review
- **Evidence basis:** SYNTHETIC pilot only — `01_research/user-research/notes/2026-05-28-synthetic-pilot-interviews.md` (SM profile) + literature triangulation via `01_research/insights/researcher-tooling-pain-points.md` (the replication-crisis-driven reformer is a documented archetype in open-science research even if this specific person isn't). **No real interviews.** Revisit before V1 ships or before any "share / fork" UX is locked.
- **Last validated:** 2026-05-28 (synthetic pilot only; not field-validated)
- **Related JTBDs:** …
- **Grounding insights:** [persona-segmentation-and-strategic-risks](../../01_research/insights/persona-segmentation-and-strategic-risks.md), [researcher-tooling-pain-points](../../01_research/insights/researcher-tooling-pain-points.md)

> **Naming + provenance note.** This persona is derived from the synthetic SM profile in the pilot. **Sampling caveat: this is a "convert" persona — someone whose identity was rewired by injury (a long, difficult replication). She is the most passionate voice for reproducibility-as-a-product-promise AND the least representative of the average researcher.** Discount enthusiasm; weight her warnings.

## Snapshot

Sofia is a fifth-year postdoc — "the postdoc that won't end" — in cognitive/social psychology, focused on memory and metacognition. Two years ago she spent eighteen months on a single replication project: a well-known priming effect she'd built part of her own work on. The original wasn't well documented; reconstruction took months; her version didn't replicate; then came a year of defending whether her "version" was a faithful copy of the original. The saga rewired her. She now stripped her stack to things she can archive and re-run in ten years, preregisters everything as personal armor, and is openly suspicious of polished tools because the original's OSF page looked polished and was hollow.

## Background and context

Roughly eight years post-PhD, in a small lab — a PI, herself, two PhD students. Memory and judgment work. She came out of the replication saga a methodologically harder person; some of her current research is just re-examining things the field takes for granted, "less fundable, less fun, I do it anyway."

Her unique value as a persona is the **double perspective**: she was both the denied replicator (begging for materials from a defensive author) and, six months later, the author whose own files had rotted — "I've been the villain of my own story." That double perspective is the reason her warnings about the supply-side problem land harder than anyone else's: she has been on both sides of the asymmetry.

Her relationships to others' work are sometimes adversarial. "My hardest collaboration wasn't one — extracting a study from someone with every incentive not to give it." This is a relationship type the other personas don't surface.

## Goals

- **Life / career:** Settle into a permanent role where her methodological standards aren't a career liability. Build a body of work that survives scrutiny — partly by making sure it can BE scrutinized.
- **Work / project:** Continue the slow work of re-examining established effects; ship her own studies as **runnable artifacts** that others can re-execute, not paragraphs that others must interpret.
- **Right now:** Hunt down materials for an old study of her own so a current student can build on it — and discover, humiliatingly, that her files from three years ago are a disaster.

## Frustrations

- **Specification loss.** The original of her replication target was a paragraph in a paper, a partial OSF page, three tense emails with the author, and inference. "You can't publish 'we replicated, probably.'" *Cost:* the eighteen months of her life she lost; the friendship with the original author that did not survive.
- **Un-winnable fidelity arguments.** Even after replicating, she had to defend that her version was a faithful copy. Months at 90% confidence that her version was right; the last 10% is where all the fighting happened. *Cost:* career-affecting; emotionally exhausting; impossible to fully resolve without a runnable original.
- **Performative openness.** The original's OSF page was "a graveyard of partial files dressed up to look complete." Not a surprise so much as a betrayal. *Implication:* the existence of an OSF page is worthless; what matters is whether the materials actually constitute a runnable study. Most don't.
- **Her own incomplete materials.** When her student needed her three-year-old study, she discovered uncommented code, files named after inside jokes, three versions. *"I've been the villain of my own story."* Diagnosis: not malice but **absent incentive + decay**. The incentive to document for a stranger's future use is essentially zero in the moment.
- **Misaligned incentives across the field.** "When I want to build on your work and you'd rather it stay un-scrutinized, no tool bridges that. Until that changes, easy-sharing tools mostly help people who already wanted to share." *Implication:* the wedge has a supply-side problem that no feature solves.
- **Polished tools trigger suspicion.** "A beautiful interface now triggers 'what are they hiding.'" Post-replication, looks are inverse-correlated with trust. *Implication:* the visual direction we lead with affects this segment differently from the others.

## Behaviors and habits

- Stack got simpler after the replication, not richer. Stripped to things she can fully archive and re-run.
- Preregisters everything — "armor, I don't run anything naked anymore."
- Trust bar is brutal: she trusts what she can run and verify herself, almost nothing else. Reputation buys nothing now — the effect she failed to replicate had a very good reputation.
- Obsessive about randomization and condition logs — fear-driven, not tool-driven. Automatic verification would relieve a load she carries through anxiety.
- Tells the truth about her own files being a mess. Most people don't.

## Tools today

- **jsPsych** — built in, post-saga, because she'd decided never to build anything she couldn't fully share again.
- **GitHub** — kept properly, post-trauma. (Her earlier work was disorganized; the difference is the saga.)
- **OSF** — prereg, materials, data, code. With **complicated feelings** — she uses it but no longer trusts it on sight.
- **Prolific** — recruitment.
- **R** — analysis.
- **Zotero** — literature.
- **Spreadsheets + email** — the boring tools that don't fail her.

## Quote

> "More emotional stamina than statistical skill. If you build the runnable-archive thing, make it the path of least resistance — so people document properly without meaning to. Voluntary virtue fails. Default virtue works."

*Paraphrased from the synthetic SM pilot — not a real quote from a real user. The pilot itself flags this persona as the most compelling and least representative voice; treat her wisdom with care and her enthusiasm with suspicion.*

## What this implies for the product

- **Default virtue is the design principle for this segment.** Documentation as the *byproduct* of building, not a separate step. The supply-side problem partially solves itself for new studies if the path of least resistance produces a runnable artifact. This is the most actionable warning she gives us.
- **Inspectability over polish.** A slick demo can backfire here. Surface the workings — the version locks, the asset provenance, the schema, the lineage — visibly. ADR-0001/0002/0003/0004 already give us these primitives; the design surface needs to *show* them, not hide them.
- **Runnable artifact as the primary deliverable, not the secondary one.** When she publishes, the unit of publication is a thing that *runs*, not a paragraph that someone has to reconstruct. The product's "publish this experiment" flow needs to produce a runnable, citeable, frozen artifact (ADR-0002's `kind: published` versions + ADR-0003's freeze pass + ADR-0004's amendments form the substrate).
- **Trust = inspectable artifact + reputation, NOT reputation alone.** She moved further than MS on this spectrum: for her, an inspectable artifact substitutes for reputation. This is the segment where the wedge has the most trust-value — but also the smallest, most self-selected segment. Don't size the market on her.
- **The supply-side risk needs its own strategic ADR.** Likely candidates: align with journals that mandate runnable shares (lever); partner with consortia that already share (existing supply); make documentation the default (her prescription); accept that the back catalogue of un-runnable studies is permanently lost and focus on flow, not stock.
- **Replicator and replicatee are sometimes adversarial.** The "make sharing easy" framing assumes goodwill. For Sofia, easy sharing on her end doesn't help if the holder refuses. The wedge is partly a cold-start / network problem, not just a UX problem.

## Open questions / what to validate

**Synthetic-pilot evidence only, with extra caution.** This persona is the *most* susceptible to bias-by-construction — she's a wounded reformer, the kind of voice a thoughtful project owner might over-weight because her warnings feel important. Real-interview validation matters extra here. Probe:

- Is "default virtue" actually achievable? When documentation is the byproduct of building, does the result actually help replicators, or is it just *more* useless documentation?
- Does inspectability over polish hold for real burned replicators, or is the pilot dramatizing? (Likely partially true; the magnitude is the question.)
- Is the supply-side asymmetry the single biggest threat to the wedge, or is it one of several? Two of three pilot personas surfaced it — but the third (HK) didn't.
- Trust spectrum: HK (social) → MS (reputation+artifact) → SM (artifact-over-reputation). Real users probably distribute along this; understand where the bulk sits.
- Adversarial-collaboration framing: how common is "extracting a study from someone with every incentive not to give it"? Common enough to design for, or a corner case the pilot dramatized?

**Revisit trigger:** before locking any UX that involves sharing, forking, citation, or trust signals; before V1 ships; specifically if the architecture team is about to ship something that looks polished and might trigger her segment's suspicion — pause and validate first.
