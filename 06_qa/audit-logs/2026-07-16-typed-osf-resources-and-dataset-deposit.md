# QA audit — 2026-07-16 — Typed OSF resources + dataset deposit (LOS Round 2 items ⑦ + ⑧)

## Overview

- **Auditor:** Claude (agent), at the owner's direction. Owner decisions this session: re-deposit must be **"transparent but not block"** (the case being *"collecting more responses to reach the effect size"*); N comparison = **deposit-to-deposit** (chosen via AskUserQuestion over comparing to the recruitment target or parsing the free-text plan); and explicit consent to mint **exactly one** permanent DOI for verification.
- **Scope:** ADR-0103 (+ am. 1, 2), ADR-0104 (+ am. 1), ADR-0105 (+ am. 1); `registry.osf`, `studyRecord`, `prereg-chain`, the Linked outputs panel, migrations 0058–0059.
- **Gates honored:** ADR amendments written and committed **before** the code they govern (`e908879` precedes `8766af4`); wireframe + data-model updated with them; `validate.py` clean.
- **Verdict:** ✅ cleared for deploy behind the migration order below. ❌ one composite path knowingly unverified — stated in *Owed*, not implied.

## What the gate could not see

Every finding below passed `tsc` + ~1,090 vitest + lint + a clean build **before** it was found. None was found by the suite.

### 1. `makeOutputCitable` could never have succeeded — for anyone

`mintNodeDoi` POSTs `/nodes/{id}/identifiers/`. OSF's `IdentifierList` carries `EditIfPublic`:

```python
if request.method not in permissions.SAFE_METHODS: return obj.is_public
```

We create every project **private** (`pushRegistration` step 2), and **nothing anywhere set a node public**. So the mint was refused `403 "You do not have permission to perform this action."` — an error naming neither the cause nor the fix.

Worse than dead: the consent dialog promised *"This makes your OSF project public"*. The researcher would consent to a publication that never happened, then get an inscrutable permission error. **A promise with no code behind it.**

Not a scope problem — `osf.full_write` → `FULL_WRITE` → `NODE_ALL_WRITE` → `NODE_METADATA_WRITE` → `IDENTIFIERS_WRITE`. Ruled out from OSF's source before touching code, because the 403 alone cannot distinguish "private node" from "missing scope".

**Fix:** `mintNodeDoi` publishes first. Two tests: the PATCH lands *before* the POST; an already-minted node is not published again. Both fail with the fix removed (verified by removing it).

### 2. The consent dialog minted the wrong artifact

`onConfirm` hardcoded `resourceType: "materials"`. Invisible while materials was the only mintable slot — but item ⑧ gives `data` a path, and confirming on the **Data** row would have minted **materials** and reported *"Linked — your materials now have a DOI."* Now dispatches on what was confirmed, and `MintableType` is typed so widening the server without the panel is a compile error.

### 3. ADR-0105 D2's PID refusal named a column that does not exist

The ADR said refuse when `headers` contains `externalPid`. That is the internal `ExportColumn.key`; `buildMatrix` emits `headers: visible.map(c => c.label)` — **`external_pid`**. Implemented as written, the block **matches nothing, never fires, and hands a permanent DOI to a dataset carrying Prolific worker IDs** — precisely the harm D2 exists to prevent, defeated by camelCase.

**Fix:** one exported `PID_COLUMN_LABEL`, imported by both the export and the refusal, so the two cannot drift. The test uses that constant, not a fixture — a fixture would have agreed with whichever spelling the code used, which is how the hole stayed open.

### 4. The gate said "wait" for DOIs that were never coming

`awaiting_registration_doi` fired for **every** DOI-less preregistration. True while a push is `pending`; a lie for `no_credentials` / `opted_out` / `not_pushed` (never sent) and `failed`. Now three reasons, only one of which asks for patience.

### 5. The registration DOI was never fetched

The adapter claimed *"the DOI is minted on approval"* and returned `doi: null`, leaving it to `runOsfWatch` — an Inngest cron that **never runs in dev**. The two registrations this app pushed on 2026-06-03 had carried their DOIs on osf.io for six weeks while our rows held null. That null was what blocked the whole panel.

## Verified live against `api.osf.io`

Owner connected OSF, and consented to **exactly one** permanent DOI.

| Claim | Result |
|---|---|
| DOI minted at registration time, not approval | 8/8 registrations, incl. one **private** and two **withdrawn** |
| Registration's own DOI refused as a resource (D1) | `400 IsPrimaryArtifactPIDError` — the fact that inverts the roadmap |
| Type enum = `OSF_PUBLIC_RESOURCE_TYPES` | OSF named its options in the error; our five are exact |
| Three-call dance mandatory | finalize without content → `409` naming `['pid','resource_type']` |
| `unlinkResource`'s route (was a guess) | `DELETE /resources/{id}/` → `204` |
| **Several `data` resources on one registration** | Both finalized, both listed — **the one-per-type limit was ours, not OSF's** |
| Child component create / list / delete | `201` / listed / `204` |
| **The mint** | component `7rj2c`, **`10.17605/OSF.IO/7RJ2C`**, `public: true`, `doi.org` → `302` → `osf.io/7rj2c` |
| Mint idempotency | second call returned the same DOI, no re-POST |

Every throwaway resource/component was deleted; the registration ends at `[]`. `7rj2c` is left in place deliberately — deleting it would leave the DOI resolving to nothing.

**Corrected mid-flight:** I first read `PATCH public:false → 400` as "publishing is irreversible". The actual body was *"This project's node storage usage could not be calculated"* — a transient quirk on an empty node. Nothing is claimed either way; the status code alone would have been a fabricated finding.

## Verified in the browser

- Five slots render for the first time (gate open on a real `5ZMFA` DOI).
- The `data` ladder walks: nothing published → **PID present** → no OSF project → **Deposit to OSF**.
- The PID refusal fires against a real published table carrying `external_pid` (`auto: null` — no button offered).
- The consent says the deposit-shaped truth: a *new component*, *download it*, and exactly the published table.

## Owed — not implied

**The full deposit, chained end to end, has not run.** `createComponent`, `uploadMaterials`, `mintNodeDoi` and the three-call link are each verified live and separately; the mutation that chains them is covered only by mocked tests. Verifying it costs a **second** permanent DOI on a real registration, which was not consented to. Stated here rather than buried.

**Unobserved:** a pending-approval registration without a DOI (the account has none), and whether a public node can be made private again.

## Gates

`tsc` 0 · **1,098** vitest · lint 0 · build 0 · `validate.py` clean (288)

## Deploy order (non-negotiable)

`0058` (adds `osf_dataset_component_guid`) then `0059` (drops it, adds `dataset_deposit`, makes the unique index partial). 0058 never shipped, so prod runs add-then-drop in order — wasteful, correct, and cheaper than rewriting an applied migration's checksum. **`db:migrate:prod` BEFORE `git push`.** Verify at `myresearchlab.app/api/health`.

## Process

Two blind spots hid one bug for six weeks, and they compound: **Inngest crons don't run in dev**, so a cron-backfilled column sits null locally forever; and **mocked adapter tests agree with whatever you believe about the vendor**. A wrong belief written in a comment (`doi: null` "because approval") survives 1,000 green tests indefinitely. The falsifying evidence sat in OSF's API the entire time and took minutes to fetch. Probe the vendor before trusting the comment — and check for a DELETE route first, so the probe costs nothing.
