# Product brief — vision + first decisions

> **Status:** vision + first decisions (2026-05-27). Several clarifying questions answered; key positioning and scope calls made.
> **Captured from:** project owner + others mentioned by the owner.
> **Date:** 2026-05-27.
> **Next:** decompose into JTBDs and write ADR-0001 (modular composition / theme overlays — now the load-bearing decision).

## How to read this

This document captures the product vision as articulated, organized into themes, with a scope analysis and a list of architectural decisions it now forces. **The "Key decisions" section below records what's been resolved.** Themes annotated `[DECIDED]` reflect those resolutions.

It is not a roadmap. Roadmaps need validation; this is the input to that. Treat any feature not covered by a decision as a hypothesis until a JTBD, an insight, or an interview backs it up.

If you are about to act on something here, ask: which JTBD does it serve, and what's the evidence?

---

## Key decisions (resolved 2026-05-27)

### 1. Positioning: Qualtrics + GitHub for research

**The product is the combination, not either alone.** The wedge: deliver what Qualtrics does today, with the transparency and replication mechanics of an open repository, at comparable feasibility. Transparency + replication + feasibility — simultaneously — is the value proposition that doesn't exist on the market today.

Implications:

- We are not just a survey tool; the GitHub-style affordances (sharing, forking, attribution, version history) are core, not nice-to-have.
- We are not just OSF either; the experiment-authoring surface is core.
- Every feature is evaluated against: does this strengthen the wedge?

### 2. AI: V1 architecture-ready, V2+ feature-bearing

V1 ships **without** AI features in the user-facing surface. The V1 *architecture* must include plug-in surfaces where AI lands later:

- Authoring assistance (suggestions while building a survey or protocol)
- Article ingestion (extract procedure + materials from uploaded papers)
- Conversational survey rendering (chatbot mode, V2)
- Analysis assist (descriptive interpretations on the dashboard, V2)
- Methodology critique (sanity checks before launch)

ADR needed: AI plug-in architecture (where prompts compose, where they run, evaluation strategy, cost model).

### 3. Chatbot surveys: V2

Conversational rendering of the same underlying protocol — not a separate product surface. Architectural readiness in V1, ship in V2.

### 4. Curation model: human, indefinitely

Project owner is curator at MVP. Curation remains human ("verified" badges, framework approval, theme presets) long-term. Not crowdsourced. Simpler trust model, slower scaling — fine for the audience we're targeting.

### 5. Statistics: narrow + a dashboard slice

**Inside the tool:**

- G\*Power-style sample-size calculator (design phase)
- Manipulation-check sanity stats (validation phase)
- Quick descriptive analytics on a summary / preview / dashboard (operational phase) — fast, glanceable, not a replacement for full analysis

**Outside the tool:** clean export to R / Python / JASP / SPSS for everything else. The "Claude built it for me in minutes" reference (project owner to share link) is the calibration point for what "quick analysis" means concretely.

### 6. Thematic spaces = composable overlays, not separate products

**There is one underlying everything-space.** Themes are presets and addon bundles that compose modules into a tailored UX. Users start from the default (everything), pick a preset theme (e.g., Misinformation — which surfaces social-post artifacts + sample-size helpers + relevant framework library), or build their own custom space from modules.

This is the **biggest architectural simplification** in the brief. We do not build N specialized products; we build one modular composition system + a configuration layer. The node-graph substrate in STACK.md is the right home for module composition.

ADR needed: module / composition model and theme overlay system. **This is now the highest-leverage early ADR — likely ADR-0001.**

### 7. AI synthesis of papers: extraction, not generation

Refined scope: user uploads an article → AI extracts the **procedure description** + **attached materials / references** into a structured starting point the researcher builds upon (or shares with collaborators). Not a fully executable protocol.

This is achievable with current LLM capabilities + careful prompting + human review. Variability risk on poorly-structured papers — UX must frame output as "draft, please verify" not "ready to run." V2 feature.

### 8. Wedge value is segment-dependent — lead with provenance, not authoring richness

*Added 2026-05-28 from `01_research/insights/persona-segmentation-and-strategic-risks.md` (synthetic-pilot evidence, low confidence — revisit when real interviews available).*

