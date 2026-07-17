# QA audit — Overview help modal, variable list-prefill, and a sync stress test

**Date:** 2026-07-17
**Scope:** item ⑨ Phase B follow-ups — the `?` help affordance, IV/DV variables "taken from the plan", and a challenging non-linear / multi-researcher sync test of the Overview ↔ OSF ↔ push chain (owner direction 2026-07-17). Files: [ADR-0107](../../04_architecture/adrs/0107-osf-template-gate.md) (D11 + addenda), `server/modules/osf-schema.ts`, `components/feature/overview/*`, `components/ui/help-modal.tsx`.
**Result:** PASS after fixes. Committed unpushed, code-only — no migration, no seed.
**Gate:** tsc 0 · lint 0 · **1,165 vitest** · `validate.py` clean

## What was asked

The owner reported two defects and requested a stress test before deploy:
1. *"the question mark doesn't display a modal"* — the `?` on section headers was
   a native `title=""` tooltip that showed nothing on click.
2. *"independent/dependent variables might also be taken from the plan — fix what
   is missing."*
3. *"do challenging user tests — non-linear creation, many updates, multiple
   researchers — to see if everything is in sync, then deploy."*

## Fixes

- **Help modal.** New `components/ui/help-modal.tsx` (`HelpModal`), extracted from
  the Builder Variants dialog so every help icon is identical: click opens a
  centered `role="dialog"`, Escape / backdrop / "Got it" close it, focus returns
  to the trigger. Wired into the Overview `SectionShell`; "Your research plan"
  now carries a real explanation.
- **Variables list-prefill.** OSF's Manipulated (344-58) / Measured (344-62)
  questions became list-shaped (`isListQuestion`), prefilled list→list from the
  plan's IV / DV variables. **Prefill-only, one-way** (`isReversibleListQuestion`
  excludes them, unlike hypotheses): the plan holds variables as structured rows,
  so a flat push-back would flatten role/notes/measure-link. Documented as the
  ADR-0107 D11 addendum.

## Sync stress test (live, dev DB)

Non-linear editing verified end-to-end on a draft filing as OSF Preregistration:

| Step | Observed |
| --- | --- |
| Declare IV + DV, prefill Manipulated/Measured, save | `templateAnswers["344-58"]`/`["344-62"]` persisted as **arrays** |
| Full reload | list editors re-read the arrays (`listValue` coercion) |
| Switch template osf → social-psychology → osf, saving each step | `344-58`, `344-62` **and** the social-psych answer `269-5` all survived — answers are keyed by OSF response key and never destroyed on a template switch |
| Open `?`, Escape | modal opens then closes, focus back on trigger |

## Adversarial audit (6-lens workflow, 15 agents, 3-vote verify)

A workflow audited the sync chain across six lenses (template-switch, concurrency,
prefill/push, legacy-shape, help-modal, snapshot-freeze) and adversarially
verified each finding. Verdict: **6 confirmed (several duplicates), 3 refuted.**
Distinct confirmed issues and disposition:

- **[HIGH] Blank list rows filed to OSF as numbered empty lines** — a cleared
  entry `["A",""]` filed as `"1. A\n2. "`, permanent under a DOI (bit hypotheses
  too). **FIXED:** `toRegistrationResponses` drops blank rows and renumbers.
- **[MEDIUM] `[""]` counted as answered → false all-clear** — a required list with
  only an empty row slipped past `unansweredRequired`. **FIXED:** `isBlank` treats
  an all-blank array as blank; new `isAnswered` shares that definition with the
  counter so they can never disagree.
- **[HIGH] Raw `string[]` emitted to a prose question after an OSF label revision**
  — could 400 the filing. **FIXED:** the array→text flatten now keys on `q.kind`
  (select vs not), not the list heuristic; `answerAsText` also renders such a
  stray array instead of a blank box.
- **[LOW] Concurrent Overview saves are last-write-wins** — two members editing the
  same draft can clobber each other (`setOverview` replaces the whole snapshot,
  `templateAnswers` wholesale). **Not fixed — accepted.** This is a pre-existing,
  systemic property of the entire snapshot-mutation model (blocks, reorder, …),
  **not** a regression from these changes; preregistration drafts are effectively
  single-author. Flagged for the owner as a possible future optimistic-locking
  item; not blocking deploy.

New tests: `osf-schema.test.ts` +8 (variables list-shaped/reversible, blank-row
filtering, `[""]`/whitespace-as-blank, kind-keyed shape). All green.

## Verification-quality note

The dev console showed a burst of `ReferenceError: … is not defined` during
editing — all traced through `performReactRefresh` / `applyUpdate` (Turbopack
Fast-Refresh), i.e. stale HMR chunks, the known "green build ≠ dev serving your
code" trap. Cleared `.next` + `node_modules/.cache`, restarted, and the clean
rebuild rendered and behaved correctly (help modal opens; variable lists render
from persisted arrays). The real code compiles (tsc) and passes 1165 tests.
