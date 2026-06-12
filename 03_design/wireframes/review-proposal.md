# Wireframe spec — Review a proposal

- **Serves user flow:** [propose-changes](../../02_product/user-flows/propose-changes.md)
- **IA placement:** [IA v0.4 — focused study mode · /studies/[id]/proposals/[pid]](../ia/information-architecture.md)
- **Persona:** [principal-investigator](../../02_product/personas/principal-investigator.md)
- **Status:** ready for handoff

## Purpose

Give the original author everything needed to decide on an incoming proposal in one place: who/why, the exact diff against their CURRENT draft, what accepting would actually do — then Accept into draft or Decline with a comment.

## Layout

Entry: the study's Replications tab gains an "Incoming proposals" list (title · proposer · age · status). Click → full review page under focused-mode chrome:

```
Proposal: "Reworded accuracy scale" — from Sofia (Sofia Lab) · 2d ago
"[message verbatim]"
┌ Merge preview ─────────────────────────────────────┐
│ ＋ 2 blocks would be added · ～ 1 updated           │
│ － 1 block removed in the proposal — NOT applied    │
│   automatically (deletions are yours to make)      │
└────────────────────────────────────────────────────┘
[Visual diff | Protocol text]    ← the existing two-view diff, proposal vs YOUR CURRENT DRAFT
[Accept into my draft]  [Decline…]      (+ optional comment field)
```

## Content inventory

- **Header** — proposal title, proposer display name + workspace, created date, status chip.
- **Message** — proposer's rationale, verbatim, plain text.
- **Merge preview** — plain-language counts from the same alignment the merge uses: added / updated / deletions-not-applied / "both edited — proposal wins" conflicts.
- **Diff** — the existing visual-blocks and protocol-text views (ADR-0020/0031), left = your current draft, right = the proposal's frozen snapshot.
- **Decision controls** — Accept into my draft (primary; ConfirmDialog reiterates the merge preview), Decline (requires a short comment — the proposer deserves a why), optional comment on accept.
- **Decided state** — once decided, the page is read-only evidence: decision, comment, decider, date.

## States

- **Default** — open proposal, diff loaded.
- **Loading** — skeleton over the diff area.
- **Empty** — n/a (the page only exists for a proposal).
- **Partial** — proposal identical to the current draft (owner already converged): merge preview says "Nothing left to apply"; Accept still allowed (records the decision).
- **Error** — diff failure shows retry; decision mutations use the standard error toast.
- **Success / optimistic** — accept → toast "Merged into your draft" + link to Build; decline → status flips to declined.

## Interactions

- Accept → ConfirmDialog (merge preview restated) → proposals.accept → working draft updated → proposer notified.
- Decline → comment field required → proposals.decline → proposer notified with the comment.
- The diff always renders against the CURRENT working tip — re-opening after more edits re-diffs.

## Edge cases

- Draft moved on since proposing: conflicts flagged ("both edited — proposal version wins on accept").
- Proposal withdrawn while the owner reads: decision buttons error NOT_FOUND-style and the status chip refreshes to withdrawn.
- Viewer-role member opens the page: read-only (decision mutations are write-gated server-side).

## Accessibility notes

- Status chips carry text, not color alone; the decision area is a labelled form; the ConfirmDialog reuses the accessible primitive.
- Diff views inherit their existing a11y semantics (list fallback).

## Open questions

- Per-block accept checkboxes — ADR-0036 revisit trigger; the layout reserves the merge-preview card as the natural home.