> **Important framing (project owner directive, 2026-05-28):** This section is about **narrative emphasis and marketing surface**, NOT about reducing scope, modularity, or functionality. The committed product vision — modular composition (ADR-0001), forking (ADR-0002), asset storage (ADR-0003), preregistration + amendments (ADR-0004), AI-architecture-ready, thematic spaces, complex flows, multi-tenant cross-org collaboration — stands. Synthetic personas can point at where to *emphasize* differently across segments; they cannot justify *removing* capabilities the owner has committed to. Future contributors: do not cite synthetic-persona findings as reasons to trim scope.

The synthetic-pilot interview pass surfaced that the wedge means different things to different segments:

- **Solo investigators** (e.g., postdoc operators like [Hanna Kowalczyk](personas/postdoc-operator.md)) want integrated authoring + preregistration in one tool. They tolerate richness; they want fewer surfaces to copy designs between.
- **Multi-site coordinators** ([Marek Stein](personas/multi-site-coordinator.md)) want operational control — distribution, version control, build-to-data attestation. They actively *reject* richness because every degree of freedom multiplies divergence across sites.
- **Burned replicators** ([Sofia Marsh](personas/burned-replicator.md)) want reproducibility above everything. They scope down post-saga; richness reads as un-reproducibility risk.

**Implication for marketing and product narrative:** lead with **provenance and reproducibility**, not authoring breadth. The "GitHub" side of the wedge resonates with two of three segments; the "Qualtrics" side only with one. The architecture (ADR-0001/0002/0003/0004) is well-aligned with the provenance framing; what needs to shift is the user-facing copy. The PI persona ([Maya](personas/principal-investigator.md)) is silent on this — she's the *approver* of tool adoption but probably not the daily operator, and the daily operators across these three sibling personas have different priorities.

### 9. Supply-side incentive problem — the biggest non-technical risk

*Added 2026-05-28 from the segmentation insight. Surfaced independently by two of three synthetic personas.*

Two of three synthetic personas (the multi-site coordinator and the burned replicator) independently named the same risk, unprompted: **original authors often have rational reasons NOT to share their studies in a way that makes them easy to scrutinize.** As the synthetic burned replicator framed it, the tool is "a gift to replicators, a perceived weapon to the originals whose cooperation you need."

No tool feature alone fixes this. It is the hypothesis most likely to kill the wedge as currently framed. Constructive directions surfaced in the pilot:

- **Default virtue.** Make good documentation the byproduct of building (not an additional step). This routes around the missing incentive for new studies, though it does nothing for the existing back catalogue.
- **Mandatory-sharing leverage.** Journals and funders that *require* runnable shares are the only entities with leverage to flip voluntary virtue into structural supply.
- **Demand-first market entry.** Build for the people who already want to share (replicators, consortia) and let supply follow. Risky, but consistent with the segments most enthusiastic about the wedge.

**This deserves its own strategic ADR before V1 ships** — call it ADR-0009 (supply-side strategy). Not blocking other architecture work, but blocking a confident go-to-market plan.

### 10. Trust signals are inverted across segments

*Added 2026-05-28 from the segmentation insight.*

The literature insight previously suggested "modern UX is a credibility signal" — sourced from a single observation. The synthetic pilot fragments this:

- Hanna (solo postdoc): polish → inferred maintenance → trust (the original claim).
- Marek (coordinator): polish → reliable ops → trust (different mechanism, same direction).
- Sofia (burned replicator): polish → SUSPICION → *distrust* ("what are they hiding").

A polished demo could backfire with the Sofia-type segment. The design implication isn't "be ugly" — it's **show your workings; don't hide them behind clean UI**. Inspectability is itself a design surface. The provenance primitives we've architected (versioned modules, immutable snapshots, asset freeze, change summaries) should be *visible affordances*, not just backend properties.

---

## The themes (faithful capture)

### 1. "GitHub for research"

- Researchers can **fork** another researcher's project for replication, when the original author allows.
- Repos for individual research projects.
- Repos for **frameworks** (reusable methodologies / protocols).
- Researchers can **share drafts and collect feedback** on surveys / protocols.
- Cross-organization collaboration with researchers anywhere in the world.

### 2. Open-science workflow built in

- **Preregistration** in-tool.
- Replication-friendly data export.
- Open materials / open data flows that match field norms (likely OSF integration).

### 3. Asset and material management

- Upload all assets: articles, stimuli, media.
- **Or** link to externally hosted materials to save disk space (TBD which is default).
- Material library tied to a project and reusable across projects.

### 4. Survey / experiment builder

