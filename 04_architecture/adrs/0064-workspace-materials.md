# ADR 0064 — Workspace-level materials

- **Status:** accepted
- **Date:** 2026-06-22
- **Deciders:** Project owner, Claude
- **Tags:** library, materials, storage, data-model, reuse

## Context

> What is forcing this decision?

The Library's **Materials** tab is still a placeholder. Researchers reuse the same
stimulus media (images, audio, video, documents) across studies but today must
**re-upload** the file into each study's media block — there's no workspace-level
asset library. The owner pinned the core flow (2026-06-22): **upload an asset
straight into the Materials tab, then insert it into the block being edited via a
dropdown/modal** ("Pick from Materials"). This ADR locks the data model + the
storage/reference rules for that.

Constraints in play: ADR-0003 + the V1.40 hardening (R2 with a public `ws/`
namespace and a workspace-gated `resp/` namespace; the `/api/media` gateway);
ADR-0014 (PII boundary — note that materials are **researcher-authored stimuli**,
not participant data); the existing presign upload path (`uploads.presign`); and
ADR-0063 (Templates, the sibling L1 surface — same table + thin-router shape).

A key design point: block configs must keep working even if a material is later
deleted. So blocks reference the **R2 key**, not the `material_id` — the library
row is metadata over an object; the object's key is the durable reference.

## Options considered

> ### Option A — A `workspace_material` table over the `ws/` R2 namespace; blocks reference the R2 key (chosen)

- A `workspace_material` row (kind, name, tags, `r2_key` under `ws/<workspace>/
  materials/<id>.<ext>`, mime/size/dimensions, use-count, soft-delete) is the
  curated metadata. **Upload** presigns into the `ws/` namespace then writes the
  row. **Pick from Materials** sets the block's existing media field to the
  material's **R2 key** (orphan-safe). Promotion ("Save to Materials" from a
  study block / Playground card) COPIES the object into the `ws/` materials
  prefix + writes a row — a secondary flow.
- **Pros.** Reuses the R2 adapter + presign + `/api/media` gateway wholesale; the
  R2-key reference means deleting a material never breaks a study (the block still
  points at an object); mirrors the Templates table/router shape (ADR-0063) so the
  Library stays consistent; workspace-scoped tenancy is one FK.
- **Cons.** A denormalized `use-count`/`last_used_at` to maintain; "used in N
  studies" needs a cross-reference scan (the block configs hold keys, not ids);
  promotion copies bytes (acceptable — the library copy is meant to be independent).

> ### Option B — Blocks reference `material_id` (a FK), media resolved by join

- The block stores the material id; rendering resolves the current r2_key.
- **Pros.** "Used in N studies" is a simple FK count; renaming/replacing an asset
  propagates.
- **Cons.** Deleting a material **breaks every study using it** (dangling FK) — or
  forces hard delete-protection; couples the participant render path to a library
  lookup; a frozen/preregistered version would silently change if the material is
  swapped (violates snapshot immutability, ADR-0012). Rejected — the orphan-safety
  + snapshot-stability of the R2-key reference matters more than easy counts.

> ### Option C — Per-study uploads only (status quo) + a "recent uploads" helper

- No library table; just surface recently-uploaded study assets.
- **Pros.** No new table.
- **Cons.** Doesn't give a curated, named, cross-study library; doesn't satisfy the
  owner-pinned upload-to-tab + pick-into-block flow; "recent" is noisy. Rejected.

## Decision

> A single, declarative sentence.

**We will add a `workspace_material` table (curated metadata over assets stored in
the R2 `ws/<workspace>/materials/` namespace); the Materials tab uploads via the
existing presign path, and block media fields insert a material by storing its
**R2 key** (never the material id) so studies stay orphan-safe and snapshots stay
immutable — with soft-delete, a denormalized use-count, and "Save to Materials"
promotion (copy-on-promote) as a secondary flow.**

