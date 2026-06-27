# ADR 0074 — Analytics behind an adapter; PostHog impl; consent-aware

- **Status:** accepted
- **Date:** 2026-06-27
- **Deciders:** Paweł Rosner (owner), Code tab
- **Tags:** runtime, analytics, privacy, lock-in

## Context

The Analytics + Admin handoff adds product analytics so we can see how researchers actually use the app (signup → first study → publish funnels, retention, drop-off). We have no measurement layer today. Two hard constraints shape the decision:

1. **ADR-0007 adapter discipline** — vendor SDKs live behind an interface in `server/adapters/`, never imported by feature code, so the vendor is swappable.
2. **ADR-0014 PII boundary + legal-baseline consent (ADR-0073)** — the participant runtime (`/take/*`) must never be observed by analytics, and researcher analytics must respect the cookie-consent choice (`necessary` ⇒ no tracking).

The vendor was owner-locked to **PostHog** (open-source, self-hostable later, 1M-events/mo free tier, EU region available to match our GDPR posture). Unlike AI/OSF/Prolific keys, analytics is an **app-level** vendor (one project for the whole app), not bring-your-own-key per workspace.

## Options considered

### Option A — PostHog behind an `AnalyticsAdapter`, consent-aware no-op (chosen)

- A narrow `AnalyticsAdapter` interface (`identify` / `track` / `pageView` / `shutdown`) with a strict event-name union; `posthog-node` (server) + `posthog-js` (client) confined to `analytics.posthog.ts`. Every call threads the user's consent; `necessary` ⇒ silent no-op. Never initialized on `/take/*`. No-ops entirely when the key env is absent (local/dev/preview).
- **Pros:** swappable vendor; consent + PII boundary enforced in one place; feature code stays vendor-free; degrades safely without a key.
- **Cons:** an interface to maintain; PostHog's richest client features (autocapture, replay) need a thin, audited exception on the client.

### Option B — PostHog SDK called directly from feature code

- **Pros:** less plumbing; full SDK ergonomics everywhere.
- **Cons:** violates ADR-0007; scatters consent/PII checks across call sites (easy to forget one and track a participant or a non-consenting user); vendor lock-in everywhere.

### Option C — No third-party analytics; roll our own from `activity_event`

- **Pros:** zero new vendor; data already ours.
- **Cons:** no funnels/retention/replay; rebuilding PostHog is out of scope for an indie solo; the owner explicitly wants PostHog.

## Decision

**We will put analytics behind an `AnalyticsAdapter` with a PostHog implementation, and make every call consent-aware with a hard no-op for non-consenting users and for the participant runtime.**

The adapter exposes a strict, typed event taxonomy (adding an event requires updating the union + an ADR amendment, so the event set stays curated). `track`/`identify`/`pageView` each receive the caller's `cookie_consent`; the PostHog impl calls `opt_out_capturing()` / returns early when consent is `necessary`. The server reads consent from the latest `cookie_consent` row, defaulting to `necessary` when none exists (never assume consent). The client SDK is the **one deliberate exception** to ADR-0007 on the client (PostHog autocapture/replay need to run in the browser) — confined to a single provider component, recorded in the lock-in inventory, and itself consent-gated. Session replay records only when consent is `all`, masks all `<input>/<textarea>`, and never runs on `/take/*`. PostHog **group analytics** key on `workspace_id` so dashboards roll up per workspace (workspace-level attribution only, mirroring the cost-rollup decision).

## Consequences

- **Easier:** real funnels/retention/replay; one enforcement point for consent + the participant-PII boundary; vendor swap is one impl file + a client provider.
- **Harder / committed:** a typed event taxonomy to maintain (amendment-gated); a recorded client-side PostHog exception; an app-level `POSTHOG_KEY` env (no BYO).
- **Precluded:** per-researcher cost/behavior attribution beyond workspace groups; analytics on the participant runtime (permanent, ADR-0014).

## Revisit triggers

- PostHog free-tier event/replay quota exceeded → self-host PostHog or switch vendor (the adapter localizes the change).
- A second non-web client appears → re-evaluate the client-exception shape.
- Legal counsel requires opt-IN (not consent-tiered) analytics in some market → tighten the default.

## References

- Handoff: `04_architecture/handoffs/code-tab-analytics-admin.md` (Section AA1).
- [[0007-path-a-vs-b]] (adapter discipline), [[0014-...]] PII boundary, ADR-0073 legal-baseline / cookie consent, ADR-0006 `ai_invocation` (cost substrate, separate concern).
- `04_architecture/lock-in-inventory.md` — PostHog row (client exception).
