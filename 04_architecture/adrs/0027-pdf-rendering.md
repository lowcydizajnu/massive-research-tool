# ADR 0027 — PDF rendering (study export)

- **Status:** accepted
- **Date:** 2026-06-08
- **Deciders:** project owner, Claude (agent)
- **Tags:** export, runtime, lock-in

## Context

V1.12 B2: researchers want "Export study as PDF" — a single document (cover + abstract + numbered hypotheses + sections + a question-by-question block appendix + citation + preregistration receipt) to attach to a paper or hand to an IRB committee. The owner explicitly chose a **real PDF library** over a browser print-to-PDF view, so the output is a true downloadable `.pdf` produced server-side (and later emailable). This is a library choice → ADR per CLAUDE.md + ADR-0007 lock-in discipline.

## Options considered

### Option A — `@react-pdf/renderer` server-side (chosen)

- Author the document as React components (`Document`/`Page`/`Text`/`View` + `StyleSheet`); `renderToBuffer()` in a Node route handler returns a real PDF the browser downloads.
- **Pros:** MIT; declarative (matches our React mental model + design tokens map to its styles); deterministic server output (no client/browser variance); no headless browser. Confined to one document component + one route.
- **Cons:** large-ish dependency tree; must run on the Node runtime and be marked a server-external package so Next doesn't bundle it; no native markdown (we render section text plainly for v1).

### Option B — browser print-to-PDF (zero dependency)

- A print-styled route + `window.print()`.
- **Pros:** no dependency.
- **Cons:** the owner rejected it — output quality varies by browser, it's a two-step "Save as PDF", and it can't be generated/emailed server-side. Kept as the documented fallback if A ever becomes a burden.

### Option C — headless Chromium (Puppeteer / Playwright) HTML→PDF

- **Pros:** pixel-perfect HTML.
- **Cons:** heavy runtime (a browser binary), slow cold starts, awkward on Vercel serverless, far more operational surface than this one document needs. Rejected.

## Decision

**We will use `@react-pdf/renderer`**, server-side, behind a single `Document` component (`components/feature/overview/study-pdf.tsx`) rendered to a buffer in a Node route handler (`/studies/[id]/export-pdf`). The import is confined to those two files; everything the PDF needs is gathered from our own data (study snapshot + owner profile + prereg push), so there's no data-model lock-in.

## Consequences

- **Easier:** a real, downloadable, server-generated PDF; future "email the PDF" reuses the same buffer.
- **Harder:** one more dependency; the route must be `runtime = "nodejs"` and the package listed in `next.config` `serverExternalPackages` (else bundling breaks); markdown in sections renders as plain text until we add a tiny md→pdf mapper.
- **Committed to:** PDF authoring stays in the one document component; the route is the only generator.
- **Precluded from:** nothing — swapping the renderer is a one-file change; the fallback (Option B print view) remains viable.

## Revisit triggers

- `@react-pdf/renderer` stops supporting our React/Node majors, or its bundle/runtime cost becomes a problem on Vercel.
- We need rich markdown/figures in the PDF beyond what the library renders comfortably.

## References

- `components/feature/overview/study-pdf.tsx` (document) + `app/(app)/studies/[id]/export-pdf/route.ts` (generator); `04_architecture/lock-in-inventory.md` (the @react-pdf row).
- B1 (Overview stage — the narrative the PDF renders); ADR-0007 (lock-in discipline); ADR-0005 (OSF — the prereg receipt).