Reasoning: the storage, presign, and gateway already exist; Materials is mostly a
metadata table + a thin router + two UI touch-points (a tab and a block picker).
Referencing the durable R2 key — not a row id — is what lets a researcher delete a
library entry without breaking a running study or mutating a frozen version, which
is the whole point of preregistration immutability.

### Decisions locked

- **Reference by R2 key, not id** (orphan-safe + snapshot-stable). The block's
  existing `mediaKey`-style field is reused verbatim; "Pick from Materials" just
  sets it. No participant-render or snapshot code changes.
- **`ws/` namespace, public-readable** (researcher stimuli, like today's study
  uploads). Materials are NOT participant PII (ADR-0014).
- **Soft-delete** (`deleted_at`); deleting never cascades to studies. "Used in N
  studies" is advisory (a scan of version snapshots for the key), shown as a
  delete warning, non-blocking.
- **Copy-on-promote** for "Save to Materials" (the study asset stays where it is;
  the library gets an independent copy) — secondary flow, after the pinned core.
- **Owner-pinned acceptance:** upload-to-Materials-tab + Pick-from-Materials-into-
  a-block ship as the L3 core, e2e-covered.

## Consequences

> - **What becomes easier.** Reuse a stimulus across studies without re-uploading;
>   a real Materials tab; future kinds (e.g. TTS cache) follow the same row.
> - **What becomes harder.** A denormalized use-count + a snapshot-scan for "used
>   in N studies"; promotion copies bytes; we maintain a second place assets live.
> - **What we are now committed to.** Blocks reference R2 keys (not material ids);
>   materials are `ws/`-namespaced researcher stimuli; deletes are soft + never
>   cascade; the participant render + snapshot paths are untouched by Materials.
> - **What we are now precluded from (for now).** Cross-workspace shared materials
>   (workspace-scoped only); auto-propagating an asset swap into existing studies
>   (the R2-key reference is intentionally a snapshot, not a live link); thumbnail
>   generation / waveforms (type icon for v1).

## Revisit triggers

> Conditions under which we reopen this.

- Demand for cross-workspace shared materials / org asset libraries → sharing/ACL
  model + privacy review (V2.x).
- Need to propagate an asset replacement into many studies → a managed reference
  (Option B) behind an explicit "update everywhere" action, not the default.
- Thumbnail/waveform generation at scale → a media-processing job (the jobs
  adapter exists).
- Storage cost / orphaned objects grow → a GC sweep for unreferenced `ws/`
  material objects.

## References

> - Links to relevant code, prior ADRs, external docs.

- Handoff: `04_architecture/handoffs/code-tab-library-completion.md` §L3 (+ the
  owner-pinned REQUIRED acceptance criterion).
- User flow: `02_product/user-flows/reuse-workspace-materials.md`.
- Wireframes: `03_design/wireframes/library-materials-tab.md`,
  `03_design/wireframes/pick-from-materials-modal.md`.
- ADRs: [0003 asset storage](0003-asset-storage.md) (+ V1.40 `ws/`/`resp/`
  namespaces, `/api/media`), [0014 response data model](0014-response-data-model-and-conditioning.md)
  (PII boundary — materials are researcher stimuli), [0012 block format & autosave](0012-block-format-and-autosave-semantics.md)
  (snapshot immutability → reference by key), [0063 workspace templates](0063-workspace-templates.md)
  (sibling Library table/router shape), [0059 workspace playground](0059-workspace-playground.md)
  (the Playground bridge, a secondary flow).
- Code touchpoints: `server/db/schema.ts` (`workspace_material`); a new
  `server/trpc/routers/materials.ts` (list/get/upload/update/delete/usage);
  `server/trpc/routers/uploads.ts` (reuse presign with a `material` kind);
  `app/(app)/(workspace)/library/` (Materials tab); the block media-config UI
  (`components/feature/builder/*`) for the Pick-from-Materials picker.
