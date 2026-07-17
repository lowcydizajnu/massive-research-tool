# QA audit — OSF template preregistration, end-to-end (sandbox)

**Date:** 2026-07-17
**Scope:** close the one shipped-but-unproven gap in item ⑨ Phase B — that a template's `registration_responses` carry onto the **permanent** OSF registration (not just the draft), verified against `test.osf.io`.
**Result:** PASS. The template-registration path works end-to-end. No app code changed — verification only.
**Venue:** sandbox (`api.test.osf.io`) — deliberately, so no real-world DOI is minted. Owner authorised (2026-07-17).

## Why this was outstanding

Every OSF call had been separately live-verified and the builders unit-tested, but the **full chain** — `readOsfQuestions` → `toRegistrationResponses` → draft → PATCH responses → **register** — had never run through the `register()` step for a **template** (only draft-only probes and Open-Ended). The register step (OSF copying the draft's responses onto the immutable registration) was the unproven part, and proving it costs a permanent DOI.

## What was run

A throwaway script exercised the **real app builders** (`readOsfQuestions`, `toRegistrationResponses`, `isListQuestion` from `server/modules/osf-schema`) against the sandbox's live **OSF Preregistration** schema (`69d3d9a47249f92f8ed34d74`, 29 questions, 16 required, response keys `220-x` — note these differ from production's `344-x`, which is exactly why the app reads schemas **live**). It built a complete answer set (every non-file question), combined it via `toRegistrationResponses`, then: created a node → draft bound to the schema → set a subject → PATCHed `registration_responses` → **registered** (`registration_choice: "immediate"`) → read the permanent registration back.

## Result — verified on the permanent registration `test.osf.io/f4cru`

- **Registered:** `f4cru`, `registration: true` — a real, immutable registration was created from the template draft.
- **Responses carried:** the permanent registration exposes all **29** `registration_responses` keys (OSF materialises the full schema; our 23 answered keys plus the rest as `""` — consistent with the earlier "OSF fills every key" finding).
- **List-shaped hypotheses (the new item-⑨ code):** `220-2` filed as combined numbered text — `"1. H1: The warning label lowers perceived accuracy…\n2. H2: The effect is larger for older participants."` — proving the D11 list→push combining reaches the immutable record, not just the draft.
- **Select byte-exactness:** `220-4` (Foreknowledge) filed as the exact option string `"Data does not yet exist. No part of the data…"` — the byte-exact contract (ADR-0107 D6) holds through registration.
- **DOI:** empty immediately after registering (`/identifiers/` returned none) — the registration is `public: false`, pending approval on the sandbox, and OSF mints the DOI asynchronously. This is the expected path the app's **OSF watch** (`runOsfWatch`) backfills; DOI-minting-at-registration was separately verified on this account in the 2026-07-16 pass (8/8).

## Bug found — in the verification script, not the app

The first read-back used `GET /registrations/{id}/?embed=registration_responses` → **400** (`registration_responses` is a plain attribute, not embeddable). Fixed by reading the attribute directly. The registration itself had already succeeded; this never touched app code.

## Residue

One throwaway sandbox registration (`f4cru`) + its node (`6pjhw`) remain on `test.osf.io` under the test account — sandbox artifacts, not the real scientific record, immutable (registrations can't be deleted). No production osf.io artifact was created; the app's stored OSF connection was never touched (the script used the sandbox token directly, not `pushRegistration`'s decryption path).

## Net

The item-⑨ Phase B template-registration path is now proven end-to-end. The STATUS caveat "no filing has been made with this code" is closed (sandbox).
