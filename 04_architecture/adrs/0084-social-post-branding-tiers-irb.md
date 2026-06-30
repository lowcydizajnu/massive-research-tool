# ADR 0084 — Social-post branding tiers + IRB hard gate

- **Status:** proposed
- **Date:** 2026-06-30
- **Deciders:** project owner, Claude (agent)
- **Tags:** participant-runtime, legal, compliance, theming, ADR-0024-related, ADR-0003-related

## Context

Researchers want platform-realistic stimuli at varying fidelity, and some want a **fully branded** post (real logo/marks, "like Facebook with logo"). Real trademarked logos carry both legal risk to us and ethical/IRB weight for the study. ADR-0024 already ships vetted mimic presets (facebook/x/…) that deliberately avoid logos (initials avatar, brand-ish colors), gated by a `mimicAcknowledged` checkbox. What's missing is (a) **graduated fidelity** the researcher chooses per block, and (b) a **compliance gate** for the branded case.

Two product decisions are fixed by the owner (2026-06-30): trademarked marks are **never shipped by us** — a fully-branded post uses the researcher's **own uploaded** logo; and the IRB step is a **hard gate**, not an advisory checkbox.

Prior decisions in play: ADR-0024 (theme rides the version snapshot; presets are vetted code; `getBlockOverride`/`getPageFrame`; `mimicAcknowledged` server-validated), ADR-0012 (snapshot model, freeze-with-preregistration), ADR-0003 (R2 upload path), ADR-0044 (make-live preflight), ADR-0004 (preregistration freeze).

## Options considered

### Option A — Three branding tiers, per-block, with a study default + IRB hard gate (chosen)

- A `brandingTier` enum on each visual stimulus block: `block` → `layout` → `branded`. Study-level default in the Design tab; per-block override. `layout` reuses ADR-0024's acknowledgment; `branded` additionally requires a researcher-uploaded logo **and** a study-level IRB attestation, enforced server-side at preregister/make-live/run.
- **Pros:** matches the owner's mental model exactly; reuses the snapshot + acknowledgment + R2 substrates; legal risk stays with the researcher who supplies the mark; the gate is auditable and frozen with the version.
- **Cons:** a second compliance gate to maintain; per-block + study-default resolution adds a small amount of logic.

### Option B — Ship a logo library behind the IRB gate

- We bundle real platform logos, unlockable once IRB is attested.
- **Pros:** zero friction for researchers.
- **Cons:** puts trademark/asset-licensing liability on the platform; contradicts the existing no-logo stance; rejected by the owner.

### Option C — Keep ADR-0024 as-is (no branded tier)

- Highest-fidelity stays "layout, no logo."
- **Pros:** no new compliance surface.
- **Cons:** doesn't meet the explicit "fully branded with logo" requirement.

## Decision

**We will add a per-block `brandingTier` (`block` | `layout` | `branded`) with a study-level default, where `branded` requires a researcher-uploaded logo and a study-level IRB attestation that is hard-enforced server-side before a study can be preregistered, made live, or run.**

`block` is today's minimal render (no chrome). `layout` is the ADR-0024 mimic layout (full chrome, no logo, "inspired-by" indication) and keeps the existing `mimicAcknowledged` requirement. `branded` is `layout` plus the researcher's uploaded logo (R2, ADR-0003) — we ship no trademarked assets. The IRB attestation (`theme.irbAttestation = { attested, byUserId, at, statement }`) rides the snapshot like every other theme field, so it freezes with preregistration, copies on fork, and lands in the protocol diff + audit trail. The publish/run preflight rejects any study that has an effective-`branded` block without a present logo **and** a recorded attestation (PRECONDITION_FAILED, mirroring `setTheme`'s unacknowledged-warned rejection and the replication freeze-gate).

## Consequences

- **Easier:** researchers get graduated realism with a clear, honest fidelity ladder; reviewers/IRBs get an auditable attestation frozen into the record.
- **Harder:** the preflight gains a branding check; the resolver must compute effective tier (block override ?? study default) wherever it renders or validates.
- **Committed to:** never shipping trademarked logos; attestation as a study-level, snapshot-frozen, audit-logged fact; the tier vocabulary (`block`/`layout`/`branded`) across data model, UI, and export.
- **Precluded from:** a logo marketplace/library; soft "warn-only" branded publishing.

## Revisit triggers

- Legal guidance changes such that we could license/ship platform marks → reconsider Option B.
- Reviewers demand per-block (not per-study) attestation evidence → split `irbAttestation` to a per-block map.
- A non-social branded stimulus appears (e.g., branded news site) → generalize `brandingTier` beyond `social-post`.

## References

- ADR-0024 (per-study theming, mimic presets, `getBlockOverride`, `mimicAcknowledged`), ADR-0012 (snapshot), ADR-0003 (R2 upload), ADR-0044 (make-live preflight), ADR-0004 (preregistration freeze).
- Companion ADR-0085 (social-post design builder, Facebook v1).
- User flow: `02_product/user-flows/build-social-post-stimuli.md`.
- Wireframe: `03_design/wireframes/branding-tier-irb-gate.md`.
- Data model: `04_architecture/data-model/07-social-post-design.md`.
- Code touchpoints: `05_app/lib/themes/themes.ts` (schema), `05_app/server/trpc/routers/studies.ts` (preflight), `05_app/components/feature/take/block-overrides.tsx` (render).
