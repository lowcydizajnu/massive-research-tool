# Insight — Researcher pain points with current online experiment tooling

An insight is a finding distilled from literature, interviews, or both — packaged so that designers and architects can act on it. Every insight must cite its evidence and state what it implies for the product.

- **Status:** draft
- **Evidence basis:** Literature synthesis (20 Consensus searches, ~300 unique papers received, ~30 cited here). No interviews yet.
- **Confidence:** medium
- **Source materials:** Consensus searches conducted 2026-05-28 on researcher tooling, open-science adoption, replication infrastructure, social-media-stimuli platforms, recruiting platforms, and adjacent topics. URLs in Sources section.
- **Last updated:** 2026-05-28

## Headline

The published literature on academic researchers' experience with online experiment platforms is **heavily skewed toward data-quality validation studies** (does online match lab, do timing measurements degrade) and **platform-introduction papers** by tool authors themselves. Direct, evidence-based studies of researcher pain points and workflow friction are rare. What the literature *does* support: (1) **the tool ecosystem is fragmented** — no single platform serves all needs, and researchers routinely combine 3–5 tools (Karagüzel et al., 2025; Bridges et al., 2020); (2) **open-science practices are valued but poorly integrated** — preregistration adoption sits around 20–25% in psychology and most platforms treat OSF integration as bolt-on (Wiechert et al., 2024; Sarafoglou et al., 2022); (3) **the GitHub-for-research wedge has measurable demand but only fragmentary supply** — multiple academic tools have tried pieces of it (StudySwap, OSF, the Psychological Science Accelerator) and none integrate the experiment-authoring surface with the collaboration surface; (4) **misinformation research specifically has a distinct, under-served tooling need** for social-media-like artifacts (Butler et al., 2023; Jagayat et al., 2023). The PI persona's specific frustrations align well with the literature where the literature exists, but several of her stated frustrations are *under-studied in the published record* and need interview triangulation to nail down.

## Evidence

### What the literature confirms about the persona

