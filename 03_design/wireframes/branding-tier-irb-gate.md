# Wireframe spec — Branding tier + IRB attestation gate

- **Serves user flow:** [build-social-post-stimuli](../../02_product/user-flows/build-social-post-stimuli.md)
- **IA placement:** [Studies › study › Design › Social](../ia/information-architecture.md) (gate also fires from Run / Preregister)
- **Persona:** [principal-investigator](../../02_product/personas/principal-investigator.md)
- **Status:** draft

## Purpose

> One sentence: what this screen exists to do.

Let a researcher choose how branded a stimulus is and, for the fully-branded tier, capture a hard IRB attestation that blocks publishing/running until confirmed.

## Layout

Two surfaces:

1. **Tier picker** — a segmented control in Design → Social (and mirrored in a block's Configure for the per-block override): `Block design` · `Layout (inspired)` · `Fully branded`. Each option shows a one-line description + a small fidelity illustration. `Fully branded` expands an inline panel: **logo upload** (presign → R2 / Pick from Materials / Remove) + an **IRB status row** ("Not attested · Review & attest" or "Attested by {name} on {date}").
2. **IRB attestation modal** — opened from the status row or from the blocked Run/Preregister action. A focused dialog with the attestation statement, a required checkbox, and Confirm/Cancel.

## Content inventory

- **Tier segmented control** — `block` / `layout` / `branded`, each with label + helper text. → `theme.socialPost.brandingTierDefault` (or block `config.brandingTier`).
  - *Block design* — "Just the post content. No platform chrome or logo."
  - *Layout (inspired)* — "Full platform layout, clearly inspired — no logo. Requires an acknowledgment."
  - *Fully branded* — "Adds your own uploaded logo. Requires IRB attestation to publish."
- **Mimic acknowledgment** (layout/branded) — the existing ADR-0024 checkbox + warnings text. → `theme.mimicAcknowledged`.
- **Logo upload (branded)** — current logo preview + Upload / Pick from Materials / Remove; "We never provide trademarked logos — upload only marks you're authorized to use." → block `config.brandLogoKey`.
- **IRB status row (branded)** — state chip + action: "Not attested" → "Review & attest"; or "Attested by {name} · {date}".
- **IRB attestation modal** —
  - **Title:** "IRB attestation — branded stimulus".
  - **Statement** (the text the researcher confirms): that their IRB/ethics approval covers presenting a branded imitation of a real platform to participants, that the brand assets are used with authorization, and that they accept responsibility for compliant use.
  - **Required checkbox:** "I confirm the above for this study."
  - **Confirm** (primary, disabled until checked) / **Cancel**.
  - **Audit note:** "Recorded with your name and the current date, and frozen into preregistration."
- **Blocked-action banner** (Run / Preregister) — when a fully-branded block lacks logo or attestation: "This study uses a fully-branded stimulus. Add a logo and confirm the IRB attestation to continue." + "Review & attest" button.

## States

- **Tier = block / layout** — no IRB surface; layout shows the acknowledgment.
- **Tier = branded, not attested** — logo panel + "Not attested" chip; Design saves fine, but Run/Preregister is blocked.
- **Tier = branded, attested** — "Attested by {name} · {date}" chip; publishing allowed (logo present).
- **Modal: unchecked** — Confirm disabled.
- **Modal: submitting** — Confirm spinner; on success the chip flips to attested and any blocked action can be retried.
- **Gate fired from Run/Preregister** — the blocked-action banner + modal; on confirm, the original action proceeds.
- **Error** — attestation write failure → inline error in the modal; mutation rejection (e.g. role) surfaced.

## Interactions

- Select `branded` → reveal logo + IRB rows; selecting away keeps the uploaded logo (lossless toggle).
- "Review & attest" → modal → check → Confirm → `studies.setIrbAttestation({ studyId, attested:true, statement })` (write role); stores `theme.socialPost.irbAttestation = { attested, byUserId, at, statement }`; emits an audit `activity_event`.
- Run / Preregister / Make-live preflight → server rejects (PRECONDITION_FAILED) if any effective-`branded` block lacks `brandLogoKey` or `irbAttestation.attested`; the UI shows the blocked-action banner.
- Editing a frozen/preregistered version is read-only; the attestation displays but isn't re-editable (a new amendment version re-attests).

## Edge cases

- Attestation present, then a researcher removes the logo → preflight blocks again (logo required); chip stays attested but banner explains the missing logo.
- Tier downgraded from `branded` to `layout`/`block` on every branded block → the gate no longer applies (attestation retained but inert; not required).
- Fork/replication copies the attestation (snapshot) — note in the modal that a replication inherits it and the replicator remains responsible (assumed; confirm).
- Non-write member viewing → tier + attestation read-only; actions disabled with a role tooltip.

## Accessibility notes

- The modal is a focus-trapped `dialog` with a labelled title; Esc cancels; focus returns to the trigger.
- The required checkbox is programmatically tied to the Confirm button's disabled state and announced.
- The tier segmented control is a `radiogroup` (arrow-key nav); helper text is associated via `aria-describedby`.
- The blocked-action banner is an `alert` so it's announced when the gate fires.

## Open questions

- Attestation granularity — study-level (assumed) vs per-block. Confirm study-level is acceptable to ethics reviewers.
- Should the statement text be workspace-configurable (institution-specific wording) or fixed copy for v1? (Assumed: fixed copy v1; configurable later.)
- Does a replication require a **fresh** attestation rather than inheriting? (Assumed inherit + responsibility note; confirm.)
