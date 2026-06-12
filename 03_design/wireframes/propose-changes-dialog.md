# Wireframe spec — Propose changes dialog

- **Serves user flow:** [propose-changes](../../02_product/user-flows/propose-changes.md)
- **IA placement:** [IA v0.4 — Builder right panel · Replications tab](../ia/information-architecture.md)
- **Persona:** [burned-replicator](../../02_product/personas/burned-replicator.md)
- **Status:** ready for handoff

## Purpose

Let a replicator offer their divergence back to the original author from the place that already shows the relationship — the Replications tab's upstream entry.

## Layout

Replications tab (fork side), under the upstream study row: a "Propose changes to the original" button (visible when the fork has diverged). Click → centered modal:

```
┌──────────────────────────────────────────────┐
│ Propose changes to "[Upstream title]"        │
│ Your protocol as it is RIGHT NOW is frozen   │
│ into the proposal; later edits stay yours.   │
│ Title    [________________________]          │
│ Message  [________________________]          │
│          [________________________]          │
│              [Cancel] [Send proposal]        │
└──────────────────────────────────────────────┘
```

## Content inventory

- **Trigger button** — in the upstream section of the Replications tab; hidden when not a fork or not diverged.
- **Title** (required, ≤140) — e.g. "Reworded the accuracy scale + added attention check".
- **Message** (optional, ≤2000) — the what-and-why; shown verbatim on the review surface.
- **Freeze note** — copy explains the snapshot-at-propose-time semantics (ADR-0036).
- **Outgoing status row** — after sending, the tab shows "Proposal sent · open/accepted/declined/withdrawn" (+ owner's decision comment) and a Withdraw button while open.

## States

- **Default** — empty fields, Send disabled until title present.
- **Loading** — Send shows "Sending…" (PendingButton).
- **Empty** — n/a.
- **Partial** — n/a.
- **Error** — mutation error inline in the dialog (standard pattern); the dialog stays open.
- **Success / optimistic** — toast "Proposal sent"; dialog closes; outgoing row appears.

## Interactions

- ESC/backdrop cancels. Send → proposals.propose → notification fans out to the upstream author.
- Withdraw (outgoing open proposal) asks via ConfirmDialog, then closes it silently for the owner.

## Edge cases

- Upstream became non-public after forking: proposing is still allowed (the relationship exists); the owner simply receives it.
- No divergence: the button is hidden (nothing to propose).
- Multiple open proposals from the same fork: allowed; each freezes its own snapshot.

## Accessibility notes

- Dialog: `role="dialog"` + `aria-modal`, labelled by the heading; fields are real labelled inputs; focus trapped, returned on close.

## Open questions

- None blocking; per-block cherry-pick selection at propose time is an ADR-0036 revisit trigger.
