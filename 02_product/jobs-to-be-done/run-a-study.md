# JTBD — Run a study and collect responses

> **Status:** draft (2026-06-03). Second researcher JTBD. Anchored on Hanna (postdoc operator); the acting user in the implementing flow is the anonymous participant, but the *job* belongs to Hanna. Synthetic-pilot evidence basis matching the persona set.

## The job, in one sentence

**When** I (postdoc / lab-operator researcher) have a preregistered study and need real participants to take it so I have data to analyze,
**I want to** open recruitment, hand participants a link that runs my study exactly as I designed it (assigning each to a condition, recording every answer durably), and walk through it myself first to be sure it's right,
**so I can** collect clean, condition-labelled response data that matches my preregistered design — without writing runtime code, babysitting a server, or discovering on response #50 that question 3 was broken.

## Forces (Jobs-to-be-done framework)

**Pushing toward:**
- The study is preregistered; the clock to collect data before the paper/grant deadline is running.
- Recruitment platforms (Prolific, CloudResearch) charge per participant — a broken study wastes real money and a participant's goodwill.
- Random assignment and durable response capture are correctness requirements, not nice-to-haves; getting them subtly wrong invalidates the dataset.
- Open-science norms mean what participants actually saw must match the preregistered design exactly.

**Pulling away:**
- Qualtrics already runs studies "well enough" and the muscle memory exists.
- Fear of data loss: "what if a participant's browser crashes and I lose their answers?"
- Fear of silent breakage: "what if the link works for me but not for participants on mobile?"
- Another export format, another integration to reconcile with Prolific payment.

## What "doing the job well" looks like

A study that runs well means:

1. **Previewable** — the researcher can walk the exact participant experience before sharing the link, collecting no data (Preview mode, ADR-0013).
2. **One-link recruitment** — opening recruitment yields a single URL the researcher pastes into Prolific/CloudResearch (provider integration is V1.6; V1.5 is copy-paste).
3. **Correct assignment** — each participant is assigned to exactly one condition by weighted random, recorded once, immutable on resume (ADR-0014).
4. **Durable capture** — every answer is persisted server-side the moment it's given; a crashed browser never loses prior answers (server-rendered MPA, ADR-0013).
5. **Faithful to the preregistration** — participants take the *preregistered* version, not the still-editable draft.
6. **Honest completion** — a participant who finishes sees a clear end screen; partials are distinguishable from completes in the data.

## Current alternatives the researcher "hires" for this job

- **Qualtrics / SurveyMonkey anonymous link.** The dominant alternative; multi-page, per-question, condition randomization built in. The wedge isn't "run a survey better" — it's that the run is the *same artifact* as the preregistered design, so there's no drift between "what I preregistered" and "what participants saw."
- **PsychoPy/jsPsych hosted on Pavlovia.** High fidelity, code-grade — but a high floor and a separate hosting concern.
- **A hand-built web app.** Maximum control, maximum maintenance; nobody wants to own a server for one study.

## Outcomes the user is hoping for (measurable signal)

- Time from "preregistered" to "first real response collected" — should be minutes (preview, open recruitment, paste link), not a day of survey re-implementation.
- Zero lost partial responses — every answer given is persisted.
- Zero assignment errors — condition counts match the intended allocation within sampling noise.
- Confidence that preview == production — the researcher saw exactly what participants see.

## Related flows

- [Participant takes a study](../user-flows/participant-take-a-study.md) — the literal step sequence (the participant is the actor; this job is Hanna's).
- [Hanna build a study](../user-flows/hanna-build-a-study.md) — the upstream job that produces the design this one runs.
- (Future) Hanna reads results — the analysis side of the same job (V1.5 step 6).

## Sources

- Postdoc-operator persona (Hanna) — the synthetic-pilot evidence base.
- `01_research/insights/researcher-tooling-pain-points.md` — tool fragmentation + data-loss horror stories.
- ADR-0013 (participant runtime architecture) — the MPA/preview decisions this job depends on.
- ADR-0014 (response data model + conditioning) — assignment + durable capture.
- ADR-0005 (OSF integration) — the preregistered version this run serves.
- Product brief §2 (open-science workflow) — the wedge of design==run being one artifact.
