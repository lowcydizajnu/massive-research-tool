# Wireframe spec — Replication mode in the Builder

- **Serves user flow:** [replicate-a-study](../../02_product/user-flows/replicate-a-study.md)
- **IA placement:** [IA v0.4 — focused study mode, Build stage](../ia/information-architecture.md)
- **Persona:** [burned-replicator](../../02_product/personas/burned-replicator.md)
- **Status:** ready for handoff

## Purpose

Make a replication's relationship to its original ambient while editing: what is being replicated, under what intent, how far it has drifted, and why each difference exists — captured at the moment of change, not reconstructed later.

## Layout

**Intent dialog** (on Replicate, before the fork):

```
┌ Replicate "Source cues" ─────────────────────────────┐
│ What kind of replication is this?                    │
│ (•) Direct — follow the original as exactly as       │
│     possible; differences need justification         │
│ ( ) Conceptual — same claim, different               │
│     operationalization                               │
│ ( ) Extension — the original plus new conditions     │
│     or measures                                      │
│            [Cancel]  [Create replication]            │
└──────────────────────────────────────────────────────┘
```

**Builder banner** (replications only) — a strip between the study header and the Blocks list:

`↳ Replicating "Source cues" by Hanna · direct replication · 2 blocks diverged · Compare ↗`

**Block rows**: diverged blocks carry a small badge after the title — `~ modified` (amber tint) or `+ added` (green tint); unchanged rows stay clean (no noise).

**Configure (diverged block)**: under the provenance line — `Show original ▾` (expands a read-only token-styled box with the original's config values) and a `WHY DOES THIS DIFFER FROM THE ORIGINAL?` textarea (blur-save → the block's divergence note).

**Overview**: the existing divergence section shows researcher-written global notes PLUS an auto-compiled list "Per-block differences" (block name → rationale, or "no rationale yet").

## Content inventory

- **Intent dialog** — three radio options with researcher-native explanations; skippable (Cancel still allows plain Replicate via a "replicate without declaring" link); selection stored in `overview.replicationIntent`.
- **Recipe sections** — injected into the Overview on fork: Target effect (with the original study's title/link pre-filled), Original result, Planned sample, Differences from the original. Labeled slots, researcher-editable markdown like any section.
- **Banner** — source title (links to Compare), author, intent chip (editable via a small menu), diverged-block count (live, derived vs the pinned original), Compare link.
- **Badges** — `~ modified` / `+ added` chips on block rows; tooltip names the source version pinned at fork time.
- **Show original** — collapsed by default; expands the original block's prompt/config read-only; "original unavailable" fallback if the source was hard-deleted.
- **Rationale field** — one short textarea per diverged block; saved like other block edits; compiled into Overview + available to readiness checks.
- **Readiness rows (replications)** — "Replication kind declared" (amber when missing); "Diverged blocks justified n/m" (amber listing unjustified blocks; severity relaxed for conceptual/extension per the user flow).

## States

- **Default (non-replication)** — none of this renders; zero cost to ordinary studies.
- **Loading** — banner and badges wait for the replications query; rows render unbadged until it resolves (no layout shift — badges are inline chips).
- **Empty** — fresh fork, no divergence: banner reads "no divergence yet"; no badges.
- **Partial** — source unavailable: banner keeps the title text without links; badges and Show-original degrade gracefully.
- **Error** — divergence query failure: Builder works normally, banner hidden (never block editing).
- **Success / optimistic** — rationale saves on blur with the standard "Saves automatically" hint.

## Interactions

- Intent radio → Create replication → fork + injection happen in one mutation; the Builder opens with the banner present.
- Banner intent chip → small menu to change intent (writes the Overview field; checks re-derive).
- Badge hover → "differs from Preregistration v2 of the original".
- Show original toggle → expands/collapses; no navigation.
- Rationale textarea → blur-save; the Overview compilation and readiness rows update on next read.

## Edge cases

- Replicating one's own study: identical experience (self-replication is legitimate).
- Fork made BEFORE this feature: no intent stored → banner shows "kind not declared" with the inline menu to set it; everything else works (derive-on-read).
- Block deleted from the fork: counts as divergence ("removed") in the banner count and readiness; no row to badge.
- Group membership changes only (same configs): counts as modified protocol structure; badge on the moved block.

## Accessibility notes

- The banner is a complementary landmark with text content (no color-only signals); badges pair glyph + text.
- The intent dialog is the standard accessible dialog primitive; radios are real inputs with visible labels.
- Show-original content is plain read-only text (not disabled inputs — screen readers skip those).

## Open questions

- Should the rationale prompt nag (amber outline) on direct replications as you type? Deferred — readiness check covers it without edit-time nagging.
