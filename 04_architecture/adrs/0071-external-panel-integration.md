# ADR 0071 — External research-panel / agency integration

- **Status:** accepted
- **Date:** 2026-06-26
- **Deciders:** project owner, Claude
- **Tags:** runtime, recruitment, take-flow

## Context

Studies are often recruited through an external panel/agency (Cint, Norstat, a university panel, etc.). The agency sends participants in with a respondent id on the URL, expects them redirected back to a completion URL (so it can award points), and a *different* URL on consent refusal ("screen-out"). The pieces existed but scattered: the `embedded-data` block captured URL params, the `end-redirect` block did a completion redirect, and `PROLIFIC_PID` was a hardcoded capture. There was no single place to configure agency hand-off, no refusal redirect, and no redirect delay / sticky "return to panel" box. The owner shared a reference spec from another tool and asked for "one solid block".

Two risks shaped the decision: (1) letting an agency inject **arbitrary JavaScript** onto participant pages is an XSS/exfiltration hazard (it runs on our origin, over real response data); (2) a **custom study domain** (CNAME) is real infra (Vercel Domains API, cert provisioning, host-based routing).

## Options considered

- **A — One Run-stage card, structured fields only (chosen).** A single "External panel" card on the Run stage next to Prolific. Config is a fixed set of fields (respondent-id param, completion + refusal redirects with delay/sticky/skip). No arbitrary code; the agency's integration is expressed through these fields + `{ext_id}`/`{session_id}` URL placeholders.
- **B — A draggable block.** Rejected: redirect/screen-out are study-wide operational settings, not a screen in the flow; a block also can't own the consent-refusal path.
- **C — Allow custom JS (sandboxed or raw).** Deferred: the structured fields cover the agency hand-off without the security surface. Owner chose structured-only.
- **Custom domain.** Deferred (infra) — keep using `/study/...` / the recruitment link for now.

## Decision

Add an **`experiment.panel_integration` jsonb** column (operational config, **not** the version snapshot — swapping the agency mid-study must not fork the protocol). Edited from a single **Run-stage "External panel" card** (`studies.setPanelIntegration`, sanitized server-side). Structured fields: `respondentIdParam` (→ `external_pid`, already an export column), `completionUrl` + `completionDelaySec` + `completionStickyText`, `refusalUrl` + `refusalDelaySec` + `refusalStickyText` + `skipRefusalScreen`. URLs support `{ext_id}` / `{session_id}` placeholders, validated to `http(s)`. Empty config = the existing standard flow, untouched.

Wiring (all additive — no behavior change when config is empty): the **start** page captures the configured param into `externalPid` (falls back to `PROLIFIC_PID`) and routes decline either straight to the refusal URL (skip-screen) or to the local declined screen carrying `ext_id`; the **complete** page runs the completion redirect (auto + sticky, taking precedence over the `end-redirect` block); the **declined** page runs the refusal redirect. A shared client `PanelRedirect` handles the countdown + sticky "return to panel" bar.

## Consequences

- **Easier:** one place to wire an agency; refusal/screen-out is now first-class; redirect delay + sticky box; the existing Prolific + `end-redirect` paths are untouched when unused.
- **Harder / precluded:** no arbitrary agency code (by design — revisit only with a sandbox); no custom domain yet; the completion redirect, when set, supersedes the `end-redirect` block (documented; the block stays for non-agency studies).
- **Committed to:** panel config lives on the experiment (operational), URL placeholders are the integration surface, redirects are `http(s)`-only.

## Revisit triggers

- An agency genuinely needs a tracking pixel / snippet → add a host-allowlisted pixel field (still not arbitrary JS) or a sandboxed-iframe snippet.
- A study must run under the agency's own subdomain → custom-domain routing (Vercel Domains API + host-based study resolution) as its own project.

## References

- `lib/take/panel-integration.ts` (config type, defaults, sanitize, placeholder fill); `server/db/schema.ts` (`experiment.panel_integration`, migration 0039); `server/trpc/routers/studies.ts` (`setPanelIntegration`, `StudyDetail.panelIntegration`); `server/runtime/participant.ts` (`resolveOpenRecruitment` + `getCompletionInfo` surface it); `components/feature/run/external-panel-card.tsx`; `components/feature/take/panel-redirect.tsx`; take start/complete/declined pages.
- ADR-0035 (consent screen), ADR-0042 (embedded-data / end-redirect blocks), ADR-0044 (run/version lifecycle).
