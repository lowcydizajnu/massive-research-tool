# ADR 0031 — Protocol-text diff (GitHub-style compare)

- **Status:** accepted
- **Date:** 2026-06-10
- **Deciders:** Paweł Rosner (project owner)
- **Tags:** compare, versioning, replications, ADR-0020-amendment, ADR-0018-related

## Context

The Compare page juxtaposes two protocol versions as diff-colored node graphs (ADR-0020 §A6) with per-node change lines. The owner wants a GitHub-style line diff as well: precise before/after lines, scannable top-to-bottom, copy-pastable — and covering the parts the node view doesn't (the Overview document, group structure).

## Decision

Add a **Text diff** view to the Compare page, computed server-side and rendered like a unified GitHub diff:

- **Canonical protocol text** (`server/modules/protocol-text.ts`): a pure, deterministic serialization of a `definition_snapshot` into **researcher-readable lines** — Overview (abstract, hypotheses, sections, replication notes), then blocks in order with group headings, each block as its display name + title + humanized config (one property per line; list items one per line so diffs are minimal). Vocabulary rule applies: protocol-sheet language, never raw JSON keys.
- **Line diff** (`lib/diff-lines.ts`): a hand-rolled LCS line diff (~40 lines, pure) producing `{type: "same"|"added"|"removed", text}` rows. No new dependency — `jsdiff` was considered and rejected as unnecessary for line-granularity on short documents (protocols are hundreds of lines, LCS DP is trivial at that size).
- **Transport:** `studies.compareVersions` returns `textDiff: DiffLine[]` alongside the node lists, for both targets (frozen versions and `vs="origin"` — the replication-vs-original view inherits it for free, same ADR-0018 gating).
- **UI:** a **Visual / Text** toggle on the Compare page; the text view renders +/− gutter rows tinted with the success/danger subtle tokens, mono font.

## Options considered

- **Serialize researcher-readable protocol text + LCS line diff (chosen)** — human language, minimal lines per change, no dependency.
- **Diff the raw snapshot JSON** — rejected: developer-speak on a user-facing surface (violates the vocabulary rule), and noisy (key order, punctuation lines).
- **`jsdiff` library** — battle-tested, but line-level LCS over short documents doesn't justify a dependency + lock-in row.
- **Word-level intra-line highlighting** — deferred; line granularity covers the need, and the node view already itemizes config changes (V1.14.2).

## Consequences

- Overview/abstract/hypotheses and group-structure changes become visible in compare for the first time.
- The protocol text doubles as a future export ("protocol sheet as text") if ever needed.
- Serializer changes alter diff output across versions — it must stay deterministic and append-only-ish; tests pin the format.

## Revisit triggers

- Protocols exceed ~5k lines (LCS DP cost) → swap in Myers diff or jsdiff.
- Demand for word-level highlights inside changed lines → add intra-line diffing.
- Demand to export/share the text diff (OSF amendment notes) → add a download/copy affordance.

## References

- ADR-0020 §A6 — multi-version visual compare.
- ADR-0018 — replication visibility gating (origin compare).
- ADR-0030 — field-group (its fields serialize one per line).
- `00_meta/rules/design-rules.md` — researcher vocabulary rule.
