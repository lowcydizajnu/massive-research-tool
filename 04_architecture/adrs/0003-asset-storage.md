# ADR 0003 — Hybrid asset storage with researcher choice and freeze-on-preregistration

- **Status:** accepted
- **Date:** 2026-05-28
- **Deciders:** project owner (with Claude as collaborator)
- **Tags:** data-model, asset-storage, replication, cost-model, privacy

## Context

Experiments and frameworks reference assets — stimuli, materials, supporting media. The product brief and the PI persona both indicate this includes images, audio, video, articles, and (per the misinformation theme) social-media-post artifacts. ADR-0001's `definition_snapshot` field mentions stimuli but does not say where the bytes live; ADR-0002's snapshot immutability is meaningless if the assets a snapshot refers to evaporate. This ADR answers: **where do asset bytes live, and how do we guarantee their availability for replication?**

The tension is between three forces:

- **Replication integrity** (the wedge from the product brief): forks must run identically years later, which means the assets must still resolve.
- **Cost**: video is 100×–1000× the size of images. Naively storing every researcher's videos at our expense is non-trivial budget exposure.
- **Researcher control**: sometimes a researcher legitimately wants to reference a live external URL (e.g., a public-information YouTube video that's *meant* to be the live version, where stability would defeat the point).

Cloudflare R2 (STACK.md baseline) changes the economics: storage at $0.015 per GB-month and **free egress**. A 1TB lab-year of video stimuli costs ~$15/month — meaningful but not scary. The "video hosting is unaffordable" instinct is largely a relic of the S3 + egress-fees era and no longer reflects reality.

Project owner's stated calibration: cost matters, but the architecture must not break the wedge.

## Options considered

### Option A — Images internal, video external

Rule of thumb based on size class: small assets uploaded to our storage, video linked externally (YouTube, Vimeo).

- **Pros.** Lowest storage cost. Aligns with researcher habits of embedding YouTube. Simplest rule.
- **Cons.** Replication breaks at first link rot (a serious problem for academic media — citation-URL decay rates are 30–50% within 5 years). Copyright posture is ambiguous when we don't verify ownership at link-time. Privacy concern: embedded YouTube triggers third-party tracking pixels that some IRBs forbid. UX is inconsistent between internal and external assets. Two integration code paths forever.

### Option B — Researcher choice for every asset, with replication safeguards (chosen)

Every asset is either internally uploaded (stored in R2) or externally linked (URL only), independent of type. The UI is honest about the trade-off: linked assets show a "Linked externally — replication depends on this URL staying live" badge. At preregistration or publication time, the platform auto-attempts to **freeze** linked assets by downloading them server-side at that moment, converting the link into an internal copy. Researchers can opt out of freezing per asset for cases where the live URL is intentional.

- **Pros.** Honors the cost concern (link = free for us, until the researcher chooses to freeze). Preserves replication integrity by default through automatic freeze at the moments that matter most (preregistration, publication). Single integration surface — "external" is a special case of "asset" with a URL field and optional snapshot. Researcher control where they need it.
- **Cons.** More UX to explain. Freeze can fail (geo-restricted, removed, copyrighted in a way we can't legally re-host) and we need to handle those failures honestly. Storage costs grow as researchers preregister, not just as they upload — though that cost lands on us at exactly the moments researchers are most committed to the work.

### Option C — Always internal, with tiered storage plans

Everything uploads. Heavy users pay more.

- **Pros.** Replication is bulletproof by default. One code path. Clear "you get what you pay for" pricing story.
- **Cons.** Forces upload friction for genuinely live-link use cases. Higher overall storage costs paid by the platform. Researchers used to YouTube workflows will resist.

## Decision

**We will adopt Option B: hybrid asset storage with researcher choice per asset, auto-freeze on preregistration/publication (opt-out), and per-tenant storage metering architected from day one (pricing model deferred to a separate decision).**

### The eight load-bearing principles

1. **Every asset has a `storage_kind`: `internal` or `external`.** Internal = bytes stored in R2 with content-hash identity. External = URL only, no bytes on our side.
2. **Researchers choose per asset.** Upload or link — the UX presents both options for every asset type. There's no platform-imposed rule that "videos must be external."
3. **External assets carry a visible replication-risk indicator.** Throughout the editor and in any view that shows the asset, a small "Linked externally" badge appears with a tooltip explaining the risk. This is honest UX, not a guilt-trip.
4. **Auto-freeze on preregistration and publication, opt-out per asset.** When an ExperimentVersion is created with `kind = preregistered` or `kind = published`, the platform attempts to download each external asset server-side. Success → a new internal Asset row is created and the Version's snapshot now references the frozen copy. Researchers can flag specific assets as "do not freeze — live link is intentional" before the freeze pass runs.
5. **Failed freezes flag the version, not block it.** If a YouTube video is geo-restricted, removed, or copyrighted in a way we can't legally re-host, the freeze pass records the failure on the Version with a clear `replication_risk: link_only` flag. Researchers see and acknowledge this before completing preregistration. The version still preregisters — we don't block legitimate research because of asset-rehosting edge cases.
6. **Content-hash identity for internal assets.** The same image uploaded twice is stored once and reference-counted. Cuts storage costs meaningfully for shared frameworks.
7. **Per-tenant storage metering from day one.** The data model tracks `total_internal_bytes` per Tenant. Pricing model (free tier, plan caps, overage charges) is deferred to a separate decision — the architecture supports any pricing model we settle on later.
8. **Ownership confirmation at upload and link time.** Researchers confirm (via a single checkbox at the point of action) that they have the right to use the asset. This is not legal armor but it shifts the responsibility appropriately and gives us a record. Defaults vary by asset type: links to public-domain or open-license platforms (Wikimedia, OSF, Zenodo) are confirmed automatically; YouTube / Vimeo / arbitrary URLs require explicit checkbox.

### Sketch of the Asset entity

To make this concrete (full entry in a future `04_architecture/data-model/01-assets.md`):

```
asset
  id, tenant_id, owner_id,
  storage_kind ('internal' | 'external'),
  -- internal-only:
  content_hash (nullable), file_path (nullable), size_bytes (nullable),
  mime_type (nullable), original_filename (nullable),
  -- external-only:
  external_url (nullable),
  -- freeze metadata (set when an external asset has been frozen):
  frozen_from_external_url (nullable), frozen_at (nullable),
  frozen_by_version_id (nullable),
  -- replication-risk control:
  opt_out_freeze (boolean, default false),
  ownership_confirmed_at, created_at

tenant_storage_meter
  tenant_id (PK), total_internal_bytes, last_calculated_at
```

ExperimentVersion's `definition_snapshot` references assets by `Asset.id`. When the snapshot is rendered at runtime, the runtime resolves the Asset row and serves either the internal R2 URL (with CDN in front) or the external URL.

### Behavior on fork

When a fork happens, the fork's initial ExperimentVersion references the same Asset rows as the parent's source version. **Assets are not copied on fork.** This is correct because:

- Internal assets are content-hashed; copying would be wasteful.
- External assets are URLs; nothing to copy.
- Frozen-from-external assets remain valid (the frozen internal copy is still there).

Cross-tenant access: a fork in Tenant Beta references assets owned by Tenant Alpha. This is allowed at the data level. The fork's owner can re-upload or re-link assets in their own tenant if they want full ownership — that's a UX choice, not a data-layer rule.

### What success looks like

- A researcher who uploads everything pays storage cost commensurate with what they upload (metered, future pricing).
- A researcher who links everything pays nothing for storage but accepts replication risk that's visible in the UI and auto-mitigated at preregistration.
- A preregistered version whose external assets all freeze successfully is fully replicable in 5 years.
- A preregistered version with a freeze failure is honestly flagged as carrying replication risk — researchers see the warning before they commit, and reviewers can see it on the registered record.

## Consequences

**What becomes easier:**

- Researchers who want to embed YouTube can do so without us forcing an upload; researchers who want bulletproof replication can upload and never worry.
- Preregistration "snapshot" semantics become honest: the moment of preregistration captures bytes, not just promises.
- Cost grows with researcher commitment to the work (upload + freeze on preregistration) rather than with raw activity, which matches the value model.
- Content-hashing makes shared frameworks cheap (reused stimuli aren't double-stored).

**What becomes harder:**

- Freeze-pass UX is the most complex part: explaining what's happening, allowing opt-out per asset, surfacing failures clearly.
- Copyright defensibility — we need confirmation flows and DMCA-style takedown handling for hosted assets. This is operational, not just architectural, but the architecture has to support it (Asset rows need a `taken_down_at` flag and resolvers need to handle it).
- Privacy disclosures for external assets need IRB-friendly language so researchers understand the third-party tracking implications.
- Background workers needed: freeze jobs are async, can fail, can be retried. Inngest (STACK.md) is well-suited.

**What we are now committed to:**

- Every Asset row carries a `storage_kind` and the right metadata for its kind.
- ExperimentVersion `kind = preregistered` and `kind = published` trigger a freeze pass.
- Per-tenant storage usage is tracked.
- Researchers can opt out of freezing per asset.
- Failed freezes flag the version, never silently block it.

**What we are now precluded from:**

- A platform rule like "videos must be external" or "everything must be internal." Choice is per-asset.
- Silent freeze (researchers must see and approve).
- Treating external assets as second-class in the UI beyond the visible replication-risk badge.
- Pricing structures that can't accommodate a "researcher uploads a lot of video" customer (no architectural cliff at any specific storage size — pricing decisions can shape demand but not be evaded by the data model).

## Revisit triggers

Reopen this decision (probably as a superseding ADR) if:

- Storage costs become a material line item — likely never under R2 economics at our projected scale, but worth a check at 10TB+ per tenant.
- A class of asset (e.g., very large datasets, 3D scenes) emerges that doesn't fit the upload-or-link binary cleanly.
- Legal landscape shifts on platform liability for re-hosted user content (DMCA changes, fair-use rulings).
- A real preregistration workflow with OSF (ADR-0004) reveals integration friction that this ADR didn't anticipate.
- Researcher feedback overwhelmingly says "the freeze pass is confusing" — then UX iteration, possibly with a simpler default policy.

## References

- ADR-0001 — modular composition + theme overlays — the snapshot model that needs assets to resolve.
- ADR-0002 — forking model — the replication-integrity wedge this ADR protects.
- `04_architecture/data-model/00-core-entities.md` — the data model this ADR extends with Asset and TenantStorageMeter entities (sketched here, fully detailed in a future entry).
- `01_research/insights/researcher-tooling-pain-points.md` — confirms researchers value open materials and replication, and that participant privacy concerns about third-party tracking are real.
- `STACK.md` — Cloudflare R2 as the storage backend; the economics calculation rests on R2's free-egress pricing.
- `02_product/personas/principal-investigator.md` — the PI's openness about uploading materials vs linking is a key validation target (currently inferred; needs interview confirmation).
- Future: ADR-0004 (OSF integration) — preregistration registers with OSF, which means OSF needs to know how to resolve our assets too.
- Future: data-model entry for Asset, TenantStorageMeter, and the freeze-job background workflow.


## Amendment (2026-06-11) — first implementation slice (V1.21.0)

R2 wiring landed once the owner provisioned the bucket + `R2_*` secrets (Vercel). Decisions:

- **Signer:** `aws4fetch` (MIT, ~6KB, zero deps) over `@aws-sdk/client-s3` — we only presign SigV4 URLs; the AWS SDK would be two orders of magnitude more dependency for the same four lines. Vendor code lives ONLY in `server/adapters/storage.r2.ts` behind a `StorageAdapter` interface (`storage.ts`), per ADR-0007.
- **Flow:** presign-only — the browser PUTs directly to R2 (Content-Type is part of the signature, so the validated type is the only type R2 accepts) and reads via `/api/media/<key>`, a public route that 302s to a short-lived presigned GET. The bucket stays private; bytes never stream through our functions.
- **Validation:** shared pure allowlists in `lib/uploads.ts` (image ≤10MB png/jpeg/webp/gif; video ≤200MB mp4/webm/mov; audio ≤25MB webm/m4a/mp3/wav/ogg) + namespace-checked keys (`ws/<workspaceId>/…` researcher uploads, `resp/<responseId>/…` participant recordings).
- **Researcher uploads:** `uploads.presign` (write role) + an Upload button on media config fields (image/video URL, social-post image, picture-choice options).
- **Participant recordings:** the `audio-record@1.0.0` block (handoff C2 Group 3) — MediaRecorder client component (third ADR-0013 client-JS exception), explicit consent-to-record press, researcher-set max duration with auto-stop, presign via `POST /api/take-upload` scoped exactly like answers (responseId must resolve + the per-response answer rate limit) — answer records `{r2Key, durationMs}`; the response schema pins keys to `resp/…` so a crafted answer can't reference foreign objects.
- **Deferred (unchanged):** content-hash freeze-on-preregister for internal assets; external-link freeze; virus scanning (general file upload stays V1.13+ per the handoff).

## Amendment (2026-06-13) — signed Content-Disposition for participant uploads

The `/api/media` gateway 302-redirects to a presigned R2 GET, so it cannot set response headers. To force-download untrusted participant uploads (anti-XSS — a crafted HTML/SVG upload must not execute inline), `presignDownload` gained a `disposition` arg that is signed into the URL (`response-content-disposition`), and the gateway serves `resp/` keys as `attachment` UNLESS they're a raster image extension (png/jpg/jpeg/webp/gif), keeping signature PNGs and picture answers inline. Researcher (`ws/`) assets stay inline. Introduced with the image-interaction blocks (ADR-0041) since signature is the first participant-served upload; consumed by file-upload (Wave 4).

## Amendment (2026-06-14) — workspace-ownership access control for `resp/` keys

`/api/media` was a **public** gateway: it validated only `isSafeMediaKey` then 302'd to a presigned GET, so a `resp/<responseId>/<ulid>` participant upload (signature = PII, plus files/audio/video) was protected **only by the unguessability of the key**, not by access control. ADR-0041's first explore amendment flagged this exactly (line 71/80) and deferred the signature gallery until "(i) `/api/media` enforces workspace-ownership for `resp/` keys." This is (i).

**Decision.** The gateway now authorizes `resp/` reads against the owning workspace:

- **`ws/` stimuli stay public and zero-cost.** Participants load researcher stimuli during `/take` with no login. The route branches on the key prefix **before** any auth/DB work — `ws/` short-circuits straight to presign, never calling Clerk or the database. Only `resp/` keys incur an identity + membership lookup.
- **`resp/` requires an active member of the owning workspace.** `resp/<responseId>/…` → `response.experimentVersionId` → `experimentVersion.experimentId` → `experiment.tenantId` (= workspace id); the caller's Clerk id (`AuthUser.id` = `user.externalId`) must map to a `member` row for that workspace with `status='active'`. Anonymous or non-member → **403**; unresolved response/key → **404**. `clerkMiddleware` runs on `/(api|trpc)`, so the session resolves in-handler even though `/api/media` is not in `isProtectedRoute`.
- **The decision logic is a pure, injected-deps function** (`server/media/authorize.ts` `authorizeMediaKey(key, externalUserId, deps)`) so it is node-testable (member→ok, non-member/anon→403, unresolved→404, `ws/`→ok with the DB deps never called). The route is a thin wrapper.
- **The anti-XSS disposition logic (above) is unchanged and runs AFTER the auth check** — authorization is additive, not a replacement; a gated-but-inline crafted upload would still be an XSS vector, so `resp/` non-rasters stay `attachment`.

**Verified safe (the trap):** no participant flow reads a `resp/` asset back through `/api/media` — all four upload blocks PUT via `/api/take-upload` and preview locally (canvas / `URL.createObjectURL` / filename only). Gating `resp/` to workspace members breaks no participant path. This unblocks the deferred signature viewer/gallery (ADR-0041); the "private to your workspace" copy may ship only once this is live in production. QA: `06_qa/audit-logs/2026-06-14-media-resp-access-control.md`.
