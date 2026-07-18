# ADR 0109 — Condition assignment: clearer split + a balanced method

- **Status:** accepted
- **Date:** 2026-07-18
- **Deciders:** Paweł Rosner
- **Tags:** runtime, data-model, conditions, randomization, preregistration

## Context

The Conditions section ([builder-conditions.md](../../03_design/wireframes/builder-conditions.md)) lets a researcher define a study's arms. Each condition stores an **`allocationWeight`** (a raw number); the UI shows it as a bare integer input (`1`, `2`) plus a computed `≈33% / ≈67%`. At `/take` time, `pickCondition` (`server/runtime/participant.ts`) does an **independent weighted coin-flip per participant** (`Math.random()` over the weights) — the mechanism ADR-0014 specified.

Two problems, both raised by the project owner (2026-07-18):

1. **The weight input is opaque.** A researcher sees `1` and `2` and has to infer "one part to two parts = 33/67." It reads as a vague number, not an allocation. *"Slightly vague input with numbers."*
2. **There is only one, unnamed way to randomize, and it is the weakest one.** Independent per-participant draws mean cell sizes **drift**: 33 participants at a 50/50 split can land 12/21, not 16/17. Balance only appears at large N. The owner asked for *"a dropdown with different ways of randomizing"* — a real methodological choice, not just a relabel. (Confirmed scope 2026-07-18: **both** the split-clarity control and the method control.)

This is the conditions/arm axis only. Factorial **variant cells** (ADR-0058) are a separate randomization (`pickCell`, uniform between-subjects) and are out of scope here. The prior "Set up an A/B test" conditions shortcut was reverted (2026-06-15) — version-level A/B is a different, deferred feature; this ADR does not touch it.

## Options considered

### Option A — Relabel only: express weights as percentages, keep one method

- Swap the weight number for a percentage input; keep independent weighted random.
- **Pros:** smallest change; no schema, no runtime.
- **Cons:** ignores half the ask (no balanced method); the methodologically weak drift stays, unnamed, and a researcher who wants even groups can't get them.

### Option B — Split control + a new assignment-method field *(chosen)*

