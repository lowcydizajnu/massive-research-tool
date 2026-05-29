# Persona — Dr. Maya Okonkwo, Principal Investigator

A persona is a memorable, evidence-grounded archetype that exists to make user decisions concrete. If you cannot point at the evidence behind a claim, do not include the claim.

- **Status:** in review
- **Evidence basis:** Single observation by the project owner (academic PI doing misinformation research) + literature triangulation via `01_research/insights/researcher-tooling-pain-points.md` (20 Consensus searches, ~30 cited papers) + synthetic-pilot interview pass (`01_research/user-research/notes/2026-05-28-synthetic-pilot-interviews.md`) that stress-tested the script and surfaced segmentation hypotheses (see `01_research/insights/persona-segmentation-and-strategic-risks.md`). Real interviews still pending to upgrade to `validated`.
- **Last validated:** 2026-05-28 (partial — literature + synthetic pilot only; no real-user validation yet)
- **Related JTBDs:** …
- **Grounding insights:** [01_research/insights/researcher-tooling-pain-points.md](../../01_research/insights/researcher-tooling-pain-points.md), [01_research/insights/persona-segmentation-and-strategic-risks.md](../../01_research/insights/persona-segmentation-and-strategic-risks.md)

> **Naming note.** "Dr. Maya Okonkwo" is a placeholder name to make this persona memorable. Replace with whatever makes the team carry her around in their heads.

## Snapshot

Dr. Maya Okonkwo is a working academic Principal Investigator whose research focuses on misinformation. She is methodologically strict, fluent in open-science practices, and increasingly frustrated by the gap between her standards and her tooling. Today she runs studies in Qualtrics and finds it clunky and dated; she would switch to something modern that respects her workflow, supports collaboration with peers around the world, and gives her room to use the growing computing power available without losing scientific rigor.

## Background and context

Maya runs a small academic lab built around misinformation susceptibility — what makes people believe false claims, what interventions reduce that susceptibility, and how findings replicate across populations. Her work is online-study-heavy, with multi-condition designs and complex stimuli (often video or article excerpts). She collaborates regularly with researchers in other institutions and other countries, frequently across time zones.

Her output is peer-reviewed papers, preprints, open materials, and open data — she works at the field's open-science frontier, not at its trailing edge. She has been doing this long enough to have specific opinions about what good tooling should let her do, and is increasingly impatient with tools that don't keep up.

*Extrapolated from the observation: assumes mid-career stage and a lab small enough that she still touches studies directly. Needs validation.*

## Goals

- **Life / career:** Build a body of replicable, influential work on misinformation. As her thinking evolves, expand into adjacent questions about influence and persuasion — she does not see herself as a single-topic researcher forever.
- **Work / project:** Ship the next study with confidence — pilot it cleanly, get peer feedback on the protocol, run it at scale, deposit data openly, and write it up.
- **Right now:** Set up a multi-condition online experiment that handles randomization properly, captures participant feedback, and exports clean, well-documented data she can analyze without manual cleanup.

## Frustrations

- **Clunky tooling that fights her.** Current platforms (Qualtrics primarily) feel dated and resist the patterns she needs. *Cost:* simple tasks take longer than they should; complex designs require workarounds. *Workaround:* manual setup or external scripts to bridge what the tool can't do.
- **Weak participant / user management.** Tracking participants across pilots, waves, and conditions is awkward inside the tool. *Cost:* errors creep in, so she over-checks. *Workaround:* a parallel spreadsheet she has to keep in sync.
- **Open-science workflow is bolted on, not built in.** Preregistration, materials sharing, replication-friendly exports happen *outside* the experiment platform. *Cost:* friction and risk of inconsistencies between the registered protocol and what actually ran.
- **No room for the computing power available to her.** She would do richer things — larger stimulus sets, adaptive designs, real-time analytic checks — but the tool caps what she can express. *Cost:* research questions get scoped down to what the tool allows, not up to what the science requires.
- **International collaboration is mostly email and file transfer.** Sharing access, co-editing protocols, peer-reviewing each other's work — none of it lives inside the experimental tool. *Cost:* collaboration is slower than it has to be; reviewers see static copies rather than live protocols.
- **Aesthetically tired.** The tool she uses is ugly. She has taste and notices. This is a credibility signal as much as a quality-of-life one.

