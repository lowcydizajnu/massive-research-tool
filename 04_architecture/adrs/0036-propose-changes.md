# ADR 0036 — Propose changes (PR-lite)

- **Status:** accepted
- **Date:** 2026-06-12
- **Deciders:** project owner + Claude
- **Tags:** collaboration, cross-workspace, data-model

## Context

The GitHub-backlog flagship (item 1): a replicator proposes their divergence back to the original study; the owner reviews a diff and accepts into their working draft or declines with a comment. The read side exists (ADR-0018 fork with preserved instanceIds, ADR-0020/0031 visual + protocol-text diff). What's new is a cross-workspace WRITE artifact and merge semantics. Three decisions: what a proposal IS, what accept DOES, and how the cross-tenant boundary stays sane.

## Options considered

### Proposal object — Option A: frozen snapshot copy · Option B: reference the fork's version

- **A:** `change_proposal` row carries a full `proposed_snapshot jsonb` copied from the fork's tip at propose time, plus title/message/status/decision fields.
- **B:** store only `source_version_id` and read the fork's snapshot at review time.
- B keeps rows small but makes review depend on a SECOND sanctioned cross-tenant read, breaks when the fork moves on (autosave tip mutates), and couples the proposal's lifetime to the fork's. **A chosen** — the proposal is self-contained evidence, immutable like a frozen version; the only cross-tenant surface is the proposal row itself.

### Merge semantics — Option A: conservative apply · Option B: wholesale replace

- **A (chosen):** by preserved instanceId against the target's CURRENT working tip — proposal-only blocks are ADDED (at the proposal's relative position), blocks in both take the proposal's config/title/group, target-only blocks are LEFT ALONE (deletions are never applied automatically; surfaced in the review as "not applied"). Groups referenced by merged blocks are carried; overview/theme are NOT merged (the narrative belongs to the owner). If both sides edited the same block, the proposal wins for that block — flagged in the preview.
- **B** would silently destroy the owner's intervening work; rejected.

### Decision surface — accept into the DRAFT, never into frozen versions

Accepting modifies only the autosave working copy via the existing snapshot write path (`writeBlocks` semantics) — the owner then saves/preregisters deliberately, with the auto-changelog (ADR-0033) and pre-flight checks (ADR-0034) applying as usual. A proposal can never directly create a frozen/preregistered version.

## Decision

We will add a `change_proposal` table (ULID PK; source/target experiment FKs; proposer; title/message; frozen `proposed_snapshot`; status open|accepted|declined|withdrawn; decision comment/by/at) and a `proposals` tRPC router: `propose` (fork-side; freezes the snapshot), `listIncoming` (target workspace), `listOutgoing` (proposer), `review` (diff vs the target's current tip — reusing alignBlocksForDiff + protocolText/diffLines — plus a computed merge preview), `accept` (conservative merge into the working draft), `decline`, `withdraw`. Notifications ride the existing event machinery with two new types: `proposal_open` (→ target study author) and `proposal_decided` (→ proposer). The activity-event `type` column is plain text, so no schema change beyond the new table.

Authorization: proposing requires write membership in the FORK's workspace + the fork's `fork_of_experiment_id` pointing at the target; reviewing/deciding requires write membership in the TARGET's workspace; the proposer may read/withdraw their own proposals by `proposer_user_id`. The proposal row is the SECOND sanctioned cross-tenant surface after ADR-0018's fork-source read — and it is self-contained, so no other cross-tenant read is introduced.

## Consequences

- **Easier:** the loop no research tool closes — fork → diverge → contribute back — with review evidence frozen at propose time; accepted changes flow through every existing safety net (changelog, pre-flight, conscious saves).
- **Harder:** one more table + a second cross-tenant object to reason about in security reviews; conservative merge means owners must apply deletions manually (deliberate).
- **Committed to:** proposals immutable once decided; accept touches only the draft; deletions never auto-apply.
- **Precluded from:** per-block cherry-picking and counter-proposal threads in v1 (revisit below).

## Revisit triggers

- Owners ask to apply deletions or cherry-pick blocks → per-block checkboxes on the review surface (the merge already works per block).
- Proposal volume makes the Replications tab crowded → a dedicated Proposals destination.
- Same-workspace "protected draft" workflows appear → revisit together with branches/protected-branches from the parked tier.

## References

- [github-features-backlog](../handoffs/github-features-backlog.md) item 1; [propose-changes user flow](../../02_product/user-flows/propose-changes.md)
- [ADR-0018](0018-cross-workspace-forking.md) (fork + the first cross-tenant read), [ADR-0031](0031-protocol-text-diff.md) (diff), [ADR-0033](0033-auto-changelog.md), [ADR-0034](0034-preflight-checks.md)
- Wireframes: [propose-changes-dialog](../../03_design/wireframes/propose-changes-dialog.md), [review-proposal](../../03_design/wireframes/review-proposal.md)
- Code: migration 0010, `server/trpc/routers/proposals.ts`, `server/modules/merge.ts`
