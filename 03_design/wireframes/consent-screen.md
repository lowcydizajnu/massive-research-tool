# Wireframe spec — Consent screen

- **Serves user flow:** [participant-take-a-study](../../02_product/user-flows/participant-take-a-study.md)
- **IA placement:** [Information architecture v0.4 — Build stage + participant runtime](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** ready for handoff

## Purpose

Make the consent step a first-class, researcher-editable part of the protocol: visible in the Builder (pinned, never draggable), with explicit Agree / Disagree choices and a humane screen for participants who decline.

## Layout

**Builder** — a pinned card between the "Blocks" heading and the draggable list:

```
Blocks                                    [+ Add block]
┌──────────────────────────────────────────────────────┐
│ 🛡 Consent screen      Always shown first · pinned   │  ← click → editor in context panel
└──────────────────────────────────────────────────────┘
[ …draggable block rows… ]
```

**Context panel editor** (replaces Configure when the consent card is selected): multiline "Consent text", "Agree button label", "Disagree button label", "Message after declining" — all autosaving on blur, with "Leave empty to use the default" hints.

**Participant start page**: study title · consent paragraphs · `[Agree — begin]` (primary) `[I do not agree]` (quiet link-button).

**Declined page** (`/take/[studyId]/declined`): the researcher's decline message; default: "You chose not to take part — nothing was recorded. You can close this tab." A "Changed your mind?" link returns to the start page.

## Content inventory

- **Pinned Builder card** — shield icon, "Consent screen", "Always shown first · pinned" subtitle; selected state matches block rows; NO drag grip, NO condition/group affordances, NO delete.
- **Editor fields** — body (multiline, paragraphs split on blank lines), agree label (default "Agree — begin"), disagree label (default "I do not agree"), decline message (multiline). Empty → default on read, so existing studies render exactly as before.
- **Participant buttons** — Agree submits the existing begin form (consent IS the begin action; nothing recorded before it). Disagree is a plain link — no data, no tracking.
- **Frozen with the version** — the consent object rides `definition_snapshot`, so preregistration freezes the approved wording and replications carry it.

## States

- **Default** — defaults render verbatim (today's copy).
- **Loading** — n/a (server-rendered).
- **Empty** — empty fields fall back to defaults; the editor shows the default as placeholder.
- **Partial** — only some fields customized: per-field fallback.
- **Error** — autosave failure surfaces the standard mutation error inline; participant pages are read-only.
- **Success / optimistic** — editor saves on blur (matches Overview editor behavior).

## Interactions

- Click the pinned card → context panel swaps to the consent editor; clicking any block swaps back.
- Drag attempts: the card simply isn't part of the sortable list — nothing to mis-grab.
- Participant: Agree → first screen (existing flow); Disagree → declined page; declined page → back link to start.

## Edge cases

- Preview mode: identical consent screen with the preview ribbon; Disagree works the same (nothing recorded either way).
- A decliner clicking Back/Begin later: fine — declining records nothing, so nothing needs undoing.
- Markdown/HTML in consent text: NOT rendered (plain paragraphs) — consent language must not hide content; revisit only with sanitized markdown if asked.
- The pre-flight "consent" rule now reads "Custom consent text" vs "Default consent text" (both pass — having the step is what matters).

## Accessibility notes

- Agree is a real submit button; Disagree a real link — focus order: title → text → Agree → Disagree.
- The declined page is a normal document with an h1 — screen readers land on the outcome immediately.
- The pinned Builder card is a button (opens the editor) with `aria-label="Consent screen settings"`.

## Open questions

- Comprehension-check consent (quiz before Agree) — out of scope; would be ordinary blocks after consent (ADR-0035 revisit trigger).
