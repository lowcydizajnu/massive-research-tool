# Interview guide — Academic Principal Investigators (psychology)

Designed to surface evidence without leading. Cover only what time allows; bolded sections are non-skippable. Don't pitch the product during the interview.

- **Target audience:** Academic Principal Investigators in psychology. Recommended mix of 2–3: one misinformation researcher, one in an adjacent influence/persuasion area (social cognition, attitude change), one outside that subfield (clinical, developmental, social) to test generalization.
- **Persona under test:** [Dr. Maya Okonkwo, Principal Investigator](../../02_product/personas/principal-investigator.md)
- **Duration:** ~60 minutes
- **Status:** ready
- **Last updated:** 2026-05-27

## Purpose

Validate (or correct) the Principal Investigator persona in `02_product/personas/principal-investigator.md`. The persona is currently `draft`, built from a single observation. To upgrade Status to `validated`, we need triangulation across 2–3 academic PIs with varying subfields. This guide is the instrument.

**Success looks like:** for each persona claim grouped as "reasonable inference" or "soft extrapolation," we have either confirmation across 2 of 3 interviewees, or specific correction that updates the persona. The interview should also surface claims we should have made but didn't — counter-evidence is as valuable as confirmation.

**Specific claims under test** (from the persona file's audit):

- Online-study-heavy with multi-condition designs and complex stimuli
- Mid-career stage, small lab that still has hands on studies
- Pilots before scaling, asks peers for feedback, defends methodology in writing
- Open-science practices (preregistration, OSF, open data) are normal practice
- Real tool stack — Qualtrics primary, then R/Python/SPSS? OSF? Spreadsheets for participant tracking?
- "No room for computing power" — what specifically would they do with more headroom?
- International collaboration is mostly email and file transfer
- Aesthetic / modern UX affects trust in tools
- Participant management must live in-tool, not in a parallel spreadsheet

## Sample and recruiting

- **Target N:** 3 interviews. Stop at 3 unless signals contradict — then add 1–2 more.
- **Mix:**
  - 1 × misinformation researcher (closest to original observation)
  - 1 × adjacent influence/persuasion researcher (social cognition, attitude change, judgment & decision-making)
  - 1 × outside that subfield (clinical, developmental, social) — tests generalization
- **Career stage:** at least 2 of 3 should be mid-career (post-tenure or established assistant prof). Include 1 early-career or 1 senior if available, to bracket the range.
- **Recruiting channels:** personal network first (project owner's contacts), then snowball ("who else should I talk to?") at the end of each interview, then conference / Twitter outreach if needed.
- **Incentive:** if recruiting cold, offer a $50–100 honorarium or a coffee/lunch in person. Personal-network interviews can usually be done for free as a favor.

## Setup

Pre-interview:

- Send a brief 2 days ahead: who you are, why you're talking to them, ~60 min, what topics, recording with permission, no commercial sell.
- Confirm consent for recording (audio is enough; transcripts can be auto-generated).
- Have the persona's claim audit open in a second window for live checking.

Opening script (~2 minutes, read with your own voice):

> Thanks for the time. To set context: I'm working on a new tool for designing and running psychological experiments online, and before I build anything, I want to make sure I understand how PIs like you actually work. I'm not selling anything and I'm not going to ask you to commit to anything. Today I'd like to learn how you run studies, what tools you use, what frustrates you, and what you wish existed. No right answers — just your honest experience. Mind if I record so I don't have to take notes the whole time?

## Sections

### **Section 1 — Their work** (10 min)

- Tell me about your role and your lab. How long have you been at it, what size is the lab?
- What questions does your research try to answer right now?
- Walk me through what you spent most of your time on this past week.

*Listen for: career stage, lab size, what fraction of time is on studies vs. writing vs. teaching vs. admin.*

### **Section 2 — Their last study, end to end** (15 min — most important section)

- I'd like to focus on the most recent study you ran. Walk me through it from "we had an idea" to "we had data we could analyze."
- What tools were involved at each stage?
- Where did the workflow feel smooth? Where did it feel painful?
- What did you have to do *outside* the main tool that you wish was *inside*?
- How did you track participants? How did you make sure the right people got the right conditions?
- What did you do when the tool couldn't express something you wanted?

*Listen for: actual tool stack, real frustrations (not abstract ones), workarounds, where data lives, where participants live, where decisions get made.*

### Section 3 — Tooling landscape (10 min)

- Besides [whatever they named], what other tools are part of your studies?
- Have you ever switched experimental platforms? What triggered it?
- What tool do you wish existed that doesn't?
- When was the last time a tool surprised you in a good way? In a bad way?

*Listen for: switching costs, adoption triggers, gaps researchers feel.*

### **Section 4 — Open science and collaboration** (10 min)

- How does preregistration fit into your work? Always, sometimes, never — what triggers it?
- Do you use OSF (or similar)? For what specifically?
- When you collaborate with researchers at other institutions, what does that actually look like day to day?
- What's the most frustrating part of cross-institution collaboration today?

*Listen for: real OSF use vs. claimed open-science. The specifics of "international collaboration is hard" — what specifically?*

### Section 5 — Replication and reuse (5 min)

- Have you ever tried to replicate someone else's study? What did that take?
- Has anyone replicated yours? What did they need from you?
- Have you used or adapted someone else's research framework? Where do you find them, how do you decide to trust them?

*Listen for: what "fork" actually means in their world, evidence on the GitHub-for-research wedge.*

### Section 6 — Quick claim check (5 min)

Read each one in their own voice. Pause for reaction. Listen for resonance vs. polite agreement — polite agreement is often disagreement they don't want to voice.

- "I'd switch experimental tools if a new one were genuinely modern — not just slightly better."
- "How a research tool looks and feels affects whether I trust it."
- "If my tool let me do richer things — adaptive designs, larger stimulus sets — I'd scope studies up, not down."
- "I'd build on a colleague's study if the tool made adapting it easy."
- "Preregistration is part of every study I run." (then probe — what about exceptions?)

### Wrap-up (5 min)

- Who else should I talk to who has a different perspective from yours?
- Anything I should have asked but didn't?
- Anything you want me to follow up on?

## Quick claim check

(Listed inline in Section 6 above — read those statements aloud during the interview. The intent is to surface counter-evidence to the persona, not confirm what we already believe.)

## Notes for the interviewer

- **Ask follow-ups before moving on.** The persona's claims are blunt; the interview should surface nuance the persona is missing. If they mention a tool or workflow, ask "what does that actually look like?" until you have a concrete picture.
- **Avoid pitching.** If they ask what you're building, give a one-sentence answer ("a more modern experimental tool that takes open-science seriously") and pivot back to their experience. Don't validate the product idea — validate the persona.
- **Don't lead.** "Do you find Qualtrics clunky?" is leading. "What do you think of the tools you use?" is open. When in doubt, ask "what's that like?"
- **Capture quotes verbatim** where possible. Real quotes are the difference between a credible persona and a generic one. Phrases like "I just want it to not fight me" are worth pages of paraphrase.
- **Track surprises.** Anything they say that contradicts the persona is the most valuable signal in the conversation.
- **Note who they trust.** When they mention a tool / framework / researcher they trust, ask why. This is a goldmine for the "GitHub for research" wedge.

## Where findings go

- **Immediately after each interview:** create a raw-notes file in this same folder named `{YYYY-MM-DD}-{interviewee-pseudonym}.md`. Include date, duration, consent confirmed, raw quotes, surprises, and any contradictions to the persona.
- **After all interviews are complete:** synthesize into one or more entries in `01_research/insights/` (e.g., `insight-pi-tooling-pain-points.md`). Insights are what flow forward into design and the product brief.
- **Update the persona:** lift Status from `draft` to `validated` (or `superseded by NN` if findings force a rewrite). Fill in `Grounding insights` with links to the synthesized insights. Update `Last validated` to the date of the last interview.
- **If anything contradicts an accepted ADR:** flag it loudly. ADRs can be superseded; better to do it deliberately than to discover the architecture is wrong after build.
