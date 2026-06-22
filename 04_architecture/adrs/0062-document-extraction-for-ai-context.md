# ADR 0062 — Document extraction for AI conversation context

- **Status:** accepted
- **Date:** 2026-06-22
- **Deciders:** Project owner, Claude
- **Tags:** ai, blocks, builder, dependencies, security, vendor-seam

## Context

> What is forcing this decision?

The AI conversation block (ADR-0061) lets a researcher paste **context** (the
background the AI should reference) and, since a31, **upload a text document**
whose contents are appended to that context. Today the upload is text-only
(`.txt/.md/.csv/.json`) and read **client-side** with the `FileReader` API —
no bytes touch the server. Researchers' real source material is overwhelmingly
**PDF and Word**, so the affordance is there but stops short of the formats
people actually have. ADR-0006 anticipated this: it lists an `extraction` Task
category ("pull structured data from documents (V2–V3)") and "article ingestion
(extracting procedure + materials from uploaded papers)" as future capability.

The decision forced here is narrow but real: **how do we turn an uploaded PDF or
DOCX into plain text** to feed the AI's context. Two things make it ADR-worthy
under CLAUDE.md: it **adds libraries** (PDF/DOCX parsers), and it introduces a
**server-side path that parses untrusted, researcher-uploaded binary files** —
a new attack/abuse surface that the current client-only text path doesn't have.

