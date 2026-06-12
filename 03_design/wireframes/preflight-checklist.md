# Wireframe spec — Pre-flight checklist

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Information architecture v0.4 — focused study mode, Preregister/Run stages](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Catch methodological accidents at the moment of commitment: a readiness checklist above the Preregister and Publish & run actions, so an empty block or a missing hypothesis is seen BEFORE a version is frozen — informing, never patronizing (researcher autonomy; ADR-0034).

## Layout

A card above the freeze action on both gate surfaces (Preregister page; Run page's freeze section):

```
┌──────────────────────────────────────────────┐
│ Readiness check          2 issues · 1 note   │
│ ✕ 2 blocks aren't configured yet             │
│    "Image", "Video" — Fix in Build →         │
│ ⚠ No hypotheses in the Overview              │
│ ✓ Branching rules are valid                  │
│ ✓ 9 blocks record data                       │
│ ✓ Consent step is built in                   │
│ ☐ Proceed anyway — I understand the flagged  │
│   issues                                     │
└──────────────────────────────────────────────┘
[ Preregister ]   ← disabled until green or acknowledged
```

## Content inventory

- **Header** — "Readiness check" + a count summary (`n issues · m notes`, or "All clear").
- **Check rows** — icon (✕ red fail / ⚠ amber warn / ✓ green pass — never color-only, the icon glyph differs), researcher-native title, one-line detail, and for block-scoped failures the offending block names + a "Fix in Build →" link.
- **Rule set** — ADR-0034 table (has-blocks, blocks-configured, branching-valid, records-data, hypotheses [mode-aware], abstract, attention-check, conditions-used, consent).
- **Proceed-anyway checkbox** — only when ≥1 fail; ticking it enables the action (mirrors the ADR-0024 IRB-acknowledgment friction pattern).
- **The gated action** — the page's existing Preregister / Publish & run button, dimmed + inert until green or acknowledged.

## States

- **Default (all green)** — compact card, action enabled, no checkbox.
- **Loading** — "Running checks…" skeleton; action hidden until results arrive.
- **Empty** — n/a (has-blocks covers the empty study).
- **Partial (warns only)** — amber rows visible, action enabled (warns never block).
- **Error** — query failure: card shows "Couldn't run checks" + the action stays enabled (the gate must never strand a researcher).
- **Success / optimistic** — n/a (read-only surface).

## Interactions

- "Fix in Build →" navigates to the Build stage (block named in the row).
- Ticking "Proceed anyway" enables the action; unticking disables it again.
- Checks re-run on page load (derived from the working tip — always current; same philosophy as ADR-0033).

## Edge cases

- Failing checks but the researcher proceeds: nothing is recorded on the version (advisory gate, ADR-0034) — revisit if audit demand appears.
- Study already runnable (frozen version exists): the Run page's recruiting states don't show the checklist — it gates only the freeze moment.
- Checks and the Builder disagree mid-edit (stale cache): the query refetches on mount; worst case the researcher sees last-load state, and the server snapshot is re-read on every freeze anyway.

## Accessibility notes

- The list is a semantic `<ul>`; each row's status is conveyed by glyph + text ("Issue:", "Note:" prefixes in the accessible name), never color alone.
- The proceed checkbox is a real labelled `<input type="checkbox">`; the gated action keeps `aria-disabled` while inert.
- Counts in the header are text, announced with the card's heading.

## Open questions

- Should "proceed anyway" be recorded on the frozen version for audit? Deferred until a collaborator/IRB scenario asks for it (ADR-0034 revisit trigger).
