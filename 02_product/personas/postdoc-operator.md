# Persona — Dr. Hanna Kowalczyk, Postdoc Operator

A persona is a memorable, evidence-grounded archetype that exists to make user decisions concrete. If you cannot point at the evidence behind a claim, do not include the claim.

- **Status:** in review
- **Evidence basis:** SYNTHETIC pilot only — `01_research/user-research/notes/2026-05-28-synthetic-pilot-interviews.md` (HK profile) + literature triangulation via `01_research/insights/researcher-tooling-pain-points.md`. **No real interviews.** Real-user validation is parked due to access constraints; revisit before V1 ships or before any high-stakes design decision rests on this persona.
- **Last validated:** 2026-05-28 (synthetic pilot only; not field-validated)
- **Related JTBDs:** …
- **Grounding insights:** [persona-segmentation-and-strategic-risks](../../01_research/insights/persona-segmentation-and-strategic-risks.md), [researcher-tooling-pain-points](../../01_research/insights/researcher-tooling-pain-points.md)

> **Naming + provenance note.** This persona is derived from the synthetic HK profile in the pilot. The name is a placeholder; the profile is intentionally distinct from the Principal Investigator persona to capture the **daily operator** archetype — the postdoc/RA who actually clicks through the tool, distinct from the PI who delegates building. Future real-interview validation may produce a person with a very different shape; treat this as a hypothesis.

## Snapshot

Hanna is a third-year postdoc in social and cognitive psychology, working in a small lab — a PI, herself, one other postdoc, two PhD students, and a rotating cast of master's students. She is the **daily operator** of the experimental tooling: where the PI delegates building, Hanna actually builds. Her current work focuses on online credibility — what makes people believe a post is trustworthy. She runs studies in Qualtrics with custom JavaScript glued in, recruits on Prolific, analyzes in R, and preregisters when the work is confirmatory. She carries the scars of tooling that hides what it's doing.

## Background and context

Career-stage anxiety is a baseline condition: soft money, grant-funded, the "postdoc that won't end" risk visible on the horizon. The lab is informal — she corrected the word "lab" mid-sentence — which matters for how a tool gets adopted: if Hanna can't bring her PI and her one collaborator with her, switching is dead on arrival.

Her week is dominated by admin, mentoring, and review work; actual study-touching happens maybe one afternoon. The gap between "I run studies" (self-image) and "I touched the actual study Thursday afternoon" (reality) is large and worth designing for: the tool needs to support fragmented attention and short windows.

She is the person whose name is attached to the next study, not the senior author. She owns the build but not necessarily the science direction. She is the user we will lose first if the tool wastes her time.

## Goals

- **Life / career:** Land a faculty position or a research-track role that survives the soft-money gauntlet. Build a citable body of work that shows methodological sophistication and reliability.
- **Work / project:** Ship the current study cleanly, get the paper out, and free up time for the more ambitious next study she's been thinking about but hasn't had time to start.
- **Right now:** Build a four-condition online study with matched stimuli, randomization she can verify *before* launch, and a clean data export that doesn't take longer to wrangle than to collect.

## Frustrations

- **Silent randomization breaks.** She lost a day once to a study where randomization quietly malfunctioned and a quarter of participants saw the wrong condition. *Cost:* lost data, lost trust in the tool, an ongoing background dread. *Workaround:* she now hand-tests every arm before launch, which doesn't actually prove anything except that her hand-tested click path works.
- **"Copying my design from one box to another."** The same study has to be described in Qualtrics, then again in the OSF preregistration form, then again in the manuscript. The boxes don't talk. *Cost:* time, drift, the risk that what was preregistered isn't quite what ran.
- **Horrible data exports.** Qualtrics gives her a wide CSV with columns like `Q14_3_TEXT` — she reverse-engineers her own study from column names. *Cost:* hours per analysis; bugs that hide in misinterpreted columns.
- **Custom-code fragility.** When Qualtrics needs a custom JavaScript hack to do what she actually wants (a fake engagement counter, a non-standard randomization rule), she copies code from past studies and Stack Overflow and "frankenstein"s it. *Cost:* hidden bugs, can't share cleanly, every reuse is another point of fragility.
- **Switching costs are social, not technical.** She tried Gorilla once. It was better in several ways. She went back because the license was a problem on a tight grant *and* her collaborator didn't know it — she'd have been the only person who could touch the study. *Implication:* a tool wins a group, not a person.
- **Aspirational open-science vs. lived practice.** Officially she preregisters always. In practice, exploratory work often goes unregistered; the prereg sometimes goes up after collection has started. She is not proud of this and won't admit it freely; it's the kind of thing she said once during the pilot and might not say again.

