# User flow — First-run orientation

- **Job-to-be-done:** [Get set up](../jobs-to-be-done/get-set-up.md)
- **Primary persona:** [Hanna Kowalczyk — postdoc operator](../personas/postdoc-operator.md)
- **Secondary personas (if any):** …
- **Grounding insights:** …
- **Status:** draft

## Goal

> One sentence: what the user is trying to accomplish.

A researcher who just finished signup gets a 30-second orientation to where the core surfaces live, so the empty workspace isn't a dead end.

## Preconditions

- Signed in, signup-and-onboard complete (has a workspace) — they land on `/studies`.
- They have not seen the tour before (`hasSeenTour` is not set in their auth metadata), OR they explicitly chose to replay it.

## Postconditions

- The researcher has been shown destinations + how to create a study.
- `hasSeenTour` is set to true in Clerk publicMetadata (survives device changes), so the tour does not auto-run again.

## Happy path

1. Signup completes → researcher lands on `/studies`. (Trigger: first authenticated load with `hasSeenTour` unset.) → The tour starts on the Welcome step.
2. They click **Next** through: Welcome → Destinations (left rail) → Create a study (the New study button) → You're set.
3. On the final step they click **Done**. → `markTourSeen()` writes `hasSeenTour = true`; the tour closes.

## Branches and decision points

- **Decision:** continue or skip.
  - **Skip** (any step) → same as finishing: `markTourSeen()` runs, tour closes, won't auto-run again.
- **Decision:** replay later.
  - From Settings · Account → "Replay the product tour" links to `/studies?tour=replay`, which runs the tour again regardless of `hasSeenTour` (without un-setting it).

## Failure modes

- **Trigger:** the metadata write fails. **System response:** the tour still closes (the write is fire-and-forget). **Recovery:** worst case the tour auto-runs once more next visit — harmless.
- **Trigger:** researcher is not on a surface that carries the tour targets (e.g. a personal page). **System response:** the tour simply doesn't start (it only runs where its `[data-tour]` targets exist). **Recovery:** none needed.

## Out of scope

- Per-feature discovery tooltips (PF3.3) and empty-state CTAs (PF3.2) — separate, complementary first-run aids.
- Teaching every surface — the tour is deliberately 4 steps; depth comes from the surfaces themselves.

## Open questions

- Add a Templates step once the Library-completion handoff ships a `/library/templates` surface (the handoff's step 4). Deferred until that surface exists.

## Diagram

Linear, 4 steps: Welcome → Destinations → Create → Done. One branch: Skip (= finish early). One re-entry: `?tour=replay`.
