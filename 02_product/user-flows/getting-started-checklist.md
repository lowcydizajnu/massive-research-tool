# User flow — Getting-started checklist

- **Job-to-be-done:** [Get set up](../jobs-to-be-done/get-set-up.md)
- **Primary persona:** [Postdoc operator](../personas/postdoc-operator.md)
- **Secondary personas (if any):** [Principal investigator](../personas/principal-investigator.md)
- **Grounding insights:** …
- **Status:** draft

## Goal

A new researcher sees, at a glance, how far they've gotten through the product's
core loop (create → build → preregister → recruit → results) plus the community
basics (save, invite, connect OSF), and can jump straight to the next undone step.

## Preconditions

- Signed in, signup wizard finished (`hasCompletedOnboarding`), at least one
  workspace resolves.
- The **Start here** card is a **pinned card above the widget grid on both the
  personal Home (`/home`) and workspace (`/dashboard`) dashboards** (ADR-0045 am.
  2026-07-02) — NOT a customizable widget, so a saved layout can't hide it. It
  shows whenever the checklist is incomplete and the user hasn't dismissed it.

## Postconditions

- Every step reads as done (derived live from the researcher's own data — no step
  is manually ticked), or the researcher has removed the widget via Customize.
- The researcher knows the canonical order of the research loop and where each
  action lives.

## Happy path

1. Researcher opens **Home** (personal dashboard). (Trigger: left-rail / personal
   tabs navigation after landing on Studies post-signup.)
2. The **Start here** card lists 8 steps with live done/undone states and a
   "N of 8 done" progress line. System derives each state server-side on page load.
3. Researcher clicks the first undone step. **Create your first study** — and,
   while no study exists yet, every study-dependent step — opens the **New-study
   modal** (creating a study is the real prerequisite; nothing routes to /studies,
   so the first-run tour never re-fires). Once a study exists, the study steps
   deep-link into it (switching the active workspace if it lives elsewhere).
   Community steps link to Browse / Team / Settings.
4. Researcher performs the action there (covered by that surface's own flow —
   see Out of scope).
5. Next dashboard visit, the step reads done; the progress line advances. No
   storage is written — the state is recomputed from the database each time.
6. When all 8 read done, the card **stops showing**. The researcher can also
   dismiss it anytime with the card's **×** (persisted cross-device); dismissed or
   complete, it's gone from both dashboards.

The 8 steps, in order, with their derivation:

| # | Step (researcher-facing copy) | Done when |
| - | ----------------------------- | --------- |
| 1 | Create your first study | they author ≥1 study (any path: blank, template, replicate) |
| 2 | Add your first block | any version of an authored study has ever carried ≥1 block (a later-emptied draft still counts — they built once) |
| 3 | Preregister or publish | any authored study has a preregistered or published version |
| 4 | Open recruitment | any authored study has ever had a recruitment session |
| 5 | See your first results | any authored study has ≥1 completed participant response (real runs only, not previews) |
| 6 | Save a study from Browse | they have ≥1 saved study |
| 7 | Invite a teammate | any workspace they own has ≥2 members (active or invited) |
| 8 | Connect your OSF account | an OSF connection exists for their account |

## Branches and decision points

- **Decision:** researcher joined via an invite (teammate path) rather than
  creating their own workspace.
  - **Path A (own workspace):** all 8 steps apply as written.
  - **Path B (invited):** steps still derive correctly — step 7 reads done only
    if a workspace they *own* has ≥2 members, so an invitee sees it undone until
    they create a workspace and invite someone. Acceptable: the copy says
    "Invite a teammate", which is still a real next step for them.
- **Decision:** researcher finds the card noisy.
  - **Path A:** click the card's **×** — hides it on both dashboards and persists
    `dismissedGettingStarted` (cross-device). There is no re-add affordance by
    design; dismissal is intentional and final for that account.

## Failure modes

- **Trigger:** a derivation query fails on page load.
  **System response:** the widget shows the standard per-widget error card
  (widget errors are isolated; the rest of Home renders).
  **Recovery:** reload; no state is lost because none is stored.
- **Trigger:** a user with a saved dashboard layout.
  **System response:** the card still shows — it's pinned above the grid,
  independent of the saved layout (the whole point of ADR-0045 am. 2026-07-02).
  **Recovery:** n/a.

## Out of scope

- The actions themselves — covered by [signup-and-onboard](signup-and-onboard.md),
  build/run flows, and Browse/Team/Connections surfaces.
- The first-run coachmark tour, empty-state CTAs, and one-time feature tips —
  deliberately separate aids per [first-run-orientation](first-run-orientation.md);
  this checklist is the fourth aid and must not add overlays: it is a passive
  pinned card on the two dashboards, never a popup, never on /studies (whose
  create actions it triggers via the New-study modal instead).
- Any AI/chat assistant — explicitly deferred; would require its own ADR.

## Open questions

- Should completing all 8 auto-remove the widget after some grace period, or is
  manual removal enough? (Owner leans manual — revisit if users report clutter.)

## Diagram

Linear checklist — no branching diagram needed beyond the table above.
