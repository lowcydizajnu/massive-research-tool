# QA audit — 2026-07-16 — Plan↔report claim binding (LOS Round 2 item ⑥)

## Overview

- **Auditor:** Claude (agent), at the owner's direction. Owner decisions locked via AskUserQuestion 2026-07-15: truth model = **"Bind-to-verify, downgrade only"**; legacy records = **palette-only (opt in)**. Owner chose **"Finish item ⑥ first, then deploy"** so the D4 DOI bug ships in the same release.
- **Scope:** A researcher-declared, machine-verifiable binding from a reported claim to a hypothesis inside a frozen preregistration; the derived Preregistered/Exploratory chip and its referent line; the public amendment history; a Deviations section; and the D4 fix that restores the Preregistration section + DOI to published records.
- **Gates honored:** **ADR-0102 written and committed before any code** (`a7f4214`), then the flow + wireframe + data-model + Vocabulary entries (`bcbf609`), then code. Vocabulary checked against design-rules.
- **Verdict:** done — **1076 vitest green**, tsc/lint/build (27/27) clean. **CODE-ONLY for item ⑥: no migration.** **DEPLOYED 2026-07-16** (`95449be`) after a pre-ship adversarial review; verified on localhost and again on production (see Verification and Deploy).

## What changed

- **`lib/study-record/sections.ts`** — `ClaimBinding` type, `claim?` on `RecordSection`, a `deviations` authored section (`defaultOn:false`), and `claimLabel(claim, resolvesToHypothesis)`. The label is a pure function of whether the binding *resolves* — there is no stored "preregistered" boolean anywhere, by construction.
- **`server/study/prereg-chain.ts`** — the single shared helper: `preregChain`, `publicPreregs`, `newestPrereg`, `bindingResolves`, `boundHypothesis`. One helper on purpose: both public producers are typed `Promise<PublicStudyDetail>`, so a *missing* field is a compile error but a **divergent value** is not, and "preview === published" (ADR-0056 C) would break with a green build.
- **`saveLayout`** validates the binding server-side and throws `BAD_REQUEST` on one that doesn't resolve; `claim` is stripped from non-`hypotheses` sections.
- **`record-composer.tsx`** — the `ClaimBinder`: a "Tests" select of `H1…Hn` from the newest filing, plus a "Report as exploratory anyway" downgrade. **This select is the only path to the word "Preregistered"**; there is deliberately no control that asserts it directly.
- **D4 fix** (`f97eb1c`) — `registrationWithdrawn/Doi/Url` now come from `newestPrereg(chain)`, and `preregistrations: publicPreregs(chain)` is on **both** producers.

## Bugs found and fixed during the build

1. **D4 — a real bug already shipped.** `getPublicStudy` fetched one version (`LIMIT 1`) and gated the registration fields on `ver.kind === "preregistered"`. A study preregistered at v3 and published at v8 therefore **lost its Preregistration section and its DOI** — meaning Round-1 item ② (`61b6478`) only worked *until you published*, which is precisely when a record matters most. Fixed + 4 tests.
2. **`ClaimChip` was imported and rendered nowhere** — see the section below. The entire read side of the ADR was dead code.
3. **`PublicStudyDetail.layout` was a structural copy** of `RecordSection` that never grew `claim`. A value of type `RecordSection[]` assigns cleanly to a narrower inline shape, so nothing complained while the field silently left the public contract. Now references `RecordSection` itself.
4. **The binder rendered a dead dropdown** on a plan with no hypotheses — a "Tests" select whose only option was "— not preregistered —", under copy reading *"Unbound claims are reported as exploratory — that's the honest default."* That implies a choice the researcher never had: the frozen plan named nothing to point at. Now it explains that, and names the only honest route (state hypotheses, file an amendment).
5. **A dead `readOverview` import** in `study-record.ts`, left over when the chain logic moved to `prereg-chain.ts`.

## The item shipped dead — twice — and tests could not see it

