# ADR 0094 — Upload study materials to OSF (files + design JSON + protocol PDF)

- **Status:** accepted
- **Date:** 2026-07-06
- **Deciders:** Paweł Rosner
- **Tags:** integrations, osf, storage, files, privacy

## Context

Today the OSF integration (ADR-0005) is **metadata-only**: on preregistration it creates an editable OSF **project node**, then a frozen **registration** carrying a prose summary plus a machine-readable JSON snapshot. The Study-Record push (ADR-0056 E4b) PATCHes the same project node's `description`. No binary files are ever sent — `docs/integrations/osf.mdx` states this as a contract ("No uploaded files or stimuli … binary materials stay in the app").

Materials upload was in ADR-0005's *original* Option B.3 (interface signature `push_registration(version, materials)`) but was **dropped in the V1.5 pivot** to the Open-Ended schema and deferred to "V1.6". The project owner now wants it: a researcher's uploaded stimuli (images/audio/video/documents) should be able to live alongside their OSF project so the registration/record is reproducible, plus the machine-readable design and a human-readable protocol.

Three hard facts shape the design:

1. **OSF registrations are immutable** after submission — files cannot be added to a registration ("Files cannot be added or removed during a registration update"). Files must go to the **editable project/component node**; a registration then snapshots that node's files as of registration time. (Verified against OSF help + `api/registrations` behavior.)
2. **File bytes upload to a different host** — WaterButler at `files.osf.io/v1`, not `api.osf.io/v2`, using the **same** bearer token and our existing `osf.full_write` scope (`osf.full_write` composes `NODE_FILE_WRITE`; verified against `framework/auth/oauth_scopes.py`). New-file: `PUT …/resources/<node>/providers/osfstorage/<folder?>?kind=file&name=<n>` (201). Name-collision returns **409** → must instead PUT to the existing file's id (update → new version).
3. **Our R2 storage is presign-only** — the server never reads file bytes (browser ⇄ R2 directly; `/api/media` 302-redirects). To forward a file to OSF the server must read the bytes, which the `StorageAdapter` cannot do today.

Prior art already in the tree: `@react-pdf/renderer` is a dependency (legal-acceptances PDF), so the protocol PDF adds **no** new library; `osfProjectNode(studyId)` (study-record router) already resolves a study's node id from `registry_push.responsePayload.nodeId` and returns null when the study has never been pushed.

## Options considered

### Option A — Upload to the frozen registration node
- PUT materials into the registration's osfstorage.
- **Pros:** materials sit directly on the citable registration.
- **Cons:** **impossible** — registrations are immutable; WaterButler rejects writes to a submitted registration. Rejected on the facts.