- **Simple to complex conditional surveys** — branching, randomization, multi-block.
- Survey items can be: standard questions, custom artifacts, video, embedded materials, **social media posts** with platform-accurate rendering, **chatbot conversations**.
- Surveys can themselves *be* chatbots (conversational data collection).
- Composable model (the node-graph from STACK.md earns its place here).

### 5. Thematic spaces (example: Misinformation)

- A "themed workspace" specializes the tool for a research area.
- Theme-specific item types — e.g., for misinformation: social media posts (Facebook/X/TikTok) with platform-accurate styling, customizable.
- Treated as a *kind of question* in the survey model.
- Theme-relevant **ready-made frameworks** the researcher can adopt.
- Theme-specific helpers — e.g., **G\*Power-style sample-size calculator** in the misinformation space.

### 6. Framework library

- A library of reusable research frameworks (designs / protocols).
- Frameworks created by the project owner, by scholars, and by users.
- **"Verified" badge** when the framework's author has a published article using it.
- **AI-assisted framework synthesis:** user uploads a research article → the tool synthesizes the procedure → produces a draft research flow + form, indicating what was clear in the document and what was ambiguous.

### 7. Workspaces and organization

- Each user organizes their own workspaces.
- Multi-project, multi-tenant, cross-collaborative.

### 8. Statistics and analysis

- Built-in calculators: t-tests, ANOVA, etc.
- Power / sample-size calculator (G\*Power-style — see theme 5).
- "Put replications in focus, collect data in one place, make them meaningful and manageable."

### 9. Qualitative research support

- **Interviews** as a first-class research type alongside surveys.
- Tool supports both qualitative and quantitative work.

### 10. Integrations

- **Recruiting platforms:** easy integration (Prolific, MTurk, university subject pools).
- **External research tooling:** Microsoft Clarity (session replay / heatmaps), WebGazer (in-browser eye tracking), others — integrated or embedded.
- **MCP offering:** we expose an MCP server so other AI tools can interact with research data and the platform.

### 11. AI features