This is the second time in two items that a control passed the entire gate while doing nothing (item ⑤'s picker was the first). It is worth stating precisely, because the pattern is now established rather than accidental:

- `ClaimChip` was imported into `record-sections.tsx` and **never rendered**. A researcher could bind a claim to a frozen hypothesis and the record would never say so. The one word ADR-0102 exists to make unforgeable — "Preregistered" — **could not appear on any record at all**.
- It passed `tsc` (an unused import is not a type error), **1074 tests**, `next lint`, and a clean 27/27 build.
- It was found by opening the page and looking at it. Nothing else in the gate could have found it.

**Why lint didn't catch it:** `.eslintrc.json` extends only `next/core-web-vitals`, which does **not** include `@typescript-eslint/no-unused-vars` (that ships with `next/typescript`). An unused-import rule would have caught this in one second, for free. Enabling it flags **86 pre-existing violations**, so it is its own unit of work — logged as a follow-up task. Note the ClaimChip case would have been a *wire-it-up*, not a *delete-it*: mechanically "fixing" such violations by deleting imports would have destroyed the feature instead of saving it.

**The test that should have existed.** Every claim test stopped at `getForEdit` — the **owner's** view. All of them passed while readers got nothing. The new test asserts the binding *and* the resolvable chain on **both public producers**, after a real publish (which also puts a published version on top of the preregistration — the D4 shape). It was verified to bite: stripping `claim` in transit fails it.

## Tests (+2 new, 1076 total)

- `server/trpc/__tests__/studies.test.ts` — a withdrawn preregistration under a published version keeps the two facts on their own rows. This pins the invariant D4 broke: `registrationWithdrawn` used to be `ver.kind === "preregistered" && ver.withdrawn`, so it could only be true when the latest frozen version WAS the preregistration, and callers therefore paired it with `latestVersionNumber`. After D4 they describe different rows.
- `server/trpc/__tests__/study-record.test.ts` — the claim reaches the public record and its preview, not just the composer. Plus the pre-existing item-⑥ suite: the save→read round-trip; the exploratory downgrade persists while an absent one is not stored; a binding to a hypothesis index the plan lacks is refused; **a binding to another study's preregistration is refused** (the forgery test — the ratchet proven, not asserted); a claim is ignored on a non-hypotheses section.

## Verification — VERIFIED LIVE

- `npx tsc --noEmit` → **0**. `next lint` → clean. `npx vitest run` → **0, 1076 tests**. `npm run build` → **0, 27/27**.
- **Driven live in the browser against the signed-in dev app**, on a real preregistration created for the purpose (study `ca0996cb`, "Trust in AI-generated news"): stated H1+H2 in Overview → preregistered (froze **with** both hypotheses, confirming the snapshot-extension pattern gives freeze-for-free) → bound the claim to **H2** in the composer → the record renders the **Preregistered** chip and *"Tests H2 of the preregistration filed 2026-07-16 (v1)"* with the hypothesis quoted. Re-confirmed after a full `.next` + `node_modules/.cache` clear, so no stale Turbopack cache is flattering the result.
- Confirmed in passing: item ⑤'s **preview-response exemption** is real — the study had 8 `preview` responses and 0 `run` responses, and the Preregister stage read "All clear" rather than blocking.
- The binder correctly **hides entirely** on a study with no preregistration ("Do warning labels…", which has none), rather than offering a control with nothing to point at.

## Deploy — DONE 2026-07-16 (`ce281b1` → `95449be`)

- **Item ⑥ carries no migration.** But the **pending push is 26 commits** (all of LOS Round 1 + items ⑤/⑥) and **does** carry `0057_deep_black_cat.sql` (`experiment.license`, from Round-1 `e8a33ad`).
- **Verified against prod (read-only, EU `mrt-production`, region-guarded):** `experiment.license` was **MISSING** and live prod ran `ce281b1`, so **`db:migrate:prod` ran BEFORE `git push`** — the reverse is what 500'd the whole site on 2026-06-26.
- **Executed in order:** migrate → re-verify the column (`experiment.license` NOT NULL default `'CC-BY-4.0'`, **45 rows / 0 nulls**, so every existing study was backfilled) → push 28 commits → poll `/api/health` until it flipped to `95449be` (~160s).
- **Live smoke test, anonymous:** `/` 200, `/browse` **200 (public for the first time)**, `/sitemap.xml` 200 (11 entries, public records only), `/robots.txt` 200. A public record renders **200** with the marker `Published v3` (the fixed marker — not the bogus withdrawn label), its `CC BY` licence (the column the migration added), and JSON-LD.

## A pre-existing bug found while testing this item (out of scope, logged)

Filing an amendment on a legacy study **500s**. `nextVersionNumber` (`server/trpc/routers/studies.ts`) returns `count(frozen) + 1`, which is only correct when the draft sits *outside* the numbering. Studies created before V1.7.1 moved drafts to `versionNumber 0` have their autosave at **1**, so frozen versions run 2..N, `count+1 = N`, and the insert collides with the existing vN — `duplicate key value violates unique constraint "experiment_version_number_unique"`. **Every freeze path — amend, save-a-version, publish — is permanently broken for such a study.**

- Reproduced live on "Bulletproof" (`823e5509`, versions `[1,2,3,4,5,6,7]`): `POST studies.amend → 500`.
- **Dev:** 6 of 18 studies affected. **Prod: 1 of 45** — "First study" in **"MyTest Workspace"** (the owner's own test workspace, created 2026-06-04). 39 of 40 prod drafts are on the modern `versionNumber 0` shape.
- **Assessment: latent, not live.** No researcher is blocked. It stays dormant only because every study since V1.7.1 gets its draft at 0; a restore, an import, or any path seeding a non-zero draft would wake it. Fix is `MAX(version_number) + 1` over all kinds. Logged as a follow-up task with the prod audit numbers; **does not gate this deploy**.

## Known limitations (by design)

- **Binding targets the newest filing only.** A claim bound to an *older* filing still resolves and is surfaced ("still valid; re-pick to bind to v N"), but the select offers only the operative plan. Offering the whole chain is a real design question — it would let a claim cite a hypothesis a later amendment superseded — and belongs in an ADR amendment, not an implementation detail.
- **Legacy records are palette-only** (owner's choice): existing records gain nothing until their author opts in by adding the section and binding.
- **Amendment classification is the author's own label** and is rendered attributed ("classified by the author"), never as fact.

## Cosmetic defects noticed, not fixed (out of scope of this item)

- `"…supersedes vthe live one"` — a literal typo in the amendment panel's user-visible copy.
- `"2 hypothesises in the Overview"` — the readiness check's pluralization.

---

## Pre-ship adversarial review (2026-07-16, before the push)

Given that this feature had already shipped dead twice, the 28-commit deploy was reviewed by 39 agents across six
independent lenses — **ratchet** (can "Preregistered" be forged?), **wiring** (is any new surface unreachable?),
**tenancy**, **migration**, **snapshot**, and **copy** — with every finding then faced by three skeptics instructed to
default to "refuted".

**The three lenses that could have blocked the deploy came back clean.** No path forges "Preregistered" without a
resolving binding; no tenancy or exposure defect; the migration plan was sound. **11 findings confirmed, all fixed
before the push.** The two that mattered:

1. **A regression the D4 fix itself introduced — public-facing.** Re-deriving `registrationWithdrawn` from the newest
   *preregistered* version decoupled it from `latestVersionNumber`, but the record header still paired them. A study
   preregistered at v3 and published at v8 whose registration is later withdrawn rendered **"Preregistration v8
   (withdrawn)"** on a public, crawlable, citable page — a version number that is not a preregistration, on a study
   that is not withdrawn, contradicting the Preregistration section directly below it. The marker now keys off
   `latestKind`; a regression test pins the decoupling.
2. **The `templateKey` bug fixed server-side was still happening client-side.** The Overview editor seeded state with
   the derived default and sent it on every save, persisting a default as a choice the researcher never made — which
   would then beat the derivation forever. `readOverview` refuses to materialize it; the editor did it anyway, one
   layer up. **A fix at one layer is not a fix.**

Also fixed: the binder displayed "— not preregistered —" as *selected* for a claim bound to an earlier filing while
the record published "Preregistered" for it (the composer contradicting the record it previews); the unbound option
named a state the product never renders; the newly-public `/browse` showed anonymous visitors a nav of authed-only
dead ends; the amend form didn't say the summary becomes public; and both literal typos.

**Honest caveat about the method: 0 of 11 findings were refuted**, despite the skeptics being told to default to
refuted. Either the finders were unusually disciplined or the verification prompt did not bite — the pass never
demonstrated it *can* kill a finding, so its 11/11 confirmation rate should not be read as 11/11 precision. Three of
the 11 were the same header bug reported by different lenses; the two typos had already been found by hand.
