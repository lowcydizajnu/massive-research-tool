# Code tab handoff — Library completion (drafted 2026-06-22 — owner scope-locked)

> **Library completion = fill the four empty tabs (Themes / Materials / Templates / Imports) + remove the Frameworks destination + migrate Misinformation Research Framework content into an app-shipped starter Template.** Sits on top of V1.13.0 Dashboards + Library, which already shipped the Library destination shell with the five-tab nav (Modules is the only tab with content today). Estimated **~9 to 10 weeks Code-tab time** across 6 PR streams. Sequencing-flexible — Code tab can land Templates first (covers the Frameworks-removal hole), then the rest in any order.
>
> **All 4 scoping questions resolved 2026-06-22:**
> 1. ✅ Themes apply **opt-in per study only** — no workspace-default; no locked workspace theme. Researcher picks a library theme on each new study.
> 2. ✅ Materials promotion is **explicit only via a "Save to Materials" button** — study-block uploads stay study-scoped until researcher chooses to promote.
> 3. ✅ Imports ships **all three formats**: Study JSON-export paste (~1 week) + OSF preregistration import (~2 weeks) + Qualtrics `.qsf` import (~2-3 weeks).
> 4. ✅ Frameworks → Templates: **migrate Misinformation Research Framework to an app-shipped starter Template** owned by an MRT-shipped "starter" workspace. New researchers fork from Templates instead of Frameworks. Preserves content + onboarding hook.

This handoff turns the Library from "one populated tab + four empty placeholders" into the real workspace-level reuse surface the IA promised. It also closes Frameworks as a destination, simplifying the IA (one fewer top-level item) and consolidating curated content into the workspace-level Templates table.

---

> **Path corrections (verified against the repo 2026-06-22).** Two "verify path"
> references in this handoff are stale — confirmed before any L-stream starts:
> - The Library/Frameworks routes live under **`app/(app)/(workspace)/library`**
>   and **`app/(app)/(workspace)/frameworks`** (the `(app)` route group is in the
>   path), not `app/(workspace)/…`. Adjust every `(workspace)/…` reference below.
> - **`scripts/seed-core.ts` does not exist.** Core seeding is `scripts/seed-prod.ts`
>   (`seedCoreModules`). The Misinformation Research Framework's actual seed
>   location/owner workspace must be re-identified in L2 before the migration —
>   do not assume `seed-core.ts`. (Other seed scripts: `seed-demo-prod.ts`,
>   `seed-demo-workspace.ts`, `seed-network-demo.ts`, `seed-clerk-test-users.ts`.)

## What's in place today (post-V1.13.0)

| Component | What's there | Where |
|---|---|---|
| `/library` route + 5-tab nav | Modules / Themes / Materials / Templates / Imports rendering as tabs. Only Modules has content (46+ block modules; ADR-0036). | `app/(workspace)/library/page.tsx` + `components/feature/library/` |
| `core/` module registry | 46+ block module definitions seeded into the catalogue + listed on the Modules tab. | `server/modules/registry.ts` |
| Frameworks destination (`/frameworks`) | App-level browse + per-framework detail + +Follow + fork-to-workspace; Misinformation Research Framework is the canonical example. V1.7. | `app/(workspace)/frameworks/` |
| Misinformation Research Framework content | Curated set of studies/blocks shipped at app level; seeded via `scripts/seed-core.ts`. Public, replicable, owned by an "MRT" system workspace. | `scripts/seed-core.ts` + framework rows in `experiment` table |
| Per-study fork/replicate mechanism (ADR-0018) | `studies.fork` copies a public + replicable study's snapshot into a new private experiment in another workspace; preserves block instanceIds for diff. Used by Frameworks today; will be reused by Templates. | `server/trpc/routers/studies.ts` |
| Study export to JSON | `studies.export` produces a portable JSON blob of a study version (blocks + conditions + theme + overview + metadata). Used today for backups + cross-workspace transfer. | `lib/export/study-json.ts` (verify path) |
| R2 storage with `ws/` (public) + `resp/` (workspace-gated) | V1.40.0 hardening; supports image/audio/video uploads from blocks. Materials will live in `ws/` namespace under `ws/<workspace>/materials/<material_id>.<ext>`. | `server/adapters/storage.r2.ts` |
| Per-study visual theme editor (ADR-0024 / V1.12 Section F) | Researcher-controlled brand colors + typography + logo + radius/shadow/pattern + footer + container width + nav style; theme rides with `experiment_version.theme` jsonb so preregistered = frozen theme. Theme presets (Academic/Clinical/Modern/Playful/Custom). | `components/feature/builder/theme-editor.tsx` (verify path) + ADR-0024 |
| Playground destination (ADR-0059) | Workspace-level card board with kinds `link / note / image-file / reference / to-do / poll`; image-file cards already upload to R2. Materials will bridge two-way with image-file cards. | `app/(workspace)/playground/` + `playground_card` table |
| OSF integration (ADR-0005) | OAuth/PAT BYO connection per workspace; existing preregister/replication push flows already pull/push from OSF. Imports → OSF reuses the same `RegistryAdapter` seam. | `server/adapters/registry.osf.ts` |
| Activity destination + emit() (V1.7, ADR-0015) | Will receive new event types from Library actions (template-published, material-saved, import-completed). | `server/events/` |
| `dashboard_layout` table + dnd-kit (ADR-0036) | V1.13.0 dashboard customization; same drag-reorder primitives reusable for Library card grids if researcher wants to organize templates/materials/themes. | (V1.13.0) |

