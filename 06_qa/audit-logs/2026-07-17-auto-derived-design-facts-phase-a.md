# QA audit — LOS item ⑨ Phase A: auto-derived design facts

**Date:** 2026-07-17
**Scope:** ADR-0106 Phase A (narrow deriver + provenance + OSF disclosure), [`overview-stage.md`](../../03_design/wireframes/overview-stage.md)
**Result:** Build complete, committed unpushed. Code-only — no migration, no seed.
**Gate:** tsc 0 · lint 0 · **1126 vitest** · `validate.py` clean (290 instances)

---

## What was built

A panel that states what the built study **is** — screen count, arms and weights, timings, measures — and a way to turn a measure into a declared variable. Nothing is stored: `deriveDesignFacts()` recomputes on every render from the raw snapshot, so the panel cannot go stale.

The never-derive set is the point, and it lives in a docstring at [`design-facts.ts`](../../05_app/server/modules/design-facts.ts): no hypothesis, no analysis plan, no sample size, no construct, **no variable role**. ADR-0106 D3 rejects auto-filling PlanField prose outright — an auto-written plan the researcher never read is the exact failure mode preregistration exists to prevent.

Provenance reuses the ADR-0102 ratchet: `source: "derived"` iff the block link resolves, computed server-side, **never accepted on the wire** (`planFieldSchema` is `{text}` only).

## Findings

### 1. The client was about to revert the provenance slot ADR-0101 built

`overview-editor` hardcoded `source: "researcher"` on all five PlanFields and sent it. The first save by anyone would have overwritten every derivation. Fixed by not sending `source` at all and computing it server-side, like `dataCollectionStatus`.

**Class:** a field the server owns must not be writable by the client merely because it is part of the same object.

### 2. The seam the owner caught — duplication, not a bug

> *"why use so many names, at the top name is measure but in the listing is called Variable… I see in Measures listed the same items which right below are described as a not yet listed"*

I had bolted ⑨'s Measures next to ⑤'s Variables with a "Use this" bridge: the same rows, twice, under two names. Every gate passed — it was correct code building a confusing product.

Fixed to **one row, one action**: a measure is a *fact* and lives in the panel; a declaration is *intent* and lives in Variables. The row offers **Declare variable** when undeclared and states **Declared: \<role\>** when declared. Never both, never a second list.

**Class:** a green gate cannot tell you that two correct features overlap. Only reading the screen as a user can.

### 3. A derived variable filed to OSF as though a human wrote it

`osf-recipe` reads `.name`/`.role` and never looked at `.source`, so a variable read from the design was indistinguishable in the filing from one the researcher typed. The filing overclaimed authorship — a real integrity problem, not a cosmetic one.

`derivationDisclosure()` now names the derived variables and the steps they were read from, riding in **both** filings (Open-Ended summary; Recipe description `77-2`, alongside VARIABLES — **no OSF key invented**, per the ADR-0101 rule). It deliberately does **not** claim the role was derived.

Per owner direction 2026-07-16 (*"at the end of the day it is his study so we should solve it with some toggle/checkbox selected by default"*): on by default, opt-out, **no nag on unchecking**. Shown only once something is actually derived — with nothing derived the filing says nothing either, so the control would govern an empty set. The wireframe was updated to match the build rather than the reverse.

**Absent = ON** in the tolerant read. A study saved before the toggle existed must not silently opt out of a choice nobody made. The two `readOverview` shape tests caught this by pinning the full shape with `toEqual` — the good kind of brittle.

### 4. The Replication prompt-as-answer bug (owner: *"The fix, not alternative."*)

`injectReplicationRecipe` seeded sections whose **content was the question we were asking**, and `buildRecipeResponses` filed that text back to OSF as the researcher's answer. Proven by running the two functions against each other rather than by reading them.

Now `injectReplicationRecipe` only sets `replicationIntent`. General rule recorded in ADR-0101: **a fallback must never return content the SYSTEM authored.**

## Verification

Live in the browser, against the signed-in dev app — because the standing lesson (3× now) is that **tests cannot see a dead control**:

1. Panel renders: `2 screens`, `One group (no conditions)`, the measure with its response type.
2. Checkbox **correctly absent** while nothing is declared.
3. Click **Declare variable** → row flips to **Declared: Dependent**; checkbox appears, **checked**.
4. Uncheck → **Save overview** → **full page reload** → still unchecked. The opt-out came back **from the database**, so the control is live end to end: UI → tRPC → snapshot → `readOverview` → UI.
5. Study restored to its default (checked) afterwards — the test flipped real state.

## Verified live against api.osf.io — with nothing permanent created

The owner authorized OSF testing (*"if you want test disclosure in real osf you can do it… it dedicated to test the app"*). Permission is not a reason to leave permanent residue, so the probe was designed for the smallest footprint that still answers the question.

**The seam that made it free.** The app's own push writes `registration_responses` to a **draft** ([`registry.osf.ts:504-526`](../../05_app/server/adapters/registry.osf.ts)) and only then registers it (line 529). Line 529 is the sole irreversible step: it mints a DOI that can never be deleted, and withdrawal leaves a public tombstone. So the probe ran 504–526 **verbatim** — same calls, same body shape, same field, real API — and stopped. It used the app's real `buildOpenEndedBody` / `buildRecipeResponses` / `derivationDisclosure` against the real snapshot of study `d05b8eba` (tip `ca84e034`), and the app's own `decryptSecret` path for the token, so nothing was reimplemented for the test.

**Reversibility was proven before it was relied on.** Whether `DELETE /v2/draft_registrations/{id}/` works was established only from OSF's source, never observed. The probe therefore created a throwaway draft and deleted it *first*, and would have aborted before creating anything else had it failed:

```
4. DELETE probe: create=201 delete=204 then-get=410
```

**Results** (node `wds4y`, account `Pawel R` / `rg94m`, solo contributor — checked, because a second contributor could have triggered an unrecallable notification email):

| Path | Result |
| --- | --- |
| Open-Ended → `registration_responses.summary` | `PATCH 200`; round trip **byte-identical**; OSF echoes `HOW THIS PLAN WAS PREPARED` and the derived variable name |
| Recipe → `registration_responses["77-2"]` | `PATCH 200`; carries the disclosure **and** still carries `VARIABLES` |

The exact text OSF accepted:

> HOW THIS PLAN WAS PREPARED
> One variable was read automatically from this study as built in My Research Lab, and is linked to the step that measures it: Jak oceniasz... (from "Likert (7-point)"). What each one means — its role in the analysis — was decided by the researcher, as was the rest of this plan.

**Bonus finding:** OSF accepted the Recipe's `77-2` key at draft-PATCH time (200), which settles an open question — key validity is not deferred to registration, so a bad key would surface in the safe window rather than as a late 400.

**Cleanup, audited:** both proof drafts deleted (`204`), no probe draft appears in `/users/me/draft_registrations/`, and registrations on `wds4y` remained **1** — unchanged. No DOI minted, no public object created.

## Residue — the honest full footprint

- **3 soft-deleted draft rows** persist in OSF's own database (`perform_destroy` sets a `deleted` timestamp rather than purging). They are invisible to every API listing, were never public (`is_public` is hard-coded `False` on drafts), and never carried an identifier.
- Possibly a few private NodeLog lines on `wds4y` recording draft creation. Not confirmed either way — I did not read OSF's log-creation path, so this is stated as unknown rather than denied.

## Still not verified

The final hop — OSF copying `registration_responses` onto the permanent registration at `draft.register()` — was **not** observed, deliberately. Buying that observation costs one undeletable DOI. The disclosure text is composed by our code and handed to OSF at the PATCH; it is correct in the draft, and the copy is OSF's own internal step. Not worth a permanent artifact on the owner's account.

## Next

Phase B — the OSF template picker (required-field gate + late-400 handling), unblocked by the live `schema_blocks` read (2026-07-16): `required` and the exact select-option strings are exposed. The roadmap's template names are wrong, there are 44 schemas not 14, and Eye-tracking/EEG are out on capability grounds — see ADR-0106.