- **Split** stays the existing `allocationWeight`, but is *expressed* as **Equal split** (numbers hidden; each arm shows its even share) or **Custom split** (percentage inputs that must total 100). No new split column — Equal = all weights equal, Custom = weights are the entered percentages; the UI derives which to show.
- **Method** is a new per-version field, **Simple random** (today's independent draw) vs **Balanced** (permuted-block). Default `simple` — backward-compatible, and it freezes with the version.
- **Pros:** meets both asks; the weak default is now a named, deliberate choice; balance is available; minimal schema (one enum).
- **Cons:** balanced assignment is stateful (needs the running counts), so it needs care for concurrency; the method is one more thing the preregistration must disclose.

### Balanced algorithm — permuted-block vs minimal-deviation

- **Minimal-deviation / biased-coin:** assign `argmin_i(count_i / weight_i)`. Balanced, trivially stateless, but **fully deterministic** — the next assignment is predictable, so it is *balanced allocation*, not *randomization*.
- **Permuted-block *(chosen)*:** the recognized clinical-trial standard. The allocation ratio, reduced to its smallest integer form (weights ÷ GCD), defines a **block** (e.g. 50/50 → `[A,B]`; 1:2 → `[A,B,B]`); each block is a **shuffled** permutation; participants consume the block in order, and a fresh block is drawn when it is exhausted. Balanced at every block boundary, random within a block. Reproducible **without stored mutable state**: seed the shuffle deterministically from `(recruitmentSessionId, blockIndex)`, and derive the participant's slot from their **ordinal** (the count of prior real assignments in the session). The only shared state is that count, which already exists as rows.

## Decision

**We will keep the allocation as `allocationWeight`, express it in the UI as Equal split or Custom percentages, and add a per-version `conditionAssignment` method — `simple` (unchanged independent weighted draw, the default) or `balanced` (seeded permuted-block randomization). Balanced assignment reads the session's running count under a row lock and derives the participant's arm from a reproducible per-block shuffle.**

The reasoning: the split and the method are genuinely different questions — *how big are the groups* vs *how are people put into them* — so they get two controls, not one overloaded number. Equal/Custom fixes the opacity without a schema change, because a percentage split **is** a set of weights that sum to 100 and an equal split **is** equal weights; nothing new needs storing. The method is a real methodological commitment, so it lives on the frozen version and is disclosed in the preregistration, and its default stays `simple` so every already-running study behaves exactly as before. Balanced is permuted-block because that is the method reviewers recognize by name, and it is implementable without a mutable per-session block: a deterministic shuffle seeded on the session and block index, indexed by the participant's ordinal, gives exact balance at each block boundary while staying reproducible and race-safe under a lock.

### D1 — Split is not a stored mode; it is the weights, rendered two ways

Equal split ⇒ all `allocationWeight` equal (the UI writes `1` to each). Custom split ⇒ each weight is the entered percentage (0–100, ideally summing to 100; the UI shows the live total and nudges, but does not hard-block — an off-100 split is still a valid weighting, just relabeled). The UI shows **Equal** when all weights are equal, else **Custom**. No `splitMode` column: a second source of truth for "are these equal" would drift from the weights it describes.

### D2 — `conditionAssignment` is one enum on `experiment_version`, default `simple`

A study uses one assignment method across its arms, and the method must **freeze** with the design (it is part of what a preregistration promises), so it lives on `experiment_version` (copied wholesale by the four freeze mutations, like every other version field), not on `condition` and not in the snapshot JSON. `pgEnum('condition_assignment', ['simple','balanced'])`, `NOT NULL DEFAULT 'simple'`. Absent ⇒ simple ⇒ **every existing study is unchanged**.

### D3 — Balanced = seeded permuted-block, ordinal from a locked count

At `beginResponse`, when the version is `balanced`:
1. Reduce the integer weights by their GCD to the smallest whole-number ratio; the **block** is that multiset of arm slots (e.g. weights 30/70 → 3/7 → a block of 10; 1/1 → a block of 2). Sum(weights) is the block size.
2. The participant's **ordinal** `k` = count of prior **real** (`mode = 'run'`) responses in this session. Preview responses never count (they must not perturb real balance).
3. `blockIndex = floor(k / blockSize)`, `slot = k % blockSize`. Deterministically shuffle the block with an RNG seeded from `hash(recruitmentSessionId + ':' + blockIndex)` (a small seeded PRNG — mulberry32/xorshift — so it is pure and reproducible, unlike `Math.random`). The chosen arm is `shuffledBlock[slot]`.
4. **Atomicity:** the count-then-insert must be serialized, or two simultaneous begins both read `k` and collide on `slot`. We take a `SELECT … FOR UPDATE` lock on the `recruitment_session` row for the balanced branch, do the count + insert inside that transaction, and release. Simple random keeps its lock-free path (independent draws cannot collide). Contention is one short lock per participant *start*, only for balanced studies — negligible at study scale.

Non-integer/степ weights (the input allows `step 0.5`) are rounded to integers for block construction; the exact ratio a researcher sees is what balanced approximates to the nearest whole block. Documented in the helper copy.

### D4 — The method is disclosed, not silent

`deriveDesignFacts` already surfaces arms + weights; it gains the **assignment method** so it rides into the Overview protocol narrative and the OSF push (Open-Ended body + the derived-facts disclosure), exactly like the arms it sits beside. A reader of the preregistration sees *"two arms, 50/50, balanced (permuted-block)"* — the design is self-describing. No new OSF key; it joins the existing arms prose.

### D5 — Scope: conditions only

Factorial variant cells (ADR-0058, `pickCell`) stay uniform-random between-subjects. Balancing them is a real but separate want (variant balance is a different combinatorial object); if asked, it is a follow-up that reuses the permuted-block engine over cells. Noted, not built.

## Consequences

- **Easier:** a researcher gets even groups by picking "Balanced" instead of hoping large-N convergence saves them; the split reads as what it is; the preregistration states the method.
- **Harder:** balanced assignment is stateful and locked, so `beginResponse` gains a transaction on that branch; the method is one more frozen field to carry through freeze/replicate/amend and to disclose.
- **Committed to:** the method freezes with the version and is part of the record; permuted-block's block size follows the reduced weight ratio (a 33/67 split blocks every 100 — reduce to 1:2 for smaller blocks if that matters more than the exact ratio).
- **Precluded from:** deriving "is this an equal split" from anything but the weights; silently changing a running study's assignment (default stays simple; changing method is a design change → a new version / amendment, never a live mutation of an open run).

## Revisit triggers

- Researchers ask to **balance factorial variant cells** too (extend the engine per D5).
- A study needs **stratified** randomization (balance within a covariate, e.g. by nationality) — permuted-block per stratum, a larger design change.
- Concurrency at a scale where the per-start session lock is measurably hot (unlikely at study N; would move to an advisory lock or a counter column with an atomic increment).

## References

- `server/runtime/participant.ts` — `pickCondition`, `beginResponse` (assignment site), `ensureConditions`.
- `server/db/schema.ts` — `condition.allocationWeight`, `experimentVersion`.
- `components/feature/builder/conditions-section.tsx` — the editor.
- `server/modules/design-facts.ts` — arms/weights derivation (ADR-0106) the method joins.
- ADR-0014 (weighted assignment + condition-gated visibility), ADR-0058 (factorial variants), ADR-0002 (working-tip autosave + freeze).