## What's missing (the Library-completion build)

- Templates tab content (no `workspace_template` table, no `/library/templates/<id>` route, no "Save as template" affordance on studies, no "Use template" picker)
- Themes tab content (no `workspace_theme` table, no library-save affordance on the per-study theme editor, no "Load from library" picker)
- Materials tab content (no `workspace_material` table, no "Save to Materials" affordance, no "Pick from Materials" picker on block media-config fields)
- Imports tab content (no `study_import` table, no JSON-paste UI, no OSF import flow, no Qualtrics `.qsf` parser)
- Frameworks destination removal (the `/frameworks` route + LeftRail entry + +Follow framework affordance go away)
- Misinformation Research Framework content migration to a starter workspace + starter template

---

## Section L1 — Templates (~1.5 to 2 weeks)

Researcher-authored study skeletons. Cloneable as a starting point for a new study in the same workspace OR (if published) by any workspace. Lands first because it covers the Frameworks-removal hole.

### Data model

```sql
CREATE TABLE workspace_template (
  id TEXT PRIMARY KEY,                       -- ulid
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  source_experiment_id UUID NOT NULL REFERENCES experiment(id) ON DELETE CASCADE,
  source_version_id UUID NOT NULL REFERENCES experiment_version(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  cover_image_r2_key TEXT,                  -- optional preview image (ws/-scoped)
  share_scope TEXT NOT NULL CHECK (share_scope IN ('private', 'workspace', 'public')) DEFAULT 'private',
  created_by_user_id UUID NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  use_count INTEGER NOT NULL DEFAULT 0,     -- denormalized; incremented on each fork-from-template
  starter BOOLEAN NOT NULL DEFAULT FALSE    -- TRUE for app-shipped starter templates (the Misinformation migration; see L2)
);
```

**Why a separate `workspace_template` table and not just an `is_template` flag on `experiment`?** Templates are *named, curated artifacts* with their own metadata (description / tags / cover image / use-count) that live independently of the source study's edit lifecycle. The researcher can keep iterating on the source study; the template stays frozen at the version captured when it was saved.

### UI surfaces

**Library Templates tab (`/library/templates`):**

- Card grid: cover image + name + description + use-count + tags + "Use template" button
- Filter: my-workspace / app-starters / public
- Sort: recently created / most-used / alphabetical
- Search by name + tag
- Empty state: "No templates yet. Save any study as a template from its Builder Details panel."
- Per-row actions (owner of the template): Edit metadata / Change visibility / Delete

**Per-template detail page (`/library/templates/<id>`):**

- Read-only preview of the template's blocks (reuse `BlockView` from take runtime)
- Metadata panel (name / description / tags / created-by / use-count)
- "Use template" CTA → calls `templates.useTemplate({ templateId })` which:
  1. Calls existing `studies.fork` with the template's source_version_id
  2. Increments `use_count`
  3. Emits `template_used` activity event (ADR-0015)
  4. Redirects to the new study's Builder

**"Save as template" affordance in Builder Details panel:**

- New "Save as template" button (next to existing "Save as named version") opens a modal:
  - Name (required, default = current study title)
  - Description (optional)
  - Tags (chips; reuse existing tag input from V1.7)
  - Cover image (optional upload to `ws/<workspace>/templates/<template_id>/cover.<ext>`)
  - Visibility: Private / Workspace-shared / Public
  - "Save template" button
- On save: writes `workspace_template` row referencing the current working-tip version (calls `studies.saveAsNamed` first to freeze the version, then references it).

### tRPC procedures

- `templates.list({ scope?: 'workspace' | 'starters' | 'public', tags?, sort?, cursor? })` — paginated
- `templates.get({ templateId })` — read template + its frozen blocks for preview
- `templates.create({ studyId, name, description?, tags?, coverImageR2Key?, shareScope })` — save current study as template
- `templates.useTemplate({ templateId })` — fork into the caller's active workspace; emits event
- `templates.update({ templateId, name?, description?, tags?, coverImageR2Key?, shareScope? })` — edit metadata (template owner only)
- `templates.delete({ templateId })` — soft-delete (mark `deleted_at`, hide from lists; preserve for use-history)

### Activity events

- `template_published` (when share_scope changes private → workspace/public; recipient = workspace members for workspace-shared, follows for public)
- `template_used` (when someone clones it; recipient = template author)

### Wireframe gates

- `03_design/wireframes/library-templates-tab.md`
- `03_design/wireframes/library-template-detail.md`
- `03_design/wireframes/builder-save-as-template-modal.md`

### Tests

