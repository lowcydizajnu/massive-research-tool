# User flow — Propose changes back to the original study

- **Job-to-be-done:** [build-a-study](../jobs-to-be-done/build-a-study.md)
- **Primary persona:** [burned-replicator](../personas/burned-replicator.md)
- **Secondary personas (if any):** [principal-investigator](../personas/principal-investigator.md) (as the receiving owner)
- **Grounding insights:** [researcher-tooling-pain-points](../../01_research/insights/researcher-tooling-pain-points.md)
- **Status:** implemented

## Goal

A replicator who improved a study (fixed a confound, reworded a scale, added a check) offers that divergence back to the original author, who reviews the exact diff and adopts it into their working draft or declines with a reason — completing fork → diverge → contribute back.

## Preconditions

- Sofia replicated Hanna's public study (ADR-0018 fork; instanceIds preserved → diffable).
- Sofia's replication has diverged from the upstream (otherwise there is nothing to propose).
- Both are signed in, in their own workspaces; no shared membership required.

## Postconditions

- A proposal exists with a FROZEN copy of Sofia's protocol at propose time (her continuing edits don't mutate the review).
- Hanna was notified (Activity · Yours); on decision Sofia is notified with the outcome + comment.
- On accept, Hanna's WORKING DRAFT gains the proposal's added/changed blocks (conservative merge — see ADR-0036); nothing frozen changes; Hanna still saves/preregisters on her own terms.

## Happy path

1. Sofia opens her replication → Builder right panel → Replications tab. Under the upstream entry she sees "Propose changes to the original".
2. Click → dialog: title (required) + message (optional, "what and why"). Submit.
3. Hanna sees an Activity notification + an "Incoming proposals" entry in her study's Replications tab.
4. Hanna opens the review surface: the proposal's message + the familiar two-view diff (visual blocks / protocol text) of Sofia's frozen protocol vs Hanna's current working draft, plus a plain-language merge preview ("3 blocks would be added, 1 updated; deletions are never applied automatically").
5. Hanna clicks "Accept into my draft" (optional comment) → the merge applies to her autosave working copy; Sofia is notified "accepted".
6. Hanna reviews her draft in Build (changelog shows the merged lines), then saves/preregisters when ready.

## Branches and decision points

- **Decline:** Hanna declines with a comment → Sofia notified, proposal closed as declined; nothing changes anywhere.
- **Withdraw:** Sofia withdraws an open proposal (she rethought it) → closed silently for Hanna's list.
- **Hanna's draft moved on:** review always diffs against her CURRENT tip; if both edited the same block, accepting takes the proposal's version of that block — flagged in the merge preview.
- **Multiple proposals:** each is independent; accepting one doesn't auto-close others (they re-diff against the new tip).

## Failure modes

- Upstream went private / fork unlinked after proposing: the proposal carries its own frozen snapshot, so review still renders; accept still merges (the object is self-contained).
- Proposer leaves the workspace: the proposal stays (it references the user, not the membership).
- Accept hits a deleted target study: NOT_FOUND surfaces in the standard error toast; proposal stays open.

## Out of scope

- Per-block partial accept (cherry-picking) — v2 if demanded.
- Counter-proposals / threaded negotiation (comments on the study cover discussion).
- Applying deletions automatically (conservative merge is deliberate — ADR-0036).
- Same-workspace proposals (collaborators edit the draft directly).

## Diagram

```
Sofia (fork workspace)                     Hanna (origin workspace)
─────────────────────                      ────────────────────────
Replications tab
  └─ "Propose changes" ──► dialog
        title + message
        [Send] ── freezes fork tip ──► change_proposal (open)
                                            │  notification: proposal_open
                                            ▼
                                       Replications tab · Incoming
                                            └─► /studies/[id]/proposals/[pid]
                                                  message · merge preview ·
                                                  visual/text diff vs CURRENT draft
                                              ┌──────────┴──────────┐
                                          [Accept into draft]   [Decline + comment]
                                              │                     │
                            conservative merge into autosave    status: declined
                                              │                     │
        notification: proposal_decided ◄──────┴─────────────────────┘
Sofia sees outcome (+comment) in her Replications tab
```

## Open questions

- Per-block cherry-picking at accept time — deferred (ADR-0036 revisit trigger).
- Should "proposal accepted" auto-follow the proposer to the study's Activity? Deferred until multi-user demand.
