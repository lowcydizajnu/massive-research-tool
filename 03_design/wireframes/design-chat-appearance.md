# Wireframe spec — Design — Chat appearance

- **Serves user flow:** [hanna-build-a-study](../../02_product/user-flows/hanna-build-a-study.md)
- **IA placement:** [Studies › study › Design](../ia/information-architecture.md)
- **Persona:** [postdoc-operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Let a researcher style the AI conversation window participants see — name, avatar, bubbles, colours, font — without leaving the Design stage.

## Layout

The Design stage gains a sub-nav: **Theme · Chat**. Chat sub-tab is the same two-column shape as Theme — a controls column (left) + a **live chat-window preview** (right) that re-renders on every change. Edits autosave via `studies.setTheme` (the appearance lives in `theme.chat`).

## Content inventory

- **Sub-nav** — Theme / Chat. Source: static; Chat active here.
- **Assistant name** — text input (default "Assistant"). → `theme.chat.assistantName`.
- **Avatar** — current avatar preview + "Upload" (presign → R2) and "Pick from Materials" (reuses L3) + "Remove". Stored as an R2 key; falls back to a default bot glyph. → `theme.chat.avatarKey`.
- **Participant label** — what the participant's own bubbles are called (default "You"). → `theme.chat.participantLabel`.
- **Bubble colours** — assistant bubble + participant bubble, each chosen from the **theme palette** swatches (token-based, not a raw hex field). → `theme.chat.assistantBubble` / `participantBubble`.
- **Bubble shape** — radius (rounded / squared) + **density** (comfortable / compact). → `theme.chat.bubbleRadius` / `density`.
- **Font** — picker over the study's theme fonts (no new fonts). → `theme.chat.font`.
- **AI-disclosure line** — toggle (default ON) + editable text ("You're chatting with an AI."). A note explains it's recommended for participant ethics. → `theme.chat.aiDisclosure` / `aiDisclosureText`.
- **Composer placeholder** — text (default "Type your reply…"). → `theme.chat.placeholder`.
- **Typing indicator** — toggle (default ON) for the bouncing-dot animation. → `theme.chat.typingIndicator`.
- **Live preview** — a non-interactive chat window: avatar + name header, the opening message bubble, a sample participant bubble, the disclosure line, the (disabled) composer — all reflecting the current settings.
- **"No AI block yet" hint** — if the study has no `ai-chat` block, a muted note: "Add an AI conversation block in Build to use this." (Settings still save.)

## States

- **Default** — controls populated from `theme.chat` (or sensible defaults); preview rendered.
- **Saving** — autosave indicator (shared with the Theme tab).
- **Avatar uploading** — the avatar slot shows a spinner; preview updates on success.
- **Empty (no AI block)** — the hint above; editor still usable.
- **Error** — avatar upload failure inline; setTheme failure → the shared autosave error treatment.

## Interactions

- Any control change → optimistic local update of the preview → debounced `studies.setTheme({ theme: { …, chat } })`.
- Avatar Upload → file picker → presign → PUT → set `avatarKey`. Pick from Materials → the L3 modal (kind=image) → set `avatarKey`. Remove → clear.
- Colour swatches → pick from the theme palette only (keeps brand + v0.6 lock).
- AI-disclosure toggle off → a confirm/explainer ("Disclosing AI use is recommended for participant ethics") but allowed.

## Edge cases

- Long assistant name / disclosure text — truncate in the header; wrap in the bubble.
- Missing avatar asset (deleted material) — fall back to the default glyph (orphan-safe key).
- Multiple AI blocks — the appearance applies to all of them (per-study); preview notes "applies to every AI conversation in this study."
- Theme preset is a chat preset (whatsapp/discord/imessage) — chat appearance layers on top; document precedence (explicit `theme.chat` wins).

## Accessibility notes

- Bubble colour choices must keep AA contrast against their text token — surface a contrast warning if a palette pick fails (reuse the Theme tab's contrast check).
- The disclosure line renders as real text in the participant chat (not just a tooltip).
- Controls are labeled; the live preview is `aria-hidden` (decorative mirror of the controls).

## Open questions

- Per-block override (a study with two AI personas) — deferred; confirm the per-study default is enough for v1.
- Should the AI-disclosure line be non-removable (hard ethics floor) vs default-on-but-removable? (Assumed: default-on, removable with an explainer.)