Constraints in play: the vendor/lock-in seam (ADR-0007 — confine swappable
third-party code to one file); the PII boundary (ADR-0014 — note that *this*
upload is **researcher-authored stimulus/context, not participant data**, so it
is not under the participant-PII rules); and the rate-limit posture already used
for participant uploads (ADR's security review #9, `allowAnswer`).

A clarifying point: extracting text from a file format is **deterministic
parsing, not an AI Task.** It does not call a model, has no schema-validated
model output, and therefore does **not** belong behind `AIProviderAdapter`. It
is a plain server utility with a swappable library dependency.

## Options considered

> ### Option A — Server-side extraction via `unpdf` (PDF) + `mammoth` (DOCX), confined to one module (chosen)

- Add a `server/extract/document.ts` module that dispatches on MIME/extension:
  PDF → `unpdf.extractText`, DOCX → `mammoth.extractRawText`, plain text →
  passthrough. The library imports live **only** in that file (the seam). A
  thin auth-gated, rate-limited, size-capped `POST /api/extract-document` route
  accepts a `FormData` file, runs the extractor, and returns `{ text, name,
  chars }`. The Builder's `ContextDocUpload` keeps reading text files in the
  browser (no round-trip) and POSTs only PDF/DOCX to the route, then appends the
  returned text to context exactly as today.
- **Pros.** `unpdf` (unjs) is built for serverless/edge — it bundles a pdf.js
  build and avoids the `pdf-parse` "reads a test file on import" footgun;
  `mammoth` is the de-facto DOCX→text library, pure-JS, no native deps. Both run
  in the Node serverless runtime with no shell-out. Confined to one module →
  swappable per ADR-0007. Reuses the existing extension point (`onText`) so the
  UI change is minimal. Server-only import → zero client-bundle cost.
- **Cons.** Two new dependencies; a new server route that parses untrusted input
  (mitigated: auth + rate-limit + a hard size cap + a char cap + an allowlist of
  types + no network/shell in the parsers); extraction quality varies (scanned
  PDFs with no text layer yield nothing — surfaced as a clear message, no OCR).

> ### Option B — Client-side extraction (pdf.js + a browser DOCX parser)

- Parse in the browser, never send bytes to the server.
- **Pros.** No new server surface; no upload of the file at all.
- **Cons.** Ships a heavy pdf.js + DOCX parser into the Builder client bundle for
  a rarely-used affordance; DOCX-in-browser is awkward; inconsistent results
  across browsers; harder to cap/rate-limit abuse. Rejected — the bundle cost and
  fragility outweigh avoiding a (small, authed) server round-trip.

> ### Option C — Route through ADR-0006 as an AI "extraction" Task (model-based)

- Send the document to an LLM and ask it to return the text/structured fields.
- **Pros.** Fits the ADR-0006 `extraction` category; could pull *structure*, not
  just text; one mechanism for future "ingest a paper" features.
- **Cons.** Massive overkill for "get the plain text of a file" — costs tokens,
  is **non-deterministic** (re-introducing the very problem ADR-0061 warns about,
  now in the *researcher's* setup step), slower, and needs the workspace AI key
  just to read a file. Deferred: keep it for genuine *structured* extraction
  (procedure/materials from a paper), not for plain text. Rejected for this.

## Decision

> A single, declarative sentence.

**We will extract PDF and Word documents to plain text with a deterministic,
server-side utility (`unpdf` for PDF, `mammoth` for DOCX) confined to
`server/extract/document.ts`, exposed through an authenticated, rate-limited,
size-capped `POST /api/extract-document` route that the Builder's context
uploader calls for PDF/DOCX (text files stay client-side) — explicitly *not* an
`AIProviderAdapter` Task, because format parsing is deterministic and uses no
model.**

Reasoning: the cheapest correct way to "read a file" is to read it, not to ask a
language model to. Keeping the parser libraries in one module preserves the
ADR-0007 swap property without pretending a CSV reader is a vendor SDK. Doing it
server-side keeps the Builder bundle small and gives us one place to enforce auth,
rate limits, and size caps over untrusted input. The model-based path (Option C)
stays available for the genuinely-AI job — pulling *structure* out of a paper —
which is a different feature with a different ADR when it arrives.

## Consequences

> - **What becomes easier.** Researchers can drop a PDF/Word stimulus straight
>   into AI context; the "PDF/Word extraction is coming" promise is met; future
>   format support is a one-file change.
> - **What becomes harder.** We now accept and parse untrusted binary uploads
>   server-side — a surface that must stay auth-gated, rate-limited, size-capped,
>   and free of shell-out/network in the parser path; two deps to keep current.
> - **What we are now committed to.** Format parsing is a deterministic server
>   utility behind a single module, never behind `AIProviderAdapter`; uploads to
>   this route are researcher context (not participant PII); extraction is
>   best-effort text only (no OCR, no layout) with clear failure messaging.
> - **What we are now precluded from (for now).** OCR of scanned PDFs; structured
>   field extraction (that is a future ADR-0006 AI Task); storing the original
>   file (we keep only the extracted text the AI needs, matching today's behavior).

## Revisit triggers

> Conditions under which we reopen this.

- Researchers need **scanned-PDF / image** support → add an OCR step or provider.
- Demand for **structured** extraction (procedure, materials, measures from a
  paper) → build it as an ADR-0006 AI `extraction` Task (Option C), separate from
  this plain-text path.
- `unpdf` or `mammoth` proves unreliable on real documents at scale → swap inside
  `server/extract/document.ts` (the seam) without touching feature code.
- Extraction abuse (oversized/malicious uploads) appears in logs → tighten caps,
  move parsing to a sandboxed background job (the storage + jobs adapters exist).

## References

> - Links to relevant code, prior ADRs, external docs.

- ADRs: [0061 AI conversation block](0061-ai-conversation-block.md) (the feature
  this extends; see its amendment for cost-estimate + non-determinism disclosure),
  [0006 task-based AI architecture](0006-ai-plugin-architecture.md) (the
  `extraction` Task category, deferred here for *structured* extraction),
  [0007 path A vs B](0007-path-a-vs-b.md) (the swap seam), [0014 response data
  model](0014-response-data-model-and-conditioning.md) (PII boundary — this upload
  is researcher context, not participant data).
- Lock-in: `04_architecture/lock-in-inventory.md` — Document extraction row
  (`unpdf` + `mammoth` confined to `server/extract/document.ts`).
- Code touchpoints: `server/extract/document.ts` (new — the seam); `app/api/
  extract-document/route.ts` (new — auth + rate-limit + caps); `components/
  feature/builder/ai-chat-config.tsx` (`ContextDocUpload` — accept PDF/DOCX);
  `server/adapters/ratelimit.ts` (reuse the existing limiter).
- Deps: `unpdf` (unjs, serverless PDF text extraction), `mammoth` (DOCX → text).
