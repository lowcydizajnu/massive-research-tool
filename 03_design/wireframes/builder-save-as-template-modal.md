# Wireframe spec — Builder Save-as-template modal

- **Serves user flow:** [Use and save templates](../../02_product/user-flows/use-and-save-templates.md)
- **IA placement:** [Information architecture](../ia/information-architecture.md)
- **Persona:** [Hanna Kowalczyk — postdoc operator](../../02_product/personas/postdoc-operator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Capture the metadata needed to freeze the current study as a reusable, named Template at a chosen visibility.

## Layout

A centered modal (same chrome as the existing `SaveVersionDialog`), opened from a **Save as template** action in the Builder → Details panel (sits next to "Save as named version"). Vertical form: name, description, tags, cover image, visibility, then a footer with Cancel / Save template.

## Content inventory

- **Title** — "Save as template". Static.
- **Name field** (required) — text input, default = current study title, max 64. Source: study title → editable.
- **Description field** (optional) — textarea, max ~280. Source: blank.
- **Tags input** — chips with add/remove (reuse the `TagsSection` pattern; no per-tag Follow here). Source: blank; optional prefill from study tags.
- **Cover image** (optional) — file picker + thumbnail preview; uploads to `ws/<workspace>/templates/<template_id>/cover.<ext>` via the presign path. Source: none.
- **Visibility** — radio group: Private (default) / Workspace-shared / Public, each with a one-line explanation. Source: default Private.
- **Freeze note** — small helper: "Saving freezes the current version; later edits to this study won't change the template." Static.
- **Footer** — Cancel (ghost) / Save template (primary, pending-aware).

## States

- **Default** — name pre-filled, Private selected, Save enabled (name non-empty).
- **Loading** — N/A on open (no fetch); the modal opens instantly.
- **Empty** — name cleared → Save disabled + inline "Name is required."
- **Validating / conflict** — duplicate name → inline "A template with this name already exists." (server check on submit).
- **Uploading cover** — thumbnail shows a spinner; Save waits or proceeds without the cover on failure (non-blocking).
- **Submitting** — Save shows a spinner, inputs disabled; calls `saveAsNamed` then `templates.create`.
- **Error** — top-of-modal error band; nothing written; modal stays open.
- **Success / optimistic** — modal closes; toast "Template saved" with a link to it; if Workspace/Public, mention "shared with your workspace / publicly."

## Interactions

- **Open** — Builder → Details → "Save as template" → modal opens, focus on Name.
- **Tags** — Enter/comma adds a chip; × removes; duplicates ignored.
- **Cover picker** — choose image → client validates type/size → presign → PUT to R2 → store returned key in form state. Remove-cover clears it.
- **Visibility** — selecting Workspace/Public updates the helper copy; on save it drives the `template_published` emit.
- **Save template** — freezes the working tip (`studies.saveAsNamed` with the template name or an auto-label) then `templates.create({ studyId, name, description, tags, coverImageR2Key, shareScope })`. Error path: band + open modal.
- **Cancel / Esc / backdrop** — closes without writing (confirm only if a cover upload is mid-flight).

## Edge cases

- Very long name — capped at 64 with a live counter near the limit.
- Study still has incomplete blocks — allowed (a template can be a scaffold); optionally surface the same incomplete-count hint the version dialog shows, non-blocking.
- Cover upload too large / wrong type — inline error on the picker; rest of the form unaffected.
- Double-submit — Save disabled while pending to avoid duplicate templates/versions.
- Offline — submit fails with the error band; no partial write (saveAsNamed + create should be ordered so a failed create doesn't strand a stray named version — see ADR open question).

## Accessibility notes

- Focus trap within the modal; Esc closes; focus returns to the "Save as template" trigger.
- Visibility is a labeled `radiogroup` with arrow-key navigation and per-option descriptions tied via `aria-describedby`.
- The required Name field uses `aria-required` + an `aria-live` region for the inline validation message.
- Cover thumbnail has an accessible name ("Template cover preview"); the remove control is a real button.

## Open questions

- Ordering/atomicity: do we always create a fresh named version on save-as-template, or reference the latest existing named version if the tip is unchanged? (Assumed: always freeze a named version for a stable reference; ADR to lock whether a stray version is acceptable if `templates.create` then fails.)
- Should tags prefill from the study's research-area tags? (Assumed: yes, prefilled but editable.)