- Unit: creating a template freezes the source version (subsequent edits to source study don't change the template)
- Unit: `useTemplate` calls the existing fork mechanism + increments use_count
- Unit: cross-workspace visibility honored (private = author-workspace only; workspace-shared = same workspace; public = any workspace)
- e2e: Hanna saves a study as a workspace-shared template → Maya (same workspace) sees it in Library Templates → Maya uses it → Maya's new study has the right blocks + Hanna sees use_count++

---

## Section L2 — Frameworks removal (~0.5 day) — SIMPLIFIED (owner-directed 2026-06-22)

> **Scope change (owner-directed 2026-06-22).** The original plan "migrate the
> Misinformation Research Framework into a starter Template" assumed Frameworks
> were seeded `experiment` rows a `workspace_template` could reference. They are
> **not** — Frameworks is an in-code `FRAMEWORK_REGISTRY` (`server/trpc/routers/
> frameworks.ts`); there is no study/version to point at. Since there are **no
> external users** (only the owner ever used it), the migration's justification
> (preserve content + existing followers' onboarding hook) doesn't apply. So:
> **just remove Frameworks. No content migration, no `workspace.is_starter`
> column, no `framework`→`template` follow remap, and no 90-day redirect shim**
> (no external traffic to protect). This drops L2 from ~3 days to ~0.5 day.

### Steps (clean removal)

1. Delete the `/frameworks` and `/frameworks/<id>` routes (`app/(app)/(workspace)/frameworks/`).
2. Delete `FRAMEWORK_REGISTRY` + the `frameworks` tRPC router; remove its registration from `server/trpc/root.ts`.
3. Remove the Frameworks entry from the LeftRail.
4. Remove the `framework` follow-target: the `+Follow framework` affordance, the `framework` branch in the activity recipient resolver, and **delete the owner's stray `framework`-target `follow` rows** (a tiny one-off cleanup; no remap).
5. Update onboarding: new-researcher "start from a curated study" points at **`/library?tab=templates`** (an empty Templates tab is fine until a starter exists), not `/frameworks`.
6. Update the IA doc: drop the Frameworks destination (one fewer top-level item).
7. Audit log: `06_qa/audit-logs/<date>-frameworks-removal.md`.

### Starter template / onboarding hook — OPTIONAL, decoupled

The Misinformation content is **not** auto-migrated. If an onboarding starter is
still wanted, author it **fresh** later as a real study, then Save-as-template
with `starter=TRUE` using the L1 machinery — a clean, separate task, not a data
migration. (Owner to decide if/when. Not a blocker for removal.)

### Tests

- Smoke: `/frameworks` and `/frameworks/<id>` now 404 (route deleted).
- Unit: the activity recipient resolver no longer references a `framework` target type.
- Regression: no remaining import of `FRAMEWORK_REGISTRY` / `frameworks` router (grep gate).
- (If a starter template is later authored: `templates.list({ scope: 'starters' })` returns it; non-owner workspaces can't delete it.)

---

## Section L3 — Materials + Playground bridge (~1.5 to 2 weeks)

Workspace-level reusable media library. Explicit promotion only (owner-locked answer #2).

### Data model

```sql
CREATE TABLE workspace_material (
  id TEXT PRIMARY KEY,                       -- ulid
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'audio', 'video', 'document')),
  name TEXT NOT NULL,                        -- researcher-set
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  r2_key TEXT NOT NULL,                      -- ws/<workspace>/materials/<material_id>.<ext>
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,                             -- nullable; populated for image/video
  height INTEGER,
  duration_ms INTEGER,                       -- nullable; populated for audio/video
  uploaded_by_user_id UUID NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0,
  source_kind TEXT CHECK (source_kind IN ('upload', 'study-block-promote', 'playground-promote', 'tts-cache')) DEFAULT 'upload'
);
```

**Source_kind tracks provenance** — useful when a researcher asks "where did this asset come from?". `tts-cache` is for V2.1 Hume Octave generations that researchers explicitly save to library.

### UI surfaces

**Library Materials tab (`/library/materials`):**

- Filter by kind (Images / Audio / Video / Documents / All)
- Filter by tag
- Search by name
- Sort: recently used / most-used / recently uploaded / alphabetical
- Grid view (default for images/video) or list view (default for audio/documents); toggle in the chrome
- Per-row preview (thumbnail for images, waveform for audio, first-frame for video, file icon for documents)
- Per-row actions: Use in study (opens a "pick a study" modal) / Edit metadata / Delete / Download original
- Click row → detail page with full preview + metadata
- "+ Upload" button → file picker → upload to R2 + create `workspace_material` row
- Empty state: "No materials saved yet. Upload directly here, or save assets from studies and Playground cards."

**"Save to Materials" affordance on study-block uploaded media:**

- Every block media field that has a current uploaded asset (image-stimulus, audio-stimulus, video-stimulus, social-post images, signature gallery assets...) gets a small ⭐ "Save to library" icon button next to the existing asset preview.
- Click → modal: Name (default = filename) / Description / Tags / "Save to Materials"
- On save: COPY the R2 object from `resp/` (or `ws/<study-scoped>/`) to `ws/<workspace>/materials/<material_id>.<ext>` and create the `workspace_material` row. (Don't move — the study asset stays where it is; library is a separate reusable copy.)

**"Pick from Materials" affordance on block media-config fields:**

- Every block media-upload field gains a new picker option alongside the existing "Upload from computer" button: "Pick from Materials → [opens modal grid filtered by kind]"
- Selecting a material sets the block's media field to reference the material's R2 key.
- Important: block config stores the R2 key (not the material_id) so the block continues to work if the material is later deleted from Materials (orphan-safe).

> **Owner addition — REQUIRED acceptance criterion (2026-06-22).** The primary
> flow the owner explicitly wants is the *direct* one: **upload an asset straight
> into the Materials tab** (the `+ Upload` button above), then, **while building a
> study, open a dropdown/modal on the block you're editing to insert that
> material** (the "Pick from Materials" picker above). Both ends of this flow
> ship in this stream and are part of L3's done-definition — not the
> promote-from-study direction alone. The picker must reach every block media
> field (image / audio / video / document stimuli), default-filter by the field's
> expected kind, and store the R2 key (orphan-safe). Cover this end-to-end in the
> L3 e2e (upload to tab → add to a block via the modal → block renders it).

**Playground bridge (two-way):**

- Playground image-file card → kebab menu gains "Save to Materials" (same flow as block-upload promotion)
- Material → context menu gains "Add to Playground" (creates an image-file/audio-file/etc. Playground card referencing the material's R2 key)

### tRPC procedures

- `materials.list({ kind?, tags?, search?, sort?, cursor? })`
- `materials.get({ materialId })`
- `materials.upload({ uploadUrl, name, description?, tags?, kind })` — frontend uploads to R2 via signed URL first, then calls this with the resulting key
- `materials.promoteFromStudyBlock({ studyId, blockInstanceId, fieldKey, name, description?, tags? })` — copies R2 object + creates row
- `materials.promoteFromPlaygroundCard({ cardId, name, description?, tags? })` — same shape; copies from playground card's R2 key
- `materials.update({ materialId, name?, description?, tags? })`
- `materials.delete({ materialId })` — soft-delete; checks usage count, warns if material is referenced by any active study/playground card
- `materials.usage({ materialId })` — returns list of studies + playground cards currently referencing this material (cross-reference helper)

### Wireframe gates

- `03_design/wireframes/library-materials-tab.md`
- `03_design/wireframes/library-material-detail.md`
- `03_design/wireframes/save-to-materials-modal.md`
- `03_design/wireframes/pick-from-materials-modal.md`
- `03_design/wireframes/block-media-config-pick-from-materials.md` (extends existing block-config wireframes)

### Tests

- Unit: `promoteFromStudyBlock` correctly copies R2 object + creates row + leaves source untouched
- Unit: deleting a material that's still referenced surfaces the warning but doesn't break the referring study (orphan-safe block config)
- Unit: `materials.usage` correctly returns studies + playground cards
- e2e: upload directly + use in a new study + save from existing study + use the same material in 3 studies + verify use_count and last_used_at update

---

## Section L4 — Themes library (~1 to 1.5 weeks)

Depends on V1.12 Section F per-study theme editor having shipped. (If not yet shipped, ship that first — orthogonal scope.)

### Data model

```sql
CREATE TABLE workspace_theme (
  id TEXT PRIMARY KEY,                       -- ulid
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  theme_json JSONB NOT NULL,                 -- same shape as experiment_version.theme
  preset_basis TEXT,                         -- nullable; 'academic' | 'clinical' | 'modern' | 'playful' | NULL (custom)
  created_by_user_id UUID NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0
);
```

### UI surfaces

**Library Themes tab (`/library/themes`):**

- Card grid: theme preview (rendered as a mini study mockup using the theme's CSS variables) + name + description + use-count + created-by
- Filter by preset_basis
- Sort: recently created / most-used / alphabetical
- Search by name
- "+ Create theme" button → opens the existing per-study theme editor in "library mode" (not attached to a study; saves to `workspace_theme` instead of `experiment_version.theme`)
- Per-row actions: Edit / Duplicate / Delete

**Per-theme detail page (`/library/themes/<id>`):**

- Full preview rendered in light + dark
- Metadata + "Apply to a study" picker
- Edit theme button

**"Load from library" affordance on per-study theme editor:**

- Existing theme editor (V1.12 Section F) gains a "Library themes ▾" dropdown above the preset chooser
- Selecting a library theme overwrites the current study theme with the library theme's values; researcher can then customize further
- After customization, "Save these changes as a new library theme" button creates a new `workspace_theme` row (doesn't overwrite the source library theme — branch, not in-place mutate)

**Per study: opt-in only.** No workspace-default; no locked workspace theme. Owner-locked answer #1.

### tRPC procedures

- `themes.list({ presetBasis?, sort?, search?, cursor? })`
- `themes.get({ themeId })`
- `themes.create({ name, description?, themeJson, presetBasis? })`
- `themes.update({ themeId, name?, description?, themeJson?, presetBasis? })`
- `themes.delete({ themeId })`
- `themes.applyToStudy({ themeId, studyId })` — sets the study's current working-tip `theme` field to a deep-copy of the theme; increments use_count + updates last_used_at

### Wireframe gates

- `03_design/wireframes/library-themes-tab.md`
- `03_design/wireframes/library-theme-detail.md`
- `03_design/wireframes/builder-theme-editor-load-from-library.md` (extends V1.12 Section F wireframe)
- `03_design/wireframes/builder-theme-editor-save-as-library-theme.md`

### Tests

- Unit: `applyToStudy` deep-copies the theme (subsequent edits to the library theme don't change the study)
- Unit: `themes.create` correctly captures both preset-based and fully-custom themes
- Unit: deleting a library theme doesn't affect studies that previously used it (deep-copy isolates them)
- e2e: create theme → apply to study → customize per-study → save customizations as a new library theme (not overwriting source)

---

## Section L5 — Imports: Study JSON-export paste (~1 week)

The inverse of the existing study export. Cheapest, covers the export-import roundtrip, ships first.

### Data model

```sql
CREATE TABLE study_import (
  id TEXT PRIMARY KEY,                       -- ulid
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  imported_by_user_id UUID NOT NULL REFERENCES "user"(id),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('json-paste', 'osf', 'qualtrics')),
  source_identifier TEXT,                    -- e.g., OSF DOI; original filename; nullable for json-paste
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('parsing', 'awaiting_review', 'completed', 'failed', 'cancelled')) DEFAULT 'parsing',
  result_experiment_id UUID REFERENCES experiment(id) ON DELETE SET NULL,
  error_message TEXT,
  raw_payload_r2_key TEXT,                   -- the original blob; ws/<workspace>/imports/<import_id>.json (or .qsf)
  review_summary JSONB                       -- per-import: what blocks recognized, what didn't, what to map
);
```

### UI surfaces

**Library Imports tab (`/library/imports`):**

- List view: each row = one import (date / source kind / status / linked study if completed / actions)
- "+ Import" button → opens a kind picker modal: "Where is the study coming from?"
  - From a study JSON export (L5)
  - From OSF (L6)
  - From Qualtrics (L7)
- Filter by status; sort by date
- Per-row actions: View review (if `awaiting_review`) / Open imported study (if `completed`) / Retry (if `failed`) / Delete

**Import-from-JSON flow:**

- Modal: "Paste study export JSON, or drop a `.json` file here"
- On submit: `studyImports.parseJson({ json })` validates schema; if valid, creates a `study_import` row with `status='awaiting_review'` and populates `review_summary` with detected blocks + conditions + theme.
- Review screen: shows what will be created (block list with module-version reference for each — flagged amber if module version isn't installed in this workspace's catalogue + suggested-substitute picker); confirm or cancel.
- Confirm → `studyImports.commit({ importId })` creates the `experiment` + `experiment_version` rows + blocks/conditions + theme; copies any embedded media R2 keys (or re-uploads them from base64 if export was self-contained) to `ws/<workspace>/imports/...`; sets `status='completed'`, links `result_experiment_id`, emits `study_imported` activity event.

### tRPC procedures

- `studyImports.list({ status?, cursor? })`
- `studyImports.get({ importId })`
- `studyImports.parseJson({ json })` — validates; creates `study_import` row in `awaiting_review`
- `studyImports.commit({ importId, blockSubstitutions? })` — creates the study; `blockSubstitutions` lets researcher map missing module versions to available ones
- `studyImports.cancel({ importId })` — sets `status='cancelled'`; deletes the raw payload from R2
- `studyImports.delete({ importId })` — hard-delete (the imported study itself, if completed, is independent)

### Export format hardening

The JSON export format needs to be versioned + documented so future imports remain compatible:

- Add `export_version: '1.0'` field at the root of every export
- Document the schema in `04_architecture/data-model/02-study-export-format.md`
- Imports refuse to parse `export_version` greater than what they support; downgrade incompatible fields gracefully on lower versions

### Wireframe gates

- `03_design/wireframes/library-imports-tab.md`
- `03_design/wireframes/import-from-json-modal.md`
- `03_design/wireframes/import-review-screen.md`

### Tests

- Unit: round-trip export → import produces an identical study (block instanceIds + conditions + theme preserved)
- Unit: import with missing module versions surfaces the substitution UI; chosen substitutes are applied correctly
- e2e: Hanna exports a study → Maya pastes the JSON into Imports → reviews → commits → opens the new study in Builder

---

## Section L6 — Imports: OSF preregistration import (~2 weeks)

Rehydrate an OSF-registered study back into an editable MRT study. Strong for replication researchers who want to start from someone else's published preregistration.

### How it works

OSF Registrations have a registration form with structured data — title, abstract, hypotheses, materials (uploaded files), methods. They can also have linked Components (sub-projects). What MRT can pull:

- Registration title → study title
- Abstract → study Overview abstract (V1.12 Section B)
- Hypotheses (a list field on the OSF form) → study Overview hypotheses
- Methods section → study Overview methods section
- Attached files (PDFs, materials) → R2 imports under `ws/<workspace>/imports/<import_id>/`
- A linked GitHub repo or supplementary materials URL → captured as a Reference card in the study's Playground (or as a study-level reference if the researcher prefers)

**What MRT can't fully reconstruct:** the actual block-by-block structure. OSF preregistrations don't have machine-readable "this block is a likert with options [a,b,c]" — they have prose. So OSF import is a **scaffold importer**, not a full block-level rehydration:

- It creates a new study with the title/abstract/hypotheses/methods filled in
- It attaches the OSF DOI + registration URL as study metadata
- It DOES NOT auto-build blocks — that's manual researcher work
- It DOES copy any attached design files (Qualtrics `.qsf`, stimulus images, etc.) into Materials AND surfaces them in the import review screen with one-click "import this as a Qualtrics study" affordance (chains to L7)

### tRPC procedures

- `studyImports.fromOsf({ osfDoi })` — calls OSF API via existing `registry.osf.ts` adapter; pulls registration data + attached files; creates `study_import` row with `status='awaiting_review'`
- (reuses `studyImports.commit` and `studyImports.cancel` from L5)

### OSF adapter additions

Extend the existing `RegistryAdapter` (ADR-0005) with one new method:

```ts
fetchRegistrationForImport(opts: {
  ctx: RegistryInvocationContext;
  doi: string;
}): Promise<{
  title: string;
  abstract?: string;
  hypotheses?: string[];
  methods?: string;
  attachedFiles: Array<{ filename: string; downloadUrl: string; mimeType: string }>;
  linkedResources: Array<{ url: string; kind: 'github' | 'osf-project' | 'supplementary' }>;
  rawRegistrationJson: unknown;            // for debugging + future use
}>;
```

### Wireframe gates

- `03_design/wireframes/import-from-osf-modal.md`
- `03_design/wireframes/import-review-screen-osf.md` (extends L5's review screen with OSF-specific detected-content panel)

### Tests

- Unit: stub adapter returns fixture OSF registration → imported study has correct title/abstract/hypotheses
- Unit: attached `.qsf` is detected and offered for re-import via L7
- Unit: attached image files become Materials
- Integration: gated `RUN_OSF_E2E=1` against a fixture OSF registration on staging.osf.io

---

## Section L7 — Imports: Qualtrics `.qsf` import (~2 to 3 weeks)

The hardest. Qualtrics's `.qsf` is a complex JSON format with idiosyncrasies — undocumented fields, version drift across Qualtrics releases, blocks/questions/loops nested in non-obvious ways.

### Scope decision — what we attempt vs what we skip

**In scope (V1.7 of the importer, ships in this stream):**

- Title + description → MRT study title + Overview abstract
- Top-level question blocks:
  - Multiple choice (single / multi-select) → `core/multiple-choice@1.0.0`
  - Free-text (short + long) → `core/free-text@1.0.0`
  - Likert / matrix tables → `core/likert@1.0.0` or `core/matrix-grid@1.0.0`
  - Slider → `core/slider@1.0.0`
  - Ranking → `core/ranking@1.0.0`
  - Demographics blocks → `core/demographics@1.0.0`
- Question display logic (basic — "show if Q1 = X") → block visibility (`showIfCondition`)
- Embedded data fields → `embedded_data` per ADR-0042
- Survey flow blocks → study structure with parts (V1.12 Section L block grouping)

**Out of scope (defer or skip):**

- Quotas (Qualtrics-specific feature; doesn't map to MRT)
- JavaScript-customized question types (vendor-specific; skip with a warning)
- Random presentation logic beyond MRT's existing conditions/randomization (skip with a warning)
- Drag-and-drop / hot-spot / heatmap questions (would need a substantial mapping pass)
- Carry-forward logic (skip with a warning)
- Loop & merge blocks (skip with a warning)
- Multi-language support (import the default language only)

### Architecture

Build a `lib/import/qualtrics-qsf-parser.ts` (pure, no DB dependency):

```ts
export function parseQsf(rawJson: unknown): QsfParseResult;

export interface QsfParseResult {
  title: string;
  description?: string;
  detectedQuestions: DetectedQuestion[];
  skippedFeatures: Array<{ kind: string; reason: string; questionRef?: string }>;
  warnings: string[];
}

export interface DetectedQuestion {
  qualtricsQuestionId: string;
  qualtricsType: string;
  mappedMrtModule?: { key: string; version: string };       // undefined if not mappable
  mappedConfig?: Record<string, unknown>;
  blockTitle?: string;
  showIfCondition?: string;                                 // pre-mapped to MRT slug
  unmappableReason?: string;
}
```

The parser does the format-translation work; the tRPC procedure feeds the result into a `study_import` row with `review_summary` populated.

### Review screen — Qualtrics-specific

- Shows detected questions with their MRT module mapping (green checkmark) or unmapped status (amber + dropdown to pick a substitute MRT module manually OR skip)
- Shows skipped Qualtrics features (quotas / JavaScript / etc.) with reasons + warning copy
- Researcher confirms; commit creates the MRT study

### tRPC procedures

- `studyImports.fromQualtricsQsf({ uploadedR2Key })` — calls parser; creates `study_import` row
- (reuses `studyImports.commit` with `blockSubstitutions` from L5)

### Wireframe gates

- `03_design/wireframes/import-from-qualtrics-modal.md`
- `03_design/wireframes/import-review-screen-qualtrics.md`

### Tests

- Unit: parse fixture `.qsf` files (3-5 real exports from different Qualtrics versions; sanitized + committed to `e2e/fixtures/qualtrics/`) → produce expected `QsfParseResult`
- Unit: round-trip a published Qualtrics export through our parser → 80%+ of basic questions correctly mapped
- Unit: skipped features correctly logged with reasons
- e2e: full upload-parse-review-commit flow with the fixture `.qsf`

### Open risk

Qualtrics ToS may restrict programmatic processing of `.qsf` files. Verify before shipping — likely fine since the researcher is processing their own export, but worth a 30-minute check. If TOS-restricted, change the affordance from "import directly" to "manually paste blocks one-at-a-time using our standard import format" (less valuable but TOS-safe).

---

## ADRs needed

- **ADR-00XX — Workspace-level Templates.** Locks the `workspace_template` table, the save-as-template flow, the use-template flow (reuses `studies.fork`), the share_scope model, the activity events. Supersedes ADR-0034 if that landed differently.
- **ADR-00XX — Frameworks removal + starter Template migration.** Documents the migration path, the redirect shim window (90 days), the loss of `+Follow framework` affordance, the IA simplification. Amendment to whichever ADR currently covers Frameworks.
- **ADR-00XX — Workspace-level Materials.** Locks the `workspace_material` table, the promotion model (explicit-only), the R2 namespace conventions, the orphan-safe block-config reference (R2 keys not material_ids), the Playground bridge semantics.
- **ADR-00XX — Workspace-level Themes (library).** Locks the `workspace_theme` table, the deep-copy-on-apply semantics, the per-study opt-in model (no workspace-default).
- **ADR-00XX — Study export/import format versioning.** Documents the JSON export format, the `export_version` field, downgrade rules. Pairs with `04_architecture/data-model/02-study-export-format.md`.
- **ADR-00XX — OSF preregistration import as scaffold-only.** Documents what we extract from OSF vs what's manual; locks the "scaffold importer, not full rehydration" design.
- **ADR-00XX — Qualtrics `.qsf` import scope.** Documents the in-scope mapping set + out-of-scope skipped features + the TOS check pre-ship.

7 new ADRs; assign sequential numbers at PR time (verify next-available before assignment).

---

## Wireframes needed

| Wireframe | Section |
|---|---|
| `library-templates-tab.md` | L1 |
| `library-template-detail.md` | L1 |
| `builder-save-as-template-modal.md` | L1 |
| `library-materials-tab.md` | L3 |
| `library-material-detail.md` | L3 |
| `save-to-materials-modal.md` | L3 |
| `pick-from-materials-modal.md` | L3 |
| `block-media-config-pick-from-materials.md` (extends existing) | L3 |
| `library-themes-tab.md` | L4 |
| `library-theme-detail.md` | L4 |
| `builder-theme-editor-load-from-library.md` (extends V1.12 §F) | L4 |
| `builder-theme-editor-save-as-library-theme.md` | L4 |
| `library-imports-tab.md` | L5 |
| `import-from-json-modal.md` | L5 |
| `import-review-screen.md` | L5 |
| `import-from-osf-modal.md` | L6 |
| `import-review-screen-osf.md` (extends L5) | L6 |
| `import-from-qualtrics-modal.md` | L7 |
| `import-review-screen-qualtrics.md` (extends L5) | L7 |

19 wireframes. Most are short (modal forms, card-grid scaffolds reused from existing surfaces).

---

## Sequencing PRs (~9.5 weeks total)

**Stream L1 + L2 — Templates + Frameworks removal (~2 weeks):**
- PR L1.1: `workspace_template` schema + `templates.create` + `templates.list` + `templates.useTemplate` + Save-as-Template modal in Builder (~5 days)
- PR L1.2: Library Templates tab UI + per-template detail page + activity events (~3 days)
- PR L2.1: Frameworks clean removal (routes + `FRAMEWORK_REGISTRY` + router + LeftRail + `framework` follow-target + stray follow-row cleanup + onboarding → `/library?tab=templates` + IA update + audit log) (~0.5 day). **Simplified — no migration, no `is_starter` column, no redirect shim** (owner-directed 2026-06-22; see §L2). Optional later: author a fresh Misinformation starter template.

**Stream L3 — Materials + Playground bridge (~2 weeks):**
- PR L3.1: `workspace_material` schema + `materials.upload` + Library Materials tab + upload flow (~3 days)
- PR L3.2: `promoteFromStudyBlock` + Save-to-Materials affordance on all media-uploading blocks (~3 days)
- PR L3.3: `promoteFromPlaygroundCard` + Playground card "Save to Materials" menu item + Material "Add to Playground" affordance (~2 days)
- PR L3.4: Pick-from-Materials picker on block media-config fields + orphan-safe reference semantics (~2 days)

**Stream L4 — Themes library (~1.5 weeks):**
- PR L4.1: `workspace_theme` schema + `themes.create` + Library mode for theme editor + Library Themes tab UI (~4 days)
- PR L4.2: Load-from-Library + Save-as-Library affordances on per-study theme editor + deep-copy-on-apply semantics (~3 days)

**Stream L5/L6/L7 — Imports (~5 weeks):**
- PR L5.1: `study_import` schema + `studyImports.parseJson` + `studyImports.commit` + Library Imports tab UI + JSON-paste flow + export-format versioning + ADR + data-model doc (~5 days)
- PR L6.1: `studyImports.fromOsf` + `fetchRegistrationForImport` adapter extension + Import-review-OSF UI (~5 days)
- PR L6.2: OSF attached-files → Materials promotion + linked Qualtrics-attachment → L7 handoff (~3 days)
- PR L7.1: `lib/import/qualtrics-qsf-parser.ts` + 3-5 fixture `.qsf` files in repo + parser tests (~7 days)
- PR L7.2: `studyImports.fromQualtricsQsf` + Import-review-Qualtrics UI + unmapped-question manual-substitution flow (~5 days)
- PR L7.3: Qualtrics TOS check + e2e suite + audit log (~2 days)

**Cross-cutting PRs:**
- PR X1: 7 new ADRs land alongside the first PR of each stream that needs them (not as one big batch)
- PR X2: Manifest entries for new block kinds (none in this handoff — all new artifacts are non-block) + validator runs on every PR
- PR X3: e2e suite — `e2e/library-templates.spec.ts` + `e2e/library-materials.spec.ts` + `e2e/library-themes.spec.ts` + `e2e/library-imports-json.spec.ts` + `e2e/library-imports-osf.spec.ts` (gated `RUN_OSF_E2E=1`) + `e2e/library-imports-qualtrics.spec.ts`

**Dependency ordering:**

- L1 → L2 (Templates needs to exist before Frameworks removal)
- L3, L4 independent of L1/L2; can run parallel
- L5 → L6 → L7 (Imports infra is shared; build the substrate first)
- L6 depends on L3 (OSF attached files → Materials)
- L7 depends on L5 (shares review-screen substrate)

Recommended ship order: **L1 → L2 → (L3 and L4 in parallel) → L5 → L6 → L7.**

---

## Files to read first

1. This handoff start to finish.
2. `04_architecture/handoffs/code-tab-dashboards-and-library.md` — V1.13.0 Library shell that this builds on.
3. `04_architecture/adrs/0018-cross-workspace-forking.md` — `studies.fork` reuse for Templates.
4. `04_architecture/adrs/0024-per-study-visual-theming.md` — V1.12 Section F theme editor.
5. `04_architecture/adrs/0003-asset-storage.md` + V1.40.0 amendment — R2 namespace conventions (`ws/` vs `resp/`).
6. `04_architecture/adrs/0005-osf-integration.md` — `RegistryAdapter` extension for L6.
7. `04_architecture/adrs/0036-dashboard-customization.md` — dnd-kit primitives reusable for Library grids.
8. `04_architecture/adrs/0059-playground-cards.md` — `playground_card` table + image-file card shape (Materials bridge).
9. `04_architecture/adrs/0042-embedded-data.md` — embedded-data semantics; L7 Qualtrics importer creates these.
10. `04_architecture/data-model/01-auth-tenancy-entities.md` — workspace-scoped entity patterns.
11. `05_app/scripts/seed-core.ts` — current Misinformation Research Framework seeding; L2 migration replaces this.
12. `05_app/app/(workspace)/library/` — V1.13.0 shell where new tabs land.
13. `05_app/app/(workspace)/frameworks/` — files to delete in L2.
14. Qualtrics `.qsf` format reference — find latest docs / community-maintained schema (no official spec from Qualtrics). Start with: https://api.qualtrics.com/docs/ (general API ref).
15. OSF Registration API docs — https://developer.osf.io/#operation/registrations_read (existing `RegistryAdapter` uses this).

---

## What's NOT in this scope (deferred)

- **CSV / SPSS / R-script question-bank import.** V2.x if needed; researchers tend to author blocks directly rather than mass-import questions.
- **REDCap / SurveyMonkey / TypeForm imports.** Same reasoning as Qualtrics but lower demand; each is its own ~2-3 weeks. Add later if a real use case surfaces.
- **Cross-workspace shared Materials.** Materials are workspace-scoped only. Sharing across workspaces = V2.2+ (needs ADR + privacy review).
- **Cross-workspace shared Themes.** Same as Materials. Defer.
- **Public Template marketplace.** Templates support `share_scope='public'` but there's no central "discover all public templates" surface in this scope — it lives in the existing V1.8 Browse destination (filter by template type). A dedicated Template marketplace surface = V2.x.
- **Template versioning beyond the single-version lock.** A Template freezes one source version. Template "v2 of my template" = a new Template row referencing a new source version. No template-internal versioning.
- **Material thumbnail generation pipeline.** Initial Materials ship uses the original asset as the thumbnail (images) or a generic file-type icon (audio/video/document). A real thumbnail-generation service = V2.x.
- **Audio-waveform preview rendering.** Static file-type icon for V2.1 ship; waveform thumbnails = V2.x polish.
- **Theme preview animations / interactive mockup.** Themes Library renders a static preview using the theme's CSS variables; an animated/interactive preview = V2.x polish.
- **Import progress streaming UI for long-running OSF / Qualtrics imports.** Initial ship blocks the UI during parse + offers a "review when ready" link in the toast; real-time progress = V2.x.
- **Workspace-level "import history" cleanup automation.** Failed imports persist until manually deleted; an auto-cleanup job for stale failures = V2.x.

When green: ping owner. Owner runs a smoke test covering all four tabs (save a study as template + use it; promote a study upload to Materials + use it in another study; create a library theme + apply it to a new study; import a small JSON-exported study + verify it opens correctly); signs the audit log; tags the release.
