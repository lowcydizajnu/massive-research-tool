# ADR 0024 — Per-study participant theming + presets

- **Status:** accepted
- **Date:** 2026-06-10
- **Deciders:** project owner, Claude (agent)
- **Tags:** theming, participant-runtime, ADR-0012-amendment, ADR-0013-related

## Context

Researchers need to control what participants see — appearance is methodology (ecological validity; "research-context noise" changes behaviour). The workspace's design language (warm parchment + Plex Serif) is the RESEARCHER-side language; a study needs its own participant-facing look, frozen with preregistration, carried by replications. Handoff Section F (V1.12, Wave 5).

## Decision

**Theme rides in `definition_snapshot.theme`** (NOT a new column — deviating from the handoff's jsonb-column sketch to follow the established ADR-0012 pattern used by `overview`/`groups`): zero migration, frozen-with-preregistration for free, copied by fork (replications render identically), diffable by the protocol-text serializer later.

- **Shape (`lib/themes/types.ts`):** `StudyTheme = { presetKey, colors {page, card, text, muted, accent}, typography {headingFont, bodyFont, baseSize S|M|L}, shape {radius sharp|soft|rounded|pill, density compact|normal|spacious}, layout {width narrow|medium|wide, progress bar|steps|none, backButton } }`. All enums + colors validated server-side by zod allowlists (color = strict hex; fonts = curated keys only). No scripts, no arbitrary CSS, no remote fonts.
- **Application (ADR-0013-consistent):** the take pages resolve the theme **server-side** to a CSS-variable override map on a wrapper element, overriding the SAME token names the take components already consume (`--color-surface-page`, `--color-surface-canvas`, `--font-serif`, `--radius-md`, …). No client-side theme switching; deterministic for analytics. Layout primitives (page width, progress style, Back visibility) are read in the take page render.
- **Source of truth at render:** the participant's session version's snapshot (question/complete pages); the start page uses the study's current version. Draft edits therefore show in preview immediately; frozen versions keep their frozen theme.
- **Presets are vetted code we ship** (`lib/themes/presets.ts`): Academic (default = today's look), Clinical, Modern, Playful. Researchers pick + tweak primitives; they cannot author presets (marketplace question, ADR-0008 substrate).
- **Surface:** a new **Design** stage tab (wireframe `03_design/wireframes/design-stage.md`): preset picker + granular primitives + live sample; saves via `studies.setTheme` (write role, tip only).

## Options considered

- **Snapshot field (chosen)** — consistency with overview/groups, no migration, freeze + fork semantics free.
- **`experiment_version.theme` jsonb column** (handoff sketch) — same semantics but needs a migration and a second write path; rejected for consistency.
- **Study-scoped theme (on experiment)** — rejected: preregistered look must freeze; version-scoped enables A/B of presets across published versions.
- **Tailwind class swapping / CSS-in-JS at runtime** — rejected: ADR-0013 server-rendered MPA; CSS variables on a wrapper are zero-JS.

## Consequences

- Old snapshots have no `theme` → Academic defaults apply (pure `readTheme` fallback).
- The researcher-side workspace look is untouched; only `/take/*` (and the Design sample) respond to themes.
- Platform-mimicking presets (Facebook/X/News/…), per-block renderer overrides, and the IRB acknowledgment modal are **Wave 5 continued** — this ADR fixes the storage/validation/application substrate they'll plug into (`presetKey` + future `warnings` field).
- Participant-copy overrides (Section G) will ride the same snapshot pattern (`copy` field) later.

## Amendment (2026-06-10) — mimicking quartet + acknowledgment + renderer overrides

Wave 5's platform-mimicking quartet shipped on this substrate: presets **facebook / x / news / business** with `PRESET_WARNINGS` (researcher-language ethics/disclosure warnings). Saving a warned preset requires the researcher's explicit acknowledgment — the Design stage shows the warnings + a disclosure checkbox, the acknowledgment is stored in the theme (`mimicAcknowledged`, frozen with the snapshot), and `studies.setTheme` rejects unacknowledged warned themes server-side (PRECONDITION_FAILED). The **per-block renderer override contract** also landed: `getBlockOverride(presetKey, blockKey)` maps to vetted server components in-repo (never user content); facebook/x override `social-post` (feed-post / tweet stimulus fidelity); everything else falls back to the default renderer under the preset's tokens. Density gained a third knob (`--take-field-gap`, within-block spacing) and block prompts/legends now use the heading-font token, so the typography controls visibly apply. Still queued: Overview auto-injection of the chosen preset into methodology, Wave 5b presets (Instagram/TikTok/lifestyle/forum/blog), input-level overrides beyond stimuli. Engagement reactions (V1.19.x) use a SCOPED client component (`reaction-toggles.tsx`) — the second ADR-0013 client-JS exception after reaction-time — because live +1 counters and radio-deselect aren't expressible in pure HTML; the selection still posts via hidden inputs with the screen's form.

## Revisit triggers

- Overview auto-injection of the chosen mimicking preset into the methodology section (queued from the handoff's IRB block).
- **Page-level platform chrome** (owner idea, 2026-06-10, parked): a preset-supplied `PageFrame` (fake nav bar / feed column around the blocks) using the same vetted-component contract as block overrides. High immersion value; risks = dead-looking interactive chrome + heavier deception review. Analyze when 5c lands.
- Demand for custom fonts/logos → R2 upload path (ADR-0003) + content-type validation.
- Per-block-type style overrides → the contracted `blockStyleOverrides` map from the handoff (schema-validated).
- A theme marketplace → revisit "presets are vetted code only".

## References

- Handoff Section F: `04_architecture/handoffs/code-tab-v1120-functional-polish.md`.
- ADR-0012 (snapshot model), ADR-0013 (participant runtime SSR), ADR-0018 (fork copies snapshot).
- Wireframe: `03_design/wireframes/design-stage.md`.
