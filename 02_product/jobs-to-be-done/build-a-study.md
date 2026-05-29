# JTBD — Build a study

> **Status:** draft (2026-05-28). First JTBD in the workspace. Anchored on Hanna (postdoc operator), validated against Maya's review role. Synthetic-pilot evidence basis matching the persona set.

## The job, in one sentence

**When** I (postdoc / lab-operator researcher) need to take a research question my PI and I have agreed on and turn it into a study that can actually run with participants,
**I want to** assemble a draft that captures the experimental design accurately, validates against the conventions of my field, and saves in a state I can return to and a reviewer can comment on,
**so I can** spend my time on the study's intellectual content (stimuli, manipulations, measurement choices) instead of on tool plumbing, and so my PI's review is anchored to a specific snapshot we both can refer back to.

## Forces (Jobs-to-be-done framework)

**Pushing toward:**
- The research question is decided; momentum needs a place to land.
- Funding milestones / paper deadlines / conference submissions have a fixed clock.
- Replications and field conventions require specific measurement decisions (manipulation checks, demographics, attention checks) — they should be easy to get right.
- Open-science commitments (lab norms, journal requirements) mean the study needs to be preregistration-ready, not retrofitted.

**Pulling away:**
- Habit: Qualtrics works "well enough" and the muscle memory is already there.
- Risk of losing work to autosave failures, lost tabs, browser crashes — researcher horror stories.
- Tool fatigue: another platform means another login, another data-export format, another integration to figure out.
- Fear of lock-in: "what if I build everything here and then they change their pricing or sunset the product?"

## What "doing the job well" looks like

A finished draft is:

1. **Accurate** — the study captures the experimental design the researcher actually wants, including conditions, randomization, manipulation checks.
2. **Validated** — every block has a schema-passing configuration; missing required fields are visible, not hidden.
3. **Saved as a named version** — a specific snapshot exists that the reviewer can refer to and the researcher can return to.
4. **Reviewable** — a PI or collaborator can open the study and leave inline comments without setup friction.
5. **Preregistration-ready (eventually)** — every choice that would need to be locked at preregistration time (modules, themes, assets, randomization seeds) is captured in a way that can later be frozen, per ADR-0003 + ADR-0004.

## Current alternatives the researcher "hires" for this job

- **Qualtrics + a shared Google Doc with the study spec.** The Doc holds the intent; Qualtrics holds the implementation. Drift between them is a persistent problem.
- **PsychoPy + a GitHub repo.** Code-grade rigor but a high floor for collaborators who don't code. Hanna can use it; Maya struggles to review.
- **Otree + ad-hoc emails.** Same shape as PsychoPy but worse for review.
- **Pen-and-paper + a hand-built Qualtrics survey.** The fallback when everything else feels like too much overhead — common but lossy.

The wedge: this product targets the *first* category by collapsing "the spec" and "the implementation" into the same artifact, with version history that serves both. The bigger wedge is targeting research traditions (Frameworks) so the field-convention work is done once and shared.

## Outcomes the user is hoping for (measurable signal)

- Time from "we have decided on the question" to "draft is reviewable" — currently days; this product should make it hours for a Framework-backed study.
- Number of round-trips with the PI before a draft is preregistration-ready — currently 3-5; this product should make it 1-2 because the schema validates as you go.
- Reviewer confidence that the draft is "what we agreed to" — currently low (everyone's read different versions of the Doc); this product makes the named-version the single point of reference.

## Related flows

- [Hanna build a study](../user-flows/hanna-build-a-study.md) — the literal step sequence implementing this JTBD.
- (Future) Maya review a draft — the reviewer side, anchored on the named version.
- (Future) Preregister this study — the commitment moment.

## Sources

- Postdoc-operator persona (Hanna) — the synthetic-pilot evidence base.
- Principal-investigator persona (Maya) — the reviewer side of the same job.
- `01_research/insights/researcher-tooling-pain-points.md` — lit-evidence on tool fragmentation.
- Product brief §1-3 — positioning and wedge value the JTBD is meant to deliver.
- ADR-0001 (module composition) and ADR-0002 (versions + forking) — the architectural shape the "doing this job well" depends on.
