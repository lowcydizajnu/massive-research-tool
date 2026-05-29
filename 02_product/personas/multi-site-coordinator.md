# Persona — Dr. Marek Stein, Multi-site Coordinator

A persona is a memorable, evidence-grounded archetype that exists to make user decisions concrete. If you cannot point at the evidence behind a claim, do not include the claim.

- **Status:** in review
- **Evidence basis:** SYNTHETIC pilot only — `01_research/user-research/notes/2026-05-28-synthetic-pilot-interviews.md` (MS profile) + literature triangulation via `01_research/insights/researcher-tooling-pain-points.md` (the ManyLabs / PSA collaboration pattern is well-documented in the literature even if the specific person isn't). **No real interviews.** Revisit before V1 ships or before any consortium-facing feature lands.
- **Last validated:** 2026-05-28 (synthetic pilot only; not field-validated)
- **Related JTBDs:** …
- **Grounding insights:** [persona-segmentation-and-strategic-risks](../../01_research/insights/persona-segmentation-and-strategic-risks.md), [researcher-tooling-pain-points](../../01_research/insights/researcher-tooling-pain-points.md)

> **Naming + provenance note.** This persona is derived from the synthetic MS profile in the pilot. It is the persona with the **strongest unprompted willingness-to-pay signal** in the pilot (caveat: synthetic, so the WTP is fictional — treat the pattern as a hypothesis to validate). Architecturally, this is the persona that pulls the product toward consortium-operations rather than single-investigator authoring.

## Snapshot

Marek coordinates a multi-site research consortium — 63 labs across 19 countries — running ManyLabs / Psychological Science Accelerator-style distributed replications. He calls himself "the synchronization layer": the human glue that keeps the protocol, the version each site is running, ethics status per site, and the data schema all in sync. His scientific output is the answer to a meta-question ("does effect X replicate across cultures?"), but his daily job is governance, version control, and chasing 63 sets of paperwork. He is a single point of failure who takes holidays.

## Background and context

Marek is a research scientist on soft money, roughly seven years post-PhD. His home lab is small — a PI, himself, a couple of students — but his actual "team" is four people or four hundred depending how you count. He has been a coordinator for about five years. He builds the central instrument once, in jsPsych specifically because it's open and portable; he will not build the core artifact of his work in proprietary software he can't hand to 63 sites. This is a *hard adoption gate*: if our tool can't export to an open, portable format, he structurally cannot use it for the core experiment.

His worldview is dominated by the *seam*: every site is its own ethics process, its own coordinator, its own local equipment, its own translation drift. He doesn't think in terms of "users" — he thinks in terms of *sites*, and a site is a small organization in its own right. The unit of his world is one degree larger than everyone else's.

## Goals

- **Life / career:** Build a body of methodologically influential team-science work; secure stable funding for the consortium model itself, which is chronically underfunded.
- **Work / project:** Run the current consortium replication cleanly enough that the answer is interpretable as a real effect rather than 63 slightly-different implementations.
- **Right now:** Get site 40's ethics paperwork resolved, recover the two sites whose data hasn't uploaded, and reconcile a data dictionary mismatch before next week's authorship call.

## Frustrations

- **Version drift across sites.** A site forked the materials in March and never pulled the April fix. He caught it because the trial count was off. There's no automatic way to know which site is running which version. *Cost:* compromised data; days of forensics; eroded trust in the consortium's outputs.
- **No single source of truth.** "What version is site 40 running, and have they cleared ethics" lives in his head, three spreadsheets, and a Slack thread. He's the synchronization layer. When he's out, the consortium is partially blind. *Cost:* burnout; bus-factor; constant low-grade dread about the things he hasn't noticed yet.
- **No build-to-data attestation.** When sixty-three datasets arrive, he has no way to *prove* each one came from the exact build that was supposed to run. Sites attest verbally that they ran version 1.4; he takes them at their word until the data says otherwise. *Cost:* defensibility — the legitimacy of a multi-site replication rests on this, and right now it rests on trust.
- **Administrative duplication.** Three universities, three ethics processes, three data-sharing agreements, nothing talks. Translation in spreadsheets. Authorship in another spreadsheet. *Cost:* he spends more time on the scaffolding than the science.
- **Switching costs are combinatorial.** Migrating the consortium to a new platform isn't a switch; it's 63 switches, plus retraining 63 coordinators, plus re-validating that the new tool produces identical data. The bar for switching is "better enough to justify migrating an entire distributed organization." Very high.
- **Funding asymmetry.** A tool with per-seat pricing across 63 sites is dead on arrival unless someone central funds it. Consortia run on goodwill and soft money. Pricing structure can kill adoption before features matter.

## Behaviors and habits

- Works in jsPsych, OSF, Git, R — open, portable, scriptable. Anything else has to clear the "I can hand this to 63 sites" bar.
- Preregisters as load-bearing — almost entirely in Registered Reports and preregistered protocols. The prereg *is* the project.
- OSF is a working surface and a credibility instrument, used from day one. Not an end-of-line deposit.
- Status-tracking is his job: who's where, what version, what's blocked. Day-to-day work looks like project management more than science.
- Detection-oriented: he values *catching* things going wrong over preventing them, because at consortium scale prevention is impossible.

## Tools today

- **jsPsych** — central experiment instrument. Chosen specifically for openness and portability.
- **OSF** — registrations, public protocol, materials, code. Spine from day one.
- **Git** — protocol and materials in a working repo.
- **R** — validation, schema-checking, combining 63 datasets.
- **Slack** — the coordination surface that holds everything together. Also the single biggest reason he can't take a vacation.
- **Spreadsheets** — translation, site/authorship tracker, the things no other tool handles.
- **Wiki** — the consortium's running documentation.
- **Zoom + email** — across timezones, in volumes that would be illegal elsewhere.
- **Sixty-three institutional ethics portals** — involuntary; he doesn't get to choose.

## Quote

> "I am the synchronization layer. A single point of failure who takes holidays. If you build the attestation thing — proof of which build produced which dataset — I want to see it before anyone else. That's the piece I'd change my workflow for."

*Paraphrased from the synthetic MS pilot — not a real quote from a real user. The "I'd pay real money" line from the pilot is also fictional; treat the willingness-to-pay pattern as a hypothesis to test, not a market signal.*

## What this implies for the product

- **Build-to-data attestation is the spear-tip for the multi-site segment.** A guarantee that a given dataset came from a specific, known build — and that any site running a different version is flagged. This single capability speaks to all three of his core pains and is the one he attached unprompted willingness-to-pay to in the pilot.
- **Open + portable format is non-negotiable.** The "I won't build the core artifact in something proprietary I can't hand to 63 sites" rule is a hard adoption gate. Our export/portability story must be credible from day one. ADR-0001's `source/key@version` module identity and ADR-0002's snapshot model both point in the right direction; the user-facing export must complete the picture.
- **Sanctioned variant / governed deviation as a first-class concept.** Sites legitimately differ (population, equipment, language). His job is deciding whether a deviation is an acceptable documented variant or breaks the study. The tool should let him *represent* a sanctioned variant (an approved diff/fork with a documented reason), not force him to negotiate it in Slack and hope it sticks.
- **Status-tracking dashboard across sites.** Who's at what version, who's cleared ethics, who's blocked. This is the PM-for-science surface his job actually is. Our existing dashboard pattern (`00_meta/dashboard.html` for this project) is a tiny precedent; the real version is a much larger ask.
- **Capture the WHY, not just the WHAT, of version changes.** Six months later, "version 1.3 changed a timing parameter" is recoverable from git; *why* it changed often isn't. ADR-0004's `change_summary` field on preregistered amendments points the right direction; consider extending similar mandatory-rationale to module-version bumps in the future.
- **Pricing model matters as much as features.** Per-seat × 63 sites is DOA. Either central institutional funding, or consortium-tier flat pricing, or grant-funded. Worth its own pricing-strategy ADR before sales kicks in.
- **Marketing "richer authoring" actively repels this segment.** For him, richness multiplies the degrees of freedom that produce divergence across sites. He scopes *down* on purpose. Lead with stability, provenance, and operational control.

## Open questions / what to validate

**Synthetic-pilot evidence only.** The MS profile is informed by real consortium-model literature (Psychological Science Accelerator, ManyLabs) but the specific person and his quotes are fictional. Before any consortium-facing feature lands, run at least 2–3 real interviews with actual consortium coordinators or large-team-science PMs. Probe:

- Is build-to-data attestation actually the single capability he'd switch for, or is that the pilot oversimplifying?
- Is the "scoping DOWN for stability" preference real and consistent, or contextual?
- How real is the funding constraint? Where does central institutional funding actually come from for consortium tools today?
- Are there capabilities I haven't even considered because no single-investigator persona surfaces them? (Likely yes; coordinator-level concerns are systematically under-represented in published literature.)
- The MS pilot points to interviewing "down the hierarchy" — site PIs, data managers, someone who tried to *start* a consortium and failed. Those interviews would surface tensions a coordinator alone won't see (e.g., autonomy vs. central control).

**Revisit trigger:** before any consortium-facing feature ships, or before V1 — whichever comes first. Also worth a fresh validation pass if we decide pricing strategy needs to support multi-site distribution.
