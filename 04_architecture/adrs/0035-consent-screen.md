# ADR 0035 — Editable consent screen as a pinned study-level step

- **Status:** accepted
- **Date:** 2026-06-12
- **Deciders:** project owner + Claude
- **Tags:** participant-runtime, builder, ethics

## Context

The participant entry page has always shown a FIXED consent paragraph with a single "Begin" button (ADR-0013 — the built-in consent step the pre-flight check reports). The owner wants (2026-06-12): the consent screen visible in the Builder — but not draggable — with researcher-editable text, explicit **Agree / Disagree** buttons, and a proper screen when the participant disagrees. Consent wording is part of the protocol (IRB approves specific language), so it must freeze with preregistered versions and travel with replications.

## Options considered

### Option A — A study-level `consent` object riding the snapshot, pinned card in the Builder

- `definition_snapshot.consent: { body, agreeLabel, disagreeLabel, declineMessage }` (defaults = today's copy), written by a `studies.setConsent` mutation like theme/overview; the Builder shows a pinned, non-draggable "Consent screen" card above the block list that opens an editor in the context panel.
- **Pros:** structurally honest — consent is unique (always first, exactly one, can't be grouped/conditioned/removed), so it shouldn't live in `blocks[]` where every reorder/group/condition surface would need a special case; freezes + forks for free with the snapshot (one fork-field addition); no migration (ADR-0012 pattern).
- **Cons:** one more snapshot-riding field readers must know about (`readConsent` mirrors `readTheme`/`readOverview`).

### Option B — A real `core/consent` registry block forced to index 0

- **Pros:** reuses the block editor surface wholesale.
- **Cons:** "in `blocks[]` but unmovable, ungroupable, unconditionable, undeletable, excluded from screens/diff counts/changelog/preflight-completeness" — a special case in every machine that touches blocks; participants answer screens by index, so a pseudo-block also distorts the runtime's screen model.

## Decision

We will ship Option A. The participant start page renders the researcher's `body` (paragraphs), an **Agree** button (the existing begin form — agreeing IS beginning, nothing recorded before it) and a **Disagree** link to a `/take/[studyId]/declined` page rendering `declineMessage`; nothing is ever recorded for a decliner. Empty fields fall back to the defaults on read, so existing studies keep today's behavior verbatim. The changelog reports "～ Consent screen updated"; the pre-flight consent rule now distinguishes custom vs default text.

## Consequences

- **Easier:** IRB-specific consent language per study; the decline path is explicit and humane; consent text is preregistration-frozen evidence.
- **Harder:** the Builder has one non-block card to keep visually distinct from draggable rows (the wireframe pins it with a lock affordance).
- **Committed to:** exactly one consent screen, always first, never conditioned; decline records nothing.
- **Precluded from:** multi-page consent / quiz-style comprehension checks (would become real blocks placed after consent; revisit trigger below).

## Revisit triggers

- IRBs require comprehension checks or signatures → model those as ordinary blocks after the consent step (consent stays the gate).
- Studies need localized consent text → ride i18n work (parked globally).
- Researchers ask to disable the decline button → refuse by default (ethics); escalate to the owner.

## References

- Owner direction 2026-06-12 ("Consent screen should be in builder but not draggable, agree/disagree + screen when you disagreed")
- [ADR-0013](0013-participant-runtime-and-analytics.md) (runtime + consent step), [ADR-0012](0012-block-format-and-autosave-semantics.md) (snapshot-riding fields), [ADR-0034](0034-preflight-checks.md) (the consent pre-flight rule)
- Wireframe: [consent-screen](../../03_design/wireframes/consent-screen.md)
- Code: `05_app/server/modules/consent.ts`, `studies.setConsent`, `app/(take)/take/[studyId]/start/page.tsx`, `app/(take)/take/[studyId]/declined/page.tsx`