### Option B — Upload to the editable project node, on demand (chosen)
- A researcher-triggered action pushes the study's materials (stimulus files + `design-snapshot.json` + generated `protocol.pdf`) into a folder on the **project node** — the same node we already create and keep mutable for the record summary. Registrations made after the upload snapshot the files; already-registered studies still get the files on their project.
- **Pros:** matches the OSF model (registration = read-only snapshot of an editable node); reuses the existing node; works for already-registered studies; doesn't bloat every preregister; per-file re-push updates versions.
- **Cons:** requires the study to have an OSF node already (i.e. it's been preregistered / has a record) — if not, we prompt the researcher to create that first; a very large media set uploaded inline can be slow.

### Option C — Upload automatically at preregistration time
- Fold materials into the preregistration push so the registration freezes them.
- **Pros:** strongest reproducibility (files are inside the frozen registration).
- **Cons:** every preregister pushes all bytes (slow, wasteful on re-registration); helps only registrations made after this ships; nothing for already-registered studies. Owner chose on-demand; keep this as a possible future addition.

### Storage-read sub-decision
- **New `StorageAdapter.getBytes(key)`** (server reads an object's bytes) vs. having the server fetch its own presigned URL. Chose the explicit adapter method: it keeps R2 specifics inside `storage.r2.ts` (ADR-0007), is testable, and is honest about the new capability (server now reads bytes for this one server-only path).

### Orchestration sub-decision
- **Inline (bounded)** vs. background job. Registration push runs via an Inngest job, but Inngest health has been intermittent (STATUS 5k/5n) and the owner wants immediate per-file feedback. Chose **inline in the mutation**, sequential, with the API route's `maxDuration` raised and a **per-file size cap** (oversized files are skipped with a clear message, not streamed through the function). A background job remains the escape hatch if large-video studies need it (a revisit trigger).

## Decision

**We will upload a study's materials — its stimulus files, a `design-snapshot.json`, and a generated `protocol.pdf` — to a folder on the study's editable OSF *project node*, on demand from the Study Record, reusing the existing OSF connection; never to the frozen registration, and never including participant data.**

Concretely: a new `StorageAdapter.getBytes(key)` lets the server read a stimulus file's bytes from R2; a new `registry.uploadMaterials(userId, {nodeId, folderName, files})` in `registry.osf.ts` (the only file that touches OSF specifics) creates/reuses an osfstorage folder on the node and PUTs each file to WaterButler (`files.osf.io/v1`, new `OSF_FILES_BASE` env, same bearer token), creating new files (201) or updating existing ones on 409/known-id (new version). A tRPC mutation resolves the node via `osfProjectNode` (erroring with a "create your OSF record first" message when absent), assembles the artifact list (`extractMaterials` for stimuli + the design JSON + a `@react-pdf/renderer` protocol document), uploads inline, and records per-file state in a new `osf_material_upload` table so the UI shows status and re-pushes are idempotent. Materials inherit the node's privacy (projects are created `public: false`), so nothing is exposed unless the researcher makes the project public. Participant response media (`resp/` keys — signatures, uploads, recordings) is **out of scope by design**, preserving the "raw responses never leave the app" promise.

## Consequences

- **Easier:** researchers get reproducible OSF projects (stimuli + design + protocol) in one click; the registration can now capture real materials; the "materials stay in the app" limitation is lifted.
- **Harder / new commitments:** the server now reads R2 bytes on one path (memory + `maxDuration` cost); we depend on a second OSF host (`files.osf.io` WaterButler) and its create-vs-update/409 semantics; a new `osf_material_upload` table + migration; the docs contract must be rewritten; `@react-pdf` protocol rendering is now a maintained surface.
- **Committed to:** files land on the *project node*, not registrations (immutability); `osf.full_write` (unchanged — no new scope); per-file idempotent re-push via stored OSF file ids.
- **Precluded from (for now):** uploading participant data to OSF; pushing into a registration; auto-upload at preregistration (deferred, not chosen).

## Revisit triggers

- Studies routinely exceed the inline per-file cap or the function `maxDuration` (large video corpora) → move `uploadMaterials` to a background job with progress.
- OSF changes WaterButler auth or host, or exposes a supported registration-file API.
- Demand to auto-attach materials at preregistration (Option C) or to include a curated subset of participant artifacts under an explicit consent/ethics gate.
- OSF introduces a narrower file-only OAuth scope for production apps (today only `osf.full_write` is available).

## References

- ADR-0005 (OSF integration — the metadata-only push this extends), ADR-0056 (Study Record → mutable project node), ADR-0003 (asset storage / freeze), ADR-0007 (adapter isolation + lock-in inventory).
- Code: `05_app/server/adapters/registry.osf.ts` (`osfApi`, `pushRecordSummary` node PATCH), `05_app/server/adapters/storage.ts` + `storage.r2.ts` (new `getBytes`), `05_app/lib/study-record/materials.ts` (`extractMaterials`), `05_app/server/trpc/routers/study-record.ts` (`osfProjectNode`), `05_app/components/feature/study-record/push-to-osf-button.tsx`.
- OSF/WaterButler: WaterButler API (`waterbutler.readthedocs.io/en/latest/api.html`), OSF `framework/auth/oauth_scopes.py` (scope → `NODE_FILE_WRITE`), OSF help "How to add files to your registration" (registration immutability).
- `04_architecture/lock-in-inventory.md` (new rows: `files.osf.io` host; R2 server byte-read).