**The tooling ecosystem is fragmented.** Researchers routinely combine multiple tools rather than working in one. The 2020 timing megastudy by Bridges et al. compared ten platforms (PsychoPy, E-Prime, NBS Presentation, Psychophysics Toolbox, OpenSesame, Expyriment, Gorilla, jsPsych, lab.js, Testable) and found that no single platform won across all features and conditions ([Bridges et al., 2020](https://consensus.app/papers/details/7fd122ae08e854cfb4fac3e90d3b79bd/?utm_source=claude_desktop)). The 2025 review by Karagüzel et al. confirms this picture five years later, recommending different platforms for different research contexts ([Karagüzel et al., 2025](https://consensus.app/papers/details/9271b151880957f69c90b1adae7c6654/?utm_source=claude_desktop)). Anwyl-Irvine et al. (2018), introducing Gorilla, explicitly frame their tool as a response to the problem that researchers without JavaScript skills could not build reliable online experiments ([Anwyl-Irvine et al., 2018](https://consensus.app/papers/details/e0428803d0965a3ab7e63b7290258632/?utm_source=claude_desktop)) — confirming that the "clunky, programming-required" pain is real and widespread.

**Open-science practices are valued but unevenly adopted.** Sarafoglou et al. (2022) surveyed 355 researchers and found preregistration is perceived as improving quality but adds work-related stress; researchers without prior preregistration experience were the most skeptical ([Sarafoglou et al., 2022](https://consensus.app/papers/details/35248b21646b5e619b0e23e5597af010/?utm_source=claude_desktop)). Wiechert et al. (2024) found that in false-memory research (a misinformation-adjacent field), publication accessibility reached 74% by 2023 but preregistration and analysis-script sharing lagged at 20–25% ([Wiechert et al., 2024](https://consensus.app/papers/details/2cc74c07f2895c8f9821dfc86073f626/?utm_source=claude_desktop)). Hardwicke et al. (2021) sampled 250 psychology papers from 2014–2017 and found similar low rates: 14% shared research materials, 2% shared raw data, 3% preregistered ([Hardwicke et al., 2021](https://consensus.app/papers/details/cc866a6a8a185e178ac623e31f359472/?utm_source=claude_desktop)). The persona's claim that she "works at the open-science frontier" is consistent with where the field is heading, but it puts her in the leading minority — most researchers are still further back.

**Pilot-before-scale is normal practice.** The literature on the replication crisis emphasizes the need for power analysis and pilot studies; tools like the simulation-based testing in jsPsych (de Leeuw et al., 2022) exist specifically to reduce the cost of pilot-style testing ([de Leeuw et al., 2022](https://consensus.app/papers/details/b9b14a6f8abe5c11a7a57ef9048380e7/?utm_source=claude_desktop)). The persona's "pilot before scaling — hard rule" framing matches a well-established methodological norm.

**Participant management is an under-tooled problem, especially across platforms.** The data-quality literature comparing recruitment platforms (Douglas et al., 2023; Peer et al., 2021; Chmielewski & Kucker, 2019) repeatedly emphasizes that researchers must manually screen and filter participants based on platform-specific signals ([Douglas et al., 2023](https://consensus.app/papers/details/d38b61965a6b51d4b36bb0d9f9f58277/?utm_source=claude_desktop); [Peer et al., 2021](https://consensus.app/papers/details/0f1cdaba398b58429a0c3a131c0b60d9/?utm_source=claude_desktop); [Chmielewski & Kucker, 2019](https://consensus.app/papers/details/e5db399c19db5735a51e282e6f0260ac/?utm_source=claude_desktop)). The persona's parallel-spreadsheet workaround for participant tracking is consistent with this gap — though *direct* evidence of the workaround pattern requires interviews.

**International collaboration is gaining infrastructure but it's outside the experiment tool.** The Psychological Science Accelerator (Moshontz et al., 2018) is the highest-profile distributed-collaboration network in psychology, with crowdsourced multi-site studies ([Moshontz et al., 2018](https://consensus.app/papers/details/968abcd465cc5b2093737dab8991ecc0/?utm_source=claude_desktop)). StudySwap (Chartier et al., 2018) is an OSF-hosted platform for exchanging research resources between labs ([Chartier et al., 2018](https://consensus.app/papers/details/8f15884dd79556c98ac0f322e11b2922/?utm_source=claude_desktop)). Both confirm demand for cross-institutional collaboration support; both are notably *separate from* the experiment-authoring tools. The persona's wish for collaboration "inside the tool" is therefore well-founded but currently unmet.

### What the literature challenges or qualifies

**"Modern UX as credibility signal."** No literature I found directly tests whether the visual polish of a research tool affects researchers' trust in it. The closest evidence is platform-comparison reviews that discuss "ease of use" as a factor in tool selection (Karagüzel et al., 2025; Stahl, 2006), but these treat usability as instrumental rather than as a credibility cue. The persona's claim — and my extrapolation of it — needs interview validation. **Confidence on this specific claim: low.**

**"No room for the computing power available to her."** This is plausible but unspecific in the persona. The literature suggests researchers do scope to what their tools can express — for example, adaptive designs are mostly studied in clinical-trial contexts (Angus et al., 2019) rather than psychology experiments, suggesting psych researchers may not even imagine such designs because their tools don't support them. But the specific frustration as articulated is *too vague* to be confirmed or refuted by literature. Interview question: "what specifically would you do if your tool didn't cap you?"

**Aesthetic frustration as widespread.** I found no published evidence either way. Likely under-studied because researchers don't write about aesthetic feelings in the methods literature. Interview is the right tool here.

### What the literature reveals that wasn't in the persona

**Misinformation research has emerging dedicated tooling.** The "(Mis)Information Game" (Butler et al., 2023) and similar social-media simulators (Jagayat et al., 2023 reviewing The Mock Social Media Website Tool and the Truman Platform) are open-source platforms specifically for misinformation research with customizable posts, sources, engagement information ([Butler et al., 2023](https://consensus.app/papers/details/aeee436b37b6518582082e1e74e3edd7/?utm_source=claude_desktop); [Jagayat et al., 2023](https://consensus.app/papers/details/5c3efcd8ed615090befcc9a6e0c57493/?utm_source=claude_desktop)). This is highly relevant for the persona and **strongly validates** the product brief's thematic-spaces idea — misinformation researchers are already adopting dedicated tools when they exist. **The wedge for our V1 launch theme is real.**

**The MTurk → Prolific shift is dramatic and recent.** Multiple high-quality studies (Douglas et al., 2023; Peer et al., 2021; Uittenhove et al., 2023) show MTurk data quality collapsed around 2018 and Prolific has become the dominant high-quality recruitment platform. Any recruiting-integration feature we build should default to Prolific. The persona didn't mention recruiting, but this is a hot-button issue we should be ready for.

**Version control for research is already happening — in pockets.** Multiple tutorials promote GitHub adoption for behavioral science workflows (Vuorre et al., 2017/2018; Gilroy & Kaplan, 2019; Chen et al., 2024) ([Vuorre et al., 2018](https://consensus.app/papers/details/527685377ec652a4bece2aa61be0e798/?utm_source=claude_desktop); [Chen et al., 2024](https://consensus.app/papers/details/b77bceca4aea56b8afd721202fcafa7a/?utm_source=claude_desktop)). This is direct evidence that researchers are *already* trying to graft Git-like workflows onto research, which is exactly the wedge the product is targeting — but the friction is high enough that adoption is limited to the most technically capable. **The "GitHub for research, but accessible" framing is even more justified than the persona alone would suggest.**

**Sustainability of scientific software is an existential question for the field.** The FAIR4RS principles (Barker et al., 2022) and ongoing work on research-software sustainability (Carver et al., 2022; Anzt et al., 2020) reveal that many research tools die after their grant runs out — researchers know this and factor it into adoption decisions ([Barker et al., 2022](https://consensus.app/papers/details/4b5a2ee0db885a218762152b110a2999/?utm_source=claude_desktop); [Carver et al., 2022](https://consensus.app/papers/details/4b50f9fce9ab5c78b0eb16b9ac3c3e08/?utm_source=claude_desktop)). For us, this means **commercial sustainability is itself a credibility signal to academic users** — a tool that looks like it won't disappear is more trustworthy.

## What this implies for the product

- **ADR-0001 (modular composition + theme overlays) is well-supported.** The misinformation-specific tooling (Butler et al., 2023; Jagayat et al., 2023) is exactly the kind of theme overlay the architecture was designed to support. This is a direct piece of validation.
- **ADR-0002 (forking model) is well-supported.** Existing tutorials promoting GitHub workflows for research confirm there is demand for version-control-style affordances; the friction in current tooling means many researchers don't access them. The simplest viable forking model is likely a substantial improvement on the status quo.
- **OSF integration is non-optional for V1.** Multiple papers establish OSF as the dominant open-science substrate for psychology. ADR-0004 (OSF integration) should be elevated in priority — it's not a "would be nice," it's a credibility floor.
- **Recruiting integration: default to Prolific.** If/when we integrate a recruiting platform (open question for V1 vs V2), Prolific has clear evidence-based dominance over MTurk for data quality.
- **"Sustainability story" is a marketing requirement.** Academic users will assess whether the tool is likely to survive. Open-source the application code (or at least the experiment-definition schema) and publish a sustainability commitment.
- **First-class social-media-post artifacts are essential for the misinformation launch theme.** Not nice-to-have. The existing dedicated tools (Misinformation Game, Truman Platform) are the competitive baseline we need to match or exceed.
- **Don't try to compete with the timing-precision research.** Bridges et al. (2020) and Anwyl-Irvine et al. (2020) set the benchmarks; we should adopt their methodology, document our timing performance honestly, and not market the product on millisecond precision alone (that game is already won by Gorilla and PsychoPy).

## Companion insight

See also: [persona-segmentation-and-strategic-risks](persona-segmentation-and-strategic-risks.md) — a synthetic-pilot insight that complicates several conclusions here. In particular, the "modern UX as credibility signal" claim and the "richer authoring is broadly desired" framing both fragment by segment; two of three synthetic personas reject them. The supply-side incentive problem (why would authors share?) surfaces there but not here, because the literature is largely silent on it.

## What this insight does NOT tell us

The literature is *thin* on direct researcher experience with current tools. To lift this insight from `medium` to `high` confidence, the team should:

- Run the interview guide (`01_research/user-research/pi-interview-guide.md`) on 2–3 academic PIs. The interview is specifically structured to probe the gaps where literature is silent (aesthetic frustration, specifics of the "computing power" wish, real tool stacks beyond what they cite in papers, real participant-management workarounds).
- Triangulate the OSF-integration claim by checking whether the *target* persona's subfield (misinformation) actually adopts OSF at the rates the cross-field data suggests.
- Spot-check whether researchers ever consider building their own tools when existing ones fail them — this would be a strong adoption-resistance signal.
- Validate the "modern UX matters" claim, which is the weakest link in both the persona and this synthesis.

## Sources

**Core platform / tooling reviews** (start here)

- [Karagüzel et al. (2025) — Software Solutions for Web-Based Experiments: A Comprehensive Review](https://consensus.app/papers/details/9271b151880957f69c90b1adae7c6654/?utm_source=claude_desktop) — Most recent comprehensive review; 2025.
- [Bridges et al. (2020) — The timing mega-study](https://consensus.app/papers/details/7fd122ae08e854cfb4fac3e90d3b79bd/?utm_source=claude_desktop) — 500 citations; benchmark study comparing 10 platforms.
- [Anwyl-Irvine et al. (2018) — Gorilla in our midst](https://consensus.app/papers/details/e0428803d0965a3ab7e63b7290258632/?utm_source=claude_desktop) — 1507 citations; introduces Gorilla, articulates the no-code online-experiment problem.
- [Peirce et al. (2019) — PsychoPy2](https://consensus.app/papers/details/6bf3127b88495139960fcaa21c004c06/?utm_source=claude_desktop) — 4131 citations; the dominant open-source experiment platform.
- [de Leeuw et al. (2023) — jsPsych: open-source collaborative ecosystem](https://consensus.app/papers/details/7c66df03794252ababd4065a1764312d/?utm_source=claude_desktop) — Current state of jsPsych.

**Open science adoption in psychology**

- [Sarafoglou et al. (2022) — How preregistration affects the research workflow](https://consensus.app/papers/details/35248b21646b5e619b0e23e5597af010/?utm_source=claude_desktop) — Survey of 355 researchers; benefits outweigh challenges for those with experience.
- [Hardwicke et al. (2021) — Prevalence of transparency-related practices in psychology](https://consensus.app/papers/details/cc866a6a8a185e178ac623e31f359472/?utm_source=claude_desktop) — Baseline prevalence study.
- [Wiechert et al. (2024) — Open science practices in false memory literature](https://consensus.app/papers/details/2cc74c07f2895c8f9821dfc86073f626/?utm_source=claude_desktop) — Detail on a misinformation-adjacent subfield.
- [Spitzer et al. (2023) — Attitudes and experiences regarding preregistration](https://consensus.app/papers/details/3510a77e1ca75155a92a55327a8f2c3c/?utm_source=claude_desktop) — Mixed-methods survey of psychology researchers.
- [Silverstein et al. (2024) — Open research practices in UK/Ireland psychology departments](https://consensus.app/papers/details/043e1bcd3b165e678e14b4b03f0188e1/?utm_source=claude_desktop) — 602-researcher survey; institutional support matters.
- [Open Science Collaboration / Aarts et al. (2015) — Estimating reproducibility of psychological science](https://consensus.app/papers/details/8028c3ab4c2a5fcd903595b9b78292e9/?utm_source=claude_desktop) — 7018 citations; the foundational replication-crisis study.

**Misinformation research tooling** (highly relevant for V1 launch theme)

- [Butler et al. (2023) — The (Mis)Information Game: A social media simulator](https://consensus.app/papers/details/aeee436b37b6518582082e1e74e3edd7/?utm_source=claude_desktop) — Open-source customizable social-media simulator for misinformation research.
- [Jagayat et al. (2023) — A primer on open-source experimental social media simulation software](https://consensus.app/papers/details/5c3efcd8ed615090befcc9a6e0c57493/?utm_source=claude_desktop) — Reviews three SMSS tools; perspectives on the future.
- [Mosleh et al. (2021) — Field Experiments on Social Media](https://consensus.app/papers/details/97a80416934b53af867a98da987e6786/?utm_source=claude_desktop) — Reviews experimental approaches in misinformation research.
- [Pennycook et al. (2020) — Practical guide to doing behavioral research on fake news](https://consensus.app/papers/details/2e6b4dce1bcd5c14aad4324dd20b1c4d/?utm_source=claude_desktop) — Stimulus design guidance.

**Collaboration and recruitment**

- [Moshontz et al. (2018) — The Psychological Science Accelerator](https://consensus.app/papers/details/968abcd465cc5b2093737dab8991ecc0/?utm_source=claude_desktop) — Distributed collaboration network.
- [Chartier et al. (2018) — StudySwap: A Platform for Interlab Replication, Collaboration, and Resource Exchange](https://consensus.app/papers/details/8f15884dd79556c98ac0f322e11b2922/?utm_source=claude_desktop) — OSF-hosted resource exchange.
- [Douglas et al. (2023) — Data quality across MTurk, Prolific, CloudResearch, Qualtrics, and SONA](https://consensus.app/papers/details/d38b61965a6b51d4b36bb0d9f9f58277/?utm_source=claude_desktop) — 1167 citations; canonical multi-platform comparison.
- [Peer et al. (2021) — Data quality of platforms and panels for online behavioral research](https://consensus.app/papers/details/0f1cdaba398b58429a0c3a131c0b60d9/?utm_source=claude_desktop) — Prolific dominates for quality.
- [Chmielewski & Kucker (2019) — An MTurk Crisis?](https://consensus.app/papers/details/e5db399c19db5735a51e282e6f0260ac/?utm_source=claude_desktop) — Documents the 2018 MTurk quality collapse.

**Version control and "GitHub for research"**

- [Vuorre & Curley (2018) — Curating Research Assets: A Tutorial on Git](https://consensus.app/papers/details/527685377ec652a4bece2aa61be0e798/?utm_source=claude_desktop) — Aimed at behavioral scientists with no Git background.
- [Chen et al. (2024) — GitHub is an effective platform for collaborative and reproducible laboratory research](https://consensus.app/papers/details/b77bceca4aea56b8afd721202fcafa7a/?utm_source=claude_desktop) — Direct evidence of demand for Git-in-research workflows.
- [Bryan (2018) — Excuse Me, Do You Have a Moment to Talk About Version Control?](https://consensus.app/papers/details/79104f4b1e785b1f9c206a9eda119ae6/?utm_source=claude_desktop) — Influential pitch for Git in statistical workflows.
- [Soderberg (2018) — Using OSF to Share Data: A Step-by-Step Guide](https://consensus.app/papers/details/b6bc6581ff8b5af9951ce5434f0072a3/?utm_source=claude_desktop) — Establishes OSF as a research-asset platform.

**Research software sustainability**

- [Barker et al. (2022) — FAIR Principles for Research Software](https://consensus.app/papers/details/4b5a2ee0db885a218762152b110a2999/?utm_source=claude_desktop) — 376 citations; FAIR4RS principles.
- [Carver et al. (2022) — Survey of the state of practice for research software in the US](https://consensus.app/papers/details/4b50f9fce9ab5c78b0eb16b9ac3c3e08/?utm_source=claude_desktop) — 1149 researcher survey; sustainability and credit are the main concerns.

**Supporting / context** (not core but useful)

- [de Leeuw et al. (2022) — Simulating behavior to help researchers build experiments](https://consensus.app/papers/details/b9b14a6f8abe5c11a7a57ef9048380e7/?utm_source=claude_desktop) — Automated testing approach for experiments.
- [Rodd (2024) — Moving experimental psychology online: how to obtain high quality data](https://consensus.app/papers/details/804e9fb1da2854038d77f07de4178047/?utm_source=claude_desktop) — Practical-checklist paper.
- [Henninger et al. (2019) — lab.js: A free, open, online study builder](https://consensus.app/papers/details/300983b283085477a37cf65986110f64/?utm_source=claude_desktop) — Visual interface, open-source.
- [Anwyl-Irvine et al. (2020) — Realistic precision and accuracy of online experiment platforms](https://consensus.app/papers/details/a95f214841b35f378b22c8730bba65de/?utm_source=claude_desktop) — Empirical benchmarks across platforms.

---

*Generated 2026-05-28 from 20 Consensus searches (~300 unique papers received, 29 cited here). The full search audit log is preserved in the chat transcript that produced this insight. A formatted Word-doc version of this synthesis is available on request via the `literature-review-helper` skill's Phase 4 output.*
