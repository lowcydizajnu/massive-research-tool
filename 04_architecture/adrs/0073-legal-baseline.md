# ADR 0073 — Legal baseline (legal pages, cookie consent, ToS acceptance)

- **Status:** accepted
- **Date:** 2026-06-26
- **Deciders:** project owner, Claude
- **Tags:** legal, privacy, consent, signup

## Context

Launching as an indie-solo SaaS, every signup without terms in force is legal exposure, and every EU/UK visitor without a cookie choice is a GDPR/PECR risk. The legal-baseline handoff (`04_architecture/handoffs/code-tab-legal-baseline.md`) specifies the minimum bar: 3 legal pages (Terms / Privacy / Cookies), a cookie-consent banner, a signup-time Terms gate, and an audit trail of who accepted what version when. This is the **prerequisite** for the consent-gated features in ADR-0072 (PF2 feedback screenshot opt-in) and the future analytics adapter. It is explicitly NOT enterprise-grade (no SOC 2 / DPA / lawyer-reviewed copy) — that's a later track when institutional adoption arrives.

## Options considered

- **A — Custom-built, generator-sourced content + 2-tier consent (chosen).** Three legal pages rendered from owner-authored content; a lean custom cookie banner with "Accept all" / "Necessary only"; per-user-per-device consent rows; a signup Terms gate; version-bump re-prompt. Cheap, owns the data, no recurring SaaS fee.
- **B — Third-party consent platform (Cookiebot / OneTrust / Iubenda).** Recurring fee + overkill at indie scale; the 2-tier banner is small enough to own.
- **C — Per-vendor granular consent toggles.** Deferred — adds UX complexity indie-stage users barely engage with; revisit when heavy analytics or a vendor needing separate opt-in arrives.
- **Content authorship:** generator (Termly) **or** an AI-drafted baseline tailored to our actual sub-processors + ADR-0014 discipline — same non-lawyer risk class; owner reviews either way. Lawyer review is a later trigger (first institutional contract / first paid revenue / public Hume voice).

## Decision

- **Legal pages** at `/legal/{terms,privacy,cookies}` (public, SEO-crawlable) + `?v=N` to retrieve a superseded version. Content lives as owner-authored TS modules (`lib/legal/content.ts`) with a per-kind version map + `CURRENT_LEGAL_VERSION` pointer — chosen over runtime-read `.md` files for Vercel file-tracing reliability. Rendered server-side with `marked` (trusted repo content; no user input → no client sanitize). (LG1 — shipped.)
- **Cookie consent** — two tiers only (`all` / `necessary`), equal visual weight (no dark pattern, EDPB guidance). Choice persists in localStorage (drives show/hide) + an audit row in **`cookie_consent`** (per-user once signed in; pre-signup rows matched later via a localStorage `pre_signup_id`). Writes go through a public `POST /api/cookie-consent` route (works on pages without the tRPC provider); `cookieConsent.current` reads the latest choice for the re-prompt. PII-safe per ADR-0014: only a one-way UA hash + coarse country, never raw IP/UA. Banner never shows in the participant runtime (`/take/*`). (LG2 — this PR.)
- **ToS acceptance** — a required checkbox on signup writing `legal_acceptance` rows (terms + privacy); a version-bump re-prompt modal blocks the app until re-accepted. (LG3 — next PR.)
- **Footer links** + `/legal/my-acceptances` (downloadable proof) (LG4); **sub-processor disclosure** single-source file embedded in the Privacy Policy (LG5).

"Necessary only" still sets the session + theme + the consent cookie itself; it suppresses future analytics (the analytics adapter no-ops on `necessary`).

## Consequences

- **Easier:** terms in force at signup; lawful cookie handling; an audit trail; the consent flag other features (PF2, analytics) gate on.
- **Committed:** two new tables (`cookie_consent`, `legal_acceptance`); consent lives per-user-per-device; legal content is owner-authored + versioned in-repo; non-lawyer baseline until the review triggers fire.
- **Precluded (deferred):** per-vendor toggles, DPA/AUP documents, geo-targeted banners, DSAR automation, lawyer-reviewed copy.

## Revisit triggers

- First institutional contract / first paid revenue / public Hume voice → lawyer review + likely DPA + AUP.
- A vendor needing separate opt-in, or consent-fatigue drop-off → per-vendor granular toggles.

## References

- `04_architecture/handoffs/code-tab-legal-baseline.md` (source); ADR-0072 (platform foundation — consumes the consent flag); ADR-0014 (PII boundary); ADR-0015 (markdown rendering).
- `lib/legal/content.ts`, `app/legal/[doc]/page.tsx` (LG1); `lib/legal/cookie-consent.ts`, `server/legal/consent.ts`, `app/api/cookie-consent/route.ts`, `server/trpc/routers/cookie-consent.ts`, `components/feature/legal/cookie-banner.tsx`, `server/db/schema.ts` (`cookie_consent`, migration 0040) (LG2).