- "Online" AI — interactive assistance during authoring, analysis, etc.
- **"Offline" AI** — predefined LLM-powered automations / pipelines (clarification needed: do you mean local models, or server-side automations that don't require user prompting per call?).
- AI-assisted protocol synthesis from uploaded papers (also in theme 6).

### 12. Dashboards and data viz

- **User-customizable dashboards** — researchers compose their own views.

---

## First-pass scope analysis

A rough sort of where each theme lands on the **build-effort vs. MVP-fit** axis. These numbers are vibes, not estimates — they exist to force the trade-off conversation.

| Theme | MVP-fit | Complexity | Notes |
| --- | --- | --- | --- |
| Survey / experiment builder | **Core** | High | The product. Node-graph composition (STACK.md) was already the right call. |
| Modular composition + theme overlays | **Core** | High | **[DECIDED]** One everything-space, themes as preset bundles. This is now ADR-0001. |
| Workspaces & multi-tenancy | **Core** | Medium | Required from day one. Path A vs B decision in STACK.md. |
| Asset / material upload | **Core** | Low-Medium | S3-style storage. Asset-vs-link default → ADR. |
| Share drafts, collect feedback | **Core** | Medium | Multi-user with permissions. Tied to multi-tenancy. |
| "GitHub for research" affordances (share, fork, history, attribution) | **Core (per positioning)** | High | **[DECIDED]** Core to the wedge, not deferred. Forking model itself can stage (start: copy-and-fresh-fork; later: branch-with-merge-back). ADR for the forking model. |
| Open-science (preregistration + export) | V1+ | Medium | OSF integration is the load-bearing sub-decision — ADR. |
| Misinformation theme as launch preset | V1 | Medium | **[DECIDED]** A *preset* on the modular core, not a separate product. Surfaces social-post artifacts, sample-size helper, relevant framework library. |
| Framework library (curator-only, no badges yet) | V1-V2 | Medium | **[DECIDED]** Curation + tagging + browsing. Project owner curates. Verification badge is a later UX, same model. |
| Sample-size / G\*Power-like calculator | V1 | Medium | **[DECIDED]** In scope for the MVP design phase. |
| Manipulation-check stats | V1 | Low-Medium | **[DECIDED]** Narrow, in scope. |
| Quick descriptive analytics on dashboard | V1-V2 | Medium | **[DECIDED]** Calibrate against the project owner's prior Claude-built example (link pending). |
| AI plug-in surfaces (architecture-only) | V1 | Medium | **[DECIDED]** No AI features in V1, but the architecture must accommodate them as plug-in surfaces. Authoring, ingestion, conversational, analysis, methodology-critique. ADR. |
| AI: article → procedure + materials extraction | V2 | Medium-High | **[DECIDED, narrower scope]** Extract starting point, not generate full protocol. Reasonable with current LLMs + human review. |
| AI: authoring assist (suggestions, validation) | V2 | Medium | Plug into the authoring surface. |
| Chatbot-style surveys | V2 | Medium-High | **[DECIDED]** Conversational rendering of same protocol model. |
| Customizable dashboards | V2 | Medium | Needs the rest of the data layer to dashboard against. |
| Verified-framework badges (curator-applied) | V2 | Low-Medium | **[DECIDED]** Curator applies the badge; trust model is "the project owner stands behind it." |
| Recruiting-platform integrations | Phased | Medium per integration | Each integration is its own ADR. Start with one (probably Prolific). |
| Clarity / WebGazer / external embeds | Phased | Variable | Each is a separate technical decision. Don't try them all at once. |
| MCP offering (we're an MCP server) | V2+ | Medium | Strategic differentiator. Worth its own ADR. |
| Qualitative / interview research | V3 | High | Different data model, different workflow. Possibly a separate product surface. |
| Full inline statistics (t-tests, ANOVA, …) | Out of scope | n/a | **[DECIDED]** Export to R/JASP/SPSS for everything beyond the V1 narrow slice. Revisit only if a JTBD forces it. |

---

## What this implies for architecture (early signals)

Several decisions are now under pressure to be made early, because postponing them is more expensive than getting them slightly wrong:

- **Multi-tenant + cross-org collaboration is structural, not optional.** Forking and sharing across orgs cannot be retrofitted; the tenancy model must accommodate it from the start. The Clerk-vs-Auth.js+RLS choice in STACK.md now has a clear right answer leaning: whatever supports cross-org collaboration cleanly is preferable.
- **Theme spaces imply an extensibility model.** Custom question types (social media posts), theme-specific helpers (sample-size calc) need to plug in. This is a plugin / extension decision worth an ADR before the misinformation theme ships.
- **Node-graph composition is the right substrate.** Survey items, media, social posts, chatbot flows are all "things connected in some order" — exactly what React Flow gives us.
- **Asset storage strategy** (in-platform vs link-out vs hybrid) needs an ADR. Trade-offs: storage cost vs. link rot vs. integrity for replication vs. user control.
- **Open-science integration** (OSF specifically) is a load-bearing architectural choice — affects the data model, export formats, and how preregistration is represented.
- **MCP-as-product** changes the API design. If we expose ourselves as an MCP server, our tRPC contract effectively becomes a public contract.
- **AI architecture** ("online" vs "offline") needs an ADR before AI features land. Where do prompts get composed, where do they run, who pays for compute, how do we evaluate quality.

---

## Strategic positioning (status)

- **Better-Qualtrics vs. GitHub-for-research?** **Resolved 2026-05-27** — the combination is the wedge (see Key Decisions §1).
- **Who pays?** Open. Worth deciding when first JTBDs are in place.
- **Open-source or proprietary?** Open. Tied to "who pays."
- **Compete or complement OSF?** Open. The decision shape: OSF integration as a first-class flow is the most likely answer, since the wedge is "Qualtrics + GitHub for research" and OSF already owns part of the preregistration / open-data territory.

---

## Pushback log (with resolutions)

Per the project's "push back when warranted" rule. Each entry now annotated with what was resolved on 2026-05-27.

- **Built-in statistics is a trap.** Reproducing SPSS / JASP / R / Jamovi is a multi-year product. — **Resolved:** narrow scope (sample-size, manipulation-check, quick descriptive dashboard analytics). Export to dedicated tools for everything else.
- **AI synthesis of articles into protocols is a multi-quarter research project.** — **Partially retracted:** generating a *fully executable protocol* from a paper is the hard problem. *Extracting* the procedure description + materials links into a structured starting point is much narrower and achievable with current LLMs + careful prompting + human review. V2 feature. UX must frame outputs as drafts, not ready-to-run.
- **"Verified" badges require an institutional-trust model.** — **Resolved:** curator-only, indefinitely. Project owner stands behind the badge. Simpler than crowdsourced verification.
- **Thematic spaces could fragment the product.** — **Resolved in the opposite direction.** Themes are *overlays* on one underlying everything-space, not separate products. This makes the modular composition model the single most important early architectural decision (ADR-0001).
- **"Easy integration with recruiting platforms"** is harder than it sounds. — **Still applies.** Stage per platform; start with one (likely Prolific); design the participant-handoff UX carefully.
- **"We should also offer MCP"** is strategically interesting but doesn't move the V1 needle. — **Still applies.** Park as a V2 ADR.

---

## Clarifying questions and answers

Captured 2026-05-27 in conversation:

- **"Offline AI"** — still open. Originally asked: local-only browser/machine models vs. predefined server-side automations? Defer until V2 AI work begins; the V1 architecture should leave room for either.
- **"Easy integration with recruiting platforms"** — open. Re-raise when the first JTBD requiring recruitment lands.
- **Chatbot surveys** → conversational rendering of the same underlying protocol. **Resolved.**
- **Forking model scope** — start small (copy-and-fresh-fork) so the wedge is shippable; design the data model so branch-with-merge-back can layer on later. **ADR needed.**
- **Curation** → human curator (project owner), indefinitely. **Resolved.**
- **"Quick analysis" calibration** → project owner to share link to a prior Claude-built analysis Claude can examine, so the V1 dashboard analytics scope is concrete.

---

## Decomposition plan (what becomes which artifact)

Recommended next batch of work, in priority order:

### A. JTBDs to draft next (4–6, covering the MVP surface)

- *"Build a misinformation study using ready-made social-media-post artifacts."*
- *"Share a draft protocol with a co-author for review and incorporate their feedback."*
- *"Pilot a study with a small N, see the data flowing, then scale to full N."*
- *"Find a framework that someone else has validated and adapt it for my hypothesis."*
- *"Export my study's data and materials in a format that supports preregistration and open-data deposit."*
- *(optional)* *"Fork an existing study to attempt a replication and report the result."*

### B. ADRs to draft (before the build phase touches any of these)

In priority order based on what other decisions depend on each:

1. **ADR-0001 — Modular composition + theme overlay model.** [HIGHEST LEVERAGE] One everything-space, themes as preset bundles of modules. This is the load-bearing architectural decision the whole product rests on. Affects the data model, the editor, the runtime, the extension surface, and the AI plug-in seams.
2. **ADR-0002 — Forking model for research projects.** Start with copy-and-fresh-fork; design the data model so branch-with-merge-back can layer on later. Affects versioning, attribution, permissions.
3. **ADR-0003 — Asset storage strategy.** In-platform vs. link-out vs. hybrid. Affects replication integrity and storage cost.
4. **ADR-0004 — Open-science integration (OSF specifically).** Integrated, parallel, or redundant — and which parts. Affects the data model for preregistration and export.
5. **ADR-0005 — AI plug-in architecture.** Where prompts compose, where they run, evaluation strategy, cost/privacy model. Lands as architecture in V1, feeds V2+ features.
6. **ADR-0006 — Path A vs. Path B from STACK.md.** Hosting/auth/realtime/jobs. Less urgent than 1-5 since the application-code shape is the same; but pick before code lands.
7. **ADR-0007 — MCP exposure model** (deferred to V2 but on the list).

### C. Research questions for a literature pass

1. **How do researchers actually fork and replicate today?** Validates or refutes the GitHub-for-research framing.
2. **What's the state of the art in NLP-assisted protocol synthesis?** Sets expectations for the AI synthesis feature.
3. **What do researchers value in inline statistical tools vs exporting to dedicated tools?** Validates the built-in-stats pushback.
4. **What does "verified" mean to researchers?** Trust signals — author identity, peer review, replication count, citation count?
5. **What's the failure mode of online experiment platforms today?** Beyond Qualtrics-is-clunky — concrete pain points.

### D. Persona expansion

The Principal Investigator persona is the only one drafted. This brief implies at least four more personas worth drafting (against actual evidence, not invented):

- **Research Assistant / lab manager** — the day-to-day operator. Different needs than the PI.
- **Participant** — the hardest target. Their experience determines data quality.
- **External collaborator** — peer at another institution who needs scoped access.
- **Framework contributor** — scholar publishing reusable methodologies for the verified library.
