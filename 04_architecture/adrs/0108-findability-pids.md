# ADR 0108 — Findability PIDs — language, funders, ROR affiliation (item ⑩)

- **Status:** accepted
- **Date:** 2026-07-18
- **Deciders:** Paweł Rosner
- **Tags:** osf, metadata, findability, pids, data-model

## Context

Item ⑩ is the last piece of the [LOS alignment](../../01_research/insights/los-alignment-and-templates.md): the FINDABILITY connective tissue — *"remaining PIDs (ROR, funder, Subjects, DataCite type, language)."* Everything else on that roadmap has shipped: the template picker (⑤/⑨, ADR-0101/0106/0107), plan↔report link-back (⑥, ADR-0102), typed OSF resources (⑦, ADR-0103), dataset deposit (⑧, ADR-0105), a public + crawlable record with schema.org JSON-LD (⑥), a License selector (ADR-0100), and OSF **Subjects** — the controlled taxonomy — captured on the plan and pushed to the OSF draft (ADR-0107 D8). The **DOI-ownership** question is already settled: [ADR-0104](0104-doi-ownership.md) — the record adopts the **OSF registration DOI** as canonical; we mint none.

So what actually remains of item ⑩ is three fields, all about who/where/what-language, none of which we capture: a study's **language**, its **funders**, and the **ROR** identifier for a researcher's institutional affiliation (we store `user.affiliation` as free text but no ROR PID). These are the exact metadata a DataCite/schema.org consumer (Google Dataset Search, OpenAIRE, a funder's compliance crawler) indexes on. They are missing, which is why FINDABILITY was the weakest LOS row.

The owner chose (2026-07-18) **"MVP + live lookups"**: capture the fields, surface them on the public record and its JSON-LD, and offer type-ahead against the public **ROR** and **Crossref Funder Registry** APIs so a researcher picks a real PID instead of typing a name.

## Options considered

### Option A — Capture + surface only (paste PIDs)

- Add the fields; researcher pastes a ROR/funder id (with links out to ror.org / Crossref); surface in JSON-LD.
- **Pros:** smallest; no external calls; no lock-in surface at all.
- **Cons:** almost nobody knows their ROR/funder id by heart, so in practice they'd be left blank — the PID payoff evaporates.

### Option B — MVP + live lookups (CHOSEN)

- Everything in A, plus server-proxied type-ahead against ROR v2 (`api.ror.org/v2/organizations`) and Crossref Funder (`api.crossref.org/funders`) so the researcher searches by name and we store the resolved PID.
- **Pros:** the PID is captured correctly and effortlessly — the whole point of a registry; both APIs are public, read-only, keyless.
- **Cons:** two more outbound dependencies (mitigated: read-only, cached-friendly, and a lookup failure degrades to free-text, never blocks a save).

### Option C — Also mint our own DataCite DOI

- Stand up a DataCite adapter so the record gets its own DOI + full DataCite metadata record.
- **Pros:** the record becomes a first-class DataCite artifact independent of OSF.
- **Cons:** re-opens [ADR-0104](0104-doi-ownership.md) (already decided: OSF DOI is canonical), adds a paid vendor + credentials + a lock-in inventory row, and duplicates the identifier OSF already mints. Rejected — out of scope for item ⑩.

## Decision

**We will add a study `language`, a study `funders` list, and a `ror` id on the researcher's affiliation, captured via live type-ahead against the public ROR and Crossref Funder registries, and surface all three — plus the already-captured OSF Subjects — on the public study record and its schema.org JSON-LD. We mint no DOI (ADR-0104 stands) and the DataCite resource type is derived, not entered.**

The fields are study/profile metadata, exactly like `license` and `tags` — study-level, not versioned into the frozen snapshot — so they live as columns (`experiment.language`, `experiment.funders`, `user.ror`) and are edited on the study **Record** composer (language, funders, beside License) and the **profile** (ROR, beside affiliation). The two registry lookups are thin **server-side** proxies (`server/modules/pid-registries.ts` → tRPC queries) so there is no CORS dance and one place owns the polite `User-Agent`, the timeout, and the "return `[]` on failure" contract. Because they are keyless read-only public endpoints and not a vendor SDK, ADR-0007's "SDK-only-in-adapters" rule does not bite; the module is the seam if that ever changes.

DataCite `resourceTypeGeneral` is **derived** (a preregistered record is a `Preregistration`; otherwise `Study`) rather than a field — a researcher shouldn't have to know DataCite's vocabulary, and it's a pure function of state we already have.

OSF's v2 API has no clean node field for funder / ROR / language, and Subjects are already pushed (ADR-0107 D8) — so item ⑩'s payoff lands on **our** machine-readable record (JSON-LD / DataCite-shaped), which is what findability crawlers actually read.

## Consequences

- **What becomes easier.** A public record now carries `inLanguage`, `funder` (with the funder's Crossref DOI as `@id`), an author `affiliation` with its ROR `@id`, subjects as `about`/keywords, and a DataCite `additionalType` — so Google Dataset Search, OpenAIRE, and funder crawlers can index and attribute it. The LOS FINDABILITY row goes from "weakest" to covered.
- **What becomes harder.** Two more outbound dependencies to keep alive; the record composer grows a small "Findability" area.
- **What we are now committed to.** Storing PIDs as opaque strings we resolved at pick time (we don't re-validate them on every render); the `funders` jsonb shape `{name,id,uri}`.
- **What we are now precluded from.** Minting our own DOI without reopening ADR-0104; treating language/funder as versioned plan content (they're study-level metadata, mutable like license).

## Revisit triggers

- OSF adds first-class node metadata for funder/affiliation/language → push them upstream too.
- ROR or Crossref change their public API shape or add an auth requirement → the proxy module is the single place to adapt.
- The owner decides the record should mint its own DataCite DOI → reopen ADR-0104 + a DataCite adapter (Option C).

## References

- [LOS alignment insight](../../01_research/insights/los-alignment-and-templates.md) — item ⑩ definition.
- [ADR-0104](0104-doi-ownership.md) (OSF DOI canonical), [ADR-0100](0100-study-license.md) (License precedent), [ADR-0107](0107-osf-template-gate.md) D8 (Subjects), [ADR-0007](0007-path-a-vs-b.md) (adapter discipline).
- ROR v2 `GET api.ror.org/v2/organizations?query=` · Crossref `GET api.crossref.org/funders?query=` (both verified live 2026-07-18).
- Seams: `lib/seo/jsonld.ts` (`studyRecordJsonLd`), `getPublicStudy` (studies router), `components/feature/study-record/record-composer.tsx` (License lives here).