## Behaviors and habits

- Reads new papers in her field continuously; uses them to spot new methods and possible new research directions.
- **Pilots before scaling** — never runs at full N without a small-N rehearsal first. This is a hard rule.
- Asks peers for feedback on protocols before launch. Expects them to push back on her methodology.
- **Defends methodology choices in writing** — and expects collaborators to do the same.
- Adopts open-science practices (preregistration, open materials, open data) consistent with her field's emerging standards.
- Open to exploring adjacent topics (e.g., from misinformation into broader questions of social influence) when the questions pull her there.

## Tools today

- **Qualtrics** — primary study-delivery platform. Workhorse but dated, clunky UI, limited for complex designs. *(Confirmed from observation.)*
- **Spreadsheets (likely Google Sheets)** for participant tracking and ad-hoc data wrangling. *(Common practice; needs confirmation.)*
- **R or Python** for analysis. *(Extrapolated from misinformation-research norms; needs confirmation.)*
- **OSF** for preregistration and open materials. *(Extrapolated from her open-science orientation; needs confirmation.)*
- **Email + video calls** for international collaboration. *(Extrapolated from "wants easy international collaboration"; needs confirmation.)*

## Quote

> "I want a modern tool that doesn't fight me. I should be spending my time on the science, not arguing with the platform."

*Paraphrased from the original observation — not a verbatim quote. Replace with a real quote the first time we interview an actual PI.*

## What this implies for the product

- **Modern, well-crafted UX is a credibility signal, not a nice-to-have.** This persona will reject anything that looks like "Qualtrics with a new coat." The visual and interaction quality of the editor is part of the value proposition.
- **First-class participant management.** Tracking participants across pilots, conditions, and waves must live in the tool, not in a parallel spreadsheet. This is core, not edge.
- **Open-science workflow as a built-in path.** Preregistration links, open-materials exports, replication-friendly metadata, OSF integration — designed as part of the standard flow, not as add-ons. Probably an ADR-level decision.
- **Built for international collaboration from day one.** Multi-user editing, role-based access for collaborators across institutions, shareable protocols with proper permissions. Multi-tenant model needs to handle cross-org collaboration cleanly.
- **Headroom for complex designs.** Do not cap what a researcher can express. Multi-condition, adaptive, computationally-rich protocols must be expressible — this is where the node-graph canvas earns its place over form-based config.
- **Pilot-friendly by default.** A clean small-N path with fast iteration, separate from production scale — not just a "make it big" flow.

## Open questions / what to validate

**Synthetic-pilot-tested, real-user untested.** After the original draft, this persona was further pressure-tested via the literature pass (researcher-tooling-pain-points insight) and a synthetic-pilot interview round that surfaced segmentation hypotheses (persona-segmentation-and-strategic-risks insight). The synthetic pilot is explicitly NOT field evidence; it's a hypothesis generator. Net: Maya remains the right anchor for the "academic PI in misinformation research" archetype, but three sibling personas — solo postdoc operator, multi-site coordinator, burned replicator — are likely needed to cover the segments the pilot surfaced. To upgrade Status from `in review` to `validated`:

- Run 2–3 semi-structured interviews with academic PIs in psychology (recommended mix: one misinformation researcher, one in an adjacent influence/persuasion area, one outside that subfield to test how much of this generalizes).
- Run a literature pass on researcher pain points with current experimental tooling — HCI papers on scientific software, lab-management research. Use the `literature-review-helper` skill.
- Validate or correct the "computing power" frustration — what *specifically* would she do if her tool didn't cap her? Adaptive sampling? Larger stimulus sets? Real-time analysis? The answer shapes what we build first.

**Specific assumptions to confirm:**

- Real tool stack beyond Qualtrics (R/Python/SPSS/JASP?).
- Funding stage and lab size — affects priorities around cost vs. capability.
- Whether OSF integration is a strong driver or a "would be nice."
- How she finds collaborators today — and whether our tool should help with that, or just support collaboration once it's started.
- Whether participant recruitment is in scope for her tool of choice (Prolific, MTurk, university subject pools — does she want this integrated?).