## Behaviors and habits

- Hand-tests every condition before launch (because once burned).
- Reads new tools but the adoption is "in theory" — she has a Git repo for the lab; it's not well kept.
- Pragmatic about OSF: a place where things go to become public at the end, not where she works. Day to day is her laptop and a shared drive.
- Files named `Analysis_v4_HK_final_FINAL.R`. She knows this is bad. The tooling does not give her a better option.
- Default-skeptical of new platforms — has heard "all-in-one platform" pitches before, and they're "always a toy or a walled garden you can't get your data out of."

## Tools today

- **Qualtrics** — main study delivery. Workhorse, frustrating.
- **JavaScript / HTML / CSS** — for anything Qualtrics can't do natively. Borrowed and frankensteined.
- **Prolific** — primary recruitment. "Just works."
- **R / tidyverse** — analysis.
- **OSF** — preregistrations and end-of-project materials drop. Not a working surface.
- **G\*Power** — power analysis. She types the resulting N into Prolific by hand.
- **Spreadsheets** — stimulus matching, participant tracking, the things the tools don't help with.
- **Slack + email** — collaboration. Email with attachments for the version-chaos PIs.
- **Git** — in theory.

## Quote

> "I want a tool where design, prereg, and experiment are the same object. Though I've heard 'all-in-one platform' pitches before — always a toy or a walled garden you can't get your data out of. So I want it and I don't believe in it."

*Paraphrased from the synthetic HK pilot — not a real quote from a real user.*

## What this implies for the product

- **Randomization-inspectable-before-launch is the single most concrete pain to solve.** If the tool shows her, before she clicks "launch," that her assignment rules will distribute participants as she expects, she stops carrying the dread that broke her once.
- **Integrated authoring + preregistration is the wedge for her segment.** "Design, prereg, and experiment are the same object" is the unprompted version of our positioning. She'd switch *for this* — though she also explicitly doesn't believe such a tool can exist without being a toy or a walled garden.
- **Open data export is a hard requirement, not a nice-to-have.** "Walled garden you can't get your data out of" is her default skepticism. The platform must let her leave with everything intact.
- **The switching unit is a GROUP, not a person.** Marketing to Hanna without also pulling her PI and her collaborators along will fail; the tool needs adoption mechanics that handle three-person labs and small consortia, not just individual researchers.
- **Pragmatic, fragmented attention.** She's not going to read a manual. Onboarding has to work in twenty-minute windows; the tool must be self-explanatory enough that she can come back after two weeks without re-learning.

## Open questions / what to validate

**Synthetic-pilot evidence only.** Every claim above is a hypothesis. Before any high-stakes design decision rests on this persona, run at least 2–3 real interviews with postdoc-level operators using the existing `01_research/user-research/pi-interview-guide.md`. Specific things to probe:

- Is the "polish → trust" signal real for postdoc-level operators, or did the pilot overstate it? (Could go either direction.)
- Is randomization-inspection actually a top pain, or is it a vivid story from one bad day that doesn't represent her week-to-week?
- Does she really want "design + prereg + experiment as one object," or is that an aspirational thing she'd say in a sales pitch and not actually use?
- How big a deal is the "switching wins a group" finding? Has she switched tools with a group recently, or is this a hypothetical?
- What is her actual fragility budget? When does a small UX annoyance become a reason to abandon?

**Revisit trigger:** any time we're about to lock a design decision that depends on Hanna's preferences, or before V1 ships — whichever comes first.
