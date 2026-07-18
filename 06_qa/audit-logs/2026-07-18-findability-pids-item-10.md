# QA audit — Findability PIDs (LOS item ⑩): language, funders, ROR affiliation

**Date:** 2026-07-18
**Scope:** LOS Round 2 item ⑩ — capture a study's **language** + **funders** and a researcher's **ROR** affiliation id, surface them on the public record + schema.org JSON-LD, and offer type-ahead against the public ROR + Crossref Funder Registry APIs. Files: [ADR-0108](../../04_architecture/adrs/0108-findability-pids.md), `server/db/schema.ts` (+ migration `0060_tricky_mercury.sql`), `server/modules/pid-registries.ts`, `server/trpc/routers/pids.ts`, `server/trpc/routers/studies.ts` (`setFindability` + `PublicStudyDetail` + both producers), `server/trpc/routers/profile.ts`, `server/trpc/routers/study-record.ts`, `components/ui/pid-autocomplete.tsx`, `components/feature/study-record/findability-panel.tsx`, `components/feature/settings/profile-form.tsx`, `components/feature/study-record/record-sections.tsx`, `app/(public)/browse/[studyId]/page.tsx`, `lib/languages.ts`, `lib/seo/jsonld.ts`.
**Result:** PASS. Committed unpushed. **Carries migration 0060 — `db:migrate:prod` BEFORE the push.**
**Gate:** tsc 0 · lint 0 (`next lint` on the 9 touched app files) · **481 studies/router + 17 new unit tests green** · `validate.py` clean (297)

## What was asked

Owner: *"then item 10 … keep Mintlify up to date."* Item ⑩ is the last LOS row
(FINDABILITY): the PIDs a DataCite/schema.org consumer indexes on — language,
funder, ROR affiliation — that we never captured. Scope fixed via AskUserQuestion
to **"MVP + live lookups"**: capture + surface + type-ahead against the real
registries, **no DataCite adapter** (ADR-0104 stands; the OSF registration DOI is
the one canonical id — we mint none).

## What was built

- **Data model (migration 0060):** `experiment.language`, `experiment.funders`
  (`jsonb`, `StudyFunder[] = {name,id,uri}`, default `[]`), `user.ror`.
- **Registry lookups** — `server/modules/pid-registries.ts`: the single seam
  owning a polite User-Agent, a 6 s timeout, and a **never-throw, degrade-to-`[]`**
  contract so a slow/down registry can never block a save. `searchRor`
  (ror.org v2 → id URL + `ror_display` name), `searchFunders` (Crossref → id +
  normalised `https://doi.org/10.13039/…` uri). Not a vendor SDK → ADR-0007's
  adapter rule doesn't apply.
- **tRPC:** `pids.searchRor` / `searchFunders` (protected — not an open relay);
  `studies.setFindability` (tenant-scoped write).
- **UI:** one reusable `PidAutocomplete` (debounced, request-seq-guarded,
  keyboard-navigable, free-text fallback) drives both — the `FindabilityPanel`
  on the Record composer and a **unified Affiliation field** in Settings→Profile
  (the affiliation text is the chip label, the ror rides alongside).
- **Surfacing:** `PublicStudyDetail` grew `language` / `funders` /
  `authorAffiliation` / `authorRor` on **both** producers (`getPublicStudy` +
  `getRecordPreview`); the record footer renders Language + linked funders, the
  byline links the affiliation to its ROR page; `studyRecordJsonLd` emits
  `inLanguage`, each `funder` with its Crossref `@id`, `author.affiliation` with
  its ROR `@id`, and a derived DataCite `resourceTypeGeneral`
  (`Dataset`/`StudyRegistration`/`Text`) as `additionalType`.

## Verification

- **Live-API probe (not mocks).** The unit tests stub `fetch`, which can only
  agree with what I believe the ROR/Crossref shapes are — so I ran the real
  `searchRor`/`searchFunders` against the live endpoints: `University of Amsterdam`
  → `https://ror.org/04dkp9463` (+ `ror_display` name + country); a funder →
  normalised `https://doi.org/10.13039/…`. Parsing matches reality.
- **Browser, not just green** (the standing "tests can't see dead UI" lesson):
  on the Record composer the FindabilityPanel renders; the funders type-ahead
  fires `pids.searchFunders` → **200** and shows real Crossref hits (Swiss SNSF,
  NSF divisions) with country sublabels + keyboard/hover highlighting; selecting
  a language persists (`setFindability` → "All changes saved").
- **Round-trip test** (`studies.test.ts`): `setFindability` → `getPublicStudy`
  carries language + funders (registry + free-text) verbatim; clearing language
  passes `null`; a cross-workspace caller gets `NOT_FOUND` (tenant scope).
- **JSON-LD test** (`lib/seo/__tests__/jsonld.test.ts`): `inLanguage`, `funder`
  with/without `@id`, `affiliation` with/without ROR `@id`, and the four
  `dataCiteResourceType` branches.

## Notes / non-issues

- **A Fast-Refresh (HMR) error burst** in `template-questions.tsx`
  (`isAnswered is not defined`, every stack frame through `performReactRefresh`/
  `applyUpdate`) surfaced while editing with the tab open, and **persisted across
  a `.next` + `node_modules/.cache` wipe** — which first looked like a real bug.
  It is not: `tsc` is clean, the current source imports/defines all three symbols,
  and a **clean reload renders the Overview stage perfectly** (verified visually —
  "Your research plan" + help modal + H1/H2 + Add hypothesis all present). It is a
  transient HMR-cycle artifact of editing an unrelated file while the tab held a
  stale module graph; production builds fresh from source.
- **OSF push out of scope** (per the MVP decision): funders/language are not part
  of the OSF registration template questions and are not pushed to the node
  metadata in this cut. The public record + JSON-LD are the surfaces item ⑩ owns.
- Copy honesty: the panel description was corrected from "…what we send to OSF"
  (untrue in this cut) to "…the metadata search engines read."

## Docs (standing instruction — keep Mintlify current)

New `docs/methodology/findability.mdx` (+ nav in `docs.json`); a ROR type-ahead
note added to `docs/workspace/researcher-profiles.mdx`.
