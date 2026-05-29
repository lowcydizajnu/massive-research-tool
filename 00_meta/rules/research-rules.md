# Research rules

The science layer is what distinguishes this tool from generic SaaS. These rules keep the research rigorous and the product honest.

## Principles

**Evidence has gradients.** A meta-analysis of high-powered, preregistered, replicated studies is not the same as a single underpowered finding in a press release. Treat them differently. Cite the strength of evidence, not just the conclusion.

**Replication and effect size matter more than novelty.** A paradigm that has replicated across labs is worth more to us than a novel finding from one team. We are building infrastructure, not chasing headlines.

**WEIRD by default unless noted.** Most psychology is on Western, Educated, Industrialized, Rich, Democratic samples. Note when a finding has been replicated in broader samples and when it has not. The product should not assume one cultural baseline.

**Preregistration is good.** When we run our own studies (formative, evaluative), preregister hypotheses, sample, and analysis on OSF before collecting data.

**Open materials by default.** Stimuli, protocols, code, anonymized data — published with the experiments unless the IRB or participants forbid it.

## Process rules

1. **Every literature note** in `01_research/literature/` has: full citation, the paper's claim, the evidence strength, our use, and a link to the source.
2. **Every insight** in `01_research/insights/` cites at least two independent sources. Insights with one source are tagged `single-source` and used cautiously.
3. **Every research decision** in `01_research/decisions/` explains what we considered, what we chose, and what triggers a revisit.
4. **Protocols we adopt** in `01_research/protocols/` document exactly what we kept, what we changed, and why. Adapting a paradigm without recording the changes is a research-integrity problem.

## Working with the literature-review-helper skill

The `literature-review-helper` skill is the right starting point for any new research question. It builds a search strategy, gathers sources, and synthesizes a structured document. After it runs:

- Read the output critically. Do not accept the synthesis without sampling the underlying papers.
- Cross-check claims against Consensus or Google Scholar.
- Promote synthesized findings to `01_research/insights/` only after you have personally verified the cited papers say what the synthesis claims.

## Ethics

- Human-subjects research goes through an IRB or equivalent before participants are recruited.
- Informed consent is part of every participant flow; consent forms live in `01_research/protocols/`.
- Data minimization: we collect what the research question requires, not what is easy to capture.
- Right to withdraw is operationalized in the participant UI, not just promised in the consent form.

## What the research layer informs

| Research artifact                  | Downstream effect                                   |
| ---------------------------------- | --------------------------------------------------- |
| Insight in `01_research/insights/` | Persona or JTBD in `02_product/`                    |
| Protocol in `01_research/protocols/` | Experiment template in `05_app/`                  |
| Decision in `01_research/decisions/` | An ADR in `04_architecture/adrs/` or a design rule |
| Cognitive-load finding             | Design pattern (progressive disclosure, defaults)   |
| Measurement reliability finding    | A scoring algorithm or validation rule              |

When you add a research artifact, follow the link to its downstream effect and update that too. Insights that do not propagate are decorative.
