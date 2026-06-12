# Literature note — The Replication Recipe and replication taxonomies

> **Honesty note:** summarized from the assistant's training knowledge of these widely-cited papers, not fetched fresh. The papers and their core claims are well-established; owner should spot-check before citing onward in any external document.

Citations:

1. Brandt, M. J., IJzerman, H., Dijksterhuis, A., Farach, F. J., Geller, J., Giner-Sorolla, R., Grange, J. A., Perugini, M., Spies, J. R., & van 't Veer, A. (2014). *The Replication Recipe: What makes for a convincing replication?* Journal of Experimental Social Psychology, 50, 217–224. doi:10.1016/j.jesp.2013.10.005
2. Nosek, B. A., & Errington, T. M. (2020). *What is replication?* PLoS Biology, 18(3), e3000691.
3. Zwaan, R. A., Etz, A., Lucas, R. E., & Donnellan, M. B. (2018). *Making replication mainstream.* Behavioral and Brain Sciences, 41, e120.
Status: summarized from training knowledge — verify before external citation. Relevance: grounds the replication-experience design (ADR-0039).

## Key claims used by our design

1. **The Replication Recipe (Brandt et al., 2014)** prescribes five ingredients for a convincing close replication, four of which are pre-data-collection documentation: (a) carefully defining the effect being replicated (the *target effect*, with the original's statistics), (b) following the original method as exactly as possible, (c) high statistical power for the original effect size, (d) complete details of the differences from the original AND why each exists, (e) evaluating the replication against pre-specified criteria. Their published checklist ("36 questions") is explicitly designed to be filled BEFORE running — i.e., it belongs in our Overview at replication-creation time, not post-hoc.
2. **Replication is a category with kinds, not a binary (Nosek & Errington, 2020; Zwaan et al., 2018):** the community distinguishes *direct/close* replications (same operationalization; deviations need justification) from *conceptual* replications (same theoretical claim, different operationalization — deviations are the point) and *extensions* (original + new conditions/measures). The legitimacy of a change depends on the declared kind — which is why our UI must ask the kind FIRST and judge divergence against it.
3. **Undocumented deviations are the credibility killer** (recurring across all three): reviewers don't penalize differences per se — they penalize differences that are unstated or unjustified. Per-change rationale captured at edit time is therefore worth more than a global notes field filled retrospectively.

## What we deliberately did NOT adopt

- Power-analysis calculators and pre-specified evaluation criteria (Recipe ingredients c+e) — real statistical tooling, out of scope for a builder; the injected Overview sections leave labeled slots for them instead.

## Sources

- The three citations above; see also the OSF "Replication Recipe" preregistration template that operationalizes Brandt et al. (2014).
